import { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import { createClient } from '@supabase/supabase-js';
import GardeConnexion from '../../components/commun/GardeConnexion';
import EnTeteApp from '../../components/commun/EnTeteApp';
import { PALETTES, useModePep } from '../../components/commun/ThemeToolbox';
import {
  ArrowUpDown, Plus, Trash2, Save, MapPin, Ruler, AlertTriangle,
  CheckCircle2, Copy, Check,
} from 'lucide-react';
import {
  analyserPiedsPouces, formaterPiedsPouces, analyserGeo, formaterGeo,
  versGeo, versPieds, ecartEntre, PIED_EN_METRES,
} from '../../lib/geodesique/conversion';

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SUPABASE_ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

const supabaseGeo = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, { db: { schema: 'geodesique' } });
const supabaseLP = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, { db: { schema: 'liste_projets' } });

const THEMES = PALETTES;
const BRAND_RED = '#c41230';
const VERT = '#019155';

const ONGLETS = [
  { id: 'conversion', libelle: 'Conversion' },
  { id: 'points', libelle: 'Points du projet' },
  { id: 'reference', libelle: 'Référence' },
];

// ===========================================================================
// L'APP
// ===========================================================================
function ConversionGeodesiqueApp({ userId, nom, poste }) {
  const [mode, setMode] = useModePep();
  const th = THEMES[mode];

  const [onglet, setOnglet] = useState('conversion');
  const [chargement, setChargement] = useState(true);
  const [erreurChargement, setErreurChargement] = useState('');

  const [projets, setProjets] = useState([]);
  const [projetNo, setProjetNo] = useState('');
  const [refs, setRefs] = useState({});      // projet_no -> { geo_100, unite_geo, note, maj_par, maj_le }
  const [points, setPoints] = useState([]);

  // Les deux champs de conversion vivent ICI, pas dans l'onglet. Sinon un
  // aller-retour vers « Points du projet » efface ce qu'on venait de taper —
  // sur un chantier, on va verifier un point et on revient.
  const [champPieds, setChampPieds] = useState('');
  const [champGeo, setChampGeo] = useState('');
  const [dernier, setDernier] = useState(null);   // 'pieds' | 'geo'

  // ---- chargement initial -------------------------------------------------
  const charger = useCallback(async () => {
    setChargement(true);
    setErreurChargement('');
    const [pr, rf] = await Promise.all([
      supabaseLP.from('projets').select('no, nom, charge, surintendant, archive')
        .or('archive.is.null,archive.eq.false').order('no', { ascending: false }),
      supabaseGeo.from('references_projet').select('*'),
    ]);
    if (pr.error || rf.error) {
      setErreurChargement(
        "Impossible de charger les données. Vérifie que le schéma « geodesique » est exposé dans Supabase, puis réessaie."
      );
      setChargement(false);
      return;
    }
    setProjets(pr.data || []);
    const map = {};
    (rf.data || []).forEach((r) => { map[r.projet_no] = r; });
    setRefs(map);
    setChargement(false);
  }, []);

  useEffect(() => { charger(); }, [charger]);

  // ---- les points du projet choisi ---------------------------------------
  const chargerPoints = useCallback(async (no) => {
    if (!no) { setPoints([]); return; }
    const { data, error } = await supabaseGeo.from('points').select('*')
      .eq('projet_no', no).order('position', { ascending: true });
    if (!error) setPoints(data || []);
  }, []);

  useEffect(() => { chargerPoints(projetNo); }, [projetNo, chargerPoints]);

  // On change de projet : on vide les champs. La reference n'est plus la meme,
  // donc la valeur affichee ne veut plus rien dire. Mieux vaut un champ vide
  // qu'un chiffre juste pour l'ancien projet.
  useEffect(() => { setChampPieds(''); setChampGeo(''); setDernier(null); }, [projetNo]);

  const projet = projets.find((p) => p.no === projetNo) || null;
  const reference = refs[projetNo] || null;
  const refGeo = reference ? Number(reference.geo_100) : null;
  const uniteGeo = reference ? reference.unite_geo : 'metres';
  const uniteTexte = uniteGeo === 'pieds' ? 'pi' : 'm';

  return (
    <div style={{ minHeight: '100vh', background: th.bg, color: th.text,
      fontFamily: "Calibri, 'Segoe UI', Candara, Optima, Arial, sans-serif" }}>
      <EnTeteApp
        titre="Conversion géodésique"
        sousTitre="Pieds-pouces ↔ géodésique, par projet"
        mode={mode}
        onChangerMode={setMode}
        nom={nom}
        poste={poste}
      />

      <div style={{ maxWidth: 1000, margin: '0 auto', padding: '0 16px 60px' }}>

        {/* ---- choix du projet ---- */}
        <div style={{ background: th.panel, border: `1px solid ${th.line}`, borderRadius: 8,
          padding: 16, marginBottom: 16, boxShadow: th.ombre }}>
          <label style={{ display: 'block', fontSize: 12, fontWeight: 700, letterSpacing: '.06em',
            textTransform: 'uppercase', color: th.textDim, marginBottom: 7 }}>
            Projet
          </label>
          <select
            value={projetNo}
            onChange={(e) => setProjetNo(e.target.value)}
            style={{ width: '100%', maxWidth: 520, padding: '10px 11px', fontSize: 15,
              background: th.inputBg, color: th.text, border: `1px solid ${th.line}`,
              borderRadius: 5, fontFamily: 'inherit' }}
          >
            <option value="">— Choisir un projet —</option>
            {projets.map((p) => (
              <option key={p.no} value={p.no}>{p.no} — {p.nom}</option>
            ))}
          </select>

          {projet && (
            <div style={{ marginTop: 10, fontSize: 13, color: th.textDim, display: 'flex',
              gap: 18, flexWrap: 'wrap' }}>
              {projet.charge && <span>Chargé de projet : <strong style={{ color: th.text }}>{projet.charge}</strong></span>}
              {projet.surintendant && <span>Surintendant : <strong style={{ color: th.text }}>{projet.surintendant}</strong></span>}
            </div>
          )}

          {projetNo && (
            <div style={{ marginTop: 12 }}>
              {reference ? (
                <div style={{ background: th.okBg, border: `1px solid ${th.okLigne}`, borderRadius: 5,
                  padding: '9px 12px', fontSize: 14, display: 'flex', alignItems: 'center', gap: 9,
                  flexWrap: 'wrap' }}>
                  <CheckCircle2 size={16} style={{ color: th.okLigne, flexShrink: 0 }} />
                  <span>
                    <strong>100&apos;-0&quot; = {formaterGeo(refGeo)} {uniteTexte}</strong>
                    {reference.note ? <span style={{ color: th.textDim }}> · {reference.note}</span> : null}
                  </span>
                </div>
              ) : (
                <div style={{ background: th.avisBg, border: `1px solid ${th.avisTexte}`, borderRadius: 5,
                  padding: '9px 12px', fontSize: 14, color: th.avisTexte, display: 'flex',
                  alignItems: 'center', gap: 9, flexWrap: 'wrap' }}>
                  <AlertTriangle size={16} style={{ flexShrink: 0 }} />
                  <span>Aucune référence pour ce projet. Va dans l&apos;onglet <strong>Référence</strong> et entre ce que dit le plan.</span>
                </div>
              )}
            </div>
          )}
        </div>

        {erreurChargement && (
          <div style={{ background: th.errBg, border: `1px solid ${th.errTexte}`, color: th.errTexte,
            borderRadius: 5, padding: '11px 13px', fontSize: 14, marginBottom: 16 }}>
            {erreurChargement}
          </div>
        )}

        {/* ---- onglets ---- */}
        <div style={{ display: 'flex', gap: 4, marginBottom: 16, overflowX: 'auto' }}>
          {ONGLETS.map((o) => {
            const actif = onglet === o.id;
            return (
              <button key={o.id} onClick={() => setOnglet(o.id)} style={{
                background: actif ? BRAND_RED : th.panel,
                color: actif ? '#fff' : th.textDim,
                border: `1px solid ${actif ? BRAND_RED : th.line}`,
                borderRadius: 5, padding: '9px 15px', fontSize: 13.5, fontWeight: 600,
                cursor: 'pointer', whiteSpace: 'nowrap', fontFamily: 'inherit',
              }}>
                {o.libelle}
              </button>
            );
          })}
        </div>

        {chargement ? (
          <div style={{ color: th.textDim, fontSize: 14, padding: 20 }}>Chargement…</div>
        ) : (
          <>
            {onglet === 'conversion' && (
              <OngletConversion th={th} refGeo={refGeo} uniteGeo={uniteGeo} uniteTexte={uniteTexte}
                projetNo={projetNo} points={points}
                champPieds={champPieds} setChampPieds={setChampPieds}
                champGeo={champGeo} setChampGeo={setChampGeo}
                dernier={dernier} setDernier={setDernier} />
            )}
            {onglet === 'points' && (
              <OngletPoints th={th} refGeo={refGeo} uniteGeo={uniteGeo} uniteTexte={uniteTexte}
                projetNo={projetNo} points={points} rechargerPoints={() => chargerPoints(projetNo)}
                nom={nom} />
            )}
            {onglet === 'reference' && (
              <OngletReference th={th} projetNo={projetNo} projet={projet} reference={reference}
                nom={nom} recharger={charger} />
            )}
          </>
        )}
      </div>
    </div>
  );
}

