function init() {
  injecterNav('plus');
  enregistrerServiceWorker();
  demarrerVerifications();

  const derniere = lireDerniereSauvegarde();
  const jours = derniere ? joursDepuis(derniere) : null;
  if (jours !== null) {
    document.getElementById('aide-sauvegarde').textContent = jours === 0 ? 'Dernier fichier aujourd’hui' : `Dernier fichier il y a ${jours} j`;
  }
  lireEtatCoffre().then((etat) => {
    if (etat && etat.code) document.getElementById('aide-coffre').textContent = etat.erreur === 'acces' ? 'En panne : à regarder' : 'Activée';
  });
}

init();
