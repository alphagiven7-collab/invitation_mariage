# Configuration Supabase (Étape 3)

1. Créez un projet gratuit sur [supabase.com](https://supabase.com)
2. Allez dans **SQL Editor** → exécutez `docs/SUPABASE-SETUP.sql`
3. Copiez `assets/js/supabase-config.example.js` → `assets/js/supabase-config.js`
4. Remplissez :
   - `url` : Settings → API → Project URL
   - `anonKey` : Settings → API → anon public key
   - `enabled: true`
5. Insérez votre événement dans la table `events` :
   ```sql
   INSERT INTO events (id, slug, title, config_json)
   VALUES ('yanick-keren', 'yanick-keren', 'Mariage de Yanick et Keren', '{}');
   ```

Sans Supabase, la plateforme fonctionne en **localStorage** (mode démo).
