// ============================================================================
// CUBAGE BÉTON — volume net de béton pour les bollards et les massifs
//
// Intégration au Toolbox de l'outil « Cubage béton / bollards & massifs »
// (artifact du 2026-09-28). Calculateur pur : rien n'est enregistré, donc pas
// de schéma Supabase. Les formules vivent dans lib/cubage-beton/calculs.js.
// ============================================================================

import { useState, useMemo } from 'react';
import { AlertTriangle } from 'lucide-react';

import GardeConnexion from '../../components/commun/GardeConnexion';
import EnTeteApp from '../../components/commun/EnTeteApp';
import { PALETTES, useModePep, ROUGE } from '../../components/commun/ThemeToolbox';

import {
  DETAILS_BOLLARD, FORMATS_POTEAU, FORMATS_CONDUITE, ENROBAGE_MM, ECART_MM,
  calculerBollard, calculerMassif, formatPoteauDe, lireNombre, formater,
} from '../../lib/cubage-beton/calculs';

const LARGEUR = 900; // formulaire : largeur standard du Toolbox
const MONO = '"IBM Plex Mono", ui-monospace, SFMono-Regular, Menlo, monospace';

const ONGLETS = [
  { id: 'bollards', libelle: 'Bollards et sonotubes' },
  { id: 'massifs', libelle: 'Massifs électriques' },
];

function bollardDepuisDetail(cle) {
  const d = DETAILS_BOLLARD[cle];
  return {
    detail: cle,
    ds: String(d.ds), hs: String(d.hs), hr: String(d.hr),
    dp: String(d.dp), t: String(d.t), ha: String(d.ha), he: String(d.he),
    dome: d.dome, qte: '12', perte: '10',
  };
}

