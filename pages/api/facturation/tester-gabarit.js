import { verifierAcces, possedeFeature } from '../../../lib/facturation/auth';
import { extraireTexteBrut, interpreterFacture } from '../../../lib/facturation/pdfParser';

export const config = {
  api: { bodyParser: { sizeLimit: '15mb' } },
};

// Permet de coller un gabarit (JSON) et un PDF d'exemple, et de voir
// immédiatement ce qui serait extrait — sans rien enregistrer en base.
// Sert à ajuster les expressions régulières d'un fournisseur avant de
// les mettre en production.
export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Méthode non supportée' });
  }

  const acces = await verifierAcces(req);
  if (acces.erreur) return res.status(acces.erreur.status).json({ error: acces.erreur.message });
  const { userId, estAdmin, adminPublic } = acces;

  const peutModifier = await possedeFeature(adminPublic, userId, estAdmin, 'modifier');
  if (!peutModifier) {
    return res.status(403).json({ error: "Tu n'as pas le droit de tester un gabarit." });
  }

  const { fichierBase64, templateConfig } = req.body || {};
  if (!fichierBase64) {
    return res.status(400).json({ error: 'fichierBase64 est requis.' });
  }

  try {
    const bufferPdf = Buffer.from(fichierBase64, 'base64');
    const texte = await extraireTexteBrut(bufferPdf);
    const interpretation = interpreterFacture(texte, templateConfig || null);
    return res.status(200).json({
      ok: true,
      texteExtrait: texte.slice(0, 5000),
      interpretation,
    });
  } catch (err) {
    console.error('Erreur tester-gabarit:', err); // eslint-disable-line no-console
    return res.status(500).json({ error: err.message || 'Erreur inconnue.' });
  }
}
