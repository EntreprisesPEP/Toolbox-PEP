// ---------------------------------------------------------------------------
// CREATION D'UN EXTRA — tout le calcul, isole ici pour etre testable.
//
// C'est un document qui part chez un client et qui devient une facture. Une
// erreur d'un cent se voit; une erreur de taxe se conteste. Rien de ce qui
// suit n'est fait a la legere.
//
// LA REGLE DES DEUX TAXES AU QUEBEC
// La TPS (5 %) et la TVQ (9,975 %) se calculent TOUTES LES DEUX sur le meme
// montant : le sous-total. La TVQ ne s'applique PAS sur la TPS — c'etait le
// cas avant 2013, ca ne l'est plus. Un calcul en cascade donnerait 0,4988 %
// de trop, soit 5 $ sur un extra de 1 000 $.
//
// L'ARGENT SE CALCULE EN CENTS, PAS EN DOLLARS
// 0.1 + 0.2 ne fait pas 0.3 en virgule flottante. Sur une addition de trente
// lignes, l'ecart finit par se voir au dollar pres dans le total. On arrondit
// donc chaque ligne au cent des qu'elle est calculee, on additionne des
// entiers, et on ne revient aux dollars qu'a l'affichage.
// ---------------------------------------------------------------------------

export const TAUX_TPS = 0.05;      // 5 %
export const TAUX_TVQ = 0.09975;   // 9,975 %

// Les identifiants (main_oeuvre, sous_traitants...) ne changent JAMAIS : ce
// sont eux qui sont ecrits dans chaque extra deja enregistre. Seuls les
// libelles affiches evoluent.
export const CATEGORIES = [
  { id: 'main_oeuvre',    libelle: "Main-d'œuvre et machinerie",     uniteDefaut: 'h' },
  { id: 'materiaux',      libelle: 'Matériaux',                      uniteDefaut: 'un' },
  { id: 'sous_traitants', libelle: 'Sous-traitants et frais connexes', uniteDefaut: 'forfait' },
  { id: 'autres',         libelle: 'Autres',                         uniteDefaut: 'un' },
];

export const UNITES = [
  'h', 'jour', 'sem', 'un', 'm', 'm²', 'm³', 'pi', 'pi²', 'pi³',
  'kg', 't', 'l', 'forfait', '%',
];

// ---------------------------------------------------------------------------
// LES QUATRE GABARITS
//
// Le squelette du document ne change pas d'un gabarit a l'autre : meme
// en-tete, memes taxes, meme bas de page, meme entente. Ce qui change, c'est
// CE QUI S'IMPRIME et COMMENT le total se nomme.
//
//   tm         temps et materiel — le detail complet, le defaut
//   forfait    un prix ferme; le detail sert a le batir mais ne s'imprime pas
//   credit     des travaux retires du contrat
//   sur_mesure on part de rien et on coche ce qu'on veut
//
// « signe » : -1 pour un credit. Les montants se saisissent et se calculent
// TOUJOURS en positif — personne ne tape des moins toute la journee sans se
// tromper. Le signe ne sert qu'au total range en base, pour que la liste
// des extras d'un projet s'additionne juste.
// ---------------------------------------------------------------------------
export const GABARITS = [
  {
    id: 'tm',
    libelle: 'Temps et matériel',
    resume: 'Le détail complet : heures, machinerie, matériaux, sous-traitants.',
    titreDocument: 'Demande de frais additionnels',
    libelleTotal: 'TOTAL AVEC TAXES',
    detailImprime: true,
    signe: 1,
  },
  {
    id: 'forfait',
    libelle: 'Forfait — prix ferme',
    resume: 'Le client voit l’étendue des travaux et UN prix. Le détail reste interne.',
    titreDocument: 'Soumission — prix forfaitaire',
    libelleTotal: 'PRIX FORFAITAIRE AVEC TAXES',
    detailImprime: false,
    signe: 1,
  },
  {
    id: 'credit',
    libelle: 'Crédit au contrat',
    resume: 'Des travaux retirés. Les montants se tapent en positif; le document dit « à déduire ».',
    titreDocument: 'Crédit au contrat',
    libelleTotal: 'CRÉDIT TOTAL AVEC TAXES',
    detailImprime: true,
    signe: -1,
  },
  {
    id: 'sur_mesure',
    libelle: 'Sur mesure',
    resume: 'Page blanche : tu coches ce qui paraît en haut et tu montes le document en blocs.',
    titreDocument: 'Demande de frais additionnels',
    libelleTotal: 'TOTAL AVEC TAXES',
    detailImprime: true,
    signe: 1,
  },
];

