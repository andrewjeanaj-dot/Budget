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

// Copies de secours dans le telephone, dans deux autres stockages du navigateur :
// si l'un refuse une ecriture, sur n'importe quelle version, la saisie reste
// ailleurs. A la lecture, la copie la plus recente gagne.
const CACHE_DONNEES = 'budget-donnees';
const ADRESSE_DONNEES = 'budget-donnees.json';

async function lireCacheDonnees() {
  try {
    const cache = await caches.open(CACHE_DONNEES);
    const reponse = await cache.match(ADRESSE_DONNEES);
    return reponse ? await reponse.json() : null;
  } catch (e) {
    return null;
  }
}

async function ecrireCacheDonnees(valeur, ecritLe) {
  try {
    const cache = await caches.open(CACHE_DONNEES);
    await cache.put(ADRESSE_DONNEES, new Response(JSON.stringify({ ecrit_le: ecritLe, valeur }), { headers: { 'Content-Type': 'application/json' } }));
    return true;
  } catch (e) {
    return false;
  }
}

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

function oublierMiroir() {
  try { localStorage.removeItem(CLE_MIROIR); } catch (e) { /* sans effet */ }
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

// A-t-on deja utilise l'app sur ce telephone ? Si le stockage principal est
// illisible, c'est ce qui distingue un nouvel utilisateur d'une vraie panne.
function dejaUtilisee() {
  try {
    return !!(localStorage.getItem('budget_device_id') || localStorage.getItem('budget_derniere_sauvegarde'));
  } catch (e) {
    return false;
  }
}

// IndexedDB peut mettre de longues secondes a repondre, surtout sur un telephone
// presque plein. L'ecran n'attend donc jamais : la copie rapide (localStorage) est
// lue et ecrite en premier, les deux autres stockages suivent en arriere-plan.
const PATIENCE_NOUVEL_UTILISATEUR_MS = 1500;
const PATIENCE_ANCIEN_UTILISATEUR_MS = 20000;
let _ecritLe = 0;             // date de la version affichee
let _lectureEnCours = null;
let _verification = null;
let _aEcrire = null;          // derniere version a ecrire, les intermediaires sont sautees
let _boucleEcriture = null;
let _dernierResultat = { principal: true, cache: true };
let _minuteurEcritures = null;
const DELAI_REGROUPEMENT_MS = 800;   // plusieurs saisies rapprochees : une seule ecriture
const CLE_PRINCIPAL_A_JOUR = 'budget_principal_a_jour';

// Date de la version que les stockages lents ont bien recue : si c'est celle de la
// copie rapide, inutile de les solliciter a chaque ecran.
function dateStockagesAJour() {
  try { return Number(localStorage.getItem(CLE_PRINCIPAL_A_JOUR)) || 0; } catch (e) { return 0; }
}

function noterStockagesAJour(ecritLe) {
  try { localStorage.setItem(CLE_PRINCIPAL_A_JOUR, String(ecritLe)); } catch (e) { /* sans effet */ }
}

function lancerEcritures() {
  clearTimeout(_minuteurEcritures);
  _minuteurEcritures = null;
  // Rien a ecrire : surtout ne pas demarrer, la boucle resterait marquee en cours.
  if (!_boucleEcriture && !_aEcrire) return Promise.resolve(_dernierResultat);
  if (!_boucleEcriture) {
    _boucleEcriture = (async () => {
      while (_aEcrire) {
        const { snap, ecritLe } = _aEcrire;
        _aEcrire = null;
        const [principal, cache] = await Promise.all([
          idbPutSilencieux('cache', { cle: CLE_INSTANTANE, valeur: snap, ecrit_le: ecritLe }),
          ecrireCacheDonnees(snap, ecritLe),
        ]);
        _dernierResultat = { principal, cache };
        _secoursActif = !principal;
        if (principal && cache) noterStockagesAJour(ecritLe);
      }
      _boucleEcriture = null;
      return _dernierResultat;
    })();
  }
  return _boucleEcriture;
}

function programmerEcritures() {
  clearTimeout(_minuteurEcritures);
  _minuteurEcritures = setTimeout(lancerEcritures, DELAI_REGROUPEMENT_MS);
}

// L'app passe en arriere-plan ou change d'ecran : on ecrit sans attendre. Si le
// telephone coupe avant la fin, la prochaine ouverture rattrape.
function ecrireAvantDePartir() {
  if (_minuteurEcritures) lancerEcritures();
}
window.addEventListener('pagehide', ecrireAvantDePartir);
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'hidden') ecrireAvantDePartir();
});

