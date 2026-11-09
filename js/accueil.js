// Accueil : tableau de bord du mois. Sur ordinateur, la saisie (gauche) et
// la liste des mouvements (droite) l'entourent ; sur telephone, elles ont
// leurs propres onglets et seul le tableau s'affiche.

let moisAffiche = lireMoisAffiche();
let listeMouvements = null;

const NS_SVG = 'http://www.w3.org/2000/svg';
function svgEl(tag, attrs = {}) {
  const n = document.createElementNS(NS_SVG, tag);
  for (const [k, v] of Object.entries(attrs)) n.setAttribute(k, v);
  return n;
}

// ─── Infobulle des graphiques ──────────────────────────────────────────────

const infobulle = el('div', { class: 'infobulle', hidden: true });
document.body.appendChild(infobulle);

function montrerInfobulle(ev, titre, couleur, lignes) {
  const t = el('div', { class: 't' });
  if (couleur) { const p = el('span', { class: 'p' }); p.style.background = couleur; t.append(p); }
  t.append(titre);
  infobulle.replaceChildren(t, ...lignes.map((l) => el('div', { class: 'v' }, l)));
  infobulle.hidden = false;
  placerInfobulle(ev);
}
function placerInfobulle(ev) {
  if (infobulle.hidden) return;
  const r = infobulle.getBoundingClientRect();
  let x = ev.clientX + 14, y = ev.clientY + 14;
  if (x + r.width > innerWidth - 8) x = ev.clientX - r.width - 14;
  if (y + r.height > innerHeight - 8) y = ev.clientY - r.height - 14;
  infobulle.style.left = Math.max(8, x) + 'px';
  infobulle.style.top = Math.max(8, y) + 'px';
}
const cacherInfobulle = () => { infobulle.hidden = true; };
addEventListener('scroll', cacherInfobulle, { passive: true });

// ─── Calculs ───────────────────────────────────────────────────────────────

function depensesDuMois(snap, mois) {
  return (snap.depenses[mois] || []).filter((d) => !d.supprime).reduce((s, d) => s + d.montant, 0);
}

// Ce qui restera en fin de mois si l'on depense encore tout ce qui est
// prevu au budget (les categories deja depassees ne retirent rien de plus).
function finDeMoisPrevue(calc) {
  const encorePrevu = calc.lignes.reduce((s, l) => s + Math.max(0, l.prevision - l.reel), 0);
  return { encorePrevu, fin: calc.solde_a_reporter - encorePrevu };
}

// ─── Chiffres cles ─────────────────────────────────────────────────────────

function rendreChiffres(calc, snap) {
  const nDep = (snap.depenses[moisAffiche] || []).filter((d) => !d.supprime).length;
  const nRev = (calc.revenus || []).length;
  document.getElementById('k-revenus').textContent = formatXPF(calc.total_revenus);
  document.getElementById('k-revenus-sous').textContent = calc.solde_depart
    ? `+ report du mois dernier : ${calc.solde_depart < 0 ? '−' : ''}${formatXPF(Math.abs(calc.solde_depart))}`
    : (nRev ? `${nRev} entrée${nRev > 1 ? 's' : ''}` : 'Aucun revenu saisi');
  document.getElementById('k-depenses').textContent = formatXPF(calc.total_reel);
  document.getElementById('k-depenses-sous').textContent = nDep ? `${nDep} dépense${nDep > 1 ? 's' : ''}` : 'Aucune dépense';

  // Le grand chiffre : l'argent reel d'aujourd'hui. Le prevu reste a part, en
  // dessous. Un mois passe est clos : plus rien n'est prevu.
  const signe = (v) => (v < 0 ? '−' : '') + formatXPF(Math.abs(v));
  const { encorePrevu, fin } = finDeMoisPrevue(calc);
  const moisClos = moisAffiche < moisCourant();
  const reste = calc.solde_a_reporter;
  document.getElementById('k-reste').textContent = signe(reste);
  document.getElementById('k-heros').classList.toggle('negatif', reste < 0);
  document.getElementById('k-heros').classList.toggle('positif', reste > 0);
  const sous = document.getElementById('k-reste-sous');
  if (!calc.total_revenus && !calc.total_reel && !calc.solde_depart && !encorePrevu) sous.textContent = 'Rien de saisi pour ce mois';
  else if (moisClos || encorePrevu === 0) sous.textContent = 'Argent du mois moins les dépenses';
  else sous.replaceChildren(el('div', {}, `Encore prévu : ${formatXPF(encorePrevu)}`), el('div', {}, `Fin de mois prévue : ${signe(fin)}`));
}