// ===========================================================================
// ONGLET 1 — LA CONVERSION
// Deux champs lies. On tape dans l'un, l'autre suit. Le champ qu'on est en
// train de modifier n'est jamais reecrit sous les doigts : c'est ce qui
// permet de taper « 100'-6 » sans que l'app reformate a chaque touche.
// ===========================================================================
function OngletConversion({ th, refGeo, uniteGeo, uniteTexte, projetNo, points,
  champPieds, setChampPieds, champGeo, setChampGeo, dernier, setDernier }) {
  const [copie, setCopie] = useState('');

  const piedsLus = analyserPiedsPouces(champPieds);
  const geoLu = analyserGeo(champGeo);

  // Quand on tape en pieds-pouces
  function saisirPieds(v) {
    setChampPieds(v);
    setDernier('pieds');
    const p = analyserPiedsPouces(v);
    setChampGeo(p === null || refGeo === null ? '' : formaterGeo(versGeo(p, refGeo, uniteGeo)));
  }
  // Quand on tape en géodésique
  function saisirGeo(v) {
    setChampGeo(v);
    setDernier('geo');
    const g = analyserGeo(v);
    setChampPieds(g === null || refGeo === null ? '' : formaterPiedsPouces(versPieds(g, refGeo, uniteGeo)));
  }

  function copier(texte, quoi) {
    if (!texte) return;
    try {
      navigator.clipboard.writeText(texte);
      setCopie(quoi);
      setTimeout(() => setCopie(''), 1600);
    } catch (e) { /* le presse-papier peut etre refuse, ce n'est pas grave */ }
  }

  const pretAConvertir = refGeo !== null;

  // La valeur « propre » de chaque cote, pour l'affichage de controle
  const piedsResolu = dernier === 'geo'
    ? (geoLu !== null && refGeo !== null ? versPieds(geoLu, refGeo, uniteGeo) : null)
    : piedsLus;
  const geoResolu = dernier === 'pieds'
    ? (piedsLus !== null && refGeo !== null ? versGeo(piedsLus, refGeo, uniteGeo) : null)
    : geoLu;

  const saisieInvalide =
    (champPieds.trim() !== '' && piedsLus === null && dernier === 'pieds') ||
    (champGeo.trim() !== '' && geoLu === null && dernier === 'geo');

  const styleChamp = {
    width: '100%', padding: '14px 14px', fontSize: 22, fontWeight: 600,
    background: th.inputBg, color: th.text, border: `1px solid ${th.line}`,
    borderRadius: 6, fontFamily: 'inherit', letterSpacing: '.01em',
  };

  if (!projetNo) {
    return <Vide th={th} texte="Choisis un projet pour commencer." />;
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>

      <div style={{ background: th.panel, border: `1px solid ${th.line}`, borderRadius: 8,
        padding: 18, boxShadow: th.ombre, opacity: pretAConvertir ? 1 : 0.55 }}>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr auto 1fr', gap: 14,
          alignItems: 'end' }} className="geo-grille">
          <div>
            <EnTeteChamp th={th} pour="champPieds" texte="Pieds-pouces"
              valeur={piedsResolu !== null ? formaterPiedsPouces(piedsResolu) : ''}
              onCopier={() => copier(formaterPiedsPouces(piedsResolu), 'pieds')}
              copie={copie === 'pieds'} />
            <input
              id="champPieds"
              value={champPieds}
              onChange={(e) => saisirPieds(e.target.value)}
              disabled={!pretAConvertir}
              placeholder={"100'-6 1/2\""}
              inputMode="text"
              autoComplete="off"
              style={styleChamp}
            />
          </div>

          <div style={{ paddingBottom: 14, color: th.textDim, display: 'flex',
            justifyContent: 'center' }} className="geo-fleche">
            <ArrowUpDown size={20} style={{ transform: 'rotate(90deg)' }} />
          </div>

          <div>
            <EnTeteChamp th={th} pour="champGeo" texte={`Géodésique (${uniteTexte})`}
              valeur={geoResolu !== null ? formaterGeo(geoResolu) : ''}
              onCopier={() => copier(formaterGeo(geoResolu), 'geo')}
              copie={copie === 'geo'} />
            <input
              id="champGeo"
              value={champGeo}
              onChange={(e) => saisirGeo(e.target.value)}
              disabled={!pretAConvertir}
              placeholder="45.402"
              inputMode="decimal"
              autoComplete="off"
              style={styleChamp}
            />
          </div>
        </div>

        {saisieInvalide && (
          <div style={{ marginTop: 11, fontSize: 13.5, color: th.errTexte }}>
            Je n&apos;arrive pas à lire cette valeur. Exemples acceptés : <code>100</code>,{' '}
            <code>100&apos;-6&quot;</code>, <code>100-6</code>, <code>100&apos;-6 1/2&quot;</code>,{' '}
            <code>98&apos;-10 3/8&quot;</code>, <code>-2&apos;-6&quot;</code>.
          </div>
        )}

        {!pretAConvertir && (
          <div style={{ marginTop: 11, fontSize: 13.5, color: th.avisTexte }}>
            Il manque la référence du projet — onglet <strong>Référence</strong>.
          </div>
        )}

      </div>

      {/* écart avec les points enregistrés */}
      {pretAConvertir && geoResolu !== null && points.length > 0 && (
        <div style={{ background: th.panel, border: `1px solid ${th.line}`, borderRadius: 8,
          padding: 18, boxShadow: th.ombre }}>
          <div style={{ fontSize: 12, fontWeight: 700, letterSpacing: '.06em',
            textTransform: 'uppercase', color: th.textDim, marginBottom: 11 }}>
            Écart avec les points du projet
          </div>
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 14, minWidth: 420 }}>
              <thead>
                <tr>
                  <Th th={th}>Point</Th>
                  <Th th={th} droite>Géodésique</Th>
                  <Th th={th} droite>Écart</Th>
                </tr>
              </thead>
              <tbody>
                {points.map((pt) => {
                  const e = ecartEntre(geoResolu, Number(pt.geo), uniteGeo);
                  const dessus = e.geo >= 0;
                  return (
                    <tr key={pt.id} style={{ borderTop: `1px solid ${th.line}` }}>
                      <td style={{ padding: '8px 10px' }}>{pt.nom}</td>
                      <td style={{ padding: '8px 10px', textAlign: 'right',
                        fontVariantNumeric: 'tabular-nums' }}>{formaterGeo(Number(pt.geo))}</td>
                      <td style={{ padding: '8px 10px', textAlign: 'right',
                        fontVariantNumeric: 'tabular-nums',
                        color: Math.abs(e.geo) < 0.0005 ? th.textDim : (dessus ? th.okLigne : th.errTexte) }}>
                        {Math.abs(e.geo) < 0.0005 ? 'même niveau'
                          : `${dessus ? '+' : '−'}${formaterPiedsPouces(Math.abs(e.pieds))}`}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          <div style={{ marginTop: 9, fontSize: 12.5, color: th.textDim }}>
            Un écart positif veut dire que la valeur saisie est <strong>au-dessus</strong> du point.
          </div>
        </div>
      )}

      <AideSaisie th={th} uniteTexte={uniteTexte} uniteGeo={uniteGeo} />

      <style jsx>{`
        @media (max-width: 640px) {
          :global(.geo-grille) { grid-template-columns: 1fr !important; }
          :global(.geo-fleche) { padding-bottom: 0 !important; }
        }
      `}</style>
    </div>
  );
}

