import { useEffect, useRef } from 'react';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { CENTRE_PAR_DEFAUT, aPosition } from '../../lib/pepday/geo';

// ---------------------------------------------------------------------------
// PEPDAY — CARTE LEAFLET + OPENSTREETMAP
//
// Gratuit et sans clé. Les tuiles viennent de tile.openstreetmap.org, dont la
// politique d'usage convient à un usage interne modeste comme celui-ci.
//
// Composant impératif : Leaflet garde son propre état; React ne fait que lui
// passer les marqueurs. Les épingles sont des pastilles HTML (divIcon), ce
// qui évite le problème classique des images de marqueur introuvables avec
// un bundler.
//
// marqueurs : [{ id, lat, lng, couleur, forme: 'rond'|'carre', titre, onClick }]
// traces    : [{ id, points: [{lat,lng}], couleur }]
// epingle   : { lat, lng } déplaçable (fiche projet), onDeplacerEpingle(latlng)
// onClicCarte(latlng) : clic sur le fond de carte
// cleAjustement : quand cette valeur change, la vue se recadre sur le contenu
// regrouper : RV02 — les marqueurs proches à l'écran se regroupent en une
//             pastille numérotée (791 organisations rendraient la carte
//             illisible). Un clic sur la pastille zoome dessus. Fait maison
//             pour ne pas ajouter de dépendance au Toolbox.
// ---------------------------------------------------------------------------

const TAILLE_GRAPPE = 46; // px : deux marqueurs plus proches se regroupent

function iconeGrappe(n) {
  const taille = n < 10 ? 30 : n < 100 ? 36 : 42;
  return L.divIcon({
    className: '',
    html: `<div class="pd-grappe" style="width:${taille}px;height:${taille}px;background:#14213d">${n}</div>`,
    iconSize: [taille, taille],
    iconAnchor: [taille / 2, taille / 2],
  });
}

function icone(couleur, forme) {
  return L.divIcon({
    className: '',
    html: `<span class="pd-epingle ${forme === 'carre' ? 'carre' : ''}" style="display:block;background:${couleur}"></span>`,
    iconSize: [18, 18],
    iconAnchor: [9, 9],
  });
}

const ICONE_EPINGLE = L.divIcon({
  className: '',
  html: '<svg width="30" height="42" viewBox="0 0 30 42" xmlns="http://www.w3.org/2000/svg"><path d="M15 0C6.7 0 0 6.7 0 15c0 11 15 27 15 27s15-16 15-27C30 6.7 23.3 0 15 0z" fill="#c41230" stroke="#fff" stroke-width="2"/><circle cx="15" cy="15" r="5.5" fill="#fff"/></svg>',
  iconSize: [30, 42],
  iconAnchor: [15, 42],
});