// ─── Anneau des depenses par categorie ─────────────────────────────────────

function arc(r, a0, a1) {
  const x0 = 100 + r * Math.sin(a0), y0 = 100 - r * Math.cos(a0);
  const x1 = 100 + r * Math.sin(a1), y1 = 100 - r * Math.cos(a1);
  return `M${x0.toFixed(2)} ${y0.toFixed(2)} A${r} ${r} 0 ${a1 - a0 > Math.PI ? 1 : 0} 1 ${x1.toFixed(2)} ${y1.toFixed(2)}`;
}

function surligner(id) {
  const svg = document.getElementById('anneau-svg');
  const leg = document.getElementById('legende');
  svg.classList.toggle('focus', !!id);
  leg.classList.toggle('focus', !!id);
  svg.querySelectorAll('path[data-id]').forEach((p) => p.classList.toggle('on', p.dataset.id === id));
  leg.querySelectorAll('.leg').forEach((b) => b.classList.toggle('on', b.dataset.id === id));
}

function rendreAnneau(calc, parId) {
  const svg = document.getElementById('anneau-svg');
  const leg = document.getElementById('legende');
  const total = calc.total_reel;
  document.getElementById('anneau-total').textContent = formatXPF(total);
  document.getElementById('anneau-sous').textContent = moisLabel(moisAffiche);
  svg.replaceChildren();
  svg.classList.remove('focus');
  leg.classList.remove('focus');

  const toutes = calc.lignes.filter((l) => l.reel > 0)
    .map((l) => ({ id: l.categorie_id, nom: (parId[l.categorie_id] || {}).libelle || 'Catégorie supprimée', v: l.reel }))
    .sort((a, b) => b.v - a.v);
  const parts = toutes.slice(0, COULEURS_ANNEAU.length).map((p, i) => ({ ...p, c: COULEURS_ANNEAU[i] }));
  const reste = toutes.slice(COULEURS_ANNEAU.length);
  if (reste.length === 1) {
    parts.push({ ...reste[0], c: COULEUR_AUTRES });
  } else if (reste.length > 1) {
    parts.push({ id: 'autres', nom: `Autres (${reste.length})`, v: reste.reduce((s, p) => s + p.v, 0), c: COULEUR_AUTRES, autres: reste });
  }

  const R = 78, EP = 24, ECART = 0.03;
  if (!parts.length) {
    svg.append(svgEl('circle', { cx: 100, cy: 100, r: R, fill: 'none', stroke: '#2c2c2a', 'stroke-width': EP }));
    svg.setAttribute('aria-label', 'Aucune dépense ce mois-ci');
    leg.replaceChildren(el('div', { class: 'vide' }, 'Aucune dépense ce mois-ci.'));
    return;
  }
  svg.setAttribute('aria-label', 'Répartition des dépenses : ' + parts.map((p) => `${p.nom} ${formatPct(p.v / total)}`).join(', '));

  const detailInfobulle = (p) => {
    const lignes = [`${formatXPF(p.v)} · ${formatPct(p.v / total)}`];
    if (p.autres) lignes.push(p.autres.map((x) => x.nom).join(', '));
    return lignes;
  };
  const filtrer = (p) => { if (listeMouvements && !p.autres) listeMouvements.filtrer(p.id); };

  let a = 0;
  for (const p of parts) {
    const ouverture = p.v / total * 2 * Math.PI;
    const d = parts.length === 1
      ? arc(R, 0, Math.PI) + ' ' + arc(R, Math.PI, 2 * Math.PI - 1e-4).replace(/^M[^A]+/, '')
      : arc(R, a + ECART / 2, Math.max(a + ouverture - ECART / 2, a + ECART / 2 + 0.004));
    const chemin = svgEl('path', { d, fill: 'none', stroke: p.c, 'stroke-width': EP, 'data-id': p.id });
    chemin.addEventListener('pointerenter', (ev) => { surligner(p.id); montrerInfobulle(ev, p.nom, p.c, detailInfobulle(p)); });
    chemin.addEventListener('pointermove', placerInfobulle);
    chemin.addEventListener('pointerleave', () => { surligner(null); cacherInfobulle(); });
    chemin.addEventListener('click', () => filtrer(p));
    svg.append(chemin);
    a += ouverture;
  }

  leg.replaceChildren(...parts.map((p) => {
    const pastille = el('span', { class: 'leg-pastille' });
    pastille.style.background = p.c;
    const b = el('button', { type: 'button', class: 'leg', 'data-id': p.id, title: p.autres ? p.autres.map((x) => x.nom).join(', ') : `Voir les mouvements ${p.nom}` },
      pastille, el('span', { class: 'leg-nom' }, p.nom), el('span', { class: 'leg-montant' }, formatXPF(p.v)), el('span', { class: 'leg-pct' }, formatPct(p.v / total)));
    b.addEventListener('pointerenter', () => surligner(p.id));
    b.addEventListener('pointerleave', () => surligner(null));
    b.addEventListener('focus', () => surligner(p.id));
    b.addEventListener('blur', () => surligner(null));
    b.addEventListener('click', () => filtrer(p));
    return b;
  }));
}