// ============================================================================
function CubageBetonApp({ nom, poste }) {
  const [mode, setMode] = useModePep();
  const th = PALETTES[mode];
  const [onglet, setOnglet] = useState('bollards');

  const [bol, setBol] = useState(() => bollardDepuisDetail('hq3410'));
  const [mas, setMas] = useState({ w: '600', h: '450', l: '30', perte: '10' });
  const [lignes, setLignes] = useState([{ id: 1, qte: '6', d: '114.3' }]);

  const rb = useMemo(() => calculerBollard(bol), [bol]);
  const rm = useMemo(() => calculerMassif(mas, lignes), [mas, lignes]);

  // Toucher une dimension quitte le détail normalisé; la quantité et la perte
  // ne changent pas le détail, elles.
  function majBol(champ, valeur) {
    setBol((b) => ({
      ...b, [champ]: valeur,
      detail: (champ === 'qte' || champ === 'perte') ? b.detail : '',
    }));
  }
  function choisirDetail(cle) {
    if (cle) setBol((b) => ({ ...bollardDepuisDetail(cle), qte: b.qte, perte: b.perte }));
    else setBol((b) => ({ ...b, detail: '' }));
  }
  function choisirFormatPoteau(v) {
    if (!v) return;
    const [dp, t] = v.split('|');
    setBol((b) => ({ ...b, dp, t, detail: '' }));
  }

  function majLigne(id, champ, valeur) {
    setLignes((ls) => ls.map((l) => (l.id === id ? { ...l, [champ]: valeur } : l)));
  }
  function retirerLigne(id) {
    setLignes((ls) => {
      const reste = ls.filter((l) => l.id !== id);
      return reste.length ? reste : [{ id: Date.now(), qte: '1', d: '114.3' }];
    });
  }
  function ajouterLigne() {
    setLignes((ls) => [...ls, { id: Date.now(), qte: '2', d: '88.9' }]);
  }

  const source = bol.detail
    ? DETAILS_BOLLARD[bol.detail].source
    : 'Dimensions modifiées à la main. Reprends un détail normalisé dans la liste pour revenir aux valeurs d’Hydro-Québec.';

  return (
    <div style={{ minHeight: '100vh', background: th.bg, color: th.text }}>
      <EnTeteApp
        titre="Cubage béton"
        sousTitre="Bollards et massifs électriques — volume net à commander"
        mode={mode}
        onChangerMode={setMode}
        nom={nom}
        poste={poste}
        onAccueil={() => setOnglet('bollards')}
      />

      <div style={{ maxWidth: LARGEUR, margin: '0 auto', padding: '0 16px 60px' }}>

        {/* ---- barre d'outils : onglets ---- */}
        <div role="tablist" style={{ display: 'flex', gap: 4, marginBottom: 16, flexWrap: 'wrap' }}>
          {ONGLETS.map((o) => {
            const actif = onglet === o.id;
            return (
              <button key={o.id} role="tab" aria-selected={actif} onClick={() => setOnglet(o.id)} style={{
                background: actif ? ROUGE : th.panel, color: actif ? '#fff' : th.textDim,
                border: `1px solid ${actif ? ROUGE : th.line}`, borderRadius: 5,
                padding: '9px 14px', fontSize: 13, fontWeight: 700, letterSpacing: '.04em',
                textTransform: 'uppercase', cursor: 'pointer', flex: '1 1 auto',
              }}>
                {o.libelle}
              </button>
            );
          })}
        </div>

        {onglet === 'bollards' ? (
          <Grille>
            <div>
              <Carte th={th} titre="Détail type">
                <Champ th={th} id="b-detail" etiquette="Partir d'un détail normalisé">
                  <select id="b-detail" value={bol.detail} onChange={(e) => choisirDetail(e.target.value)} style={styleChamp(th, true)}>
                    {Object.entries(DETAILS_BOLLARD).map(([cle, d]) => (
                      <option key={cle} value={cle}>{d.libelle}</option>
                    ))}
                    <option value="">Personnalisé</option>
                  </select>
                </Champ>
                <Aide th={th}>{source}</Aide>
              </Carte>

              <Carte th={th} titre="Sonotube">
                <Deux>
                  <Nombre th={th} id="b-ds" etiquette="Diamètre" unite="mm" valeur={bol.ds} onChange={(v) => majBol('ds', v)} />
                  <Nombre th={th} id="b-hs" etiquette="Profondeur totale" unite="mm" valeur={bol.hs} onChange={(v) => majBol('hs', v)} />
                </Deux>
                <Nombre th={th} id="b-hr" etiquette="Remblai granulaire au-dessus du béton" unite="mm" valeur={bol.hr} onChange={(v) => majBol('hr', v)} />
                <Aide th={th}>Mesurée du niveau du terrain jusqu’au fond. Le béton commence sous le remblai : 03-3410 laisse 150 mm de criblure de pierre, 03-3425 coule jusqu’en haut.</Aide>
              </Carte>

              <Carte th={th} titre="Poteau d'acier">
                <Champ th={th} id="b-fmt" etiquette="Format courant">
                  <select id="b-fmt" value={formatPoteauDe(bol.dp, bol.t)} onChange={(e) => choisirFormatPoteau(e.target.value)} style={styleChamp(th, true)}>
                    {FORMATS_POTEAU.map((f) => <option key={f.valeur} value={f.valeur}>{f.libelle}</option>)}
                    <option value="">Autre</option>
                  </select>
                </Champ>
                <Deux>
                  <Nombre th={th} id="b-dp" etiquette="⌀ extérieur" unite="mm" valeur={bol.dp} onChange={(v) => majBol('dp', v)} />
                  <Nombre th={th} id="b-t" etiquette="Épaisseur paroi" unite="mm" valeur={bol.t} onChange={(v) => majBol('t', v)} />
                  <Nombre th={th} id="b-ha" etiquette="Hauteur hors sol" unite="mm" valeur={bol.ha} onChange={(v) => majBol('ha', v)} />
                  <Nombre th={th} id="b-he" etiquette="Ancrage dans le béton" unite="mm" valeur={bol.he} onChange={(v) => majBol('he', v)} />
                </Deux>
                <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13.5, cursor: 'pointer' }}>
                  <input type="checkbox" checked={bol.dome} onChange={(e) => majBol('dome', e.target.checked)}
                    style={{ width: 16, height: 16, accentColor: ROUGE }} />
                  Dessus bombé — HQ ferme plutôt avec un bouchon d’acier
                </label>
              </Carte>

              <Carte th={th} titre="Commande">
                <Deux>
                  <Nombre th={th} id="b-qte" etiquette="Nombre de bollards" valeur={bol.qte} onChange={(v) => majBol('qte', v)} pas="1" />
                  <Nombre th={th} id="b-perte" etiquette="Perte" unite="%" valeur={bol.perte} onChange={(v) => majBol('perte', v)} pas="1" />
                </Deux>
              </Carte>
            </div>

            <div>
              <Resultat
                th={th} mode={mode}
                net={rb.total} sousNet={`${formater(rb.net, 3)} m³ par bollard × ${rb.qte}`}
                commande={rb.commande} perte={rb.perte}
              />

              <Carte th={th} titre="Coupe type">
                <div style={styleSchema(th)}><CoupeBollard c={rb} th={th} /></div>
                <Legende th={th} items={[
                  { fond: th.beton, bord: th.betonTrait, texte: 'Béton' },
                  { fond: th.acier, bord: th.acier, texte: 'Acier' },
                  { fond: 'transparent', bord: th.betonTrait, tirets: true, texte: 'Sonotube' },
                  { fond: 'transparent', bord: th.sol, texte: 'Remblai granulaire' },
                ]} />
                <Avis th={th} lignes={rb.avis} />
              </Carte>

              <Carte th={th} titre="Détail du calcul — un bollard">
                <TableDetail th={th} rangees={[
                  rb.hAnneau > 0 && { nom: 'Anneau autour du poteau', formule: `π/4 × (${formater(rb.Ds, 0)}² − ${formater(rb.Dp, 1)}²) × ${formater(rb.hAnneau, 0)}`, v: rb.anneau },
                  rb.hPleine > 0 && { nom: 'Béton pleine section sous le poteau', formule: `π/4 × ${formater(rb.Ds, 0)}² × ${formater(rb.hPleine, 0)}`, v: rb.pleine },
                  { nom: 'Intérieur du poteau', formule: `π/4 × ${formater(rb.Di, 1)}² × ${formater(rb.Ha + rb.He, 0)}`, v: rb.interieur },
                  rb.dome > 0 && { nom: 'Calotte bombée', formule: `demi-sphère ⌀${formater(rb.Di, 1)}`, v: rb.dome },
                ]} net={{ nom: 'Net, un bollard', v: rb.net }} />
              </Carte>
            </div>
          </Grille>
        ) : (
          <Grille>
            <div>
              <Carte th={th} titre="Massif">
                <Deux>
                  <Nombre th={th} id="m-w" etiquette="Largeur" unite="mm" valeur={mas.w} onChange={(v) => setMas({ ...mas, w: v })} />
                  <Nombre th={th} id="m-h" etiquette="Hauteur" unite="mm" valeur={mas.h} onChange={(v) => setMas({ ...mas, h: v })} />
                  <Nombre th={th} id="m-l" etiquette="Longueur" unite="m" valeur={mas.l} onChange={(v) => setMas({ ...mas, l: v })} pas="0.5" />
                  <Nombre th={th} id="m-perte" etiquette="Perte" unite="%" valeur={mas.perte} onChange={(v) => setMas({ ...mas, perte: v })} pas="1" />
                </Deux>
                <Aide th={th}>Dimensions hors tout de l’enrobage de béton, prises sur la coupe du plan.</Aide>
              </Carte>

              <Carte th={th} titre="Conduites à soustraire">
                <table style={{ width: '100%', borderCollapse: 'collapse', tableLayout: 'fixed' }}>
                  <thead>
                    <tr>
                      <Th th={th} largeur={64}>Qté</Th>
                      <Th th={th}>Format</Th>
                      <Th th={th} largeur={86}>⌀ ext. mm</Th>
                      <Th th={th} largeur={34} />
                    </tr>
                  </thead>
                  <tbody>
                    {lignes.map((ln, i) => {
                      const dNum = lireNombre(ln.d);
                      const formatSel = FORMATS_CONDUITE.some((f) => f.d === dNum) ? String(dNum) : '';
                      return (
                        <tr key={ln.id} style={{ borderBottom: `1px solid ${th.line}` }}>
                          <td style={{ padding: '6px 6px 6px 0' }}>
                            <input type="number" inputMode="numeric" min="0" step="1" value={ln.qte}
                              aria-label={`Quantité, ligne ${i + 1}`}
                              onChange={(e) => majLigne(ln.id, 'qte', e.target.value)} style={styleChamp(th)} />
                          </td>
                          <td style={{ padding: '6px 6px 6px 0' }}>
                            <select value={formatSel} aria-label={`Format, ligne ${i + 1}`}
                              onChange={(e) => e.target.value && majLigne(ln.id, 'd', e.target.value)} style={styleChamp(th, true)}>
                              {FORMATS_CONDUITE.map((f) => (
                                <option key={f.nom} value={String(f.d)}>{f.nom} — {formater(f.d, 1)} mm</option>
                              ))}
                              <option value="">Autre</option>
                            </select>
                          </td>
                          <td style={{ padding: '6px 6px 6px 0' }}>
                            <input type="number" inputMode="decimal" min="0" step="0.1" value={ln.d}
                              aria-label={`Diamètre extérieur, ligne ${i + 1}`}
                              onChange={(e) => majLigne(ln.id, 'd', e.target.value)} style={styleChamp(th)} />
                          </td>
                          <td style={{ padding: '6px 0', textAlign: 'right' }}>
                            <button onClick={() => retirerLigne(ln.id)} aria-label={`Retirer la ligne ${i + 1}`} style={{
                              width: 28, height: 28, border: `1px solid ${th.line}`, background: th.panelAlt,
                              color: th.textDim, borderRadius: 4, cursor: 'pointer', fontSize: 16, lineHeight: 1, padding: 0,
                            }}>×</button>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
                <button onClick={ajouterLigne} style={{
                  marginTop: 12, fontSize: 12.5, fontWeight: 700, letterSpacing: '.04em', textTransform: 'uppercase',
                  padding: '8px 14px', borderRadius: 4, border: `1px dashed ${th.textDim}`,
                  background: 'transparent', color: th.text, cursor: 'pointer',
                }}>+ Ajouter une conduite</button>
                <Aide th={th}>Le volume soustrait utilise le <b>diamètre extérieur</b> de la conduite, pas le nominal. Les valeurs proposées sont celles du PVC série IPS (DB2, annelé rigide, Sch 40) — remplace-les si ton devis diffère.</Aide>
              </Carte>
            </div>

            <div>
              <Resultat
                th={th} mode={mode}
                net={rm.net} sousNet={Number.isFinite(rm.parMetre) ? `${formater(rm.parMetre, 3)} m³ par mètre linéaire` : '—'}
                commande={rm.commande} perte={rm.perte}
              />

              <Carte th={th} titre="Coupe type">
                <div style={styleSchema(th)}><CoupeMassif c={rm} th={th} /></div>
                <Legende th={th} items={[
                  { fond: th.beton, bord: th.betonTrait, texte: 'Béton' },
                  { fond: th.panel, bord: th.acier, rond: true, texte: 'Conduites' },
                ]} />
                <Aide th={th}>La disposition des conduites est illustrative : elle sert à vérifier l’encombrement d’un coup d’œil. Le volume ne dépend que du nombre et du diamètre, pas de l’arrangement.</Aide>
                <Avis th={th} lignes={rm.avis} />
              </Carte>

              <Carte th={th} titre="Détail du calcul">
                <TableDetail th={th} rangees={[
                  { nom: 'Massif brut', formule: `${formater(rm.W, 0)} × ${formater(rm.H, 0)} mm × ${formater(rm.L, 1)} m`, v: rm.brut },
                  ...rm.details.map((x) => ({
                    nom: `${x.qte} × conduite ⌀${formater(x.d, 1)}`,
                    formule: `π/4 × ${formater(x.d, 1)}² × ${formater(rm.L, 1)} m`, v: -x.volume,
                  })),
                ]} net={{ nom: 'Net', v: rm.net }} />
              </Carte>
            </div>
          </Grille>
        )}

        <p style={{ marginTop: 24, paddingTop: 14, borderTop: `1px solid ${th.line}`, fontSize: 12, color: th.textDim, lineHeight: 1.55 }}>
          Volumes théoriques nets, sans tenir compte du tassement ni des pertes de pompage. Détails de bollards tirés du <b>Livre vert d’Hydro-Québec</b>, norme E.21-11 (5<sup>e</sup> édition), dessins 03-3410 et 03-3425. Le Livre vert couvre le service en basse tension à partir des postes distributeurs : si le raccordement relève d’une autre norme, le détail applicable peut différer.
        </p>
      </div>
    </div>
  );
}

// ===========================================================================
// PETITES PIÈCES
// ===========================================================================
function styleChamp(th, texte) {
  return {
    width: '100%', minWidth: 0, boxSizing: 'border-box', padding: '8px 9px',
    border: `1px solid ${th.line}`, borderRadius: 4, background: th.inputBg, color: th.text,
    fontSize: texte ? 13.5 : 14.5, fontFamily: texte ? 'inherit' : MONO,
  };
}
function styleSchema(th) {
  return { background: th.panelAlt, border: `1px solid ${th.line}`, borderRadius: 4, padding: 10, overflowX: 'auto' };
}

// Deux colonnes qui se replient seules sur un téléphone.
function Grille({ children }) {
  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: 16, alignItems: 'start' }}>
      {children}
    </div>
  );
}
function Deux({ children }) {
  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(130px, 1fr))', gap: '12px 14px', marginBottom: 12 }}>
      {children}
    </div>
  );
}

