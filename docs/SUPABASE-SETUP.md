# Configuration Supabase — Guide complet

## Étape A — Créer le projet (5 min)

1. Allez sur [supabase.com](https://supabase.com) → **Start your project**
2. Connectez-vous avec GitHub
3. **New project** :
   - Name : `invitation-mariage`
   - Database password : notez-le (gardez-le secret)
   - Region : choisissez la plus proche (ex. Frankfurt)
4. Attendez ~2 min que le projet soit prêt

## Étape B — Créer les tables et sécuriser la production

1. Menu gauche → **SQL Editor** → **New query**
2. Exécutez `docs/SUPABASE-SETUP.sql` pour créer les tables.
3. Exécutez `docs/SUPABASE-SEED.sql` seulement pour installer les exemples de démonstration.
4. Dans **Authentication → Users**, créez d'abord le compte e-mail/mot de passe de chaque client organisateur.
5. Exécutez `docs/SUPABASE-AUTH-FOUNDATION.sql` pour créer les profils et la colonne propriétaire.
6. Marquez votre propre compte comme plateforme, suivant l'instruction SQL à la fin de ce fichier.
7. Exécutez `docs/SUPABASE-RLS-CORE.sql` pour activer les accès isolés, les RPC invités, les RSVP et la création transactionnelle.
8. Exécutez `docs/SUPABASE-STORAGE-RLS.sql` pour autoriser les images et musiques uniquement au propriétaire de l'événement.

`SUPABASE-SETUP.sql` crée volontairement des politiques de démarrage permissives. Ne laissez jamais ce script comme dernière étape sur un projet exposé : `SUPABASE-RLS-CORE.sql` est obligatoire avant toute mise en production.

## Étape C — Récupérer vos clés (1 min)

1. Menu gauche → **Project Settings** (engrenage)
2. **API**
3. Copiez :
   - **Project URL** → ex. `https://xxxxx.supabase.co`
   - **anon public** key → longue chaîne `eyJ...`

## Étape D — Brancher le site (2 min)

### Option 1 — Page assistée (recommandé)
Ouvrez : `pages/setup-supabase.html` sur votre site local ou en ligne, entrez URL + clé, testez.

### Option 2 — Fichier manuel
Éditez `assets/js/supabase-config.js` :

```javascript
window.SUPABASE_CONFIG = {
    enabled: true,
    url: "https://VOTRE-PROJET.supabase.co",
    anonKey: "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."
};
```

Puis :
```powershell
git add assets/js/supabase-config.js
git commit -m "Enable Supabase cloud database"
git push origin main
```

## Étape E — Vérifier

1. Connectez-vous avec le compte plateforme et créez un événement avec l'e-mail d'un compte client existant.
2. Connectez-vous ensuite depuis un téléphone ou un autre navigateur avec le compte client et ouvrez `pages/admin.html?event=slug`.
3. Modifiez un texte et importez une image ou une musique, puis ouvrez le lien invité dans une fenêtre privée : les modifications doivent apparaître.
4. Ajoutez un invité, ouvrez son lien tokenisé, envoyez un RSVP, validez le QR depuis l'admin puis scannez-le avec `pages/checkin.html?event=slug`.

## Sécurité

- La clé **anon** peut être publique si RLS est activé (déjà fait dans SUPABASE-SETUP.sql)
- Ne partagez **jamais** la clé `service_role`
- Ne commitez **jamais** le mot de passe base de données

## Dépannage

| Problème | Solution |
|----------|----------|
| "Mode local" affiché | `enabled: true` + push GitHub |
| Erreur 401/403 | Vérifiez anon key + RLS policies |
| Table introuvable | Relancez SUPABASE-SETUP.sql |
| Invités non visibles | Vérifiez l'identifiant de l'événement concerné |
