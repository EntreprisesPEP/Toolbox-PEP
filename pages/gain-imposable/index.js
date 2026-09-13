// ============================================================================
// GAIN IMPOSABLE — avantage relatif a une automobile fournie par l'employeur
//
// Reprend le chiffrier « Gain imposable » et le rend refaisable sans risque
// de casser une formule. Tout le calcul vit dans lib/gain-imposable/calculs.js
// pour que l'ecran, le PDF et le Excel disent la meme chose.
// ============================================================================

import { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { createClient } from '@supabase/supabase-js';
import {
  Plus, Trash2, FileDown, Save, Search, Car, KeyRound,
  AlertTriangle, Info, Check, RefreshCw, Copy,
} from 'lucide-react';

import GardeConnexion from '../../components/commun/GardeConnexion';
import EnTeteApp from '../../components/commun/EnTeteApp';
import { PALETTES, useModePep } from '../../components/commun/ThemeToolbox';

import {
  MODES, modeDe, calculer, valider, tauxDeLAnnee, TAUX_PAR_DEFAUT, ANNEE_MIN,
  enCents, enDollars, analyserNombre, periodesEntre, joursEntre,
  formaterArgent, formaterKm, formaterPourcent, formaterTaux, nomFichier,
} from '../../lib/gain-imposable/calculs';

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SUPABASE_ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const supabaseGI = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, { db: { schema: 'gain_imposable' } });
const supabasePers = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, { db: { schema: 'personnel' } });

const THEMES = PALETTES;
const ROUGE = '#c41230';

const ONGLETS = [
  { id: 'liste', libelle: 'Les calculs' },
  { id: 'calcul', libelle: 'Calcul en cours' },
  { id: 'taux', libelle: 'Taux par année' },
];

const EMPLOYEUR_DEFAUT = 'PEP Pavage & Les Entreprises PEP (2000) Inc.';

function anneeCourante() {
  return new Date().getFullYear();
}

function calculVide(annee) {
  const a = annee || anneeCourante();
  return {
    id: null,
    annee: a,
    employe_nom: '',
    employe_courriel: '',
    employeur: EMPLOYEUR_DEFAUT,
    vehicule: '',
    mode: 'achat',
    date_debut: `${a}-01-01`,
    date_fin: `${a}-12-31`,
    odo_debut: '',
    odo_fin: '',
    km_total: '',
    km_personnel: '',
    cout: '',
    mensualite: '',
    mois_location: '',
    assurances: '',
    exige_par_employeur: true,
    vendeur_automobiles: false,
    methode_fonctionnement: 'moindre',
    rembourse_usage: '',
    rembourse_fonct: '',
    note: '',
  };
}

/** Ligne de base -> objet de formulaire (les cents redeviennent des dollars). */
function depuisBase(r) {
  return {
    id: r.id,
    annee: r.annee,
    employe_nom: r.employe_nom || '',
    employe_courriel: r.employe_courriel || '',
    employeur: r.employeur || EMPLOYEUR_DEFAUT,
    vehicule: r.vehicule || '',
    mode: r.mode || 'achat',
    date_debut: r.date_debut || '',
    date_fin: r.date_fin || '',
    odo_debut: formaterSaisie(r.odo_debut ?? ''),
    odo_fin: formaterSaisie(r.odo_fin ?? ''),
    km_total: formaterSaisie(r.km_total ?? ''),
    km_personnel: formaterSaisie(r.km_personnel ?? ''),
    cout: r.cout_cents === null || r.cout_cents === undefined ? '' : formaterSaisie(enDollars(r.cout_cents)),
    mensualite: r.mensualite_cents === null || r.mensualite_cents === undefined ? '' : formaterSaisie(enDollars(r.mensualite_cents)),
    mois_location: formaterSaisie(r.mois_location ?? ''),
    assurances: r.assurances_cents === null || r.assurances_cents === undefined ? '' : formaterSaisie(enDollars(r.assurances_cents)),
    exige_par_employeur: r.exige_par_employeur ?? true,
    vendeur_automobiles: r.vendeur_automobiles ?? false,
    methode_fonctionnement: r.methode_fonctionnement || 'moindre',
    rembourse_usage: r.rembourse_usage_cents ? formaterSaisie(enDollars(r.rembourse_usage_cents)) : '',
    rembourse_fonct: r.rembourse_fonct_cents ? formaterSaisie(enDollars(r.rembourse_fonct_cents)) : '',
    note: r.note || '',
  };
}

// ============================================================================