function Carte({ th, titre, children }) {
  return (
    <div style={{ background: th.panel, border: `1px solid ${th.line}`, borderRadius: 8,
      padding: 16, marginBottom: 16, boxShadow: th.ombre }}>
      <h2 style={{ margin: '0 0 14px', paddingBottom: 9, borderBottom: `1px solid ${th.line}`,
        fontSize: 12, fontWeight: 700, letterSpacing: '.08em', textTransform: 'uppercase', color: th.textDim }}>
        {titre}
      </h2>
      {children}
    </div>
  );
}

function Champ({ th, id, etiquette, unite, children }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 5, minWidth: 0, marginBottom: 12 }}>
      <label htmlFor={id} style={{ fontSize: 11.5, fontWeight: 700, letterSpacing: '.04em',
        textTransform: 'uppercase', color: th.textDim }}>
        {etiquette}{unite && <span style={{ fontWeight: 400, textTransform: 'none', opacity: 0.75 }}> ({unite})</span>}
      </label>
      {children}
    </div>
  );
}

function Nombre({ th, id, etiquette, unite, valeur, onChange, pas = 'any' }) {
  return (
    <Champ th={th} id={id} etiquette={etiquette} unite={unite}>
      <input id={id} type="number" inputMode="decimal" step={pas} min="0" value={valeur}
        onChange={(e) => onChange(e.target.value)} style={styleChamp(th)} />
    </Champ>
  );
}

