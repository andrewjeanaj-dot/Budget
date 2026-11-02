// Pages rangees sous l'onglet « Plus » : elles servent rarement, elles ne
// meritent pas une place permanente dans la barre du bas.
const PAGES_PLUS = ['plus', 'categories', 'epargne', 'sauvegarde', 'tendance', 'guide', 'coffre'];

// Le « + » central ouvre la saisie : a la caisse, il doit tomber sous le pouce.
function injecterNav(actif) {
  if (PAGES_PLUS.includes(actif)) actif = 'plus';
  const items = [
    { id: 'accueil', href: 'index.html', label: 'Accueil', icone: '🏠' },
    { id: 'mouvements', href: 'mouvements.html', label: 'Mouvements', icone: '🧾' },
    { id: 'ajout', href: 'ajout.html', label: 'Ajouter', icone: '+' },
    { id: 'budget', href: 'budget.html', label: 'Budget', icone: '📊' },
    { id: 'plus', href: 'plus.html', label: 'Plus', icone: '☰' },
  ];
  const nav = el('nav', { class: 'nav-bas', 'aria-label': 'Navigation' },
    items.map((it) => el('a', {
      href: it.href,
      class: 'nav-item' + (it.id === 'ajout' ? ' nav-ajout' : '') + (it.id === actif ? ' actif' : ''),
      'aria-current': it.id === actif ? 'page' : null,
    }, el('span', { class: 'nav-icone', 'aria-hidden': 'true' }, it.icone), el('span', { class: 'nav-label' }, it.label))));
  document.body.appendChild(nav);
}

// action : { libelle, faire } pour un bouton du type « Annuler ».
function afficherToast(texte, action) {
  let toast = document.querySelector('.toast');
  if (!toast) {
    toast = el('div', { class: 'toast', role: 'status', 'aria-live': 'polite' });
    document.body.appendChild(toast);
  }
  toast.replaceChildren(el('span', { class: 'toast-texte' }, texte));
  if (action) {
    toast.append(el('button', { type: 'button', onclick: () => { toast.classList.remove('visible'); action.faire(); } }, action.libelle));
  }
  toast.classList.add('visible');
  clearTimeout(toast._timeout);
  toast._timeout = setTimeout(() => toast.classList.remove('visible'), action ? 6000 : 1800);
}

// Quelque chose est-il en cours de saisie ? Recharger le ferait perdre.
function saisieEnCours() {
  if (document.querySelector('dialog[open]')) return true;
  return [...document.querySelectorAll('input:not([type=checkbox]):not([type=date]):not([type=file]), textarea')]
    .some((c) => c.value !== c.defaultValue);
}

function enregistrerServiceWorker() {
  if (!('serviceWorker' in navigator)) return;
  // Une nouvelle version vient de s'installer : on l'affiche tout de suite, sinon
  // l'ecran reste sur l'ancienne jusqu'a la prochaine fermeture de l'app. Pas de
  // rechargement a la premiere installation, ni au milieu d'une saisie.
  const dejaInstallee = !!navigator.serviceWorker.controller;
  navigator.serviceWorker.addEventListener('controllerchange', () => {
    if (!dejaInstallee) return;
    if (!saisieEnCours()) { location.reload(); return; }
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'visible' && !saisieEnCours()) location.reload();
    });
  });
  // updateViaCache:'none' : le script du service worker lui-meme ne doit
  // jamais venir du cache HTTP, sinon une correction peut ne jamais
  // atteindre le telephone.
  navigator.serviceWorker.register('service-worker.js', { updateViaCache: 'none' })
    .then((reg) => reg.update().catch(() => {}))
    .catch(() => {});
}

// ─── Sauvegarde : rappel et diagnostic ─────────────────────────────────────
// Les donnees n'existent que dans ce telephone. Le badge en haut de chaque
// page rappelle depuis quand la derniere sauvegarde fichier a ete faite.

const CLE_DERNIERE_SAUVEGARDE = 'budget_derniere_sauvegarde';
const JOURS_AVANT_RAPPEL = 7;          // sauvegarde auto : au-dela, elle a un souci
const JOURS_AVANT_RAPPEL_FICHIER = 31; // fichier : le rappel passe en fin de mois

function lireDerniereSauvegarde() {
  try { return localStorage.getItem(CLE_DERNIERE_SAUVEGARDE); } catch (e) { return null; }
}

function noterSauvegardeFaite() {
  try { localStorage.setItem(CLE_DERNIERE_SAUVEGARDE, nowIso()); } catch (e) { /* sans effet */ }
}

function joursDepuis(iso) {
  return Math.floor((Date.now() - new Date(iso).getTime()) / 86400000);
}

async function majStatutSauvegarde() {
  const badge = document.querySelector('.statut-hors-ligne');
  if (!badge) return;
  const snap = await obtenirInstantane();
  const aDesDonnees = (snap.categories || []).length > 0;
  // Avec la sauvegarde auto, c'est sa derniere copie qui compte. Sinon, le dernier fichier.
  const coffre = await lireEtatCoffre();
  const coffreActif = !!(coffre && coffre.code);
  const page = coffreActif ? 'coffre.html' : 'sauvegarde.html';
  const derniere = coffreActif ? coffre.derniere_copie : lireDerniereSauvegarde();
  const jours = derniere ? joursDepuis(derniere) : null;

  let texte = '';
  let alerte = false;
  if (stockageEnEchec()) {
    texte = 'Stockage en échec'; alerte = true;
  } else if (!aDesDonnees) {
    texte = '';
  } else if (coffreActif && coffre.erreur === 'acces') {
    texte = 'Sauvegarde en panne'; alerte = true;
  } else if (jours === null) {
    texte = coffreActif ? 'Copie en attente' : 'Jamais sauvegardé'; alerte = true;
  } else {
    texte = jours === 0 ? 'Sauvegardé aujourd’hui' : `Sauvegarde : il y a ${jours} j`;
    alerte = jours >= (coffreActif ? JOURS_AVANT_RAPPEL : JOURS_AVANT_RAPPEL_FICHIER);
  }
  badge.textContent = texte;
  badge.classList.toggle('visible', alerte);
  badge.style.display = texte ? '' : 'none';
  badge.style.cursor = 'pointer';
  badge.title = 'Ouvrir la sauvegarde';
  badge.onclick = () => { location.href = page; };
}

// Demande au navigateur de ne jamais effacer les donnees de l'app pour
// liberer de la place (iOS/Android peuvent le faire sinon).
async function demanderStockagePersistant() {
  try {
    if (navigator.storage && navigator.storage.persist) {
      return await navigator.storage.persist();
    }
  } catch (e) { /* sans effet */ }
  return false;
}

function demarrerVerifications() {
  demanderStockagePersistant();
  majStatutSauvegarde();
}
