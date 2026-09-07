import { useState, useEffect, useMemo, useRef } from 'react';
import Head from 'next/head';
import { createClient } from '@supabase/supabase-js';
import GardeConnexion from '../../components/commun/GardeConnexion';
import EnTeteApp from '../../components/commun/EnTeteApp';
import { PALETTES, useModePep } from '../../components/commun/ThemeToolbox';

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SUPABASE_ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
const supabaseLP = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, { db: { schema: 'liste_projets' } });

// Le bandeau, la porte d'entree et les deux palettes sont communs a toutes les
// apps du Toolbox. Ici la palette s'appelle « pal » : « th » est deja pris par
// le style des entetes de tableau, plus bas.


const RED = '#C41230';
// Logo déjà déployé et utilisé ailleurs dans le Toolbox (Planification
// hebdomadaire) — on réutilise le même fichier réel pour l'export PDF.
const LOGO_PEP = '/_static/planification-hebdomadaire/logo-pep.png';

function Center({ pal, children }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '80vh', gap: 12, fontFamily: 'Calibri, sans-serif', background: pal.bg, color: pal.text }}>
      {children}
    </div>
  );
}
function Spinner({ pal }) {
  return (
    <>
      <div style={{ border: `3px solid ${pal.line}`, borderTopColor: pal.accent, borderRadius: '50%', width: 28, height: 28, animation: 'spin 0.8s linear infinite' }} />
      <style jsx>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </>
  );
}

const btnSmall = { padding: '4px 10px', fontSize: 12 };

// Boutons, champs et cellules suivent le mode jour/nuit. Chaque composant
// appelle styles(pal) une fois et retrouve ses constantes habituelles.
function styles(pal) {
  const btn = { fontFamily: 'inherit', background: pal.btnBg, color: '#fff', border: 'none', borderRadius: 5, padding: '7px 14px', cursor: 'pointer', fontSize: 13, whiteSpace: 'nowrap' };
  return {
    btn,
    btnGhost: { ...btn, background: pal.panel, color: pal.accent, border: `1px solid ${pal.accent}` },
    btnDanger: { ...btn, background: RED },
    input: { padding: '7px 9px', borderRadius: 5, border: `1px solid ${pal.line}`, fontFamily: 'inherit', fontSize: 13, width: '100%', boxSizing: 'border-box', background: pal.inputBg, color: pal.text },
    th: {
      textAlign: 'left', padding: '7px 10px', color: '#fff', fontWeight: 600, fontSize: 11.5,
      cursor: 'pointer', userSelect: 'none', whiteSpace: 'nowrap', background: pal.btnBg,
      textTransform: 'uppercase', letterSpacing: '0.03em',
    },
    td: { padding: '6px 10px', verticalAlign: 'middle', fontSize: 13, borderBottom: `1px solid ${pal.line}`, whiteSpace: 'nowrap' },
  };
}