function Aide({ th, children }) {
  return <p style={{ margin: '4px 0 0', fontSize: 12, color: th.textDim, lineHeight: 1.5 }}>{children}</p>;
}

function Avis({ th, lignes }) {
  if (!lignes.length) return null;
  return (
    <div style={{ display: 'flex', gap: 9, marginTop: 14, background: th.avisBg, border: `1px solid ${th.avisTexte}`,
      borderRadius: 5, padding: '9px 11px', fontSize: 13, lineHeight: 1.45 }}>
      <AlertTriangle size={16} style={{ color: th.avisTexte, flexShrink: 0, marginTop: 1 }} />
      <div><b style={{ color: th.avisTexte }}>À vérifier.</b> {lignes.join(' ')}</div>
    </div>
  );
}

function Resultat({ th, mode, net, sousNet, commande, perte }) {
  const nuit = mode === 'night';
  const fond = nuit ? th.panelAlt : '#14213d';
  const doux = nuit ? th.textDim : '#9fb0ce';
  const Bloc = ({ et, v, sous, accent }) => (
    <div>
      <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: '.1em', textTransform: 'uppercase', color: doux, marginBottom: 3 }}>{et}</div>
      <div style={{ fontFamily: MONO, fontWeight: 600, fontVariantNumeric: 'tabular-nums', fontSize: 32, lineHeight: 1.05,
        color: accent ? (nuit ? '#ff6076' : '#ff8a9b') : (nuit ? th.text : '#fff') }}>
        {formater(v, 2)}<span style={{ fontSize: '0.45em', fontWeight: 500, marginLeft: 4, opacity: 0.75 }}>m³</span>
      </div>
      <div style={{ fontSize: 12, color: doux, marginTop: 3 }}>{sous}</div>
    </div>
  );
  return (
    <div style={{ background: fond, border: `1px solid ${nuit ? th.line : fond}`, borderRadius: 8,
      padding: 18, marginBottom: 16, display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: 16 }}>
      <Bloc et="Volume net" v={net} sous={sousNet} />
      <Bloc et="À commander" v={commande} sous={`perte de ${formater(perte, 0)} %`} accent />
    </div>
  );
}