// ─── Barres des 6 derniers mois ────────────────────────────────────────────

// Echelle « ronde » pour l'axe : 0, 50 000, 100 000…
function echelle(v) {
  if (!(v > 0)) return { pas: 25000, max: 100000 };
  const brut = v / 4, mag = 10 ** Math.floor(Math.log10(brut)), n = brut / mag;
  const pas = (n <= 1 ? 1 : n <= 2 ? 2 : n <= 2.5 ? 2.5 : n <= 5 ? 5 : 10) * mag;
  return { pas, max: pas * Math.ceil(v / pas) };
}

function rendreBarres(snap) {
  const mois = [];
  for (let i = 5; i >= 0; i--) {
    let m = moisAffiche;
    for (let k = 0; k < i; k++) m = moisPrecedent(m);
    mois.push(m);
  }
  const vals = mois.map((m) => depensesDuMois(snap, m));
  const { pas, max } = echelle(Math.max(...vals));

  const axe = document.getElementById('barres-y');
  const grille = document.getElementById('barres-grille');
  axe.replaceChildren();
  grille.replaceChildren();
  for (let v = 0; v <= max + 1e-6; v += pas) {
    const pos = v / max * 100 + '%';
    axe.append(el('span', { style: { bottom: pos } }, montantCourt(v)));
    if (v > 0) grille.append(el('i', { style: { bottom: pos } }));
  }

  document.getElementById('barres-colonnes').replaceChildren(...mois.map((m, i) => {
    const h = vals[i] / max * 100;
    const sel = m === moisAffiche;
    const col = el('button', { type: 'button', class: 'colonne' + (sel ? ' sel' : ''), 'aria-label': `${moisLabel(m)} : ${formatXPF(vals[i])} de dépenses`, 'aria-current': sel ? 'true' : null },
      el('span', { class: 'barre', style: { height: h + '%' } }),
      sel && vals[i] > 0 ? el('span', { class: 'valeur-barre', style: { bottom: `calc(${h}% + 6px)` } }, formatXPF(vals[i])) : null);
    col.addEventListener('pointerenter', (ev) => montrerInfobulle(ev, moisLabel(m), null, [`${formatXPF(vals[i])} de dépenses`]));
    col.addEventListener('pointermove', placerInfobulle);
    col.addEventListener('pointerleave', cacherInfobulle);
    col.addEventListener('click', () => { cacherInfobulle(); changerMois(m); });
    return col;
  }));
  document.getElementById('barres-x').replaceChildren(...mois.map((m) => el('span', { class: m === moisAffiche ? 'sel' : '' }, moisCourtLabel(m))));
}

