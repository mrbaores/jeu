// ============================================================
//  game/utils.js — Fonctions utilitaires pures
//  CHROMATRACE
//  Aucune dépendance externe — peut être importé par n'importe
//  quel module sans risque de dépendance circulaire.
// ============================================================

/** Entier aléatoire dans [min, max] inclus. */
function randomInt(min, max) {
    return Math.floor(Math.random() * (max - min + 1)) + min;
}

/** Contraint value entre min et max. */
function clamp(value, min, max) {
    return Math.max(min, Math.min(max, value));
}

/** Clé unique pour indexer une cellule de grille (utilisée par les trailSets). */
function cellKey(x, y) {
    return `${x}:${y}`;
}

/**
 * Calcule la prochaine direction de déplacement d'après l'input joystick.
 *
 * Règles :
 * - Si l'input est sous la dead zone (0.2), conserve la direction courante.
 * - Privilégie l'axe avec la plus grande amplitude (horizontal ou vertical).
 * - Interdit le demi-tour immédiat (évite l'auto-collision instantanée).
 */
function chooseDirection(inputX, inputY, fallbackX, fallbackY) {
    const DEAD_ZONE = 0.2;

    if (Math.abs(inputX) < DEAD_ZONE && Math.abs(inputY) < DEAD_ZONE) {
        return { dx: fallbackX, dy: fallbackY };
    }

    let newDx = 0;
    let newDy = 0;

    if (Math.abs(inputX) >= Math.abs(inputY)) {
        newDx = inputX >= 0 ? 1 : -1;
    } else {
        newDy = inputY >= 0 ? 1 : -1;
    }

    if (newDx === -fallbackX && fallbackX !== 0) return { dx: fallbackX, dy: fallbackY };
    if (newDy === -fallbackY && fallbackY !== 0) return { dx: fallbackX, dy: fallbackY };

    return { dx: newDx, dy: newDy };
}

module.exports = { randomInt, clamp, cellKey, chooseDirection };