export default function CarteLeaflet({
  marqueurs = [], traces = [], epingle = null, onDeplacerEpingle, onClicCarte, petite = false, cleAjustement = '', zoomInitial = 10, regrouper = false,
}) {
  const conteneur = useRef(null);
  const carte = useRef(null);
  const coucheMarqueurs = useRef(null);
  const coucheTraces = useRef(null);
  const marqueurEpingle = useRef(null);
  const rappels = useRef({});
  rappels.current = { onDeplacerEpingle, onClicCarte };
  const dessin = useRef({ marqueurs: [], regrouper: false });
  dessin.current = { marqueurs, regrouper };

  // Dessine les marqueurs, regroupés ou non, au zoom courant.
  const dessiner = useRef(() => {});
  dessiner.current = () => {
    const m = carte.current;
    const groupe = coucheMarqueurs.current;
    if (!m || !groupe) return;
    groupe.clearLayers();
    const liste = dessin.current.marqueurs.filter(aPosition);
    const simple = (x) => {
      const mk = L.marker([x.lat, x.lng], { icon: icone(x.couleur || '#14213d', x.forme), title: x.titre, riseOnHover: true });
      if (x.titre) mk.bindTooltip(x.titre, { direction: 'top', offset: [0, -8] });
      if (x.onClick) mk.on('click', () => x.onClick());
      groupe.addLayer(mk);
    };
    if (!dessin.current.regrouper || m.getZoom() >= 17) { liste.forEach(simple); return; }
    const cases = new Map();
    liste.forEach((x) => {
      const pt = m.project([x.lat, x.lng], m.getZoom());
      const cle = `${Math.floor(pt.x / TAILLE_GRAPPE)}:${Math.floor(pt.y / TAILLE_GRAPPE)}`;
      if (!cases.has(cle)) cases.set(cle, []);
      cases.get(cle).push(x);
    });
    cases.forEach((membres) => {
      if (membres.length === 1) { simple(membres[0]); return; }
      const lat = membres.reduce((s, x) => s + Number(x.lat), 0) / membres.length;
      const lng = membres.reduce((s, x) => s + Number(x.lng), 0) / membres.length;
      const mk = L.marker([lat, lng], { icon: iconeGrappe(membres.length), riseOnHover: true });
      mk.bindTooltip(membres.slice(0, 6).map((x) => x.titre).join('<br>') + (membres.length > 6 ? `<br>… et ${membres.length - 6} autres` : ''), { direction: 'top' });
      mk.on('click', () => m.fitBounds(L.latLngBounds(membres.map((x) => [x.lat, x.lng])).pad(0.3), { maxZoom: 18 }));
      groupe.addLayer(mk);
    });
  };

  // Création de la carte, une seule fois.
  useEffect(() => {
    const m = L.map(conteneur.current, { zoomControl: true, scrollWheelZoom: true, tap: true })
      .setView([CENTRE_PAR_DEFAUT.lat, CENTRE_PAR_DEFAUT.lng], zoomInitial);
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      maxZoom: 19,
      attribution: '&copy; contributeurs <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
    }).addTo(m);
    coucheTraces.current = L.layerGroup().addTo(m);
    coucheMarqueurs.current = L.layerGroup().addTo(m);
    m.on('click', (e) => rappels.current.onClicCarte?.({ lat: e.latlng.lat, lng: e.latlng.lng }));
    m.on('zoomend', () => dessiner.current());
    carte.current = m;
    // La carte peut naître dans un conteneur qui n'a pas encore sa taille.
    const t = setTimeout(() => m.invalidateSize(), 200);
    return () => { clearTimeout(t); m.remove(); carte.current = null; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Marqueurs.
  useEffect(() => { dessiner.current(); }, [marqueurs, regrouper]);

  // Tracés.
  useEffect(() => {
    const groupe = coucheTraces.current;
    if (!groupe) return;
    groupe.clearLayers();
    traces.forEach((t) => {
      const pts = (t.points || []).filter(aPosition).map((p) => [p.lat, p.lng]);
      if (pts.length >= 2) groupe.addLayer(L.polyline(pts, { color: t.couleur || '#c41230', weight: 4, opacity: 0.8, dashArray: '8 6' }));
    });
  }, [traces]);

  // Épingle déplaçable.
  useEffect(() => {
    const m = carte.current;
    if (!m) return;
    if (!aPosition(epingle)) {
      if (marqueurEpingle.current) { marqueurEpingle.current.remove(); marqueurEpingle.current = null; }
      return;
    }
    if (!marqueurEpingle.current) {
      marqueurEpingle.current = L.marker([epingle.lat, epingle.lng], { icon: ICONE_EPINGLE, draggable: Boolean(onDeplacerEpingle), autoPan: true }).addTo(m);
      marqueurEpingle.current.on('dragend', (e) => {
        const p = e.target.getLatLng();
        rappels.current.onDeplacerEpingle?.({ lat: p.lat, lng: p.lng });
      });
    } else {
      marqueurEpingle.current.setLatLng([epingle.lat, epingle.lng]);
    }
  }, [epingle, onDeplacerEpingle]);

  // Recadrage sur le contenu quand la clé change.
  useEffect(() => {
    const m = carte.current;
    if (!m) return;
    const pts = [
      ...marqueurs.filter(aPosition).map((x) => [x.lat, x.lng]),
      ...traces.flatMap((t) => (t.points || []).filter(aPosition).map((p) => [p.lat, p.lng])),
      ...(aPosition(epingle) ? [[epingle.lat, epingle.lng]] : []),
    ];
    if (pts.length === 1) m.setView(pts[0], 15);
    else if (pts.length > 1) m.fitBounds(L.latLngBounds(pts).pad(0.15), { maxZoom: 15 });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cleAjustement]);

  return <div ref={conteneur} className={`pd-carte-map ${petite ? 'petite' : ''}`} />;
}
