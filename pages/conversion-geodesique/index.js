import { useState, useEffect, useCallback, useRef } from 'react';
import { createClient } from '@supabase/supabase-js';
import GardeConnexion from '../../components/commun/GardeConnexion';
import EnTeteApp from '../../components/commun/EnTeteApp';
import { PALETTES, useModePep } from '../../components/commun/ThemeToolbox';
import {
  ArrowUpDown, Plus, Trash2, Save, MapPin, AlertTriangle,
  CheckCircle2, Copy, Check, Anchor,
} from 'lucide-react';
import {
  analyserPiedsPouces, formaterPiedsPouces, analyserGeo, formaterGeo,
  versGeo, versPieds, PIED_EN_METRES,
} from '../../lib/geodesique/conversion';

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SUPABASE_ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

const supabaseGeo = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, { db: { schema: 'geodesique' } });
const supabaseLP = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, { db: { schema: 'liste_projets' } });

const THEMES = PALETTES;
const BRAND_RED = '#c41230';
const VERT = '#019155';

// Le geodesique quebecois est en metres, point. La revision 45 offrait un
// choix metres/pieds « pour les rares plans en pieds » — il n'y en a jamais
// eu un seul. Un reglage qu'on ne change jamais n'est pas une option, c'est
// un piege : il suffit d'un clic de travers pour que tous les niveaux soient
// faux d'un facteur 3,28. Retire a la revision 46.
const UNITE = 'metres';
const UNITE_TEXTE = 'm';

const ONGLETS = [
  { id: 'brouillon', libelle: 'Brouillon' },
  { id: 'projet', libelle: 'Conversion et points' },
  { id: 'reference', libelle: 'Référence' },
];

// « 10 sept. 2026, 14 h 32 »
function formaterQuand(iso) {
  if (!iso) return '';
  const d = new Date(iso);
  if (isNaN(d.getTime())) return '';
  return d.toLocaleString('fr-CA', {
    day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit',
  });
}

// « par William Dubreuil le 10 sept. 2026, 14 h 32 »
function signature(par, quand) {
  const morceaux = [];
  if (par) morceaux.push(`par ${par}`);
  const q = formaterQuand(quand);
  if (q) morceaux.push(`le ${q}`);
  return morceaux.join(' ');
}

