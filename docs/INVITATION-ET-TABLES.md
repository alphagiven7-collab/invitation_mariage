# Invitation et gestion des tables

## Évolution préparée

L'invitation reprend les composants existants dans cet ordre : invitation,
à propos, programme, tenue et couleurs, menu et boissons, cadeaux, livre d'or,
photos du couple, compte à rebours, lieux, confirmation de présence.

Le studio de personnalisation enregistre les lieux dans `venues`, dans le JSON
déjà utilisé pour chaque événement. Chaque lieu possède son type, son nom,
son adresse, son horaire et son lien GPS. En l'absence de ce nouveau tableau,
le lieu historique est conservé. Un tableau vide signifie qu'aucun lieu n'est
affiché. Le premier lieu reste disponible pour les anciennes fonctions PDF
et calendrier. Le menu repas est facultatif et les choix de boissons restent
indépendants du RSVP.

Les droits de personnalisation restent ceux de la plateforme. Les droits
existants de gestion des invités s'appliquent également aux tables.

## Migration approuvée — exécution Supabase en attente

Fichier : [SUPABASE-EVENT-TABLES.sql](SUPABASE-EVENT-TABLES.sql).

Cette migration a été approuvée par le client le 2 octobre 2026. Son exécution
sur Supabase reste à confirmer. Elle nécessite les migrations
`SUPABASE-PLATFORM-HARDENING.sql` et `SUPABASE-ORGANIZER-ACCESS.sql` déjà en place.
Elle s'exécute dans une transaction et peut être rejouée.

Elle ajoute :

- Un registre privé `event_tables` : événement, identifiant stable, nom/numéro,
  capacité facultative.
- Une colonne facultative `guests.table_id` et une contrainte interdisant de
  rattacher un invité à la table d'un autre événement.
- La reprise exacte des `table_number` existants, sans rapprochement des noms,
  sans transformation des groupes d'invités et sans capacité inventée.
- Des opérations transactionnelles de création, modification, suppression et
  affectation en groupe, réservées aux personnes qui gèrent cet événement.

Les noms des invités, contacts, identifiants, tokens, liens, réponses RSVP et
messages restent conservés. Le champ `table_number` reste présent et suit les
renommages pour que les invitations personnelles continuent à afficher la table.
Supprimer une table désaffecte ses invités, sans supprimer leurs fiches ;
l'interface demande confirmation avant cette opération.

### Places réservées

Une invitation affectée réserve ses adultes et enfants même avant confirmation.
Les réponses « absent » ne réservent aucune place. Une invitation sans effectif
valide réserve au minimum une place. La capacité est facultative et son
dépassement est signalé. Elle ne bloque pas une réponse RSVP.

### Mise en service

1. Validation du SQL et des règles ci-dessus obtenue le 2 octobre 2026.
2. Exécuter le fichier SQL complet dans le SQL Editor du projet Supabase concerné.
3. Publier les fichiers de l'application, puis vérifier la gestion des tables
   avec un compte autorisé et une invitation personnelle existante.

Avant activation SQL, la nouvelle interface conserve les anciens champs de table
et les fonctions existantes. Elle ne prétend pas avoir sauvegardé une table si
le serveur refuse la requête et n'utilise pas un stockage local comme remplacement
silencieux d'une base cloud indisponible.

## Vérifications locales

```powershell
npm.cmd test
npm.cmd run lint
npm.cmd run build
```

La migration est aussi exécutée sur une base PostgreSQL éphémère avec PGlite,
sans accès à la production :

```powershell
npm.cmd install --prefix "$env:TEMP/michelline-sql-check" @electric-sql/pglite@0.5.8
node tools/test-event-tables.cjs
```

Ces contrôles couvrent notamment la conservation des données, les droits par
événement, les affectations atomiques, les renommages et les RPC RSVP existantes.
Ils ne remplacent pas la vérification après application sur le projet Supabase.
