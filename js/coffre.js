// Sauvegarde : deux facons de mettre les donnees a l'abri, sans serveur a nous.
// - Automatique : a chaque changement, une copie chiffree dans le telephone part
//   dans un depot prive GitHub de l'utilisateur. Seul le code de recuperation
//   permet de la relire : il ne quitte jamais le telephone.
// - Par fichier : le telephone exige un geste, l'accueil le propose au bon moment.
// Rien ne part tant que l'utilisateur n'a pas active la sauvegarde automatique.

const GITHUB_API = 'https://api.github.com';
const CLE_COFFRE = 'coffre';
const DELAI_ENVOI_MS = 2000;
const DELAI_NOUVEL_ESSAI_MS = 60000;
let delaiEntreCopiesMs = 60000;   // un commit par minute au plus
const COPIES_PROPOSEES = 7;
const ALPHABET_CODE = '0123456789ABCDEFGHJKMNPQRSTVWXYZ';   // sans I, L, O, U : pas de confusion
const SEL_COFFRE = 'budget-coffre-v1';

let _minuteurCoffre = null;
let _envoiEnCours = false;
let _signalSuspendu = false;

// ─── Etat, garde dans le telephone ─────────────────────────────────────────

async function lireEtatCoffre() {
  const e = await idbGetSilencieux('cache', CLE_COFFRE);
  return e ? e.valeur : null;
}

function ecrireEtatCoffre(etat) {
  return idbPutSilencieux('cache', { cle: CLE_COFFRE, valeur: etat });
}

// ─── Code et chiffrement ───────────────────────────────────────────────────

// 24 caracteres de 32 possibles : 120 bits, impossible a deviner.
function genererCodeCoffre() {
  const octets = crypto.getRandomValues(new Uint8Array(24));
  const signes = [...octets].map((o) => ALPHABET_CODE[o % 32]).join('');
  return signes.match(/.{4}/g).join('-');
}

// Tolere ce qu'on tape a la main : minuscules, espaces, O pour 0, I ou L pour 1.
function normaliserCodeCoffre(texte) {
  const brut = String(texte || '').toUpperCase().replace(/[^0-9A-Z]/g, '')
    .replace(/O/g, '0').replace(/[IL]/g, '1');
  if (brut.length !== 24 || [...brut].some((c) => !ALPHABET_CODE.includes(c))) return null;
  return brut.match(/.{4}/g).join('-');
}

function parametresHkdf(usage) {
  return { name: 'HKDF', hash: 'SHA-256', salt: new TextEncoder().encode(SEL_COFFRE), info: new TextEncoder().encode(usage) };
}

// La cle lit les copies. Le dossier les range : chaque code a le sien, donc
// reactiver sur un telephone neuf ne peut jamais ecraser les anciennes copies.
async function deriverCoffre(code) {
  const maitresse = await crypto.subtle.importKey('raw', new TextEncoder().encode(code), 'HKDF', false, ['deriveBits', 'deriveKey']);
  const bits = await crypto.subtle.deriveBits(parametresHkdf('dossier'), maitresse, 64);
  const dossier = [...new Uint8Array(bits)].map((o) => o.toString(16).padStart(2, '0')).join('');
  const cle = await crypto.subtle.deriveKey(parametresHkdf('cle'), maitresse, { name: 'AES-GCM', length: 256 }, false, ['encrypt', 'decrypt']);
  return { dossier, cle };
}

async function chiffrerCoffre(donnees, cle) {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const clair = new TextEncoder().encode(JSON.stringify(donnees));
  const chiffre = new Uint8Array(await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, cle, clair));
  const paquet = new Uint8Array(iv.length + chiffre.length);
  paquet.set(iv);
  paquet.set(chiffre, iv.length);
  return paquet;
}

async function dechiffrerCoffre(paquet, cle) {
  const octets = new Uint8Array(paquet);
  const clair = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: octets.slice(0, 12) }, cle, octets.slice(12));
  return JSON.parse(new TextDecoder().decode(clair));
}

function versBase64(octets) {
  let binaire = '';
  for (let i = 0; i < octets.length; i += 8192) binaire += String.fromCharCode(...octets.subarray(i, i + 8192));
  return btoa(binaire);
}

// ─── GitHub ────────────────────────────────────────────────────────────────