// ===========================================================================
// L'APP
// ===========================================================================
function ConversionGeodesiqueApp({ nom, poste }) {
  const [mode, setMode] = useModePep();
  const th = THEMES[mode];

  const [onglet, setOnglet] = useState('brouillon');
  const [chargement, setChargement] = useState(true);
  const [erreurChargement, setErreurChargement] = useState('');

  const [projets, setProjets] = useState([]);
  const [projetNo, setProjetNo] = useState('');
  const [refs, setRefs] = useState({});      // projet_no -> ligne de references_projet
  const [points, setPoints] = useState([]);

  // Les champs de conversion du projet vivent ICI, pas dans l'onglet : sinon
  // un aller-retour vers Référence efface ce qu'on venait de taper.
  const [champPieds, setChampPieds] = useState('');
  const [champGeo, setChampGeo] = useState('');
  const [dernier, setDernier] = useState(null);   // 'pieds' | 'geo'

  // Le brouillon a sa propre reference et ses propres champs, et ne touche
  // jamais la base. On les garde ici pour qu'un aller-retour vers un projet
  // ne les efface pas.
  const [brRef, setBrRef] = useState('');
  const [brPieds, setBrPieds] = useState('');
  const [brGeo, setBrGeo] = useState('');
  const [brDernier, setBrDernier] = useState(null);

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

  // On change de projet : on vide les champs du projet. La reference n'est
  // plus la meme, le chiffre affiche ne voudrait plus rien dire. Le brouillon
  // n'est pas touche — il ne depend d'aucun projet.
  useEffect(() => { setChampPieds(''); setChampGeo(''); setDernier(null); }, [projetNo]);

  const projet = projets.find((p) => p.no === projetNo) || null;
  const reference = refs[projetNo] || null;
  const refGeo = reference ? Number(reference.geo_100) : null;

  // Choisir un projet, c'est dire qu'on veut travailler dessus. On quitte donc
  // le brouillon — sinon on choisit un projet et il ne se passe rien a l'ecran.
  function choisirProjet(no) {
    setProjetNo(no);
    if (no && onglet === 'brouillon') setOnglet('projet');
  }

  return (
    <div style={{ minHeight: '100vh', background: th.bg, color: th.text,
      fontFamily: "Calibri, 'Segoe UI', Candara, Optima, Arial, sans-serif" }}>
      <EnTeteApp
        titre="Conversion géodésique"
        sousTitre="Pieds-pouces ↔ géodésique"
        mode={mode}
        onChangerMode={setMode}
        nom={nom}
        poste={poste}
      />

      <div style={{ maxWidth: 1000, margin: '0 auto', padding: '0 16px 60px' }}>

        {/* ---- choix du projet ---- */}
        <div style={{ background: th.panel, border: `1px solid ${th.line}`, borderRadius: 8,
          padding: 16, marginBottom: 16, boxShadow: th.ombre }}>
          <label htmlFor="choixProjet" style={{ display: 'block', fontSize: 12, fontWeight: 700,
            letterSpacing: '.06em', textTransform: 'uppercase', color: th.textDim, marginBottom: 7 }}>
            Projet
          </label>
          <select
            id="choixProjet"
            value={projetNo}
            onChange={(e) => choisirProjet(e.target.value)}
            style={{ width: '100%', maxWidth: 520, padding: '10px 11px', fontSize: 15,
              background: th.inputBg, color: th.text, border: `1px solid ${th.line}`,
              borderRadius: 5, fontFamily: 'inherit' }}
          >
            <option value="">— Aucun projet (brouillon) —</option>
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
                  padding: '9px 12px', fontSize: 14, display: 'flex', alignItems: 'flex-start', gap: 9 }}>
                  <CheckCircle2 size={16} style={{ color: th.okLigne, flexShrink: 0, marginTop: 2 }} />
                  <div style={{ minWidth: 0 }}>
                    <div>
                      <strong>100&apos;-0&quot; = {formaterGeo(refGeo)} {UNITE_TEXTE}</strong>
                      {reference.note ? <span style={{ color: th.textDim }}> · {reference.note}</span> : null}
                    </div>
                    {/* Qui a mis la reference, directement dans le bandeau : on
                        voit d'un coup d'oeil sur quoi on travaille ET a qui
                        s'adresser si le chiffre a l'air douteux. */}
                    {signature(reference.maj_par, reference.maj_le) && (
                      <div style={{ fontSize: 12.5, color: th.textDim, marginTop: 2 }}>
                        Mise à jour {signature(reference.maj_par, reference.maj_le)}
                      </div>
                    )}
                  </div>
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
            {onglet === 'brouillon' && (
              <OngletBrouillon th={th}
                brRef={brRef} setBrRef={setBrRef}
                brPieds={brPieds} setBrPieds={setBrPieds}
                brGeo={brGeo} setBrGeo={setBrGeo}
                brDernier={brDernier} setBrDernier={setBrDernier} />
            )}
            {onglet === 'projet' && (
              <OngletProjet th={th} refGeo={refGeo} reference={reference}
                projetNo={projetNo} points={points}
                rechargerPoints={() => chargerPoints(projetNo)} nom={nom}
                champPieds={champPieds} setChampPieds={setChampPieds}
                champGeo={champGeo} setChampGeo={setChampGeo}
                dernier={dernier} setDernier={setDernier} />
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
// LES DEUX CHAMPS LIES — le coeur de l'interface, partage par le brouillon
// et par le projet.
//
// On tape dans l'un, l'autre suit. Le champ qu'on est en train de modifier
// n'est JAMAIS reecrit sous les doigts : c'est ce qui permet de taper
// « 100'-6 » lentement sans que l'app reformate a chaque touche.
// ===========================================================================
function ChampsLies({ th, refGeo, champPieds, setChampPieds, champGeo, setChampGeo,
  dernier, setDernier, actif }) {
  const [copie, setCopie] = useState('');
  const minuterie = useRef(null);
  useEffect(() => () => { if (minuterie.current) clearTimeout(minuterie.current); }, []);

  const piedsLus = analyserPiedsPouces(champPieds);
  const geoLu = analyserGeo(champGeo);

  function saisirPieds(v) {
    setChampPieds(v);
    setDernier('pieds');
    const p = analyserPiedsPouces(v);
    setChampGeo(p === null || refGeo === null ? '' : formaterGeo(versGeo(p, refGeo, UNITE)));
  }
  function saisirGeo(v) {
    setChampGeo(v);
    setDernier('geo');
    const g = analyserGeo(v);
    setChampPieds(g === null || refGeo === null ? '' : formaterPiedsPouces(versPieds(g, refGeo, UNITE)));
  }

  function copier(texte, quoi) {
    if (!texte) return;
    try {
      navigator.clipboard.writeText(texte);
      setCopie(quoi);
      if (minuterie.current) clearTimeout(minuterie.current);
      minuterie.current = setTimeout(() => setCopie(''), 1600);
    } catch (e) { /* le presse-papier peut etre refuse, ce n'est pas grave */ }
  }

  const piedsResolu = dernier === 'geo'
    ? (geoLu !== null && refGeo !== null ? versPieds(geoLu, refGeo, UNITE) : null)
    : piedsLus;
  const geoResolu = dernier === 'pieds'
    ? (piedsLus !== null && refGeo !== null ? versGeo(piedsLus, refGeo, UNITE) : null)
    : geoLu;

  const saisieInvalide =
    (champPieds.trim() !== '' && piedsLus === null && dernier === 'pieds') ||
    (champGeo.trim() !== '' && geoLu === null && dernier === 'geo');

  const styleChamp = {
    width: '100%', padding: '14px 14px', fontSize: 22, fontWeight: 600,
    background: th.inputBg, color: th.text, border: `1px solid ${th.line}`,
    borderRadius: 6, fontFamily: 'inherit', letterSpacing: '.01em',
  };

  return (
    <div style={{ opacity: actif ? 1 : 0.55 }}>
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
            disabled={!actif}
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
          <EnTeteChamp th={th} pour="champGeo" texte={`Géodésique (${UNITE_TEXTE})`}
            valeur={geoResolu !== null ? formaterGeo(geoResolu) : ''}
            onCopier={() => copier(formaterGeo(geoResolu), 'geo')}
            copie={copie === 'geo'} />
          <input
            id="champGeo"
            value={champGeo}
            onChange={(e) => saisirGeo(e.target.value)}
            disabled={!actif}
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

      <style jsx>{`
        @media (max-width: 640px) {
          :global(.geo-grille) { grid-template-columns: 1fr !important; }
          :global(.geo-fleche) { padding-bottom: 0 !important; }
        }
      `}</style>
    </div>
  );
}

// ===========================================================================
// ONGLET 1 — LE BROUILLON
//
// Une calculatrice qui n'enregistre rien. On entre la reference du plan qu'on
// a sous les yeux, on convertit, on ferme. Pas de projet a choisir, pas de
// ligne creee dans la base, rien a nettoyer apres.
//
// C'est le cas le plus frequent : on regarde un plan une minute pour verifier
// un chiffre. Passer par « choisir un projet, enregistrer une reference »
// pour ca, c'est trois clics et une ligne en base pour une question qui dure
// dix secondes.
// ===========================================================================
function OngletBrouillon({ th, brRef, setBrRef, brPieds, setBrPieds, brGeo, setBrGeo,
  brDernier, setBrDernier }) {
  const refLue = analyserGeo(brRef);

  // La reference change : les champs ne veulent plus rien dire, on repart.
  function changerRef(v) {
    setBrRef(v);
    setBrPieds('');
    setBrGeo('');
    setBrDernier(null);
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>

      <div style={{ background: th.panel, border: `1px solid ${th.line}`, borderRadius: 8,
        padding: 18, boxShadow: th.ombre }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 9, marginBottom: 4 }}>
          <div style={{ fontSize: 12, fontWeight: 700, letterSpacing: '.06em',
            textTransform: 'uppercase', color: th.textDim }}>
            Brouillon — rien n&apos;est enregistré
          </div>
        </div>
        <div style={{ fontSize: 13.5, color: th.textDim, marginBottom: 14, lineHeight: 1.6 }}>
          Entre la référence du plan que tu as devant toi et convertis. Rien n&apos;est sauvegardé,
          rien n&apos;est rattaché à un projet. Pour garder une référence et des points, choisis un
          projet en haut.
        </div>

        <div style={{ maxWidth: 320 }}>
          <Etiquette th={th}>Sur ce plan, 100&apos;-0&quot; = ({UNITE_TEXTE})</Etiquette>
          <input value={brRef} onChange={(e) => changerRef(e.target.value)}
            placeholder="45.250" inputMode="decimal" autoComplete="off"
            style={{ width: '100%', padding: '11px 12px', fontSize: 17, fontWeight: 600,
              background: th.inputBg, color: th.text, border: `1px solid ${th.line}`,
              borderRadius: 5, fontFamily: 'inherit' }} />
        </div>

        {brRef.trim() !== '' && refLue === null && (
          <div style={{ marginTop: 9, fontSize: 13.5, color: th.errTexte }}>
            Cette référence est illisible. Exemple : <code>45,250</code>
          </div>
        )}
      </div>

      <div style={{ background: th.panel, border: `1px solid ${th.line}`, borderRadius: 8,
        padding: 18, boxShadow: th.ombre }}>
        <ChampsLies th={th} refGeo={refLue}
          champPieds={brPieds} setChampPieds={setBrPieds}
          champGeo={brGeo} setChampGeo={setBrGeo}
          dernier={brDernier} setDernier={setBrDernier}
          actif={refLue !== null} />
        {refLue === null && (
          <div style={{ marginTop: 11, fontSize: 13.5, color: th.textDim }}>
            Entre d&apos;abord la référence du plan ci-dessus.
          </div>
        )}
      </div>

      <AideSaisie th={th} />
    </div>
  );
}

// En-tete d'un champ : l'etiquette, et un bouton copier qui n'apparait que
// quand il y a vraiment quelque chose a copier.
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

function AideSaisie({ th }) {
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
        géodésique s&apos;affiche à trois décimales — un millimètre.
      </div>
    </div>
  );
}

