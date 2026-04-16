// ============================================================
//  phaser-scene.js — Scène principale Phaser + configuration
//  CHROMATRACE — Projecteur
//
//  Dépendances (chargées avant via index.html) :
//    phaser-effects.js  → PhaserEffects  (effets visuels)
//    phaser-renderer.js → PhaserRenderer (fond, territoires, joueurs)
// ============================================================

const socket = io();

// Passe en plein écran quand la partie démarre
function demanderPleinEcran() {
    const el = document.documentElement;
    if      (el.requestFullscreen)            el.requestFullscreen();
    else if (el.webkitRequestFullscreen) el.webkitRequestFullscreen();
    else if (el.mozRequestFullScreen)    el.mozRequestFullScreen();
}

/**
 * Recalcule les dimensions d'une cellule en pixels écran.
 * Appelé au resize et au démarrage pour que le rendu reste
 * proportionnel quelle que soit la résolution du projecteur.
 */
function syncCellSize() {
    gameData.cellW = window.innerWidth  / gameData.cols;
    gameData.cellH = window.innerHeight / gameData.rows;
}

socket.on('gameStateChanged', (payload) => {
    if (payload.state === 'PLAYING') { demanderPleinEcran(); setTimeout(syncCellSize, 500); }
});

// Données partagées entre la scène, les effets et le renderer
const gameData = {
    cols: 80, rows: 45,
    cellSize: 16,   // taille logique serveur
    cellW: 16,      // largeur cellule en pixels écran (recalculé dynamiquement)
    cellH: 16,      // hauteur cellule en pixels écran (recalculé dynamiquement)
    state: null,
    prevAlive:  new Set(),
    prevScores: new Map(),
};

// ============================================================
//  Scène Phaser
// ============================================================
class ChromaScene extends Phaser.Scene {

    constructor() {
        super('ChromaScene');
        this.playerLabels  = new Map();   // numId → Text
        this.spawnEffects  = [];
        this.flashEffects  = [];
        this.particles     = [];
        this.gridPulse     = 0;
        this.itemSpriteMap = new Map();   // id → Sprite (cache pour éviter les recréations)
    }

    updateCellSize() {
        gameData.cellW = (this.scale.width  || window.innerWidth)  / gameData.cols;
        gameData.cellH = (this.scale.height || window.innerHeight) / gameData.rows;
    }

    preload() {
        this.load.image('img-boost',  'assets/boost.png');
        this.load.image('img-shield', 'assets/shield.png');
        this.load.audio('game-music', 'assets/musique.mp3');
        this.load.audio('snd-kill',   'assets/kill.mp3');
    }

    create() {
        // Calques ordonnés par profondeur (depth)
        this.layerBackground = this.add.graphics().setDepth(0);
        this.layerGrid       = this.add.graphics().setDepth(10);
        this.layerEffects    = this.add.graphics().setDepth(20);
        this.layerPlayers    = this.add.graphics().setDepth(40);
        this.layerParticles  = this.add.graphics().setDepth(50);
        // items : depth 30, gérés via itemSpriteMap

        this.bgMusic   = this.sound.add('game-music', { loop: true, volume: 0 });
        // Sons ponctuels : null si le fichier n'a pas été chargé (asset absent)
        this.sndKill = this.cache.audio.has('snd-kill') ? this.sound.add('snd-kill', { volume: 0.6 }) : null;

        socket.on('gameStateChanged', (payload) => {
            if (payload.state === 'PLAYING') {
                this.playMusic();
                // Zoom cinématique d'entrée : commence à 2× puis revient à 1× en 2 s
                this.cameras.main.setZoom(2);
                this.cameras.main.zoomTo(1, 2000, 'Power2');
            } else {
                this.stopMusic();
            }
        });

        socket.on('state', (payload) => {
            this.detectEvents(payload);
            gameData.cols      = payload.cols;
            gameData.rows      = payload.rows;
            gameData.cellSize  = payload.cellSize;
            gameData.state     = payload;
            gameData.gridDirty = true;   // déclenche le redessin des territoires
        });
    }

    // Fondu d'entrée musique
    playMusic() {
        if (this.bgMusic.isPlaying) return;
        this.tweens.killTweensOf(this.bgMusic);
        this.bgMusic.play();
        this.tweens.add({ targets: this.bgMusic, volume: 0.5, duration: 1500, ease: 'Linear' });
    }

    // Fondu de sortie musique
    stopMusic() {
        if (!this.bgMusic.isPlaying) return;
        this.tweens.killTweensOf(this.bgMusic);
        this.tweens.add({ targets: this.bgMusic, volume: 0, duration: 800, ease: 'Linear',
                          onComplete: () => this.bgMusic.stop() });
    }

    /**
     * Compare l'état courant au précédent pour déclencher les effets :
     * - alive true→false : explosion
     * - alive false→true : effet spawn
     * - score +5 ou plus : flash de capture
     */
    detectEvents(payload) {
        payload.players.forEach(player => {
            const wasAlive = gameData.prevAlive.has(player.numId);
            // Coordonnées converties en pixels écran pour positionner les effets
            const px = player.x * gameData.cellW + gameData.cellW / 2;
            const py = player.y * gameData.cellH + gameData.cellH / 2;

            if (wasAlive && !player.alive)  this.spawnExplosion(px, py, player.color);
            if (!wasAlive && player.alive)  this.spawnEffect(px, py, player.color);

            const prevScore = gameData.prevScores.get(player.numId) || 0;
            if (player.score > prevScore + 5) this.spawnCaptureFlash(px, py, player.color);
            gameData.prevScores.set(player.numId, player.score);
        });

        gameData.prevAlive = new Set(payload.players.filter(p => p.alive).map(p => p.numId));
    }

    update(_time, delta) {
        this.updateCellSize();
        this.drawBackground();
        this.updateEffects(delta);
        if (!gameData.state) return;
        // Territoires : redessinés seulement quand un nouveau paquet arrive (10/s)
        // et non à chaque frame (60/s) — réduit la charge GPU avec 50 joueurs
        if (gameData.gridDirty) {
            this.drawTerritories(gameData.state);
            gameData.gridDirty = false;
        }
        this.drawItems(gameData.state);
        this.drawPlayers(gameData.state);
    }
}

// Fusionne les méthodes d'effets et de rendu dans la classe
Object.assign(ChromaScene.prototype, PhaserEffects, PhaserRenderer);

// ============================================================
//  Configuration et lancement Phaser
// ============================================================
const config = {
    type: Phaser.AUTO,
    scale: { mode: Phaser.Scale.RESIZE, autoCenter: Phaser.Scale.NONE,
             width: window.innerWidth, height: window.innerHeight },
    backgroundColor: '#0f172a',
    scene:    [ChromaScene],
    parent:   'game-canvas',
    pixelArt: false,
};

window.addEventListener('load', () => {
    const game = new Phaser.Game(config);
    game.events.once('ready', syncCellSize);
});

window.addEventListener('resize', syncCellSize);