// En-tete d'un champ : l'etiquette, et un bouton copier qui n'apparait que
// quand il y a vraiment quelque chose a copier. Les deux grosses tuiles de
// resultat qui etaient ici repetaient mot pour mot le contenu des champs —
// vu au rendu, retirees.
function EnTeteChamp({ th, pour, texte, valeur, onCopier, copie }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between',
      gap: 8, marginBottom: 7, minHeight: 22 }}>
      <label htmlFor={pour} style={{ fontSize: 12, fontWeight: 700, letterSpacing: '.06em',
        textTransform: 'uppercase', color: th.textDim }}>
        {texte}
      </label>
      {valeur ? (
        <button onClick={onCopier} title="Copier" aria-label={`Copier ${texte}`} style={{
          background: 'none', border: 'none', cursor: 'pointer', padding: '2px 4px',
          color: copie ? VERT : th.textDim, display: 'inline-flex', alignItems: 'center',
          gap: 5, fontSize: 11.5, fontWeight: 600, fontFamily: 'inherit',
        }}>
          {copie ? <><Check size={13} /> copié</> : <><Copy size={13} /> copier</>}
        </button>
      ) : null}
    </div>
  );
}

function AideSaisie({ th, uniteTexte, uniteGeo }) {
  return (
    <div style={{ background: th.infoBg, border: `1px solid ${th.line}`, borderRadius: 8,
      padding: '13px 15px', fontSize: 13.5, color: th.textDim, lineHeight: 1.65 }}>
      <div style={{ fontWeight: 700, color: th.text, marginBottom: 5 }}>Ce que tu peux taper</div>
      Dans le champ pieds-pouces : <code>100</code>, <code>100&apos;</code>, <code>100-6</code>,{' '}
      <code>100 6</code>, <code>100&apos;-6&quot;</code>, <code>100&apos;-6 1/2&quot;</code>,{' '}
      <code>98&apos;-10 3/8&quot;</code>, <code>6&quot;</code> pour six pouces, ou un négatif comme{' '}
      <code>-2&apos;-6&quot;</code>. La virgule marche aussi bien que le point.
      <div style={{ marginTop: 7 }}>
        Les résultats en pieds-pouces sont arrondis au <strong>1/8 de pouce</strong>, et le
        géodésique s&apos;affiche à trois décimales{uniteGeo === 'metres'
          ? <> — un millimètre</>
          : <> ({uniteTexte})</>}.
      </div>
    </div>
  );
}

