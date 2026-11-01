const moisEnCours = moisCourant();
let lignesParCategorie = {};

function init() {
  injecterNav('categories');
  enregistrerServiceWorker();
  demarrerVerifications();
  document.getElementById('libelle-mois-courant').textContent = moisLabel(moisEnCours);
  document.getElementById('libelle-mois-nouvelle').textContent = moisLabel(moisEnCours).toLowerCase();
  document.getElementById('bouton-ajouter').addEventListener('click', ajouterCategorie);
  document.getElementById('nouvelle-libelle').addEventListener('keydown', (e) => { if (e.key === 'Enter') ajouterCategorie(); });
  document.getElementById('nouvelle-prevision').addEventListener('input', (e) => {
    const chiffres = e.target.value.replace(/[^0-9]/g, '');
    e.target.value = chiffres ? Number(chiffres).toLocaleString('fr-FR') : '';
  });
  charger();
}


async function charger() {
  const [resCats, resMois] = await Promise.all([
    chargerCategories(),
    chargerMois(moisEnCours),
  ]);
  lignesParCategorie = {};
  if (resMois.donnees) {
    for (const l of resMois.donnees.lignes) lignesParCategorie[l.categorie_id] = l;
  }
  majStatutSauvegarde();
  afficher(resCats.categories);
}

function afficher(categories) {
  const conteneur = document.getElementById('groupes-categories');
  conteneur.innerHTML = '';
  const actives = categories.filter((c) => !c.archive);
  const archivees = categories.filter((c) => c.archive);


  // Chaque groupe est une carte ; les categories sont les lignes a l'interieur.
  for (const g of GROUPES) {
    const cats = actives.filter((c) => c.groupe === g.id);
    const carte = document.createElement('div');
    carte.className = 'carte';
    carte.innerHTML = `<h3 style="margin-top:0; display:flex; justify-content:space-between; align-items:baseline">
        <span><span class="pastille-groupe" style="--cat-couleur:${g.couleur}"></span>${g.label}</span>
        <span style="font-size:0.68rem; font-weight:400; color:var(--texte-att); text-transform:uppercase; letter-spacing:0.03em">Groupe</span>
      </h3>`;
    if (cats.length === 0) {
      const vide = document.createElement('p');
      vide.className = 'vide';
      vide.style.cssText = 'padding:8px 0; font-size:0.85rem';
      vide.textContent = 'Aucune catégorie dans ce groupe.';
      carte.appendChild(vide);
    } else {
      for (const c of cats) carte.appendChild(ligneCategorie(c));
    }
    conteneur.appendChild(carte);
  }

  if (archivees.length > 0) {
    const carte = document.createElement('div');
    carte.className = 'carte';
    carte.innerHTML = '<h3 style="margin-top:0; color:var(--texte-att)">Archivées</h3>';
    for (const c of archivees) {
      const ligne = document.createElement('div');
      ligne.className = 'ligne-liste';
      ligne.innerHTML = `<span style="color:var(--texte-att)">${escapeHtml(c.libelle)}</span>
        <button class="icone-action" title="Réactiver">↺</button>`;
      ligne.querySelector('button').addEventListener('click', () => reactiverCategorie(c.id));
      carte.appendChild(ligne);
    }
    conteneur.appendChild(carte);
  }

  if (actives.length === 0 && archivees.length === 0) {
    conteneur.innerHTML = '<p class="vide">Aucune catégorie. Crée-en une avec « Nouvelle catégorie » ci-dessous.</p>';
  }
}

function ligneCategorie(c) {
  const ligneBudget = lignesParCategorie[c.id] || { prevision: 0, reconduire: false };
  const div = document.createElement('div');
  div.className = 'ligne-liste';
  div.dataset.id = c.id;
  div.style.flexWrap = 'wrap';
  div.innerHTML = `
    <span style="flex:1; min-width:120px; font-weight:600"><span class="icone-liste" aria-hidden="true">${iconeCategorie(c)}</span>${escapeHtml(c.libelle)}</span>
    <span class="actions">
      <button class="icone-action" data-action="renommer">✎</button>
      <button class="icone-action" data-action="supprimer">✕</button>
    </span>
    <div style="display:flex; align-items:center; gap:10px; width:100%; margin-top:4px">
      <input type="number" class="champ" data-action="prevision" placeholder="Prévision" value="${ligneBudget.prevision || ''}" style="margin-bottom:0; max-width:120px">
      <label style="display:flex; align-items:center; gap:6px; font-size:0.85rem; color:var(--texte-att)">
        <input type="checkbox" data-action="reconduire" ${ligneBudget.reconduire ? 'checked' : ''}>
        Reconduire
      </label>
    </div>`;

  div.querySelector('[data-action="renommer"]').addEventListener('click', () => renommerCategorie(c));
  div.querySelector('[data-action="supprimer"]').addEventListener('click', () => supprimerCategorie(c));
  div.querySelector('[data-action="prevision"]').addEventListener('change', (e) => majLigneBudget(c.id, e));
  div.querySelector('[data-action="reconduire"]').addEventListener('change', (e) => majLigneBudget(c.id, e));
  return div;
}

