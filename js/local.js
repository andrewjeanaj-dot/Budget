// Couche autonome : le telephone detient TOUTES les donnees et calcule
// lui-meme ses totaux. Aucun serveur, aucun PC : l'app marche partout, en
// ligne comme hors ligne. Contrepartie : les donnees n'existent que dans ce
// telephone, d'ou la sauvegarde par fichier (sauvegarde.js).

const CLE_INSTANTANE = 'instantane';
const CLE_MIROIR = 'budget_instantane_miroir';
let _instantane = null;
let _stockageEnEchec = false;   // vrai si la derniere ecriture n'a abouti nulle part
let _lectureEnEchec = false;    // vrai si les donnees n'ont pas pu etre relues
let _secoursActif = false;      // vrai si seule la copie de secours a ete ecrite

function instantaneVide() {
  return {
    categories: [], budgets: {}, depenses: {}, revenus: {},
    epargne: { objectifs: [], mouvements: [] },
  };
}

// Categories proposees a un nouvel utilisateur, sans montant : chacun fixe ses
// previsions, renomme ou supprime. Celles du quotidien d'abord : ce sont elles
// qui s'affichent en premier a la caisse.
const CATEGORIES_STANDARD = [
  ['courses', 'Courses', 'essentielles'],
  ['transport', 'Essence et transport', 'essentielles'],
  ['restaurants', 'Restaurants et snacks', 'loisirs'],
  ['sorties', 'Sorties et activités', 'loisirs'],
  ['shopping', 'Shopping et cadeaux', 'loisirs'],
  ['sante', 'Santé', 'imprevus'],
  ['logement', 'Logement (loyer ou prêt)', 'essentielles'],
  ['energie', 'Électricité et eau', 'essentielles'],
  ['telephone', 'Téléphone et internet', 'essentielles'],
  ['assurances', 'Assurances', 'essentielles'],
  ['abonnements', 'Abonnements', 'essentielles'],
  ['projet', 'Projet perso', 'projet_perso'],
  ['imprevus', 'Imprévus divers', 'imprevus'],
];

function instantanePremierLancement() {
  const snap = instantaneVide();
  const mois = moisCourant();
  snap.categories = CATEGORIES_STANDARD.map(([id, libelle, groupe]) => ({ id: `std-${id}`, libelle, groupe, archive: false }));
  snap.budgets[mois] = {
    mois, ancre: true, solde_depart: 0,
    lignes: snap.categories.map((c) => ({ categorie_id: c.id, prevision: 0, reconduire: true })),
  };
  return snap;
}

// Copie de secours dans le telephone, dans un second stockage : si le principal
// refuse une ecriture, la saisie n'est pas perdue.
function lireMiroir() {
  try {
    const brut = localStorage.getItem(CLE_MIROIR);
    return brut ? JSON.parse(brut) : null;
  } catch (e) {
    return null;
  }
}

function ecrireMiroir(valeur, ecritLe) {
  try {
    localStorage.setItem(CLE_MIROIR, JSON.stringify({ ecrit_le: ecritLe, valeur }));
    return true;
  } catch (e) {
    return false;
  }
}

async function lireStockagePrincipal() {
  try {
    return await idbGet('cache', CLE_INSTANTANE);
  } catch (e) {
    noterErreurIdb(e);
  }
  await reinitialiserConnexionIdb();
  return idbGet('cache', CLE_INSTANTANE);
}

async function obtenirInstantane() {
  if (_instantane) return _instantane;
  const miroir = lireMiroir();
  // Un telephone qui n'a encore rien enregistre recoit les categories standards.
  // Une lecture en echec ne doit surtout pas passer pour un premier lancement :
  // la moindre saisie ecraserait alors les vraies donnees avec ces categories.
  try {
    const enCache = await lireStockagePrincipal();
    _lectureEnEchec = false;
    if (miroir && miroir.valeur && (!enCache || miroir.ecrit_le > (enCache.ecrit_le || 0))) {
      _instantane = miroir.valeur;   // le principal avait refuse la derniere ecriture
    } else {
      _instantane = enCache ? (enCache.valeur || instantaneVide()) : instantanePremierLancement();
    }
  } catch (e) {
    noterErreurIdb(e);
    _lectureEnEchec = !(miroir && miroir.valeur);
    _instantane = miroir && miroir.valeur ? miroir.valeur : instantaneVide();
  }
  return _instantane;
}

