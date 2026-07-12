from pathlib import Path
from reportlab.lib import colors
from reportlab.lib.pagesizes import A4
from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
from reportlab.lib.units import cm
from reportlab.platypus import SimpleDocTemplate, Paragraph, Spacer, PageBreak, ListFlowable, ListItem, Table, TableStyle

ROOT = Path(__file__).resolve().parent.parent
OUTPUT = ROOT / 'docs' / 'architecture-plateforme-simplifiee.pdf'

styles = getSampleStyleSheet()
styles.add(ParagraphStyle(name='TitleFR', parent=styles['Title'], fontName='Helvetica-Bold', fontSize=22, leading=26, textColor=colors.HexColor('#5B1F2D'), spaceAfter=12))
styles.add(ParagraphStyle(name='SubtitleFR', parent=styles['Heading2'], fontName='Helvetica-Bold', fontSize=13, leading=16, textColor=colors.HexColor('#7A3347'), spaceBefore=10, spaceAfter=6))
styles.add(ParagraphStyle(name='BodyFR', parent=styles['BodyText'], fontName='Helvetica', fontSize=10.5, leading=14.2, textColor=colors.HexColor('#222222')))
styles.add(ParagraphStyle(name='BulletFR', parent=styles['BodyText'], fontName='Helvetica', fontSize=10.2, leading=13.5, leftIndent=12, spaceAfter=3))
styles.add(ParagraphStyle(name='NoteFR', parent=styles['BodyText'], fontName='Helvetica-Oblique', fontSize=9.5, leading=12.5, textColor=colors.HexColor('#5F5F5F'), spaceBefore=6, spaceAfter=6))


def p(text, style='BodyFR'):
    return Paragraph(text, styles[style])


def bullet(items):
    return ListFlowable([ListItem(p(item, 'BulletFR'), bulletColor=colors.HexColor('#5B1F2D')) for item in items], bulletType='bullet', start='square')

story = []
story.append(p('Architecture simplifiée de la plateforme d’invitations et d’événements', 'TitleFR'))
story.append(p('Ce document présente une vision claire, simple et évolutive de la plateforme en s’appuyant sur la structure actuelle : invitation, personnalisation, gestion des invités, suivi du jour J, et futur espace super admin.', 'BodyFR'))
story.append(Spacer(1, 0.3 * cm))

story.append(p('1. Vision du projet', 'SubtitleFR'))
story.append(p('Le projet n’est pas seulement une page d’invitation. Il est déjà une plateforme de gestion d’événement, avec trois piliers :', 'BodyFR'))
story.extend([Spacer(1, 0.15 * cm), p('• une expérience invitée élégante et personnalisable', 'BulletFR'), p('• un espace organisateur pour piloter l’événement', 'BulletFR'), p('• une base prête à devenir un vrai produit SaaS', 'BulletFR')])
story.append(Spacer(1, 0.25 * cm))

story.append(p('2. Ce qui existe déjà aujourd’hui', 'SubtitleFR'))
story.append(p('La structure actuelle couvre déjà plusieurs fonctions utiles :', 'BodyFR'))
story.append(bullet([
    'la page d’accueil : présentation de la marque et des offres',
    'la page d’invitation : expérience premium pour les invités',
    'la page de personnalisation : studio de création de l’invitation',
    'la page d’administration : gestion des invités, RSVP, exports, relances',
    'la page de check-in : suivi de la présence le jour J',
    'la page d’offres : vision commerciale et future monétisation'
]))
story.append(Spacer(1, 0.25 * cm))

story.append(p('3. Objectif de l’architecture simplifiée', 'SubtitleFR'))
story.append(p('L’objectif est de garder la plateforme actuelle intacte dans son cœur produit, tout en ajoutant une couche claire de gestion par comptes, événements et accès.', 'BodyFR'))
story.append(bullet([
    'chaque organisateur a son propre espace',
    'chaque événement est isolé de manière propre',
    'chaque utilisateur voit seulement ce qui lui appartient',
    'le super admin peut superviser l’ensemble sans casser le fonctionnement existant'
]))
story.append(Spacer(1, 0.25 * cm))

story.append(p('4. Le modèle simple à retenir', 'SubtitleFR'))
story.append(p('La logique la plus saine est la suivante :', 'BodyFR'))
story.append(bullet([
    'un compte organisateur',
    'un ou plusieurs événements liés à ce compte',
    'des invités liés à un événement',
    'une personnalisation liée à un événement',
    'un suivi RSVP et présence lié à l’événement',
    'un super admin avec une vue globale'
]))
story.append(Spacer(1, 0.25 * cm))

