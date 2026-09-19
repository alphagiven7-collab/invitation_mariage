# Configuration Supabase — installation sécurisée

Ce guide décrit l’unique ordre d’installation pris en charge. Il faut terminer
toutes les étapes SQL avant de rendre le site public. Les scripts historiques
de correction ne doivent pas être exécutés après cette procédure.

## 1. Créer le projet

1. Créez un projet sur [Supabase](https://supabase.com).
2. Conservez le mot de passe de base et la clé `service_role` hors du dépôt.
3. Relevez uniquement l’URL du projet et la clé `anon` pour le site.

## 2. Installer une nouvelle base

Dans **SQL Editor**, exécutez les fichiers dans cet ordre précis :

1. `docs/SUPABASE-SETUP.sql` — tables de base.
2. `docs/SUPABASE-SEED.sql` — facultatif, seulement pour les données de démonstration.
3. Créez les comptes des organisateurs dans **Authentication → Users**.
4. `docs/SUPABASE-AUTH-FOUNDATION.sql` — profils et propriétaire d’événement.
5. Désignez le compte plateforme avec l’instruction SQL à la fin de ce fichier.
6. `docs/SUPABASE-GUEST-EXTRAS.sql` — table, boissons, photo et code QR invité.
7. `docs/SUPABASE-RLS-CORE.sql` — isolation des événements et RPC invitées.
8. `docs/SUPABASE-PLATFORM-HARDENING.sql` — correctifs RSVP, livre d’or, règles RLS et confidentialité.
9. `docs/SUPABASE-GUEST-IMPORT.sql` — contrainte de nom unique par événement.
10. `docs/SUPABASE-STORAGE-RLS.sql` — droits Storage par propriétaire.

`SUPABASE-SETUP.sql` contient des politiques de démarrage historiques. Il ne
doit jamais être la dernière étape d’une installation exposée. La migration
`SUPABASE-PLATFORM-HARDENING.sql` est obligatoire : elle remplace les anciens
correctifs permissifs et rétablit les politiques strictes.

## 3. Base déjà existante

1. Faites une sauvegarde depuis **Database → Backups** ou avec `pg_dump` avant toute migration.
2. Vérifiez que `SUPABASE-AUTH-FOUNDATION.sql` et `SUPABASE-RLS-CORE.sql` ont déjà été exécutés.
3. Exécutez immédiatement `docs/SUPABASE-PLATFORM-HARDENING.sql` pour fermer les accès publics historiques et restaurer les RPC sûres.
4. Ouvrez l’administration et examinez les doublons d’invités. Conservez une fiche par nom ; privilégiez une fiche confirmée, puis une fiche avec contact. Toute suppression doit être confirmée dans l’interface.
5. Exécutez `docs/SUPABASE-GUEST-IMPORT.sql`. S’il s’arrête, son détail liste les noms à résoudre ; aucune donnée n’a été modifiée.
6. Vérifiez les politiques et les fonctions avec les requêtes de contrôle situées à la fin de la migration.

Ne tentez pas de contourner un doublon en modifiant la contrainte SQL ou en
supprimant une ligne directement dans la base sans sauvegarde. L’outil
« Gestion des invités » fournit le parcours de revue prévu à cet effet.

## 4. Scripts remplacés

Ne lancez pas ces fichiers après le verrouillage RLS :

- `SUPABASE-FIX-DELETE.sql`
- `SUPABASE-RELIABILITY-MIGRATION.sql`
- `SUPABASE-RSVP-INTEGRITY.sql`
- `SUPABASE-OPEN-RSVP.sql`
- `SUPABASE-EVENT-SETTINGS.sql`
- `SUPABASE-CHECK-INS.sql`

Ils appartiennent à des étapes antérieures et certains réintroduisent des
politiques `USING (true)` ou des RPC RSVP incomplètes. Leur rôle est couvert
par `SUPABASE-RLS-CORE.sql` et `SUPABASE-PLATFORM-HARDENING.sql`.

Utilisez uniquement `SUPABASE-STORAGE-RLS.sql` pour le bucket `event-assets`.
Le fichier `SUPABASE-STORAGE.sql` n’est pas la procédure d’installation active.

## 5. Brancher le site

Configurez `assets/js/supabase-config.js` :

```javascript
window.SUPABASE_CONFIG = {
    enabled: true,
    url: "https://VOTRE-PROJET.supabase.co",
    anonKey: "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."
};
```

La clé `anon` peut être présente dans une application web seulement si les
politiques RLS et les RPC de la procédure ci-dessus sont actives. Ne publiez
jamais `service_role`, le mot de passe de base ou un jeton d’administrateur.

## 6. Vérification avant production

Exécutez dans SQL Editor :

```sql
SELECT tablename, policyname, cmd, qual, with_check
FROM pg_policies
WHERE schemaname = 'public'
  AND tablename IN (
    'events', 'guests', 'rsvps', 'event_settings',
    'guestbook_messages', 'analytics_events', 'check_ins'
  )
ORDER BY tablename, policyname;

SELECT routine_name
FROM information_schema.routines
WHERE routine_schema = 'public'
  AND routine_name IN (
    'submit_guest_rsvp', 'get_public_rsvp_messages',
    'get_public_guestbook_messages', 'post_guestbook_message',
    'replace_managed_guests'
  )
ORDER BY routine_name;
```

Puis testez dans une fenêtre privée :

1. Une invitation personnelle avec réponse `oui`, message et téléphone vide.
2. Une invitation personnelle avec réponse `non`.
3. L’affichage du message RSVP personnel et, si activé, du RSVP ouvert, ainsi que du livre d’or après rechargement depuis un second navigateur.
4. Un événement non publié : aucune configuration, invitation ou liste de messages ne doit être accessible publiquement.
5. Un import CSV contenant un nom déjà présent, une ligne vide, des accents et un champ `Couple Nom`.
6. Le remplacement de liste : les réponses RSVP `oui` et `non`, avec ou sans téléphone, doivent rester présentes.

## 7. Dépannage

| Problème | Action sûre |
|---|---|
| Doublons signalés par `SUPABASE-GUEST-IMPORT.sql` | Les examiner dans l’administration, confirmer les suppressions nécessaires, puis relancer le script. |
| Erreur 401/403 côté organisateur | Vérifier la session Auth et les politiques après la migration canonique ; ne pas appliquer de politique `USING (true)`. |
| RSVP ou livre d’or refusé | Vérifier que l’événement est publié et que `SUPABASE-PLATFORM-HARDENING.sql` a été exécuté. |
| Invitation personnelle sans token | Elle doit être refusée ; utilisez le lien individuel généré depuis Gestion des invités. |
| Import de remplacement interrompu | Ne modifiez pas le cache local. La RPC `replace_managed_guests` annule toutes ses écritures en cas d’erreur. |