function Th({ th, largeur, children }) {
  return (
    <th style={{ width: largeur, textAlign: 'left', padding: '0 6px 7px 0', fontSize: 11, fontWeight: 700,
      letterSpacing: '.06em', textTransform: 'uppercase', color: th.textDim, borderBottom: `1px solid ${th.line}` }}>
      {children}
    </th>
  );
}

function TableDetail({ th, rangees, net }) {
  const cellNum = { textAlign: 'right', fontFamily: MONO, fontVariantNumeric: 'tabular-nums', whiteSpace: 'nowrap', verticalAlign: 'top' };
  return (
    <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13.5 }}>
      <tbody>
        {rangees.filter(Boolean).map((r, i) => (
          <tr key={i} style={{ borderBottom: `1px solid ${th.line}` }}>
            <td style={{ padding: '7px 8px 7px 0' }}>
              {r.nom}
              <span style={{ display: 'block', fontSize: 11.5, color: th.textDim, fontFamily: MONO, marginTop: 2 }}>{r.formule}</span>
            </td>
            <td style={{ ...cellNum, padding: '7px 0', color: r.v < 0 ? ROUGE : th.text }}>
              {r.v < 0 ? '− ' : ''}{formater(Math.abs(r.v), 4)} m³
            </td>
          </tr>
        ))}
        <tr style={{ borderTop: `2px solid ${th.accent}` }}>
          <td style={{ padding: '9px 0 0', fontWeight: 700 }}>{net.nom}</td>
          <td style={{ ...cellNum, padding: '9px 0 0', fontWeight: 700 }}>{formater(net.v, 4)} m³</td>
        </tr>
      </tbody>
    </table>
  );
}

