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
    const personnes = (dossiers || []).filter((d) => !d.id); // un dossier n'a pas d'id

    for (const personne of personnes) {
      const prefixe = `${personne.name}/p`;
      const prefixeV = `${personne.name}/v`;

      // Pagination explicite : sans elle, une personne avec plus de 1000
      // photos verrait les plus anciennes rester pour toujours.
      let page = 0;
      for (;;) {
        const { data: objets, error } = await admin.storage.from(SEAU)
          .list(prefixe, { limit: 1000, offset: page * 1000 });
        if (error) throw error;
        if (!objets || objets.length === 0) break;

        const vieilles = objets.filter((o) => o.id && new Date(o.created_at).getTime() < limite);
        if (vieilles.length > 0) {
          const chemins = [];
          vieilles.forEach((o) => { chemins.push(`${prefixe}/${o.name}`, `${prefixeV}/${o.name}`); });
          const { error: erreurSuppression } = await admin.storage.from(SEAU).remove(chemins);
          if (erreurSuppression) throw erreurSuppression;
          effacees += vieilles.length;
        }

        if (objets.length < 1000) break;
        page++;
      }
    }

    return res.status(200).json({ ok: true, casiers: personnes.length, photosEffacees: effacees });
  } catch (e) {
    console.error('Erreur ménage casier:', e); // eslint-disable-line no-console
    return res.status(500).json({ error: e.message || 'Erreur inconnue.' });
  }
}
