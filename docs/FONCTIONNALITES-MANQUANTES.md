# Analyse des fonctionnalités — Invitation Mariage Yanick & Keren

> Document de référence — état au 15 juin 2026  
> Live : https://alphagiven7-collab.github.io/invitation_mariage/

---

## 1. Synthèse exécutive

La plateforme couvre déjà un parcours invité complet (accueil personnalisé, RSVP, QR, admin invités, Supabase, PWA, dark mode, compte à rebours).  
**Cette itération** comble les principaux manques de **contenu éditorial personnalisable** : programme du jour, lieu/GPS/carte, informations pratiques, avec une dashboard personnalisation refondu (UI/UX aligné admin).

---

## 2. Fonctionnalités implémentées (✅)

| Domaine | Détail |
|--------|--------|
| Parcours invité | Lien unique `?event=&guest=&nom=&t=` — préremplissage RSVP, message d'accueil |
| RSVP | Formulaire intégré + sync cloud Supabase |
| QR code | Génération après validation présence |
| Admin invités | Import CSV, édition, suppression (local + cloud), relances WhatsApp |
| Personnalisation visuelle | Textes, photos, couleurs, date/compte à rebours |
| **Programme du jour** | Timeline dynamique, étapes horaires + couleurs, titre de section éditable |
| **Lieu & carte** | Nom, adresse, carte Google intégrée, GPS, Waze, itinéraire |
| **Infos pratiques** | Blocs icône/titre/texte, ajout/suppression illimité |
| Thème | Mode clair/sombre avec bascule élégante |
| PWA | Service worker, installation mobile |
| SEO / partage | Meta OG, Twitter cards |
| Multilingue | Structure i18n de base |

---

## 3. Fonctionnalités manquantes ou partielles (⚠️)

### 3.1 Personnalisation & contenu

| Fonctionnalité | Statut | Impact UX | Priorité |
|--------------|--------|-----------|----------|
| Sync cloud des réglages personnalisation (programme, GPS…) | ✅ Implémenté | Table `event_settings` + `DashboardSync` | — |
| Éditeur inline sur invitation (mode concepteur) pour programme/lieu/pratique | ❌ Manquant | Friction pour petites retouches | Moyenne |
| Aperçu live split-screen (perso + invitation) | ✅ Implémenté | Iframe mobile temps réel | — |
| Historique / versions des personnalisations | ❌ Manquant | Pas de retour arrière sûr | Moyenne |
| Drag & drop réordonnancement programme/infos | ❌ Manquant | Réorganisation manuelle | Basse |
| Carte interactive (Google Maps embed) | ✅ Implémenté | Iframe Maps + Waze + copier GPS | — |
| Géocodage auto adresse → GPS | ❌ Manquant | Saisie manuelle des coordonnées | Moyenne |

### 3.2 Parcours invité

| Fonctionnalité | Statut | Impact UX | Priorité |
|--------------|--------|-----------|----------|
| RSVP multi-invité (famille) | ⚠️ Partiel | Un formulaire par lien | Haute |
| Rappel calendrier (.ics) téléchargeable | ✅ Implémenté | Bouton + rappels J-1 et H-2 | — |
| Partage WhatsApp / réseaux avec OG dynamique | ⚠️ Partiel | Meta statiques | Moyenne |
| Mode « invité anonyme » (sans token) | ⚠️ Limité | Expérience générique | Basse |
| Notifications push J-7 / J-1 | ❌ Manquant | Relances manuelles | Basse |

### 3.3 Administration

| Fonctionnalité | Statut | Impact UX | Priorité |
|--------------|--------|-----------|----------|
| Rôles granulaires (planner vs mariés vs super-admin) | ⚠️ Basique | 2 codes seulement | Moyenne |
| Tableau de bord temps réel multi-utilisateur | ⚠️ Partiel | Dépend Supabase + refresh | Moyenne |
| Segmentation invités (famille / amis / VIP) | ⚠️ Partiel | Champ groupe CSV | Moyenne |
| Plan de table / assignation places | ❌ Manquant | Gestion jour J | Basse (hors scope actuel) |
| Budget / prestataires | ❌ Manquant | Hors scope wedding invite | Basse |

### 3.4 Technique & fiabilité

| Fonctionnalité | Statut | Impact | Priorité |
|--------------|--------|--------|----------|
| Clé Supabase anon JWT standard | ⚠️ À vérifier | Risque échec API | **Critique** |
| Tests automatisés (E2E RSVP, perso) | ❌ Manquant | Régressions silencieuses | Haute |
| CI/CD GitHub Actions | ❌ Manquant | Déploiement manuel | Moyenne |
| Domaine personnalisé + HTTPS | ❌ Manquant | URL GitHub Pages | Moyenne |
| Backup export JSON complet événement | ⚠️ Partiel | Export invités seulement | Moyenne |

---

## 4. Recommandations UI/UX (expert)

### 4.1 Page personnalisation (réalisé dans cette version)

- **Navigation lat lat** avec ancres et surbrillance de section active (scroll-spy)
- **En-tête premium** cohérent avec l'admin (Playfair + dégradé indigo)
- **Listes dynamiques** pour programme et infos pratiques (cartes, boutons ajouter/supprimer)
- **Groupement logique** : Identité → Date → Lieu → Programme → Pratique → Photos → Couleurs
- **Toasts** discret remplaçant les `alert()` natifs
- **Aide contextuelle** GPS (comment copier depuis Google Maps)

### 4.2 Améliorations UX recommandées (prochaines étapes)

1. **Panneau aperçu** — iframe mobile de l'invitation à droite du formulaire  
2. **Indicateurs de complétion** — barre « 8/12 sections remplies »  
3. **Validation inline** — GPS invalide, horaires mal formatés  
4. **Micro-copies** — exemples pré-remplis cliquables (« Copier modèle parking »)  
5. **Accessibilité** — focus visible, labels ARIA sur listes dynamiques  
6. **Mobile-first** — sidebar en chips horizontales (déjà partiellement fait)

### 4.3 Invitation (page invité)

- Programme : animation d'entrée stagger au scroll  
- Carte : bouton « Copier GPS » + deep link Waze/Google Maps  
- Infos pratiques : accordéon si > 4 items  
- Jour J : bandeau sticky « C'est aujourd’hui ! »

---

## 5. Architecture contenu (nouveau)

```
events/yanick-keren.json     → defaults événement (program, practicalInfo, venueDetails)
localStorage wedding_dashboard_state → overrides client
ContentBlocks.apply()        → rendu invitation.html
personnalisation.js         → édition + persistance locale
```

**Ordine de fusion :** config JSON → defaults ContentBlocks → état localStorage (prioritaire).

---

## 6. Roadmap suggérée (par sprint)

| Sprint | Objectif | Effort |
|--------|---------|--------|
| S1 | ~~Sync Supabase event_settings~~ ✅ · Export .ics + partage WhatsApp | 1 j |
| S2 | Export .ics + partage WhatsApp enrichi | 1 j |
| S3 | Aperçu live + réordonnancement drag & drop | 2 j |
| S4 | Carte embed + géocodage adresse | 1–2 j |
| S5 | Tests E2E + CI GitHub Actions | 2 j |

---

## 7. Comment tester cette version

1. Ouvrir `pages/personnalisation.html`
2. Modifier **Lieu & GPS**, ajouter une étape au **Programme**, une info pratique
3. Cliquer **Sauvegarder** puis **Ouvrir invitation**
4. Vérifier : timeline programme, ligne GPS, blocs pratiques, lien Maps

---

*Document généré dans le cadre de l'extension personnalisation — Yanick & Keren 2026.*