// Attend la fin du travail en arriere-plan.
async function attendreEcritures() {
  ecrireAvantDePartir();
  if (_verification) await _verification;
  if (_boucleEcriture) await _boucleEcriture;
}

// Allege ce qui est garde : champs qui ne servent plus, et depenses supprimees
// (le bouton « Annuler » ne survit pas au changement d'ecran).
function compacterDepense(d) {
  delete d.device_id;
  delete d.source;
  delete d.modifie_le;
  if (!d.supprime) delete d.supprime;
  return d;
}

function compacterInstantane(snap) {
  for (const mois of Object.keys(snap.depenses || {})) {
    snap.depenses[mois] = snap.depenses[mois].filter((d) => !d.supprime).map(compacterDepense);
  }
  return snap;
}

function adopterVersion(valeur, ecritLe) {
  _instantane = valeur;
  _ecritLe = ecritLe;
  _lectureEnEchec = false;
  _stockageEnEchec = false;
  window.dispatchEvent(new CustomEvent('donnees-modifiees', { detail: { type: 'relecture' } }));
}

// Compare au stockage principal, sans faire attendre l'ecran : il recoit la version
// la plus recente, ou la donne s'il est le seul a l'avoir.
function verifierPrincipal() {
  _verification = (async () => {
    try {
      const copieCache = await lireCacheDonnees();
      if (copieCache && copieCache.valeur && copieCache.ecrit_le > _ecritLe) adopterVersion(copieCache.valeur, copieCache.ecrit_le);
      const enCache = await lireStockagePrincipal();
      const date = enCache ? (enCache.ecrit_le || 0) : -1;
      if (enCache && enCache.valeur && date > _ecritLe) {
        adopterVersion(enCache.valeur, date);
      } else if (date < _ecritLe && !_aEcrire && _instantane) {
        _aEcrire = { snap: _instantane, ecritLe: _ecritLe };
        lancerEcritures();
      }
    } catch (e) {
      noterErreurIdb(e);
    }
    _verification = null;
  })();
}

function apresDelai(ms, valeur) {
  return new Promise((resolve) => setTimeout(() => resolve(valeur), ms));
}

async function chargerInstantane() {
  // Une copie rapide : l'ecran s'affiche tout de suite.
  const miroir = lireMiroir();
  if (miroir && miroir.valeur) {
    _instantane = miroir.valeur;
    _ecritLe = miroir.ecrit_le || 0;
    if (dateStockagesAJour() !== _ecritLe) verifierPrincipal();
    return _instantane;
  }
  const copieCache = await Promise.race([lireCacheDonnees(), apresDelai(1000, null)]);
  if (copieCache && copieCache.valeur) {
    _instantane = copieCache.valeur;
    _ecritLe = copieCache.ecrit_le || 0;
    verifierPrincipal();
    return _instantane;
  }

  // Un telephone qui n'a encore rien enregistre recoit les categories standards.
  // Une lecture en echec chez quelqu'un qui a deja des donnees ne doit surtout pas
  // passer pour un premier lancement : une saisie les ecraserait.
  const ancien = dejaUtilisee();
  const lecture = lireStockagePrincipal();
  const resultat = await Promise.race([
    lecture.then((enCache) => ({ lu: true, enCache })),
    apresDelai(ancien ? PATIENCE_ANCIEN_UTILISATEUR_MS : PATIENCE_NOUVEL_UTILISATEUR_MS, { lu: false, delai: true }),
  ]).catch((e) => {
    noterErreurIdb(e);
    return { lu: false, delai: false };
  });

  if (resultat.lu) {
    _lectureEnEchec = false;
    const enCache = resultat.enCache;
    _instantane = enCache ? (enCache.valeur || instantaneVide()) : instantanePremierLancement();
    _ecritLe = enCache ? (enCache.ecrit_le || 0) : 0;
    // Donnees d'avant les copies de secours : on les protege des maintenant.
    if (enCache && enCache.valeur) {
      ecrireMiroir(enCache.valeur, _ecritLe);
      const dateLue = _ecritLe;
      ecrireCacheDonnees(enCache.valeur, dateLue).then((ok) => { if (ok) noterStockagesAJour(dateLue); });
    }
    return _instantane;
  }

  if (ancien) {
    _lectureEnEchec = true;
    _instantane = instantaneVide();
  } else {
    _instantane = instantanePremierLancement();
  }
  // Le stockage etait seulement lent : sa reponse est prise en compte a son arrivee.
  if (resultat.delai) {
    noterErreurIdb({ name: 'Lenteur', message: 'le stockage principal met trop de temps à répondre' });
    lecture.then((enCache) => {
      if (_ecritLe !== 0) return;   // une saisie a deja eu lieu, elle est plus recente
      if (enCache && enCache.valeur) adopterVersion(enCache.valeur, enCache.ecrit_le || 0);
      else if (_lectureEnEchec) adopterVersion(instantanePremierLancement(), 0);
    }).catch(noterErreurIdb);
  }
  return _instantane;
}

