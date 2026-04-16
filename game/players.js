// ============================================================
//  game/players.js — Cycle de vie des joueurs
//  CHROMATRACE
//  Responsabilités : spawn, mort, territoire, traîne, scores,
//                    déconnexions, attribution de couleurs.
// ============================================================

const { COLS, ROWS, BASE_RADIUS, COLORS, MAX_TRAIL_LENGTH } = require('../config/constants');
const { randomInt, cellKey }              = require('./utils');
const { state, getSpawnPoint }            = require('./state');

// ── Couleurs ──────────────────────────────────────────────

function getUsedColors() {
    const used = new Set();
    for (const p of state.players.values()) used.add(p.color.toLowerCase());
    return used;
}

/**
 * Attribue une couleur : respecte le choix du joueur si disponible,
 * sinon prend la première couleur libre de la palette.
 */
function chooseColor(preferredColor) {
    const used = getUsedColors();
    if (preferredColor && !used.has(preferredColor.toLowerCase())) return preferredColor;
    return COLORS.find(c => !used.has(c.toLowerCase())) || COLORS[randomInt(0, COLORS.length - 1)];
}

// ── Territoire ────────────────────────────────────────────

/** Supprime toutes les cellules du joueur sur les deux grilles. */
function clearPlayerTerritory(player) {
    for (let y = 0; y < ROWS; y++) {
        for (let x = 0; x < COLS; x++) {
            if (state.grid[y][x] === player.numId) {
                state.grid[y][x]      = 0;
                state.decayGrid[y][x] = 0;
            }
        }
    }
}

/**
 * Peint le territoire initial autour du point de spawn.
 * Zone carrée de (2 × BASE_RADIUS + 1) cellules de côté.
 */
function paintBase(player, cx, cy) {
    for (let y = cy - BASE_RADIUS; y <= cy + BASE_RADIUS; y++) {
        for (let x = cx - BASE_RADIUS; x <= cx + BASE_RADIUS; x++) {
            if (x >= 0 && x < COLS && y >= 0 && y < ROWS) {
                state.grid[y][x]      = player.numId;
                state.decayGrid[y][x] = 100;
            }
        }
    }
}

// ── Traîne ────────────────────────────────────────────────

/** Efface la traîne active et remet le joueur en état "dans sa zone". */
function resetTrail(player) {
    player.trail = [];
    player.trailSet.clear();
    player.outside = false;
}

/**
 * Ajoute une cellule à la traîne.
 * Ignore les doublons consécutifs (pas de boucle vide d'un seul pixel).
 * Si la traîne dépasse MAX_TRAIL_LENGTH, le joueur est éliminé —
 * cela borne aussi la taille des paquets réseau avec 50 joueurs.
 */
function addTrailCell(player, x, y) {
    const last = player.trail[player.trail.length - 1];
    if (last && last.x === x && last.y === y) return;
    player.trail.push({ x, y });
    player.trailSet.add(cellKey(x, y));
    if (player.trail.length > MAX_TRAIL_LENGTH) {
        killPlayer(player, 'Traîne trop longue — reviens dans ta zone !');
    }
}

// ── Spawn / Mort ──────────────────────────────────────────

/**
 * Place le joueur sur la carte : choisit le meilleur point libre,
 * lui peint sa zone de départ et réinitialise son état.
 */
function respawnPlayer(player) {
    clearPlayerTerritory(player);
    resetTrail(player);

    const spawn  = getSpawnPoint(player);
    player.x     = Math.max(1, Math.min(spawn.x, COLS - 2));
    player.y     = Math.max(1, Math.min(spawn.y, ROWS - 2));
    player.dirX  = 0;  player.dirY  = 0;   // immobile au spawn — le joueur choisit sa direction
    player.inputX = 0; player.inputY = 0;
    player.alive           = true;
    player.respawnAt       = 0;
    player.lastDeathReason = '';
    player.boostUntil      = 0;
    player.shieldUntil     = 0;

    paintBase(player, player.x, player.y);
}

/**
 * Élimine un joueur : efface son territoire et ses bonus,
 * mémorise la raison pour l'afficher sur la manette.
 * Pas de respawn automatique en mode éliminé définitif.
 */
function killPlayer(player, reason) {
    player.scoreAtDeath    = player.score;   // sauvegardé AVANT d'effacer le territoire
    player.deathTime       = Date.now();     // pour départager les ex-æquo (mort plus tard = mieux classé)
    player.alive           = false;
    player.lastDeathReason = reason;
    player.respawnAt       = 0;
    player.boostUntil      = 0;
    player.shieldUntil     = 0;
    clearPlayerTerritory(player);
    resetTrail(player);
}

// ── Déconnexions ──────────────────────────────────────────

/**
 * Supprime les joueurs déconnectés depuis plus de disconnectGraceMs.
 * La période de grâce absorbe les micro-coupures réseau sans pénaliser
 * le joueur qui se reconnecte rapidement.
 */
function removeExpiredPlayers(now, disconnectGraceMs) {
    for (const [id, player] of state.players.entries()) {
        if (player.disconnectedAt && now - player.disconnectedAt > disconnectGraceMs) {
            clearPlayerTerritory(player);
            state.players.delete(id);
        }
    }
}

// ── Scores ────────────────────────────────────────────────

/**
 * Recalcule le score (cellules possédées) de chaque joueur
 * en parcourant intégralement la grille principale.
 */
function rebuildScores() {
    const counts = new Map();
    for (let y = 0; y < ROWS; y++) {
        for (let x = 0; x < COLS; x++) {
            const owner = state.grid[y][x];
            if (owner) counts.set(owner, (counts.get(owner) || 0) + 1);
        }
    }
    for (const player of state.players.values()) {
        player.score = counts.get(player.numId) || 0;
    }
}

module.exports = {
    chooseColor,
    clearPlayerTerritory, paintBase,
    resetTrail, addTrailCell,
    respawnPlayer, killPlayer,
    removeExpiredPlayers,
    rebuildScores,
};
