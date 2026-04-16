// ============================================================
//  config/constants.js — Toutes les constantes du jeu
//  CHROMATRACE
//  Centralise la configuration pour éviter les "magic numbers"
//  dispersés dans le code.
// ============================================================

module.exports = {

    PORT: process.env.PORT || 3000,

    // Dimensions de la grille logique (unités cellules)
    COLS: 80,
    ROWS: 45,
    CELL_SIZE: 16,

    // Cadences des boucles serveur
    TICK_MS:  100,   // physique : 10 fois/s
    STATE_MS: 100,   // broadcast état : 10 fois/s (rendu reste fluide)

    // Durées de phases (millisecondes)
    ROUND_START_FREEZE_MS: 6000,   // gel au démarrage — 6 s pour que les joueurs se repèrent
    DISCONNECT_GRACE_MS:   3000,   // délai avant suppression d'un joueur déconnecté
    ITEM_MIN_MS:           6000,   // intervalle minimum entre deux spawns d'items
    ITEM_MAX_MS:           12000,  // intervalle maximum entre deux spawns d'items
    BOOST_MS:              5000,   // durée du bonus boost
    SHIELD_MS:             5000,   // durée du bonus shield

    // Territoire de départ : carré (2 × BASE_RADIUS + 1) de côté
    BASE_RADIUS: 2,

    // Longueur max de la traîne — au-delà le joueur est éliminé.
    // Limite la taille des paquets réseau (50 joueurs × 120 cellules = 6000 coords max)
    MAX_TRAIL_LENGTH: 120,

    // Dégradation : une cellule perd 100 % de vitalité en 30 s (300 ticks à 10/s)
    DECAY_PER_TICK: 100 / 300,

    // Espacement des spawns
    // SPAWN_MIN_GAP=5 + SPAWN_MARGIN=3 → ~98 points disponibles (supporte 50 joueurs)
    SPAWN_MARGIN:  3,   // distance minimale des bords de la carte
    SPAWN_MIN_GAP: 5,   // distance minimale entre deux points de spawn

    // Palette de couleurs attribuées aux joueurs
    COLORS: [
        '#06b6d4', '#d946ef', '#84cc16', '#eab308',
        '#f97316', '#fb7185', '#60a5fa', '#14b8a6',
    ],
};
