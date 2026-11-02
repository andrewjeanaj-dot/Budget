# Gestion de mes finances

Application gratuite de suivi de budget, pensée pour noter une dépense en
quelques secondes, directement à la caisse, depuis son téléphone.

- **Aucun compte, aucun serveur** : les données restent dans le téléphone. Seule
  la sauvegarde automatique, si on l'active, envoie une copie chiffrée dans un
  dépôt GitHub privé de l'utilisateur.
- **Marche hors ligne** une fois installée sur l'écran d'accueil.
- **Sauvegarde par fichier** (Plus › Fichier de sauvegarde et export) : à ranger
  dans iCloud Drive, OneDrive ou Google Drive. L'accueil la propose à chaque
  fin de mois, à l'ouverture de l'app.
- **Tableau de bord** : revenus, dépenses et « Il te reste » du mois (l'argent
  réel du moment), encore prévu et fin de mois prévue, dépenses par catégorie, 6 derniers
  mois, budgets par catégorie qui passent au rouge en cas de dépassement.
- **Export CSV pour Excel** de tous les mouvements.

## Écrans

| Onglet | Fichier | Rôle |
|---|---|---|
| Accueil | `index.html` | Tableau de bord du mois. Sur ordinateur (1100 px et plus) : saisie à gauche, tableau au centre, mouvements à droite. |
| Mouvements | `mouvements.html` | Dépenses et revenus du mois, filtre, suppression avec « Annuler ». |
| + | `ajout.html` | Saisie d'une dépense (catégorie, moyen de paiement) ou d'un revenu. |
| Budget | `budget.html` | Prévu / réel par catégorie, report, revenus du mois. |
| Plus | `plus.html` | Mode d'emploi (`guide.html`), Catégories, Épargne, Tendance, Sauvegarde et export. |

La saisie (`js/saisie.js`) et la liste (`js/mouvements.js`) sont des composants
montés dans un conteneur : la même saisie sert à `ajout.html` et à la colonne
gauche de l'accueil.

## Installer sur iPhone

1. Ouvrir l'adresse de l'app dans **Safari**.
2. Bouton Partager, puis « Sur l'écran d'accueil ».
3. Lancer l'app depuis l'icône (et non depuis Safari) : c'est ce qui la rend
   disponible hors ligne et protège les données contre l'effacement automatique.

## Notes techniques

- HTML/CSS/JavaScript sans framework ni étape de build. Hébergement statique
  (GitHub Pages).
- Données : un seul objet (« instantané ») stocké dans IndexedDB
  (`js/db.js`, `js/local.js`). Tous les totaux sont recalculés dans le
  téléphone (`calculerMois`).
- Premier lancement : si rien n'est enregistré, l'app propose les
  `CATEGORIES_STANDARD` (`js/local.js`). Elles ne sont écrites qu'à la première
  modification, et n'arrivent jamais sur un téléphone qui a déjà des données.
- Sauvegarde automatique : `js/coffre.js` chiffre l'instantané (AES-GCM, clé
  tirée du code par HKDF) et le dépose dans un dépôt GitHub privé de
  l'utilisateur, avec sa clé d'accès (`copies/<dossier>/<jour>.bin`, une copie
  par jour, un dossier par code). Un dépôt public est refusé.
- Hors ligne : `service-worker.js` met tous les fichiers en cache.
  **Après toute modification d'un fichier, incrémenter `VERSION` dans
  `service-worker.js`**, sinon les téléphones gardent l'ancienne version.
- Le mode hors ligne exige HTTPS (ou `localhost`) : le tester sur l'adresse
  publique depuis un vrai téléphone, pas seulement en local.
- Format de sauvegarde : `{ format: "budget-app", version: 1, exporte_le, donnees }`.
  L'import accepte aussi un instantané brut.
- Champs ajoutés en V3 (facultatifs, les anciennes sauvegardes restent
  lisibles) : `moyen` sur chaque dépense (`carte`, `especes`, `virement`,
  `prelevement`) ; `date`, `note`, `moyen`, `cree_le` sur chaque revenu. Un
  revenu est rangé dans le mois qu'il finance (`revenus[mois]`), sa `date` est
  celle où il est arrivé : un salaire versé le 30/09 peut financer octobre.
- Chaque modification déclenche l'événement `donnees-modifiees` : les écrans
  affichés ensemble (accueil sur ordinateur) se redessinent.
