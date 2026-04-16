// ============================================================
//  game/physics.js — Physique du jeu : mouvement et collisions
//  CHROMATRACE
//  Responsabilités : déplacement des joueurs, collisions sur les
//                    traînes, algorithme de capture de territoire
//                    (flood fill depuis les bords).
// ============================================================

const { COLS, ROWS } = require('../config/constants');
const { cellKey, chooseDirection }                    = require('./utils');
const { state }                                       = require('./state');
const { killPlayer, resetTrail, addTrailCell }        = require('./players');
const { pickupItem }                                  = require('./items');

/**
 * Vérifie si le joueur se trouve sur la traîne d'un autre joueur
 * (ou sur la sienne).
 *
 * - Traîne propre    → le joueur s'élimine lui-même.
 * - Traîne adverse   → élimine l'adversaire (sauf si shieldé).
 *
 * Retourne true si le joueur courant vient de mourir.
 */
function handleTrailCollisions(currentPlayer, now) {
    for (const target of state.players.values()) {
        if (!target.alive) continue;
        if (target.shieldUntil > now) continue;
        if (!target.trailSet.has(cellKey(currentPlayer.x, currentPlayer.y))) continue;

        if (target.numId === currentPlayer.numId) {
            killPlayer(currentPlayer, 'Tu as coupé ta propre trace.');
            return true;
        }
        killPlayer(target, `${currentPlayer.name} a coupé ta trace.`);
        return false;
    }
    return false;
}

/**
 * Capture la zone enfermée par la traîne du joueur.
 *
 * Algorithme flood fill depuis les 4 bords de la carte :
 * toute cellule non atteignable de l'extérieur (bloquée par le
 * territoire + traîne du joueur) est capturée.
 *
 * Effet secondaire : élimine les adversaires dont la traîne active
 * est entièrement encerclée dans la zone capturée.
 */
function captureArea(player) {
    const blocked = Array.from({ length: ROWS }, () => Array(COLS).fill(false));
    const visited = Array.from({ length: ROWS }, () => Array(COLS).fill(false));
    const queue   = [];

    for (let y = 0; y < ROWS; y++)
        for (let x = 0; x < COLS; x++)
            if (state.grid[y][x] === player.numId) blocked[y][x] = true;

    for (const cell of player.trail)
        if (cell.x >= 0 && cell.x < COLS && cell.y >= 0 && cell.y < ROWS)
            blocked[cell.y][cell.x] = true;

    function enqueue(x, y) {
        if (x < 0 || x >= COLS || y < 0 || y >= ROWS) return;
        if (blocked[y][x] || visited[y][x]) return;
        visited[y][x] = true;
        queue.push({ x, y });
    }

    for (let x = 0; x < COLS; x++) { enqueue(x, 0); enqueue(x, ROWS - 1); }
    for (let y = 0; y < ROWS; y++) { enqueue(0, y); enqueue(COLS - 1, y); }

    let head = 0;
    while (head < queue.length) {
        const { x, y } = queue[head++];
        enqueue(x + 1, y); enqueue(x - 1, y);
        enqueue(x, y + 1); enqueue(x, y - 1);
    }

    // Élimine les adversaires encerclés
    for (const other of state.players.values()) {
        if (!other.alive || other.numId === player.numId) continue;
        const encircled = other.trail.some(
            c => c.x >= 0 && c.x < COLS && c.y >= 0 && c.y < ROWS
              && !blocked[c.y][c.x] && !visited[c.y][c.x]
        );
        if (encircled) killPlayer(other, `${player.name} t'a encerclé.`);
    }

    // Convertit la traîne en territoire puis capture les cellules intérieures
    for (const cell of player.trail) {
        state.grid[cell.y][cell.x]      = player.numId;
        state.decayGrid[cell.y][cell.x] = 100;
    }
    for (let y = 0; y < ROWS; y++) {
        for (let x = 0; x < COLS; x++) {
            if (!blocked[y][x] && !visited[y][x]) {
                state.grid[y][x]      = player.numId;
                state.decayGrid[y][x] = 100;
            }
        }
    }

    resetTrail(player);
}

/**
 * Déplace le joueur d'un ou deux pas selon s'il est boosté.
 * À chaque pas :
 *   1. Applique la direction joystick (sans demi-tour).
 *   2. Collision bord → mort.
 *   3. Collision traîne → mort ou élimination adverse.
 *   4. Retour dans sa zone → capture si traîne active.
 *   5. Hors zone → extension de la traîne.
 *   6. Ramassage d'items.
 */
function movePlayer(player, now) {
    if (!player.alive) return;

    const steps = player.boostUntil > now ? 2 : 1;

    for (let step = 0; step < steps; step++) {
        const { dx, dy } = chooseDirection(player.inputX, player.inputY, player.dirX, player.dirY);
        player.dirX = dx;
        player.dirY = dy;
        player.x   += player.dirX;
        player.y   += player.dirY;

        if (player.x <= 0 || player.x >= COLS - 1 || player.y <= 0 || player.y >= ROWS - 1) {
            killPlayer(player, 'Tu as touché le bord de la carte.');
            return;
        }

        const selfDied = handleTrailCollisions(player, now);
        if (selfDied || !player.alive) return;

        const owner = state.grid[player.y][player.x];
        if (owner === player.numId) {
            if (player.outside && player.trail.length > 0) captureArea(player);
            else resetTrail(player);
        } else {
            player.outside = true;
            addTrailCell(player, player.x, player.y);
        }

        pickupItem(player);
    }
}

module.exports = { movePlayer, captureArea, handleTrailCollisions };
