# Configuration Supabase — Guide complet

## Étape A — Créer le projet (5 min)

1. Allez sur [supabase.com](https://supabase.com) → **Start your project**
2. Connectez-vous avec GitHub
3. **New project** :
   - Name : `invitation-mariage`
   - Database password : notez-le (gardez-le secret)
   - Region : choisissez la plus proche (ex. Frankfurt)
4. Attendez ~2 min que le projet soit prêt

## Étape B — Créer les tables (2 min)

1. Menu gauche → **SQL Editor** → **New query**
2. Copiez-collez tout le contenu de `docs/SUPABASE-SETUP.sql` → **Run**
3. Même chose avec `docs/SUPABASE-SEED.sql` → **Run**

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

1. Ouvrez l’admin : `pages/login.html?event=yanick-keren`
2. Code : `YANICK-CLIENT-2026`
3. Le bandeau doit afficher : **☁️ Supabase actif**
4. Importez un invité → vérifiez dans Supabase → **Table Editor** → `guests`

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
| Invités non visibles | Vérifiez `event_id = yanick-keren` |