function Legende({ th, items }) {
  return (
    <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap', marginTop: 10, fontSize: 12, color: th.textDim }}>
      {items.map((it) => (
        <span key={it.texte} style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
          <i style={{ width: 11, height: 11, display: 'inline-block', background: it.fond,
            border: `1.5px ${it.tirets ? 'dashed' : 'solid'} ${it.bord}`, borderRadius: it.rond ? '50%' : 2 }} />
          {it.texte}
        </span>
      ))}
    </div>
  );
}

// ===========================================================================
// COUPES (SVG) — dessinées à l'échelle à partir des valeurs saisies
// ===========================================================================
const L_SCHEMA = 380;

function CoupeBollard({ c, th }) {
  const H = 400;
  const margeG = 16, margeD = 74, margeH = 34, margeB = 44;
  const T = th.textDim;
  const largeurReelle = Math.max(c.Ds, c.Dp, 1);
  const hauteurReelle = Math.max(c.Ha + c.Hs, 1);
  const k = Math.min((L_SCHEMA - margeG - margeD) / largeurReelle, (H - margeH - margeB) / hauteurReelle);
  const s = (mm) => mm * k;
  const cx = margeG + (L_SCHEMA - margeG - margeD) / 2;
  const ySol = margeH + c.Ha * k;
  const yBas = ySol + c.Hs * k;
  const yTop = margeH;
  const yBeton = ySol + s(c.Hr);
  const xg = cx - s(c.Ds) / 2;
  const xCote = cx + s(c.Ds) / 2 + 20;
  const yCote = yBas + 20;
  const police = { fontSize: 11, fontFamily: MONO, fill: T };

  const hachures = [];
  for (let x = 6; x < L_SCHEMA - 8; x += 11) hachures.push(x);
  const remblai = [];
  for (let y = ySol + 2; y < yBeton; y += 3.5) remblai.push(y);

  const coteV = (y1, y2, txt, cle) => (Math.abs(y2 - y1) < 6 ? null : (
    <g key={cle} stroke={T} strokeWidth="1">
      <line x1={xCote} y1={y1} x2={xCote} y2={y2} />
      <line x1={xCote - 4} y1={y1} x2={xCote + 4} y2={y1} />
      <line x1={xCote - 4} y1={y2} x2={xCote + 4} y2={y2} />
      <text x={xCote + 7} y={(y1 + y2) / 2 + 4} stroke="none" {...police}>{txt}</text>
    </g>
  ));

  const yAnc = ySol + s(c.He);
  const ep = Math.max(s(c.t), 1.4);
  const r = s(c.Di) / 2;

  return (
    <svg viewBox={`0 0 ${L_SCHEMA} ${H}`} width="100%" style={{ maxWidth: L_SCHEMA, display: 'block', margin: '0 auto' }} role="img" aria-label="Coupe du bollard">
      <line x1="4" y1={ySol} x2={L_SCHEMA - 6} y2={ySol} stroke={th.sol} strokeWidth="1.5" />
      {hachures.map((x) => <line key={x} x1={x} y1={ySol} x2={x - 5} y2={ySol + 6} stroke={th.sol} strokeWidth="1" />)}

      <rect x={xg} y={yBeton} width={s(c.Ds)} height={Math.max(s(c.Hs - c.Hr), 0)} fill={th.beton} stroke={th.betonTrait} strokeWidth="1" />
      {c.Hr > 0 && (
        <g>
          <rect x={xg} y={ySol} width={s(c.Ds)} height={s(c.Hr)} fill="none" stroke={th.sol} strokeWidth="1" />
          {remblai.map((y) => <line key={y} x1={xg + 1} y1={y} x2={xg + s(c.Ds) - 1} y2={y} stroke={th.sol} strokeWidth="0.6" strokeDasharray="1.5 2.5" />)}
        </g>
      )}
      <rect x={xg} y={ySol} width={s(c.Ds)} height={s(c.Hs)} fill="none" stroke={th.betonTrait} strokeWidth="1.4" strokeDasharray="5 3" />

      {c.Ha > 0 && c.Di > 0 && <rect x={cx - r} y={yTop} width={s(c.Di)} height={s(c.Ha)} fill={th.beton} />}
      {c.dome > 0 && c.Di > 0 && (
        <path d={`M ${cx - r} ${yTop} A ${r} ${r} 0 0 1 ${cx + r} ${yTop}`} fill={th.beton} stroke={th.betonTrait} strokeWidth="1" />
      )}
      {c.Di > 0 && (
        <g fill={th.acier}>
          {[-1, 1].map((sg) => {
            const xExt = cx + sg * s(c.Dp) / 2;
            return <rect key={sg} x={Math.min(xExt, xExt - sg * ep)} y={yTop} width={ep} height={Math.max(yAnc - yTop, 0)} />;
          })}
          <line x1={cx - s(c.Dp) / 2} y1={yAnc} x2={cx + s(c.Dp) / 2} y2={yAnc} stroke={th.acier} strokeWidth="1" />
        </g>
      )}

      {coteV(yTop, ySol, formater(c.Ha, 0), 'ha')}
      {coteV(ySol, yBas, formater(c.Hs, 0), 'hs')}

      <g stroke={T} strokeWidth="1">
        <line x1={xg} y1={yCote} x2={xg + s(c.Ds)} y2={yCote} />
        <line x1={xg} y1={yCote - 4} x2={xg} y2={yCote + 4} />
        <line x1={xg + s(c.Ds)} y1={yCote - 4} x2={xg + s(c.Ds)} y2={yCote + 4} />
      </g>
      <text x={cx} y={yCote + 16} textAnchor="middle" {...police}>⌀ {formater(c.Ds, 0)}</text>
      <text x={xg - 4} y={yTop + 14} textAnchor="end" {...police} fontSize="10.5">⌀{formater(c.Dp, 1)}</text>
    </svg>
  );
}

