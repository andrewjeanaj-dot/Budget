let moisAffiche = moisCourant();
let categoriesParIdCache = {};

function init() {
  injecterNav('budget');
  enregistrerServiceWorker();
  demarrerVerifications();

  document.getElementById('mois-prec').addEventListener('click', () => { moisAffiche = moisPrecedent(moisAffiche); charger(); });
  document.getElementById('mois-suiv').addEventListener('click', () => { moisAffiche = moisSuivant(moisAffiche); charger(); });
  document.getElementById('bouton-generer').addEventListener('click', genererMoisSuivant);
  document.getElementById('revenu-ajouter').addEventListener('click', ajouterRevenu);
  document.getElementById('bouton-solde-depart').addEventListener('click', corrigerSoldeDepart);

  charger();
}

async function charger() {
  document.getElementById('libelle-mois').textContent = moisLabel(moisAffiche);

  const { categories } = await chargerCategories();
  categoriesParIdCache = categoriesParId(categories);

  const { donnees, horsLigne } = await chargerMois(moisAffiche);
  majStatutSauvegarde();
  if (!donnees) {
    document.getElementById('groupes-budget').innerHTML = '<p class="vide">Pas de données pour ce mois.</p>';
    return;
  }
  afficherBandeau(donnees);
  afficherRevenus(donnees);
  afficherGroupes(donnees);
}

// Le grand chiffre repond a la seule question qui compte : combien puis-je
// encore depenser ce mois-ci sans sortir de mon budget ?
function afficherCartePrincipale(d) {
  const carte = document.getElementById('carte-principale');
  const reste = d.total_prevu - d.total_reel;
  const depasse = reste < 0;
  carte.classList.toggle('depasse', depasse);
  carte.classList.toggle('positif', d.total_prevu > 0 && reste > 0);

  const etiquette = document.getElementById('h-etiquette');
  const chiffre = document.getElementById('h-reste');
  const barre = document.getElementById('h-barre');
  const detail = document.getElementById('h-detail');

  if (d.total_prevu === 0) {
    etiquette.textContent = 'Aucun budget prévu ce mois-ci';
    chiffre.textContent = formatXPF(d.total_reel);
    detail.textContent = 'dépensés. Fixe tes prévisions dans Plus › Catégories.';
    barre.style.width = '0%';
  } else {
    etiquette.textContent = depasse ? 'Budget dépassé de' : 'Il te reste dans ton budget ce mois-ci';
    chiffre.textContent = formatXPF(Math.abs(reste));
    const pct = Math.min(100, Math.round((d.total_reel / d.total_prevu) * 100));
    barre.style.width = `${pct}%`;
    barre.style.background = depasse ? 'var(--rouge)' : pct >= 85 ? 'var(--g-imprevus)' : 'var(--accent)';
    detail.textContent = `${formatXPF(d.total_reel)} dépensés sur ${formatXPF(d.total_prevu)} prévus`;
  }

  const report = document.getElementById('h-report');
  report.textContent = d.solde_a_reporter >= 0
    ? `Si tu ne dépenses plus rien, tu reportes ${formatXPF(d.solde_a_reporter)} au mois prochain.`
    : `Attention : tu finis le mois à −${formatXPF(-d.solde_a_reporter)} (plus de dépenses que d’argent).`;
  report.style.color = d.solde_a_reporter < 0 ? 'var(--rouge)' : '';
}

function afficherBandeau(d) {
  afficherCartePrincipale(d);
  document.getElementById('v-solde-depart').textContent = formatXPF(d.solde_depart);
  document.getElementById('v-dispo').textContent = formatXPF(d.dispo_a_repartir);

  const elReste = document.getElementById('v-reste');
  elReste.textContent = formatXPF(d.reste_a_repartir);
  elReste.parentElement.classList.toggle('negatif', d.reste_a_repartir < 0);

  const elReport = document.getElementById('v-solde-report');
  elReport.textContent = formatXPF(d.solde_a_reporter);
  elReport.parentElement.classList.toggle('positif', d.solde_a_reporter >= 0);
  elReport.parentElement.classList.toggle('negatif', d.solde_a_reporter < 0);
}

function afficherRevenus(d) {
  document.getElementById('v-total-revenus').textContent = formatXPF(d.total_revenus);
  const liste = document.getElementById('liste-revenus');
  liste.innerHTML = '';
  if (d.revenus.length === 0) {
    liste.innerHTML = '<p class="vide">Aucun revenu saisi ce mois-ci.</p>';
    return;
  }
  for (const r of d.revenus) {
    const ligne = document.createElement('div');
    ligne.className = 'ligne-liste';
    ligne.innerHTML = `
      <span>${escapeHtml(r.libelle)} <span style="color:var(--texte-att)">(${r.auto ? 'repris automatiquement' : escapeHtml(r.type)})</span>
        <label style="display:flex; align-items:center; gap:6px; font-size:0.8rem; color:var(--texte-att); margin-top:4px">
          <input type="checkbox" data-action="reconduire-revenu" ${r.reconduire ? 'checked' : ''}> Reconduire chaque mois
        </label>
      </span>
      <span class="actions">
        <strong>${formatXPF(r.montant)}</strong>
        <button class="icone-action">✕</button>
      </span>`;
    ligne.querySelector('button').addEventListener('click', () => supprimerRevenu(r.id));
    ligne.querySelector('[data-action="reconduire-revenu"]').addEventListener('change', async (e) => {
      await enfilerOperation('revenu.modifier', { id: r.id, mois: moisAffiche, reconduire: e.target.checked });
      afficherToast(e.target.checked ? 'Ce revenu reviendra chaque mois' : 'Reprise arrêtée à partir du mois suivant');
      charger();
    });
    liste.appendChild(ligne);
  }
}