// Accepte « pseudo/depot » ou l'adresse complete copiee depuis GitHub.
function normaliserDepot(texte) {
  const m = String(texte || '').trim().replace(/^https?:\/\/github\.com\//i, '').replace(/\.git$/i, '').replace(/\/$/, '')
    .match(/^([\w.-]+)\/([\w.-]+)$/);
  return m ? `${m[1]}/${m[2]}` : null;
}

function appelGithub(cleAcces, chemin, options = {}) {
  return fetch(`${GITHUB_API}${chemin}`, {
    ...options,
    cache: 'no-store',
    headers: { Authorization: `Bearer ${cleAcces}`, Accept: 'application/vnd.github+json', 'X-GitHub-Api-Version': '2022-11-28', ...options.headers },
  });
}

// Renvoie un message d'erreur a afficher, ou null si tout va bien. Un depot
// public est refuse : les copies seraient visibles par tout le monde.
async function verifierDepot(depot, cleAcces) {
  let reponse;
  try {
    reponse = await appelGithub(cleAcces, `/repos/${depot}`);
  } catch (e) {
    return 'Connexion impossible. Vérifie ton réseau, puis réessaie.';
  }
  if (reponse.status === 401) return 'Cette clé d’accès n’est pas valable. Vérifie-la ou crée-en une nouvelle.';
  if (reponse.status === 403 || reponse.status === 404) return 'Dépôt introuvable avec cette clé. Vérifie son nom et que la clé y a bien accès.';
  if (!reponse.ok) return 'GitHub ne répond pas correctement. Réessaie dans un moment.';
  const infos = await reponse.json();
  if (!infos.private) return 'Ce dépôt est public : tout le monde pourrait voir tes copies. Choisis un dépôt privé.';
  return null;
}

function erreurAcces(reponse) {
  if (reponse.status === 401 || reponse.status === 404) return true;
  return reponse.status === 403 && reponse.headers.get('x-ratelimit-remaining') !== '0';
}

async function deposerCopie(etat, snap) {
  const { dossier, cle } = await deriverCoffre(etat.code);
  const chemin = `/repos/${etat.depot}/contents/copies/${dossier}/${dateAujourdhui()}.bin`;
  // GitHub exige l'identifiant du fichier du jour pour le remplacer.
  const existant = await appelGithub(etat.cle_acces, chemin);
  if (!existant.ok && existant.status !== 404) return existant;
  const corps = { message: `Copie du ${dateAujourdhui()}`, content: versBase64(await chiffrerCoffre(snap, cle)) };
  if (existant.ok) corps.sha = (await existant.json()).sha;
  return appelGithub(etat.cle_acces, chemin, { method: 'PUT', body: JSON.stringify(corps) });
}

// ─── Envoi automatique ─────────────────────────────────────────────────────

function aDesDonnees(snap) {
  return (snap.categories || []).length > 0
    || [snap.depenses, snap.revenus].some((parMois) => Object.values(parMois || {}).some((l) => l.length > 0));
}

// Renvoie true si la copie est partie. Une copie vide ne part jamais.
async function envoyerCopieCoffre() {
  if (_envoiEnCours) return false;
  const etat = await lireEtatCoffre();
  if (!etat || !etat.code || !etat.a_envoyer || etat.erreur === 'acces') return false;
  const snap = await obtenirInstantane();
  if (!aDesDonnees(snap)) return false;

  if (etat.derniere_copie) {
    const attente = delaiEntreCopiesMs - (Date.now() - new Date(etat.derniere_copie).getTime());
    if (attente > 0) { programmerEnvoiCoffre(attente); return false; }
  }

  _envoiEnCours = true;
  const envoiDe = etat.modifie_le;
  try {
    const reponse = await deposerCopie(etat, snap);
    const apres = await lireEtatCoffre();
    if (!apres || apres.code !== etat.code) return false;   // arrete entre-temps
    if (!reponse.ok) {
      if (erreurAcces(reponse)) {
        // Cle expiree ou depot supprime : reessayer ne servirait a rien.
        apres.erreur = 'acces';
        await ecrireEtatCoffre(apres);
      } else {
        programmerEnvoiCoffre(DELAI_NOUVEL_ESSAI_MS);
      }
      return false;
    }
    // Une modification arrivee pendant l'envoi reste a envoyer.
    apres.a_envoyer = apres.modifie_le !== envoiDe;
    apres.derniere_copie = nowIso();
    delete apres.erreur;
    await ecrireEtatCoffre(apres);
    if (apres.a_envoyer) programmerEnvoiCoffre(DELAI_ENVOI_MS);
    if (typeof majStatutSauvegarde === 'function') majStatutSauvegarde();
    return true;
  } catch (e) {
    // Pas de reseau : la copie repart des que possible.
    programmerEnvoiCoffre(DELAI_NOUVEL_ESSAI_MS);
    return false;
  } finally {
    _envoiEnCours = false;
  }
}

function programmerEnvoiCoffre(delai) {
  clearTimeout(_minuteurCoffre);
  _minuteurCoffre = setTimeout(envoyerCopieCoffre, delai);
}

// Appele a chaque enregistrement. La marque est ecrite dans le telephone : si
// l'app se ferme avant l'envoi, la prochaine ouverture le fera.
async function signalerChangementCoffre() {
  if (_signalSuspendu) return;
  const etat = await lireEtatCoffre();
  if (!etat || !etat.code) return;
  etat.a_envoyer = true;
  etat.modifie_le = nowIso();
  await ecrireEtatCoffre(etat);
  programmerEnvoiCoffre(DELAI_ENVOI_MS);
}

// ─── Activer, recuperer, arreter ───────────────────────────────────────────

// La premiere copie doit partir : c'est ce qui prouve que la cle peut ecrire.
// Renvoie { code } ou { erreur }.
async function activerCoffre(depot, cleAcces) {
  const probleme = await verifierDepot(depot, cleAcces);
  if (probleme) return { erreur: probleme };
  const code = genererCodeCoffre();
  await ecrireEtatCoffre({ code, depot, cle_acces: cleAcces, a_envoyer: true, modifie_le: nowIso(), derniere_copie: null });
  if (await envoyerCopieCoffre()) return { code };
  clearTimeout(_minuteurCoffre);
  await idbSupprimerSilencieux('cache', CLE_COFFRE);
  return { erreur: 'La première copie n’a pas pu partir. Vérifie que la clé peut écrire dans ce dépôt (Contents : Read and write).' };
}

// Renvoie les jours disponibles, du plus recent au plus ancien.
async function listerCopiesCoffre(depot, cleAcces, code) {
  const { dossier } = await deriverCoffre(code);
  const reponse = await appelGithub(cleAcces, `/repos/${depot}/contents/copies/${dossier}`);
  if (reponse.status === 404) return [];
  if (!reponse.ok) throw new Error(`GitHub : ${reponse.status}`);
  return (await reponse.json()).map((f) => f.name.replace(/\.bin$/, '')).sort().reverse().slice(0, COPIES_PROPOSEES);
}

async function lireCopieCoffre(depot, cleAcces, code, jour) {
  const { dossier, cle } = await deriverCoffre(code);
  const reponse = await appelGithub(cleAcces, `/repos/${depot}/contents/copies/${dossier}/${jour}.bin`, {
    headers: { Accept: 'application/vnd.github.raw+json' },
  });
  if (!reponse.ok) throw new Error(`GitHub : ${reponse.status}`);
  return extraireDonnees(await dechiffrerCoffre(await reponse.arrayBuffer(), cle));
}

// Le telephone repart sur ce code. Rien n'est renvoye tout de suite : la copie
// choisie ne remplace la plus recente qu'a la prochaine vraie modification.
async function restaurerDepuisCoffre(depot, cleAcces, code, donnees, jour) {
  _signalSuspendu = true;
  const enregistre = await definirInstantane(donnees);
  _signalSuspendu = false;
  if (!enregistre) return false;
  clearTimeout(_minuteurCoffre);
  await ecrireEtatCoffre({ code, depot, cle_acces: cleAcces, a_envoyer: false, modifie_le: nowIso(), derniere_copie: new Date(jour).toISOString() });
  return true;
}

// Remplace une cle expiree : la prochaine copie repart avec la nouvelle.
async function remplacerCleCoffre(cleAcces) {
  const etat = await lireEtatCoffre();
  const probleme = await verifierDepot(etat.depot, cleAcces);
  if (probleme) return probleme;
  etat.cle_acces = cleAcces;
  etat.a_envoyer = true;
  delete etat.erreur;
  await ecrireEtatCoffre(etat);
  await envoyerCopieCoffre();
  return null;
}

// Les copies restent sur GitHub, illisibles sans le code.
async function arreterCoffre() {
  clearTimeout(_minuteurCoffre);
  await idbSupprimerSilencieux('cache', CLE_COFFRE);
}

// ─── Sauvegarde par fichier ────────────────────────────────────────────────

// Sur iPhone, le partage propose « Enregistrer dans Fichiers » (iCloud,
// OneDrive...). Le telechargement classique y est peu fiable en mode app.
// Renvoie false si l'utilisateur a annule ou si le partage a echoue.
async function partagerFichier(fichier) {
  if (navigator.canShare && navigator.canShare({ files: [fichier] })) {
    try {
      await navigator.share({ files: [fichier], title: fichier.name });
    } catch (e) {
      if (e && e.name === 'AbortError') return false;   // annule : rien n'est cree
      alert('Le partage a échoué : ' + e.message);
      return false;
    }
  } else {
    const url = URL.createObjectURL(fichier);
    const lien = document.createElement('a');
    lien.href = url;
    lien.download = fichier.name;
    document.body.appendChild(lien);
    lien.click();
    lien.remove();
    setTimeout(() => URL.revokeObjectURL(url), 10000);
  }
  return true;
}

async function creerFichierSauvegarde() {
  const snap = await obtenirInstantane();
  const contenu = JSON.stringify({ format: FORMAT_SAUVEGARDE, version: 1, exporte_le: nowIso(), donnees: snap });
  const fichier = new File([contenu], `budget_sauvegarde_${dateAujourdhui()}.json`, { type: 'application/json' });
  if (!(await partagerFichier(fichier))) return false;
  noterSauvegardeFaite();
  return true;
}

// ─── Reprise ───────────────────────────────────────────────────────────────

window.addEventListener('online', () => envoyerCopieCoffre());
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'hidden') envoyerCopieCoffre();
});
envoyerCopieCoffre();
