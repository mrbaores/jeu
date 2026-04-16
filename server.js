// ============================================================
//  server.js — Point d'entrée du serveur CHROMATRACE
//  Responsabilités : serveur HTTP, Socket.io, boucles de jeu,
//                    gestion des événements réseau.
//
//  Modules internes :
//    config/constants.js  — constantes de jeu
//    game/state.js        — état global (grille, joueurs, items)
//    game/players.js      — cycle de vie des joueurs
//    game/items.js        — items bonus
//    game/physics.js      — mouvement et collisions
// ============================================================

const path    = require('path');
const os      = require('os');
const express = require('express');
const http    = require('http');
const { Server } = require('socket.io');

const {
    PORT, COLS, ROWS, CELL_SIZE,
    TICK_MS, STATE_MS,
    ROUND_START_FREEZE_MS, DISCONNECT_GRACE_MS,
    ITEM_MIN_MS, ITEM_MAX_MS,
    DECAY_PER_TICK, COLORS,
} = require('./config/constants');

const { randomInt }                          = require('./game/utils');
const { state, createGrid, createDecayGrid } = require('./game/state');
const {
    chooseColor, respawnPlayer,
    removeExpiredPlayers, rebuildScores,
} = require('./game/players');
const { spawnItemIfNeeded } = require('./game/items');
const { movePlayer }        = require('./game/physics');

// ── IP locale (pour le QR code) ───────────────────────────
function getLocalIp() {
    for (const iface of Object.values(os.networkInterfaces())) {
        for (const alias of iface) {
            if (alias.family === 'IPv4' && !alias.internal && alias.address !== '127.0.0.1')
                return alias.address;
        }
    }
    return '127.0.0.1';
}
const MY_REAL_IP = getLocalIp();

// ── Variables de session (cycle de vie de la partie) ──────
let currentGameState    = 'LOBBY';
let gameSettings = {
    durationSec:    180,
    itemsEnabled:   true,
    boostEnabled:   true,
    autoEndEnabled: true,
    decayEnabled:   false,
};
let timeRemaining         = 0;
let gameTimerInterval     = null;
let gameStartTimeout      = null;
let roundStartFreezeUntil = 0;

// ── Serveur HTTP + Socket.io ──────────────────────────────
const app    = express();
const server = http.createServer(app);
const io     = new Server(server);

app.use(express.static(path.join(__dirname, 'public')));

// ── Diffusion de l'état aux clients ──────────────────────

/**
 * Construit le snapshot public envoyé à tous les clients à chaque tick.
 * La grille de vitalité n'est incluse que si le mode dégradation est actif
 * (économie de bande passante pour les parties normales).
 */
function buildPublicState() {
    rebuildScores();

    const players = [...state.players.values()]
        .map(p => ({
            id: p.id, numId: p.numId, name: p.name, color: p.color,
            x: p.x, y: p.y, dirX: p.dirX, dirY: p.dirY,
            alive: p.alive, score: p.score,
            trail: p.trail,
            boost:           p.boostUntil  > Date.now(),
            shield:          p.shieldUntil > Date.now(),
            disconnected:    Boolean(p.disconnectedAt),
            lastDeathReason: p.lastDeathReason,
        }))
        .sort((a, b) => b.score - a.score);

    const active = players.filter(p => !p.disconnected);

    return {
        cols: COLS, rows: ROWS, cellSize: CELL_SIZE,
        grid: state.grid,
        ...(gameSettings.decayEnabled && {
            decayGrid: state.decayGrid.map(row => row.map(v => Math.round(v))),
        }),
        players,
        items:            state.items,
        connectedPlayers: active.length,
        top5:             active.slice(0, 5),
        controllerUrl:    '/controller.html',
        elapsedMs:        Date.now() - state.startedAt,
        serverIp:         MY_REAL_IP,
        gamePhase:        currentGameState,
        timeRemaining,
        freezeRemainingMs: Math.max(0, roundStartFreezeUntil - Date.now()),
    };
}

