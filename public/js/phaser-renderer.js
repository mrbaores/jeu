// ============================================================
//  phaser-renderer.js — Rendu de la scène Phaser
//  CHROMATRACE — Projecteur
//
//  Méthodes mélangées dans ChromaScene via Object.assign()
//  dans phaser-scene.js. "this" = instance ChromaScene.
//  Dépend de la variable globale `gameData` (définie dans
//  phaser-scene.js, disponible au moment des appels).
// ============================================================

const PhaserRenderer = {

    // Fond : grille néon sombre avec effet de pulse sinusoïdal subtil
    drawBackground() {
        const W = gameData.cols * gameData.cellW;
        const H = gameData.rows * gameData.cellH;

        this.layerBackground.clear();
        this.layerBackground.fillStyle(0x0f172a, 1);
        this.layerBackground.fillRect(0, 0, W, H);

        this.gridPulse += 0.02;
        const pulseAlpha = 0.05 + Math.sin(this.gridPulse) * 0.035;

        this.layerBackground.lineStyle(1, 0x06b6d4, pulseAlpha);
        for (let x = 0; x <= gameData.cols; x++)
            this.layerBackground.lineBetween(x * gameData.cellW, 0, x * gameData.cellW, H);
        for (let y = 0; y <= gameData.rows; y++)
            this.layerBackground.lineBetween(0, y * gameData.cellH, W, y * gameData.cellH);
    },

    // Territoires : cellules colorées selon leur propriétaire
    // L'opacité est modulée par la vitalité quand le mode dégradation est actif
    drawTerritories(state) {
        this.layerGrid.clear();

        const colorMap = new Map(
            state.players.map(p => [p.numId, Phaser.Display.Color.HexStringToColor(p.color).color])
        );

        for (let y = 0; y < state.rows; y++) {
            for (let x = 0; x < state.cols; x++) {
                const owner = state.grid[y][x];
                if (!owner) continue;

                // Sans dégradation, decayGrid absent → opacité fixe 0.42
                const vitality = state.decayGrid ? state.decayGrid[y][x] / 100 : 1;
                this.layerGrid.fillStyle(colorMap.get(owner) || 0xffffff, Math.max(0.07, 0.42 * vitality));
                this.layerGrid.fillRect(x * gameData.cellW, y * gameData.cellH, gameData.cellW, gameData.cellH);
            }
        }
    },

    // Items : sprites mis en cache par ID pour éviter les recréations chaque frame
    drawItems(state) {
        const currentIds = new Set(state.items.map(i => i.id));

        // Détruit les sprites des items disparus
        for (const [id, sprite] of this.itemSpriteMap) {
            if (!currentIds.has(id)) { sprite.destroy(); this.itemSpriteMap.delete(id); }
        }

        state.items.forEach(item => {
            const sx = item.x * gameData.cellW + gameData.cellW / 2;
            const sy = item.y * gameData.cellH + gameData.cellH / 2;

            if (!this.itemSpriteMap.has(item.id)) {
                const sprite = this.add.sprite(sx, sy, item.type === 'boost' ? 'img-boost' : 'img-shield').setDepth(30);
                this.itemSpriteMap.set(item.id, sprite);
            } else {
                this.itemSpriteMap.get(item.id).setPosition(sx, sy);
            }
            this.itemSpriteMap.get(item.id).setDisplaySize(gameData.cellW * 1.5, gameData.cellH * 1.5);
        });
    },

    // Joueurs : cube + traîne lumineuse + pseudo flottant + halos de bonus
    drawPlayers(state) {
        this.layerPlayers.clear();

        // Supprime les labels des joueurs éliminés
        const aliveIds = new Set(state.players.filter(p => p.alive).map(p => p.numId));
        for (const [id, label] of this.playerLabels.entries()) {
            if (!aliveIds.has(id)) { label.destroy(); this.playerLabels.delete(id); }
        }

        const t = Date.now() / 1000;

        state.players.forEach(player => {
            const color = Phaser.Display.Color.HexStringToColor(player.color).color;

            // Traîne : animation de pulse sinusoïdal par cellule
            player.trail.forEach((cell, index) => {
                const phase = (t * 3 + index * 0.2) % (Math.PI * 2);
                const alpha = player.shield ? 0.35 : (0.75 + Math.sin(phase) * 0.15);
                const cw = gameData.cellW, ch = gameData.cellH;
                const pad = Math.min(cw, ch) * 0.18;
                this.layerPlayers.fillStyle(color, alpha);
                this.layerPlayers.fillRect(cell.x * cw + pad, cell.y * ch + pad, cw - pad * 2, ch - pad * 2);
            });

            if (!player.alive) return;

            const cw = gameData.cellW, ch = gameData.cellH;
            const px = player.x * cw + cw / 2;
            const py = player.y * ch + ch / 2;
            const cubeSize = Math.min(cw, ch) * 1.5;
            const half     = cubeSize / 2;

            // Corps
            this.layerPlayers.fillStyle(color, 1);
            this.layerPlayers.fillRoundedRect(px - half, py - half, cubeSize, cubeSize, 3);
            // Bordure sombre
            this.layerPlayers.lineStyle(1.5, 0x000000, 0.4);
            this.layerPlayers.strokeRoundedRect(px - half, py - half, cubeSize, cubeSize, 3);
            // Reflet (simuler la brillance du cube)
            const shine = cubeSize * 0.38;
            this.layerPlayers.fillStyle(0xffffff, 0.42);
            this.layerPlayers.fillRoundedRect(px - half + 2, py - half + 2, shine, shine, 2);

            // Halo vert = boost actif
            if (player.boost) {
                this.layerPlayers.lineStyle(2, 0x84cc16, 1);
                this.layerPlayers.strokeRoundedRect(px - half - 3, py - half - 3, cubeSize + 6, cubeSize + 6, 5);
            }
            // Halo jaune = shield actif
            if (player.shield) {
                this.layerPlayers.lineStyle(2, 0xeab308, 1);
                this.layerPlayers.strokeRoundedRect(px - half - 5, py - half - 5, cubeSize + 10, cubeSize + 10, 6);
            }

            // Flèche de direction : visible seulement quand le joueur se déplace
            if (player.dirX !== undefined && (player.dirX !== 0 || player.dirY !== 0)) {
                const angle   = Math.atan2(player.dirY, player.dirX);
                const tip     = half + 6;
                const tipX    = px + Math.cos(angle) * tip;
                const tipY    = py + Math.sin(angle) * tip;
                const perpX   = -Math.sin(angle) * 3;
                const perpY   =  Math.cos(angle) * 3;
                this.layerPlayers.fillStyle(color, 0.9);
                this.layerPlayers.fillTriangle(
                    tipX + Math.cos(angle) * 5, tipY + Math.sin(angle) * 5,
                    tipX + perpX, tipY + perpY,
                    tipX - perpX, tipY - perpY
                );
            }

            // Beacon de repérage pendant le gel de départ (3 secondes)
            // Aide chaque joueur à trouver son personnage sur l'écran partagé
            const freezeMs = gameData.state?.freezeRemainingMs || 0;
            if (freezeMs > 0) {
                const pulse = 0.3 + Math.sin(Date.now() / 120) * 0.3;
                const r1    = Math.min(cw, ch) * 3.5;
                const r2    = r1 * 1.7;
                this.layerPlayers.lineStyle(3, color, pulse);
                this.layerPlayers.strokeCircle(px, py, r1);
                this.layerPlayers.lineStyle(1.5, color, pulse * 0.5);
                this.layerPlayers.strokeCircle(px, py, r2);
            }

            // Pseudo : créé une seule fois, repositionné chaque frame
            if (!this.playerLabels.has(player.numId)) {
                const label = this.add.text(px, py - half - 2, player.name, {
                    fontFamily: 'Rajdhani', fontStyle: 'bold', fontSize: '11px',
                    color: '#ffffff', stroke: '#000000', strokeThickness: 4, resolution: 2,
                }).setOrigin(0.5, 1).setDepth(41);
                this.playerLabels.set(player.numId, label);
            } else {
                this.playerLabels.get(player.numId).setPosition(px, py - half - 2);
            }
        });
    },
};