// ─── Budgets par categorie ─────────────────────────────────────────────────

function rendreBudgets(calc, parId) {
  const zone = document.getElementById('budgets');
  const ordreGroupe = Object.fromEntries(GROUPES.map((g, i) => [g.id, i]));
  const lignes = calc.lignes
    .filter((l) => l.prevision > 0 || l.reel > 0)
    .map((l) => ({ ...l, cat: parId[l.categorie_id] }))
    .sort((a, b) => ordreGroupe[(a.cat || {}).groupe] - ordreGroupe[(b.cat || {}).groupe]);
  document.getElementById('budgets-sous').textContent = calc.total_prevu
    ? `${formatXPF(calc.total_reel)} dépensés sur ${formatXPF(calc.total_prevu)} prévus · remis à zéro chaque mois`
    : 'Aucune prévision pour ce mois';

  if (!lignes.length) {
    zone.replaceChildren(el('p', { class: 'vide' }, 'Aucun budget pour ce mois. Fixe tes prévisions dans « Modifier ».'));
    return;
  }
  zone.replaceChildren(el('div', { class: 'budgets' }, lignes.map((l) => {
    const depasse = l.reel > l.prevision;
    let note;
    if (l.prevision === 0) note = '⚠ Hors budget';
    else if (depasse) note = `⚠ Dépassé de ${formatXPF(l.reel - l.prevision)}`;
    else if (l.reel === l.prevision) note = 'Budget atteint';
    else note = `Reste ${formatXPF(l.prevision - l.reel)} · ${formatPct(l.reel / l.prevision)} utilisé`;
    const pct = l.prevision > 0 ? Math.min(100, l.reel / l.prevision * 100) : 100;
    return el('div', { class: 'bud' + (depasse ? ' depasse' : '') },
      el('div', { class: 'bud-haut' },
        el('span', { class: 'bud-nom' }, el('span', { 'aria-hidden': 'true' }, l.cat ? iconeCategorie(l.cat) : '❔'), l.cat ? l.cat.libelle : 'Catégorie supprimée'),
        el('span', { class: 'bud-chiffres' }, el('b', {}, formatXPF(l.reel)), ' / ' + formatXPF(l.prevision))),
      el('div', { class: 'bud-piste', role: 'progressbar', 'aria-label': `Budget ${l.cat ? l.cat.libelle : ''}`, 'aria-valuemin': 0, 'aria-valuemax': 100, 'aria-valuenow': Math.round(pct) },
        el('div', { class: 'bud-rempli', style: { width: pct + '%' } })),
      el('div', { class: 'bud-note' + (l.prevision > l.reel ? ' positif' : '') }, note));
  })));
}

// ─── Bienvenue ─────────────────────────────────────────────────────────────

const CLE_BIENVENUE_VUE = 'budget_bienvenue_vue';

function bienvenueVue() {
  try { return !!localStorage.getItem(CLE_BIENVENUE_VUE); } catch (e) { return false; }
}

