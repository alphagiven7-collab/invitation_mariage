# Nom de domaine personnalisé (Étape 8)

## GitHub Pages + domaine perso

1. Achetez un domaine (Namecheap, OVH, Google Domains…)
2. Dans GitHub : repo → **Settings** → **Pages** → **Custom domain**
3. Entrez : `invitation.votredomaine.com`
4. Chez votre registrar, ajoutez un enregistrement **CNAME** :
   - Nom : `invitation` (ou `@`)
   - Valeur : `alphagiven7-collab.github.io`

## DNS type A (domaine racine)

| Type | Nom | Valeur |
|------|-----|--------|
| A | @ | 185.199.108.153 |
| A | @ | 185.199.109.153 |
| A | @ | 185.199.110.153 |
| A | @ | 185.199.111.153 |
| CNAME | www | alphagiven7-collab.github.io |

Attendez 24–48 h pour la propagation DNS.