/** Envoie l'état global à tous + un état personnalisé à chaque joueur. */
function emitState() {
    io.emit('state', buildPublicState());

    for (const p of state.players.values()) {
        if (!p.socketId) continue;
        io.to(p.socketId).emit('selfState', {
            name: p.name, color: p.color,
            alive: p.alive,
            // Affiche le score au moment de la mort (pas 0 après effacement du territoire)
            score:           p.alive ? p.score : (p.scoreAtDeath ?? p.score),
            boost:           p.boostUntil  > Date.now(),
            shield:          p.shieldUntil > Date.now(),
            lastDeathReason: p.lastDeathReason,
            disconnected:    Boolean(p.disconnectedAt),
            x: p.x, y: p.y,   // position pour la mini-carte côté téléphone
        });
    }
}

// ── Fin de partie ─────────────────────────────────────────

function endGame() {
    currentGameState = 'FINISHED';
    clearInterval(gameTimerInterval);
    clearTimeout(gameStartTimeout);
    roundStartFreezeUntil = 0;

    rebuildScores();
    const rankings = [...state.players.values()]
        .filter(p => !p.disconnectedAt)
        .sort((a, b) => {
            // Score réel : vivant → score actuel, mort → score au moment de la mort
            const scoreA = a.alive ? a.score : (a.scoreAtDeath ?? 0);
            const scoreB = b.alive ? b.score : (b.scoreAtDeath ?? 0);
            if (scoreB !== scoreA) return scoreB - scoreA;
            // Départage ex-æquo : mort plus tard = mieux classé (a survécu plus longtemps)
            // Joueur encore vivant à la fin → Infinity (a survécu jusqu'au bout)
            const tA = a.alive ? Infinity : (a.deathTime ?? 0);
            const tB = b.alive ? Infinity : (b.deathTime ?? 0);
            return tB - tA;
        })
        .map((p, i) => ({
            rank: i + 1,
            numId: p.numId, name: p.name, color: p.color,
            score: p.alive ? p.score : (p.scoreAtDeath ?? 0),
        }));

    io.emit('gameStateChanged', { state: 'FINISHED', podium: rankings.slice(0, 3), rankings });
}

/**
 * Déclenche la fin automatique si tous les joueurs connectés sont éliminés.
 * Ne se déclenche pas si personne n'a encore rejoint la partie.
 */
function checkAllEliminated() {
    if (currentGameState !== 'PLAYING' || !gameSettings.autoEndEnabled) return;
    const connected = [...state.players.values()].filter(p => !p.disconnectedAt);
    if (connected.length > 0 && !connected.some(p => p.alive)) {
        console.log('[CHROMATRACE] Fin automatique : plus aucun joueur vivant.');
        endGame();
    }
}

