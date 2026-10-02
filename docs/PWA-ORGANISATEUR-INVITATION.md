# Application organisateur et invitation hors connexion

## Installation

L'espace de gestion propose l'installation après vérification de la session et
des droits de l'organisateur. L'application installée ouvre cet événement.
Un bouton dans l'en-tête permet de retrouver l'installation après « Plus tard ».

L'invité reçoit une proposition après une présence confirmée côté serveur, ou
à l'ouverture de son lien personnel déjà confirmé. La proposition figure sur
la confirmation et sous le RSVP. L'installation est facultative. Un refus masque
la proposition automatique pendant sept jours sur cet appareil et pour ce lien.

Sur les navigateurs compatibles, le bouton déclenche le dialogue natif. Sur
iPhone/iPad, les instructions expliquent l'ajout depuis le menu Partager.
Chaque événement organisateur et chaque invitation personnelle ont une identité
d'installation distincte et une URL de démarrage conservant leur contexte.

Ouvrir l'application installée une première fois avec Internet. Safari peut
utiliser un stockage distinct pour l'application : une première connexion
organisateur peut alors être nécessaire. Les ouvertures suivantes reprennent
la session enregistrée dans cette application.

## Session et droits

Seuls les jetons de session Supabase sont conservés, jamais le mot de passe.
La reprise renouvelle le jeton puis vérifie l'identité, le rôle et les droits
sur l'événement. Les reprises simultanées sont dédupliquées ; Web Locks
coordonne les onglets qui le prennent en charge.

Une panne réseau conserve les identifiants de session et bloque l'accès aux
données de gestion jusqu'à vérification en ligne. Une déconnexion volontaire
ou une révocation confirmée supprime la session. Une réponse réseau tardive
ne doit pas restaurer une session déconnectée. L'interface se verrouille à la
mise en arrière-plan puis vérifie à nouveau l'accès au retour ; elle vérifie
aussi régulièrement l'accès pendant une utilisation prolongée.

Le cache du service worker contient des pages HTML statiques et leurs ressources,
jamais les listes d'invités, mots de passe, sessions, réponses API ou RPC.
Les restrictions serveur et les droits organisateur existants restent en place.

## Invitation hors connexion

Une copie minimale du profil confirmé est enregistrée sous une clé composée de
l'événement et du token exact. Elle conserve notamment le nom, la table, les
effectifs et l'état d'autorisation du QR. Aucun rapprochement par nom, aucun
repli sur le profil d'une autre invitation.

Le service worker prépare le HTML et les scripts/styles avant d'annoncer que la
copie est prête. Les images publiques accessibles sont préparées également.
Une invitation préparée garde ses dépendances après une mise à jour du worker.
Le fonctionnement dépend de la place disponible et du stockage conservé par
le navigateur ; une suppression des données impose une nouvelle ouverture en ligne.

La lecture en ligne vérifie toujours le serveur. La copie personnelle n'est
utilisée qu'après une panne réseau ou une erreur serveur 5xx. Une réponse vide,
un accès refusé, un lien supprimé ou un autre statut RSVP retire cette copie.
Un événement dépublié retire également sa configuration et les copies associées.

Hors connexion, un bandeau indique que les données sont celles de la dernière
ouverture. Les modifications et révocations survenues pendant la déconnexion
ne sont connues qu'au prochain contact serveur. Le retour d'Internet recharge
l'invitation et actualise sa table et ses droits. Les confirmations, messages,
GPS et médias en streaming nécessitent Internet ; aucune écriture RSVP n'est
annoncée comme réussie sans réponse serveur.

## Mise en service et vérification

Aucune migration SQL supplémentaire n'est nécessaire.

- Tests Node : authentification, concurrence, droits, isolation des copies,
  erreurs réseau/serveur, révocation, manifests et installation native/manuelle.
- Tests service worker : préparation complète, séparation des tokens/événements,
  refus d'API et de médias privés, conservation des copies lors des mises à jour.
- Contrôle Chrome mobile avec serveur de données fictives : invitation et QR
  hors connexion, autre token refusé, retour réseau, organisateur connecté,
  stockage conservé hors connexion et reprise sans mot de passe.

Les essais ne créent ni confirmation ni invité en production.
