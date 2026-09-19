# Gestion des invités : diagnostic et validation

## Architecture examinée

- `pages/admin.html` et `assets/js/admin.js` : fichier choisi, import, remplacement, liste, édition, suppressions et exports.
- `assets/js/guest-manager.js` : cache par événement, stockage local, parsing, création, rapprochement et suppression.
- `assets/js/cloud-api.js` : REST Supabase, pagination, écritures, erreurs et RPC de suppression ; adaptateur Django consulté.
- Schémas SQL invités, RSVP et présences : identifiants, unicité `(event_id, slug)`, références et RPC `delete_managed_guest`.
- Scripts des invitations, RSVP, présence et service worker ; tests existants.

## Causes constatées avant correction

1. Le parseur reconnaissait uniquement la virgule et ignorait `contact`. Les lignes vides et sans nom disparaissaient avant le comptage. La validation des guillemets et du nombre de colonnes était insuffisante.
2. `createGuest` fournit un ID local ; la version locale de `upsertGuest` traitait tout ID comme une mise à jour, puis retournait un échec si le PATCH ne trouvait rien. Les nouveaux invités ne pouvaient donc pas être insérés par ce chemin.
3. Les erreurs d'import étaient remplacées par `null`, puis un total générique, sans explication par ligne. Les variantes de payload pouvaient abandonner des champs optionnels.
4. La lecture Supabase n'était pas paginée, d'où un risque de liste tronquée et de doublons non détectés.
5. Le rapprochement reposait sur le slug du nom : homonymes exclus, téléphones non comparés, noms modifiés pouvant échapper au contrôle.
6. `removeDuplicateGuests` existait dans le fichier local, sans commande reliée dans l'interface. Les recherches Git sur toutes les références disponibles (`-S removeDuplicateGuests`, `-S doublons`) n'ont retrouvé aucun commit de cette fonctionnalité. Les commits `7512ead` et `95a0f90` documentent les évolutions CSV et sélection groupée ; il n'est pas possible d'attribuer la disparition du bouton à un commit retrouvé.

## Comportement corrigé

- Virgule, point-virgule, tabulation ; champs cités, guillemets échappés, retours dans les cellules ; UTF-8, UTF-16 avec BOM et Windows-1252.
- Aperçu avant écriture : total hors en-tête, invités importables, doublons, rejets avec numéro de ligne et raison. Un retour final n'ajoute pas une ligne fictive ; les retours dans une cellule citée restent dans un seul enregistrement.
- Comparaison prudente : nom normalisé en Unicode NFC, casse et espaces ; le préfixe `Couple` désigne la même identité. Un nom normalisé est unique par événement, quel que soit le contact ; les accents ne sont pas supprimés et aucun pays n'est deviné. Le téléphone reste facultatif, est normalisé avant la revue et sert seulement à suggérer la fiche à conserver.
- Nouveau contrôle au moment de l'import, blocage des imports simultanés dans la page, unicité d'un nom normalisé par événement et insertions cloud explicites sans écraser les RSVP.
- Détection visible, examen des fiches et sélection des doublons sans numéro lorsqu'une fiche du même nom en possède un. Confirmation exigée, nouvelle détection avant suppression, obligation de conserver au moins une fiche par groupe. Aucune donnée réelle n'a été supprimée pendant les travaux.
- Comptes réels d'écriture, erreurs détaillées et échecs partiels affichés. Une panne de rafraîchissement ne masque pas le résultat d'import.

## Validation et déploiement

- `npm.cmd test` : suite complète CSV, doublons, cloud et aperçu ; tous les tests exécutés doivent réussir avant déploiement.
- `npm.cmd run lint` : ESLint sur les scripts, API et tests ; aucune erreur.
- `npm.cmd run build` : compilation CSS Tailwind réussie ; fichier généré conservé.
- Tests cloud simulés, sans écriture dans une base réelle.

À vérifier dans l'environnement cible :

1. Exécuter d'abord `docs/SUPABASE-PLATFORM-HARDENING.sql`, puis appliquer `docs/SUPABASE-GUEST-IMPORT.sql`. Cette dernière refuse explicitement les doublons historiques, sans les modifier, puis crée l'index unique par nom normalisé et événement. Résoudre les groupes signalés dans l'interface avant de la relancer ; tester aussi deux imports simultanés dans des événements distincts.
2. Vérifier la présence de `docs/SUPABASE-GUEST-EXTRAS.sql` pour les colonnes table et extras. La migration canonique fournit les RPC RSVP, les suppressions autorisées et le remplacement transactionnel. Les migrations n'ont pas été exécutées sur Supabase ici.
3. Tester visuellement sur mobile et ordinateur l'aperçu, l'annulation, la sélection et la confirmation avec des données de test, ainsi qu'une session expirée et un CSV de plus de 1 000 invités.
4. Examiner les doublons ayant le même nom avant toute suppression, notamment lorsqu'ils possèdent tous un numéro. Les numéros locaux et internationaux ne sont pas rapprochés automatiquement sans pays explicite.
5. Si le backend Django alternatif est activé, vérifier ses règles d'insertion côté serveur ; son implémentation n'est pas dans ce dépôt.
