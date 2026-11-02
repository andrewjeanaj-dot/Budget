const zone = document.getElementById('zone-coffre');
let trouve = null;

function dateHeure(iso) {
  return new Date(iso).toLocaleString('fr-FR', { day: 'numeric', month: 'long', hour: '2-digit', minute: '2-digit' });
}

function jourLisible(jour) {
  const [a, m, j] = jour.split('-').map(Number);
  return new Date(a, m - 1, j).toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
}

async function copierCode(code) {
  try {
    await navigator.clipboard.writeText(code);
    afficherToast('Code copié ✓');
  } catch (e) {
    afficherToast('Copie impossible : recopie le code à la main');
  }
}

function blocCode(code) {
  return [
    el('p', { class: 'code-coffre', id: 'code-coffre' }, code),
    el('button', { class: 'bouton-secondaire', id: 'bouton-copier', type: 'button', style: { marginTop: '0' }, onclick: () => copierCode(code) }, 'Copier le code'),
  ];
}

function champDepot(id) {
  return el('input', { class: 'champ', id, autocomplete: 'off', autocapitalize: 'none', spellcheck: 'false', placeholder: 'pseudo/budget-sauvegardes', 'aria-label': 'Dépôt privé GitHub' });
}

function champCle(id) {
  return el('input', { class: 'champ', id, type: 'password', autocomplete: 'off', autocapitalize: 'none', spellcheck: 'false', placeholder: 'github_pat_…', 'aria-label': 'Clé d’accès GitHub' });
}

function afficherInactif() {
  const depot = champDepot('champ-depot');
  const cle = champCle('champ-cle');
  const erreur = el('p', { class: 'form-err', id: 'erreur-activation', role: 'alert' });
  const bouton = el('button', { class: 'bouton-principal', id: 'bouton-activer', type: 'button' }, 'Activer la sauvegarde automatique');
  bouton.addEventListener('click', async () => {
    erreur.textContent = '';
    const nomDepot = normaliserDepot(depot.value);
    if (!nomDepot) { erreur.textContent = 'Écris le dépôt sous la forme pseudo/nom-du-depot.'; return; }
    if (!cle.value.trim()) { erreur.textContent = 'Colle ta clé d’accès GitHub.'; return; }
    bouton.disabled = true;
    const resultat = await activerCoffre(nomDepot, cle.value.trim());
    bouton.disabled = false;
    if (resultat.erreur) { erreur.textContent = resultat.erreur; return; }
    afficherCodeANoter(resultat.code);
  });
  zone.replaceChildren(el('section', { class: 'carte' },
    el('h3', {}, 'Ne plus penser à sauvegarder'),
    el('p', {}, 'Avec un compte GitHub, une copie illisible de tes données part seule à chaque changement, dans un dépôt privé à toi.'),
    el('p', {}, 'Le mode d’emploi explique comment créer le dépôt et la clé. Pas de compte GitHub ? ', el('a', { href: 'sauvegarde.html' }, 'Utilise le fichier de sauvegarde'), ' : l’app te le rappellera.'),
    el('label', { class: 'etiquette-champ', for: 'champ-depot' }, 'Dépôt privé'), depot,
    el('label', { class: 'etiquette-champ', for: 'champ-cle' }, 'Clé d’accès'), cle,
    erreur,
    bouton));
}

function afficherCodeANoter(code) {
  zone.replaceChildren(el('section', { class: 'carte' },
    el('h3', {}, 'Note ton code maintenant'),
    el('p', {}, 'C’est la seule clé de tes copies. Sans lui, personne ne pourra les relire.'),
    ...blocCode(code),
    el('p', {}, 'Range-le hors de ce téléphone : gestionnaire de mots de passe, e-mail à toi-même ou papier.'),
    el('button', { class: 'bouton-principal', id: 'bouton-note', type: 'button', onclick: afficherEtat }, 'J’ai noté mon code')));
}

function blocCleExpiree() {
  const cle = champCle('champ-nouvelle-cle');
  const erreur = el('p', { class: 'form-err', role: 'alert' });
  const bouton = el('button', { class: 'bouton-principal', id: 'bouton-nouvelle-cle', type: 'button' }, 'Remplacer la clé');
  bouton.addEventListener('click', async () => {
    bouton.disabled = true;
    const probleme = await remplacerCleCoffre(cle.value.trim());
    bouton.disabled = false;
    if (probleme) { erreur.textContent = probleme; return; }
    afficherToast('Clé remplacée ✓');
    afficherEtat();
  });
  return [cle, erreur, bouton];
}

