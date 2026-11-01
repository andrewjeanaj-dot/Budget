function init() {
  injecterNav('ajout');
  enregistrerServiceWorker();
  demarrerVerifications();
  const saisie = monterSaisie(document.getElementById('zone-saisie'));
  saisie.focus();
}

init();
