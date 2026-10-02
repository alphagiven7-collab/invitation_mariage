# Compatibilité et objectif financier

## Publication

Projet Vercel : `michelline-invitations`. Adresse de production :
https://michelline-invitations.vercel.app/.

## Styles et chargement

- Tailwind 3.4.19 génère des couleurs RGB et des transformations classiques, pour élargir la compatibilité par rapport aux prérequis de Tailwind 4. Garder `tailwind.config.cjs` au déploiement.
- `npm run build` reconstruit les styles. Augmenter le paramètre `v` des ressources modifiées et la version du service worker lors des publications.
- Les scripts de l’invitation sont différés et les bibliothèques d’icônes et de QR sont locales. Le QR se reconstruit avec `npm run build:qr`.
- Le cache ne traite ni les médias ni les requêtes Range. Les ressources versionnées en cache ne sont pas téléchargées à chaque visite.

## Musique

- Préchargement à la porte ; lecture dans le geste de l’invité, avant les tâches différées et l’animation.
- Les refus de lecture autorisent une nouvelle tentative aux gestes suivants. Une pause volontaire reste respectée, y compris quand le stockage de session est indisponible.
- Le bouton ♪ permet une action explicite. Un fichier MP3 direct évite le chargement supplémentaire du lecteur YouTube.
- Une lecture sonore sans action de l’utilisateur reste soumise aux règles du navigateur.

## Objectif global

Dans **Vos événements → Objectif financier global**, l’administrateur peut définir et modifier un montant positif en USD. La progression utilise les paiements reçus de tous les événements existants, indépendamment des filtres.

L’API `/api/event-billing?resource=goal` vérifie le rôle plateforme avant toute lecture ou écriture privée. L’objectif est conservé dans `platform-event-billing/_platform/goal.json`. Aucune migration SQL supplémentaire ; aucun montant public.

## Vérifications

- `npm test` et `npm run lint`.
- Scénarios locaux : `tools/qa-events.cjs` et `tools/qa-invitation-compat.cjs` (Playwright installé dans le dossier temporaire de QA).
- Mise en page et formulaires testés dans Chromium et WebKit à 360, 390 et 768 pixels ; paiement et objectif testés avec un service simulé.
- Lecture réelle vérifiée dans Chrome. Le moteur WebKit Windows testé refuse aussi un MP3 sur une page minimale sans l’application : la lecture sur Safari/iPhone physique reste à vérifier. Les règles de geste, de nouvelle tentative et de pause sont couvertes par des tests automatisés.