export function gabaritDe(id) {
  return GABARITS.find((g) => g.id === id) || GABARITS[0];
}

// ---------------------------------------------------------------------------
// CE QUI PARAIT EN HAUT DU DOCUMENT
//
// Chaque morceau se decoche. Les valeurs par defaut different par gabarit :
// un credit n'a pas besoin d'une description de travaux longue comme le bras,
// un sur-mesure part avec le strict minimum.
// ---------------------------------------------------------------------------
export const MORCEAUX_ENTETE = [
  { id: 'projet',       libelle: 'Projet' },
  { id: 'client',       libelle: 'Client et adresse du chantier' },
  { id: 'soumis_par',   libelle: 'Soumis par' },
  { id: 'destinataire', libelle: 'À l’attention de' },
  { id: 'date',         libelle: 'Date' },
  { id: 'revision',     libelle: 'Révision' },
  { id: 'sujet',        libelle: 'Sujet' },
  { id: 'description',  libelle: 'Description des travaux' },
  { id: 'signatures',   libelle: 'Lignes de signature, au bas du document' },
];

export function affichageParDefaut(gabarit) {
  const tout = {};
  MORCEAUX_ENTETE.forEach((m) => { tout[m.id] = true; });
  if (gabarit === 'sur_mesure') {
    return { ...tout, client: false, destinataire: false, description: false, signatures: false };
  }
  return tout;
}

// Un morceau est affiche sauf s'il est explicitement decoche. Un extra
// enregistre avant l'ajout d'un morceau n'a pas la cle : il doit continuer
// de le montrer, pas le faire disparaitre du jour au lendemain.
export function estAffiche(affichage, id) {
  const v = (affichage || {})[id];
  return v === undefined || v === null ? true : !!v;
}

// ---------------------------------------------------------------------------
// LES BLOCS LIBRES
//
// Quatre sortes, et ils vivent AVANT ou APRES le detail des couts :
//   texte    un titre et un paragraphe
//   tableau  tes propres colonnes; il peut compter dans le total ou pas
//   image    une photo de chantier ou un croquis, avec une legende
//   saut     force une nouvelle page
// ---------------------------------------------------------------------------
export const TYPES_BLOCS = [
  { id: 'texte',   libelle: 'Bloc de texte' },
  { id: 'tableau', libelle: 'Tableau maison' },
  { id: 'image',   libelle: 'Image ou plan' },
  { id: 'saut',    libelle: 'Saut de page' },
];

export const EMPLACEMENTS = [
  { id: 'avant', libelle: 'Avant le détail des coûts' },
  { id: 'apres', libelle: 'Après les totaux' },
];

export function blocsDe(blocs, emplacement) {
  return (blocs || []).filter((b) => (b.emplacement || 'avant') === emplacement);
}

// Le total d'un tableau maison : la somme de sa colonne de montants. Les
// cellules vides et le texte comptent pour zero — un tableau maison n'est pas
// une facture, on n'y bloque pas la saisie.
export function totalTableauCents(bloc) {
  if (!bloc || bloc.type !== 'tableau') return 0;
  const iM = Number(bloc.colonneMontant);
  if (!isFinite(iM) || iM < 0) return 0;
  return (bloc.rangees || []).reduce((somme, r) => {
    const v = analyserNombre((r || [])[iM]);
    return somme + (v === null ? 0 : Math.round(v * 100));
  }, 0);
}

// Seuls les tableaux dont l'interrupteur est arme entrent dans le total de
// l'extra. Les autres sont de l'information — un releve de temperatures, une
// liste de plans, un tableau de quantites deja payees.
export function tableauxQuiComptent(blocs) {
  return (blocs || []).filter((b) => b.type === 'tableau' && b.compteDansTotal);
}

