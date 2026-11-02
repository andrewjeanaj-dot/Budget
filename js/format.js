// A changer en meme temps que VERSION dans service-worker.js : affichee dans
// « Plus », elle dit quelle version tourne vraiment sur le telephone.
const VERSION_APP = 'v18';

const GROUPES = [
  { id: 'essentielles', label: 'Essentielles', couleur: '#3987e5' },
  { id: 'loisirs', label: 'Loisirs', couleur: '#d55181' },
  { id: 'projet_perso', label: 'Projet perso', couleur: '#199e70' },
  { id: 'imprevus', label: 'Imprévus', couleur: '#c98500' },
];

// Moyen de paiement de chaque mouvement. Indispensable au rapprochement :
// les especes n'apparaissent jamais sur le releve bancaire. Le prelevement
// n'est pas propose a la saisie : il viendra de l'import du releve.
const MOYENS = [
  { id: 'carte', label: 'Carte', icone: '💳' },
  { id: 'especes', label: 'Espèces', icone: '💵' },
  { id: 'virement', label: 'Virement', icone: '🔁' },
  { id: 'prelevement', label: 'Prélèvement', icone: '🏦', saisie: false },
];

function moyenInfo(id) {
  return MOYENS.find((m) => m.id === id) || null;
}

// Libelles proposes pour un revenu (le premier, Salaire, est un revenu fixe).
const LIBELLES_REVENU = [
  { libelle: 'Salaire', icone: '💼', type: 'fixe' },
  { libelle: 'Prime', icone: '🎁', type: 'variable' },
  { libelle: 'Remboursement', icone: '↩️', type: 'variable' },
  { libelle: 'Vente', icone: '🏷️', type: 'variable' },
  { libelle: 'Autre revenu', icone: '➕', type: 'variable' },
];

// Couleurs de l'anneau : nuances d'orange, ordonnees pour que deux parts
// voisines restent distinctes (verifie, y compris pour un daltonien). Les
// 6 plus grosses categories du mois ont une part, le reste va dans « Autres ».
const COULEURS_ANNEAU = ['#ff7a1a', '#ffd29a', '#b8420f', '#ffb35c', '#d9480f', '#fcc419'];
const COULEUR_AUTRES = '#8a8580';

// Construit un element du DOM. Le texte passe toujours par des noeuds texte :
// un libelle ou une note n'est jamais interprete comme du HTML.
function el(tag, attrs = {}, ...enfants) {
  const n = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (v == null || v === false) continue;
    if (k === 'class') n.className = v;
    else if (k === 'style') Object.assign(n.style, v);
    else if (k.startsWith('on')) n.addEventListener(k.slice(2), v);
    else n.setAttribute(k, v === true ? '' : v);
  }
  n.append(...enfants.flat().filter((x) => x != null && x !== false));
  return n;
}

const NOMS_MOIS = ['janvier', 'février', 'mars', 'avril', 'mai', 'juin', 'juillet',
  'août', 'septembre', 'octobre', 'novembre', 'décembre'];

// Lit un montant tape par l'utilisateur. On ne garde que les chiffres :
// « 12 000 », « 12.000 » ou « 12 000 F » valent tous 12 000. Sans cela,
// parseInt('12 000') renvoie 12 et le montant est faux sans prevenir.
function lireMontant(texte) {
  const chiffres = String(texte == null ? '' : texte).replace(/[^0-9]/g, '');
  return chiffres ? parseInt(chiffres, 10) : 0;
}

// « 12 000 » avec une vraie espace : celle du navigateur, trop fine, colle les
// chiffres a l'ecran. Insecable, pour ne jamais couper un montant en deux.
function formatNombre(n) {
  return n.toLocaleString('fr-FR').replace(/\s/g, ' ');
}

function formatXPF(montant) {
  const n = Math.round(montant || 0);
  return formatNombre(n) + ' F';
}

function moisLabel(moisStr) {
  const [a, m] = moisStr.split('-').map(Number);
  const nom = NOMS_MOIS[m - 1];
  return nom.charAt(0).toUpperCase() + nom.slice(1) + ' ' + a;
}

// « mar. 21 oct. » : la date courte des listes.
function dateCourte(iso) {
  const [a, m, j] = iso.split('-').map(Number);
  return new Date(a, m - 1, j).toLocaleDateString('fr-FR', { weekday: 'short', day: 'numeric', month: 'short' });
}

// « oct. » : le mois sous les barres du graphique.
function moisCourtLabel(moisStr) {
  const [a, m] = moisStr.split('-').map(Number);
  return new Date(a, m - 1, 1).toLocaleDateString('fr-FR', { month: 'short' });
}

function formatPct(r) {
  if (r > 0 && r < 0.005) return '< 1 %';
  return Math.round(r * 100) + ' %';
}

function moisSuivant(mois) {
  const [a, m] = mois.split('-').map(Number);
  return m === 12 ? `${a + 1}-01` : `${a}-${String(m + 1).padStart(2, '0')}`;
}

function moisPrecedent(mois) {
  const [a, m] = mois.split('-').map(Number);
  return m === 1 ? `${a - 1}-12` : `${a}-${String(m - 1).padStart(2, '0')}`;
}

function moisCourant() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

function dateAujourdhui() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function genererUuid() {
  if (window.crypto && crypto.randomUUID) return crypto.randomUUID().replace(/-/g, '');
  return 'xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx'.replace(/x/g, () => Math.floor(Math.random() * 16).toString(16));
}

function nowIso() {
  return new Date().toISOString();
}

// Icone d'une categorie, devinee d'apres son nom (sinon celle de son groupe).
// Des emojis : ils s'affichent en couleur sur tous les telephones, sans
// fichier a telecharger.
const ICONES_PAR_MOT = [
  [/course|hyper|super|march|carrefour|champion/i, '🛒'],
  [/essence|carbur|transport|voiture|taxi|bus|truck/i, '⛽'],
  [/resto|restaurant|fast|mcdo|snack|roulotte|caf[eé]/i, '🍽️'],
  [/compte commun|loyer|maison|logement/i, '🏠'],
  [/pr[eê]t|cr[eé]dit|banque/i, '🏦'],
  [/assurance/i, '🛡️'],
  [/t[eé]l[eé]phone|internet|viti|mobile|box/i, '📱'],
  [/[eé]lectricit|edt|eau/i, '⚡'],
  [/fitness|sport|gym|salle/i, '🏋️'],
  [/abonnement|netflix|musique|spotify|ia\b|openai|claude/i, '📺'],
  [/sortie|activit|loisir|cin[eé]/i, '🎉'],
  [/shopping|cadeau|v[eê]tement/i, '🛍️'],
  [/sant[eé]|pharma|m[eé]decin|docteur/i, '💊'],
  [/projet/i, '🎯'],
  [/impr[eé]vu/i, '⚠️'],
  [/coiffeur|beaut/i, '💇'],
  [/[eé]pargne/i, '🐷'],
];
const ICONES_PAR_GROUPE = { essentielles: '📌', loisirs: '🎈', projet_perso: '🎯', imprevus: '❗' };

function iconeCategorie(c) {
  const nom = (c && c.libelle) || '';
  for (const [motif, icone] of ICONES_PAR_MOT) if (motif.test(nom)) return icone;
  return ICONES_PAR_GROUPE[c && c.groupe] || '📌';
}

function groupeInfo(groupeId) {
  return GROUPES.find((g) => g.id === groupeId) || GROUPES[0];
}

function categoriesParId(categories) {
  const m = {};
  for (const c of categories) m[c.id] = c;
  return m;
}
