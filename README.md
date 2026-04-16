# CHROMATRACE — Jeu multijoueur temps réel

CHROMATRACE est un **jeu complet de conquête de territoire** en temps réel.

- **Projecteur / écran principal** : rendu Phaser + interface admin
- **Manette mobile** : pilotage du joueur via smartphone
- **Serveur Node.js + Socket.io** : simulation, collisions, captures, items, leaderboard

---

## 1) Livrables du dépôt

Ce dépôt fournit :

1. **Code source** du jeu
2. **Exécutable serveur** (via script de démarrage)
3. **Manuel d'installation**
4. **Manuel de maintenance / exploitation**
5. **Procédure de déploiement Railway**

---

## 2) Stack technique

- Node.js
- Express
- Socket.io
- Phaser 3
- HTML / CSS / JavaScript

---

## 3) Prérequis

- **Node.js 18+** recommandé
- **pnpm** installé globalement

Installer pnpm si nécessaire :

```bash
npm install -g pnpm
```

---

## 4) Installation locale (obligatoire)

Avant tout lancement du jeu :

```bash
pnpm install
```

---

## 5) Exécution locale

Lancer le serveur :

```bash
pnpm start
```

Puis ouvrir :

- Projecteur / admin : `http://localhost:3000/`
- Manette mobile : `http://localhost:3000/controller.html`

Mode dev (actuellement équivalent à start) :

```bash
pnpm dev
```

---

## 6) Exécutable

### Exécutable script (recommandé)

- Entrée : `server.js`
- Commande :

```bash
pnpm start
```

### Option binaire Windows (.exe) — facultative

Si un exécutable natif est requis dans un contexte spécifique :

```powershell
pnpm dlx pkg . --targets node20-win-x64 --output dist\chromatrace-server.exe
```

Lancement :

```powershell
.\dist\chromatrace-server.exe
```

> En production Railway, l'approche recommandée reste le déploiement Node standard (sans binaire).

---

## 7) Structure du code source

```text
finale-main/
├── config/
│   └── constants.js
├── game/
│   ├── items.js
│   ├── physics.js
│   ├── players.js
│   ├── state.js
│   └── utils.js
├── public/
│   ├── assets/
│   ├── css/
│   ├── js/
│   │   ├── controller.js
│   │   ├── main.js
│   │   ├── phaser-effects.js
│   │   ├── phaser-renderer.js
│   │   ├── phaser-scene.js
│   │   └── qr.js
│   ├── controller.html
│   └── index.html
├── server.js
├── package.json
└── README.md
```

---

## 8) Déploiement Railway

### 8.1 Déploiement depuis GitHub

1. Pousser le projet sur GitHub
2. Railway → **New Project**
3. **Deploy from GitHub Repo**
4. Sélectionner le dépôt

### 8.2 Configuration build/start

- **Build Command**

```bash
pnpm install
```

- **Start Command**

```bash
pnpm start
```

### 8.3 Variables d'environnement

- `PORT` : injecté automatiquement par Railway
- `NODE_ENV=production` recommandé

### 8.4 Vérification après déploiement

- Ouvrir l'URL Railway (racine `/`) pour le projecteur
- Ouvrir `.../controller.html` pour les manettes
- Vérifier qu'un joueur rejoint et que l'état se met à jour en temps réel

---

## 9) Manuel de maintenance

### 9.1 Supervision basique

- Vérifier que le process écoute le port fourni par Railway
- Vérifier les connexions Socket.io côté projecteur/manette

### 9.2 Logs

Dans Railway :

- Ouvrir **Deployments / Logs**
- Contrôler : démarrage serveur, erreurs runtime, connexions socket

### 9.3 Procédure de mise à jour

1. Modifier le code
2. Lancer les vérifications locales
3. Commit + push GitHub
4. Laisser Railway redéployer automatiquement

### 9.4 Mise à jour dépendances

```bash
pnpm outdated
pnpm up
pnpm install
pnpm start
```

### 9.5 Procédure d'incident (rapide)

1. Vérifier les logs Railway
2. Vérifier configuration/env
3. Redéployer le dernier commit stable
4. Si nécessaire, rollback sur commit précédent

---

## 10) Commandes principales

```bash
pnpm install
pnpm start
pnpm dev
```

---

## 11) Notes d'exploitation

- En local : smartphone et machine serveur doivent être sur le même réseau
- En production : utiliser l'URL publique Railway
- Les performances perçues dépendent de la latence réseau (Socket.io temps réel)

---

## 12) Licence

À définir selon votre politique de distribution (MIT, propriétaire, etc.).
