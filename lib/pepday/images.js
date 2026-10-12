// ---------------------------------------------------------------------------
// PEPDAY — PHOTOS DU CELLULAIRE, ALLÉGÉES AVANT L'ENVOI
//
// Même recette que la Visite de surintendant : 1920 px sur le plus grand
// côté, JPEG qualité 0,85. Une photo d'iPhone de 4 Mo tombe autour de
// 500 Ko, ce qui change tout avec un mauvais signal au chantier. Si quoi que
// ce soit échoue, on garde le fichier d'origine — mieux vaut une grosse photo
// qu'aucune photo.
// ---------------------------------------------------------------------------

export async function compresserImage(fichier, maxDim = 1920, qualite = 0.85) {
  if (!fichier.type || !fichier.type.startsWith('image/')) return fichier;
  if (typeof createImageBitmap !== 'function' || typeof document === 'undefined') return fichier;
  try {
    const bitmap = await createImageBitmap(fichier, { imageOrientation: 'from-image' });
    const ratio = Math.min(1, maxDim / Math.max(bitmap.width, bitmap.height));
    const canvas = document.createElement('canvas');
    canvas.width = Math.max(1, Math.round(bitmap.width * ratio));
    canvas.height = Math.max(1, Math.round(bitmap.height * ratio));
    const ctx = canvas.getContext('2d');
    if (!ctx) return fichier;
    ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    if (bitmap.close) bitmap.close();
    const blob = await new Promise((resoudre) => canvas.toBlob(resoudre, 'image/jpeg', qualite));
    if (!blob || blob.size >= fichier.size) return fichier;
    return new File([blob], `${fichier.name.replace(/\.[^.]+$/, '')}.jpg`, { type: 'image/jpeg' });
  } catch (e) {
    return fichier;
  }
}

export function nomFichierPropre(nom) {
  return String(nom || 'fichier').normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-zA-Z0-9._-]/g, '_');
}
