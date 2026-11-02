function init() {
  injecterNav('plus');
  enregistrerServiceWorker();
  demarrerVerifications();
  document.getElementById('version-app').textContent = `Version de l’app : ${VERSION_APP}`;
  document.getElementById('etat-stockage').textContent = 'Enregistrement : vérification…';
  obtenirInstantane().then(attendreEcritures).then(() => {
    const etat = etatStockage();
    const ligne = document.getElementById('etat-stockage');
    if (etat.niveau === 'panne') ligne.textContent = `Enregistrement en panne. Code : ${etat.code}`;
    else if (etat.niveau === 'secours') ligne.textContent = `Enregistrement de secours actif. Code : ${etat.code}`;
    else ligne.textContent = 'Enregistrement : OK';
  });
  if (navigator.storage && navigator.storage.estimate) {
    navigator.storage.estimate().then((e) => {
      if (e.usage) document.getElementById('place-app').textContent = `Place utilisée par l’app : ${formatNombre(Math.ceil(e.usage / 1024))} Ko`;
    }).catch(() => {});
  }

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
