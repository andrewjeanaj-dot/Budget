// Facade utilisee par les pages. Toutes les lectures passent par l'instantane
// local (local.js) : il n'y a plus de serveur, donc plus de mode "hors ligne"
// a distinguer. horsLigne reste dans les retours pour ne pas toucher aux pages.

function appareilId() {
  let id = null;
  try {
    id = localStorage.getItem('budget_device_id');
    if (!id) {
      id = genererUuid();
      localStorage.setItem('budget_device_id', id);
    }
  } catch (e) {
    id = 'appareil-inconnu';
  }
  return id;
}

async function chargerCategories() {
  const snap = await obtenirInstantane();
  return { categories: snap.categories, horsLigne: false };
}

async function chargerMois(mois) {
  const snap = await obtenirInstantane();
  assurerMois(snap, mois);
  return { donnees: calculerMois(snap, mois), horsLigne: false };
}

async function chargerDepensesLocales(mois) {
  const snap = await obtenirInstantane();
  return (snap.depenses[mois] || []).filter((d) => !d.supprime);
}

async function enregistrerDepense({ montant, categorie_id, note, date, moyen }) {
  appareilId();   // marque ce telephone comme deja utilise
  const depense = {
    id: genererUuid(),
    date: date || dateAujourdhui(),
    montant,
    categorie_id,
    note: note || '',
    moyen: moyen || 'carte',
    cree_le: nowIso(),
  };
  const { ok } = await enfilerOperation('depense.ajouter', depense);
  return { depense, enLocal: ok };
}

async function supprimerDepense(id, mois) {
  await enfilerOperation('depense.supprimer', { id, mois });
}

async function restaurerDepense(id) {
  await enfilerOperation('depense.restaurer', { id });
}

// mois : le mois que le revenu finance (par defaut celui de sa date).
async function enregistrerRevenu({ montant, libelle, type, note, date, mois, moyen, reconduire }) {
  const d = date || dateAujourdhui();
  const revenu = {
    id: genererUuid(),
    mois: mois || d.slice(0, 7),
    libelle,
    montant,
    type: type || 'variable',
    date: d,
    note: note || '',
    moyen: moyen || 'virement',
    reconduire: !!reconduire,
    cree_le: nowIso(),
  };
  const { ok } = await enfilerOperation('revenu.ajouter', revenu);
  return { revenu, enLocal: ok };
}

// Tous les mouvements d'un mois (depenses et revenus), du plus recent au plus
// ancien. Un revenu sans date (saisi avant la V3) est place au 1er du mois.
function mouvementsDuMois(snap, mois) {
  const parId = categoriesParId(snap.categories || []);
  const liste = [];
  for (const d of (snap.depenses[mois] || [])) {
    if (d.supprime) continue;
    const c = parId[d.categorie_id];
    liste.push({
      sorte: 'depense', id: d.id, date: d.date, montant: d.montant, note: d.note || '',
      moyen: d.moyen || null, cree_le: d.cree_le || '', categorie_id: d.categorie_id,
      titre: c ? c.libelle : 'Catégorie supprimée', icone: c ? iconeCategorie(c) : '❔', auto: !!d.auto,
    });
  }
  for (const r of (snap.revenus[mois] || [])) {
    const info = LIBELLES_REVENU.find((x) => x.libelle === r.libelle);
    liste.push({
      sorte: 'revenu', id: r.id, date: r.date || `${mois}-01`, sansDate: !r.date, mois,
      montant: r.montant, note: r.note || '', moyen: r.moyen || null, cree_le: r.cree_le || '',
      titre: r.libelle, icone: info ? info.icone : '💰', brut: r, auto: !!r.auto,
    });
  }
  return liste.sort((a, b) => b.date.localeCompare(a.date) || b.cree_le.localeCompare(a.cree_le));
}