function GainImposableApp({ userId, nom, poste }) {
  const [mode, setMode] = useModePep();
  const th = THEMES[mode];

  const [onglet, setOnglet] = useState('liste');
  const [chargement, setChargement] = useState(true);
  const [erreurChargement, setErreurChargement] = useState('');

  const [personnes, setPersonnes] = useState([]);
  const [tauxRangees, setTauxRangees] = useState([]);
  const [calculs, setCalculs] = useState([]);

  const [calcul, setCalcul] = useState(calculVide());
  const [modifie, setModifie] = useState(false);
  const [enregistrement, setEnregistrement] = useState(false);

  const [message, setMessage] = useState(null);
  const minuterie = useRef(null);

  const avertir = useCallback((texte, genre = 'ok') => {
    setMessage({ texte, genre });
    if (minuterie.current) clearTimeout(minuterie.current);
    minuterie.current = setTimeout(() => setMessage(null), 6000);
  }, []);

  useEffect(() => () => { if (minuterie.current) clearTimeout(minuterie.current); }, []);

  // --- Chargement ----------------------------------------------------------
  const charger = useCallback(async () => {
    setChargement(true);
    setErreurChargement('');
    const [pe, ta, ca] = await Promise.all([
      supabasePers.from('personnes').select('nom, courriel, titre, actif').order('nom'),
      supabaseGI.from('taux').select('*').order('annee', { ascending: false }),
      supabaseGI.from('calculs').select('*').order('annee', { ascending: false }).order('employe_nom').limit(500),
    ]);

    if (ta.error || ca.error) {
      const e = ta.error || ca.error;
      setErreurChargement(
        `Impossible de lire le schéma « gain_imposable » (${e.message}). `
        + 'Si le message parle de permission, le schéma n\'est probablement pas exposé dans '
        + 'Supabase → Integrations → Data API → Settings → Exposed schemas.',
      );
    }
    setPersonnes((pe.data || []).filter((p) => p.nom));
    setTauxRangees(ta.data || []);
    setCalculs(ca.data || []);
    setChargement(false);
  }, []);

  useEffect(() => { charger(); }, [charger]);

  // --- La table de taux, en forme utilisable par le moteur -----------------
  const tableTaux = useMemo(() => {
    const t = {};
    for (const r of tauxRangees) {
      t[r.annee] = {
        fonctionnement: Number(r.fonctionnement),
        fonctionnementVendeur: r.fonctionnement_vendeur === null ? null : Number(r.fonctionnement_vendeur),
      };
    }
    return t;
  }, [tauxRangees]);

  const taux = useMemo(
    () => tauxDeLAnnee(Number(calcul.annee), tableTaux),
    [calcul.annee, tableTaux],
  );
  const resultat = useMemo(() => calculer(calcul, taux), [calcul, taux]);
  const controle = useMemo(() => valider(calcul, resultat), [calcul, resultat]);

  function maj(champs) {
    setCalcul((c) => ({ ...c, ...champs }));
    setModifie(true);
  }

  function nouveau() {
    if (modifie && !window.confirm('Le calcul en cours a des changements non enregistrés. Le laisser tomber ?')) return;
    setCalcul(calculVide());
    setModifie(false);
    setOnglet('calcul');
  }

  function ouvrir(rangee) {
    if (modifie && !window.confirm('Le calcul en cours a des changements non enregistrés. Le laisser tomber ?')) return false;
    setCalcul(depuisBase(rangee));
    setModifie(false);
    setOnglet('calcul');
    return true;
  }

  function dupliquer(rangee) {
    if (!ouvrir(rangee)) return;
    setCalcul((c) => ({ ...c, id: null, annee: Number(c.annee) + 1 }));
    setModifie(true);
    avertir("Copie créée pour l'année suivante. Rien n'est enregistré tant que tu ne cliques pas Enregistrer.");
  }

  async function enregistrer() {
    if (controle.bloquants.length) {
      avertir(controle.bloquants[0], 'err');
      return null;
    }
    setEnregistrement(true);
    const charge = {
      annee: Number(calcul.annee),
      employe_nom: String(calcul.employe_nom).trim(),
      employe_courriel: calcul.employe_courriel || null,
      employeur: calcul.employeur || EMPLOYEUR_DEFAUT,
      vehicule: calcul.vehicule || null,
      mode: calcul.mode,
      date_debut: calcul.date_debut || null,
      date_fin: calcul.date_fin || null,
      odo_debut: analyserNombre(calcul.odo_debut),
      odo_fin: analyserNombre(calcul.odo_fin),
      km_total: analyserNombre(calcul.km_total),
      km_personnel: analyserNombre(calcul.km_personnel),
      cout_cents: calcul.mode === 'achat' ? enCents(calcul.cout) : null,
      mensualite_cents: calcul.mode === 'location' ? enCents(calcul.mensualite) : null,
      mois_location: calcul.mode === 'location' ? analyserNombre(calcul.mois_location) : null,
      assurances_cents: calcul.mode === 'location' ? (enCents(calcul.assurances) ?? 0) : null,
      exige_par_employeur: !!calcul.exige_par_employeur,
      vendeur_automobiles: !!calcul.vendeur_automobiles,
      methode_fonctionnement: calcul.methode_fonctionnement,
      rembourse_usage_cents: enCents(calcul.rembourse_usage) ?? 0,
      rembourse_fonct_cents: enCents(calcul.rembourse_fonct) ?? 0,
      note: calcul.note || null,
      usage_net_cents: resultat.usageNetCents,
      fonct_net_cents: resultat.fonctNetCents,
      total_cents: resultat.totalCents,
      tps_cents: resultat.tpsCents,
      tvq_cents: resultat.tvqCents,
      maj_par: nom,
      maj_le: new Date().toISOString(),
    };

    let res;
    if (calcul.id) {
      res = await supabaseGI.from('calculs').update(charge).eq('id', calcul.id).select().maybeSingle();
    } else {
      res = await supabaseGI.from('calculs')
        .insert({ ...charge, cree_par: nom, cree_par_id: userId })
        .select().maybeSingle();
    }
    setEnregistrement(false);

    if (res.error) { avertir(`Enregistrement refusé : ${res.error.message}`, 'err'); return null; }
    setCalcul((c) => ({ ...c, id: res.data.id }));
    setModifie(false);
    await charger();
    avertir('Enregistré.');
    return res.data;
  }

  async function supprimer(rangee) {
    if (!window.confirm(`Supprimer le calcul de ${rangee.employe_nom} pour ${rangee.annee} ? C'est définitif.`)) return;
    const { error } = await supabaseGI.from('calculs').delete().eq('id', rangee.id);
    if (error) { avertir(`Suppression refusée : ${error.message}`, 'err'); return; }
    if (calcul.id === rangee.id) { setCalcul(calculVide()); setModifie(false); }
    await charger();
    avertir('Supprimé.');
  }

  async function exporter(format) {
    if (controle.bloquants.length) { avertir(controle.bloquants[0], 'err'); return; }
    // On enregistre avant d'exporter : un fichier qui circule doit correspondre
    // a quelque chose qui existe dans l'app, pas a un ecran non sauvegarde.
    if (modifie || !calcul.id) {
      const sauve = await enregistrer();
      if (!sauve) return;
    }
    try {
      const mod = await import('../../lib/gain-imposable/exports');
      if (format === 'pdf') await mod.exporterPdf({ calcul, resultat });
      else await mod.exporterExcel({ calcul, resultat });
      avertir(`${format === 'pdf' ? 'PDF' : 'Excel'} téléchargé.`);
    } catch (e) {
      avertir(`Export impossible : ${e.message}`, 'err');
    }
  }

  // --- Rendu ---------------------------------------------------------------
  return (
    <div style={{ minHeight: '100vh', background: th.bg, color: th.text }}>
      {/*
        Les exemples doivent rester nettement plus pales que ce qu'on tape,
        sinon on lit « 127 139 » comme une valeur deja saisie. Le navigateur
        met les siens trop fonces : on impose les notres, et en italique pour
        que la difference se voie meme en noir et blanc.
      */}
      <style>{`
        .gi-saisie::placeholder {
          color: ${mode === 'night' ? '#5a6480' : '#aab0bd'};
          opacity: 1;
          font-style: italic;
        }
        .gi-saisie::-webkit-input-placeholder {
          color: ${mode === 'night' ? '#5a6480' : '#aab0bd'};
          opacity: 1;
          font-style: italic;
        }
      `}</style>

      <EnTeteApp
        titre="Gain imposable"
        sousTitre="Avantage automobile — droit d'usage, frais de fonctionnement, TPS et TVQ à remettre"
        mode={mode}
        onChangerMode={setMode}
        nom={nom}
        poste={poste}
        onAccueil={() => setOnglet('liste')}
      />

      <div style={{ maxWidth: 1150, margin: '0 auto', padding: '18px 16px 60px' }}>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 16, flexWrap: 'wrap' }}>
          {ONGLETS.map((o) => (
            <button
              key={o.id}
              onClick={() => setOnglet(o.id)}
              style={{
                padding: '8px 16px', borderRadius: 8, cursor: 'pointer', fontSize: 13,
                fontWeight: onglet === o.id ? 700 : 500,
                border: `1px solid ${onglet === o.id ? ROUGE : th.line}`,
                background: onglet === o.id ? ROUGE : th.panel,
                color: onglet === o.id ? '#fff' : th.text,
              }}
            >
              {o.libelle}
              {o.id === 'calcul' && modifie ? ' •' : ''}
            </button>
          ))}
          <button
            onClick={nouveau}
            style={{
              marginLeft: 'auto', padding: '8px 16px', borderRadius: 8, cursor: 'pointer',
              border: 'none', background: th.btnBg, color: '#fff', fontSize: 13, fontWeight: 600,
              display: 'flex', alignItems: 'center', gap: 6,
            }}
          >
            <Plus size={15} /> Nouveau calcul
          </button>
        </div>

        {erreurChargement && (
          <div style={{
            background: th.errBg, color: th.errTexte, border: `1px solid ${th.errTexte}33`,
            borderRadius: 8, padding: '12px 14px', marginBottom: 14, fontSize: 13, lineHeight: 1.5,
          }}>
            {erreurChargement}
          </div>
        )}

        {message && (
          <div style={{
            background: message.genre === 'err' ? th.errBg : th.okBg,
            color: message.genre === 'err' ? th.errTexte : th.text,
            border: `1px solid ${message.genre === 'err' ? `${th.errTexte}33` : th.okLigne}`,
            borderRadius: 8, padding: '10px 14px', marginBottom: 14, fontSize: 13,
            display: 'flex', alignItems: 'center', gap: 8,
          }}>
            {message.genre === 'err' ? <AlertTriangle size={15} /> : <Check size={15} />}
            {message.texte}
          </div>
        )}

        {chargement ? (
          <div style={{ padding: 40, textAlign: 'center', color: th.textDim }}>Chargement…</div>
        ) : onglet === 'liste' ? (
          <OngletListe
            th={th} calculs={calculs}
            onOuvrir={ouvrir} onDupliquer={dupliquer} onSupprimer={supprimer} onNouveau={nouveau}
          />
        ) : onglet === 'calcul' ? (
          <OngletCalcul
            th={th} mode={mode} calcul={calcul} maj={maj} resultat={resultat} controle={controle}
            personnes={personnes} calculs={calculs}
            onEnregistrer={enregistrer} onExporter={exporter}
            enregistrement={enregistrement} modifie={modifie}
          />
        ) : (
          <OngletTaux th={th} mode={mode} rangees={tauxRangees} onRecharger={charger} avertir={avertir} nom={nom} />
        )}
      </div>
    </div>
  );
}

