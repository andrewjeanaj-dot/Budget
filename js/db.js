const DB_NOM = 'budget-app-db';
const DB_VERSION = 2;   // v2 : ajout de la file d'attente des modifications
const DELAI_IDB_MS = 3000;
let _dbPromise = null;
let _idbIndisponible = false;

// IndexedDB peut rester bloque indefiniment (base en cours de suppression,
// stockage sature, mode restreint du navigateur). Sans delai maximum, l'app
// attendrait pour toujours et resterait vide : aucune categorie, donc aucune
// saisie possible. On prefere degrader (perte du cache local) plutot que figer.
function avecDelaiMax(promesse, libelle) {
  return Promise.race([
    promesse,
    new Promise((_, rejeter) => setTimeout(
      () => rejeter(new Error('IndexedDB indisponible (' + libelle + ')')), DELAI_IDB_MS
    )),
  ]);
}

function ouvrirDB() {
  if (_idbIndisponible) return Promise.reject(new Error('IndexedDB indisponible'));
  if (_dbPromise) return _dbPromise;
  _dbPromise = avecDelaiMax(new Promise((resolve, reject) => {
    let req;
    try {
      req = indexedDB.open(DB_NOM, DB_VERSION);
    } catch (e) {
      reject(e);
      return;
    }
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains('depenses')) {
        db.createObjectStore('depenses', { keyPath: 'id' });
      }
      if (!db.objectStoreNames.contains('cache')) {
        db.createObjectStore('cache', { keyPath: 'cle' });
      }
      if (!db.objectStoreNames.contains('outbox')) {
        db.createObjectStore('outbox', { keyPath: 'id' });
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
    req.onblocked = () => reject(new Error('IndexedDB bloquee'));
  }), 'ouverture').catch((e) => {
    // Ne plus reessayer indefiniment : on retente a la prochaine ouverture
    // de page, pas a chaque appel.
    _idbIndisponible = true;
    _dbPromise = null;
    throw e;
  });
  return _dbPromise;
}

function stockageLocalDisponible() {
  return !_idbIndisponible;
}

async function idbPut(store, valeur) {
  const db = await ouvrirDB();
  return avecDelaiMax(new Promise((resolve, reject) => {
    const tx = db.transaction(store, 'readwrite');
    tx.objectStore(store).put(valeur);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
    tx.onabort = () => reject(tx.error || new Error('transaction annulee'));
  }), 'ecriture ' + store);
}

async function idbGetAll(store) {
  const db = await ouvrirDB();
  return avecDelaiMax(new Promise((resolve, reject) => {
    const tx = db.transaction(store, 'readonly');
    const req = tx.objectStore(store).getAll();
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  }), 'lecture ' + store);
}

async function idbGet(store, cle) {
  const db = await ouvrirDB();
  return avecDelaiMax(new Promise((resolve, reject) => {
    const tx = db.transaction(store, 'readonly');
    const req = tx.objectStore(store).get(cle);
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  }), 'lecture ' + store);
}

// Variantes tolerantes : ne propagent jamais d'erreur. A utiliser partout ou
// le stockage local est un confort (cache) et non la source de verite.
async function idbPutSilencieux(store, valeur) {
  try { await idbPut(store, valeur); return true; } catch (e) { return false; }
}

async function idbGetSilencieux(store, cle) {
  try { return await idbGet(store, cle); } catch (e) { return undefined; }
}

async function idbGetAllSilencieux(store) {
  try { return await idbGetAll(store); } catch (e) { return []; }
}

async function idbSupprimer(store, cle) {
  const db = await ouvrirDB();
  return avecDelaiMax(new Promise((resolve, reject) => {
    const tx = db.transaction(store, 'readwrite');
    tx.objectStore(store).delete(cle);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  }), 'suppression ' + store);
}

async function idbSupprimerSilencieux(store, cle) {
  try { await idbSupprimer(store, cle); return true; } catch (e) { return false; }
}
