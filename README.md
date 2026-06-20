# WildBeast Chronicles — Guide de déploiement (PWA mobile)

Ce dossier contient le jeu complet, prêt à être hébergé en ligne et installé
sur écran d'accueil (Android et iPhone), avec mises à jour automatiques.

## 1. Héberger le jeu avec GitHub Pages (gratuit, le plus simple)

### Étape 1 — Créer un compte GitHub
Si tu n'en as pas déjà un : va sur https://github.com et crée un compte gratuit.

### Étape 2 — Créer un nouveau dépôt ("repository")
1. Clique sur le bouton **+** en haut à droite, puis **New repository**.
2. Donne-lui un nom, par exemple `wildbeast-chronicles`.
3. Laisse-le en **Public** (obligatoire pour GitHub Pages gratuit).
4. Ne coche aucune case d'initialisation (pas de README, pas de .gitignore).
5. Clique sur **Create repository**.

### Étape 3 — Mettre en ligne tous les fichiers de ce dossier
Sur la page de ton nouveau dépôt vide, GitHub propose un lien
**"uploading an existing file"** — clique dessus.

Glisse-dépose **TOUS** les fichiers et le dossier `icons/` de ce build
(`index.html`, `manifest.json`, `service-worker.js`, `version.json`, tous
les `.js`, et le dossier `icons` avec toutes les images dedans) dans la
zone de dépôt. Écris un message de commit (ex: "Premier déploiement"), puis
clique sur **Commit changes**.

⚠️ Important : la structure des dossiers doit être préservée. Le dossier
`icons/` doit rester un sous-dossier à la racine, pas être vidé dans le
même niveau que les fichiers .js.

### Étape 4 — Activer GitHub Pages
1. Dans ton dépôt, va dans l'onglet **Settings** (en haut).
2. Dans le menu de gauche, clique sur **Pages**.
3. Sous "Branch", choisis **main** et le dossier **/ (root)**, puis **Save**.
4. Attends 1 à 2 minutes. Une URL apparaît en haut de la page, du type :
   `https://TON-NOM-UTILISATEUR.github.io/wildbeast-chronicles/`

Cette URL est l'adresse définitive de ton jeu. C'est elle que ton fils
ouvrira sur son téléphone.

## 2. Installer le jeu sur le téléphone de ton fils

### Sur Android (Chrome)
1. Ouvre l'URL du jeu dans Chrome.
2. Une bannière "Ajouter à l'écran d'accueil" apparaît automatiquement en
   bas de l'écran (sinon : menu ⋮ en haut à droite → **Installer
   l'application** ou **Ajouter à l'écran d'accueil**).
3. Confirme. Une icône 🐾 apparaît sur l'écran d'accueil, comme une vraie
   application.

### Sur iPhone (Safari — uniquement Safari, pas Chrome)
1. Ouvre l'URL du jeu dans **Safari** (obligatoire sur iOS, les autres
   navigateurs ne permettent pas l'installation).
2. Appuie sur le bouton de partage (carré avec une flèche vers le haut).
3. Fais défiler et appuie sur **Sur l'écran d'accueil**.
4. Confirme avec **Ajouter**. L'icône 🐾 apparaît sur l'écran d'accueil.

Une fois installé, le jeu s'ouvre en plein écran, sans barre d'adresse,
exactement comme une application native.

## 3. Publier une mise à jour (à chaque fois que tu modifies le jeu)

Deux étapes à chaque mise à jour, dans cet ordre :

1. **Modifie le numéro de version** dans `version.json` :
   ```json
   { "version": "1.0.1", "buildDate": "2026-07-01" }
   ```
   Incrémente-le à chaque déploiement (1.0.0 → 1.0.1 → 1.0.2…), c'est ce
   nombre qui déclenche la détection de mise à jour sur le téléphone.

2. **Mets à jour les fichiers sur GitHub** : dans ton dépôt, ouvre chaque
   fichier modifié, clique sur l'icône crayon ✏️ pour l'éditer, colle le
   nouveau contenu, puis **Commit changes**. (Ou utilise l'option
   "Upload files" pour remplacer plusieurs fichiers d'un coup.)

### Que se passe-t-il côté téléphone ?
Le jeu utilise une stratégie "stale-while-revalidate" :
- Ton fils ouvre le jeu → il s'affiche **instantanément** depuis la version
  déjà installée sur son téléphone (même hors-ligne).
- En arrière-plan, le téléphone vérifie silencieusement `version.json` sur
  GitHub. Si le numéro a changé, il télécharge la nouvelle version sans
  rien interrompre.
- Une petite bannière apparaît en bas de l'écran : **"Une nouvelle version
  est disponible — Relancer maintenant"**. Il suffit d'appuyer dessus (ou
  simplement de fermer et rouvrir le jeu) pour basculer sur la mise à jour.

Donc : il n'a jamais besoin de réinstaller quoi que ce soit, juste de
relancer le jeu de temps en temps pour récupérer tes mises à jour.

## 4. Alternative : Netlify (encore plus simple, glisser-déposer)

Si GitHub te semble compliqué, Netlify permet un déploiement par simple
glisser-déposer, sans compte Git :
1. Va sur https://app.netlify.com/drop
2. Glisse le dossier complet de ce build dans la zone indiquée.
3. Une URL est générée immédiatement (ex: `random-name-123.netlify.app`).
4. Pour les mises à jour : reviens sur cette même page et glisse à nouveau
   le dossier mis à jour (avec le nouveau `version.json`).

## 5. Vérifications avant de partager l'URL

- Ouvre l'URL toi-même sur ton propre téléphone d'abord, pour confirmer
  que tout s'affiche et s'installe correctement avant de la donner à ton
  fils.
- Teste une fois hors-ligne (mode avion) après une première ouverture en
  ligne : le jeu doit continuer à fonctionner normalement.
- Le panneau Admin (engrenage ⚙️ en haut à droite) fonctionne aussi sur
  mobile si tu as besoin d'ajuster la configuration directement depuis le
  téléphone.

## Structure des fichiers de ce dossier

```
index.html          → page principale du jeu
manifest.json        → déclaration PWA (nom, icônes, couleurs)
service-worker.js    → mise en cache + détection de mise à jour
version.json          → numéro de version (à incrémenter à chaque déploiement)
database.js, state.js, engine.js, evolution.js, playerlevelup.js,
audio.js, gacha.js, ui.js, admin.js, save.js
                      → logique du jeu (inchangée fonctionnellement)
icons/                → icônes PWA (toutes tailles, Android + iOS)
```
