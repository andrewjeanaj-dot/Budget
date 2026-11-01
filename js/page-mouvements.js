let moisAffiche = lireMoisAffiche();
let liste = null;

function changerMois(m) {
  moisAffiche = m;
  ecrireMoisAffiche(m);
  document.getElementById('libelle-mois').textContent = moisLabel(m);
  liste.rendre();
}

function init() {
  injecterNav('mouvements');
  enregistrerServiceWorker();
  demarrerVerifications();
  document.getElementById('libelle-mois').textContent = moisLabel(moisAffiche);
  document.getElementById('mois-prec').addEventListener('click', () => changerMois(moisPrecedent(moisAffiche)));
  document.getElementById('mois-suiv').addEventListener('click', () => changerMois(moisSuivant(moisAffiche)));
  liste = monterMouvements(document.getElementById('zone-mouvements'), () => moisAffiche);
  majStatutSauvegarde();
}

init();
