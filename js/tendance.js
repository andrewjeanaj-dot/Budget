function moisIlYA(mois, delta) {
  let [a, m] = mois.split('-').map(Number);
  m += delta;
  while (m < 1) { m += 12; a -= 1; }
  while (m > 12) { m -= 12; a += 1; }
  return `${a}-${String(m).padStart(2, '0')}`;
}

async function init() {
  injecterNav('tendance');
  enregistrerServiceWorker();
  demarrerVerifications();

  const mc = moisCourant();
  document.getElementById('depuis').value = moisIlYA(mc, -5);
  document.getElementById('jusqua').value = moisIlYA(mc, 5);

  const { categories } = await chargerCategories();
  const select = document.getElementById('select-categorie');
  for (const g of GROUPES) {
    for (const c of categories.filter((cc) => cc.groupe === g.id && !cc.archive)) {
      const opt = document.createElement('option');
      opt.value = c.id;
      opt.textContent = `${g.label} — ${c.libelle}`;
      select.appendChild(opt);
    }
  }

  select.addEventListener('change', charger);
  document.getElementById('depuis').addEventListener('change', charger);
  document.getElementById('jusqua').addEventListener('change', charger);

  charger();
}

async function charger() {
  const categorieId = document.getElementById('select-categorie').value;
  const depuis = document.getElementById('depuis').value;
  const jusqua = document.getElementById('jusqua').value;
  if (!depuis || !jusqua) return;

  // Calcule localement : la tendance reste disponible hors ligne.
  const snap = await obtenirInstantane();
  const donnees = [];
  let mois = depuis;
  let garde = 0;
  while (mois <= jusqua && garde++ < 240) {
    const t = calculerMois(snap, mois);
    if (t) {
      let prevision = t.total_prevu;
      let reel = t.total_reel;
      if (categorieId) {
        const l = t.lignes.find((x) => x.categorie_id === categorieId);
        prevision = l ? l.prevision : 0;
        reel = l ? l.reel : 0;
      }
      donnees.push({ mois, prevision, reel, solde_a_reporter: t.solde_a_reporter });
    }
    mois = moisSuivant(mois);
  }

  if (donnees.length === 0) {
    document.getElementById('graphique-barres').innerHTML = '<p class="vide">Aucune donnée sur cette période.</p>';
    document.getElementById('graphique-ligne').innerHTML = '';
  } else {
    dessinerBarres(document.getElementById('graphique-barres'), donnees, 'prevision', 'reel');
    dessinerLigne(document.getElementById('graphique-ligne'), donnees, 'solde_a_reporter');
  }
  majStatutSauvegarde();
}

init();