async function majLigneBudget(categorieId, evenement) {
  const div = evenement.target.closest('.ligne-liste');
  const prevision = lireMontant(div.querySelector('[data-action="prevision"]').value);
  const reconduire = div.querySelector('[data-action="reconduire"]').checked;
  await enfilerOperation('ligne.definir', { mois: moisEnCours, categorie_id: categorieId, prevision, reconduire });
  lignesParCategorie[categorieId] = { categorie_id: categorieId, prevision, reconduire };
  afficherToast('Enregistré');
}

// La nouvelle categorie apparait dans son groupe, souvent plus haut que le
// formulaire : on y amene l'ecran et on la met en evidence, sinon on croit
// que le clic n'a rien fait.
async function ajouterCategorie() {
  const bouton = document.getElementById('bouton-ajouter');
  const champLibelle = document.getElementById('nouvelle-libelle');
  const champPrevision = document.getElementById('nouvelle-prevision');
  const caseReconduire = document.getElementById('nouvelle-reconduire');
  const libelle = champLibelle.value.trim();
  const groupe = document.getElementById('nouvelle-groupe').value;
  if (!libelle) { champLibelle.focus(); return; }
  if (bouton.disabled) return;
  bouton.disabled = true;

  const id = genererUuid();
  const prevision = lireMontant(champPrevision.value);
  const reconduire = caseReconduire.checked;
  await enfilerOperation('categorie.creer', { id, libelle, groupe });
  if (prevision > 0 || reconduire) {
    await enfilerOperation('ligne.definir', { mois: moisEnCours, categorie_id: id, prevision, reconduire });
  }
  champLibelle.value = '';
  champPrevision.value = '';
  caseReconduire.checked = true;
  bouton.disabled = false;
  document.getElementById('bloc-nouvelle').open = false;
  afficherToast(`« ${libelle} » ajoutée dans ${groupeInfo(groupe).label}`);
  await charger();
  const ligne = document.querySelector(`.ligne-liste[data-id="${id}"]`);
  if (ligne) {
    ligne.scrollIntoView({ behavior: 'smooth', block: 'center' });
    ligne.classList.add('nouvelle');
    setTimeout(() => ligne.classList.remove('nouvelle'), 2500);
  }
}

async function renommerCategorie(c) {
  const nouveau = prompt('Renommer la catégorie :', c.libelle);
  if (!nouveau || nouveau.trim() === '' || nouveau === c.libelle) return;
  await enfilerOperation('categorie.modifier', { id: c.id, libelle: nouveau.trim() });
  charger();
}

async function supprimerCategorie(c) {
  if (!confirm(`Supprimer « ${c.libelle} » ?`)) return;

  // Verification faite localement : faite dans le telephone.
  const snap = await obtenirInstantane();
  const utilisee = Object.values(snap.depenses)
    .some((liste) => liste.some((d) => d.categorie_id === c.id && !d.supprime));

  if (utilisee) {
    if (!confirm(`« ${c.libelle} » a déjà des dépenses enregistrées : suppression impossible.\nL’archiver à la place (elle disparaît des listes mais l’historique est conservé) ?`)) {
      return;
    }
    await enfilerOperation('categorie.modifier', { id: c.id, archive: true });
    afficherToast('Catégorie archivée');
  } else {
    await enfilerOperation('categorie.supprimer', { id: c.id });
    afficherToast('Catégorie supprimée');
  }
  charger();
}

async function reactiverCategorie(id) {
  await enfilerOperation('categorie.modifier', { id, archive: false });
  charger();
}

function escapeHtml(s) {
  const d = document.createElement('div');
  d.textContent = s == null ? '' : String(s);
  // Les guillemets aussi : un texte venant d'un fichier importe ne doit
  // jamais pouvoir sortir d'un attribut HTML.
  return d.innerHTML.replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

init();
