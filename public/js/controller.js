// ============================================================
//  controller.js — Manette mobile CHROMATRACE
//  Gère les 5 écrans de la manette : login, lobby, jeu,
//  éliminé, fin de partie. Communique via Socket.io.
// ============================================================

const COLORS = [
    "#06B6D4", "#D946EF", "#84CC16", "#EAB308",
    "#F97316", "#EF4444", "#8B5CF6", "#10B981",
    "#EC4899", "#3B82F6", "#F43F5E", "#14B8A6",
];

let selectedColor    = COLORS[0];
let myPseudo         = '';
let myNumId          = null;
let myScore          = 0;
let myX              = 0;
let myY              = 0;
let socket           = null;
let joystick         = null;
let joined           = false;
let isEliminated     = false;
let currentGameState = 'LOBBY';
let prevBoost        = false;   // détecte le pickup de boost pour le son

// Son de boost via HTML Audio (pas Phaser côté controller)
const boostAudio = new Audio('assets/boost.mp3');
boostAudio.volume = 0.8;

// ── Navigation entre écrans ────────────────────────────────
function showScreen(id) {
    document.querySelectorAll('.screen').forEach(s => s.classList.add('hidden'));
    document.getElementById(id).classList.remove('hidden');
    if (id === 'screen-game') initJoystick();
}

// ── Grille de couleurs ─────────────────────────────────────
function initColorGrid() {
    const grid = document.getElementById('color-grid');
    COLORS.forEach((color, i) => {
        const btn = document.createElement('div');
        btn.className = 'color-option' + (i === 0 ? ' selected' : '');
        btn.style.background = color;
        btn.style.setProperty('--c', color);
        btn.onclick = () => {
            document.querySelectorAll('.color-option').forEach(b => b.classList.remove('selected'));
            btn.classList.add('selected');
            selectedColor = color;
        };
        grid.appendChild(btn);
    });
}

// ── Connexion Socket.io ────────────────────────────────────
function connectSocket() {
    socket = io();

    socket.on('gameStateChanged', (payload) => {
        currentGameState = payload.state;
        if (!joined) return;

        if (currentGameState === 'LOBBY') {
            isEliminated = false;
            showScreen('screen-lobby');
        } else if (currentGameState === 'PLAYING') {
            isEliminated = false;
            showCountdown(() => showScreen('screen-game'));
        } else if (currentGameState === 'FINISHED') {
            showEndScreen(payload.rankings);
        }
    });

    // Timer reçu du serveur — doit être dans connectSocket car socket est initialisé ici
    socket.on('timeUpdate', (timeRemaining) => {
        if (!joined) return;
        const el = document.getElementById('game-timer');
        if (!el) return;
        const mins = Math.floor(timeRemaining / 60);
        const secs = timeRemaining % 60;
        el.textContent = `${mins}:${secs.toString().padStart(2, '0')}`;
        el.classList.toggle('urgent', timeRemaining <= 10);
    });

    socket.on('state', (payload) => {
        const el = document.getElementById('lobby-players');
        if (el) el.textContent = `${payload.connectedPlayers} joueur${payload.connectedPlayers > 1 ? 's' : ''} prêt${payload.connectedPlayers > 1 ? 's' : ''}`;
    });

    socket.on('selfState', (payload) => {
        if (!joined) return;

        // Mise à jour position pour la mini-carte
        if (payload.x !== undefined) myX = payload.x;
        if (payload.y !== undefined) myY = payload.y;

        // Redessine la mini-carte si le compte à rebours est actif
        const cdown = document.getElementById('screen-countdown');
        if (cdown && !cdown.classList.contains('hidden')) drawMinimap();

        myScore = payload.score;
        document.getElementById('game-territory').textContent = payload.score;
        document.getElementById('indicator-boost').classList.toggle('active',  payload.boost);
        document.getElementById('indicator-shield').classList.toggle('active', payload.shield);

        // Son de boost au moment du pickup (false → true)
        if (payload.boost && !prevBoost) {
            boostAudio.currentTime = 0;
            boostAudio.play().catch(() => {});
        }
        prevBoost = payload.boost;

        if (!payload.alive && currentGameState === 'PLAYING' && !isEliminated) {
            isEliminated = true;
            showEliminatedScreen(payload.lastDeathReason, payload.score);
        }
    });
}