// Ecrit l'instantane dans le telephone. Renvoie false si rien n'a pu etre ecrit :
// l'appelant doit le signaler. Sans lecture fiable, on n'ecrit rien : une app
// affichee vide ne doit jamais remplacer les vraies donnees.
async function definirInstantane(snap) {
  _instantane = snap;
  if (_lectureEnEchec) {
    _stockageEnEchec = true;
    return false;
  }
  const ecritLe = Date.now();
  const okPrincipal = await idbPutSilencieux('cache', { cle: CLE_INSTANTANE, valeur: snap, ecrit_le: ecritLe });
  const okSecours = ecrireMiroir(snap, ecritLe);
  const ok = okPrincipal || okSecours;
  _stockageEnEchec = !ok;
  _secoursActif = !okPrincipal && okSecours;
  if (ok && typeof signalerChangementCoffre === 'function') signalerChangementCoffre();
  return ok;
}

// Lue a l'ecran et dans les alertes : ce qui permet de comprendre une panne a distance.
function etatStockage() {
  if (_lectureEnEchec || _stockageEnEchec) return { niveau: 'panne', code: derniereErreurIdb() || 'Lecture impossible' };
  if (_secoursActif) return { niveau: 'secours', code: derniereErreurIdb() };
  return { niveau: 'ok', code: '' };
}

// Remet a zero toutes les copies gardees dans le telephone (essais, restauration).
function oublierCopieSecours() {
  try { localStorage.removeItem(CLE_MIROIR); } catch (e) { /* sans effet */ }
}

const FORMAT_SAUVEGARDE = 'budget-app';

// Accepte un fichier exporte par l'app, ou un instantane brut (export de la V1).
function extraireDonnees(json) {
  const d = json && json.format === FORMAT_SAUVEGARDE ? json.donnees : json;
  const valide = d
    && Array.isArray(d.categories)
    && d.budgets && typeof d.budgets === 'object'
    && d.depenses && typeof d.depenses === 'object'
    && d.revenus && typeof d.revenus === 'object'
    && d.epargne && Array.isArray(d.epargne.objectifs) && Array.isArray(d.epargne.mouvements);
  return valide ? d : null;
}

function stockageEnEchec() {
  return _stockageEnEchec;
}


// ─── Calcul du mois (meme formule que le serveur) ──────────────────────────

function moisPrecedentDe(mois) {
  const [a, m] = mois.split('-').map(Number);
  return m === 1 ? `${a - 1}-12` : `${a}-${String(m - 1).padStart(2, '0')}`;
}

function calculerMois(snap, mois, _vus) {
  const vus = _vus || new Set();
  const budget = snap.budgets[mois];
  if (!budget) return null;
  if (vus.has(mois)) return null;   // securite anti-boucle
  vus.add(mois);

  const depenses = (snap.depenses[mois] || []).filter((d) => !d.supprime);
  const revenus = snap.revenus[mois] || [];
  const mouvements = (snap.epargne.mouvements || []).filter((m) => m.mois === mois);

  const totalRevenus = revenus.reduce((s, r) => s + (r.montant || 0), 0);
  const versements = mouvements.filter((m) => m.type === 'versement')
    .reduce((s, m) => s + m.montant, 0);
  const retraits = mouvements.filter((m) => m.type === 'retrait')
    .reduce((s, m) => s + m.montant, 0);

  let soldeDepart;
  if (budget.ancre) {
    soldeDepart = budget.solde_depart || 0;
  } else {
    const prec = calculerMois(snap, moisPrecedentDe(mois), vus);
    soldeDepart = prec ? prec.solde_a_reporter : 0;
  }

  const parCategorie = {};
  for (const d of depenses) {
    parCategorie[d.categorie_id] = (parCategorie[d.categorie_id] || 0) + d.montant;
  }

  const lignes = [];
  const budgetees = new Set();
  let totalPrevu = 0;
  let totalReel = 0;
  for (const l of (budget.lignes || [])) {
    if (budgetees.has(l.categorie_id)) continue;   // jamais compter deux fois
    budgetees.add(l.categorie_id);
    const prevision = l.prevision || 0;
    const reel = parCategorie[l.categorie_id] || 0;
    totalPrevu += prevision;
    totalReel += reel;
    lignes.push({
      categorie_id: l.categorie_id, prevision, reel, reste: prevision - reel,
      reconduire: !!l.reconduire,
    });
  }
  // Depenses sur une categorie non budgetee ce mois-ci : comptees quand meme,
  // sinon elles disparaitraient silencieusement du solde.
  for (const [cid, montant] of Object.entries(parCategorie)) {
    if (!budgetees.has(cid)) {
      totalReel += montant;
      lignes.push({ categorie_id: cid, prevision: 0, reel: montant,
                     reste: -montant, reconduire: false });
    }
  }

  const dispo = soldeDepart + totalRevenus + retraits;
  const objectifs = (snap.epargne.objectifs || []).filter((o) => !o.archive).map((o) => {
    const actuel = (snap.epargne.mouvements || [])
      .filter((m) => m.objectif_id === o.id)
      .reduce((s, m) => s + (m.type === 'versement' ? m.montant : -m.montant), 0);
    return { ...o, solde_actuel: actuel,
             avancement: o.cible ? actuel / o.cible : 0 };
  });

  return {
    mois,
    solde_depart: soldeDepart,
    total_revenus: totalRevenus,
    dispo_a_repartir: dispo,
    total_prevu: totalPrevu,
    total_reel: totalReel,
    reste_a_repartir: dispo - totalPrevu,
    // Les retraits sont deja dans « dispo » : ne retrancher que les versements.
    // (La V1 les ajoutait une seconde fois : un retrait de 10 000 F
    // gonflait le solde de 20 000 F.)
    solde_a_reporter: dispo - totalReel - versements,
    revenus,
    lignes,
    epargne: { versements, retraits, objectifs },
  };
}