function CoupeMassif({ c, th }) {
  const margeG = 14, margeD = 66, margeH = 16, margeB = 40;
  const dispoW = L_SCHEMA - margeG - margeD;
  const T = th.textDim;
  const police = { fontSize: 11, fontFamily: MONO, fill: T };

  const ratio = c.H > 0 ? c.H / Math.max(c.W, 1) : 0.6;
  let w = dispoW, h = w * ratio;
  if (h > 230) { h = 230; w = h / ratio; }
  const H = h + margeH + margeB;
  const x0 = margeG + (dispoW - w) / 2, y0 = margeH;
  const k = w / Math.max(c.W, 1);

  // Disposition illustrative : grille régulière qui tient dans l'enrobage.
  const tous = [];
  c.details.forEach((x) => { for (let i = 0; i < x.qte; i++) tous.push(x.d); });
  tous.sort((a, b) => b - a);
  const cercles = [];
  if (tous.length) {
    const dMax = tous[0];
    const tiennent = Math.max(1, Math.floor((c.W - 2 * ENROBAGE_MM + ECART_MM) / (dMax + ECART_MM)));
    const cols = Math.min(tous.length, tiennent);
    const rangs = Math.ceil(tous.length / cols);
    const pasX = (dMax + ECART_MM) * k;
    const pasY = Math.min((dMax + ECART_MM) * k, rangs > 1 ? (h - 2 * ENROBAGE_MM * k) / (rangs - 1) : h);
    const xDep = x0 + w / 2 - (cols - 1) * pasX / 2;
    const yDep = y0 + h / 2 - (rangs - 1) * pasY / 2;
    tous.forEach((d, i) => {
      const nRang = Math.floor(i / cols);
      const dansRang = Math.min(cols, tous.length - nRang * cols);
      const decal = (cols - dansRang) * pasX / 2;
      cercles.push({ cx: xDep + decal + pasX * (i % cols), cy: yDep + pasY * nRang, r: Math.max(d * k / 2, 2) });
    });
  }
  const yc = y0 + h + 18;
  const xc = x0 + w + 18;

  return (
    <svg viewBox={`0 0 ${L_SCHEMA} ${H}`} width="100%" style={{ maxWidth: L_SCHEMA, display: 'block', margin: '0 auto' }} role="img" aria-label="Coupe du massif">
      <rect x={x0} y={y0} width={w} height={h} fill={th.beton} stroke={th.betonTrait} strokeWidth="1.4" />
      {cercles.map((ci, i) => <circle key={i} cx={ci.cx} cy={ci.cy} r={ci.r} fill={th.panel} stroke={th.acier} strokeWidth="1.2" />)}
      <g stroke={T} strokeWidth="1">
        <line x1={x0} y1={yc} x2={x0 + w} y2={yc} />
        <line x1={x0} y1={yc - 4} x2={x0} y2={yc + 4} />
        <line x1={x0 + w} y1={yc - 4} x2={x0 + w} y2={yc + 4} />
        <line x1={xc} y1={y0} x2={xc} y2={y0 + h} />
        <line x1={xc - 4} y1={y0} x2={xc + 4} y2={y0} />
        <line x1={xc - 4} y1={y0 + h} x2={xc + 4} y2={y0 + h} />
      </g>
      <text x={x0 + w / 2} y={yc + 15} textAnchor="middle" {...police}>{formater(c.W, 0)} mm</text>
      <text x={xc + 7} y={y0 + h / 2 + 4} {...police}>{formater(c.H, 0)}</text>
    </svg>
  );
}

// ===========================================================================
export default function CubageBetonPage() {
  const [session, setSession] = useState(null);

  if (!session) {
    return (
      <GardeConnexion
        appSlug="cubage-beton"
        nomApp="Cubage béton"
        onPret={setSession}
      />
    );
  }

  return <CubageBetonApp nom={session.nom} poste={session.poste} />;
}