// Tant que rien n'est saisi : disparait au premier mouvement ou sur « Compris ».
function rendreBienvenue(snap) {
  const zone = document.getElementById('bienvenue');
  const aDesMouvements = [snap.depenses, snap.revenus].some((parMois) => Object.values(parMois || {}).some((liste) => liste.length > 0));
  if (aDesMouvements || bienvenueVue()) { zone.replaceChildren(); return; }
  zone.replaceChildren(el('section', { class: 'carte guide', 'aria-labelledby': 't-bienvenue' },
    el('h3', { id: 't-bienvenue' }, 'Bienvenue 👋'),
    el('ol', {},
      el('li', {}, 'Note ton revenu avec le +.'),
      el('li', {}, 'Fixe tes prévisions dans Plus › Catégories et prévisions.'),
      el('li', {}, 'Mets tes données à l’abri : elles sont seulement dans ce téléphone. L’app te le rappellera.')),
    el('a', { class: 'bouton-principal', href: 'guide.html', style: { display: 'block', textAlign: 'center', textDecoration: 'none' } }, 'Lire le mode d’emploi'),
    el('button', { type: 'button', class: 'bouton-secondaire', id: 'bienvenue-compris', onclick: () => {
      try { localStorage.setItem(CLE_BIENVENUE_VUE, '1'); } catch (e) { /* sans effet */ }
      zone.replaceChildren();
    } }, 'Compris')));
}

// ─── App non installee ─────────────────────────────────────────────────────

const CLE_INSTALLATION_REPORTEE = 'budget_installation_reportee';

function appInstallee() {
  return navigator.standalone === true || window.matchMedia('(display-mode: standalone)').matches;
}

// Dans un navigateur ou une messagerie, le telephone peut effacer les donnees
// tout seul : c'est aussi une cause de saisies perdues, sur tous les telephones.
function rendreInstallation() {
  const zone = document.getElementById('installer-app');
  let reportee = false;
  try {
    const jusqua = localStorage.getItem(CLE_INSTALLATION_REPORTEE);
    reportee = !!jusqua && new Date(jusqua).getTime() > Date.now();
  } catch (e) { /* sans effet */ }
  if (appInstallee() || !window.matchMedia('(pointer: coarse)').matches || reportee) { zone.replaceChildren(); return; }
  zone.replaceChildren(el('section', { class: 'carte guide' },
    el('h3', {}, '⚠️ L’app n’est pas installée'),
    el('p', {}, 'Dans un navigateur ou une messagerie, tes données peuvent s’effacer toutes seules. Installe l’app sur ton écran d’accueil, puis ouvre-la depuis son icône.'),
    el('a', { class: 'bouton-principal', href: 'guide.html', style: { display: 'block', textAlign: 'center', textDecoration: 'none' } }, 'Voir comment faire'),
    el('button', { type: 'button', class: 'bouton-secondaire', id: 'installer-plus-tard', onclick: () => {
      try { localStorage.setItem(CLE_INSTALLATION_REPORTEE, new Date(Date.now() + 7 * 86400000).toISOString()); } catch (e) { /* sans effet */ }
      zone.replaceChildren();
    } }, 'Plus tard')));
}

// ─── Rappel de sauvegarde ──────────────────────────────────────────────────

const CLE_RAPPEL_REPORTE = 'budget_rappel_reporte';
const JOURS_REPORT_RAPPEL = 3;
const JOURS_REPORT_FIN_DE_MOIS = 1;   // la periode est courte : on repropose demain

function rappelReporte() {
  try {
    const jusqua = localStorage.getItem(CLE_RAPPEL_REPORTE);
    return !!jusqua && new Date(jusqua).getTime() > Date.now();
  } catch (e) { return false; }
}

