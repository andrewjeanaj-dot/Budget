// Export / import des donnees sous forme d'un fichier JSON. C'est le seul
// filet de securite : sans serveur, les donnees n'existent que dans ce
// telephone.


function init() {
  injecterNav('sauvegarde');
  enregistrerServiceWorker();
  demarrerVerifications();
  document.getElementById('bouton-exporter').addEventListener('click', exporter);
  document.getElementById('bouton-csv').addEventListener('click', exporterCsv);
  document.getElementById('bouton-importer').addEventListener('click', () => {
    document.getElementById('champ-fichier').click();
  });
  document.getElementById('champ-fichier').addEventListener('change', importer);
  afficherEtat();
}

function compter(snap) {
  const depenses = Object.values(snap.depenses || {})
    .reduce((n, liste) => n + liste.filter((d) => !d.supprime).length, 0);
  return {
    categories: (snap.categories || []).length,
    mois: Object.keys(snap.budgets || {}).length,
    depenses,
  };
}

async function afficherEtat() {
  const snap = await obtenirInstantane();
  const n = compter(snap);
  document.getElementById('resume-donnees').textContent =
    `${n.categories} catégories, ${n.mois} mois de budget, ${n.depenses} dépenses.`;

  const derniere = lireDerniereSauvegarde();
  document.getElementById('derniere-sauvegarde').textContent = derniere
    ? `Dernière sauvegarde : ${new Date(derniere).toLocaleDateString('fr-FR')} (il y a ${joursDepuis(derniere)} j).`
    : 'Aucune sauvegarde faite depuis ce téléphone.';
  majStatutSauvegarde();
}

async function exporter() {
  if (!(await creerFichierSauvegarde())) return;
  afficherToast('Sauvegarde créée ✓');
  afficherEtat();
}

// Cellule CSV pour Excel (separateur « ; »). Un texte qui commence par = + -
// ou @ est prefixe d'une apostrophe : Excel ne doit jamais l'executer comme
// une formule.
function celluleCsv(v) {
  let s = String(v == null ? '' : v);
  if (/^[=+\-@\t\r]/.test(s) && !/^-?\d+$/.test(s)) s = "'" + s;
  return /[;"\r\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
}

async function exporterCsv() {
  const snap = await obtenirInstantane();
  const lignes = [];
  for (const mois of Object.keys({ ...snap.depenses, ...snap.revenus }).sort()) {
    for (const m of mouvementsDuMois(snap, mois)) {
      // Une copie automatique d'un mois a venir n'est pas encore un vrai mouvement.
      if (m.auto && mois > moisCourant()) continue;
      lignes.push({ ...m, moisBudget: mois });
    }
  }
  if (lignes.length === 0) { afficherToast('Aucun mouvement à exporter'); return; }
  lignes.sort((a, b) => a.date.localeCompare(b.date) || a.cree_le.localeCompare(b.cree_le));

  const parId = categoriesParId(snap.categories || []);
  const tableau = [['Date', 'Type', 'Catégorie ou libellé', 'Groupe', 'Payé par', 'Note', 'Montant (F)', 'Mois du budget']];
  for (const m of lignes) {
    const [a, mo, j] = m.date.split('-');
    const cat = m.sorte === 'depense' ? parId[m.categorie_id] : null;
    const moyen = moyenInfo(m.moyen);
    tableau.push([
      m.sansDate ? '' : `${j}/${mo}/${a}`,
      m.sorte === 'depense' ? 'Dépense' : 'Revenu',
      m.titre,
      cat ? groupeInfo(cat.groupe).label : '',
      moyen ? moyen.label : '',
      m.note,
      (m.sorte === 'depense' ? '-' : '') + m.montant,
      moisLabel(m.moisBudget),
    ]);
  }
  // L'en-tete ﻿ (BOM) fait reconnaitre les accents par Excel.
  const contenu = '﻿' + tableau.map((l) => l.map(celluleCsv).join(';')).join('\r\n');
  const fichier = new File([contenu], `budget_mouvements_${dateAujourdhui()}.csv`, { type: 'text/csv' });
  if (await partagerFichier(fichier)) afficherToast(`Export créé : ${lignes.length} mouvements ✓`);
}

async function importer(evt) {
  const champ = evt.target;
  const fichier = champ.files && champ.files[0];
  champ.value = '';   // permet de rechoisir le meme fichier
  if (!fichier) return;

  let donnees;
  try {
    donnees = extraireDonnees(JSON.parse(await fichier.text()));
  } catch (e) {
    donnees = null;
  }
  if (!donnees) {
    alert('Ce fichier n’est pas une sauvegarde de l’app Budget. Rien n’a été modifié.');
    return;
  }

  const actuel = compter(await obtenirInstantane());
  const nouveau = compter(donnees);
  const ok = confirm(
    `Restaurer « ${fichier.name} » ?\n\n`
    + `Fichier : ${nouveau.categories} catégories, ${nouveau.mois} mois, ${nouveau.depenses} dépenses.\n`
    + `Téléphone actuel : ${actuel.categories} catégories, ${actuel.mois} mois, ${actuel.depenses} dépenses.\n\n`
    + 'Les données actuelles du téléphone seront REMPLACÉES.');
  if (!ok) return;

  delete donnees.horodatage;
  const enregistre = await definirInstantane(donnees);
  if (!enregistre) {
    alert('Le téléphone n’a pas pu enregistrer les données restaurées.');
    return;
  }
  afficherToast('Données restaurées ✓');
  afficherEtat();
}

init();