// ===========================================================================
// ONGLET 2 — LE PROJET : conversion en haut, points en bas
//
// Revision 46 : « Conversion » et « Points du projet » etaient deux onglets.
// C'etait deux moities du meme geste — on convertit une valeur ET on la
// compare aux niveaux du projet. Les separer obligeait a faire l'aller-retour
// et affichait deux fois la meme liste de points, une fois avec les ecarts,
// une fois sans.
//
// Une seule page maintenant, et surtout UN SEUL tableau : les points
// enregistres, avec une colonne « ecart » qui se remplit des qu'il y a une
// valeur dans la conversion au-dessus.
// ===========================================================================
function OngletProjet({ th, refGeo, reference, projetNo, points, rechargerPoints, nom,
  champPieds, setChampPieds, champGeo, setChampGeo, dernier, setDernier }) {
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
    setNouveauGeo(p === null || refGeo === null ? '' : formaterGeo(versGeo(p, refGeo, UNITE)));
  }
  function saisirGeo(v) {
    setNouveauGeo(v);
    const g = analyserGeo(v);
    setNouveauPieds(g === null || refGeo === null ? '' : formaterPiedsPouces(versPieds(g, refGeo, UNITE)));
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

  if (!projetNo) {
    return <Vide th={th} texte="Choisis un projet en haut — ou reste dans le Brouillon pour un calcul rapide." />;
  }

  // La valeur geodesique courante de la conversion, pour la colonne « ecart ».
  const piedsLus = analyserPiedsPouces(champPieds);
  const geoLu = analyserGeo(champGeo);
  const geoCourant = dernier === 'pieds'
    ? (piedsLus !== null && refGeo !== null ? versGeo(piedsLus, refGeo, UNITE) : null)
    : geoLu;

  // La reference EST le premier point du projet : c'est le niveau 100'-0",
  // celui a partir duquel tous les autres se lisent. La montrer dans la liste
  // evite d'avoir a se souvenir qu'elle existe ailleurs. Elle n'est pas une
  // ligne de la table « points » — elle est derivee de la reference, donc
  // elle ne peut jamais diverger d'elle, et il n'y a rien a synchroniser.
  const lignes = [];
  if (reference) {
    lignes.push({
      cle: 'reference',
      estReference: true,
      nom: 'Référence du projet',
      geo: refGeo,
      par: reference.maj_par,
      quand: reference.maj_le,
    });
  }
  points.forEach((pt) => {
    lignes.push({
      cle: pt.id,
      estReference: false,
      id: pt.id,
      nom: pt.nom,
      geo: Number(pt.geo),
      par: pt.cree_par,
      quand: pt.cree_le,
    });
  });

  const styleChamp = {
    padding: '9px 11px', fontSize: 14.5, background: th.inputBg, color: th.text,
    border: `1px solid ${th.line}`, borderRadius: 5, fontFamily: 'inherit', width: '100%',
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>

      {/* ---------- 1. la conversion, en haut ---------- */}
      <div style={{ background: th.panel, border: `1px solid ${th.line}`, borderRadius: 8,
        padding: 18, boxShadow: th.ombre }}>
        <ChampsLies th={th} refGeo={refGeo}
          champPieds={champPieds} setChampPieds={setChampPieds}
          champGeo={champGeo} setChampGeo={setChampGeo}
          dernier={dernier} setDernier={setDernier}
          actif={refGeo !== null} />
        {refGeo === null && (
          <div style={{ marginTop: 11, fontSize: 13.5, color: th.avisTexte }}>
            Il manque la référence du projet — onglet <strong>Référence</strong>.
          </div>
        )}
      </div>

      {refGeo !== null && (
        <>
          {/* ---------- 2. ajouter un point ---------- */}
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
                <Etiquette th={th}>Géodésique ({UNITE_TEXTE})</Etiquette>
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

          {/* ---------- 3. les points, avec l'ecart ---------- */}
          <div style={{ background: th.panel, border: `1px solid ${th.line}`, borderRadius: 8,
            boxShadow: th.ombre, overflow: 'hidden',
            // Le CSS des fiches telephone (plus bas) a besoin des couleurs du
            // theme courant. On les passe en variables plutot que de les figer,
            // sinon le mode nuit se retrouve avec des filets clairs.
            '--geo-ligne': th.line, '--geo-dim': th.textDim }}>
            <div style={{ padding: '13px 18px', borderBottom: `1px solid ${th.line}`,
              fontSize: 12, fontWeight: 700, letterSpacing: '.06em', textTransform: 'uppercase',
              color: th.textDim, display: 'flex', justifyContent: 'space-between', gap: 10 }}>
              <span>Points enregistrés</span>
              <span>{points.length}</span>
            </div>
            <div style={{ overflowX: 'auto' }}>
              <table className="geo-table" style={{ width: '100%', borderCollapse: 'collapse', fontSize: 14.5, minWidth: 560 }}>
                <thead>
                  <tr>
                    <Th th={th}>Point</Th>
                    <Th th={th} droite>Pieds-pouces</Th>
                    <Th th={th} droite>Géodésique ({UNITE_TEXTE})</Th>
                    <Th th={th} droite>Écart</Th>
                    <Th th={th}></Th>
                  </tr>
                </thead>
                <tbody>
                  {lignes.map((l) => {
                    const ecartPieds = geoCourant !== null
                      ? (geoCourant - l.geo) / PIED_EN_METRES
                      : null;
                    return (
                      <tr key={l.cle} style={{ borderTop: `1px solid ${th.line}`,
                        background: l.estReference ? th.panelAlt : 'transparent' }}>
                        <td className="geo-nom" style={{ padding: '9px 12px' }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
                            {l.estReference && <Anchor size={13} style={{ color: th.textDim, flexShrink: 0 }} />}
                            <span style={{ fontWeight: l.estReference ? 700 : 400 }}>{l.nom}</span>
                          </div>
                          {signature(l.par, l.quand) && (
                            <div style={{ fontSize: 11.5, color: th.textDim, marginTop: 1 }}>
                              {signature(l.par, l.quand)}
                            </div>
                          )}
                        </td>
                        <td data-libelle="Pieds-pouces" style={{ padding: '9px 12px', textAlign: 'right', fontWeight: 600,
                          fontVariantNumeric: 'tabular-nums', whiteSpace: 'nowrap' }}>
                          {formaterPiedsPouces(versPieds(l.geo, refGeo, UNITE))}
                        </td>
                        <td data-libelle={`Géodésique (${UNITE_TEXTE})`} style={{ padding: '9px 12px', textAlign: 'right',
                          fontVariantNumeric: 'tabular-nums', whiteSpace: 'nowrap' }}>
                          {formaterGeo(l.geo)}
                        </td>
                        <td data-libelle="Écart" style={{ padding: '9px 12px', textAlign: 'right', color: VERT,
                          fontVariantNumeric: 'tabular-nums', whiteSpace: 'nowrap' }}>
                          {ecartPieds === null ? '—' :
                            (ecartPieds >= 0 ? '+' : '') + formaterPiedsPouces(ecartPieds)}
                        </td>
                        <td className="geo-actions" style={{ padding: '9px 12px', textAlign: 'right' }}>
                          {l.estReference ? (
                            <span style={{ fontSize: 11, color: th.textDim, whiteSpace: 'nowrap' }}>
                              onglet Référence
                            </span>
                          ) : (
                            <button onClick={() => supprimer(l.id, l.nom)} disabled={enCours}
                              title="Supprimer" aria-label={`Supprimer ${l.nom}`} style={{
                                background: 'none', border: 'none', cursor: 'pointer',
                                color: th.textDim, padding: 4, display: 'inline-flex',
                              }}>
                              <Trash2 size={15} />
                            </button>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            <div style={{ padding: '11px 18px', borderTop: `1px solid ${th.line}`,
              fontSize: 12.5, color: th.textDim }}>
              {geoCourant === null
                ? "La colonne « écart » se remplit dès que tu tapes une valeur dans la conversion, en haut."
                : <>Un écart positif veut dire que la valeur saisie est <strong>au-dessus</strong> du point.</>}
            </div>
          </div>

          <div style={{ background: th.infoBg, border: `1px solid ${th.line}`, borderRadius: 8,
            padding: '13px 15px', fontSize: 13.5, color: th.textDim, lineHeight: 1.6 }}>
            C&apos;est la valeur <strong>géodésique</strong> qui est enregistrée, parce que c&apos;est
            elle qui est absolue. Le pieds-pouces se recalcule à l&apos;affichage. Si tu corriges la
            référence du projet, tous les points suivent d&apos;un coup au lieu de rester faux.
          </div>
        </>
      )}

      <AideSaisie th={th} />

      <style jsx>{`
        @media (max-width: 760px) {
          :global(.geo-ajout) { grid-template-columns: 1fr !important; }
        }
        /* ------------------------------------------------------------------
           Sur telephone, le tableau devient une pile de fiches.

           Cinq colonnes ne rentrent pas dans 390 px : au rendu, la colonne
           « ecart » — justement celle qu'on regarde quand on est sur le
           chantier avec le telephone — se retrouvait hors de l'ecran, il
           fallait faire defiler le tableau lateralement pour la voir. Une
           fiche par point, chaque valeur avec son etiquette : tout est
           visible d'un coup, et plus rien ne defile de travers.
           ------------------------------------------------------------------ */
        @media (max-width: 640px) {
          :global(.geo-table) { min-width: 0 !important; display: block; }
          :global(.geo-table thead) { display: none; }
          :global(.geo-table tbody), :global(.geo-table tr) { display: block; }
          :global(.geo-table tr) {
            border-top: none !important;
            border: 1px solid var(--geo-ligne);
            border-radius: 7px;
            margin: 10px 12px;
            padding: 4px 0;
          }
          :global(.geo-table td) {
            display: flex; justify-content: space-between; align-items: baseline;
            gap: 12px; text-align: right !important; padding: 5px 12px !important;
            white-space: normal !important;
          }
          :global(.geo-table td[data-libelle]::before) {
            content: attr(data-libelle);
            font-size: 11.5px; font-weight: 700; letter-spacing: .05em;
            text-transform: uppercase; color: var(--geo-dim);
            text-align: left; flex: 0 0 auto;
          }
          :global(.geo-table td.geo-nom) {
            display: block; text-align: left !important;
            padding: 8px 12px 6px !important;
            border-bottom: 1px solid var(--geo-ligne);
            margin-bottom: 4px;
          }
          :global(.geo-table td.geo-actions) { justify-content: flex-end; padding-top: 2px !important; }
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
  const [note, setNote] = useState('');
  const [message, setMessage] = useState(null);
  const [enCours, setEnCours] = useState(false);
  const minuterie = useRef(null);

  useEffect(() => {
    setValeur(reference ? formaterGeo(Number(reference.geo_100)) : '');
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
      unite_geo: UNITE,
      note: note.trim() || null,
      maj_le: new Date().toISOString(),
      maj_par: nom,
    }, { onConflict: 'projet_no' });
    setEnCours(false);
    if (error) { afficher(`Échec, rien n'a été enregistré : ${error.message}`, false); return; }
    await recharger();
    afficher('Référence enregistrée ✓', true);
  }

  if (!projetNo) {
    return <Vide th={th} texte="Choisis un projet en haut pour voir ou fixer sa référence." />;
  }

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

        <div>
          <Etiquette th={th}>Valeur géodésique ({UNITE_TEXTE})</Etiquette>
          <input value={valeur} onChange={(e) => setValeur(e.target.value)}
            placeholder="45.250" inputMode="decimal" style={styleChamp} autoComplete="off" />
        </div>

        <div style={{ marginTop: 14 }}>
          <Etiquette th={th}>Note (facultatif)</Etiquette>
          <input value={note} onChange={(e) => setNote(e.target.value)}
            placeholder="Ex. : plan C100, révision 3"
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
              100&apos;-0&quot; = <strong>{formaterGeo(lue)}</strong> {UNITE_TEXTE}<br />
              101&apos;-0&quot; = <strong>{formaterGeo(versGeo(101, lue, UNITE))}</strong> {UNITE_TEXTE}<br />
              99&apos;-0&quot; = <strong>{formaterGeo(versGeo(99, lue, UNITE))}</strong> {UNITE_TEXTE}
            </div>
            <div style={{ marginTop: 7, fontSize: 13, color: th.textDim }}>
              Un pied vaut {PIED_EN_METRES.toFixed(4)} m. Compare avec ton plan avant
              d&apos;enregistrer.
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

        {reference && signature(reference.maj_par, reference.maj_le) && (
          <div style={{ marginTop: 12, fontSize: 12.5, color: th.textDim }}>
            Dernière modification {signature(reference.maj_par, reference.maj_le)}.
          </div>
        )}
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
      nom={session.nom}
      poste={session.poste}
    />
  );
}