// ---------------------------------------------------------------------------
// LE NUMERO D'UN EXTRA : EX-24-118-001-R00
//
//   EX        c'est un extra
//   24-118    le numero du projet — le meme que partout ailleurs au bureau
//   001       le combientieme extra DE CE PROJET
//   R00       la revision; R00 est l'originale
//
// Ce qui est garde en base, c'est la partie stable — « EX-24-118-001 ». La
// revision vit dans sa propre colonne et le suffixe se recompose a
// l'affichage. Deux raisons : monter une revision ne doit pas toucher a
// l'identite du document (c'est le MEME extra), et c'est cette partie stable
// que l'index unique protege — deux extras du meme projet ne peuvent pas
// porter le meme rang.
// ---------------------------------------------------------------------------
export function numeroAffiche(numero, revision) {
  if (!numero) return '';
  const n = Math.max(0, Math.round(analyserNombre(revision) || 0));
  return `${numero}-R${String(n).padStart(2, '0')}`;
}

// « EX-24-118-001 » -> « 24-118 ». Sert a voir si le numero correspond
// encore au projet choisi : si quelqu'un change de projet en cours de route,
// le numero doit etre refait, sinon le document annonce un projet et en
// nomme un autre.
//
// Le « .+ » est gourmand exprès : il prend tout jusqu'aux TROIS DERNIERS
// chiffres, alors un projet qui finit lui-meme par des chiffres (P-2024) se
// relit correctement — « EX-P-2024-001 » donne bien « P-2024 ».
export function projetDuNumero(numero) {
  // « \d{3,} » et non « \d{3} » : au millieme extra d'un projet le rang passe
  // a quatre chiffres, et un motif fige a trois ne le reconnaitrait plus —
  // l'app croirait que le projet a change et renumeroterait a chaque
  // sauvegarde.
  const m = String(numero || '').match(/^EX-(.+)-(\d{3,})$/);
  return m ? m[1] : null;
}

// ---------------------------------------------------------------------------
// LECTURE D'UN NOMBRE TAPE A LA MAIN
//
// On accepte ce que le monde tape vraiment : « 1 234,56 », « 1234.56 »,
// « 1 234,56 $ », « 12,5 ». L'espace insecable des claviers francais et le
// signe de dollar sont retires avant lecture.
//
// Le signe de pourcentage est retire lui aussi : « 10 % » dans la case
// d'administration et profit est ce que le monde tape naturellement, et sans
// ca on lirait null, donc zero — dix pour cent de majoration perdus en
// silence sur le document.
//
// Retourne null si ce n'est pas lisible — jamais 0. La difference compte :
// un champ vide n'est pas un prix de zero, et afficher 0 $ pour une saisie
// illisible, c'est afficher un faux montant sans le dire.
// ---------------------------------------------------------------------------
export function analyserNombre(brut) {
  if (typeof brut === 'number') return isFinite(brut) ? brut : null;
  if (brut === null || brut === undefined) return null;
  let t = String(brut).trim();
  if (!t) return null;
  t = t.replace(/[\s  ]/g, '').replace(/[$%]/g, '');
  t = t.replace(/,/g, '.');
  if (!/^-?\d*\.?\d*$/.test(t) || t === '' || t === '.' || t === '-') return null;
  const v = parseFloat(t);
  return isFinite(v) ? v : null;
}

// Dollars -> cents entiers. C'est ici, et seulement ici, qu'on arrondit.
export function enCents(dollars) {
  if (dollars === null || dollars === undefined || !isFinite(dollars)) return 0;
  return Math.round(dollars * 100);
}

export function enDollars(cents) {
  return (cents || 0) / 100;
}

// ---------------------------------------------------------------------------
// LE TOTAL D'UNE LIGNE, EN CENTS
// quantite x prix unitaire. La quantite peut avoir des decimales (3,5 h), le
// prix aussi (0,875 $ le pied). On arrondit une seule fois, a la fin.
// ---------------------------------------------------------------------------
export function totalLigneCents(ligne) {
  const q = analyserNombre(ligne?.quantite);
  const p = analyserNombre(ligne?.prix_unitaire);
  if (q === null || p === null) return 0;
  return Math.round(q * p * 100);
}

