function init() {
  injecterNav('plus');
  enregistrerServiceWorker();
  demarrerVerifications();
  document.getElementById('version-app').textContent = `Version de l’app : ${VERSION_APP}`;
  // Une ecriture d'essai, a part des donnees, pour voir l'etat reel du stockage.
  document.getElementById('etat-stockage').textContent = 'Enregistrement : vérification…';
  obtenirInstantane()
    .then(() => idbPutSilencieux('cache', { cle: 'essai_stockage', valeur: Date.now() }))
    .then((ok) => {
      const etat = etatStockage();
      const ligne = document.getElementById('etat-stockage');
      if (etat.niveau === 'panne') ligne.textContent = `Enregistrement en panne. Code : ${etat.code}`;
      else if (!ok) ligne.textContent = `Enregistrement de secours actif. Code : ${derniereErreurIdb()}`;
      else ligne.textContent = 'Enregistrement : OK';
    });

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
