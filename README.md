# Invitation Mariage — Plateforme multi-événements

> **Live :** https://alphagiven7-collab.github.io/invitation_mariage/  
> **Repo :** https://github.com/alphagiven7-collab/invitation_mariage  
> **Code local :** `Z:\projets\invitation de mariages`  
> **Dernière mise à jour doc :** juin 2026

---

## Codes d'accès (machine)

| Rôle | Code | Usage |
|------|------|--------|
| **Super admin / concepteur plateforme** | `YANICK-KEREN-ADMIN` | Login admin (`login.html`) **ou** bouton « Mode concepteur » sur l'invitation |
| **Client — Mariage Yanick & Keren** | `YANICK-CLIENT-2026` | Login → admin invités (`login.html?event=yanick-keren`) |
| **Client — Conférence tech** | `CONF-TECH-2026` | `login.html?event=conference-tech-2026` |
| **Client — Anniversaire Grace** | `GRACE-BDAY-2026` | `login.html?event=anniversaire-grace` |

### URLs utiles

| Page | URL |
|------|-----|
| Invitation invité | `/pages/invitation.html?event=yanick-keren` |
| Lien invité (exemple) | `?event=yanick-keren&guest=slug-invite&t=TOKEN` |
| Personnalisation | `/pages/personnalisation.html?event=yanick-keren` |
| Admin invités | `/pages/login.html?event=yanick-keren` → code client |
| Setup Supabase | `/pages/setup-supabase.html` |

### Supabase (cloud)

- **URL projet :** `https://qotolnmwoceahrnldlbw.supabase.co`
- **Config :** `assets/js/supabase-config.js`
- **Migration personnalisation cloud :** exécuter `docs/SUPABASE-EVENT-SETTINGS.sql` dans le SQL Editor Supabase
- **Schéma complet :** `docs/SUPABASE-SETUP.sql` + `docs/SUPABASE-SEED.sql`

---

## État actuel du produit (V1)

### Ce qui fonctionne

- Invitation premium (accueil personnalisé, RSVP, QR code)
- Programme du jour, lieu/GPS/carte Google, infos pratiques (personnalisables)
- Personnalisation : textes, photos, couleurs, date, musique de fond, aperçu live
- Sync cloud personnalisation (`event_settings` + `DashboardSync`)
- Export calendrier `.ics` (« Ajouter au calendrier »)
- Admin invités : CSV, liens uniques, WhatsApp, édition, suppression
- Supabase : invités, RSVP, livre d'or, analytics (partiel)
- PWA, dark mode, compte à rebours, multilingue (base)

### Limites actuelles (pas encore SaaS)

- **Pas d'inscription client** (email / mot de passe)
- **Pas de création d'événement** self-service (fichier `events/*.json` + GitHub)
- **Personnalisation ouverte** (pas de login obligatoire)
- **Pas d'isolation tenant** stricte (RLS Supabase trop ouvert en prod)
- **Pas de console super admin** (validation, quotas, vue globale)
- **Pas de check-in jour J** (scan staff)

---

## Parcours utilisateur aujourd’hui

### Organisateur (client)

1. **Pas d'inscription** — accès par **code admin** sur `login.html`
2. **Personnalisation** via `personnalisation.html` (sans compte)
3. **Gestion invités** via `admin.html` après login
4. **Partage** des liens générés aux invités

### Invité

- Reçoit un lien unique → **aucun compte**
- RSVP + QR après validation

### Concepteur / vous

- Code `YANICK-KEREN-ADMIN` → accès admin global + mode concepteur invitation

---

## Roadmap SaaS — Plan validé (implémentation demain+)

### Vision

Plateforme **multi-tenant** où chaque client ne voit **que son événement et ses invités**, avec **inscription obligatoire**, et **super admin** qui valide avant publication — objectif : **dépasser Zola / Joy + apps check-in seules** (invitation + RSVP + QR + scan jour J).

### Rôles cibles

| Rôle | Accès |
|------|--------|
| **Super admin** | Tous événements, validation, quotas participants, modération |
| **Client** | Uniquement ses événements + invités + réglages |
| **Staff check-in** (V3) | Scan QR, 1 événement |
| **Invité** | Lien tokenisé, pas de compte |