// Une ligne « complete » : celle qui compte vraiment dans le document. Une
// ligne a moitie remplie n'est pas une erreur pendant qu'on tape — c'en est
// une au moment d'envoyer. D'ou les deux notions separees.
export function ligneEstVide(ligne) {
  return !String(ligne?.description || '').trim()
    && analyserNombre(ligne?.quantite) === null
    && analyserNombre(ligne?.prix_unitaire) === null;
}

export function ligneEstComplete(ligne) {
  return !!String(ligne?.description || '').trim()
    && analyserNombre(ligne?.quantite) !== null
    && analyserNombre(ligne?.prix_unitaire) !== null;
}

// ---------------------------------------------------------------------------
// LE TOTAL COMPLET DE L'EXTRA
//
// majoration : UN pourcentage pour tout l'extra — l'administration et le
// profit. Il s'applique une seule fois, sur le total des travaux, tout en
// bas. Une majoration par categorie ajouterait trois lignes par categorie au
// document (sous-total, majoration, total) : le client se taperait douze
// lignes de mecanique avant d'arriver au chiffre qu'il cherche.
//
// Retourne tout en dollars, deja arrondi — l'appelant affiche, il ne
// recalcule pas.
// ---------------------------------------------------------------------------
export function calculerTotaux(lignes, majoration = 0, taux = {}, options = {}) {
  const tauxTps = taux.tps === undefined || taux.tps === null ? TAUX_TPS : Number(taux.tps);
  const tauxTvq = taux.tvq === undefined || taux.tvq === null ? TAUX_TVQ : Number(taux.tvq);

  const parCategorie = {};
  CATEGORIES.forEach((c) => {
    parCategorie[c.id] = { totalCents: 0, nb: 0 };
  });

  let travauxCents = 0;
  (lignes || []).forEach((l) => {
    const cat = parCategorie[l?.categorie];
    if (!cat) return;
    if (ligneEstVide(l)) return;
    const cents = totalLigneCents(l);
    cat.totalCents += cents;
    cat.nb += 1;
    travauxCents += cents;
  });

  // Les tableaux maison armes s'ajoutent au total des travaux, avant la
  // majoration : c'est du cout, comme le reste.
  const blocsCents = tableauxQuiComptent(options.blocs)
    .reduce((somme, b) => somme + totalTableauCents(b), 0);
  travauxCents += blocsCents;

  const pourcentage = analyserNombre(majoration) || 0;
  const majorationCents = Math.round(travauxCents * pourcentage / 100);

  // Un forfait : le prix soumis peut differer du cout calcule (on arrondit,
  // on absorbe, on ajuste). Quand il est rempli, c'est LUI le sous-total, et
  // l'ecart avec le cout calcule est retourne pour qu'on puisse l'afficher
  // dans l'app — jamais sur le document du client.
  const prixForfait = analyserNombre(options.prixForfaitaire);
  const coutCalculeCents = travauxCents + majorationCents;
  const forfaitImpose = options.gabarit === 'forfait' && prixForfait !== null;
  const sousTotalCents = forfaitImpose ? Math.round(prixForfait * 100) : coutCalculeCents;

  // Les deux taxes sur LE MEME montant. Voir l'entete du fichier.
  const tpsCents = Math.round(sousTotalCents * tauxTps);
  const tvqCents = Math.round(sousTotalCents * tauxTvq);
  const totalCents = sousTotalCents + tpsCents + tvqCents;

  const sortieCategories = {};
  CATEGORIES.forEach((c) => {
    sortieCategories[c.id] = {
      total: enDollars(parCategorie[c.id].totalCents),
      nb: parCategorie[c.id].nb,
    };
  });

  return {
    categories: sortieCategories,
    totalTravaux: enDollars(travauxCents),
    totalBlocs: enDollars(blocsCents),
    coutCalcule: enDollars(coutCalculeCents),
    forfaitImpose,
    ecartForfait: enDollars(sousTotalCents - coutCalculeCents),
    pourcentage,
    majoration: enDollars(majorationCents),
    sousTotal: enDollars(sousTotalCents),
    tauxTps, tauxTvq,
    tps: enDollars(tpsCents),
    tvq: enDollars(tvqCents),
    totalTaxes: enDollars(tpsCents + tvqCents),
    total: enDollars(totalCents),
  };
}