story.append(p('5. Les 3 niveaux de la plateforme', 'SubtitleFR'))
role_data = [['Rôle', 'Accès', 'Responsabilités'], ['Super admin', 'Tous les événements et tous les organisateurs', 'Vue globale, validation, supervision, aide'], ['Organisateur', 'Ses événements uniquement', 'Créer, personnaliser, gérer les invités, suivre le RSVP et la présence'], ['Invité', 'Son invitation', 'Voir l’invitation, répondre, scanner / entrer selon le cas']]
role_table = Table(role_data, repeatRows=1, colWidths=[3.2 * cm, 5.2 * cm, 7 * cm])
role_table.setStyle(TableStyle([
    ('BACKGROUND', (0,0), (-1,0), colors.HexColor('#F2E2E8')),
    ('TEXTCOLOR', (0,0), (-1,0), colors.HexColor('#5B1F2D')),
    ('FONTNAME', (0,0), (-1,0), 'Helvetica-Bold'),
    ('ALIGN', (0,0), (-1,-1), 'LEFT'),
    ('GRID', (0,0), (-1,-1), 0.4, colors.HexColor('#C8A9B5')),
    ('VALIGN', (0,0), (-1,-1), 'TOP'),
    ('ROWBACKGROUNDS', (0,1), (-1,-1), [colors.whitesmoke, colors.white])
]))
story.append(role_table)
story.append(Spacer(1, 0.3 * cm))

story.append(p('6. Comment organiser les pages existantes', 'SubtitleFR'))
story.append(p('La structure actuelle peut rester le cœur du produit, avec une couche supplémentaire autour de la logique de comptes et d’événements.', 'BodyFR'))
story.append(bullet([
    'la page d’accueil reste la vitrine générale',
    'la page d’invitation reste l’expérience publique pour l’invité',
    'la page de personnalisation devient l’espace organisateur pour son événement',
    'la page d’administration devient la console de gestion de l’événement',
    'la page de check-in devient l’outil de suivi du jour J',
    'la page d’offres garde sa valeur commerciale et de présentation'
]))
story.append(Spacer(1, 0.25 * cm))

story.append(p('7. La logique minimale à implémenter', 'SubtitleFR'))
story.append(p('Pour avancer sans casser l’existant, il faut ajouter seulement ce qui est indispensable à la base :', 'BodyFR'))
story.append(bullet([
    'inscription et connexion des organisateurs',
    'association d’un utilisateur à un ou plusieurs événements',
    'séparation des données par événement',
    'authentification simple pour l’accès aux pages organisateur',
    'interface super admin simple avec vue globale',
    'préservation du fonctionnement actuel pour les invités publics'
]))
story.append(Spacer(1, 0.25 * cm))

story.append(p('8. Le flux utilisateur idéal', 'SubtitleFR'))
story.append(bullet([
    'Un organisateur s’inscrit et se connecte',
    'Il crée ou ouvre un événement',
    'Il personnalise l’invitation',
    'Il importe ou ajoute ses invités',
    'Il suit les réponses RSVP',
    'Le jour J, il utilise la présence et le check-in',
    'Le super admin peut superviser l’ensemble'
]))
story.append(Spacer(1, 0.25 * cm))

story.append(p('9. Comment avancer sans casser l’existant', 'SubtitleFR'))
story.append(p('La méthode la plus sûre est d’ajouter une couche au-dessus du système actuel, et non de le remplacer brutalement.', 'BodyFR'))
story.append(bullet([
    'conserver les pages actuelles comme base du produit',
    'ajouter un système de comptes et d’événements',
    'faire pointer les pages organisateur vers les données du compte connecté',
    'laisser les invités accéder à l’invitation via un lien public',
    'introduire le super admin comme couche de supervision globale'
]))
story.append(Spacer(1, 0.25 * cm))

story.append(p('10. Ce que cette structure permet à terme', 'SubtitleFR'))
story.append(bullet([
    'plusieurs organisateurs peuvent travailler proprement',
    'chaque événement est indépendant',
    'la plateforme devient plus professionnelle',
    'la montée en charge vers un vrai SaaS devient naturelle',
    'les pages actuelles restent utiles et cohérentes'
]))
story.append(Spacer(1, 0.3 * cm))
story.append(p('Conclusion', 'SubtitleFR'))
story.append(p('La version la plus simple et la plus robuste consiste à garder le cœur du produit actuel, puis à ajouter une structure claire autour des comptes, des événements, des droits et de la supervision globale. C’est la meilleure façon de progresser sans casser l’expérience déjà en place.', 'BodyFR'))
story.append(Spacer(1, 0.2 * cm))
story.append(p('Ce document sert de base de référence pour organiser la plateforme de manière claire, progressive et prête pour la suite.', 'NoteFR'))

doc = SimpleDocTemplate(str(OUTPUT), pagesize=A4, rightMargin=2.0 * cm, leftMargin=2.0 * cm, topMargin=1.8 * cm, bottomMargin=1.8 * cm)
doc.build(story)
print(f'PDF generated: {OUTPUT}')