function afficherGroupes(d) {
  const conteneur = document.getElementById('groupes-budget');
  conteneur.innerHTML = '';
  for (const g of GROUPES) {
    const lignes = d.lignes.filter((l) => {
      const cat = categoriesParIdCache[l.categorie_id];
      return cat && cat.groupe === g.id;
    });
    if (lignes.length === 0) continue;

    const carte = document.createElement('div');
    carte.className = 'carte';
    const titre = document.createElement('h3');
    titre.style.marginTop = '0';
    titre.style.display = 'flex';
    titre.style.justifyContent = 'space-between';
    titre.style.alignItems = 'baseline';
    // Legende : sans elle, "7 112 F / 6 872 F" est ambigu.
    titre.innerHTML = `<span><span class="pastille-groupe" style="--cat-couleur:${g.couleur}"></span>${g.label}</span>`
      + '<span style="font-size:0.68rem; font-weight:400; color:var(--texte-att); text-transform:uppercase; letter-spacing:0.03em">Dépensé / Prévu</span>';
    carte.appendChild(titre);

    for (const l of lignes) {
      const cat = categoriesParIdCache[l.categorie_id];
      const pct = l.prevision > 0 ? Math.min(100, Math.round((l.reel / l.prevision) * 100)) : (l.reel > 0 ? 100 : 0);
      const div = document.createElement('div');
      div.className = 'ligne-budget';
      div.innerHTML = `
        <div style="flex:1">
          <div class="nom"><span class="pastille-groupe" style="--cat-couleur:${g.couleur}"></span>${escapeHtml(cat ? cat.libelle : '—')}</div>
          <div class="barre-progression"><div style="width:${pct}%; background:${l.reste < 0 ? 'var(--rouge)' : g.couleur}"></div></div>
        </div>
        <div class="chiffres">
          <div>${formatXPF(l.reel)} / ${formatXPF(l.prevision)}</div>
          <div class="reste ${l.reste < 0 ? 'negatif' : l.reste > 0 ? 'positif' : ''}">${texteReste(l)}</div>
        </div>`;
      carte.appendChild(div);
    }
    conteneur.appendChild(carte);
  }
}

// « +0 F » ne parlait a personne : on dit ce qu'il reste, ou de combien on
// a depasse.
function texteReste(l) {
  if (l.prevision === 0 && l.reel > 0) return 'Hors budget';
  if (l.reste < 0) return `Dépassé de ${formatXPF(-l.reste)}`;
  if (l.reste === 0) return 'Pile le budget';
  return `Reste ${formatXPF(l.reste)}`;
}

// Le report peut etre negatif (decouvert) : un signe moins, ou le mot
// « moins », est garde. lireMontant, lui, ne garde que les chiffres.
function lireMontantSigne(texte) {
  const t = String(texte || '').trim();
  const negatif = /^[-−–]|^moins/i.test(t);
  return negatif ? -lireMontant(t) : lireMontant(t);
}

async function corrigerSoldeDepart() {
  const actuel = document.getElementById('v-solde-depart').textContent;
  const saisi = prompt(
    `Report du mois dernier pour ${moisLabel(moisAffiche)} (actuellement ${actuel}).\n\n`
    + 'Mets un signe moins s’il est négatif, par exemple -12000.'
  );
  if (saisi === null || saisi.trim() === '' || !/[0-9]/.test(saisi)) return;
  const montant = lireMontantSigne(saisi);
  if (!confirm(`Fixer le report de ${moisLabel(moisAffiche)} à ${formatXPF(montant)} ?`)) return;
  await enfilerOperation('mois.definir_solde_depart', { mois: moisAffiche, montant });
  afficherToast('Report corrigé');
  charger();
}

async function genererMoisSuivant() {
  const cible = moisSuivant(moisAffiche);
  await enfilerOperation('mois.initialiser', { mois: cible });
  moisAffiche = cible;
  afficherToast('Mois généré');
  charger();
}

async function ajouterRevenu() {
  const libelle = document.getElementById('revenu-libelle').value.trim();
  const montant = lireMontant(document.getElementById('revenu-montant').value);
  if (!libelle || montant <= 0) return;
  await enfilerOperation('revenu.ajouter', { id: genererUuid(), mois: moisAffiche, libelle, montant, type: 'variable' });
  document.getElementById('revenu-libelle').value = '';
  document.getElementById('revenu-montant').value = '';
  charger();
}

async function supprimerRevenu(id) {
  await enfilerOperation('revenu.supprimer', { id, mois: moisAffiche });
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
