function init() {
  injecterNav('epargne');
  enregistrerServiceWorker();
  demarrerVerifications();

  document.getElementById('obj-ajouter').addEventListener('click', ajouterObjectif);
  document.getElementById('mvt-enregistrer').addEventListener('click', enregistrerMouvement);

  charger();
}

async function charger() {
  const { donnees, horsLigne } = await chargerMois(moisCourant());
  majStatutSauvegarde();
  if (!donnees) {
    document.getElementById('liste-objectifs').innerHTML = '<p class="vide">Pas de données en cache (hors-ligne).</p>';
    return;
  }
  afficherObjectifs(donnees.epargne.objectifs);
  remplirSelectObjectifs(donnees.epargne.objectifs);
}

function afficherObjectifs(objectifs) {
  const conteneur = document.getElementById('liste-objectifs');
  conteneur.innerHTML = '';
  if (objectifs.length === 0) {
    conteneur.innerHTML = '<p class="vide">Aucun objectif d’épargne pour l’instant.</p>';
    return;
  }
  const carte = document.createElement('div');
  carte.className = 'carte';
  carte.innerHTML = '<h3 style="margin-top:0">Objectifs</h3>';
  for (const o of objectifs.sort((a, b) => (a.priorite || 0) - (b.priorite || 0))) {
    const pct = Math.max(0, Math.min(100, Math.round((o.avancement || 0) * 100)));
    const div = document.createElement('div');
    div.style.marginBottom = '14px';
    div.innerHTML = `
      <div class="ligne-liste" style="border:none; padding:4px 0">
        <span style="font-weight:600">${escapeHtml(o.nom)}</span>
        <span class="actions">
          <span style="color:var(--texte-att); font-size:0.85rem">${formatXPF(o.solde_actuel)} / ${formatXPF(o.cible)}</span>
          <button class="icone-action">✕</button>
        </span>
      </div>
      <div class="barre-progression"><div style="width:${pct}%; background:${pct >= 100 ? 'var(--vert)' : 'var(--accent)'}"></div></div>`;
    div.querySelector('button').addEventListener('click', () => supprimerObjectif(o.id));
    carte.appendChild(div);
  }
  conteneur.appendChild(carte);
}

function remplirSelectObjectifs(objectifs) {
  const select = document.getElementById('mvt-objectif');
  select.innerHTML = '<option value="">Épargne générale (sans objectif)</option>';
  for (const o of objectifs) {
    const opt = document.createElement('option');
    opt.value = o.id;
    opt.textContent = o.nom;
    select.appendChild(opt);
  }
}

async function ajouterObjectif() {
  const nom = document.getElementById('obj-nom').value.trim();
  const cible = lireMontant(document.getElementById('obj-cible').value);
  if (!nom || cible <= 0) return;
  await enfilerOperation('objectif.creer', { id: genererUuid(), nom, cible });
  document.getElementById('obj-nom').value = '';
  document.getElementById('obj-cible').value = '';
  afficherToast('Objectif créé');
  charger();
}

async function supprimerObjectif(id) {
  if (!confirm('Supprimer cet objectif ?')) return;

  // Verification faite dans le telephone.
  const snap = await obtenirInstantane();
  const utilise = (snap.epargne.mouvements || []).some((m) => m.objectif_id === id);

  if (utilise) {
    // Effacer les versements rattaches fausserait le solde des mois
    // concernes : on propose l'archivage, qui preserve l'historique.
    const archiver = confirm(
      'Cet objectif contient des versements.\n\n'
      + 'Le supprimer fausserait le solde des mois concernés.\n'
      + 'Veux-tu plutôt le masquer (archiver) en gardant l’historique ?'
    );
    if (!archiver) return;
    await enfilerOperation('objectif.archiver', { id });
    afficherToast('Objectif archivé');
  } else {
    await enfilerOperation('objectif.supprimer', { id });
    afficherToast('Objectif supprimé');
  }
  charger();
}

async function enregistrerMouvement() {
  const objectifId = document.getElementById('mvt-objectif').value || null;
  const type = document.getElementById('mvt-type').value;
  const montant = lireMontant(document.getElementById('mvt-montant').value);
  if (montant <= 0) return;
  await enfilerOperation('mouvement.ajouter', {
    id: genererUuid(), mois: moisCourant(), objectif_id: objectifId, montant, type,
    date: dateAujourdhui(),
  });
  document.getElementById('mvt-montant').value = '';
  afficherToast(type === 'versement' ? 'Versement enregistré' : 'Retrait enregistré');
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
