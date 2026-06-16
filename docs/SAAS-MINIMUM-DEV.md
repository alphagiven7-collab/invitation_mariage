# Checklist dev minimum — du service au SaaS vendable en ligne

> Objectif : passer de « je configure chaque mariage à la main » à « le client s'inscrit, paie et lance son événement seul ».  
> Estimation : **4–6 semaines** solo, **2–3 semaines** si Phase A seulement.

---

## État actuel (V1 service)

| ✅ Prêt | ❌ Manque pour SaaS |
|---------|-------------------|
| Invitation + RSVP + QR | Inscription email/mot de passe |
| Personnalisation riche | Personnalisation protégée par login |
| Admin invités + CSV | Création événement self-service |
| Supabase (invités, settings) | RLS strict par tenant |
| Multi-événements (`?event=`) | Console super admin |
| Codes admin statiques | Paiement Stripe / Mobile Money |

---

## Phase A — SaaS minimal vendable (priorité)

### A1. Auth & comptes (1 semaine)

| Tâche | Fichier / zone | Détail |
|-------|----------------|--------|
| Supabase Auth email+password | Supabase Dashboard | Activer providers |
| Page `signup.html` | `pages/` | email, mot de passe, nom |
| Page `login-client.html` | `pages/` | distinct de `login.html` admin |
| Lier `user_id` → événements | SQL | colonne `owner_id` sur events |
| Session client | `assets/js/client-auth.js` | JWT Supabase, refresh |
| Déconnexion | toutes pages client | bouton header |

**Critère done** : un client créé en DB ne voit que ses données.

---

### A2. Isolation données — RLS (3–5 jours)

| Table | Policy |
|-------|--------|
| `guests` | `event_id IN (SELECT id FROM events WHERE owner_id = auth.uid())` |
| `event_settings` | idem |
| `rsvp`, `guestbook` | idem |
| `events` | SELECT/UPDATE own rows only |

Exécuter migration basée sur `docs/DATABASE-SCHEMA.sql`.

**Critère done** : impossible de lire les invités d'un autre client via l'API anon.

---

### A3. CRUD événement self-service (1 semaine)

| Tâche | Détail |
|-------|--------|
| `pages/mes-evenements.html` | Liste des événements du client |
| « Créer un événement » | Formulaire : titre, date, type (mariage/anniv/conf) |
| Dupliquer template | Copier defaults depuis `events/_template.json` → Supabase |
| Slug auto | `mariage-paul-marie-2026` unique |
| Supprimer / archiver | soft delete |

**Critère done** : plus besoin de créer `events/*.json` à la main ni de push GitHub.

---

### A4. Protéger les pages sensibles (2 jours)

| Page | Garde |
|------|-------|
| `personnalisation.html` | `ClientAuth.requireOwner(eventId)` |
| `admin.html` | idem |
| `login.html` (codes) | réservé super admin / legacy |

Retirer les codes admin en dur du README public avant prod SaaS.

---

### A5. Onboarding client (2–3 jours)

| Écran | Contenu |
|-------|---------|
| Wizard 4 étapes | Identité → Date/lieu → Import invités → Publier |
| Barre progression | 4/4 sections |
| Lien invitation finale | copier + WhatsApp |

---

## Phase B — Super admin (2 semaines)

| Tâche | Détail |
|-------|--------|
| `pages/platform/dashboard.html` | Liste tous événements |
| Workflow `draft → pending → approved → live` | colonne `status` |
| Quota invités par plan | ex. Free 50, Pro 200 |
| Impersonate / support | vue read-only événement client |

---

## Phase C — Paiement (1 semaine)

| Canal | Usage |
|-------|-------|
| **Stripe** | diaspora, EUR/USD |
| **Flutterwave / Paystack** | Africa cards |
| **Manuel** | Airtel/M-Pesa + validation admin (interim) |

| Plan Stripe | Prix | Limite |
|-------------|------|--------|
| Free | 0 | 30 invités, watermark |
| Pro | 9 €/mois ou 99 €/event | 200 invités |
| Agency | 49 €/mois | illimité |

Webhook : `checkout.session.completed` → activer plan + lever quota.

---

## Phase D — Polish commercial (1 semaine)

| Tâche | Priorité |
|-------|----------|
| Domaine custom (`docs/CUSTOM-DOMAIN.md`) | Haute |
| Page offres → vrai numéro WhatsApp | Haute |
| Email transactionnel (Resend / Supabase) | Moyenne |
| Politique confidentialité + CGU | **Obligatoire** |
| Export RGPD invité | Moyenne |
| Tests E2E RSVP (Playwright) | Haute |
| CI GitHub Actions | Moyenne |

---

## Ordre d'implémentation recommandé

```
Semaine 1–2   A1 Auth + A2 RLS
Semaine 3     A3 CRUD événements + A4 protection pages
Semaine 4     A5 onboarding wizard
Semaine 5     B super admin (validation manuelle)
Semaine 6     C paiement Stripe + page pricing live
```

---

## Definition of Done — « SaaS vendable »

Le client peut, **sans vous**, :

1. ✅ S'inscrire avec email
2. ✅ Créer un événement
3. ✅ Personnaliser l'invitation
4. ✅ Importer ses invités
5. ✅ Payer en ligne (ou essai gratuit)
6. ✅ Partager le lien aux invités
7. ✅ Voir les RSVP en temps réel

Et vous (super admin) pouvez :

8. ✅ Voir tous les comptes
9. ✅ Suspendre un abus
10. ✅ Supporter sans accès aux codes hardcodés

---

## Dette technique à traiter avant scale

| Risque | Action |
|--------|--------|
| Code admin plateforme dans `auth.js` | Env var / Supabase secret role |
| Clé Supabase dans repo | Variables environnement build |
| Service worker cache agressif | Bump version à chaque release |
| Pas de tests | Playwright : RSVP happy path |
| GitHub Pages seul | Migrer front → Vercel si auth complexe |

---

## Budget infra SaaS (10–50 clients)

| Service | Coût/mois |
|---------|-----------|
| Supabase Pro | 25 $ |
| Vercel Pro (optionnel) | 20 $ |
| Stripe | % transactions |
| Domaine + email | 5 $ |
| **Total** | **~50 – 80 $/mois** |

Seuil rentabilité : **~4 forfaits Premium/mois** couvrent l'infra.

---

## Prochaine session dev suggérée

1. `docs/DATABASE-SCHEMA.sql` → migration Supabase Auth + RLS
2. `pages/signup.html` + `assets/js/client-auth.js`
3. Protéger `personnalisation.html`
4. `pages/mes-evenements.html` — liste + créer

*Lier ce doc à `README.md` section Roadmap SaaS.*