### Workflow événement (futur)

```
draft → pending_review → approved → live → archived
         ↑ super admin approuve / refuse
```

### Phases d'implémentation

| Phase | Contenu | Délai estimé |
|-------|--------|--------------|
| **A — SaaS** | Supabase Auth, inscription, RLS tenant, CRUD événement, protéger perso/admin | 4–6 sem. |
| **B — Super admin** | Console plateforme, validation, quotas invités/participants | 2–3 sem. |
| **C — Premium** | Templates, relances auto, analytics, domaine custom | 3–4 sem. |
| **D — Check-in** | PWA staff, scan QR, logs, mode offline | 3–4 sem. |
| **E — Business** | Stripe, plans Free/Pro, white-label agences | optionnel |

### Décisions à trancher avant Phase A

1. Supabase Auth natif vs Clerk
2. GitHub Pages vs Vercel pour le front
3. Validation 100 % manuelle super admin vs semi-auto
4. Check-in PWA only vs app native plus tard
5. Freemium (ex. 50 invités) dès le lancement ?

---

## Business plan — Synthèse

**Page commerciale live :** `/pages/offres.html`  
**Docs vente :** `docs/COMMERCIAL-TARIFS.md` · `docs/COMMERCIAL-WHATSAPP.md` · `docs/SAAS-MINIMUM-DEV.md`

### Est-ce que ça peut rapporter ?

**Oui**, surtout en **B2B planners / agences** et **forfaits par mariage**, pas en freemium mass market face à Zola.

### Modèle de revenus indicatif

| Offre | Prix | Cible |
|-------|------|------|
| Forfait événement | 49–149 € | Couple / 1 mariage |
| Pro planner | 29–79 €/mois | Agence |
| Add-on check-in | +19–49 € | Jour J |
| White-label | 500–2 000 €/an | Gros clients |

### Délais & budget

| Horizon | Objectif |
|---------|---------|
| **2–3 mois** | SaaS minimal vendable (Phase A+B) |
| **4–6 mois** | Premiers clients payants |
| **12–18 mois** | Rentabilité (revenus > coûts) si commercial actif |

| Budget lancement (solo) | 500–5 000 € (infra + temps) |
| Budget produit externalisé | 10 000–30 000 € |
| **CA annuel plausible (an 2)** | 15 000–80 000 € (si commercial actif) |

### Coûts infra mensuels (lancé)

- Début : **~10–50 €/mois** (Supabase, domaine, email)
- Trafic : **~80–150 €/mois**

---

## Fichiers documentation

| Fichier | Contenu |
|---------|--------|
| `pages/offres.html` | Landing commerciale (tarifs + CTA WhatsApp) |
| `docs/COMMERCIAL-TARIFS.md` | Grille tarifaire détaillée (USD/EUR/CDF) |
| `docs/COMMERCIAL-WHATSAPP.md` | Scripts prospection couples & planners |
| `docs/SAAS-MINIMUM-DEV.md` | Checklist dev service → SaaS |
| `docs/FONCTIONNALITES-MANQUANTES.md` | Analyse fonctionnalités + manques |
| `docs/ROADMAP.md` | Roadmap technique V1 |
| `docs/SUPABASE-SETUP.md` | Guide Supabase |
| `docs/SUPABASE-EVENT-SETTINGS.sql` | Migration sync personnalisation |
| `docs/DATABASE-SCHEMA.sql` | Schéma futur (users, events, RLS) |

---

## Prochaine session (à faire)

1. **Phase A1** — Schéma `users` + Supabase Auth + RLS tenant
2. Pages `signup.html` / `login-client.html`
3. Protéger `personnalisation.html` et `admin.html` par login client
4. Console super admin (`platform/dashboard.html`)
5. Business plan 1 page (offres + prix finaux) si besoin

---

## Déploiement rapide

```powershell
cd "Z:\projets\invitation de mariages"
git add .
git commit -m "votre message"
git push origin main
```

Site live : ~1–2 min après push sur `main`.

---

*Document de référence consolidé — conversation juin 2026. Le reste de l'implémentation SaaS est planifié pour une prochaine session.*
