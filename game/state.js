// ============================================================
//  game/state.js — État global de la partie + grille de spawn
//  CHROMATRACE
//  Exporte l'objet `state` mutable partagé par tous les modules.
//  Les autres modules importent ce même objet par référence :
//  toute mutation est immédiatement visible partout.
// ============================================================

const { COLS, ROWS, SPAWN_MARGIN, SPAWN_MIN_GAP, ITEM_MIN_MS, ITEM_MAX_MS } = require('../config/constants');
const { randomInt } = require('./utils');

// ── Constructeurs de grilles ──────────────────────────────

/** Grille principale : chaque cellule = ID du joueur propriétaire, 0 = neutre. */
function createGrid() {
    return Array.from({ length: ROWS }, () => Array(COLS).fill(0));
}

/**
 * Grille de vitalité : chaque cellule va de 0 (vide) à 100 (pleine vitalité).
 * N'est lue/écrite que lorsque le mode dégradation est activé.
 */
function createDecayGrid() {
    return Array.from({ length: ROWS }, () => new Array(COLS).fill(0));
}

// ── Grille de points de spawn ─────────────────────────────

/**
 * Précalcule une grille régulière de positions de spawn couvrant
 * toute la carte. Respecte les marges de bord et la distance minimale
 * entre spawns pour éviter les chevauchements au démarrage.
 */
function buildSpawnGrid() {
    const points = [];
    const xMin = SPAWN_MARGIN,     xMax = COLS - SPAWN_MARGIN;
    const yMin = SPAWN_MARGIN,     yMax = ROWS - SPAWN_MARGIN;
    const cols  = Math.floor((xMax - xMin) / SPAWN_MIN_GAP);
    const rows  = Math.floor((yMax - yMin) / SPAWN_MIN_GAP);
    const xStep = Math.floor((xMax - xMin) / cols);
    const yStep = Math.floor((yMax - yMin) / rows);

    for (let r = 0; r < rows; r++) {
        for (let c = 0; c < cols; c++) {
            points.push({
                x: xMin + c * xStep + Math.floor(xStep / 2),
                y: yMin + r * yStep + Math.floor(yStep / 2),
            });
        }
    }
    return points;
}

/** Grille précalculée une seule fois au démarrage du serveur. */
const SPAWN_GRID = buildSpawnGrid();

/**
 * Retourne le point de spawn le plus éloigné de tous les joueurs
 * actuellement vivants, pour minimiser les collisions initiales.
 */
function getSpawnPoint(player) {
    let bestPoint = null;
    let bestDist  = -1;

    for (const point of SPAWN_GRID) {
        let minDist = Infinity;
        for (const other of state.players.values()) {
            if (!other.alive || other.id === player.id) continue;
            const dx = point.x - other.x;
            const dy = point.y - other.y;
            const d  = Math.sqrt(dx * dx + dy * dy);
            if (d < minDist) minDist = d;
        }
        if (minDist > bestDist) {
            bestDist  = minDist;
            bestPoint = point;
        }
    }

    return bestPoint || SPAWN_GRID[0];
}

// ── État global de la partie ──────────────────────────────

const state = {
    grid:            createGrid(),
    decayGrid:       createDecayGrid(),
    players:         new Map(),
    socketToPlayer:  new Map(),
    nextPlayerNumId: 1,
    items:           [],
    nextItemId:      1,
    nextItemAt:      Date.now() + randomInt(ITEM_MIN_MS, ITEM_MAX_MS),
    startedAt:       Date.now(),
};

module.exports = { state, createGrid, createDecayGrid, getSpawnPoint };