// ============================================================================
// ONGLET — LA LISTE
// ============================================================================

function OngletListe({ th, calculs, onOuvrir, onDupliquer, onSupprimer, onNouveau }) {
  const [recherche, setRecherche] = useState('');
  const [anneeFiltre, setAnneeFiltre] = useState('toutes');

  const annees = useMemo(
    () => [...new Set(calculs.map((c) => c.annee))].sort((a, b) => b - a),
    [calculs],
  );

  const visibles = useMemo(() => {
    const q = recherche.trim().toLowerCase();
    return calculs.filter((c) => {
      if (anneeFiltre !== 'toutes' && String(c.annee) !== String(anneeFiltre)) return false;
      if (!q) return true;
      return `${c.employe_nom} ${c.vehicule || ''}`.toLowerCase().includes(q);
    });
  }, [calculs, recherche, anneeFiltre]);

  const sommes = useMemo(() => visibles.reduce((a, c) => ({
    total: a.total + (c.total_cents || 0),
    tps: a.tps + (c.tps_cents || 0),
    tvq: a.tvq + (c.tvq_cents || 0),
  }), { total: 0, tps: 0, tvq: 0 }), [visibles]);

  // Deux calculs pour la meme personne la meme annee : legitime si elle a
  // change de vehicule, suspect autrement. On le signale sans l'interdire.
  const doublons = useMemo(() => {
    const vus = new Map();
    const d = new Set();
    for (const c of calculs) {
      const cle = `${c.annee}|${(c.employe_nom || '').toLowerCase()}`;
      if (vus.has(cle)) { d.add(cle); } else vus.set(cle, true);
    }
    return d;
  }, [calculs]);

  const cell = { padding: '10px 12px', fontSize: 13, borderBottom: `1px solid ${th.line}` };

  return (
    <div>
      <div style={{ display: 'flex', gap: 10, marginBottom: 14, flexWrap: 'wrap' }}>
        <div style={{ position: 'relative', flex: '1 1 260px' }}>
          <Search size={15} style={{ position: 'absolute', left: 11, top: 11, color: th.textDim }} />
          <input
            value={recherche} onChange={(e) => setRecherche(e.target.value)}
            placeholder="Employé, véhicule…"
            className="gi-saisie"
            style={{
              width: '100%', padding: '9px 12px 9px 34px', borderRadius: 8,
              border: `1px solid ${th.line}`, background: th.inputBg, color: th.text, fontSize: 13,
            }}
          />
        </div>
        <select
          value={anneeFiltre} onChange={(e) => setAnneeFiltre(e.target.value)}
          style={{
            padding: '9px 12px', borderRadius: 8, border: `1px solid ${th.line}`,
            background: th.inputBg, color: th.text, fontSize: 13, minWidth: 170,
          }}
        >
          <option value="toutes">Toutes les années</option>
          {annees.map((a) => <option key={a} value={a}>{a}</option>)}
        </select>
      </div>

      <div style={{ background: th.panel, border: `1px solid ${th.line}`, borderRadius: 10, overflow: 'hidden' }}>
        <div style={{
          display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12,
          padding: '10px 14px', background: th.panelAlt, fontSize: 12,
          color: th.textDim, textTransform: 'uppercase', letterSpacing: 0.4, flexWrap: 'wrap',
        }}>
          <span>{visibles.length} calcul{visibles.length > 1 ? 's' : ''} · à toi seul</span>
          <span style={{ textTransform: 'none', letterSpacing: 0 }}>
            Avantage {formaterArgent(sommes.total)} · TPS {formaterArgent(sommes.tps)} · TVQ {formaterArgent(sommes.tvq)}
          </span>
        </div>

        {visibles.length === 0 ? (
          <div style={{ padding: 40, textAlign: 'center', color: th.textDim, fontSize: 13 }}>
            <Car size={30} style={{ opacity: 0.4, marginBottom: 10 }} />
            <div>Aucun calcul pour l'instant.</div>
            <div style={{ marginTop: 6, fontSize: 12, maxWidth: 380, marginLeft: 'auto', marginRight: 'auto', lineHeight: 1.5 }}>
              Cette liste ne montre que tes propres calculs. Ceux des autres ne te sont pas
              visibles, et les tiens ne le sont pour personne d'autre.
            </div>
            <button
              onClick={onNouveau}
              style={{
                marginTop: 14, padding: '8px 18px', borderRadius: 8, border: 'none',
                background: ROUGE, color: '#fff', fontSize: 13, fontWeight: 600, cursor: 'pointer',
              }}
            >
              Créer le premier
            </button>
          </div>
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 780 }}>
              <thead>
                <tr style={{ background: th.panelAlt }}>
                  {['Année', 'Employé', 'Véhicule', 'Droit d\'usage', 'Fonctionnement', 'Avantage', 'TPS', 'TVQ', ''].map((h, i) => (
                    <th key={h + i} style={{
                      ...cell, textAlign: i >= 3 && i <= 7 ? 'right' : 'left',
                      fontSize: 11, color: th.textDim, textTransform: 'uppercase', letterSpacing: 0.4,
                      fontWeight: 600, whiteSpace: 'nowrap',
                    }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {visibles.map((c) => {
                  const estDoublon = doublons.has(`${c.annee}|${(c.employe_nom || '').toLowerCase()}`);
                  return (
                    <tr key={c.id} style={{ cursor: 'pointer' }} onClick={() => onOuvrir(c)}>
                      <td style={cell}>{c.annee}</td>
                      <td style={{ ...cell, fontWeight: 600 }}>
                        {c.employe_nom}
                        {estDoublon && (
                          <span title="Plusieurs calculs pour cette personne cette année-là"
                            style={{ marginLeft: 6, color: th.avisTexte, fontSize: 11 }}>⚠</span>
                        )}
                      </td>
                      <td style={{ ...cell, color: th.textDim }}>{c.vehicule || '—'}</td>
                      <td style={{ ...cell, textAlign: 'right' }}>{formaterArgent(c.usage_net_cents)}</td>
                      <td style={{ ...cell, textAlign: 'right' }}>{formaterArgent(c.fonct_net_cents)}</td>
                      <td style={{ ...cell, textAlign: 'right', fontWeight: 700 }}>{formaterArgent(c.total_cents)}</td>
                      <td style={{ ...cell, textAlign: 'right', color: th.textDim }}>{formaterArgent(c.tps_cents)}</td>
                      <td style={{ ...cell, textAlign: 'right', color: th.textDim }}>{formaterArgent(c.tvq_cents)}</td>
                      <td style={{ ...cell, textAlign: 'right', whiteSpace: 'nowrap' }}>
                        <button
                          title="Dupliquer pour l'année suivante"
                          onClick={(e) => { e.stopPropagation(); onDupliquer(c); }}
                          style={{ background: 'none', border: 'none', cursor: 'pointer', color: th.textDim, padding: 4 }}
                        ><Copy size={15} /></button>
                        <button
                          title="Supprimer"
                          onClick={(e) => { e.stopPropagation(); onSupprimer(c); }}
                          style={{ background: 'none', border: 'none', cursor: 'pointer', color: ROUGE, padding: 4 }}
                        ><Trash2 size={15} /></button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}

// ============================================================================
// ONGLET — LE CALCUL
// ============================================================================

function OngletCalcul({
  th, mode, calcul, maj, resultat, controle, personnes, calculs,
  onEnregistrer, onExporter, enregistrement, modifie,
}) {
  const m = modeDe(calcul.mode);

  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr)', gap: 16 }}>
      <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap', alignItems: 'flex-start' }}>
        <div style={{ flex: '1 1 460px', minWidth: 0, display: 'flex', flexDirection: 'column', gap: 14 }}>
          <Identite th={th} mode={mode} calcul={calcul} maj={maj} personnes={personnes} calculs={calculs} />
          <ChoixMode th={th} calcul={calcul} maj={maj} />
          <Periode th={th} mode={mode} calcul={calcul} maj={maj} resultat={resultat} />
          <Kilometrage th={th} mode={mode} calcul={calcul} maj={maj} resultat={resultat} />
          <Vehicule th={th} mode={mode} calcul={calcul} maj={maj} m={m} />
          <Conditions th={th} mode={mode} calcul={calcul} maj={maj} resultat={resultat} />
        </div>

        <div style={{ flex: '1 1 380px', minWidth: 0, position: 'sticky', top: 12 }}>
          <Resultat th={th} calcul={calcul} resultat={resultat} controle={controle} />
        </div>
      </div>

      <div style={{
        display: 'flex', gap: 10, flexWrap: 'wrap', padding: '14px 0 0',
        borderTop: `1px solid ${th.line}`,
      }}>
        <button
          onClick={onEnregistrer}
          disabled={enregistrement || controle.bloquants.length > 0}
          style={{
            padding: '10px 20px', borderRadius: 8, border: 'none',
            background: controle.bloquants.length ? th.line : ROUGE,
            color: controle.bloquants.length ? th.textDim : '#fff',
            fontSize: 13, fontWeight: 600,
            cursor: controle.bloquants.length ? 'not-allowed' : 'pointer',
            display: 'flex', alignItems: 'center', gap: 7,
          }}
        >
          <Save size={15} /> {enregistrement ? 'Enregistrement…' : 'Enregistrer'}
        </button>
        <button
          onClick={() => onExporter('pdf')}
          disabled={controle.bloquants.length > 0}
          style={boutonSecondaire(th, controle.bloquants.length > 0)}
        ><FileDown size={15} /> PDF</button>
        <button
          onClick={() => onExporter('excel')}
          disabled={controle.bloquants.length > 0}
          style={boutonSecondaire(th, controle.bloquants.length > 0)}
        ><FileDown size={15} /> Excel</button>
        {modifie && (
          <span style={{ alignSelf: 'center', fontSize: 12, color: th.avisTexte }}>
            Changements non enregistrés
          </span>
        )}
      </div>
    </div>
  );
}

function boutonSecondaire(th, desactive) {
  return {
    padding: '10px 18px', borderRadius: 8, border: `1px solid ${th.line}`,
    background: th.panel, color: desactive ? th.textDim : th.text,
    fontSize: 13, fontWeight: 500, cursor: desactive ? 'not-allowed' : 'pointer',
    display: 'flex', alignItems: 'center', gap: 7,
  };
}

// --- Briques de formulaire --------------------------------------------------

function Carte({ th, titre, aide, children }) {
  return (
    <div style={{ background: th.panel, border: `1px solid ${th.line}`, borderRadius: 10, padding: 16 }}>
      <div style={{
        fontSize: 11, fontWeight: 700, letterSpacing: 0.5, textTransform: 'uppercase',
        color: th.textDim, marginBottom: aide ? 4 : 12,
      }}>{titre}</div>
      {aide && <div style={{ fontSize: 12, color: th.textDim, marginBottom: 12, lineHeight: 1.5 }}>{aide}</div>}
      {children}
    </div>
  );
}

function Champ({ th, etiquette, suffixe, aide, children, largeur }) {
  return (
    <label style={{ display: 'block', flex: largeur || '1 1 160px', minWidth: 0 }}>
      <div style={{ fontSize: 12, color: th.textDim, marginBottom: 5 }}>
        {etiquette}{suffixe ? <span style={{ opacity: 0.7 }}> ({suffixe})</span> : null}
      </div>
      {children}
      {aide && <div style={{ fontSize: 11, color: th.textDim, marginTop: 4, lineHeight: 1.4 }}>{aide}</div>}
    </label>
  );
}

// Jaune « il reste ca a remplir ». Deux tons : un jaune pale disparait sur le
// fond sombre, et un jaune vif brule les yeux de jour.
const A_REMPLIR = {
  day:   { fond: '#fff7d1', ligne: '#d9b32c' },
  night: { fond: '#3a3110', ligne: '#7a681d' },
};

/** Ce qui compte comme vide pour une case a remplir. */
function estVide(v) {
  return v === null || v === undefined || String(v).trim() === '';
}

/**
 * Le style d'une case de saisie. Quand la case est obligatoire et encore vide,
 * elle passe au jaune : on voit d'un coup d'oeil ce qui bloque le calcul, sans
 * avoir a lire la liste des manques en bas de page.
 */
function entree(th, mode, opts = {}) {
  const { requis = false, vide = false, inactif = false } = opts;
  const aRemplir = requis && vide && !inactif;
  const jaune = A_REMPLIR[mode] || A_REMPLIR.day;
  return {
    width: '100%', padding: '9px 11px', borderRadius: 7,
    border: `1px solid ${aRemplir ? jaune.ligne : th.line}`,
    background: aRemplir ? jaune.fond : th.inputBg,
    color: th.text, fontSize: 13, boxSizing: 'border-box',
  };
}

const ESPACE_MILLE = ' '; // espace fine insecable : 30 000, pas 30000

/**
 * Met les espaces de milliers dans ce que la personne est en train de taper,
 * sans rien decider d'autre : on ne complete pas les decimales et on ne refuse
 * pas une virgule laissee seule en cours de frappe.
 * « 30000 » -> « 30 000 » ; « 30000,5 » -> « 30 000,5 ».
 */
function formaterSaisie(brut) {
  const s = String(brut ?? '');
  if (!s) return '';
  const negatif = s.trimStart().startsWith('-');
  const propre = s.replace(/[^\d.,]/g, '');
  const coupe = propre.search(/[.,]/);
  const entiers = coupe === -1 ? propre : propre.slice(0, coupe);
  const decimales = coupe === -1 ? '' : `,${propre.slice(coupe + 1).replace(/[.,]/g, '')}`;
  const groupes = entiers.replace(/\B(?=(\d{3})+(?!\d))/g, ESPACE_MILLE);
  if (!groupes && !decimales) return negatif ? '-' : '';
  return (negatif ? '-' : '') + groupes + decimales;
}

/** Combien de caracteres significatifs (chiffres, virgule) avant cette position. */
function significatifsAvant(s, pos) {
  let n = 0;
  for (let i = 0; i < pos && i < s.length; i += 1) if (/[\d.,]/.test(s[i])) n += 1;
  return n;
}

/** Ou se placer, dans la chaine formatee, apres n caracteres significatifs. */
function positionApres(s, n) {
  if (n <= 0) return 0;
  let vus = 0;
  for (let i = 0; i < s.length; i += 1) {
    if (/[\d.,]/.test(s[i])) { vus += 1; if (vus === n) return i + 1; }
  }
  return s.length;
}

/**
 * Une case de nombre qui espace les milliers pendant la frappe.
 *
 * Le curseur est replace a la main apres chaque changement : si on ne le fait
 * pas, il saute a la fin des qu'une espace apparait ou disparait. On compte les
 * chiffres et non les caracteres, justement parce que les espaces bougent.
 */
function EntreeNombre({ th, mode, valeur, onValeur, requis, inactif, ...reste }) {
  const ref = useRef(null);
  const curseur = useRef(null);

  useEffect(() => {
    if (curseur.current === null || !ref.current) return;
    const p = curseur.current;
    curseur.current = null;
    try { ref.current.setSelectionRange(p, p); } catch (e) { /* champ sans curseur */ }
  });

  function changer(e) {
    const el = e.target;
    const pos = el.selectionStart === null ? el.value.length : el.selectionStart;
    const avant = significatifsAvant(el.value, pos);
    const formate = formaterSaisie(el.value);
    curseur.current = positionApres(formate, avant);
    onValeur(formate);
  }

  return (
    <input
      ref={ref}
      className="gi-saisie"
      value={valeur ?? ''}
      onChange={changer}
      disabled={inactif}
      inputMode="decimal"
      style={entree(th, mode, { requis, vide: estVide(valeur), inactif })}
      {...reste}
    />
  );
}

const RANGEE = { display: 'flex', gap: 12, flexWrap: 'wrap' };

function Identite({ th, mode, calcul, maj, personnes, calculs }) {
  const doublon = useMemo(() => calculs.some(
    (c) => c.id !== calcul.id
      && String(c.annee) === String(calcul.annee)
      && (c.employe_nom || '').toLowerCase() === (calcul.employe_nom || '').toLowerCase()
      && calcul.employe_nom,
  ), [calculs, calcul.id, calcul.annee, calcul.employe_nom]);

  const annees = [];
  for (let a = anneeCourante() + 1; a >= ANNEE_MIN; a--) annees.push(a);

  return (
    <Carte th={th} titre="L'employé et l'année">
      <div style={RANGEE}>
        <Champ th={th} etiquette="Employé" largeur="2 1 240px">
          <input
            value={calcul.employe_nom}
            list="gi-personnes"
            onChange={(e) => {
              const choisi = personnes.find((p) => p.nom === e.target.value);
              maj({
                employe_nom: e.target.value,
                ...(choisi ? { employe_courriel: choisi.courriel || '' } : {}),
              });
            }}
            placeholder="Choisir dans le répertoire…"
            className="gi-saisie"
            style={entree(th, mode, { requis: true, vide: estVide(calcul.employe_nom) })}
          />
          <datalist id="gi-personnes">
            {personnes.map((p) => <option key={p.nom} value={p.nom}>{p.titre || ''}</option>)}
          </datalist>
        </Champ>
        <Champ th={th} etiquette="Année d'imposition" largeur="0 0 150px">
          <select value={calcul.annee} onChange={(e) => maj({ annee: Number(e.target.value) })} style={entree(th, mode)}>
            {annees.map((a) => <option key={a} value={a}>{a}</option>)}
          </select>
        </Champ>
      </div>
      <div style={{ ...RANGEE, marginTop: 12 }}>
        <Champ th={th} etiquette="Véhicule" aide="Marque, modèle, année — ce qui paraîtra au document.">
          <input
            value={calcul.vehicule} onChange={(e) => maj({ vehicule: e.target.value })}
            placeholder="Ex. : Ford F-150 2023" className="gi-saisie" style={entree(th, mode)}
          />
        </Champ>
        <Champ th={th} etiquette="Employeur" largeur="2 1 260px">
          <input value={calcul.employeur} onChange={(e) => maj({ employeur: e.target.value })}
            className="gi-saisie" style={entree(th, mode)} />
        </Champ>
      </div>
      {doublon && (
        <div style={{
          marginTop: 12, padding: '9px 12px', borderRadius: 7, fontSize: 12, lineHeight: 1.5,
          background: th.avisBg, color: th.avisTexte,
        }}>
          Il y a déjà un calcul pour {calcul.employe_nom} en {calcul.annee}. C'est correct s'il a changé
          de véhicule en cours d'année — les deux s'additionnent. Sinon, ouvre l'autre plutôt que d'en créer un second.
        </div>
      )}
    </Carte>
  );
}

function ChoixMode({ th, calcul, maj }) {
  return (
    <Carte th={th} titre="Le véhicule est acheté ou loué ?">
      <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
        {MODES.map((m) => {
          const actif = calcul.mode === m.id;
          return (
            <button
              key={m.id}
              onClick={() => maj({ mode: m.id })}
              style={{
                flex: '1 1 200px', textAlign: 'left', padding: '12px 14px', borderRadius: 9,
                border: `1.5px solid ${actif ? ROUGE : th.line}`,
                background: actif ? `${ROUGE}0f` : th.panelAlt,
                color: th.text, cursor: 'pointer',
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: 7, fontWeight: 700, fontSize: 13 }}>
                {m.id === 'achat' ? <Car size={15} /> : <KeyRound size={15} />} {m.libelle}
              </div>
              <div style={{ fontSize: 11.5, color: th.textDim, marginTop: 5, lineHeight: 1.45 }}>{m.resume}</div>
            </button>
          );
        })}
      </div>
    </Carte>
  );
}

function Periode({ th, mode, calcul, maj, resultat }) {
  return (
    <Carte
      th={th}
      titre="Période de mise à disposition"
      aide={"Les périodes de 30 jours se calculent à partir de ces dates — c'est la règle de Revenu Québec, "
        + 'et ça évite d\'avoir à taper un nombre de mois à la main.'}
    >
      <div style={RANGEE}>
        <Champ th={th} etiquette="Du">
          <input type="date" value={calcul.date_debut || ''} className="gi-saisie"
            onChange={(e) => maj({ date_debut: e.target.value })}
            style={entree(th, mode, { requis: true, vide: estVide(calcul.date_debut) })} />
        </Champ>
        <Champ th={th} etiquette="Au">
          <input type="date" value={calcul.date_fin || ''} className="gi-saisie"
            onChange={(e) => maj({ date_fin: e.target.value })}
            style={entree(th, mode, { requis: true, vide: estVide(calcul.date_fin) })} />
        </Champ>
        <div style={{ flex: '1 1 160px', alignSelf: 'flex-end', paddingBottom: 2 }}>
          <div style={{ fontSize: 12, color: th.textDim }}>Ce que ça donne</div>
          <div style={{ fontSize: 13, fontWeight: 600, marginTop: 6 }}>
            {resultat.jours === null ? '—' : (
              <>{resultat.jours} jours → <span style={{ color: ROUGE }}>
                {Number.isInteger(resultat.periodes) ? resultat.periodes : resultat.periodes.toFixed(2)} période
                {resultat.periodes > 1 ? 's' : ''}
              </span></>
            )}
          </div>
        </div>
      </div>
    </Carte>
  );
}

function Kilometrage({ th, mode, calcul, maj, resultat }) {
  const auto = analyserNombre(calcul.odo_debut) !== null && analyserNombre(calcul.odo_fin) !== null;
  return (
    <Carte th={th} titre="Kilométrage">
      <div style={RANGEE}>
        <Champ th={th} etiquette="Odomètre au début">
          <EntreeNombre th={th} mode={mode} valeur={calcul.odo_debut}
            onValeur={(v) => maj({ odo_debut: v })} placeholder="31 781" />
        </Champ>
        <Champ th={th} etiquette="Odomètre à la fin">
          <EntreeNombre th={th} mode={mode} valeur={calcul.odo_fin}
            onValeur={(v) => maj({ odo_fin: v })} placeholder="50 126,9" />
        </Champ>
        <Champ
          th={th} etiquette="Total parcouru" suffixe="km"
          aide={auto ? "Calculé à partir des deux relevés." : 'À défaut des relevés, entre le total ici.'}
        >
          <EntreeNombre
            th={th} mode={mode}
            valeur={auto ? formaterSaisie(resultat.kmTotal ?? '') : calcul.km_total}
            onValeur={(v) => maj({ km_total: v })}
            inactif={auto}
            requis={!auto}
            style={{ ...entree(th, mode, { requis: !auto, vide: estVide(calcul.km_total), inactif: auto }), opacity: auto ? 0.65 : 1 }}
          />
        </Champ>
      </div>
      <div style={{ ...RANGEE, marginTop: 12 }}>
        <Champ th={th} etiquette="Kilométrage personnel" suffixe="km">
          <EntreeNombre th={th} mode={mode} valeur={calcul.km_personnel} requis
            onValeur={(v) => maj({ km_personnel: v })} placeholder="3 885,5" />
        </Champ>
        <div style={{ flex: '2 1 220px', alignSelf: 'flex-end', paddingBottom: 2 }}>
          <div style={{ fontSize: 12, color: th.textDim }}>Répartition</div>
          <div style={{ display: 'flex', gap: 16, marginTop: 6, fontSize: 13 }}>
            <span>Affaires <b style={{
              color: resultat.partAffaires !== null && resultat.partAffaires > 0.5 ? '#1a7f37' : th.avisTexte,
            }}>{formaterPourcent(resultat.partAffaires)}</b></span>
            <span style={{ color: th.textDim }}>Personnel {formaterPourcent(resultat.partPersonnelle)}</span>
          </div>
          <div style={{ fontSize: 11, color: th.textDim, marginTop: 4 }}>
            {resultat.kmAffaires === null ? '' : `${formaterKm(resultat.kmAffaires)} d'affaires`}
          </div>
        </div>
      </div>
    </Carte>
  );
}

function Vehicule({ th, mode, calcul, maj, m }) {
  if (m.id === 'achat') {
    return (
      <Carte th={th} titre="Le véhicule acheté">
        <div style={RANGEE}>
          <Champ th={th} etiquette="Coût du véhicule" suffixe="$, taxes incluses"
            aide="TPS et TVQ comprises. Sans l'équipement d'entreprise (radio, gyrophare…).">
            <EntreeNombre th={th} mode={mode} valeur={calcul.cout} requis
              onValeur={(v) => maj({ cout: v })} placeholder="127 139" />
          </Champ>
        </div>
      </Carte>
    );
  }
  return (
    <Carte th={th} titre="Le véhicule loué">
      <div style={RANGEE}>
        <Champ th={th} etiquette="Mensualité" suffixe="$, taxes incluses">
          <EntreeNombre th={th} mode={mode} valeur={calcul.mensualite} requis
            onValeur={(v) => maj({ mensualite: v })} placeholder="850" />
        </Champ>
        <Champ th={th} etiquette="Nombre de mensualités">
          <EntreeNombre th={th} mode={mode} valeur={calcul.mois_location} requis
            onValeur={(v) => maj({ mois_location: v })} placeholder="12" />
        </Champ>
        <Champ th={th} etiquette="Assurances par mois" suffixe="$"
          aide="Comprises dans la mensualité. Elles sortent du droit d'usage.">
          <EntreeNombre th={th} mode={mode} valeur={calcul.assurances}
            onValeur={(v) => maj({ assurances: v })} placeholder="0" />
        </Champ>
      </div>
    </Carte>
  );
}

function Conditions({ th, mode, calcul, maj, resultat }) {
  const casePied = { display: 'flex', gap: 9, alignItems: 'flex-start', fontSize: 13, cursor: 'pointer' };
  return (
    <Carte th={th} titre="Conditions et ajustements">
      <label style={casePied}>
        <input type="checkbox" checked={!!calcul.exige_par_employeur}
          onChange={(e) => maj({ exige_par_employeur: e.target.checked })} style={{ marginTop: 3 }} />
        <span>
          L'employeur <b>exige</b> que l'employé utilise le véhicule pour ses fonctions.
          <div style={{ fontSize: 11.5, color: th.textDim, marginTop: 3, lineHeight: 1.45 }}>
            C'est l'une des trois conditions du droit d'usage réduit. Sans elle, pas de réduction,
            même à 90 % d'affaires.
          </div>
        </span>
      </label>

      <label style={{ ...casePied, marginTop: 12 }}>
        <input type="checkbox" checked={!!calcul.vendeur_automobiles}
          onChange={(e) => maj({ vendeur_automobiles: e.target.checked })} style={{ marginTop: 3 }} />
        <span>
          L'emploi principal de cette personne est de <b>vendre ou louer des automobiles</b>.
          <div style={{ fontSize: 11.5, color: th.textDim, marginTop: 3, lineHeight: 1.45 }}>
            Taux réduits (1,5 % au lieu de 2 %, et {formaterTaux(resultat.taux?.fonctionnementVendeur)}/km).
            Ça ne s'applique à personne chez PEP — la case est là pour que la question ait une réponse.
          </div>
        </span>
      </label>

      <div style={{ marginTop: 16 }}>
        <div style={{ fontSize: 12, color: th.textDim, marginBottom: 6 }}>Méthode des frais de fonctionnement</div>
        <select value={calcul.methode_fonctionnement}
          onChange={(e) => maj({ methode_fonctionnement: e.target.value })} style={entree(th, mode)}>
          <option value="moindre">La moins élevée des deux (comme le chiffrier)</option>
          <option value="kilometrique">Toujours le taux au kilomètre</option>
          <option value="moitie">Toujours la moitié du droit d'usage</option>
        </select>
        <div style={{ fontSize: 11.5, color: th.textDim, marginTop: 5, lineHeight: 1.45 }}>
          La méthode de la moitié n'est ouverte qu'au-dessus de 50 % d'usage d'affaires, et l'employé
          doit en aviser l'employeur par écrit avant la fin de l'année.
        </div>
      </div>

      <div style={{ ...RANGEE, marginTop: 16 }}>
        <Champ th={th} etiquette="Remboursé par l'employé" suffixe="droit d'usage, $">
          <EntreeNombre th={th} mode={mode} valeur={calcul.rembourse_usage}
            onValeur={(v) => maj({ rembourse_usage: v })} placeholder="0" />
        </Champ>
        <Champ th={th} etiquette="Remboursé par l'employé" suffixe="frais de fonctionnement, $">
          <EntreeNombre th={th} mode={mode} valeur={calcul.rembourse_fonct}
            onValeur={(v) => maj({ rembourse_fonct: v })} placeholder="0" />
        </Champ>
      </div>

      <div style={{ marginTop: 14 }}>
        <Champ th={th} etiquette="Note interne" aide="Ne paraît pas au document remis.">
          <textarea value={calcul.note} onChange={(e) => maj({ note: e.target.value })} className="gi-saisie"
            rows={2} style={{ ...entree(th, mode), resize: 'vertical', fontFamily: 'inherit' }} />
        </Champ>
      </div>
    </Carte>
  );
}

// --- Le panneau de résultat -------------------------------------------------

function Resultat({ th, calcul, resultat: r, controle }) {
  const ligne = (etiquette, valeur, options = {}) => (
    <div style={{
      display: 'flex', justifyContent: 'space-between', gap: 12, alignItems: 'baseline',
      padding: '6px 0', fontSize: options.fort ? 14 : 13,
      fontWeight: options.fort ? 700 : 400,
      color: options.attenue ? th.textDim : th.text,
      borderTop: options.trait ? `1px solid ${th.line}` : 'none',
      marginTop: options.trait ? 6 : 0, paddingTop: options.trait ? 10 : 6,
    }}>
      <span style={{ lineHeight: 1.4 }}>{etiquette}</span>
      <span style={{ whiteSpace: 'nowrap', fontVariantNumeric: 'tabular-nums' }}>{valeur}</span>
    </div>
  );

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      <div style={{ background: th.panel, border: `1px solid ${th.line}`, borderRadius: 10, padding: 16 }}>
        <div style={{
          fontSize: 11, fontWeight: 700, letterSpacing: 0.5, textTransform: 'uppercase',
          color: th.textDim, marginBottom: 10,
        }}>Le calcul, étape par étape</div>

        {/* Droit d'usage */}
        <div style={{ fontSize: 11.5, fontWeight: 700, color: ROUGE, marginBottom: 2 }}>DROIT D'USAGE</div>
        {calcul.mode === 'achat'
          ? ligne(
            <>2 % × {formaterArgent(enCents(calcul.cout) ?? 0)} × {r.periodes === null ? '—'
              : (Number.isInteger(r.periodes) ? r.periodes : r.periodes.toFixed(2))} période{r.periodes > 1 ? 's' : ''}</>,
            formaterArgent(r.usageCompletCents), { attenue: true },
          )
          : ligne(
            <>⅔ × ({formaterArgent(r.coutLocationCents)} − {formaterArgent(r.assurancesTotalCents)} d'assurances)</>,
            formaterArgent(r.usageCompletCents), { attenue: true },
          )}

        {r.reductionAdmissible ? (
          <>
            {ligne(
              <>Réduit : {formaterKm(r.kmPersonnel)} ÷ (1 667 × {Number.isInteger(r.periodes) ? r.periodes : r.periodes.toFixed(2)})
                = {formaterPourcent(r.fractionReduction)}</>,
              '', { attenue: true },
            )}
            {ligne('Droit d\'usage réduit', formaterArgent(r.usageCents), { fort: true })}
          </>
        ) : (
          <div style={{
            fontSize: 11.5, color: th.avisTexte, background: th.avisBg,
            padding: '7px 10px', borderRadius: 6, margin: '6px 0', lineHeight: 1.45,
          }}>
            Pas de réduction — {!r.conditionExige ? "l'employeur n'exige pas l'usage du véhicule"
              : !r.conditionAffaires ? "l'usage d'affaires ne dépasse pas 50 %"
                : `les ${formaterKm(r.kmPersonnel)} personnels dépassent le plafond de ${formaterKm(r.plafondKmPersonnel)}`}.
          </div>
        )}
        {r.rembUsageCents > 0 && ligne(`Moins le remboursement de l'employé`,
          `− ${formaterArgent(r.rembUsageCents)}`, { attenue: true })}
        {ligne('Droit d\'usage retenu', formaterArgent(r.usageNetCents), { fort: true, trait: true })}

        {/* Frais de fonctionnement */}
        <div style={{ fontSize: 11.5, fontWeight: 700, color: ROUGE, margin: '14px 0 2px' }}>
          FRAIS DE FONCTIONNEMENT
        </div>
        {ligne(
          <>{formaterKm(r.kmPersonnel)} × {formaterTaux(r.tauxKm)}/km</>,
          formaterArgent(r.parKmCents),
          { attenue: r.methodeRetenue !== 'kilometrique' },
        )}
        {r.moitieCents !== null
          ? ligne('Ou la moitié du droit d\'usage', formaterArgent(r.moitieCents),
            { attenue: r.methodeRetenue !== 'moitie' })
          : ligne('La moitié du droit d\'usage n\'est pas ouverte (usage d\'affaires ≤ 50 %)', '', { attenue: true })}
        {r.rembFonctCents > 0 && ligne('Moins le remboursement de l\'employé',
          `− ${formaterArgent(r.rembFonctCents)}`, { attenue: true })}
        {ligne('Frais de fonctionnement retenus', formaterArgent(r.fonctNetCents), { fort: true, trait: true })}

        {/* Total */}
        <div style={{
          marginTop: 14, padding: '12px 14px', borderRadius: 8,
          background: `${ROUGE}0f`, border: `1px solid ${ROUGE}33`,
        }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 12 }}>
            <span style={{ fontSize: 12.5, fontWeight: 700 }}>AVANTAGE IMPOSABLE TOTAL</span>
            <span style={{ fontSize: 19, fontWeight: 800, color: ROUGE, fontVariantNumeric: 'tabular-nums' }}>
              {formaterArgent(r.totalCents)}
            </span>
          </div>
        </div>

        {/* Taxes */}
        <div style={{ fontSize: 11.5, fontWeight: 700, color: ROUGE, margin: '14px 0 2px' }}>
          TAXES À REMETTRE PAR L'EMPLOYEUR
        </div>
        {ligne('TPS', formaterArgent(r.tpsCents))}
        {ligne('TVQ', formaterArgent(r.tvqCents))}

        <div style={{
          marginTop: 12, paddingTop: 10, borderTop: `1px solid ${th.line}`,
          fontSize: 11.5, color: th.textDim, lineHeight: 1.5,
        }}>
          <Info size={12} style={{ verticalAlign: -1, marginRight: 4 }} />
          Cotisation à retenir sur l'avantage : RRQ seulement. Ni RQAP, ni assurance-emploi.
        </div>
        {r.taux && (
          <div style={{ fontSize: 11, color: th.textDim, marginTop: 6 }}>
            Taux {r.taux.annee} : {formaterTaux(r.taux.fonctionnement)}/km
            {r.taux.provenance === 'repli' && ' (valeur de secours — pas dans la table)'}
            {r.taux.provenance === 'inconnu' && ' — AUCUN TAUX CONNU'}
          </div>
        )}
      </div>

      {(controle.bloquants.length > 0 || controle.avertissements.length > 0) && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {controle.bloquants.map((b, i) => (
            <div key={`b${i}`} style={{
              background: th.errBg, color: th.errTexte, borderRadius: 7,
              padding: '9px 12px', fontSize: 12, lineHeight: 1.5,
              display: 'flex', gap: 8, alignItems: 'flex-start',
            }}>
              <AlertTriangle size={14} style={{ flexShrink: 0, marginTop: 2 }} /> {b}
            </div>
          ))}
          {controle.avertissements.map((a, i) => (
            <div key={`a${i}`} style={{
              background: th.avisBg, color: th.avisTexte, borderRadius: 7,
              padding: '9px 12px', fontSize: 12, lineHeight: 1.5,
              display: 'flex', gap: 8, alignItems: 'flex-start',
            }}>
              <Info size={14} style={{ flexShrink: 0, marginTop: 2 }} /> {a}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ============================================================================
// ONGLET — LES TAUX
// ============================================================================

function OngletTaux({ th, mode, rangees, onRecharger, avertir, nom }) {
  const [brouillon, setBrouillon] = useState({});
  const [enCours, setEnCours] = useState(false);

  async function sauver(annee) {
    const b = brouillon[annee] || {};
    const f = analyserNombre(b.fonctionnement);
    if (f === null) { avertir('Le taux au kilomètre est illisible.', 'err'); return; }
    const v = analyserNombre(b.fonctionnement_vendeur);
    setEnCours(true);
    const { error } = await supabaseGI.from('taux').upsert({
      annee: Number(annee),
      fonctionnement: f,
      fonctionnement_vendeur: v,
      note: b.note || null,
      maj_par: nom,
      maj_le: new Date().toISOString(),
    });
    setEnCours(false);
    if (error) { avertir(`Refusé : ${error.message}`, 'err'); return; }
    setBrouillon((x) => { const y = { ...x }; delete y[annee]; return y; });
    await onRecharger();
    avertir(`Taux ${annee} enregistré.`);
  }

  const anneesPossibles = [];
  for (let a = anneeCourante() + 1; a >= ANNEE_MIN; a--) anneesPossibles.push(a);
  const manquantes = anneesPossibles.filter((a) => !rangees.some((r) => r.annee === a));

  const cell = { padding: '10px 12px', fontSize: 13, borderBottom: `1px solid ${th.line}` };

  return (
    <div>
      <div style={{
        background: th.infoBg, borderRadius: 9, padding: '13px 15px', marginBottom: 14,
        fontSize: 12.5, lineHeight: 1.6, color: th.text,
      }}>
        Le montant prescrit au kilomètre change presque chaque année. L'app <b>refuse de calculer</b> une
        année absente de cette table plutôt que d'emprunter le taux d'une autre — un mauvais taux qui a
        l'air normal est pire qu'un calcul bloqué. Les autres constantes (2 % du coût, ⅔ du coût de
        location, 1 667 km par période, 4/104 et 9,975/109,975 pour les taxes) sont dans la loi et ne
        changent pas d'une année à l'autre : elles ne sont pas ici.
      </div>

      {manquantes.length > 0 && (
        <div style={{
          background: th.avisBg, color: th.avisTexte, borderRadius: 8,
          padding: '10px 13px', marginBottom: 14, fontSize: 12.5, lineHeight: 1.5,
        }}>
          Aucune valeur pour {manquantes.join(', ')}. Ajoute-la quand Revenu Québec la publie.
        </div>
      )}

      <div style={{ background: th.panel, border: `1px solid ${th.line}`, borderRadius: 10, overflow: 'hidden' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead>
            <tr style={{ background: th.panelAlt }}>
              {['Année', 'Frais de fonctionnement ($/km)', 'Vendeurs d\'autos ($/km)', 'Note', ''].map((h) => (
                <th key={h} style={{
                  ...cell, textAlign: 'left', fontSize: 11, color: th.textDim,
                  textTransform: 'uppercase', letterSpacing: 0.4, fontWeight: 600,
                }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {anneesPossibles.map((a) => {
              const r = rangees.find((x) => x.annee === a);
              const b = brouillon[a] || {
                fonctionnement: r ? r.fonctionnement : (TAUX_PAR_DEFAUT[a]?.fonctionnement ?? ''),
                fonctionnement_vendeur: r ? (r.fonctionnement_vendeur ?? '') : (TAUX_PAR_DEFAUT[a]?.fonctionnementVendeur ?? ''),
                note: r ? (r.note || '') : '',
              };
              const change = !!brouillon[a];
              const majB = (champs) => setBrouillon((x) => ({ ...x, [a]: { ...b, ...champs } }));
              return (
                <tr key={a}>
                  <td style={{ ...cell, fontWeight: 700, width: 70 }}>{a}</td>
                  <td style={{ ...cell, width: 190 }}>
                    <input value={b.fonctionnement} onChange={(e) => majB({ fonctionnement: e.target.value })}
                      className="gi-saisie" style={{ ...entree(th, mode), padding: '6px 9px' }} inputMode="decimal" />
                  </td>
                  <td style={{ ...cell, width: 170 }}>
                    <input value={b.fonctionnement_vendeur}
                      onChange={(e) => majB({ fonctionnement_vendeur: e.target.value })}
                      className="gi-saisie" style={{ ...entree(th, mode), padding: '6px 9px' }} inputMode="decimal" />
                  </td>
                  <td style={cell}>
                    <input value={b.note} onChange={(e) => majB({ note: e.target.value })}
                      placeholder={r ? '' : 'Pas encore enregistré'}
                      className="gi-saisie" style={{ ...entree(th, mode), padding: '6px 9px' }} />
                  </td>
                  <td style={{ ...cell, width: 110, textAlign: 'right' }}>
                    <button
                      onClick={() => sauver(a)} disabled={enCours || !change}
                      style={{
                        padding: '6px 12px', borderRadius: 6, fontSize: 12, fontWeight: 600,
                        border: 'none', cursor: change ? 'pointer' : 'not-allowed',
                        background: change ? ROUGE : th.line, color: change ? '#fff' : th.textDim,
                      }}
                    >{r ? 'Modifier' : 'Ajouter'}</button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <button
        onClick={onRecharger}
        style={{
          marginTop: 12, padding: '8px 15px', borderRadius: 7, fontSize: 12.5,
          border: `1px solid ${th.line}`, background: th.panel, color: th.text, cursor: 'pointer',
          display: 'flex', alignItems: 'center', gap: 6,
        }}
      ><RefreshCw size={14} /> Recharger</button>
    </div>
  );
}

// ============================================================================

export default function GainImposablePage() {
  const [session, setSession] = useState(null);
  if (!session) {
    return (
      <GardeConnexion
        appSlug="gain-imposable"
        nomApp="Gain imposable"
        onPret={setSession}
      />
    );
  }
  return <GainImposableApp userId={session.userId} nom={session.nom} poste={session.poste} />;
}