function ListeProjets({ userId, nom, poste }) {
  const [mode, setMode] = useModePep();
  const pal = PALETTES[mode];
  const { btn, btnGhost, btnDanger, input, th, td } = styles(pal);

  const [loading, setLoading] = useState(true);
  const [peutModifier, setPeutModifier] = useState(false);

  const [tab, setTab] = useState('projets');
  const [projets, setProjets] = useState([]);
  const [types, setTypes] = useState([]);
  const [personnel, setPersonnel] = useState([]);

  const [recherche, setRecherche] = useState('');
  const [filtreType, setFiltreType] = useState('');
  const [inclureEstimation, setInclureEstimation] = useState(false);
  const [voirArchives, setVoirArchives] = useState(false);
  const [triChamp, setTriChamp] = useState('no');
  const [triDir, setTriDir] = useState('desc');

  const [editProjet, setEditProjet] = useState(null);
  const [editPersonnel, setEditPersonnel] = useState(null);
  const [editType, setEditType] = useState(null);
  const [confirmSuppr, setConfirmSuppr] = useState(null);
  const [saving, setSaving] = useState(false);
  const [erreur, setErreur] = useState('');

  // --- Frozen (sticky) header + barre de contrôle -----------------------
  const headerRef = useRef(null);
  const barreRef = useRef(null);
  const [headerH, setHeaderH] = useState(0);
  const [barreH, setBarreH] = useState(0);

  useEffect(() => {
    function mesurer() {
      if (headerRef.current) setHeaderH(headerRef.current.offsetHeight);
      if (barreRef.current) setBarreH(barreRef.current.offsetHeight);
    }
    mesurer();
    window.addEventListener('resize', mesurer);
    return () => window.removeEventListener('resize', mesurer);
  }, [tab, erreur, peutModifier, loading]);

  async function chargerTout() {
    const [resProjets, resTypes, resPersonnel] = await Promise.all([
      supabaseLP.from('projets').select('*'),
      supabaseLP.from('types_projets').select('*'),
      supabaseLP.from('personnel').select('*').order('nom'),
    ]);
    const erreurs = [resProjets.error, resTypes.error, resPersonnel.error].filter(Boolean);
    if (erreurs.length > 0) {
      setErreur(
        'Erreur de chargement des données : ' +
        erreurs.map((e) => e.message).join(' | ') +
        ' — vérifie que le schéma "liste_projets" est bien exposé et que les GRANT sont faits dans Supabase.'
      );
    }
    setProjets(resProjets.data || []);
    setTypes(resTypes.data || []);
    setPersonnel(resPersonnel.data || []);
  }

  // GardeConnexion a deja verifie la session et l'acces a l'app. Reste le
  // droit de modifier, qui est propre a cette app.
  useEffect(() => {
    (async () => {
      const { data: roleRow } = await supabase
        .from('pep_user_roles').select('role').eq('user_id', userId).maybeSingle();
      const estAdmin = roleRow?.role === 'admin';

      const { data: featureRow } = await supabase
        .from('pep_user_features').select('feature_key')
        .eq('user_id', userId).eq('app_slug', 'liste-projets').eq('feature_key', 'modifier').maybeSingle();
      setPeutModifier(!!featureRow || estAdmin);

      await chargerTout();
      setLoading(false);
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userId]);

  function emailDe(nomPersonnel) {
    return personnel.find((p) => p.nom === nomPersonnel)?.courriel || null;
  }

  const projetsActifsAffiches = useMemo(() => {
    const q = recherche.trim().toLowerCase();
    let list = projets.filter((p) => {
      if (p.archive) return false;
      if (p.type_projet === 'estimation' && !inclureEstimation && !q && !filtreType) return false;
      if (filtreType && p.type_projet !== filtreType) return false;
      if (!q) return true;
      return [p.no, p.nom, p.client, p.charge, p.surintendant, p.contact_client_nom]
        .some((v) => (v || '').toString().toLowerCase().includes(q));
    });
    list = [...list].sort((a, b) => {
      const av = (a[triChamp] || '').toString();
      const bv = (b[triChamp] || '').toString();
      const cmp = av.localeCompare(bv, 'fr', { numeric: true });
      return triDir === 'asc' ? cmp : -cmp;
    });
    return list;
  }, [projets, recherche, filtreType, inclureEstimation, triChamp, triDir]);

  const projetsArchivesAffiches = useMemo(() => {
    const q = recherche.trim().toLowerCase();
    let list = projets.filter((p) => {
      if (!p.archive) return false;
      if (filtreType && p.type_projet !== filtreType) return false;
      if (!q) return true;
      return [p.no, p.nom, p.client, p.charge, p.surintendant, p.contact_client_nom]
        .some((v) => (v || '').toString().toLowerCase().includes(q));
    });
    return [...list].sort((a, b) => (a.no || '').localeCompare(b.no || '', 'fr', { numeric: true }));
  }, [projets, recherche, filtreType]);

  function trierPar(champ) {
    if (triChamp === champ) setTriDir((d) => (d === 'asc' ? 'desc' : 'asc'));
    else { setTriChamp(champ); setTriDir('asc'); }
  }

  async function archiverProjet(no) {
    setSaving(true);
    try {
      await supabaseLP.from('projets').update({ archive: true }).eq('no', no);
      await chargerTout();
    } catch (e) { setErreur(e.message); }
    setSaving(false);
  }
  async function desarchiverProjet(no) {
    setSaving(true);
    try {
      await supabaseLP.from('projets').update({ archive: false }).eq('no', no);
      await chargerTout();
    } catch (e) { setErreur(e.message); }
    setSaving(false);
  }

  // Charge le logo en base64 pour l'inclure dans les exports (PDF/Excel).
  // Si ça échoue (réseau, etc.), on continue l'export sans logo plutôt que
  // de faire échouer tout le téléchargement.
  async function chargerLogoBase64() {
    try {
      const resp = await fetch(LOGO_PEP);
      const blob = await resp.blob();
      return await new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(reader.result);
        reader.onerror = reject;
        reader.readAsDataURL(blob);
      });
    } catch (e) {
      return null;
    }
  }

  // Comme chargerLogoBase64, mais renvoie aussi les dimensions réelles du
  // logo pour pouvoir le redimensionner dans Excel en gardant ses
  // proportions (plutôt qu'une taille fixe qui déforme ou rapetisse l'image).
  async function chargerLogoInfo() {
    const dataUrl = await chargerLogoBase64();
    if (!dataUrl) return { dataUrl: null, width: null, height: null };
    const dims = await new Promise((resolve) => {
      const img = new window.Image();
      img.onload = () => resolve({ width: img.naturalWidth, height: img.naturalHeight });
      img.onerror = () => resolve({ width: null, height: null });
      img.src = dataUrl;
    });
    return { dataUrl, width: dims.width, height: dims.height };
  }

  function lignesExport() {
    return projetsActifsAffiches.map((p) => ({
      no: p.no,
      nom: p.nom,
      client: p.client || '',
      contactClient: [p.contact_client_nom, p.contact_client_courriel].filter(Boolean).join(' — '),
      type: types.find((t) => t.code === p.type_projet)?.label || '',
      charge: p.charge || '',
      surintendant: p.surintendant || '',
      contactInspection: p.contact_inspection || '',
      adresse: p.adresse || '',
    }));
  }

  async function exporterExcel() {
    setSaving(true); setErreur('');
    try {
      const ExcelJS = (await import('exceljs')).default;
      const logo = await chargerLogoInfo();
      const lignes = lignesExport();
      const colonnes = [
        { header: 'No', key: 'no', width: 10 },
        { header: 'Projet', key: 'nom', width: 30 },
        { header: 'Client', key: 'client', width: 22 },
        { header: 'Contact client', key: 'contactClient', width: 32 },
        { header: 'Type', key: 'type', width: 16 },
        { header: 'Chargé de projet', key: 'charge', width: 20 },
        { header: 'Surintendant', key: 'surintendant', width: 16 },
        { header: 'Contact inspection', key: 'contactInspection', width: 26 },
        { header: 'Adresse', key: 'adresse', width: 28 },
      ];
      const C = 1; // les donnees commencent en colonne A (No partage la colonne avec le logo, ligne 1)

      const wb = new ExcelJS.Workbook();
      const ws = wb.addWorksheet('Projets', { views: [{ state: 'frozen', ySplit: 3 }] });
      colonnes.forEach((c, i) => { ws.getColumn(C + i).width = c.width; });

      // Ligne 1 : logo en colonne A (voir plus bas), titre en colonne B a I
      ws.mergeCells(1, C + 1, 1, C + colonnes.length - 1);
      const titre = ws.getCell(1, C + 1);
      titre.value = 'Les Entreprises PEP2000 inc. — Liste des projets';
      titre.font = { bold: true, color: { argb: 'FFFFFFFF' }, size: 14, name: 'Calibri' };
      titre.alignment = { vertical: 'middle', horizontal: 'left' };
      for (let i = C; i <= C + colonnes.length - 1; i++) {
        ws.getCell(1, i).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF14213D' } };
      }
      const HAUTEUR_LIGNE_1 = 56; // en points
      ws.getRow(1).height = HAUTEUR_LIGNE_1;

      // Ligne 2 : sous-titre pleine largeur, de A a I
      ws.mergeCells(2, C, 2, C + colonnes.length - 1);
      const sousTitre = ws.getCell(2, C);
      sousTitre.value = `Généré le ${new Date().toLocaleDateString('fr-CA')} — ${lignes.length} projet(s)`;
      sousTitre.font = { italic: true, color: { argb: 'FF666666' }, size: 9, name: 'Calibri' };

      colonnes.forEach((c, i) => {
        const cell = ws.getCell(3, C + i);
        cell.value = c.header;
        cell.font = { bold: true, color: { argb: 'FFFFFFFF' }, name: 'Calibri' };
        cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF14213D' } };
      });

      lignes.forEach((p, idx) => {
        const rangee = 4 + idx;
        colonnes.forEach((c, i) => {
          const cell = ws.getCell(rangee, C + i);
          cell.value = p[c.key] || '';
          cell.font = { name: 'Calibri', size: 11 };
          if (idx % 2 === 1) {
            cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF7F8FA' } };
          }
        });
      });

      ws.autoFilter = { from: { row: 3, column: C }, to: { row: 3, column: C + colonnes.length - 1 } };

      if (logo.dataUrl) {
        const base64 = logo.dataUrl.split(',')[1];
        const imageId = wb.addImage({ base64, extension: 'png' });
        // Hauteur = pleine hauteur de la ligne 1 (conversion points -> pixels,
        // facteur standard 96/72), largeur calculee a partir des vraies
        // proportions du logo pour ne pas le deformer ni le laisser trop petit.
        const hauteurPx = HAUTEUR_LIGNE_1 * (96 / 72);
        const ratio = logo.width && logo.height ? logo.width / logo.height : 1;
        const largeurPx = hauteurPx * ratio;
        ws.addImage(imageId, { tl: { col: 0, row: 0 }, ext: { width: largeurPx, height: hauteurPx } });
      }

      const buffer = await wb.xlsx.writeBuffer();
      const blob = new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `liste-projets-${new Date().toISOString().slice(0, 10)}.xlsx`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 5000);
    } catch (e) {
      setErreur('Erreur export Excel : ' + e.message);
    }
    setSaving(false);
  }

  async function exporterPDF() {
    setSaving(true); setErreur('');
    try {
      const { pdf, Document, Page, View, Text, StyleSheet, Image, Font } = await import('@react-pdf/renderer');
      const logoDataUrl = await chargerLogoBase64();
      const lignes = lignesExport();

      const colonnes = [
        { label: 'No', key: 'no', width: '7%' },
        { label: 'Projet', key: 'nom', width: '19%' },
        { label: 'Client', key: 'client', width: '13%' },
        { label: 'Contact client', key: 'contactClient', width: '17%' },
        { label: 'Type', key: 'type', width: '10%' },
        { label: 'Chargé', key: 'charge', width: '11%' },
        { label: 'Surintendant', key: 'surintendant', width: '11%' },
        { label: 'Contact inspection', key: 'contactInspection', width: '12%' },
      ];

      const styles = StyleSheet.create({
        page: { paddingTop: 10, paddingBottom: 24, paddingHorizontal: 20, fontSize: 8 },
        headerBar: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#14213D', padding: 8, marginBottom: 8 },
        logo: { width: 26, height: 26, marginRight: 8 },
        titre: { color: '#ffffff', fontSize: 12, fontWeight: 700 },
        sousTitre: { color: '#B9C2CC', fontSize: 8, marginLeft: 'auto' },
        row: { flexDirection: 'row' },
        th: { backgroundColor: '#14213D', color: '#ffffff', padding: 4, fontSize: 7, fontWeight: 700 },
        td: { padding: 4, fontSize: 7, borderBottomWidth: 0.5, borderBottomColor: '#EDEFF1' },
        pied: { position: 'absolute', bottom: 10, left: 20, right: 20, fontSize: 7, color: '#8a93a0', textAlign: 'center' },
      });

      const Doc = (
        <Document>
          <Page size="A4" orientation="landscape" style={styles.page} wrap>
            <View style={styles.headerBar} fixed>
              {logoDataUrl && <Image style={styles.logo} src={logoDataUrl} />}
              <Text style={styles.titre}>Les Entreprises PEP2000 inc. — Liste des projets</Text>
              <Text style={styles.sousTitre}>{new Date().toLocaleDateString('fr-CA')} — {lignes.length} projet(s)</Text>
            </View>
            <View style={styles.row} fixed>
              {colonnes.map((c) => <Text key={c.key} style={[styles.th, { width: c.width }]}>{c.label}</Text>)}
            </View>
            {lignes.map((p, i) => (
              <View key={p.no} style={[styles.row, { backgroundColor: i % 2 === 0 ? '#ffffff' : '#FAFBFC' }]} wrap={false}>
                {colonnes.map((c) => <Text key={c.key} style={[styles.td, { width: c.width }]}>{p[c.key] || ''}</Text>)}
              </View>
            ))}
            <Text style={styles.pied} render={({ pageNumber, totalPages }) => `Page ${pageNumber} / ${totalPages}`} fixed />
          </Page>
        </Document>
      );

      const blob = await pdf(Doc).toBlob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `liste-projets-${new Date().toISOString().slice(0, 10)}.pdf`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 5000);
    } catch (e) {
      setErreur('Erreur export PDF : ' + e.message);
    }
    setSaving(false);
  }

  async function sauvegarderProjet(form) {
    setSaving(true); setErreur('');
    try {
      const payload = {
        no: form.no.trim(),
        nom: form.nom.trim(),
        client: form.client || null,
        charge: form.charge || null,
        courriel_cp: emailDe(form.charge),
        surintendant: form.surintendant || null,
        type_projet: form.type_projet || null,
        contact_client_nom: form.contact_client_nom || null,
        contact_client_courriel: form.contact_client_courriel || null,
        contact_inspection: form.contact_inspection || null,
        adresse: form.adresse || null,
        updated_at: new Date().toISOString(),
      };
      const { error } = await supabaseLP.from('projets').upsert(payload);
      if (error) throw error;
      setEditProjet(null);
      await chargerTout();
    } catch (e) {
      setErreur(e.message);
    }
    setSaving(false);
  }

  async function supprimerProjet(no) {
    setSaving(true);
    try {
      await supabaseLP.from('projets').delete().eq('no', no);
      setConfirmSuppr(null);
      await chargerTout();
    } catch (e) {
      setErreur(e.message);
    }
    setSaving(false);
  }

  async function sauvegarderPersonnel(form) {
    setSaving(true); setErreur('');
    try {
      const payload = { nom: form.nom.trim(), courriel: form.courriel || null, actif: !!form.actif };
      if (form._ancienNom && form._ancienNom !== payload.nom) {
        await supabaseLP.from('personnel').update({ nom: payload.nom }).eq('nom', form._ancienNom);
        await supabaseLP.from('projets').update({ charge: payload.nom }).eq('charge', form._ancienNom);
        await supabaseLP.from('projets').update({ surintendant: payload.nom }).eq('surintendant', form._ancienNom);
        await supabaseLP.from('types_projets').update({ charge: payload.nom }).eq('charge', form._ancienNom);
        await supabaseLP.from('personnel').update({ courriel: payload.courriel, actif: payload.actif }).eq('nom', payload.nom);
      } else {
        const { error } = await supabaseLP.from('personnel').upsert(payload, { onConflict: 'nom' });
        if (error) throw error;
      }
      setEditPersonnel(null);
      await chargerTout();
    } catch (e) {
      setErreur(e.message);
    }
    setSaving(false);
  }

  async function supprimerPersonnel(nom) {
    setSaving(true);
    try {
      const { error } = await supabaseLP.from('personnel').delete().eq('nom', nom);
      if (error) throw error;
      setConfirmSuppr(null);
      await chargerTout();
    } catch (e) {
      setErreur(`Impossible de supprimer: ${e.message} (cette personne est peut-être encore assignée à un projet — retire-la d'abord des projets concernés, ou décoche "Actif" plutôt que de la supprimer)`);
    }
    setSaving(false);
  }

  async function sauvegarderType(form) {
    setSaving(true); setErreur('');
    try {
      const payload = { code: form.code.trim(), label: form.label.trim(), client: form.client || null, charge: form.charge || null, courriel_cp: emailDe(form.charge) };
      const { error } = await supabaseLP.from('types_projets').upsert(payload);
      if (error) throw error;
      setEditType(null);
      await chargerTout();
    } catch (e) {
      setErreur(e.message);
    }
    setSaving(false);
  }

  async function supprimerType(code) {
    setSaving(true);
    try {
      await supabaseLP.from('types_projets').delete().eq('code', code);
      setConfirmSuppr(null);
      await chargerTout();
    } catch (e) {
      setErreur(e.message);
    }
    setSaving(false);
  }

  if (loading) return <Center pal={pal}><Spinner pal={pal} /><p>Chargement...</p></Center>;

  return (
    <div style={{ fontFamily: 'Calibri, Segoe UI, sans-serif', background: pal.bg, minHeight: '100vh', color: pal.text }}>
      <Head><title>Liste des projets - Toolbox PEP</title></Head>

      {/* Le bandeau commun reste figé en haut : le tableau est long, et la
          barre d'outils se colle juste en dessous. */}
      <div ref={headerRef} style={{ position: 'sticky', top: 0, zIndex: 60 }}>
        <EnTeteApp
          titre="Liste des projets"
          sousTitre="Projets, types de projet et personnel"
          mode={mode}
          onChangerMode={setMode}
          nom={nom}
          poste={poste}
          onAccueil={() => { setTab('projets'); setRecherche(''); setFiltreType(''); setVoirArchives(false); }}
        />
      </div>

      <main style={{ maxWidth: 1300, margin: '0 auto', padding: '0 16px 60px' }}>
        {/* Barre de contrôle (onglets + erreur + recherche/filtre) — figée juste sous l'en-tête */}
        <div
          ref={barreRef}
         
          style={{ position: 'sticky', top: headerH, zIndex: 55, background: pal.bg, paddingTop: 16, paddingBottom: tab === 'projets' ? 0 : 12 }}
        >
          <div style={{ display: 'flex', gap: 8, marginBottom: 12, flexWrap: 'wrap', alignItems: 'center' }}>
            {[['projets', `Projets (${projets.length})`], ['types', `Types de projet (${types.length})`], ['personnel', `Personnel (${personnel.length})`]].map(([key, label]) => (
              <button key={key} onClick={() => setTab(key)} style={tab === key ? btn : btnGhost}>{label}</button>
            ))}
            {!peutModifier && (
              <span style={{ marginLeft: 'auto', fontSize: 12, color: pal.textDim }}>Lecture seule</span>
            )}
          </div>

          {erreur && (
            <div style={{ background: pal.errBg, border: `1px solid ${RED}`, color: pal.errTexte, padding: '10px 14px', borderRadius: 6, marginBottom: 12, fontSize: 13.5 }}>
              {erreur} <button onClick={() => setErreur('')} style={{ ...btnGhost, ...btnSmall, marginLeft: 10 }}>Fermer</button>
            </div>
          )}

          {tab === 'projets' && (
            <div style={{ background: pal.panel, borderRadius: '8px 8px 0 0', display: 'flex', gap: 10, padding: '14px 16px', alignItems: 'center', flexWrap: 'wrap', borderBottom: `1px solid ${pal.line}` }}>
              <input
                type="text" placeholder="Rechercher (numéro, nom, client, chargé, surintendant)..."
                value={recherche} onChange={(e) => setRecherche(e.target.value)}
                style={{ ...input, maxWidth: 320 }}
              />
              <select value={filtreType} onChange={(e) => setFiltreType(e.target.value)} style={{ ...input, width: 'auto', maxWidth: 200 }}>
                <option value="">Tous les types</option>
                {types.map((t) => <option key={t.code} value={t.code}>{t.label}</option>)}
              </select>
              <label style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 12.5, color: pal.text, whiteSpace: 'nowrap' }}>
                <input type="checkbox" checked={inclureEstimation} onChange={(e) => setInclureEstimation(e.target.checked)} />
                Inclure les projets en estimation
              </label>
              <div style={{ marginLeft: 'auto', display: 'flex', gap: 8 }}>
                <button style={btnGhost} onClick={exporterExcel} disabled={saving}>Exporter Excel</button>
                <button style={btnGhost} onClick={exporterPDF} disabled={saving}>Exporter PDF</button>
                {peutModifier && (
                  <button
                    style={btn}
                    onClick={() => setEditProjet({ no: '', nom: '', client: '', charge: '', surintendant: '', type_projet: '', contact_client_nom: '', contact_client_courriel: '', contact_inspection: '', adresse: '' })}
                  >+ Nouveau projet</button>
                )}
              </div>
            </div>
          )}
        </div>

        {tab === 'projets' && (
          <>
            <div style={{ background: pal.panel, borderRadius: '0 0 8px 8px', overflow: 'hidden', boxShadow: pal.ombre }}>
            <div style={{ overflow: 'auto', maxHeight: `calc(100vh - ${headerH + barreH + 20}px)` }}>
              <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                <thead>
                  <tr>
                    <th style={{ ...th, position: 'sticky', top: 0, zIndex: 40 }} onClick={() => trierPar('no')}>No {triChamp === 'no' ? (triDir === 'asc' ? '▲' : '▼') : ''}</th>
                    <th style={{ ...th, position: 'sticky', top: 0, zIndex: 40 }} onClick={() => trierPar('nom')}>Projet {triChamp === 'nom' ? (triDir === 'asc' ? '▲' : '▼') : ''}</th>
                    <th style={{ ...th, position: 'sticky', top: 0, zIndex: 40 }} onClick={() => trierPar('client')}>Client</th>
                    <th style={{ ...th, position: 'sticky', top: 0, zIndex: 40 }}>Contact client</th>
                    <th style={{ ...th, position: 'sticky', top: 0, zIndex: 40 }}>Type</th>
                    <th style={{ ...th, position: 'sticky', top: 0, zIndex: 40 }} onClick={() => trierPar('charge')}>Chargé</th>
                    <th style={{ ...th, position: 'sticky', top: 0, zIndex: 40 }} onClick={() => trierPar('surintendant')}>Surintendant</th>
                    <th style={{ ...th, position: 'sticky', top: 0, zIndex: 40 }}>Contact inspection</th>
                    {peutModifier && <th style={{ ...th, position: 'sticky', top: 0, zIndex: 40, cursor: 'default' }} />}
                  </tr>
                </thead>
                <tbody>
                  {projetsActifsAffiches.length === 0 && (
                    <tr><td style={{ ...td, whiteSpace: 'normal' }} colSpan={peutModifier ? 9 : 8}>Aucun projet trouvé.</td></tr>
                  )}
                  {projetsActifsAffiches.map((p, i) => (
                    <tr key={p.no} style={{ background: i % 2 === 0 ? pal.panel : pal.panelAlt }}>
                      <td style={{ ...td, fontWeight: 700, color: pal.accent }}>{p.no}</td>
                      <td style={{ ...td, whiteSpace: 'normal', minWidth: 160 }}>{p.nom}</td>
                      <td style={{ ...td, whiteSpace: 'normal' }}>{p.client || '—'}</td>
                      <td style={{ ...td, whiteSpace: 'normal' }}>
                        {p.contact_client_nom || '—'}
                        {p.contact_client_courriel && <span style={{ color: pal.textDim }}> · {p.contact_client_courriel}</span>}
                      </td>
                      <td style={{ ...td, whiteSpace: 'normal' }}>{types.find((t) => t.code === p.type_projet)?.label || '—'}</td>
                      <td style={td}>{p.charge || '—'}</td>
                      <td style={td}>{p.surintendant || '—'}</td>
                      <td style={{ ...td, whiteSpace: 'normal' }}>{p.contact_inspection || '—'}</td>
                      {peutModifier && (
                        <td style={td}>
                          <button style={{ ...btnGhost, ...btnSmall, marginRight: 6 }} onClick={() => setEditProjet({ ...p, type_projet: p.type_projet || '' })}>Modifier</button>
                          <button style={{ ...btnGhost, ...btnSmall, marginRight: 6 }} onClick={() => archiverProjet(p.no)} disabled={saving}>Archiver</button>
                          <button style={{ ...btnDanger, ...btnSmall }} onClick={() => setConfirmSuppr({ type: 'projet', id: p.no, label: `${p.no} — ${p.nom}` })}>Suppr.</button>
                        </td>
                      )}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

            <div style={{ marginTop: 20 }}>
              <button style={btnGhost} onClick={() => setVoirArchives((v) => !v)}>
                {voirArchives ? 'Masquer' : 'Afficher'} les projets archivés ({projetsArchivesAffiches.length})
              </button>
              {voirArchives && (
                <div style={{ background: pal.panel, borderRadius: 8, overflow: 'hidden', boxShadow: pal.ombre, marginTop: 10 }}>
                  <div style={{ overflowX: 'auto' }}>
                    <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                      <thead>
                        <tr>
                          <th style={th}>No</th>
                          <th style={th}>Projet</th>
                          <th style={th}>Client</th>
                          <th style={th}>Type</th>
                          <th style={th}>Chargé</th>
                          <th style={th}>Surintendant</th>
                          {peutModifier && <th style={th} />}
                        </tr>
                      </thead>
                      <tbody>
                        {projetsArchivesAffiches.length === 0 && (
                          <tr><td style={{ ...td, whiteSpace: 'normal' }} colSpan={peutModifier ? 7 : 6}>Aucun projet archivé.</td></tr>
                        )}
                        {projetsArchivesAffiches.map((p, i) => (
                          <tr key={p.no} style={{ background: i % 2 === 0 ? pal.panel : pal.panelAlt, color: pal.textDim }}>
                            <td style={{ ...td, fontWeight: 700 }}>{p.no}</td>
                            <td style={{ ...td, whiteSpace: 'normal' }}>{p.nom}</td>
                            <td style={{ ...td, whiteSpace: 'normal' }}>{p.client || '—'}</td>
                            <td style={{ ...td, whiteSpace: 'normal' }}>{types.find((t) => t.code === p.type_projet)?.label || '—'}</td>
                            <td style={td}>{p.charge || '—'}</td>
                            <td style={td}>{p.surintendant || '—'}</td>
                            {peutModifier && (
                              <td style={td}>
                                <button style={{ ...btnGhost, ...btnSmall, marginRight: 6 }} onClick={() => desarchiverProjet(p.no)} disabled={saving}>Désarchiver</button>
                                <button style={{ ...btnDanger, ...btnSmall }} onClick={() => setConfirmSuppr({ type: 'projet', id: p.no, label: `${p.no} — ${p.nom}` })}>Suppr.</button>
                              </td>
                            )}
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}
            </div>
          </>
        )}

        {tab === 'types' && (
          <div style={{ background: pal.panel, borderRadius: 8, padding: 20, boxShadow: pal.ombre }}>
            <p style={{ fontSize: 13, color: pal.textDim, marginTop: 0 }}>
              Catégories utilisées soit comme travail interne sans numéro de projet, soit comme classification (« type ») attachable à n&apos;importe quel projet numéroté.
            </p>
            <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 14 }}>
              {peutModifier && (
                <button style={btn} onClick={() => setEditType({ code: '', label: '', client: '', charge: '' })}>+ Nouveau type</button>
              )}
            </div>
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead>
                <tr>
                  <th style={th}>Nom</th><th style={th}>Client</th><th style={th}>Chargé de projet</th>
                  {peutModifier && <th style={th} />}
                </tr>
              </thead>
              <tbody>
                {types.map((t, i) => (
                  <tr key={t.code} style={{ background: i % 2 === 0 ? pal.panel : pal.panelAlt }}>
                    <td style={{ ...td, whiteSpace: 'normal' }}>{t.label}</td>
                    <td style={{ ...td, whiteSpace: 'normal' }}>{t.client || '—'}</td>
                    <td style={td}>{t.charge || '—'}</td>
                    {peutModifier && (
                      <td style={td}>
                        <button style={{ ...btnGhost, ...btnSmall, marginRight: 6 }} onClick={() => setEditType({ ...t })}>Modifier</button>
                        <button style={{ ...btnDanger, ...btnSmall }} onClick={() => setConfirmSuppr({ type: 'type', id: t.code, label: t.label })}>Suppr.</button>
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {tab === 'personnel' && (
          <div style={{ background: pal.panel, borderRadius: 8, padding: 20, boxShadow: pal.ombre }}>
            <p style={{ fontSize: 13, color: pal.textDim, marginTop: 0 }}>
              Liste unique utilisée à la fois pour « Chargé de projet » et « Surintendant » — c&apos;est aussi ici que sont gérés les courriels internes (jamais affichés dans la liste des projets).
            </p>
            <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 14 }}>
              {peutModifier && (
                <button style={btn} onClick={() => setEditPersonnel({ nom: '', courriel: '', actif: true, _ancienNom: '' })}>+ Nouvelle personne</button>
              )}
            </div>
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead>
                <tr>
                  <th style={th}>Nom</th><th style={th}>Courriel</th><th style={th}>Statut</th>
                  {peutModifier && <th style={th} />}
                </tr>
              </thead>
              <tbody>
                {personnel.map((p, i) => (
                  <tr key={p.nom} style={{ background: i % 2 === 0 ? pal.panel : pal.panelAlt }}>
                    <td style={td}>{p.nom}</td>
                    <td style={td}>{p.courriel || '—'}</td>
                    <td style={td}><span style={{ color: p.actif ? pal.okLigne : pal.textDim, fontWeight: 600 }}>&#9679; {p.actif ? 'Actif' : 'Inactif'}</span></td>
                    {peutModifier && (
                      <td style={td}>
                        <button style={{ ...btnGhost, ...btnSmall, marginRight: 6 }} onClick={() => setEditPersonnel({ ...p, _ancienNom: p.nom })}>Modifier</button>
                        <button style={{ ...btnDanger, ...btnSmall }} onClick={() => setConfirmSuppr({ type: 'personnel', id: p.nom, label: p.nom })}>Suppr.</button>
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </main>

      {editProjet && (
        <ModalProjet
          pal={pal}
          projet={editProjet} personnel={personnel} types={types} emailDe={emailDe}
          onSave={sauvegarderProjet} onCancel={() => setEditProjet(null)} saving={saving}
        />
      )}
      {editPersonnel && (
        <ModalPersonnel pal={pal} personne={editPersonnel} onSave={sauvegarderPersonnel} onCancel={() => setEditPersonnel(null)} saving={saving} />
      )}
      {editType && (
        <ModalType pal={pal} type={editType} personnel={personnel} onSave={sauvegarderType} onCancel={() => setEditType(null)} saving={saving} />
      )}
      {confirmSuppr && (
        <ModalConfirm
          pal={pal}
          message={`Supprimer définitivement "${confirmSuppr.label}" ?`}
          saving={saving}
          onCancel={() => setConfirmSuppr(null)}
          onConfirm={() => {
            if (confirmSuppr.type === 'projet') supprimerProjet(confirmSuppr.id);
            else if (confirmSuppr.type === 'personnel') supprimerPersonnel(confirmSuppr.id);
            else supprimerType(confirmSuppr.id);
          }}
        />
      )}

    </div>
  );
}

export default function Page() {
  const [session, setSession] = useState(null);
  if (!session) {
    return <GardeConnexion appSlug="liste-projets" nomApp="Liste des projets" onPret={setSession} />;
  }
  return <ListeProjets userId={session.userId} nom={session.nom} poste={session.poste} />;
}

function Overlay({ pal, children, width = 460 }) {
  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(15,33,56,0.6)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000, padding: 20 }}>
      <div style={{ width: '100%', maxWidth: width, background: pal.panel, color: pal.text, borderRadius: 8, padding: 24, fontFamily: 'Calibri, sans-serif', maxHeight: '90vh', overflowY: 'auto', boxShadow: pal.ombre }}>
        {children}
      </div>
    </div>
  );
}
function Champ({ pal, label, children }) {
  return (
    <div style={{ marginBottom: 12 }}>
      <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: pal.textDim, marginBottom: 4 }}>{label}</label>
      {children}
    </div>
  );
}

function ModalProjet({ pal, projet, personnel, types, emailDe, onSave, onCancel, saving }) {
  const { btn, btnGhost, input } = styles(pal);
  const [form, setForm] = useState(projet);
  const estNouveau = !projet.no;
  const courrielApercu = form.charge ? emailDe(form.charge) : null;

  return (
    <Overlay pal={pal} width={520}>
      <h3 style={{ marginTop: 0, color: pal.accent }}>{estNouveau ? 'Nouveau projet' : `Modifier ${projet.no}`}</h3>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0 14px' }}>
        <Champ pal={pal} label="Numéro de projet *">
          <input style={input} value={form.no} disabled={!estNouveau} onChange={(e) => setForm({ ...form, no: e.target.value })} placeholder="ex: 26-201" />
        </Champ>
        <Champ pal={pal} label="Type de projet">
          <select style={input} value={form.type_projet || ''} onChange={(e) => setForm({ ...form, type_projet: e.target.value })}>
            <option value="">—</option>
            {types.map((t) => <option key={t.code} value={t.code}>{t.label}</option>)}
          </select>
        </Champ>
      </div>
      <Champ pal={pal} label="Nom du projet *">
        <input style={input} value={form.nom} onChange={(e) => setForm({ ...form, nom: e.target.value })} />
      </Champ>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0 14px' }}>
        <Champ pal={pal} label="Client (compagnie)">
          <input style={input} value={form.client || ''} onChange={(e) => setForm({ ...form, client: e.target.value })} />
        </Champ>
        <Champ pal={pal} label="Nom du contact client">
          <input style={input} value={form.contact_client_nom || ''} onChange={(e) => setForm({ ...form, contact_client_nom: e.target.value })} />
        </Champ>
      </div>
      <Champ pal={pal} label="Courriel du contact client">
        <input style={input} value={form.contact_client_courriel || ''} onChange={(e) => setForm({ ...form, contact_client_courriel: e.target.value })} />
      </Champ>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0 14px' }}>
        <Champ pal={pal} label="Chargé de projet">
          <select style={input} value={form.charge || ''} onChange={(e) => setForm({ ...form, charge: e.target.value })}>
            <option value="">—</option>
            {personnel.map((p) => <option key={p.nom} value={p.nom}>{p.nom}{!p.actif ? ' (inactif)' : ''}</option>)}
          </select>
          {courrielApercu && <div style={{ fontSize: 11, color: pal.textDim, marginTop: 3 }}>Courriel lié : {courrielApercu}</div>}
        </Champ>
        <Champ pal={pal} label="Surintendant">
          <select style={input} value={form.surintendant || ''} onChange={(e) => setForm({ ...form, surintendant: e.target.value })}>
            <option value="">—</option>
            {personnel.map((p) => <option key={p.nom} value={p.nom}>{p.nom}{!p.actif ? ' (inactif)' : ''}</option>)}
          </select>
        </Champ>
      </div>
      <Champ pal={pal} label="Contact inspection (sécurité — inspections de machinerie)">
        <input style={input} value={form.contact_inspection || ''} onChange={(e) => setForm({ ...form, contact_inspection: e.target.value })} />
      </Champ>
      <Champ pal={pal} label="Adresse du projet">
        <input style={input} value={form.adresse || ''} onChange={(e) => setForm({ ...form, adresse: e.target.value })} />
      </Champ>
      <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end', marginTop: 18 }}>
        <button style={btnGhost} onClick={onCancel} disabled={saving}>Annuler</button>
        <button style={btn} disabled={saving || !form.no.trim() || !form.nom.trim()} onClick={() => onSave(form)}>{saving ? 'Enregistrement...' : 'Enregistrer'}</button>
      </div>
    </Overlay>
  );
}

function ModalPersonnel({ pal, personne, onSave, onCancel, saving }) {
  const { btn, btnGhost, input } = styles(pal);
  const [form, setForm] = useState(personne);
  return (
    <Overlay pal={pal} width={380}>
      <h3 style={{ marginTop: 0, color: pal.accent }}>{form._ancienNom ? `Modifier ${form._ancienNom}` : 'Nouvelle personne'}</h3>
      <Champ pal={pal} label="Nom complet *">
        <input style={input} value={form.nom} onChange={(e) => setForm({ ...form, nom: e.target.value })} />
      </Champ>
      <Champ pal={pal} label="Courriel">
        <input style={input} value={form.courriel || ''} onChange={(e) => setForm({ ...form, courriel: e.target.value })} />
      </Champ>
      <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 13, marginBottom: 8 }}>
        <input type="checkbox" checked={!!form.actif} onChange={(e) => setForm({ ...form, actif: e.target.checked })} />
        Actif (apparaît dans les listes déroulantes)
      </label>
      <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end', marginTop: 18 }}>
        <button style={btnGhost} onClick={onCancel} disabled={saving}>Annuler</button>
        <button style={btn} disabled={saving || !form.nom.trim()} onClick={() => onSave(form)}>{saving ? 'Enregistrement...' : 'Enregistrer'}</button>
      </div>
    </Overlay>
  );
}

function ModalType({ pal, type, personnel, onSave, onCancel, saving }) {
  const { btn, btnGhost, input } = styles(pal);
  const [form, setForm] = useState(type);
  const estNouveau = !type.code;
  return (
    <Overlay pal={pal} width={380}>
      <h3 style={{ marginTop: 0, color: pal.accent }}>{estNouveau ? 'Nouveau type de projet' : `Modifier ${type.label}`}</h3>
      {estNouveau && (
        <Champ pal={pal} label="Code (identifiant unique, sans espace) *">
          <input style={input} value={form.code} onChange={(e) => setForm({ ...form, code: e.target.value.toLowerCase().replace(/[^a-z0-9_]/g, '_') })} placeholder="ex: transport" />
        </Champ>
      )}
      <Champ pal={pal} label="Nom affiché *">
        <input style={input} value={form.label} onChange={(e) => setForm({ ...form, label: e.target.value })} />
      </Champ>
      <Champ pal={pal} label="Client (si utilisé comme travail interne sans numéro)">
        <input style={input} value={form.client || ''} onChange={(e) => setForm({ ...form, client: e.target.value })} />
      </Champ>
      <Champ pal={pal} label="Chargé de projet (si utilisé comme travail interne sans numéro)">
        <select style={input} value={form.charge || ''} onChange={(e) => setForm({ ...form, charge: e.target.value })}>
          <option value="">—</option>
          {personnel.map((p) => <option key={p.nom} value={p.nom}>{p.nom}</option>)}
        </select>
      </Champ>
      <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end', marginTop: 18 }}>
        <button style={btnGhost} onClick={onCancel} disabled={saving}>Annuler</button>
        <button style={btn} disabled={saving || !form.code.trim() || !form.label.trim()} onClick={() => onSave(form)}>{saving ? 'Enregistrement...' : 'Enregistrer'}</button>
      </div>
    </Overlay>
  );
}

function ModalConfirm({ pal, message, onConfirm, onCancel, saving }) {
  const { btnGhost, btnDanger } = styles(pal);
  return (
    <Overlay pal={pal} width={380}>
      <p style={{ fontSize: 14.5 }}>{message}</p>
      <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
        <button style={btnGhost} onClick={onCancel} disabled={saving}>Annuler</button>
        <button style={btnDanger} onClick={onConfirm} disabled={saving}>{saving ? 'Suppression...' : 'Supprimer'}</button>
      </div>
    </Overlay>
  );
}
