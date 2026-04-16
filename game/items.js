// ============================================================
//  game/items.js — Gestion des items bonus (boost + shield)
//  CHROMATRACE
//  Responsabilités : apparition aléatoire sur la carte,
//                    ramassage et activation par un joueur.
// ============================================================

const { COLS, ROWS, ITEM_MIN_MS, ITEM_MAX_MS, BOOST_MS, SHIELD_MS } = require('../config/constants');
const { randomInt, cellKey } = require('./utils');
const { state }              = require('./state');

/**
 * Ramasse l'item sous les pieds du joueur, s'il en existe un.
 * Active le bonus correspondant pour une durée fixe.
 */
function pickupItem(player) {
    const index = state.items.findIndex(i => i.x === player.x && i.y === player.y);
    if (index === -1) return;

    const item = state.items.splice(index, 1)[0];
    if (item.type === 'boost')  player.boostUntil  = Date.now() + BOOST_MS;
    if (item.type === 'shield') player.shieldUntil = Date.now() + SHIELD_MS;
}

/**
 * Fait apparaître un nouvel item si le cooldown est écoulé et que
 * le plafond de 4 items simultanés n'est pas atteint.
 * Cherche une position libre en 50 tentatives maximum.
 */
function spawnItemIfNeeded(now, boostEnabled) {
    if (now < state.nextItemAt || state.items.length >= 4) return;

    for (let attempt = 0; attempt < 50; attempt++) {
        const x = randomInt(2, COLS - 3);
        const y = randomInt(2, ROWS - 3);

        const occupied =
            [...state.players.values()].some(p => p.alive && p.x === x && p.y === y) ||
            [...state.players.values()].some(p => p.trailSet.has(cellKey(x, y)))      ||
            state.grid[y][x] !== 0                                                     ||
            state.items.some(i => i.x === x && i.y === y);

        if (!occupied) {
            const type = (boostEnabled && Math.random() < 0.5) ? 'boost' : 'shield';
            state.items.push({ id: state.nextItemId++, type, x, y });
            break;
        }
    }

    state.nextItemAt = now + randomInt(ITEM_MIN_MS, ITEM_MAX_MS);
}

module.exports = { pickupItem, spawnItemIfNeeded };
