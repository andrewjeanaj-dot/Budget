// Liste des mouvements d'un mois (depenses et revenus), avec filtre par
// categorie et suppression annulable. Sert a mouvements.html (telephone) et
// a la colonne de droite de l'accueil (ordinateur).

// Mois affiche, partage entre l'accueil et la page Mouvements le temps de la
// session (on revient sur le mois en cours a la prochaine ouverture).
const CLE_MOIS_AFFICHE = 'budget_mois_affiche';

function lireMoisAffiche() {
  let m = null;
  try { m = sessionStorage.getItem(CLE_MOIS_AFFICHE); } catch (e) { /* sans effet */ }
  return m && /^\d{4}-\d{2}$/.test(m) ? m : moisCourant();
}

function ecrireMoisAffiche(m) {
  try { sessionStorage.setItem(CLE_MOIS_AFFICHE, m); } catch (e) { /* sans effet */ }
}

function monterMouvements(racine, lireMois) {
  let filtre = 'tous';
  const sous = el('div', { class: 'sous', id: 'mvts-sous' });
  const selectFiltre = el('select', { class: 'champ', id: 'filtre-mvts', 'aria-label': 'Filtrer les mouvements' });
  const resume = el('div', { class: 'resume-liste', id: 'resume-mvts' });
  const liste = el('ul', { class: 'mvts', id: 'liste-mvts' });

  racine.replaceChildren(
    el('div', { class: 'entete-carte' }, el('div', {}, el('h2', {}, 'Mouvements'), sous)),
    selectFiltre,
    resume,
    el('div', { class: 'liste-defilante' }, liste));

  selectFiltre.addEventListener('change', () => { filtre = selectFiltre.value; rendre(); });

  function remplirFiltre(categories) {
    const actives = categories.filter((c) => !c.archive);
    selectFiltre.replaceChildren(
      el('option', { value: 'tous' }, 'Tous les mouvements'),
      el('option', { value: 'depenses' }, 'Dépenses seulement'),
      el('option', { value: 'revenus' }, 'Revenus seulement'),
      ...GROUPES.map((g) => {
        const cats = actives.filter((c) => c.groupe === g.id);
        return cats.length ? el('optgroup', { label: g.label }, cats.map((c) => el('option', { value: c.id }, c.libelle))) : null;
      }).filter(Boolean));
    if (![...selectFiltre.options].some((o) => o.value === filtre)) filtre = 'tous';
    selectFiltre.value = filtre;
  }

  function garder(m) {
    if (filtre === 'tous') return true;
    if (filtre === 'depenses') return m.sorte === 'depense';
    if (filtre === 'revenus') return m.sorte === 'revenu';
    return m.categorie_id === filtre;
  }

  async function supprimer(m) {
    if (m.sorte === 'depense') {
      await supprimerDepense(m.id, m.date.slice(0, 7));
      afficherToast('Mouvement supprimé', { libelle: 'Annuler', faire: () => restaurerDepense(m.id) });
    } else {
      await enfilerOperation('revenu.supprimer', { id: m.id, mois: m.mois });
      afficherToast('Mouvement supprimé', { libelle: 'Annuler', faire: () => enfilerOperation('revenu.ajouter', { ...m.brut, mois: m.mois }) });
    }
  }

  // ─── Modifier un mouvement ──────────────────────────────────────────────

  function champ(libelle, controle) {
    return el('label', { class: 'champ-fiche' }, el('span', { class: 'etiquette-champ' }, libelle), controle);
  }

  // Mois proposes pour un revenu : celui de sa date et le suivant (salaire de
  // fin de mois), plus celui ou il est range aujourd'hui.
  function optionsMoisRevenu(select, date, moisActuel) {
    const base = (date || `${moisActuel}-01`).slice(0, 7);
    const choix = [...new Set([base, moisSuivant(base), moisActuel])].sort();
    const garde = select.value || moisActuel;
    select.replaceChildren(...choix.map((m) => el('option', { value: m }, moisLabel(m))));
    select.value = choix.includes(garde) ? garde : base;
  }

  async function ouvrirEdition(m) {
    const snap = await obtenirInstantane();
    const estDepense = m.sorte === 'depense';
    const erreur = el('p', { class: 'form-err', role: 'alert' });
    const montant = el('input', { class: 'champ champ-montant-fiche', id: 'edit-montant', inputmode: 'numeric', autocomplete: 'off', value: formatNombre(m.montant) });
    montant.addEventListener('input', () => {
      const chiffres = montant.value.replace(/[^0-9]/g, '');
      montant.value = chiffres ? formatNombre(Number(chiffres)) : '';
    });
    const date = el('input', { class: 'champ', id: 'edit-date', type: 'date', value: m.sansDate ? '' : m.date });
    const note = el('input', { class: 'champ', id: 'edit-note', maxlength: '120', value: m.note, placeholder: 'Note (optionnel)' });

    let categorie, moyen, libelle, moisRevenu, caseReconduire;
    const champs = [champ('Montant (F)', montant)];
    if (estDepense) {
      const cats = (snap.categories || []).filter((c) => !c.archive || c.id === m.categorie_id);
      categorie = el('select', { class: 'champ', id: 'edit-categorie' },
        ...GROUPES.map((g) => {
          const liste = cats.filter((c) => c.groupe === g.id);
          return liste.length ? el('optgroup', { label: g.label }, liste.map((c) => el('option', { value: c.id }, c.libelle))) : null;
        }).filter(Boolean));
      categorie.value = m.categorie_id;
      moyen = el('select', { class: 'champ', id: 'edit-moyen' },
        el('option', { value: '' }, 'Non précisé'), ...MOYENS.map((x) => el('option', { value: x.id }, x.label)));
      moyen.value = m.moyen || '';
      champs.push(champ('Catégorie', categorie), champ('Payé par', moyen), champ('Date', date));
    } else {
      const libelles = LIBELLES_REVENU.map((x) => x.libelle);
      if (!libelles.includes(m.titre)) libelles.push(m.titre);
      libelle = el('select', { class: 'champ', id: 'edit-libelle' }, libelles.map((x) => el('option', { value: x }, x)));
      libelle.value = m.titre;
      moisRevenu = el('select', { class: 'champ', id: 'edit-mois' });
      optionsMoisRevenu(moisRevenu, date.value, m.mois);
      moisRevenu.value = m.mois;
      date.addEventListener('change', () => optionsMoisRevenu(moisRevenu, date.value, m.mois));
      champs.push(champ('Type de revenu', libelle), champ('Date d’arrivée', date), champ('Compté dans le budget de', moisRevenu));
      caseReconduire = el('input', { type: 'checkbox', id: 'edit-reconduire' });
      caseReconduire.checked = !!m.brut.reconduire;
      champs.push(el('label', { class: 'case-mois-suivant' }, caseReconduire, el('span', {}, 'Reconduire chaque mois (décocher arrête la reprise à partir du mois suivant)')));
    }
    champs.push(champ('Note', note));

    const fiche = el('dialog', { class: 'feuille', 'aria-labelledby': 'titre-edition' });
    const fermer = () => fiche.close();
    fiche.append(
      el('h2', { id: 'titre-edition' }, estDepense ? 'Modifier la dépense' : 'Modifier le revenu'),
      ...champs,
      erreur,
      el('div', { class: 'feuille-actions' },
        el('button', { type: 'button', class: 'bouton-texte danger', onclick: async () => { fermer(); await supprimer(m); } }, 'Supprimer'),
        el('button', { type: 'button', class: 'bouton-texte', onclick: fermer }, 'Annuler'),
        el('button', { type: 'button', class: 'bouton-principal', id: 'edit-enregistrer', onclick: enregistrer }, 'Enregistrer')));
    fiche.addEventListener('close', () => fiche.remove());
    document.body.appendChild(fiche);
    fiche.showModal();
    montant.focus();
    montant.select();

    async function enregistrer() {
      const nouveauMontant = lireMontant(montant.value);
      if (!(nouveauMontant > 0)) { erreur.textContent = 'Saisis un montant supérieur à 0.'; montant.focus(); return; }
      if (estDepense && !date.value) { erreur.textContent = 'Choisis une date.'; date.focus(); return; }
      let avant;
      let apres;
      if (estDepense) {
        avant = { id: m.id, montant: m.montant, categorie_id: m.categorie_id, date: m.date, note: m.note, moyen: m.moyen || null };
        apres = { id: m.id, montant: nouveauMontant, categorie_id: categorie.value, date: date.value, note: note.value.trim(), moyen: moyen.value || null, modifie_le: nowIso() };
        await enfilerOperation('depense.modifier', apres);
      } else {
        const type = (LIBELLES_REVENU.find((x) => x.libelle === libelle.value) || {}).type || m.brut.type || 'variable';
        const resteAuto = m.auto && nouveauMontant === m.montant && libelle.value === m.titre;
        avant = { id: m.id, mois: moisRevenu.value, nouveau_mois: m.mois, montant: m.montant, libelle: m.titre, type: m.brut.type, date: m.sansDate ? null : m.date, note: m.note, reconduire: !!m.brut.reconduire, auto: m.auto };
        apres = { id: m.id, mois: m.mois, nouveau_mois: moisRevenu.value, montant: nouveauMontant, libelle: libelle.value, type, date: date.value || null, note: note.value.trim(), reconduire: caseReconduire.checked, auto: resteAuto };
        await enfilerOperation('revenu.modifier', apres);
      }
      fermer();
      afficherToast('Mouvement modifié', {
        libelle: 'Annuler',
        faire: () => enfilerOperation(estDepense ? 'depense.modifier' : 'revenu.modifier', avant),
      });
    }
  }

  function ligne(m, mois) {
    const moyen = moyenInfo(m.moyen);
    const details = [];
    if (m.sorte === 'revenu' && m.date.slice(0, 7) !== mois) {
      details.push(`versé le ${dateCourte(m.date)}, compté pour ${moisLabel(mois).toLowerCase()}`);
    }
    if (m.auto) details.push('repris automatiquement');
    if (m.note) details.push(m.note);
    const signe = m.sorte === 'depense' ? '−' : '+';
    // Toute la ligne ouvre la fiche de modification (sauf la croix).
    const ouvrir = (e) => { if (!e.target.closest('.mvt-suppr')) ouvrirEdition(m); };
    return el('li', {
      class: 'mvt', tabindex: '0', role: 'button', title: 'Modifier',
      'aria-label': `Modifier ${m.titre} ${signe}${formatXPF(m.montant)}`,
      onclick: ouvrir,
      onkeydown: (e) => { if ((e.key === 'Enter' || e.key === ' ') && e.target === e.currentTarget) { e.preventDefault(); ouvrirEdition(m); } },
    },
      el('span', { class: 'mvt-ico', 'aria-hidden': 'true' }, m.icone),
      el('div', { style: { minWidth: '0' } },
        el('div', { class: 'mvt-cat' }, m.titre),
        moyen || details.length
          ? el('div', { class: 'mvt-sous', title: details.join(' · ') || null },
            moyen ? el('span', { class: 'mvt-moyen' }, moyen.label) : null, details.join(' · '))
          : null),
      el('div', { class: 'mvt-droite' },
        el('div', { class: 'mvt-montant ' + (m.sorte === 'depense' ? 'neg' : 'pos') }, signe + formatXPF(m.montant)),
        el('div', { class: 'mvt-date' }, m.sansDate && !m.auto ? 'sans date' : dateCourte(m.date))),
      el('button', {
        type: 'button', class: 'mvt-suppr', title: 'Supprimer',
        'aria-label': `Supprimer ${m.titre} ${signe}${formatXPF(m.montant)}`,
        onclick: () => supprimer(m),
      }, '✕'));
  }

  async function rendre() {
    const mois = lireMois();
    const snap = await obtenirInstantane();
    remplirFiltre(snap.categories || []);
    sous.textContent = moisLabel(mois);
    const tous = mouvementsDuMois(snap, mois).filter(garder);
    const solde = tous.reduce((s, m) => s + (m.sorte === 'revenu' ? m.montant : -m.montant), 0);
    resume.replaceChildren(
      el('span', {}, `${tous.length} mouvement${tous.length > 1 ? 's' : ''}`),
      el('span', {}, filtre === 'tous' ? 'Solde ' : 'Total ',
        el('b', {}, (solde < 0 ? '−' : solde > 0 ? '+' : '') + formatXPF(Math.abs(solde)))));
    if (tous.length === 0) {
      liste.replaceChildren(el('li', { class: 'vide' }, filtre === 'tous' ? 'Aucun mouvement ce mois-ci.' : 'Aucun mouvement pour ce filtre ce mois-ci.'));
      return;
    }
    liste.replaceChildren(...tous.map((m) => ligne(m, mois)));
  }

  window.addEventListener('donnees-modifiees', rendre);
  rendre();
  return {
    rendre,
    filtrer: (valeur) => { filtre = valeur; rendre(); },
  };
}
