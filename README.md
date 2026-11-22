# Gratte pas

Petit journal quotidien de la peau, à installer sur l'écran d'accueil d'un téléphone Android.

- **Aujourd'hui** : 3 notes de 0 à 10 (visage, démangeaison, brûlure). Un toucher suffit, l'enregistrement est automatique. Les détails sont facultatifs, y compris les photos : elles sont réduites à 1280 px et stockées dans le téléphone (IndexedDB). On peut aussi les envoyer dans la galerie.
- **Évolution** : la courbe sur 14, 30 ou 90 jours, les jours difficiles et la moyenne de la semaine.
- **Semaine** : le bilan POEM (7 questions, score de 0 à 28), reconnu par les dermatologues.
- **Données** : la sauvegarde et la restauration (photos comprises), l'export CSV pour Excel, et deux rappels dans Google Agenda : le journal chaque soir et le bilan chaque semaine.

**Confidentialité** : les données restent dans le téléphone (`localStorage` pour le journal, `IndexedDB` pour les photos). Aucun serveur ni compte, rien n'est envoyé. Le code est hébergé sur GitHub Pages, mais pas les données.

## Mise en ligne (une seule fois)

1. Pousser ce dossier sur GitHub :
   ```
   git add .
   git commit -m "Gratte pas v1"
   git push
   ```
2. Sur github.com, aller dans le repo, puis **Settings → Pages**.
3. Choisir **Source : GitHub Actions**. Il n'y a rien d'autre à choisir.
4. Aller dans l'onglet **Actions** : le déploiement « Déployer Gratte pas » tourne (environ 1 minute). Une fois terminé, l'adresse s'affiche, du type `https://<compte>.github.io/<nom-du-repo>/`.

> Le dépôt doit être **public** pour utiliser GitHub Pages avec un compte gratuit. Ce n'est pas un problème : il ne contient que le code, aucune donnée.

## Installation sur son téléphone (Android)

1. Ouvrir l'adresse dans **Chrome**.
2. Menu **⋮**, puis **Ajouter à l'écran d'accueil** (ou **Installer l'application**).
3. L'icône du chat apparaît. L'app fonctionne ensuite **sans internet**.
4. Dans l'app, aller dans **Données → Rappels dans l'agenda**. Toucher **Ajouter dans Google Agenda** pour le soir, puis **Enregistrer**. Faire de même pour la semaine. Ça se fait une seule fois.

## Habitudes à prendre

- **Chaque soir** : ouvrir l'app, trois touchers, c'est fini.
- **Le week-end** : le bilan POEM (un bandeau le propose le samedi et le dimanche).
- **Une fois par semaine** : *Données → Sauvegarder*, puis envoyer le fichier sur WhatsApp ou Drive. L'app le rappelle si la dernière sauvegarde date de plus de 7 jours.

⚠️ Supprimer l'icône, vider les données de Chrome ou changer de téléphone **efface le journal**. Seule la sauvegarde permet de le récupérer, avec *Données → Restaurer*.

## Pour le médecin

*Données → Exporter le journal* crée un fichier CSV qui s'ouvre directement dans Excel : point-virgule comme séparateur, accents corrects, dates au format suisse. Il contient une ligne par jour, avec la note maximale et une colonne « Jour difficile » (une note à 5 ou plus).

## Mettre à jour l'app

Il suffit de modifier les fichiers, puis de faire `git push`. C'est tout.

- Le workflow `.github/workflows/deploy.yml` déploie le site et lui donne un numéro de build unique (date et commit).
- À la prochaine ouverture de l'app avec internet (ou quand elle revient au premier plan), le téléphone détecte la nouvelle version, l'installe, recharge l'app et affiche le bandeau **« Application mise à jour ✓ »**.
- Les données du journal ne sont jamais touchées.
- Le numéro de build installé s'affiche en bas de l'onglet *Données*.

## Fichiers

| Fichier | Rôle |
|---|---|
| `index.html` | Structure des écrans |
| `styles.css` | Apparence (tons sauge, crème, cuivre ; mode sombre automatique) |
| `app.js` | Logique : saisie, graphique, POEM, export, sauvegarde |
| `sw.js` | Fonctionnement hors ligne et mises à jour |
| `.github/workflows/deploy.yml` | Déploiement automatique sur GitHub Pages |
| `manifest.webmanifest` | Nom, icône et couleurs pour l'installation |
| `icons/` | Icône du chat |