async function obtenirInstantane() {
  if (_instantane) return _instantane;
  if (!_lectureEnCours) {
    _lectureEnCours = chargerInstantane().then(compacterInstantane).finally(() => { _lectureEnCours = null; });
  }
  return _lectureEnCours;
}

// Ecrit l'instantane. Renvoie false si rien n'a pu etre ecrit : l'appelant doit le
// signaler. Sans lecture fiable, on n'ecrit rien : une app affichee vide ne doit
// jamais remplacer les vraies donnees.
async function definirInstantane(snap) {
  _instantane = snap;
  if (_lectureEnEchec) {
    _stockageEnEchec = true;
    return false;
  }
  const ecritLe = Math.max(Date.now(), _ecritLe + 1);
  _ecritLe = ecritLe;
  const okRapide = ecrireMiroir(snap, ecritLe);
  _aEcrire = { snap, ecritLe };
  let ok = okRapide;
  if (okRapide) {
    programmerEcritures();
  } else {
    // La copie rapide a echoue : on attend une autre preuve, le cache d'abord car
    // IndexedDB peut etre tres lent.
    const ecritures = lancerEcritures();
    ok = await ecrireCacheDonnees(snap, ecritLe);
    if (!ok) ok = (await ecritures).principal;
    // L'ancienne copie rapide ne s'efface qu'une fois une version plus recente en
    // lieu sur : si tout est plein, elle reste la derniere bonne copie.
    if (ok) oublierMiroir();
  }
  _stockageEnEchec = !ok;
  if (ok && typeof signalerChangementCoffre === 'function') signalerChangementCoffre();
  return ok;
}

// Lue a l'ecran et dans les alertes : ce qui permet de comprendre une panne a distance.
function etatStockage() {
  if (_lectureEnEchec || _stockageEnEchec) return { niveau: 'panne', code: derniereErreurIdb() || 'Lecture impossible' };
  if (_secoursActif) return { niveau: 'secours', code: derniereErreurIdb() };
  return { niveau: 'ok', code: '' };
}

// Remet a zero les copies de secours (essais).
async function oublierCopieSecours() {
  oublierMiroir();
  try { localStorage.removeItem(CLE_PRINCIPAL_A_JOUR); } catch (e) { /* sans effet */ }
  try { await caches.delete(CACHE_DONNEES); } catch (e) { /* sans effet */ }
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
  const avant = JSON.stringify(snap);
  appliquerLocalement(snap, type, payload);
  const ok = await definirInstantane(snap);
  if (!ok) {
    // Retour a l'etat d'avant : un nouvel essai ne doit pas compter la saisie deux fois.
    _instantane = JSON.parse(avant);
    alert('Attention : cette saisie n’a pas pu être enregistrée.\n\n'
      + 'Elle n’est pas comptée. Ferme complètement l’app, rouvre-la et réessaie. '
      + 'Vérifie aussi qu’il reste de la place sur le téléphone.\n\n'
      + `Code à transmettre : ${etatStockage().code}`);
    return { ok };
  }
  // Sur ordinateur, l'accueil affiche saisie, tableau et liste ensemble :
  // chacun se redessine quand les donnees changent.
  window.dispatchEvent(new CustomEvent('donnees-modifiees', { detail: { type } }));
  return { ok };
}
