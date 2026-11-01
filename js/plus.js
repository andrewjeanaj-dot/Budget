function init() {
  injecterNav('plus');
  enregistrerServiceWorker();
  demarrerVerifications();

  const derniere = lireDerniereSauvegarde();
  const jours = derniere ? joursDepuis(derniere) : null;
  document.getElementById('aide-sauvegarde').textContent = jours === null
    ? 'Jamais sauvegardé : à faire en premier'
    : jours === 0 ? 'Dernière sauvegarde aujourd’hui' : `Dernière sauvegarde il y a ${jours} j`;
}

init();
