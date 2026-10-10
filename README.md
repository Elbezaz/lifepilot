# LifePilot

Assistant personnel : chaque matin, une recommandation vestimentaire basée sur la météo réelle (Open-Meteo), envoyée sur votre téléphone (ntfy).

## Utiliser
1. Ouvrez l'application et entrez votre **code d'accès**.
2. **Préférences** : choisissez votre ville (ou « Ma position »), votre sensibilité au froid, votre mode de déplacement, votre style de tenue et vos heures dehors → **Enregistrer**.
3. **Notifications** : installez l'app gratuite **ntfy** ([iPhone](https://apps.apple.com/us/app/ntfy/id1625396347), [Android](https://play.google.com/store/apps/details?id=io.heckel.ntfy)), abonnez-vous au nom de canal affiché, touchez « Envoyer une notification de test », puis activez la notification quotidienne et choisissez l'heure.
4. **Aujourd'hui** : météo vérifiée, conseil du jour, évolution heure par heure.

## Modifier
- Règles vestimentaires : `server/modules/outfit.ts` (seuils en haut du fichier). Tests : `tests/outfit.test.ts`.
- Météo : `server/modules/weather.ts` · Notifications : `server/modules/notify.ts` · Planification : `server/modules/daily.ts`, `time.ts`.
- Interface : `client/src/pages/` (une page par écran).
- Nouveau cas d'usage (tâches, trajets…) : un module dans `server/modules/`, une route dans `server/routes.ts`, une page dans `client/src/pages/`.

## Lancer en local
```bash
npm ci
cp .env.example .env    # puis remplir ACCESS_CODE et CRON_SECRET
npm run dev             # http://localhost:5000
npm test                # tests automatiques
```

## Mettre à jour la version en ligne
1. Modifier le code, lancer `npm test`, puis `npm run build`.
2. Republier le site (demandez-le à l'assistant : « republie LifePilot »).
3. Après une republication, vérifiez vos préférences : les données locales peuvent être réinitialisées.

## Variables d'environnement (jamais dans Git)
| Variable | Rôle |
|---|---|
| `ACCESS_CODE` | Code demandé à l'ouverture |
| `CRON_SECRET` | Secret du réveil GitHub Actions (aussi enregistré comme secret GitHub `LIFEPILOT_CRON_SECRET`) |
| `NTFY_SERVER` | Serveur ntfy (défaut `https://ntfy.sh`) |
| `APP_URL` | Lien ouvert depuis la notification (optionnel) |

Réveil automatique : `.github/workflows/tick.yml` (toutes les 10 min, secrets `LIFEPILOT_API_URL` et `LIFEPILOT_CRON_SECRET`). Choix techniques : voir `DECISIONS.md`. Données météo © Open-Meteo.com, licence CC BY 4.0.