// ── Rejoindre la partie ────────────────────────────────────
function joinGame() {
    // Empêche le double-envoi si le joueur clique deux fois rapidement
    if (joined) return;

    const name    = document.getElementById('pseudo-input').value.trim();
    const errorEl = document.getElementById('error-msg');

    if (name.length < 2) {
        errorEl.textContent = 'Pseudo trop court (2 caractères min)';
        return;
    }

    errorEl.textContent = '';

    socket.emit('joinGame', { name, color: selectedColor }, (res) => {
        if (!res || !res.ok) {
            errorEl.textContent = 'Impossible de rejoindre la partie';
            return;
        }

        joined   = true;
        myPseudo = name;
        myNumId  = res.numId;

        // Avatar : initiale + couleur du joueur sur l'écran lobby
        const lobbyScreen = document.getElementById('screen-lobby');
        const gameScreen  = document.getElementById('screen-game');
        const avatarEl    = document.getElementById('lobby-avatar');
        if (lobbyScreen) lobbyScreen.style.setProperty('--player-color', selectedColor);
        if (gameScreen)  gameScreen.style.setProperty('--player-color', selectedColor);
        if (avatarEl)    avatarEl.textContent = name.charAt(0).toUpperCase();

        document.getElementById('lobby-name').textContent  = name;
        document.getElementById('lobby-name').style.color  = selectedColor;
        document.getElementById('game-pseudo').textContent = name;
        document.getElementById('game-pseudo').style.color = selectedColor;
        document.getElementById('end-pseudo').textContent  = name;
        document.getElementById('end-pseudo').style.color  = selectedColor;

        if (res.currentState === 'PLAYING') showScreen('screen-game');
        else                                showScreen('screen-lobby');
    });
}

// ── Écran d'élimination ────────────────────────────────────
function showEliminatedScreen(reason, score) {
    navigator.vibrate?.([150, 60, 150]);   // Double impulsion (plus perceptible sur Android)
    document.getElementById('elim-reason').textContent = reason || 'Tu as été éliminé';
    document.getElementById('elim-score').textContent  = score  || 0;
    showScreen('screen-eliminated');
}

// ── Écran de fin de partie ─────────────────────────────────
function showEndScreen(rankings) {
    if (!rankings) { showScreen('screen-end'); return; }

    // Recherche par numId (identifiant serveur unique) et non par name (peut être dupliqué)
    const myResult = rankings.find(r => r.numId === myNumId);

    if (myResult) {
        const medals  = ['🥇', '🥈', '🥉'];
        const rankStr = myResult.rank <= 3 ? medals[myResult.rank - 1] : `#${myResult.rank}`;
        document.getElementById('end-rank').textContent  = rankStr;
        document.getElementById('end-score').textContent = `${myResult.score} blocs capturés`;
    }

    showScreen('screen-end');
}

// ── Joystick NippleJS ──────────────────────────────────────
function initJoystick() {
    if (joystick) { joystick.destroy(); joystick = null; }

    setTimeout(() => {
        const zone = document.getElementById('joystick-area');
        // Sécurité : si le layout n'est pas encore prêt (téléphone lent), on retente
        if (!zone || zone.clientWidth === 0) {
            setTimeout(initJoystick, 150);
            return;
        }
        joystick = nipplejs.create({
            zone:     zone,
            mode:     'static',
            position: { left: '50%', top: '50%' },
            color:    selectedColor,
            size:     160,
        });

        let lastSend = 0;
        joystick.on('move', (_evt, data) => {
            const now = Date.now();
            if (now - lastSend < 33) return;
            lastSend = now;
            // Y inversé : NippleJS remonte = positif, serveur attend dy positif = bas
            socket.emit('playerInput', { x: data.vector.x, y: -data.vector.y });
        });

        // Relâchement : envoie (0,0) — le serveur conserve la dernière direction
        joystick.on('end', () => {
            socket.emit('playerInput', { x: 0, y: 0 });
        });
    }, 100);
}