// ---------------------------------------------------------------------------
// AFFICHAGE
// « 1 234,56 $ » — format quebecois : virgule decimale, espace comme
// separateur de milliers, dollar apres le nombre.
// ---------------------------------------------------------------------------
export function formaterArgent(v, avecSymbole = true) {
  const n = typeof v === 'number' ? v : analyserNombre(v);
  if (n === null || !isFinite(n)) return avecSymbole ? '0,00 $' : '0,00';
  const texte = n.toLocaleString('fr-CA', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  // Uniformisation du separateur de milliers.
  //
  // Selon la version de Node ou du navigateur, « fr-CA » sort tantot une
  // espace insecable (U+00A0), tantot une insecable etroite (U+202F), tantot
  // une espace ordinaire ou fine. Quatre caracteres invisibles qui se
  // ressemblent a l'ecran mais pas dans un fichier : de quoi faire echouer
  // un test, une recherche ou un export sans qu'on voie pourquoi. On les
  // ramene tous a U+00A0, choisi parce qu'il empeche « 1 234 » de se couper
  // en fin de ligne. Ecrit en points de code, pas en caracteres litteraux,
  // justement pour qu'on puisse le lire.
  const propre = texte.replace(/[\u0020\u00a0\u2009\u202f]/g, '\u00a0');
  return avecSymbole ? `${propre}\u00a0$` : propre;
}

// Un prix qu'on remet DANS un champ de saisie : virgule decimale comme au
// clavier francais, pas de separateur de milliers (il rendrait le champ
// illisible a relire), et jusqu'a quatre decimales — les prix de reference
// sont stockes en numeric(12,4) et arrondir a deux ici changerait le prix
// sans le dire (0,8755 $ le pied deviendrait 0,88 $).
export function formaterPrixSaisie(v) {
  const n = analyserNombre(v);
  if (n === null) return '';
  return n.toLocaleString('fr-CA', {
    minimumFractionDigits: 2, maximumFractionDigits: 4, useGrouping: false,
  });
}

export function formaterQuantite(v) {
  const n = analyserNombre(v);
  if (n === null) return '';
  return n.toLocaleString('fr-CA', { minimumFractionDigits: 0, maximumFractionDigits: 3 });
}

export function formaterPourcentage(v) {
  const n = analyserNombre(v) || 0;
  return `${n.toLocaleString('fr-CA', { minimumFractionDigits: 0, maximumFractionDigits: 3 })} %`;
}

// ---------------------------------------------------------------------------
// CE QUI EMPECHE D'ENVOYER UN DOCUMENT FAUX
//
// Deux niveaux, et la distinction est le coeur de « minimiser les erreurs » :
//   bloquants    — le document serait faux ou inutilisable. On refuse.
//   avertissements — c'est probablement une erreur, mais ca peut etre voulu.
//                    On le dit, on laisse passer.
// ---------------------------------------------------------------------------
export function validerExtra(extra, lignes) {
  const bloquants = [];
  const avertissements = [];

  if (!extra?.projet_no) bloquants.push('Choisis le projet.');
  if (!String(extra?.sujet || '').trim()) bloquants.push('Écris le sujet de l’extra.');

  const g = gabaritDe(extra?.gabarit);
  const nonVides = (lignes || []).filter((l) => !ligneEstVide(l));
  const blocs = extra?.blocs || [];
  const aDuContenu = nonVides.length > 0
    || tableauxQuiComptent(blocs).length > 0
    || (g.id === 'forfait' && analyserNombre(extra?.prix_forfaitaire) !== null)
    || (g.id === 'sur_mesure' && blocs.length > 0);
  if (!aDuContenu) {
    bloquants.push(g.id === 'sur_mesure'
      ? 'Ajoute au moins une ligne de coût ou un bloc.'
      : 'Ajoute au moins une ligne.');
  }

  const incompletes = nonVides.filter((l) => !ligneEstComplete(l));
  if (incompletes.length > 0) {
    const noms = incompletes
      .map((l) => String(l.description || '').trim() || 'ligne sans description')
      .slice(0, 3).join(', ');
    bloquants.push(
      `${incompletes.length} ligne(s) incomplète(s) — il manque la description, la quantité ou le prix : ${noms}${incompletes.length > 3 ? '…' : ''}.`
    );
  }

  const courriel = String(extra?.destinataire_courriel || '').trim();
  if (courriel && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(courriel)) {
    bloquants.push("L’adresse courriel du destinataire n’est pas valide.");
  }

  if (extra?.afficher_soumis_par && !String(extra?.soumis_par || '').trim()) {
    bloquants.push('« Afficher qui a soumis » est coché mais le nom est vide.');
  }

  const revBrute = String(extra?.revision ?? '').trim();
  if (revBrute) {
    const rev = analyserNombre(revBrute);
    if (rev === null || rev < 0 || rev !== Math.round(rev)) {
      bloquants.push(`« ${revBrute} » n’est pas un numéro de révision valide (0, 1, 2…).`);
    }
  }

  // Une majoration illisible vaudrait zero. On ne laisse pas partir un
  // document ou dix pour cent d'administration se sont evapores en silence.
  const majBrute = String(extra?.majoration ?? '').trim();
  if (majBrute && analyserNombre(majBrute) === null) {
    bloquants.push(`« ${majBrute} » n’est pas un pourcentage lisible pour l’administration et le profit.`);
  }

  // Avertissements — on ne bloque pas, mais on le signale.
  // Un tableau maison arme sans colonne de montant choisie : il compte pour
  // zero et personne ne s'en apercoit avant de comparer les chiffres.
  tableauxQuiComptent(blocs).forEach((b) => {
    const i = Number(b.colonneMontant);
    if (!isFinite(i) || i < 0 || !(b.colonnes || [])[i]) {
      bloquants.push(`Le tableau « ${b.titre || 'sans titre'} » compte dans le total, mais aucune colonne de montants n’est choisie.`);
    }
  });

  const totaux = calculerTotaux(nonVides, extra?.majoration, {
    tps: extra?.taux_tps, tvq: extra?.taux_tvq,
  }, { blocs, gabarit: g.id, prixForfaitaire: extra?.prix_forfaitaire });
  if (totaux.sousTotal === 0 && aDuContenu) {
    avertissements.push('Le sous-total est de 0 $. Vérifie les quantités et les prix.');
  }
  if (g.id === 'forfait' && totaux.forfaitImpose && Math.abs(totaux.ecartForfait) > 0.005) {
    const sens = totaux.ecartForfait > 0 ? 'de plus que' : 'de moins que';
    avertissements.push(
      `Le prix forfaitaire est ${formaterArgent(Math.abs(totaux.ecartForfait))} ${sens} le coût calculé. Voulu ?`
    );
  }
  if (g.id === 'forfait' && !String(extra?.description || '').trim()) {
    avertissements.push("Un forfait sans description : le client n’a que le prix, pas l’étendue des travaux qu’il achète.");
  }
  const negatives = nonVides.filter((l) => totalLigneCents(l) < 0);
  if (negatives.length > 0) {
    avertissements.push(g.id === 'credit'
      ? `${negatives.length} ligne(s) au montant négatif dans un crédit — ça s’annule. Les montants d’un crédit se tapent en positif.`
      : `${negatives.length} ligne(s) au montant négatif — un crédit, c’est voulu ?`);
  }
  if (g.id !== 'forfait' && !String(extra?.description || '').trim()
    && estAffiche(extra?.affichage, 'description')) {
    avertissements.push("Pas de description des travaux. C’est elle qui justifie l’extra au client.");
  }

  return { bloquants, avertissements, valide: bloquants.length === 0 };
}