// ── Événements Socket.io ──────────────────────────────────
io.on('connection', (socket) => {

    // Synchronise le nouvel arrivant avec la phase courante
    socket.emit('welcome', {
        cols: COLS, rows: ROWS, cellSize: CELL_SIZE,
        colors: COLORS, controllerUrl: '/controller.html',
        currentState: currentGameState,
    });

    socket.on('joinGame', (payload, callback) => {
        const rawName = typeof payload?.name === 'string' ? payload.name.trim() : '';
        const name    = rawName.length > 0 ? rawName.slice(0, 14) : `Joueur${state.nextPlayerNumId}`;

        const player = {
            id: socket.id, socketId: socket.id, numId: state.nextPlayerNumId,
            name, color: chooseColor(payload?.color),
            x: 1, y: 1, dirX: 1, dirY: 0, inputX: 1, inputY: 0,
            alive: false, respawnAt: 0, lastDeathReason: '',
            trail: [], trailSet: new Set(), outside: false, score: 0,
            boostUntil: 0, shieldUntil: 0, disconnectedAt: 0,
        };

        state.nextPlayerNumId++;
        state.players.set(player.id, player);
        state.socketToPlayer.set(socket.id, player.id);

        // Spawn direct uniquement si la partie est déjà lancée
        if (currentGameState === 'PLAYING') respawnPlayer(player);

        callback?.({ ok: true, id: player.id, numId: player.numId,
                     name: player.name, color: player.color, currentState: currentGameState });
    });

    socket.on('adminUpdateSettings', (newSettings) => {
        const wasDecayOff = !gameSettings.decayEnabled;
        gameSettings = { ...gameSettings, ...newSettings };

        // Si la dégradation est activée en cours de partie, initialise les cellules
        // existantes à 100 pour éviter leur disparition instantanée
        if (wasDecayOff && gameSettings.decayEnabled && currentGameState === 'PLAYING') {
            for (let y = 0; y < ROWS; y++)
                for (let x = 0; x < COLS; x++)
                    if (state.grid[y][x] !== 0 && state.decayGrid[y][x] === 0)
                        state.decayGrid[y][x] = 100;
        }
        io.emit('settingsUpdated', gameSettings);
    });

    socket.on('adminStartGame', () => {
        if (currentGameState === 'PLAYING') return;

        currentGameState      = 'PLAYING';
        timeRemaining         = gameSettings.durationSec;
        state.startedAt       = Date.now();
        roundStartFreezeUntil = Date.now() + ROUND_START_FREEZE_MS;
        state.items           = [];
        state.nextItemAt      = Date.now() + randomInt(ITEM_MIN_MS, ITEM_MAX_MS);
        state.grid            = createGrid();
        state.decayGrid       = createDecayGrid();

        for (const player of state.players.values()) respawnPlayer(player);

        io.emit('gameStateChanged', { state: 'PLAYING', timeRemaining,
                                      freezeRemainingMs: ROUND_START_FREEZE_MS });

        clearInterval(gameTimerInterval);
        clearTimeout(gameStartTimeout);
        gameStartTimeout = setTimeout(() => {
            gameTimerInterval = setInterval(() => {
                timeRemaining--;
                io.emit('timeUpdate', timeRemaining);
                if (timeRemaining <= 0) endGame();
            }, 1000);
        }, ROUND_START_FREEZE_MS);
    });

    socket.on('adminResetGame', () => {
        clearInterval(gameTimerInterval);
        clearTimeout(gameStartTimeout);
        currentGameState      = 'LOBBY';
        timeRemaining         = 0;
        roundStartFreezeUntil = 0;
        state.grid            = createGrid();
        state.decayGrid       = createDecayGrid();
        state.items           = [];
        state.nextItemId      = 1;
        state.nextItemAt      = Date.now() + randomInt(ITEM_MIN_MS, ITEM_MAX_MS);
        state.players.clear();
        state.socketToPlayer.clear();
        state.nextPlayerNumId = 1;
        io.emit('gameStateChanged', { state: 'LOBBY' });
    });

    socket.on('playerInput', (payload) => {
        const playerId = state.socketToPlayer.get(socket.id);
        if (!playerId) return;
        const player = state.players.get(playerId);
        if (!player) return;

        player.disconnectedAt = 0;
        player.socketId       = socket.id;
        player.inputX = Math.max(-1, Math.min(1, Number(payload?.x) || 0));
        player.inputY = Math.max(-1, Math.min(1, Number(payload?.y) || 0));
    });

    socket.on('disconnect', () => {
        const playerId = state.socketToPlayer.get(socket.id);
        state.socketToPlayer.delete(socket.id);
        if (!playerId) return;
        const player = state.players.get(playerId);
        if (!player) return;
        // Conservé temporairement pour absorber les micro-reconnexions
        player.disconnectedAt = Date.now();
        player.socketId       = null;
        player.inputX = 0;
        player.inputY = 0;
    });
});

// ── Boucle physique — 10 fois/s ───────────────────────────
setInterval(() => {
    const now = Date.now();
    removeExpiredPlayers(now, DISCONNECT_GRACE_MS);
    if (currentGameState !== 'PLAYING' || now < roundStartFreezeUntil) return;

    if (gameSettings.itemsEnabled) spawnItemIfNeeded(now, gameSettings.boostEnabled);

    for (const player of state.players.values())
        if (!player.disconnectedAt) movePlayer(player, now);

    checkAllEliminated();

    if (gameSettings.decayEnabled) {
        for (let y = 0; y < ROWS; y++) {
            for (let x = 0; x < COLS; x++) {
                if (state.grid[y][x] !== 0) {
                    state.decayGrid[y][x] -= DECAY_PER_TICK;
                    if (state.decayGrid[y][x] <= 0) {
                        state.grid[y][x]      = 0;
                        state.decayGrid[y][x] = 0;
                    }
                }
            }
        }
    }
}, TICK_MS);

// ── Boucle broadcast — 10 fois/s ──────────────────────────
setInterval(emitState, STATE_MS);

// ── Démarrage ─────────────────────────────────────────────
server.listen(PORT, '0.0.0.0', () => {
    console.log(`CHROMATRACE est en ligne sur le port ${PORT}`);
});