// ── Mini-carte de repérage ─────────────────────────────────
function drawMinimap() {
    const canvas = document.getElementById('minimap-canvas');
    if (!canvas || !canvas.parentElement) return;

    // Résolution native (évite le flou sur écrans haute densité)
    const dpr      = window.devicePixelRatio || 1;
    const dispW    = canvas.parentElement.clientWidth;
    const dispH    = Math.round(dispW * 45 / 80);   // ratio de la grille 80×45
    canvas.style.width  = dispW + 'px';
    canvas.style.height = dispH + 'px';
    canvas.width        = Math.round(dispW * dpr);
    canvas.height       = Math.round(dispH * dpr);

    const ctx  = canvas.getContext('2d');
    ctx.scale(dpr, dpr);

    const COLS = 80, ROWS = 45;
    const cw   = dispW / COLS;
    const ch   = dispH / ROWS;

    // Fond
    ctx.fillStyle = '#040b18';
    ctx.fillRect(0, 0, dispW, dispH);

    // Grille
    ctx.strokeStyle = 'rgba(255,255,255,0.07)';
    ctx.lineWidth   = 0.5;
    for (let x = 0; x <= COLS; x += 10) {
        ctx.beginPath(); ctx.moveTo(x * cw, 0); ctx.lineTo(x * cw, dispH); ctx.stroke();
    }
    for (let y = 0; y <= ROWS; y += 10) {
        ctx.beginPath(); ctx.moveTo(0, y * ch); ctx.lineTo(dispW, y * ch); ctx.stroke();
    }

    // Zone de départ (territoire initial 5×5)
    const BASE = 2;
    ctx.fillStyle   = selectedColor + '30';
    ctx.strokeStyle = selectedColor + '70';
    ctx.lineWidth   = 1;
    ctx.fillRect  ((myX - BASE) * cw, (myY - BASE) * ch, (BASE * 2 + 1) * cw, (BASE * 2 + 1) * ch);
    ctx.strokeRect((myX - BASE) * cw, (myY - BASE) * ch, (BASE * 2 + 1) * cw, (BASE * 2 + 1) * ch);

    // Position exacte du joueur
    const px    = (myX + 0.5) * cw;
    const py    = (myY + 0.5) * ch;
    const dotR  = Math.max(6, Math.min(cw, ch) * 1.4);
    const haloR = dotR * 4;

    // Halo radial
    const grd = ctx.createRadialGradient(px, py, 0, px, py, haloR);
    grd.addColorStop(0, selectedColor + 'cc');
    grd.addColorStop(1, selectedColor + '00');
    ctx.beginPath();
    ctx.arc(px, py, haloR, 0, Math.PI * 2);
    ctx.fillStyle = grd;
    ctx.fill();

    // Disque joueur
    ctx.beginPath();
    ctx.arc(px, py, dotR, 0, Math.PI * 2);
    ctx.fillStyle   = selectedColor;
    ctx.fill();
    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth   = 2;
    ctx.stroke();

    // Label "TOI" au-dessus ou en-dessous selon la position
    const fontSize = Math.max(11, dispH * 0.075);
    ctx.font      = `bold ${fontSize}px Rajdhani, sans-serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    const below   = py < dispH / 2;            // espace dispo en dessous ?
    const arrow   = below ? '↓ TOI' : 'TOI ↑'; // flèche pointe vers le point
    const labelY  = below ? py + dotR + fontSize * 1.1 : py - dotR - fontSize * 1.1;
    ctx.shadowColor = 'rgba(0,0,0,0.8)';
    ctx.shadowBlur  = 6;
    ctx.fillStyle   = '#ffffff';
    ctx.fillText(arrow, px, labelY);
    ctx.shadowBlur  = 0;

    // Bordure canvas
    ctx.strokeStyle = 'rgba(255,255,255,0.15)';
    ctx.lineWidth   = 1;
    ctx.strokeRect(0.5, 0.5, dispW - 1, dispH - 1);
}

// ── Compte à rebours côté téléphone ───────────────────────
function showCountdown(callback) {
    const numEl    = document.getElementById('ctrl-cdown-num');
    const nameEl   = document.getElementById('cdown-pname');
    const swatchEl = document.getElementById('cdown-swatch');
    const screen   = document.getElementById('screen-countdown');

    // Couleur et nom du joueur sur l'écran de repérage
    if (nameEl)   nameEl.textContent = myPseudo;
    if (swatchEl) swatchEl.style.background = selectedColor;
    if (screen)   screen.style.setProperty('--player-color', selectedColor);

    showScreen('screen-countdown');
    drawMinimap();
    navigator.vibrate?.([80]);

    let count = 3;
    if (numEl) { numEl.textContent = count; numEl.className = 'ctrl-cdown-num'; }

    const iv = setInterval(() => {
        count--;
        if (count > 0 && numEl) {
            numEl.className = '';
            void numEl.offsetWidth;          // force reflow pour relancer l'animation
            numEl.className   = 'ctrl-cdown-num';
            numEl.textContent = count;
            navigator.vibrate?.([40]);
        } else if (count === 0 && numEl) {
            numEl.className   = 'ctrl-cdown-num go';
            numEl.textContent = 'GO !';
            navigator.vibrate?.([200]);
        } else {
            clearInterval(iv);
            // 1.5 s supplémentaires après GO! — le joueur voit sa position
            // avant de basculer sur le joystick (le freeze serveur dure 6 s au total)
            setTimeout(callback, 1500);
        }
    }, 1000);
}

// ── Lancement ─────────────────────────────────────────────
initColorGrid();
connectSocket();