async function afficherEtat() {
  const etat = await lireEtatCoffre();
  if (!etat || !etat.code) { afficherInactif(); return; }
  const contenu = [el('h3', {}, etat.erreur === 'acces' ? '⚠️ Sauvegarde automatique en panne' : '✅ Sauvegarde automatique activée')];
  if (etat.erreur === 'acces') {
    contenu.push(el('p', { id: 'situation-coffre' }, 'GitHub refuse la clé d’accès : elle a expiré ou le dépôt a changé. Les copies sont en pause, tes données restent dans ce téléphone. Colle une nouvelle clé :'), ...blocCleExpiree());
  } else if (etat.a_envoyer) {
    contenu.push(el('p', { id: 'situation-coffre' }, etat.derniere_copie
      ? `Une copie partira dès que possible. Dernière copie : ${dateHeure(etat.derniere_copie)}.`
      : 'La première copie partira dès qu’il y aura du réseau.'));
  } else {
    contenu.push(el('p', { id: 'situation-coffre' }, `Tout est à l’abri. Dernière copie : ${dateHeure(etat.derniere_copie)}.`));
  }
  contenu.push(
    el('p', {}, `Dépôt : ${etat.depot}`),
    el('details', {}, el('summary', { id: 'voir-code' }, 'Voir mon code'), ...blocCode(etat.code)),
    el('button', { class: 'bouton-texte danger', id: 'bouton-arreter', type: 'button', style: { marginTop: '12px' }, onclick: arreter }, 'Arrêter la sauvegarde automatique'));
  zone.replaceChildren(el('section', { class: 'carte' }, ...contenu));
}

async function arreter() {
  if (!confirm('Arrêter la sauvegarde automatique sur ce téléphone ?\n\nTes données restent ici. Tes anciennes copies restent sur GitHub : pour les effacer, supprime le dépôt.')) return;
  await arreterCoffre();
  afficherToast('Sauvegarde automatique arrêtée');
  afficherEtat();
}

async function chercher() {
  const erreur = document.getElementById('erreur-recuperation');
  const choix = document.getElementById('zone-copies');
  erreur.textContent = '';
  choix.hidden = true;
  const depot = normaliserDepot(document.getElementById('champ-depot-recup').value);
  const cleAcces = document.getElementById('champ-cle-recup').value.trim();
  const code = normaliserCodeCoffre(document.getElementById('champ-code').value);
  if (!depot) { erreur.textContent = 'Écris le dépôt sous la forme pseudo/nom-du-depot.'; return; }
  if (!cleAcces) { erreur.textContent = 'Colle ta clé d’accès GitHub.'; return; }
  if (!code) { erreur.textContent = 'Ce code n’est pas complet : il compte 24 caractères.'; return; }
  const probleme = await verifierDepot(depot, cleAcces);
  if (probleme) { erreur.textContent = probleme; return; }
  let jours;
  try {
    jours = await listerCopiesCoffre(depot, cleAcces, code);
  } catch (e) {
    erreur.textContent = 'Recherche impossible. Vérifie ta connexion, puis réessaie.';
    return;
  }
  if (jours.length === 0) { erreur.textContent = 'Aucune copie trouvée avec ce code. Vérifie-le.'; return; }
  trouve = { depot, cleAcces, code };
  document.getElementById('choix-copie').replaceChildren(...jours.map((j) => el('option', { value: j }, jourLisible(j))));
  choix.hidden = false;
}

async function recuperer() {
  const erreur = document.getElementById('erreur-recuperation');
  const jour = document.getElementById('choix-copie').value;
  let donnees;
  try {
    donnees = await lireCopieCoffre(trouve.depot, trouve.cleAcces, trouve.code, jour);
  } catch (e) {
    donnees = null;
  }
  if (!donnees) { erreur.textContent = 'Cette copie n’a pas pu être ouverte. Rien n’a été modifié.'; return; }
  if (!confirm(`Récupérer la copie du ${jourLisible(jour)} ?\n\nLes données actuelles de ce téléphone seront REMPLACÉES.`)) return;
  if (!(await restaurerDepuisCoffre(trouve.depot, trouve.cleAcces, trouve.code, donnees, jour))) {
    erreur.textContent = 'Le téléphone n’a pas pu enregistrer ces données.';
    return;
  }
  document.getElementById('zone-copies').hidden = true;
  ['champ-code', 'champ-cle-recup', 'champ-depot-recup'].forEach((id) => { document.getElementById(id).value = ''; });
  afficherToast('Données récupérées ✓');
  afficherEtat();
  majStatutSauvegarde();
}

function init() {
  injecterNav('coffre');
  enregistrerServiceWorker();
  demarrerVerifications();
  document.getElementById('bouton-chercher').addEventListener('click', chercher);
  document.getElementById('bouton-recuperer').addEventListener('click', recuperer);
  afficherEtat();
}

init();
