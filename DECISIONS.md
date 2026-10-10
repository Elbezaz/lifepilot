# Journal des décisions — LifePilot

Chaque décision : choix retenu, alternatives écartées, raison. Sources vérifiées le 10/10/2026.

## Architecture (MVP)

```
 Navigateur (ordinateur / smartphone)
        │  HTTPS
        ▼
 ┌─────────────────────────────── Application LifePilot (1 seul serveur Node.js) ─┐
 │  Interface React (tableau de bord, préférences, notifications)                 │
 │  API Express  ── /api/settings, /api/weather, /api/recommendation, /api/cron   │
 │     ├── modules/weather   → Open-Meteo (prévisions + géocodage, sans clé)      │
 │     ├── modules/outfit    → moteur de règles (source de vérité, testé)         │
 │     ├── modules/notify    → ntfy.sh (push vers l'app ntfy du téléphone)        │
 │     ├── modules/scheduler → décide "faut-il envoyer maintenant ?" (anti-doublon)│
 │     └── SQLite (data.db)  → 1 ligne de préférences + journal des envois        │
 └───────────────────────────────────────────────────────────────────────────────┘
        ▲  toutes les 10 min (réveil)
 GitHub Actions (cron gratuit, dépôt public) ── POST /api/cron/tick (avec secret)
```

Chaque futur cas d'usage (tâches, trajets…) = un nouveau module `server/modules/<nom>` + une section du tableau de bord. Le planificateur et les notifications sont déjà génériques.

## Décisions

| # | Sujet | Choix | Alternatives écartées | Raison |
|---|---|---|---|---|
| 1 | Stack | TypeScript, Express + React (Vite) + Tailwind, SQLite (Drizzle) | Next.js, Python/FastAPI, Cloudflare Workers | Une seule langue front/back, gabarit prêt et testé sur l'hébergeur retenu, zéro service externe à créer. |
| 2 | Hébergement | Site publié Perplexity (`*.pplx.app`) | Render, Fly.io, Railway, Cloudflare | Aucun compte ni carte bancaire à créer. Limite : le serveur se met en veille quand il est inactif → réveil externe nécessaire (décision 5). |
| 3 | Météo | Open-Meteo `/v1/forecast` + géocodage `geocoding-api.open-meteo.com/v1/search` | OpenWeatherMap, Météo-France | Gratuit, sans clé ; limites non commerciales : 600/min, 5 000/h, 10 000/jour, 300 000/mois ([conditions](https://open-meteo.com/en/terms)). Licence CC-BY 4.0 → attribution affichée dans l'app. Usage estimé : < 300 appels/jour. |
| 4 | Notifications | ntfy.sh (sujet secret, app Android/iPhone gratuite) | E-mail (compte SMTP/Resend nécessaire), Telegram (création de bot + jeton), Web Push | Aucun compte, fonctionne sur iPhone et Android, 250 messages/jour gratuits ([doc ntfy](https://docs.ntfy.sh/publish/)). Le nom du sujet sert de mot de passe : il est généré aléatoirement. |
| 5 | Planification | Double déclencheur : minuterie interne (chaque minute quand le serveur est éveillé) + GitHub Actions toutes les 10 min qui réveille le serveur | cron-job.org (compte requis), cron interne seul (s'arrête en veille), dépôt privé (2 000 min/mois insuffisantes : 4 320 exécutions/mois) | Gratuit et sans nouveau compte. GitHub prévient que les tâches planifiées peuvent être retardées en période de charge et sont désactivées après 60 jours sans activité sur un dépôt public ([doc GitHub](https://docs.github.com/en/actions/reference/workflows-and-actions/events-that-trigger-workflows)). |
| 6 | Heure d'envoi | Fenêtre de rattrapage de 3 h + 1 envoi max par jour local (verrou en base) | Envoi uniquement à la minute exacte | Résiste aux retards du réveil, aux redémarrages et aux doublons. |
| 7 | Fuseau / changement d'heure | Fuseau IANA de la ville (ex. `Europe/Paris`) via `Intl` | Heure UTC fixe | Le passage heure d'été/hiver est géré automatiquement ; heure inexistante (printemps) → envoi à la première minute valide ; heure doublée (automne) → verrou journalier. |
| 8 | IA générative | Non intégrée au MVP | Reformulation par LLM | Le texte des règles est déjà clair ; une IA ajouterait coût, clé API, latence et risque d'erreur sans gain réel. L'architecture permet de l'ajouter (le moteur reste la source de vérité). |
| 9 | Web Push | Non intégré au MVP | Web Push (VAPID) | ntfy couvre ordinateur + mobile. Sur iPhone le Web Push exige iOS 16.4+ ET l'ajout du site à l'écran d'accueil : moins fiable pour un premier canal. |
| 10 | Protection | Code d'accès (variable `ACCESS_CODE`) + secret de réveil (`CRON_SECRET`) | Comptes utilisateurs | Mono-utilisateur : un code suffit ; rien dans Git. |
| 11 | RGPD | Stockés : ville, coordonnées arrondies (~1 km), préférences, heure, sujet ntfy, journal des 30 derniers envois. Pas de nom, e-mail, ni historique de position. Bouton « Supprimer mes données ». | Stocker la géolocalisation précise | Minimisation des données. |
| 12 | Tests | `node:test` via `tsx` (aucune dépendance en plus) | Jest, Vitest | Intégré à Node 20, suffisant. |
| 13 | Panne météo | Délai max 8 s + 1 nouvel essai ; cache de la dernière prévision (≤ 3 h, même jour) ; sinon message clair à l'écran ; la notification réessaie à chaque réveil puis, après 2 h d'échec, envoie un message « météo indisponible » au lieu d'un conseil inventé. | Afficher des valeurs par défaut | Ne jamais inventer de météo. |
