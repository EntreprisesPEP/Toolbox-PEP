// ---------------------------------------------------------------------------
// PEPDAY — GÉOLOCALISATION ET ITINÉRAIRES (gratuits, sans clé)
//
// Géocodage : Nominatim, le service public d'OpenStreetMap. Gratuit, sans
// clé, mais sa politique d'usage limite à environ une requête par seconde :
// on ne l'appelle que sur un clic « Localiser », jamais pendant la frappe.
// Si un jour le volume grossit, il faudra un service payant — à approuver.
//
// Itinéraires : de simples liens vers Apple Plans et Google Maps, qui font le
// calcul eux-mêmes. Aucun appel d'API de notre côté.
// ---------------------------------------------------------------------------

export const CENTRE_PAR_DEFAUT = { lat: 45.40, lng: -73.57 }; // Rive-Sud de Montréal

export async function geocoder(adresse) {
  const q = String(adresse || '').trim();
  if (!q) return [];
  const url = `https://nominatim.openstreetmap.org/search?format=jsonv2&limit=5&countrycodes=ca&accept-language=fr&q=${encodeURIComponent(q)}`;
  const reponse = await fetch(url, { headers: { Accept: 'application/json' } });
  if (!reponse.ok) throw new Error(`Service de localisation indisponible (${reponse.status}).`);
  const data = await reponse.json();
  return (data || []).map((x) => ({ lat: Number(x.lat), lng: Number(x.lon), libelle: x.display_name }));
}

export function aPosition(x) {
  return x && Number.isFinite(Number(x.lat)) && Number.isFinite(Number(x.lng)) && x.lat !== null && x.lng !== null;
}

const coord = (p) => `${Number(p.lat).toFixed(6)},${Number(p.lng).toFixed(6)}`;

// Lien Google Maps : départ, arrivée et jusqu'à 9 arrêts intermédiaires.
export function lienGoogleMaps(points) {
  const pts = (points || []).filter(aPosition);
  if (pts.length < 2) return null;
  const depart = pts[0];
  const arrivee = pts[pts.length - 1];
  const arrets = pts.slice(1, -1).slice(0, 9);
  const q = new URLSearchParams({ api: '1', origin: coord(depart), destination: coord(arrivee), travelmode: 'driving' });
  if (arrets.length) q.set('waypoints', arrets.map(coord).join('|'));
  return `https://www.google.com/maps/dir/?${q.toString()}`;
}

// Lien Apple Plans. Sans arrêt : l'ancien format saddr/daddr, compris par
// toutes les versions d'iOS. Avec arrêts : le format « directions » avec
// waypoint, qui demande une version récente d'iOS / macOS (les anciennes
// ignorent les arrêts et tracent départ → arrivée).
export function lienApplePlans(points) {
  const pts = (points || []).filter(aPosition);
  if (pts.length < 2) return null;
  const depart = pts[0];
  const arrivee = pts[pts.length - 1];
  const arrets = pts.slice(1, -1);
  if (!arrets.length) {
    return `https://maps.apple.com/?saddr=${coord(depart)}&daddr=${coord(arrivee)}&dirflg=d`;
  }
  const q = new URLSearchParams({ source: coord(depart), destination: coord(arrivee), mode: 'driving' });
  arrets.forEach((a) => q.append('waypoint', coord(a)));
  return `https://maps.apple.com/directions?${q.toString()}`;
}

// Distance à vol d'oiseau (km) — pour un ordre de grandeur dans la liste
// des trajets, pas pour facturer.
export function distanceKm(a, b) {
  if (!aPosition(a) || !aPosition(b)) return null;
  const R = 6371;
  const rad = (d) => (d * Math.PI) / 180;
  const dLat = rad(b.lat - a.lat);
  const dLng = rad(b.lng - a.lng);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}