// ===========================================================================
// ONGLET 2 — LES POINTS DU PROJET
// On enregistre la valeur GEODESIQUE : c'est elle qui est absolue. Le
// pieds-pouces se recalcule a l'affichage. Corriger une reference mal
// saisie corrige donc tous les points d'un coup.
// ===========================================================================
function OngletPoints({ th, refGeo, uniteGeo, uniteTexte, projetNo, points, rechargerPoints, nom }) {
  const [nouveauNom, setNouveauNom] = useState('');
  const [nouveauPieds, setNouveauPieds] = useState('');
  const [nouveauGeo, setNouveauGeo] = useState('');
  const [message, setMessage] = useState(null);
  const [enCours, setEnCours] = useState(false);
  const minuterie = useRef(null);

  useEffect(() => () => { if (minuterie.current) clearTimeout(minuterie.current); }, []);

  function afficher(texte, ok) {
    if (minuterie.current) clearTimeout(minuterie.current);
    setMessage({ texte, ok });
    if (ok) minuterie.current = setTimeout(() => setMessage(null), 4000);
  }

  function saisirPieds(v) {
    setNouveauPieds(v);
    const p = analyserPiedsPouces(v);
    setNouveauGeo(p === null || refGeo === null ? '' : formaterGeo(versGeo(p, refGeo, uniteGeo)));
  }
  function saisirGeo(v) {
    setNouveauGeo(v);
    const g = analyserGeo(v);
    setNouveauPieds(g === null || refGeo === null ? '' : formaterPiedsPouces(versPieds(g, refGeo, uniteGeo)));
  }

  async function ajouter() {
    const g = analyserGeo(nouveauGeo);
    if (!nouveauNom.trim()) { afficher('Donne un nom au point.', false); return; }
    if (g === null) { afficher('La valeur du point est illisible.', false); return; }
    setEnCours(true);
    const { error } = await supabaseGeo.from('points').insert({
      projet_no: projetNo,
      nom: nouveauNom.trim(),
      geo: g,
      position: points.length,
      cree_par: nom,
    });
    setEnCours(false);
    if (error) { afficher(`Échec, rien n'a été enregistré : ${error.message}`, false); return; }
    setNouveauNom(''); setNouveauPieds(''); setNouveauGeo('');
    await rechargerPoints();
    afficher('Point enregistré ✓', true);
  }

  async function supprimer(id, nomPoint) {
    if (typeof window !== 'undefined' && !window.confirm(`Supprimer « ${nomPoint} » ?`)) return;
    setEnCours(true);
    const { error } = await supabaseGeo.from('points').delete().eq('id', id);
    setEnCours(false);
    if (error) { afficher(`Échec de la suppression : ${error.message}`, false); return; }
    await rechargerPoints();
    afficher('Point supprimé ✓', true);
  }

  if (!projetNo) return <Vide th={th} texte="Choisis un projet pour voir ses points." />;
  if (refGeo === null) {
    return <Vide th={th} texte="Il faut d'abord entrer la référence du projet, dans l'onglet Référence." />;
  }

  const styleChamp = {
    padding: '9px 11px', fontSize: 14.5, background: th.inputBg, color: th.text,
    border: `1px solid ${th.line}`, borderRadius: 5, fontFamily: 'inherit', width: '100%',
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>

      <div style={{ background: th.panel, border: `1px solid ${th.line}`, borderRadius: 8,
        padding: 18, boxShadow: th.ombre }}>
        <div style={{ fontSize: 12, fontWeight: 700, letterSpacing: '.06em',
          textTransform: 'uppercase', color: th.textDim, marginBottom: 12 }}>
          Ajouter un point
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0,1.6fr) minmax(0,1fr) minmax(0,1fr) auto',
          gap: 10, alignItems: 'end' }} className="geo-ajout">
          <div>
            <Etiquette th={th}>Nom</Etiquette>
            <input value={nouveauNom} onChange={(e) => setNouveauNom(e.target.value)}
              placeholder="Dessus de dalle" style={styleChamp} autoComplete="off" />
          </div>
          <div>
            <Etiquette th={th}>Pieds-pouces</Etiquette>
            <input value={nouveauPieds} onChange={(e) => saisirPieds(e.target.value)}
              placeholder={"100'-0\""} style={styleChamp} autoComplete="off" />
          </div>
          <div>
            <Etiquette th={th}>Géodésique ({uniteTexte})</Etiquette>
            <input value={nouveauGeo} onChange={(e) => saisirGeo(e.target.value)}
              placeholder="45.250" inputMode="decimal" style={styleChamp} autoComplete="off" />
          </div>
          <button onClick={ajouter} disabled={enCours} style={{
            background: BRAND_RED, color: '#fff', border: 'none', borderRadius: 5,
            padding: '10px 15px', fontSize: 13.5, fontWeight: 600, cursor: 'pointer',
            display: 'inline-flex', alignItems: 'center', gap: 7, fontFamily: 'inherit',
            whiteSpace: 'nowrap',
          }}>
            <Plus size={15} /> Ajouter
          </button>
        </div>
        {message && (
          <div style={{ marginTop: 11, fontSize: 13.5, fontWeight: 600,
            color: message.ok ? VERT : th.errTexte }}>
            {message.texte}
          </div>
        )}
      </div>

      <div style={{ background: th.panel, border: `1px solid ${th.line}`, borderRadius: 8,
        boxShadow: th.ombre, overflow: 'hidden' }}>
        <div style={{ padding: '13px 18px', borderBottom: `1px solid ${th.line}`,
          fontSize: 12, fontWeight: 700, letterSpacing: '.06em', textTransform: 'uppercase',
          color: th.textDim, display: 'flex', justifyContent: 'space-between', gap: 10 }}>
          <span>Points enregistrés</span>
          <span>{points.length}</span>
        </div>
        {points.length === 0 ? (
          <div style={{ padding: 20, color: th.textDim, fontSize: 14 }}>
            Aucun point pour ce projet. Le dessus de dalle, le radier, le fond d&apos;excavation —
            tout ce que tu regardes plus d&apos;une fois gagne à être ici.
          </div>
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 14.5, minWidth: 480 }}>
              <thead>
                <tr>
                  <Th th={th}>Point</Th>
                  <Th th={th} droite>Pieds-pouces</Th>
                  <Th th={th} droite>Géodésique ({uniteTexte})</Th>
                  <Th th={th}></Th>
                </tr>
              </thead>
              <tbody>
                {points.map((pt) => (
                  <tr key={pt.id} style={{ borderTop: `1px solid ${th.line}` }}>
                    <td style={{ padding: '9px 12px' }}>
                      {pt.nom}
                      {pt.cree_par && (
                        <div style={{ fontSize: 11.5, color: th.textDim }}>par {pt.cree_par}</div>
                      )}
                    </td>
                    <td style={{ padding: '9px 12px', textAlign: 'right', fontWeight: 600,
                      fontVariantNumeric: 'tabular-nums', whiteSpace: 'nowrap' }}>
                      {formaterPiedsPouces(versPieds(Number(pt.geo), refGeo, uniteGeo))}
                    </td>
                    <td style={{ padding: '9px 12px', textAlign: 'right',
                      fontVariantNumeric: 'tabular-nums', whiteSpace: 'nowrap' }}>
                      {formaterGeo(Number(pt.geo))}
                    </td>
                    <td style={{ padding: '9px 12px', textAlign: 'right' }}>
                      <button onClick={() => supprimer(pt.id, pt.nom)} disabled={enCours}
                        title="Supprimer" aria-label={`Supprimer ${pt.nom}`} style={{
                          background: 'none', border: 'none', cursor: 'pointer',
                          color: th.textDim, padding: 4, display: 'inline-flex',
                        }}>
                        <Trash2 size={15} />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <div style={{ background: th.infoBg, border: `1px solid ${th.line}`, borderRadius: 8,
        padding: '13px 15px', fontSize: 13.5, color: th.textDim, lineHeight: 1.6 }}>
        C&apos;est la valeur <strong>géodésique</strong> qui est enregistrée, parce que c&apos;est
        elle qui est absolue. Le pieds-pouces se recalcule à l&apos;affichage. Si tu corriges la
        référence du projet, tous les points suivent d&apos;un coup au lieu de rester faux.
      </div>

      <style jsx>{`
        @media (max-width: 760px) {
          :global(.geo-ajout) { grid-template-columns: 1fr !important; }
        }
      `}</style>
    </div>
  );
}

// ===========================================================================
// ONGLET 3 — LA REFERENCE DU PROJET
// ===========================================================================
function OngletReference({ th, projetNo, projet, reference, nom, recharger }) {
  const [valeur, setValeur] = useState('');
  const [unite, setUnite] = useState('metres');
  const [note, setNote] = useState('');
  const [message, setMessage] = useState(null);
  const [enCours, setEnCours] = useState(false);
  const minuterie = useRef(null);

  useEffect(() => {
    setValeur(reference ? formaterGeo(Number(reference.geo_100)) : '');
    setUnite(reference ? reference.unite_geo : 'metres');
    setNote(reference?.note || '');
    setMessage(null);
  }, [projetNo, reference]);

  useEffect(() => () => { if (minuterie.current) clearTimeout(minuterie.current); }, []);

  function afficher(texte, ok) {
    if (minuterie.current) clearTimeout(minuterie.current);
    setMessage({ texte, ok });
    if (ok) minuterie.current = setTimeout(() => setMessage(null), 5000);
  }

  const lue = analyserGeo(valeur);

  async function enregistrer() {
    if (lue === null) { afficher('La valeur est illisible. Exemple : 45,250', false); return; }
    setEnCours(true);
    const { error } = await supabaseGeo.from('references_projet').upsert({
      projet_no: projetNo,
      geo_100: lue,
      unite_geo: unite,
      note: note.trim() || null,
      maj_le: new Date().toISOString(),
      maj_par: nom,
    }, { onConflict: 'projet_no' });
    setEnCours(false);
    if (error) { afficher(`Échec, rien n'a été enregistré : ${error.message}`, false); return; }
    await recharger();
    afficher('Référence enregistrée ✓', true);
  }

  if (!projetNo) return <Vide th={th} texte="Choisis un projet pour voir ou fixer sa référence." />;

  const styleChamp = {
    padding: '11px 12px', fontSize: 17, fontWeight: 600, background: th.inputBg, color: th.text,
    border: `1px solid ${th.line}`, borderRadius: 5, fontFamily: 'inherit', width: '100%',
    maxWidth: 260,
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <div style={{ background: th.panel, border: `1px solid ${th.line}`, borderRadius: 8,
        padding: 18, boxShadow: th.ombre }}>

        <div style={{ fontSize: 15, marginBottom: 16, lineHeight: 1.6 }}>
          Sur le plan de <strong>{projet ? `${projet.no} — ${projet.nom}` : projetNo}</strong>,
          le niveau <strong>100&apos;-0&quot;</strong> correspond à :
        </div>

        <div style={{ display: 'flex', gap: 14, flexWrap: 'wrap', alignItems: 'flex-end' }}>
          <div>
            <Etiquette th={th}>Valeur géodésique</Etiquette>
            <input value={valeur} onChange={(e) => setValeur(e.target.value)}
              placeholder="45.250" inputMode="decimal" style={styleChamp} autoComplete="off" />
          </div>
          <div>
            <Etiquette th={th}>Unité du plan</Etiquette>
            <div style={{ display: 'flex', gap: 6 }}>
              {[['metres', 'Mètres'], ['pieds', 'Pieds']].map(([v, l]) => (
                <button key={v} onClick={() => setUnite(v)} style={{
                  background: unite === v ? BRAND_RED : th.panelAlt,
                  color: unite === v ? '#fff' : th.textDim,
                  border: `1px solid ${unite === v ? BRAND_RED : th.line}`,
                  borderRadius: 5, padding: '11px 18px', fontSize: 14, fontWeight: 600,
                  cursor: 'pointer', fontFamily: 'inherit',
                }}>{l}</button>
              ))}
            </div>
          </div>
        </div>

        <div style={{ marginTop: 14 }}>
          <Etiquette th={th}>Note (facultatif)</Etiquette>
          <input value={note} onChange={(e) => setNote(e.target.value)}
            placeholder="Ex. : selon plan S-101, révision 3"
            style={{ ...styleChamp, maxWidth: 520, fontSize: 14.5, fontWeight: 400 }}
            autoComplete="off" />
        </div>

        {lue !== null && (
          <div style={{ marginTop: 16, background: th.panelAlt, border: `1px solid ${th.line}`,
            borderRadius: 6, padding: '12px 14px', fontSize: 14.5, lineHeight: 1.75 }}>
            <div style={{ fontSize: 11.5, color: th.textDim, textTransform: 'uppercase',
              letterSpacing: '.05em', fontWeight: 700, marginBottom: 5 }}>
              Contrôle
            </div>
            <div style={{ fontVariantNumeric: 'tabular-nums' }}>
              100&apos;-0&quot; = <strong>{formaterGeo(lue)}</strong> {unite === 'pieds' ? 'pi' : 'm'}<br />
              101&apos;-0&quot; = <strong>{formaterGeo(versGeo(101, lue, unite))}</strong> {unite === 'pieds' ? 'pi' : 'm'}<br />
              99&apos;-0&quot; = <strong>{formaterGeo(versGeo(99, lue, unite))}</strong> {unite === 'pieds' ? 'pi' : 'm'}
            </div>
            <div style={{ marginTop: 7, fontSize: 13, color: th.textDim }}>
              Un pied vaut {unite === 'pieds' ? '1,000 pi' : `${PIED_EN_METRES.toFixed(4)} m`}.
              Compare avec ton plan avant d&apos;enregistrer.
            </div>
          </div>
        )}

        <div style={{ marginTop: 16, display: 'flex', alignItems: 'center', gap: 12,
          flexWrap: 'wrap' }}>
          <button onClick={enregistrer} disabled={enCours} style={{
            background: BRAND_RED, color: '#fff', border: 'none', borderRadius: 5,
            padding: '11px 20px', fontSize: 14, fontWeight: 600, cursor: 'pointer',
            display: 'inline-flex', alignItems: 'center', gap: 8, fontFamily: 'inherit',
          }}>
            <Save size={15} /> Enregistrer la référence
          </button>
          {message && (
            <span style={{ fontSize: 13.5, fontWeight: 600,
              color: message.ok ? VERT : th.errTexte }}>{message.texte}</span>
          )}
        </div>

        {reference && (
          <div style={{ marginTop: 12, fontSize: 12.5, color: th.textDim }}>
            Dernière modification {reference.maj_par ? `par ${reference.maj_par}` : ''}
            {reference.maj_le ? ` le ${new Date(reference.maj_le).toLocaleDateString('fr-CA')}` : ''}.
          </div>
        )}
      </div>

      <div style={{ background: th.avisBg, border: `1px solid ${th.avisTexte}`, borderRadius: 8,
        padding: '13px 15px', fontSize: 13.5, color: th.avisTexte, lineHeight: 1.65 }}>
        <strong>L&apos;unité compte.</strong> Au Québec le géodésique est presque toujours en
        mètres — c&apos;est le réglage par défaut. Si un plan donne le géodésique en pieds et que
        l&apos;unité reste à « mètres », tous les niveaux seront faux d&apos;un facteur 3,28 sans
        que rien ne le signale. Vérifie le bloc de contrôle ci-dessus avant d&apos;enregistrer.
      </div>
    </div>
  );
}

// ===========================================================================
// PETITES PIECES PARTAGEES
// ===========================================================================
function Etiquette({ th, children }) {
  return (
    <label style={{ display: 'block', fontSize: 11.5, fontWeight: 700, letterSpacing: '.05em',
      textTransform: 'uppercase', color: th.textDim, marginBottom: 6 }}>
      {children}
    </label>
  );
}

function Th({ th, children, droite }) {
  return (
    <th style={{ textAlign: droite ? 'right' : 'left', padding: '9px 12px', fontSize: 11.5,
      fontWeight: 700, letterSpacing: '.05em', textTransform: 'uppercase', color: th.textDim,
      background: th.panelAlt, whiteSpace: 'nowrap' }}>
      {children}
    </th>
  );
}

function Vide({ th, texte }) {
  return (
    <div style={{ background: th.panel, border: `1px solid ${th.line}`, borderRadius: 8,
      padding: 28, textAlign: 'center', color: th.textDim, fontSize: 14.5, boxShadow: th.ombre }}>
      <MapPin size={22} style={{ opacity: 0.5, marginBottom: 8 }} />
      <div>{texte}</div>
    </div>
  );
}

// ===========================================================================
export default function ConversionGeodesiquePage() {
  const [session, setSession] = useState(null);

  if (!session) {
    return (
      <GardeConnexion
        appSlug="conversion-geodesique"
        nomApp="Conversion géodésique"
        onPret={setSession}
      />
    );
  }

  return (
    <ConversionGeodesiqueApp
      userId={session.userId}
      nom={session.nom}
      poste={session.poste}
    />
  );
}
