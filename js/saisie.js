// Formulaire de saisie d'un mouvement (depense ou revenu), monte dans un
// conteneur. Sert a ajout.html (telephone, plein ecran) et a la colonne de
// gauche de l'accueil (ordinateur). Une seule saisie par page : les id
// restent donc uniques.

// Au-dela de ce nombre de categories, seules les plus utilisees sont
// affichees d'emblee : a la caisse, on ne doit pas avoir a chercher.
const NB_FREQUENTES = 6;
const JOURS_FREQUENCE = 90;

// Un revenu arrive a partir de ce jour du mois peut etre compte pour le mois
// suivant (salaire verse le 30 pour financer le mois d'apres).
const JOUR_FIN_DE_MOIS = 20;

function monterSaisie(racine) {
  const etat = { type: 'depense', categorie: null, libelleRevenu: null, moyen: 'carte', categories: [] };

  const champMontant = el('input', {
    class: 'saisie-montant', id: 'champ-montant', type: 'tel', inputmode: 'numeric',
    placeholder: '0', autocomplete: 'off', 'aria-label': 'Montant en francs',
  });
  const signe = el('span', { class: 'signe-montant depense', 'aria-hidden': 'true' }, '−');
  const choixType = el('div', { class: 'segmente', id: 'choix-type', role: 'group', 'aria-label': 'Type de mouvement' },
    el('button', { type: 'button', 'data-type': 'depense', 'aria-pressed': 'true' }, 'Dépense'),
    el('button', { type: 'button', 'data-type': 'revenu', 'aria-pressed': 'false' }, 'Revenu'));

  const conteneurGroupes = el('div', { id: 'groupes-categories' });
  const choixMoyen = el('div', { class: 'puces', id: 'choix-moyen', role: 'group', 'aria-label': 'Payé par' },
    MOYENS.filter((m) => m.saisie !== false).map((m) => el('button', { type: 'button', class: 'puce-option', 'data-moyen': m.id, 'aria-pressed': String(m.id === etat.moyen) },
      el('span', { 'aria-hidden': 'true' }, m.icone), m.label)));
  const blocDepense = el('div', { id: 'bloc-depense' }, conteneurGroupes,
    el('div', { class: 'bloc-saisie' }, el('span', { class: 'etiquette-champ' }, 'Payé par'), choixMoyen));

  const choixRevenu = el('div', { class: 'puces', id: 'choix-revenu', role: 'group', 'aria-label': 'Type de revenu' },
    LIBELLES_REVENU.map((r) => el('button', { type: 'button', class: 'puce-option', 'data-libelle': r.libelle, 'aria-pressed': 'false' },
      el('span', { 'aria-hidden': 'true' }, r.icone), r.libelle)));
  const caseMoisSuivant = el('input', { type: 'checkbox', id: 'mois-suivant' });
  const texteMoisSuivant = el('span', { id: 'texte-mois-suivant' });
  const ligneMoisSuivant = el('label', { class: 'case-mois-suivant', id: 'ligne-mois-suivant', hidden: true }, caseMoisSuivant, texteMoisSuivant);
  const blocRevenu = el('div', { id: 'bloc-revenu', hidden: true },
    el('span', { class: 'etiquette-champ', style: { marginTop: '6px' } }, 'Type de revenu'), choixRevenu, ligneMoisSuivant);

  const boutonDate = el('button', { class: 'puce-option', id: 'bouton-date', type: 'button' }, '📅 Aujourd’hui');
  const boutonNote = el('button', { class: 'puce-option', id: 'bouton-toggle-note', type: 'button' }, '✎ Ajouter une note');
  const champDate = el('input', { class: 'champ', id: 'champ-date', type: 'date', hidden: true, style: { marginTop: '10px' } });
  const champNote = el('input', { class: 'champ-note', id: 'champ-note', type: 'text', maxlength: '120', hidden: true, placeholder: 'Note (optionnel), ex : Hyper U' });
  const boutonEnregistrer = el('button', { class: 'bouton-principal', id: 'bouton-enregistrer', type: 'button', disabled: true }, 'Choisis un montant et une catégorie');

  racine.replaceChildren(
    choixType,
    el('div', { class: 'carte carte-montant' },
      el('div', { class: 'ligne-montant' }, signe, champMontant, el('span', { class: 'unite-f' }, 'F')),
      el('div', { class: 'saisie-montant-unite' }, 'Francs XPF')),
    blocDepense,
    blocRevenu,
    el('div', { class: 'options-saisie' }, boutonDate, boutonNote),
    champDate,
    champNote,
    el('div', { class: 'barre-action' }, boutonEnregistrer));

  champDate.value = dateAujourdhui();

  // ─── Categories ───────────────────────────────────────────────────────

  function creerBoutonCategorie(c) {
    const g = groupeInfo(c.groupe);
    const bouton = el('button', { class: 'bouton-categorie', type: 'button', 'data-id': c.id },
      el('span', { class: 'icone-cat', 'aria-hidden': 'true' }, iconeCategorie(c)),
      el('span', {}, c.libelle));
    bouton.style.setProperty('--cat-couleur', g.couleur);
    bouton.addEventListener('click', () => selectionnerCategorie(c.id));
    return bouton;
  }

  function creerGrille(cats) {
    return el('div', { class: 'grille-categories' }, cats.map(creerBoutonCategorie));
  }

  // Classe les categories par nombre de depenses recentes (les plus
  // utilisees d'abord). A egalite, l'ordre de creation est garde.
  function classerParUsage(categories, snap) {
    const limite = new Date(Date.now() - JOURS_FREQUENCE * 86400000).toISOString().slice(0, 10);
    const usage = {};
    for (const liste of Object.values(snap.depenses || {})) {
      for (const d of liste) {
        if (!d.supprime && d.date >= limite) usage[d.categorie_id] = (usage[d.categorie_id] || 0) + 1;
      }
    }
    return categories
      .map((c, i) => ({ c, i, n: usage[c.id] || 0 }))
      .sort((a, b) => b.n - a.n || a.i - b.i)
      .map((x) => x.c);
  }

  async function afficherCategories() {
    const snap = await obtenirInstantane();
    etat.categories = (snap.categories || []).filter((c) => !c.archive);
    conteneurGroupes.replaceChildren();

    if (etat.categories.length === 0) {
      conteneurGroupes.append(el('p', { class: 'vide' }, 'Aucune catégorie pour l’instant.', el('br'), el('br'),
        'Va dans « Plus », puis « Catégories » pour en créer, ou dans « Sauvegarde » pour restaurer un fichier.'));
      return;
    }
    // Peu de categories : une seule grille, rien a deplier.
    if (etat.categories.length <= NB_FREQUENTES) {
      conteneurGroupes.append(creerGrille(etat.categories));
      return;
    }
    const classees = classerParUsage(etat.categories, snap);
    conteneurGroupes.append(el('div', { class: 'groupe-titre' }, 'Les plus utilisées'), creerGrille(classees.slice(0, NB_FREQUENTES)));

    const toutes = el('details', { class: 'toutes-categories' }, el('summary', {}, `Toutes les catégories (${etat.categories.length})`));
    for (const g of GROUPES) {
      const cats = etat.categories.filter((c) => c.groupe === g.id);
      if (cats.length === 0) continue;
      const pastille = el('span', { class: 'pastille-groupe' });
      pastille.style.setProperty('--cat-couleur', g.couleur);
      toutes.append(el('div', { class: 'groupe-titre' }, pastille, g.label), creerGrille(cats));
    }
    conteneurGroupes.append(toutes);
  }

  function selectionnerCategorie(id) {
    etat.categorie = id;
    racine.querySelectorAll('.bouton-categorie').forEach((b) => b.classList.toggle('selectionne', b.dataset.id === id));
    // Ferme le clavier : le bouton Enregistrer, en bas, redevient visible.
    champMontant.blur();
    majBouton();
  }

  // ─── Type, moyen, revenu ──────────────────────────────────────────────

  function choisirType(type) {
    etat.type = type;
    choixType.querySelectorAll('button').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.type === type)));
    signe.textContent = type === 'depense' ? '−' : '+';
    signe.className = 'signe-montant ' + type;
    blocDepense.hidden = type !== 'depense';
    blocRevenu.hidden = type !== 'revenu';
    majMoisSuivant();
    majBouton();
  }

  function choisirMoyen(id) {
    etat.moyen = id;
    choixMoyen.querySelectorAll('button').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.moyen === id)));
  }

  function choisirRevenu(libelle) {
    etat.libelleRevenu = libelle;
    choixRevenu.querySelectorAll('button').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.libelle === libelle)));
    // Un salaire verse en fin de mois finance le mois suivant : coche par defaut.
    caseMoisSuivant.checked = libelle === 'Salaire';
    majMoisSuivant();
    champMontant.blur();
    majBouton();
  }

  function majMoisSuivant() {
    const d = champDate.value || dateAujourdhui();
    const visible = etat.type === 'revenu' && Number(d.slice(8, 10)) >= JOUR_FIN_DE_MOIS;
    ligneMoisSuivant.hidden = !visible;
    texteMoisSuivant.textContent = `Compter dans le budget de ${moisLabel(moisSuivant(d.slice(0, 7))).toLowerCase()} (versé en fin de mois pour le mois suivant)`;
  }

  function moisDuRevenu() {
    const d = champDate.value || dateAujourdhui();
    return !ligneMoisSuivant.hidden && caseMoisSuivant.checked ? moisSuivant(d.slice(0, 7)) : d.slice(0, 7);
  }

  // ─── Montant, date, note, bouton ──────────────────────────────────────

  // Le champ prend la largeur de son contenu : « 4 520 » et le « F » qui le
  // suit restent centres ensemble.
  function ajusterLargeurMontant() {
    const n = Math.max(1, champMontant.value.length || 1);
    champMontant.style.width = `${n + 0.3}ch`;
  }

  function majLibelleDate() {
    const d = champDate.value || dateAujourdhui();
    if (d === dateAujourdhui()) {
      boutonDate.textContent = '📅 Aujourd’hui';
    } else {
      const [a, m, j] = d.split('-');
      boutonDate.textContent = `📅 ${j}/${m}/${a}`;
    }
    majMoisSuivant();
  }

  function majBouton() {
    ajusterLargeurMontant();
    const montant = lireMontant(champMontant.value);
    const choix = etat.type === 'depense' ? etat.categorie : etat.libelleRevenu;
    const pret = montant > 0 && !!choix;
    boutonEnregistrer.disabled = !pret;
    if (pret) {
      const nom = etat.type === 'depense'
        ? (etat.categories.find((c) => c.id === etat.categorie) || {}).libelle || ''
        : etat.libelleRevenu;
      boutonEnregistrer.textContent = `Enregistrer ${etat.type === 'revenu' ? '+' : ''}${formatXPF(montant)} · ${nom}`;
    } else if (montant > 0) {
      boutonEnregistrer.textContent = etat.type === 'depense' ? 'Choisis une catégorie' : 'Choisis le type de revenu';
    } else {
      boutonEnregistrer.textContent = etat.type === 'depense' ? 'Choisis un montant et une catégorie' : 'Choisis un montant et le type de revenu';
    }
  }

  function reinitialiser() {
    champMontant.value = '';
    champNote.value = '';
    champNote.hidden = true;
    boutonNote.hidden = false;
    champDate.value = dateAujourdhui();
    champDate.hidden = true;
    etat.categorie = null;
    etat.libelleRevenu = null;
    caseMoisSuivant.checked = false;
    racine.querySelectorAll('.bouton-categorie.selectionne').forEach((b) => b.classList.remove('selectionne'));
    choixRevenu.querySelectorAll('button').forEach((b) => b.setAttribute('aria-pressed', 'false'));
    majLibelleDate();
    majBouton();
  }

  async function enregistrer() {
    const montant = lireMontant(champMontant.value);
    if (boutonEnregistrer.disabled || !(montant > 0)) return;
    boutonEnregistrer.disabled = true;
    const date = champDate.value || dateAujourdhui();
    const note = champNote.value.trim();

    let annuler;
    let message;
    let moisVise;
    if (etat.type === 'depense') {
      const res = await enregistrerDepense({ montant, categorie_id: etat.categorie, note, date, moyen: etat.moyen });
      // Ne jamais annoncer un enregistrement qui n'a pas eu lieu (l'alerte
      // detaillee est deja affichee par enfilerOperation).
      if (!res.enLocal) { boutonEnregistrer.disabled = false; return; }
      message = 'Dépense enregistrée ✓';
      moisVise = date.slice(0, 7);
      annuler = () => supprimerDepense(res.depense.id, moisVise);
    } else {
      const type = (LIBELLES_REVENU.find((r) => r.libelle === etat.libelleRevenu) || {}).type;
      const res = await enregistrerRevenu({ montant, libelle: etat.libelleRevenu, type, note, date, mois: moisDuRevenu() });
      if (!res.enLocal) { boutonEnregistrer.disabled = false; return; }
      message = 'Revenu enregistré ✓';
      moisVise = res.revenu.mois;
      annuler = () => enfilerOperation('revenu.supprimer', { id: res.revenu.id, mois: res.revenu.mois });
    }
    if (moisVise !== moisCourant()) message += ` (${moisLabel(moisVise).toLowerCase()})`;
    afficherToast(message, { libelle: 'Annuler', faire: async () => { await annuler(); afficherToast('Saisie annulée'); } });
    reinitialiser();
    champMontant.focus();
    majStatutSauvegarde();
  }

  // ─── Evenements ───────────────────────────────────────────────────────

  champMontant.addEventListener('input', () => {
    // Affiche « 4 520 » au fil de la frappe : plus lisible, moins d'erreurs.
    const chiffres = champMontant.value.replace(/[^0-9]/g, '');
    champMontant.value = chiffres ? formatNombre(Number(chiffres)) : '';
    majBouton();
  });
  champMontant.addEventListener('keydown', (e) => { if (e.key === 'Enter') enregistrer(); });
  choixType.addEventListener('click', (e) => { const b = e.target.closest('button'); if (b) choisirType(b.dataset.type); });
  choixMoyen.addEventListener('click', (e) => { const b = e.target.closest('button'); if (b) choisirMoyen(b.dataset.moyen); });
  choixRevenu.addEventListener('click', (e) => { const b = e.target.closest('button'); if (b) choisirRevenu(b.dataset.libelle); });
  boutonNote.addEventListener('click', () => { champNote.hidden = false; boutonNote.hidden = true; champNote.focus(); });
  boutonDate.addEventListener('click', () => { champDate.hidden = !champDate.hidden; });
  champDate.addEventListener('change', majLibelleDate);
  boutonEnregistrer.addEventListener('click', enregistrer);

  ajusterLargeurMontant();
  afficherCategories().then(majBouton);
  return { focus: () => champMontant.focus() };
}
