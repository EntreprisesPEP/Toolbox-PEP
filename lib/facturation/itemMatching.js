// lib/facturation/itemMatching.js
//
// Fait correspondre une description brute (telle qu'elle apparaît sur une
// facture) à un item du catalogue unifié (facturation.items), en se
// servant de la table facturation.item_alias comme mémoire. Si aucune
// correspondance n'existe pour ce fournisseur, on tente une correspondance
// approximative (même texte normalisé) avant de créer un nouvel item.

function normaliser(texte) {
  return (texte || '')
    .toLowerCase()
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '') // retire les accents
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

// Récupère TOUTES les lignes de item_alias, en paginant explicitement —
// sans ça, PostgREST tronque silencieusement à 1000 lignes par défaut,
// et la correspondance floue (étape 2 ci-dessous) manquerait des alias
// une fois la table suffisamment grosse.
async function recupererTousLesAlias(supabase) {
  const TAILLE_PAGE = 1000;
  let toutes = [];
  let page = 0;
  for (;;) {
    const debut = page * TAILLE_PAGE;
    const { data, error } = await supabase
      .from('item_alias')
      .select('item_id, texte_brut')
      .range(debut, debut + TAILLE_PAGE - 1);
    if (error) throw error;
    toutes = toutes.concat(data || []);
    if (!data || data.length < TAILLE_PAGE) break;
    page++;
  }
  return toutes;
}

// Retourne { item_id, cree: bool } — trouve ou crée l'item correspondant
// à cette ligne de facture, pour ce fournisseur.
async function trouverOuCreerItem(supabase, fournisseurId, descriptionBrute, uniteSuggeree) {
  const texteNorm = normaliser(descriptionBrute);
  if (!texteNorm) return { item_id: null, cree: false };

  // 1. Alias déjà connu pour ce fournisseur, texte exact
  const { data: aliasExact } = await supabase
    .from('item_alias')
    .select('item_id')
    .eq('fournisseur_id', fournisseurId)
    .eq('texte_brut', descriptionBrute.trim())
    .maybeSingle();
  if (aliasExact?.item_id) return { item_id: aliasExact.item_id, cree: false };

  // 2. Alias existant chez N'IMPORTE quel fournisseur avec le même texte
  //    normalisé (permet de regrouper "Conduit SDR35 10po" et
  //    "conduit sdr-35, 10 po" sous le même item du catalogue).
  const aliasTousFournisseurs = await recupererTousLesAlias(supabase);
  if (aliasTousFournisseurs) {
    const match = aliasTousFournisseurs.find((a) => normaliser(a.texte_brut) === texteNorm);
    if (match) {
      // On enregistre aussi l'alias pour CE fournisseur, pour accélérer
      // la prochaine reconnaissance sans repasser par la recherche floue.
      await supabase.from('item_alias').insert({
        fournisseur_id: fournisseurId,
        texte_brut: descriptionBrute.trim(),
        item_id: match.item_id,
      });
      return { item_id: match.item_id, cree: false };
    }
  }

  // 3. Rien trouvé : on crée un nouvel item du catalogue à partir du
  //    texte brut (William pourra le renommer/fusionner ensuite dans
  //    l'écran "Catalogue d'items").
  const { data: nouvelItem, error } = await supabase
    .from('items')
    .insert({
      nom: descriptionBrute.trim().slice(0, 200),
      unite: uniteSuggeree || 'unité',
    })
    .select('id')
    .single();
  if (error) throw error;

  const { error: erreurAlias } = await supabase.from('item_alias').insert({
    fournisseur_id: fournisseurId,
    texte_brut: descriptionBrute.trim(),
    item_id: nouvelItem.id,
  });
  // Cas limite : deux imports pour le même fournisseur, exactement en
  // même temps, avec exactement la même ligne jamais vue avant (deux
  // factures importées au même instant). Le UNIQUE (fournisseur_id,
  // texte_brut) refuse alors le 2e insert d'alias — dans ce cas, on
  // récupère l'item que l'AUTRE import vient de créer au lieu de
  // continuer avec un item en double sans alias.
  if (erreurAlias) {
    const { data: aliasConcurrent } = await supabase
      .from('item_alias')
      .select('item_id')
      .eq('fournisseur_id', fournisseurId)
      .eq('texte_brut', descriptionBrute.trim())
      .maybeSingle();
    if (aliasConcurrent?.item_id) {
      // On supprime l'item qu'on vient de créer en double pour ne pas
      // laisser un item orphelin sans alias dans le catalogue.
      await supabase.from('items').delete().eq('id', nouvelItem.id);
      return { item_id: aliasConcurrent.item_id, cree: false };
    }
  }

  return { item_id: nouvelItem.id, cree: true };
}

module.exports = { normaliser, trouverOuCreerItem };
