// ---------------------------------------------------------------------------
// PEPDAY — LES TAUX « PRESET » ET LEUR GEL DANS LES LIGNES
//
// Une seule table de presets (pepday.taux), une rangée par année et par
// élément :
//   categorie 'main_oeuvre'   ref_type 'employe' ou 'metier' (RV02 : le métier remplace la classe)
//   categorie 'equipement'    ref_type 'equipement'
//   categorie 'materiau'      ref_type 'materiau'
//   categorie 'sous_traitant' ref_type 'organisation' (+ description : un
//                             sous-traitant peut avoir plusieurs prix)
//
// LA RÈGLE QUI COMPTE : le taux est COPIÉ dans la ligne du rapport au moment
// de la saisie (colonnes taux, taux_supp, taux_preset, taux_annee). Modifier
// un preset plus tard ne touche donc jamais un rapport déjà saisi — la ligne
// ne relit plus la table des presets.
//
// La même résolution est écrite en SQL dans le déclencheur
// pepday.figer_taux_ligne() (002_regles.sql) pour que la base l'impose même
// si un client mal écrit envoyait un autre taux.
// ---------------------------------------------------------------------------

export function anneeDe(dateIso) {
  const a = Number(String(dateIso || '').slice(0, 4));
  return Number.isFinite(a) && a > 2000 ? a : new Date().getFullYear();
}

// Le preset applicable, ou null. Pour la main-d'œuvre, le taux propre à
// l'employé passe avant celui de son métier.
export function trouverPreset({ categorie, refId, annee, presets, employes, description }) {
  const deLAnnee = (presets || []).filter((t) => Number(t.annee) === Number(annee) && t.categorie === categorie && t.actif !== false);
  if (!refId) return null;

  if (categorie === 'main_oeuvre') {
    const parEmploye = deLAnnee.find((t) => t.ref_type === 'employe' && t.ref_id === refId);
    if (parEmploye) return parEmploye;
    const emp = (employes || []).find((e) => e.id === refId);
    if (emp?.metier_id) {
      return deLAnnee.find((t) => t.ref_type === 'metier' && t.ref_id === emp.metier_id) || null;
    }
    return null;
  }
  const candidats = deLAnnee.filter((t) => t.ref_id === refId);
  if (description) {
    const exact = candidats.find((t) => (t.description || '') === description);
    if (exact) return exact;
  }
  return candidats[0] || null;
}

// Les colonnes de taux d'une nouvelle ligne, prêtes à être enregistrées.
export function tauxPourNouvelleLigne(args) {
  const preset = trouverPreset(args);
  if (!preset) {
    return {
      taux: Number(args.tauxManuel) || 0,
      taux_supp: args.categorie === 'main_oeuvre' ? Number(args.tauxManuelSupp) || 0 : null,
      taux_preset: null,
      taux_supp_preset: null,
      taux_annee: args.annee,
      taux_source: 'manuel',
      taux_preset_id: null,
    };
  }
  return {
    taux: Number(preset.taux) || 0,
    taux_supp: args.categorie === 'main_oeuvre' ? Number(preset.taux_supp ?? preset.taux * 1.5) : null,
    taux_preset: Number(preset.taux) || 0,
    taux_supp_preset: args.categorie === 'main_oeuvre' ? Number(preset.taux_supp ?? preset.taux * 1.5) : null,
    taux_annee: args.annee,
    taux_source: 'preset',
    taux_preset_id: preset.id,
    unite: preset.unite || undefined,
  };
}

// Le patch d'un taux custom : le nouveau taux, la raison et qui l'a mis.
// Revenir au preset efface la raison et l'auteur.
export function patchTauxCustom({ ligne, taux, tauxSupp, raison, moi }) {
  return {
    taux: Number(taux) || 0,
    taux_supp: ligne.categorie === 'main_oeuvre' ? Number(tauxSupp ?? ligne.taux_supp) || 0 : null,
    taux_source: 'custom',
    custom_raison: raison.trim(),
    custom_par_id: moi.membreId || null,
    custom_par_nom: moi.nom,
    custom_le: new Date().toISOString(),
  };
}

export function patchRetourPreset(ligne) {
  return {
    taux: ligne.taux_preset ?? ligne.taux,
    taux_supp: ligne.categorie === 'main_oeuvre' ? (ligne.taux_supp_preset ?? ligne.taux_supp) : null,
    taux_source: ligne.taux_preset == null ? 'manuel' : 'preset',
    custom_raison: null,
    custom_par_id: null,
    custom_par_nom: null,
    custom_le: null,
  };
}

// Copie tous les presets d'une année vers la suivante (augmentation en %),
// pour ne pas tout ressaisir en janvier.
export function copierPresets(presets, deAnnee, versAnnee, pourcentage = 0) {
  const facteur = 1 + (Number(pourcentage) || 0) / 100;
  const arrondi = (n) => (n == null ? null : Math.round(Number(n) * facteur * 100) / 100);
  return (presets || [])
    .filter((t) => Number(t.annee) === Number(deAnnee))
    .map(({ id, created_at, updated_at, ...reste }) => ({
      ...reste,
      annee: Number(versAnnee),
      taux: arrondi(reste.taux),
      taux_supp: arrondi(reste.taux_supp),
    }));
}
