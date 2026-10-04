import { createClient } from '@supabase/supabase-js';

// ---------------------------------------------------------------------------
// MÉNAGE DU CASIER — efface les photos de plus de 7 jours.
//
// L'app efface déjà les photos expirées de la personne qui l'ouvre. Cette
// tâche couvre le reste : quelqu'un qui dépose des photos puis ne revient
// jamais. Sans elle, la promesse « effacé après 7 jours » ne tiendrait que
// pour les gens actifs, ce qui n'est pas une promesse.
//
// Elle ne lit aucun contenu : elle liste des noms et des dates, et supprime.
// La clé service est nécessaire parce que les politiques du seau n'autorisent
// la suppression qu'au propriétaire du dossier.
// ---------------------------------------------------------------------------

const SEAU = 'transfert-photos-fichiers';
const JOURS_CONSERVATION = 7;

function autorise(req) {
  const authHeader = req.headers.authorization;
  if (process.env.CRON_SECRET && authHeader === `Bearer ${process.env.CRON_SECRET}`) return true;
  if (process.env.CRON_SECRET && req.query?.secret === process.env.CRON_SECRET) return true;
  return false;
}

export default async function handler(req, res) {
  if (!autorise(req)) return res.status(401).json({ error: 'Non autorisé' });

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const cle = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !cle) return res.status(500).json({ error: 'Configuration Supabase manquante.' });

  const admin = createClient(url, cle);
  const limite = Date.now() - JOURS_CONSERVATION * 86400000;

  try {
    // Premier niveau : un dossier par personne (son user_id).
    const { data: dossiers, error: erreurRacine } = await admin.storage.from(SEAU)
      .list('', { limit: 1000 });
    if (erreurRacine) throw erreurRacine;

    let effacees = 0;
    let lotsEffaces = 0;
    const personnes = (dossiers || []).filter((d) => !d.id); // un dossier n'a pas d'id

    // Depuis la révision 70, les photos sont rangées par lot d'import :
    //   <user_id>/p/<numéro de lot>/<fichier>   et la vignette sous /v/.
    // Il y a donc un niveau de plus à parcourir qu'avant.
    for (const personne of personnes) {
      const racineP = `${personne.name}/p`;
      const racineV = `${personne.name}/v`;

      const { data: lots, error: erreurLots } = await admin.storage.from(SEAU)
        .list(racineP, { limit: 1000 });
      if (erreurLots) throw erreurLots;

      for (const lot of (lots || []).filter((d) => !d.id)) {
        // Pagination explicite : sans elle, un lot de plus de 1000 photos
        // verrait les dernières rester pour toujours.
        let page = 0;
        let videLot = true;
        for (;;) {
          const { data: objets, error } = await admin.storage.from(SEAU)
            .list(`${racineP}/${lot.name}`, { limit: 1000, offset: page * 1000 });
          if (error) throw error;
          if (!objets || objets.length === 0) break;

          const fichiers = objets.filter((o) => o.id);
          const vieilles = fichiers.filter((o) => new Date(o.created_at).getTime() < limite);
          if (vieilles.length < fichiers.length) videLot = false;

          if (vieilles.length > 0) {
            const chemins = [];
            vieilles.forEach((o) => {
              chemins.push(`${racineP}/${lot.name}/${o.name}`, `${racineV}/${lot.name}/${o.name}`);
            });
            const { error: erreurSuppression } = await admin.storage.from(SEAU).remove(chemins);
            if (erreurSuppression) throw erreurSuppression;
            effacees += vieilles.length;
          }

          if (objets.length < 1000) break;
          page++;
        }
        if (videLot) lotsEffaces++;
      }
    }

    return res.status(200).json({ ok: true, casiers: personnes.length, lotsVides: lotsEffaces, photosEffacees: effacees });
  } catch (e) {
    console.error('Erreur ménage casier:', e); // eslint-disable-line no-console
    return res.status(500).json({ error: e.message || 'Erreur inconnue.' });
  }
}