function budgetVide(mois) {
  return { mois, ancre: false, solde_depart: 0, lignes: [] };
}

function assurerMois(snap, mois) {
  if (snap.budgets[mois]) return;
  const prec = snap.budgets[moisPrecedentDe(mois)];
  const lignes = prec
    ? prec.lignes.filter((l) => l.reconduire)
        .map((l) => ({ categorie_id: l.categorie_id, prevision: l.prevision, reconduire: true }))
    : [];
  const calcPrec = prec ? calculerMois(snap, moisPrecedentDe(mois)) : null;
  snap.budgets[mois] = {
    mois, ancre: false,
    solde_depart: calcPrec ? calcPrec.solde_a_reporter : 0,
    lignes,
  };
}


// ─── Application locale des modifications ──────────────────────────────────

function appliquerLocalement(snap, type, p) {
  switch (type) {
    case 'categorie.creer':
      if (!snap.categories.some((c) => c.id === p.id)) {
        snap.categories.push({ id: p.id, libelle: p.libelle, groupe: p.groupe, archive: false });
      }
      break;

    case 'categorie.modifier': {
      const c = snap.categories.find((x) => x.id === p.id);
      if (c) {
        if ('libelle' in p) c.libelle = p.libelle;
        if ('groupe' in p) c.groupe = p.groupe;
        if ('archive' in p) c.archive = !!p.archive;
      }
      break;
    }

    case 'categorie.supprimer':
      snap.categories = snap.categories.filter((c) => c.id !== p.id);
      for (const b of Object.values(snap.budgets)) {
        b.lignes = b.lignes.filter((l) => l.categorie_id !== p.id);
      }
      break;

    case 'ligne.definir': {
      assurerMois(snap, p.mois);
      const b = snap.budgets[p.mois];
      const l = b.lignes.find((x) => x.categorie_id === p.categorie_id);
      if (l) { l.prevision = p.prevision; l.reconduire = !!p.reconduire; }
      else b.lignes.push({ categorie_id: p.categorie_id, prevision: p.prevision,
                            reconduire: !!p.reconduire });
      break;
    }

    case 'depense.ajouter': {
      const m = p.date.slice(0, 7);
      if (!snap.depenses[m]) snap.depenses[m] = [];
      if (!snap.depenses[m].some((d) => d.id === p.id)) snap.depenses[m].push(p);
      assurerMois(snap, m);
      break;
    }

    case 'depense.supprimer':
      for (const liste of Object.values(snap.depenses)) {
        const d = liste.find((x) => x.id === p.id);
        if (d) d.supprime = true;
      }
      break;

    // Correction d'une depense depuis la liste des mouvements. Si la date
    // change de mois, la depense change de liste (et donc de budget).
    case 'depense.modifier': {
      let trouvee = null;
      let moisAncien = null;
      for (const [m, liste] of Object.entries(snap.depenses)) {
        const d = liste.find((x) => x.id === p.id);
        if (d) { trouvee = d; moisAncien = m; break; }
      }
      if (!trouvee) break;
      for (const champ of ['montant', 'categorie_id', 'date', 'note', 'moyen', 'modifie_le']) {
        if (champ in p) trouvee[champ] = p[champ];
      }
      const moisNouveau = trouvee.date.slice(0, 7);
      if (moisNouveau !== moisAncien) {
        snap.depenses[moisAncien] = snap.depenses[moisAncien].filter((x) => x.id !== p.id);
        if (!snap.depenses[moisNouveau]) snap.depenses[moisNouveau] = [];
        snap.depenses[moisNouveau].push(trouvee);
        assurerMois(snap, moisNouveau);
      }
      break;
    }

    // Correction d'un revenu. p.mois : mois ou il est range ; p.nouveau_mois :
    // mois qu'il finance desormais (par defaut, le meme).
    case 'revenu.modifier': {
      const liste = snap.revenus[p.mois] || [];
      const r = liste.find((x) => x.id === p.id);
      if (!r) break;
      for (const champ of ['montant', 'libelle', 'type', 'date', 'note', 'moyen']) {
        if (champ in p) {
          if (p[champ] == null || p[champ] === '') delete r[champ];
          else r[champ] = p[champ];
        }
      }
      const cible = p.nouveau_mois || p.mois;
      if (cible !== p.mois) {
        snap.revenus[p.mois] = liste.filter((x) => x.id !== p.id);
        if (!snap.revenus[cible]) snap.revenus[cible] = [];
        snap.revenus[cible].push(r);
        assurerMois(snap, cible);
      }
      break;
    }

    // Bouton « Annuler » apres une suppression.
    case 'depense.restaurer':
      for (const liste of Object.values(snap.depenses)) {
        const d = liste.find((x) => x.id === p.id);
        if (d) d.supprime = false;
      }
      break;

    // Le revenu est range dans le mois qu'il finance (p.mois), qui peut
    // differer du mois ou il est arrive (p.date) : un salaire verse le 30/09
    // finance octobre.
    case 'revenu.ajouter':
      if (!snap.revenus[p.mois]) snap.revenus[p.mois] = [];
      if (!snap.revenus[p.mois].some((r) => r.id === p.id)) {
        const r = { id: p.id, libelle: p.libelle, montant: p.montant, type: p.type };
        for (const champ of ['date', 'note', 'moyen', 'cree_le']) {
          if (p[champ]) r[champ] = p[champ];
        }
        snap.revenus[p.mois].push(r);
      }
      assurerMois(snap, p.mois);
      break;

    case 'revenu.supprimer':
      if (snap.revenus[p.mois]) {
        snap.revenus[p.mois] = snap.revenus[p.mois].filter((r) => r.id !== p.id);
      }
      break;

    case 'objectif.creer':
      if (!snap.epargne.objectifs.some((o) => o.id === p.id)) {
        snap.epargne.objectifs.push({ id: p.id, nom: p.nom, cible: p.cible,
                                       priorite: p.priorite || snap.epargne.objectifs.length + 1,
                                       archive: false });
      }
      break;

    case 'objectif.archiver': {
      const o = snap.epargne.objectifs.find((x) => x.id === p.id);
      if (o) o.archive = true;
      break;
    }

    case 'objectif.supprimer':
      snap.epargne.objectifs = snap.epargne.objectifs.filter((o) => o.id !== p.id);
      break;

    case 'mouvement.ajouter':
      if (!snap.epargne.mouvements.some((m) => m.id === p.id)) {
        snap.epargne.mouvements.push(p);
      }
      assurerMois(snap, p.mois);
      break;

    case 'mois.initialiser':
      assurerMois(snap, p.mois);
      break;

    // Fixe a la main le report du mois precedent (ex. : le solde reel du
    // compte au moment de commencer). Le mois devient un point de depart :
    // il ne recalcule plus son report a partir du mois d'avant.
    case 'mois.definir_solde_depart': {
      assurerMois(snap, p.mois);
      const b = snap.budgets[p.mois];
      b.ancre = true;
      b.solde_depart = p.montant;
      break;
    }

    default:
      break;
  }
  return snap;
}


// ─── Application d'une modification ────────────────────────────────────────

// Nom conserve depuis la V1 (les pages l'appellent partout). Applique la
// modification et l'enregistre aussitot dans le telephone.
async function enfilerOperation(type, payload) {
  const snap = await obtenirInstantane();
  appliquerLocalement(snap, type, payload);
  const ok = await definirInstantane(snap);
  if (!ok) {
    alert('Attention : le téléphone n’a pas pu enregistrer cette modification.\n\n'
      + 'Elle sera perdue à la fermeture de l’app. Ferme complètement l’app, rouvre-la '
      + 'et réessaie. Vérifie aussi qu’il reste de la place sur le téléphone.\n\n'
      + `Code à transmettre : ${etatStockage().code}`);
  }
  // Sur ordinateur, l'accueil affiche saisie, tableau et liste ensemble :
  // chacun se redessine quand les donnees changent.
  window.dispatchEvent(new CustomEvent('donnees-modifiees', { detail: { type } }));
  return { ok };
}
