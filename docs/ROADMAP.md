# Roadmap technique — Plateforme multi-événements

## État actuel (V1 hébergée)
- Invitation publique sur GitHub Pages
- Personnalisation locale (localStorage)
- RSVP / livre d'or en localStorage (par appareil)
- Mode concepteur + page personnalisation

## Phase 1 — Fondations (implémentée en partie)
| Fichier | Rôle |
|---|---|
| `events/*.json` | Configuration par événement (mariage, anniversaire…) |
| `assets/js/event-config.js` | Charge `?event=slug` + applique textes/couleurs |
| `assets/js/guest-manager.js` | Invités, tokens, liens, import CSV |
| `assets/js/db.js` | Stockage local scopé par événement |
| `pages/admin.html` | Dashboard organisateur (invités + liens) |
| `docs/DATABASE-SCHEMA.sql` | Schéma SQLite prêt pour backend |

## Phase 2 — Gestion 100+ invités (implémentée en partie)
| Fonction | Où |
|---|---|
| Import CSV | `admin.html` → `admin.js` |
| Lien unique par invité | `guest-manager.js` → `?event=&guest=&t=` |
| WhatsApp 1 clic | `admin.js` |
| Export CSV liens | `admin.js` |
| Suivi RSVP par invité | `guest-manager.js` + `app.js` |

## Phase 3 — À faire (backend requis)
- [ ] API REST (Node/Python) + SQLite ou Supabase
- [ ] Auth client (email/mot de passe)
- [ ] RSVP centralisé (tous appareils)
- [ ] Livre d'or centralisé
- [ ] Relances automatiques
- [ ] Anti-spam (captcha, rate limit)

## Phase 4 — Produit commercial
- [ ] Duplication événement 1 clic
- [ ] Templates (mariage, anniversaire, conférence)
- [ ] Domaine personnalisé
- [ ] Analytics
- [ ] PWA + multilingue

## URLs types

```
Invitation invité :
/pages/invitation.html?event=yanick-keren&guest=marie-kasongo&t=AbX92kPq

Dashboard organisateur :
/pages/admin.html?event=yanick-keren

Personnalisation :
/pages/personnalisation.html?event=yanick-keren
```

## Migration localStorage → SQLite

1. Déployer API (`/api/events`, `/api/guests`, `/api/rsvp`)
2. Remplacer `GuestManager` local par appels fetch
3. Garder même structure JSON que `events/*.json`
4. Exporter localStorage existant via bouton admin
