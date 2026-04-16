// ============================================================
//  phaser-effects.js — Effets visuels de la scène Phaser
//  CHROMATRACE — Projecteur
//
//  Méthodes mélangées dans ChromaScene via Object.assign()
//  dans phaser-scene.js. "this" = instance ChromaScene.
//  Dépend de la variable globale `gameData` (définie dans
//  phaser-scene.js, disponible au moment des appels).
// ============================================================

const PhaserEffects = {

    // Explosion à l'élimination : particules + onde de choc + screen shake + flash rouge
    spawnExplosion(x, y, colorHex) {
        const color = Phaser.Display.Color.HexStringToColor(colorHex).color;
        const COUNT = 18;

        for (let i = 0; i < COUNT; i++) {
            const angle = (i / COUNT) * Math.PI * 2;
            const speed = 2 + Math.random() * 4;
            const size  = 3 + Math.random() * 4;
            const life  = 0.6 + Math.random() * 0.4;
            this.particles.push({
                x, y,
                vx: Math.cos(angle) * speed,
                vy: Math.sin(angle) * speed,
                size, color, alpha: 1, life, maxLife: life,
            });
        }

        this.flashEffects.push({ type: 'shockwave', x, y, radius: 0, maxR: 60, color, alpha: 0.8, speed: 4 });

        // Tremblement de caméra + flash rouge — donne du poids à l'élimination
        this.cameras.main.shake(320, 0.013);
        this.cameras.main.flash(350, 239, 68, 68);
        this.sndKill?.play();
    },

    // Apparition d'un joueur : carré lumineux qui grandit puis s'efface
    spawnEffect(x, y, colorHex) {
        const color = Phaser.Display.Color.HexStringToColor(colorHex).color;
        this.spawnEffects.push({ x, y, color, scale: 0, alpha: 1, phase: 'in' });
    },

    // Flash de capture de territoire : cercle translucide centré sur le joueur
    spawnCaptureFlash(x, y, colorHex) {
        const color = Phaser.Display.Color.HexStringToColor(colorHex).color;
        this.flashEffects.push({ type: 'flash', x, y, radius: 30, color, alpha: 0.6 });
    },

    // Met à jour et dessine tous les effets actifs — appelé chaque frame
    updateEffects(delta) {
        const dt = delta / 1000;
        this.layerEffects.clear();
        this.layerParticles.clear();

        // Anneaux de spawn
        this.spawnEffects = this.spawnEffects.filter(e => e.alpha > 0);
        this.spawnEffects.forEach(e => {
            e.scale += dt * 3;
            e.alpha -= dt * 2;
            if (e.alpha <= 0) return;
            // Taille calculée en pixels écran (cellW), pas en unités logiques serveur
            const size = gameData.cellW * 1.5 * e.scale;
            this.layerEffects.lineStyle(3, e.color, e.alpha);
            this.layerEffects.strokeRoundedRect(e.x - size / 2, e.y - size / 2, size, size, 4);
        });

        // Ondes de choc et flashes de capture
        this.flashEffects = this.flashEffects.filter(e => e.alpha > 0);
        this.flashEffects.forEach(e => {
            if (e.type === 'shockwave') {
                e.radius += e.speed;
                e.alpha  -= dt * 2.5;
                if (e.alpha <= 0) return;
                this.layerEffects.lineStyle(3, e.color, e.alpha);
                this.layerEffects.strokeCircle(e.x, e.y, e.radius);
            } else if (e.type === 'flash') {
                e.alpha -= dt * 3;
                if (e.alpha <= 0) return;
                this.layerEffects.fillStyle(e.color, e.alpha * 0.3);
                this.layerEffects.fillCircle(e.x, e.y, e.radius);
                this.layerEffects.lineStyle(2, e.color, e.alpha);
                this.layerEffects.strokeCircle(e.x, e.y, e.radius);
            }
        });

        // Particules d'explosion (gravité + friction)
        this.particles = this.particles.filter(p => p.alpha > 0);
        this.particles.forEach(p => {
            p.x    += p.vx;
            p.y    += p.vy;
            p.vy   += 0.1;    // gravité simulée
            p.vx   *= 0.97;   // friction
            p.alpha -= dt / p.maxLife;
            if (p.alpha <= 0) return;
            this.layerParticles.fillStyle(p.color, p.alpha);
            this.layerParticles.fillRect(p.x - p.size / 2, p.y - p.size / 2, p.size, p.size);
        });
    },
};
