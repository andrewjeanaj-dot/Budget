// Petits graphiques SVG faits main (pas de dependance externe a telecharger).

// Montant court pour les etiquettes : 85 000 -> « 85k », 1 250 000 -> « 1,3M ».
function montantCourt(v) {
  const a = Math.abs(v);
  const signe = v < 0 ? '−' : '';
  if (a >= 1000000) return signe + (a / 1000000).toLocaleString('fr-FR', { maximumFractionDigits: 1 }) + 'M';
  if (a >= 1000) return signe + Math.round(a / 1000) + 'k';
  return signe + Math.round(a);
}

// Barres « prevu » (gris) et « depense » : la barre depensee n'est rouge que
// si elle depasse le prevu, sinon elle alarmerait pour rien.
function dessinerBarres(conteneur, donnees, cle1, cle2) {
  if (donnees.length === 0) { conteneur.innerHTML = '<p class="vide">Pas de données sur cette période.</p>'; return; }
  const largeur = 320, hauteur = 180, marge = 16;
  const max = Math.max(1, ...donnees.map((d) => Math.max(d[cle1], d[cle2])));
  const n = donnees.length;
  const largeurGroupe = (largeur - marge * 2) / n;
  const largeurBarre = Math.min(14, largeurGroupe / 3);
  const base = hauteur - 22;
  const haut = hauteur - 50;
  let svg = `<svg viewBox="0 0 ${largeur} ${hauteur}" style="width:100%; height:auto; overflow:visible">`;
  svg += `<line x1="${marge}" y1="${base}" x2="${largeur - 4}" y2="${base}" stroke="var(--bordure)" />`;
  donnees.forEach((d, i) => {
    const cx = marge + largeurGroupe * i + largeurGroupe / 2;
    const h1 = (d[cle1] / max) * haut;
    const h2 = (d[cle2] / max) * haut;
    const coul2 = d[cle2] > d[cle1] ? 'var(--rouge)' : 'var(--accent)';
    svg += `<rect x="${cx - largeurBarre - 1}" y="${base - h1}" width="${largeurBarre}" height="${h1}" fill="var(--texte-att)" opacity="0.6" rx="2"/>`;
    svg += `<rect x="${cx + 1}" y="${base - h2}" width="${largeurBarre}" height="${h2}" fill="${coul2}" rx="2"/>`;
    // Montant au-dessus de chaque barre, prevu comme depense. Si les deux
    // etiquettes se chevauchent (barres de hauteur proche), celle de la barre
    // la plus basse passe au-dessus de l'autre.
    let y1 = base - h1 - 4;
    let y2 = base - h2 - 4;
    if (d[cle1] > 0 && d[cle2] > 0 && Math.abs(y1 - y2) < 9) {
      if (h1 >= h2) y2 = y1 - 9; else y1 = y2 - 9;
    }
    if (d[cle1] > 0) {
      svg += `<text class="etiquette-prevu" x="${cx - 1 - largeurBarre / 2}" y="${y1}" font-size="8" font-weight="600" text-anchor="middle" fill="var(--texte-2)">${montantCourt(d[cle1])}</text>`;
    }
    if (d[cle2] > 0) {
      svg += `<text class="etiquette-depense" x="${cx + 1 + largeurBarre / 2}" y="${y2}" font-size="8" font-weight="600" text-anchor="middle" fill="${coul2}">${montantCourt(d[cle2])}</text>`;
    }
    svg += `<text x="${cx}" y="${hauteur - 8}" font-size="8" text-anchor="middle" fill="var(--texte-att)">${d.mois.slice(5)}/${d.mois.slice(2, 4)}</text>`;
  });
  svg += '</svg>';
  conteneur.innerHTML = svg;
}

function dessinerLigne(conteneur, donnees, cle) {
  if (donnees.length === 0) { conteneur.innerHTML = '<p class="vide">Pas de données sur cette période.</p>'; return; }
  const largeur = 320, hauteur = 140, marge = 24;
  const max = Math.max(1, ...donnees.map((d) => Math.abs(d[cle])));
  const n = donnees.length;
  const pas = (largeur - marge * 2) / Math.max(1, n - 1);
  const yMid = (hauteur - 20) / 2 + 6;
  const points = donnees.map((d, i) => [marge + pas * i, yMid - (d[cle] / max) * (yMid - 20)]);
  let svg = `<svg viewBox="0 0 ${largeur} ${hauteur}" style="width:100%; height:auto; overflow:visible">`;
  svg += `<line x1="${marge}" y1="${yMid}" x2="${largeur - 4}" y2="${yMid}" stroke="var(--bordure)"/>`;
  svg += `<text x="${largeur - 4}" y="${yMid - 3}" font-size="7" text-anchor="end" fill="var(--texte-att)">0</text>`;
  svg += `<polyline points="${points.map((p) => p.join(',')).join(' ')}" fill="none" stroke="var(--accent)" stroke-width="2"/>`;
  points.forEach((p, i) => {
    const v = donnees[i][cle];
    const coul = v < 0 ? 'var(--rouge)' : 'var(--vert)';
    svg += `<circle cx="${p[0]}" cy="${p[1]}" r="3" fill="${coul}"/>`;
    svg += `<text x="${p[0]}" y="${v < 0 ? p[1] + 12 : p[1] - 6}" font-size="8" font-weight="600" text-anchor="middle" fill="${coul}">${montantCourt(v)}</text>`;
  });
  donnees.forEach((d, i) => {
    svg += `<text x="${marge + pas * i}" y="${hauteur - 4}" font-size="8" text-anchor="middle" fill="var(--texte-att)">${d.mois.slice(5)}/${d.mois.slice(2, 4)}</text>`;
  });
  svg += '</svg>';
  conteneur.innerHTML = svg;
}
