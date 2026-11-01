// Pages rangees sous l'onglet « Plus » : elles servent rarement, elles ne
// meritent pas une place permanente dans la barre du bas.
const PAGES_PLUS = ['plus', 'categories', 'epargne', 'sauvegarde', 'tendance'];

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

function enregistrerServiceWorker() {
  if (!('serviceWorker' in navigator)) return;
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
const JOURS_AVANT_RAPPEL = 7;

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
  const derniere = lireDerniereSauvegarde();
  const jours = derniere ? joursDepuis(derniere) : null;

  let texte = '';
  let alerte = false;
  if (stockageEnEchec()) {
    texte = 'Stockage en échec'; alerte = true;
  } else if (!aDesDonnees) {
    texte = '';
  } else if (jours === null) {
    texte = 'Jamais sauvegardé'; alerte = true;
  } else {
    texte = jours === 0 ? 'Sauvegardé aujourd’hui' : `Sauvegarde : il y a ${jours} j`;
    alerte = jours >= JOURS_AVANT_RAPPEL;
  }
  badge.textContent = texte;
  badge.classList.toggle('visible', alerte);
  badge.style.display = texte ? '' : 'none';
  badge.style.cursor = 'pointer';
  badge.title = 'Ouvrir la sauvegarde';
  if (!badge._lienInstalle) {
    badge._lienInstalle = true;
    badge.addEventListener('click', () => { location.href = 'sauvegarde.html'; });
  }
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