// Le telephone exige un geste pour creer un fichier : on le propose a chaque
// fin de mois, ou si aucune copie n'existe encore.
async function rendreRappelSauvegarde(snap) {
  const zone = document.getElementById('rappel-sauvegarde');
  const aDesMouvements = [snap.depenses, snap.revenus].some((parMois) => Object.values(parMois || {}).some((liste) => liste.length > 0));
  const etat = await lireEtatCoffre();
  if (etat && etat.code && etat.erreur === 'acces') {
    zone.replaceChildren(el('section', { class: 'carte guide' },
      el('h3', {}, '⚠️ Sauvegarde automatique en panne'),
      el('p', {}, 'Tes données sont toujours là, mais les copies sont en pause.'),
      el('a', { class: 'bouton-principal', href: 'coffre.html', style: { display: 'block', textAlign: 'center', textDecoration: 'none' } }, 'Réparer')));
    return;
  }
  const auto = !!(etat && etat.code);
  const derniere = auto ? etat.derniere_copie : lireDerniereSauvegarde();
  const jours = derniere ? joursDepuis(derniere) : null;
  const finDeMois = !auto && sauvegardeFinDeMoisAFaire(derniere);
  const aFaire = auto
    ? jours !== null && jours >= JOURS_AVANT_RAPPEL
    : jours === null || jours >= JOURS_AVANT_RAPPEL_FICHIER || finDeMois;
  if (!aDesMouvements || !aFaire || rappelReporte()) { zone.replaceChildren(); return; }
  const depuis = jours === null ? 'Aucune copie de tes données n’existe hors de ce téléphone.' : `Ta dernière copie date de ${jours} jours.`;
  const reportJours = finDeMois ? JOURS_REPORT_FIN_DE_MOIS : JOURS_REPORT_RAPPEL;
  zone.replaceChildren(el('section', { class: 'carte guide' },
    el('h3', {}, finDeMois ? '🔒 Fin de mois : enregistre ta sauvegarde' : '🔒 Mets tes données à l’abri'),
    el('p', {}, depuis),
    el('button', { type: 'button', class: 'bouton-principal', id: 'rappel-sauvegarder', onclick: async () => {
      if (!(await creerFichierSauvegarde())) return;
      afficherToast('Sauvegarde créée ✓');
      zone.replaceChildren();
      majStatutSauvegarde();
    } }, 'Sauvegarder maintenant'),
    el('p', { style: { marginTop: '8px' } }, 'Sur iPhone, choisis ensuite « Enregistrer dans Fichiers », puis iCloud Drive.'),
    el('button', { type: 'button', class: 'bouton-secondaire', id: 'rappel-plus-tard', onclick: () => {
      try { localStorage.setItem(CLE_RAPPEL_REPORTE, new Date(Date.now() + reportJours * 86400000).toISOString()); } catch (e) { /* sans effet */ }
      zone.replaceChildren();
    } }, 'Plus tard')));
}

// ─── Page ──────────────────────────────────────────────────────────────────

async function rendreTableau() {
  document.getElementById('libelle-mois').textContent = moisLabel(moisAffiche);
  document.getElementById('mois-actuel').hidden = moisAffiche === moisCourant();
  const snap = await obtenirInstantane();
  assurerMois(snap, moisAffiche);
  const calc = calculerMois(snap, moisAffiche);
  const parId = categoriesParId(snap.categories || []);
  rendreInstallation();
  rendreBienvenue(snap);
  rendreRappelSauvegarde(snap);
  rendreChiffres(calc, snap);
  rendreAnneau(calc, parId);
  rendreBarres(snap);
  rendreBudgets(calc, parId);
  majStatutSauvegarde();
}

function changerMois(m) {
  moisAffiche = m;
  ecrireMoisAffiche(m);
  rendreTableau();
  if (listeMouvements) listeMouvements.rendre();
}

function init() {
  injecterNav('accueil');
  enregistrerServiceWorker();
  demarrerVerifications();
  document.getElementById('mois-prec').addEventListener('click', () => changerMois(moisPrecedent(moisAffiche)));
  document.getElementById('mois-suiv').addEventListener('click', () => changerMois(moisSuivant(moisAffiche)));
  document.getElementById('mois-actuel').addEventListener('click', () => changerMois(moisCourant()));
  monterSaisie(document.getElementById('zone-saisie'));
  listeMouvements = monterMouvements(document.getElementById('zone-mouvements'), () => moisAffiche);
  window.addEventListener('donnees-modifiees', rendreTableau);
  rendreTableau();
}

init();
