import { useState, useEffect, useMemo } from 'react';
import Head from 'next/head';
import { createClient } from '@supabase/supabase-js';
import GardeConnexion from '../../components/commun/GardeConnexion';
import EnTeteApp from '../../components/commun/EnTeteApp';
import { PALETTES, useModePep } from '../../components/commun/ThemeToolbox';

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SUPABASE_ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
const supabasePers = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, { db: { schema: 'personnel' } });

const RED = '#C41230';
const TELEPHONE_PRINCIPAL = '450-661-5050';
const SANS_DEPARTEMENT = 'Sans département';

// Les boutons, champs et cellules changent de couleur avec le mode jour/nuit.
// Chaque composant appelle styles(th) une fois et retrouve ses constantes
// habituelles — les centaines de style={btn} du fichier restent inchangees.
const btnSmall = { padding: '4px 10px', fontSize: 12 };

function styles(th) {
  const btn = { fontFamily: 'inherit', background: th.btnBg, color: '#fff', border: 'none', borderRadius: 5, padding: '7px 14px', cursor: 'pointer', fontSize: 13, whiteSpace: 'nowrap' };
  return {
    btn,
    btnGhost: { ...btn, background: th.panel, color: th.accent, border: `1px solid ${th.accent}` },
    btnDanger: { ...btn, background: RED },
    input: { padding: '7px 9px', borderRadius: 5, border: `1px solid ${th.line}`, fontFamily: 'inherit', fontSize: 13, width: '100%', boxSizing: 'border-box', background: th.inputBg, color: th.text },
    td: { padding: '8px 12px', verticalAlign: 'middle', fontSize: 13, borderBottom: `1px solid ${th.line}`, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' },
    thDept: {
      textAlign: 'left', padding: '7px 12px', fontSize: 11, fontWeight: 600,
      textTransform: 'uppercase', letterSpacing: '0.05em', color: th.textDim,
      overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
    },
  };
}

function Center({ th, children }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '80vh', gap: 12, fontFamily: 'Calibri, sans-serif', background: th.bg, color: th.text }}>
      {children}
    </div>
  );
}
function Spinner({ th }) {
  return (
    <>
      <div style={{ border: `3px solid ${th.line}`, borderTopColor: th.accent, borderRadius: '50%', width: 28, height: 28, animation: 'spin 0.8s linear infinite' }} />
      <style jsx>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </>
  );
}

function sansAccents(s) {
  return (s || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
}

function ListePersonnel({ userId, nom, poste }) {
  const [mode, setMode] = useModePep();
  const th = PALETTES[mode];
  const { btn, btnGhost, btnDanger, input, td, thDept } = styles(th);

  const [loading, setLoading] = useState(true);
  const [peutModifier, setPeutModifier] = useState(false);
  const [estAdmin, setEstAdmin] = useState(false);
  const [vue, setVue] = useState('personnel');

  const [groupes, setGroupes] = useState([]);
  const [groupeDepts, setGroupeDepts] = useState([]);
  const [groupePersonnes, setGroupePersonnes] = useState([]);
  const [groupeActif, setGroupeActif] = useState(null);

  const [departements, setDepartements] = useState([]);
  const [personnes, setPersonnes] = useState([]);
  const [recherche, setRecherche] = useState('');
  const [erreur, setErreur] = useState('');
  const [saving, setSaving] = useState(false);

  const [editPersonne, setEditPersonne] = useState(null);
  const [confirmSuppr, setConfirmSuppr] = useState(null);
  const [gererDepts, setGererDepts] = useState(false);
  const [fiche, setFiche] = useState(null);
  const [estPhone, setEstPhone] = useState(false);

  useEffect(() => {
    function mesurer() { setEstPhone(window.innerWidth < 760); }
    mesurer();
    window.addEventListener('resize', mesurer);
    return () => window.removeEventListener('resize', mesurer);
  }, []);

  // L'acces a l'app est deja verifie par GardeConnexion. Il reste a savoir si
  // la personne peut MODIFIER la liste, et si elle est administratrice — ces
  // deux droits-la sont propres a l'app.
  useEffect(() => {
    (async () => {
      const { data: roleRow } = await supabase
        .from('pep_user_roles').select('role').eq('user_id', userId).maybeSingle();
      const admin = roleRow?.role === 'admin';
      setEstAdmin(admin);

      const { data: featureRow } = await supabase
        .from('pep_user_features').select('feature_key')
        .eq('user_id', userId).eq('app_slug', 'liste-personnel').eq('feature_key', 'modifier').maybeSingle();
      setPeutModifier(!!featureRow || admin);

      await chargerTout();
      setLoading(false);
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userId]);

  async function chargerTout() {
    const [resDepts, resPers] = await Promise.all([
      supabasePers.from('departements').select('*').order('ordre'),
      supabasePers.from('personnes').select('*').order('nom'),
    ]);
    if (resDepts.error || resPers.error) {
      setErreur("Impossible de charger la liste. Réessaie dans un instant, ou avertis William si ça persiste.");
      return;
    }
    setDepartements(resDepts.data || []);
    setPersonnes(resPers.data || []);
    await chargerGroupes();
  }

  // Les groupes ne servent qu'à l'onglet administrateur. Si les tables
  // n'existent pas encore (SQL 02 pas passé), on ignore silencieusement
  // plutôt que d'empêcher le répertoire de s'afficher.
  async function chargerGroupes() {
    const [resG, resGD, resGP] = await Promise.all([
      supabasePers.from('groupes').select('*').order('ordre'),
      supabasePers.from('groupe_departements').select('*'),
      supabasePers.from('groupe_personnes').select('*'),
    ]);
    if (resG.error || resGD.error || resGP.error) return;
    setGroupes(resG.data || []);
    setGroupeDepts(resGD.data || []);
    setGroupePersonnes(resGP.data || []);
  }

  // --- Regroupement par département, dans l'ordre choisi ----------------
  const blocs = useMemo(() => {
    const terme = sansAccents(recherche.trim());
    const correspond = (p) => !terme || [p.nom, p.titre, p.courriel, p.cellulaire, p.poste]
      .some((v) => sansAccents(v).includes(terme));

    const parDept = new Map(departements.map((d) => [d.nom, []]));
    const sansDept = [];
    for (const p of personnes) {
      if (!correspond(p)) continue;
      if (p.departement && parDept.has(p.departement)) parDept.get(p.departement).push(p);
      else sansDept.push(p);
    }
    // Hors recherche, on garde les départements vides : sinon ils
    // disparaîtraient de l'écran et leur bouton "+" deviendrait inatteignable.
    // Pendant une recherche, au contraire, on ne montre que ce qui correspond.
    const liste = departements
      .map((d) => ({ dept: d.nom, membres: parDept.get(d.nom) || [] }))
      .filter((g) => g.membres.length > 0 || !terme);
    if (sansDept.length > 0) liste.push({ dept: SANS_DEPARTEMENT, membres: sansDept });
    return liste;
  }, [departements, personnes, recherche]);

  const nbAffiches = blocs.reduce((n, g) => n + g.membres.length, 0);

  // Largeurs fixes : sans ça, chaque département calcule ses colonnes selon
  // son propre contenu et les blocs ne s'alignent pas entre eux.
  const colonnes = estPhone
    ? ['46%', '30%', '24%']
    : peutModifier
      ? ['19%', '27%', '13%', '25%', '16%']
      : ['22%', '32%', '15%', '31%'];

  // --- Écritures --------------------------------------------------------
  async function sauvegarderPersonne(form) {
    setSaving(true);
    setErreur('');
    const payload = {
      nom: form.nom.trim(),
      titre: form.titre?.trim() || null,
      departement: form.departement || null,
      courriel: form.courriel?.trim() || null,
      cellulaire: form.cellulaire?.trim() || null,
      poste: form.poste?.trim() || null,
      actif: !!form.actif,
    };
    const { error } = form.id
      ? await supabasePers.from('personnes').update(payload).eq('id', form.id)
      : await supabasePers.from('personnes').insert(payload);
    setSaving(false);
    if (error) {
      setErreur(error.message.includes('personnes_nom_unique')
        ? `Une personne nommée « ${payload.nom} » existe déjà dans la liste.`
        : "L'enregistrement a échoué. Réessaie dans un instant.");
      return;
    }
    setEditPersonne(null);
    await chargerTout();
  }

  async function supprimerPersonne(id) {
    setSaving(true);
    const { error } = await supabasePers.from('personnes').delete().eq('id', id);
    setSaving(false);
    setConfirmSuppr(null);
    if (error) { setErreur("La suppression a échoué."); return; }
    await chargerTout();
  }

  // --- Groupes ----------------------------------------------------------
  // Résout un groupe en liste de personnes : les membres de ses départements,
  // plus les personnes ajoutées à l'unité. Dédoublonné, car une personne peut
  // être couverte deux fois — par son département ET nommément.
  function resoudreGroupe(nomGroupe) {
    const depts = groupeDepts.filter((x) => x.groupe === nomGroupe).map((x) => x.departement);
    const idsDirects = new Set(
      groupePersonnes.filter((x) => x.groupe === nomGroupe).map((x) => x.personne_id)
    );
    const vus = new Set();
    const resultat = [];
    for (const p of personnes) {
      const parDept = p.departement && depts.includes(p.departement);
      const direct = idsDirects.has(p.id);
      if (!parDept && !direct) continue;
      if (vus.has(p.id)) continue;
      vus.add(p.id);
      resultat.push({ ...p, viaDepartement: parDept, nomme: direct });
    }
    return resultat;
  }

  async function creerGroupe(nom) {
    const propre = nom.trim();
    if (!propre) return;
    setSaving(true);
    const ordre = (groupes.length ? Math.max(...groupes.map((g) => g.ordre)) : 0) + 10;
    const { error } = await supabasePers.from('groupes').insert({ nom: propre, ordre });
    setSaving(false);
    if (error) { setErreur("Ce groupe existe déjà, ou la création a échoué."); return; }
    await chargerGroupes();
    setGroupeActif(propre);
  }

  async function supprimerGroupe(nom) {
    setSaving(true);
    const { error } = await supabasePers.from('groupes').delete().eq('nom', nom);
    setSaving(false);
    if (error) { setErreur("La suppression du groupe a échoué."); return; }
    setGroupeActif(null);
    await chargerGroupes();
  }

  async function basculerDepartement(groupe, departement, present) {
    const req = present
      ? supabasePers.from('groupe_departements').delete().eq('groupe', groupe).eq('departement', departement)
      : supabasePers.from('groupe_departements').insert({ groupe, departement });
    const { error } = await req;
    if (error) { setErreur("La modification du groupe a échoué."); return; }
    await chargerGroupes();
  }

  async function basculerPersonne(groupe, personneId, present) {
    const req = present
      ? supabasePers.from('groupe_personnes').delete().eq('groupe', groupe).eq('personne_id', personneId)
      : supabasePers.from('groupe_personnes').insert({ groupe, personne_id: personneId });
    const { error } = await req;
    if (error) { setErreur("La modification du groupe a échoué."); return; }
    await chargerGroupes();
  }

  // --- Rendu ------------------------------------------------------------
  if (loading) return <Center th={th}><Spinner th={th} /><div>Chargement…</div></Center>;

  return (
    <div style={{ minHeight: '100vh', background: th.bg, fontFamily: 'Calibri, sans-serif', color: th.text }}>
      <Head><title>Liste de contacts - Toolbox PEP</title></Head>

      <EnTeteApp
        titre="Liste de contacts"
        sousTitre="Repertoire telephonique des Entreprises PEP2000"
        mode={mode}
        onChangerMode={setMode}
        nom={nom}
        poste={poste}
        onAccueil={() => { setVue('personnel'); setRecherche(''); setFiche(null); }}
      />

      <main style={{ maxWidth: 1100, margin: '0 auto', padding: '0 16px 60px' }}>

        {estAdmin && (
          <div style={{ display: 'flex', gap: 8, marginBottom: 16 }}>
            {[['personnel', 'Répertoire'], ['groupes', `Groupes (${groupes.length})`]].map(([id, label]) => (
              <button key={id} onClick={() => setVue(id)} style={{
                ...btn,
                background: vue === id ? th.btnBg : th.panel,
                color: vue === id ? '#fff' : th.accent,
                border: `1px solid ${th.accent}`,
              }}>
                {label}
              </button>
            ))}
          </div>
        )}

        {erreur && (
          <div style={{ background: th.errBg, border: `1px solid ${RED}`, borderLeft: `3px solid ${RED}`, color: th.errTexte, padding: '10px 14px', marginBottom: 14, fontSize: 13 }}>
            {erreur}
          </div>
        )}

        {vue === 'personnel' && (
          <>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 10, marginBottom: 14 }}>
            <div style={{ fontSize: 13, color: th.textDim }}>
              {nbAffiches} personne{nbAffiches > 1 ? 's' : ''}
              {recherche.trim() ? ` sur ${personnes.length}` : ''}
            </div>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              <input
                placeholder="Rechercher un nom, un titre, un courriel…"
                value={recherche}
                onChange={(e) => setRecherche(e.target.value)}
                style={{ ...input, width: 280 }}
              />
              {peutModifier && (
                <>
                  <button style={btnGhost} onClick={() => setGererDepts(true)}>Départements</button>
                  <button style={btn} onClick={() => setEditPersonne({ nom: '', titre: '', departement: departements[0]?.nom || '', courriel: '', cellulaire: '', poste: '', actif: true })}>
                    + Nouvelle personne
                  </button>
                </>
              )}
            </div>
          </div>

          <div style={{ marginBottom: 16, padding: '10px 14px', background: th.avisBg, border: `1px solid ${th.avisTexte}`, borderLeft: `3px solid ${th.avisTexte}`, fontSize: 13, color: th.avisTexte }}>
            Tout numéro indiqué avec un poste est accessible via le numéro principal : <strong>{TELEPHONE_PRINCIPAL}</strong> + le numéro de poste.
          </div>

          {!peutModifier && (
            <div style={{ marginBottom: 16, fontSize: 12.5, color: th.textDim }}>
              Lecture seule. Pour pouvoir modifier la liste, demande à William d&apos;activer la permission « modifier ».
            </div>
          )}

          {blocs.length === 0 && (
            <div style={{ background: th.panel, border: `1px solid ${th.line}`, padding: 24, fontSize: 13.5, color: th.textDim }}>
              Aucune personne ne correspond à cette recherche.
            </div>
          )}

          {blocs.map((groupe) => (
            <div key={groupe.dept} style={{ marginBottom: 20 }}>
              <div style={{
                display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10,
                fontWeight: 700, fontSize: 13, textTransform: 'uppercase', letterSpacing: '0.06em',
                color: th.accent, background: th.surligne, padding: '6px 10px 6px 14px', borderLeft: `3px solid ${RED}`,
              }}>
                <span>
                  {groupe.dept} <span style={{ color: th.textDim, fontWeight: 600 }}>({groupe.membres.length})</span>
                </span>
                {peutModifier && (
                  <button
                    type="button"
                    title={`Ajouter une personne dans ${groupe.dept}`}
                    onClick={() => setEditPersonne({
                      nom: '', titre: '',
                      // Le département est pré-rempli avec celui de l'en-tête cliqué.
                      // "Sans département" n'est pas un vrai département : on laisse
                      // le champ vide plutôt que d'inventer une valeur.
                      departement: groupe.dept === SANS_DEPARTEMENT ? '' : groupe.dept,
                      courriel: '', cellulaire: '', poste: '', actif: true,
                    })}
                    style={{
                      ...btn, padding: '3px 11px', fontSize: 16, lineHeight: 1.2,
                      fontWeight: 700, flexShrink: 0,
                    }}
                  >
                    +
                  </button>
                )}
              </div>
              <div style={{ background: th.panel, border: `1px solid ${th.line}`, borderTop: 'none' }}>
                {groupe.membres.length === 0 ? (
                  <div style={{ padding: '14px', fontSize: 12.5, color: th.textDim }}>
                    Aucune personne dans ce département. Utilise le « + » ci-dessus pour en ajouter une.
                  </div>
                ) : (
                <table style={{ width: '100%', borderCollapse: 'collapse', tableLayout: 'fixed' }}>
                  <colgroup>
                    {colonnes.map((largeur, i) => <col key={i} style={{ width: largeur }} />)}
                  </colgroup>
                  <thead>
                    <tr style={{ background: th.panelAlt, borderBottom: `1px solid ${th.line}` }}>
                      <th style={thDept}>Nom</th>
                      {!estPhone && <th style={thDept}>Titre</th>}
                      <th style={thDept}>Cellulaire</th>
                      {!estPhone && <th style={thDept}>Courriel</th>}
                      {estPhone && <th style={{ ...thDept, textAlign: 'center' }}>Info</th>}
                      {peutModifier && !estPhone && <th style={thDept} />}
                    </tr>
                  </thead>
                  <tbody>
                    {groupe.membres.map((p, i) => (
                      <tr key={p.id} style={{ background: i % 2 === 0 ? th.panel : th.panelAlt }}>
                        <td style={{ ...td, fontWeight: 600 }}>
                          {p.nom}
                          {!p.actif && <span style={{ color: th.textDim, fontWeight: 400 }}> (inactif)</span>}
                        </td>
                        {!estPhone && <td style={{ ...td, color: th.textDim }} title={p.titre || ''}>{p.titre || '—'}</td>}
                        <td style={td}>
                          {p.cellulaire
                            ? <a href={`tel:${p.cellulaire}`} style={{ color: th.accent, textDecoration: 'none', fontWeight: 600 }}>{p.cellulaire}</a>
                            : p.poste ? <span style={{ color: th.textDim }}>Poste {p.poste}</span> : '—'}
                        </td>
                        {!estPhone && (
                          <td style={td}>
                            {p.courriel
                              ? <a href={`mailto:${p.courriel}`} title={p.courriel} style={{ color: th.lien, textDecoration: 'none' }}>{p.courriel}</a>
                              : <span style={{ color: th.textDim }}>—</span>}
                          </td>
                        )}
                        {estPhone && (
                          <td style={{ ...td, textAlign: 'center' }}>
                            <button style={{ ...btnGhost, ...btnSmall }} onClick={() => setFiche(p)}>Voir</button>
                          </td>
                        )}
                        {peutModifier && !estPhone && (
                          <td style={{ ...td, textAlign: 'right', whiteSpace: 'nowrap' }}>
                            <button style={{ ...btnGhost, ...btnSmall, marginRight: 6 }} onClick={() => setEditPersonne({ ...p })}>Modifier</button>
                            <button style={{ ...btnDanger, ...btnSmall }} onClick={() => setConfirmSuppr(p)}>Suppr.</button>
                          </td>
                        )}
                      </tr>
                    ))}
                  </tbody>
                </table>
                )}
              </div>
            </div>
          ))}
          </>
        )}


        {vue === 'groupes' && estAdmin && (
          <VueGroupes
            th={th}
            groupes={groupes}
            groupeActif={groupeActif}
            setGroupeActif={setGroupeActif}
            departements={departements}
            personnes={personnes}
            groupeDepts={groupeDepts}
            groupePersonnes={groupePersonnes}
            resoudreGroupe={resoudreGroupe}
            creerGroupe={creerGroupe}
            supprimerGroupe={supprimerGroupe}
            basculerDepartement={basculerDepartement}
            basculerPersonne={basculerPersonne}
            saving={saving}
          />
        )}
      </main>

      {fiche && (
        <FichePersonne
          th={th}
          personne={fiche}
          peutModifier={peutModifier}
          onModifier={() => { setEditPersonne({ ...fiche }); setFiche(null); }}
          onFermer={() => setFiche(null)}
        />
      )}

      {editPersonne && (
        <ModalPersonne
          th={th}
          personne={editPersonne}
          departements={departements}
          onSave={sauvegarderPersonne}
          onCancel={() => setEditPersonne(null)}
          saving={saving}
        />
      )}

      {gererDepts && (
        <ModalDepartements
          th={th}
          departements={departements}
          personnes={personnes}
          onFerme={async () => { setGererDepts(false); await chargerTout(); }}
          setErreur={setErreur}
        />
      )}

      {confirmSuppr && (
        <Modal th={th} titre="Supprimer cette personne?">
          <p style={{ fontSize: 14, marginTop: 0 }}>
            <strong>{confirmSuppr.nom}</strong> sera retirée définitivement de la liste.
          </p>
          <p style={{ fontSize: 12.5, color: th.textDim }}>
            Si la personne a simplement quitté, il vaut mieux la passer à « inactif » : elle reste
            consultable et son historique n&apos;est pas perdu.
          </p>
          <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 18 }}>
            <button style={btnGhost} onClick={() => setConfirmSuppr(null)}>Annuler</button>
            <button style={btnDanger} disabled={saving} onClick={() => supprimerPersonne(confirmSuppr.id)}>
              {saving ? 'Suppression…' : 'Supprimer'}
            </button>
          </div>
        </Modal>
      )}
    </div>
  );
}

export default function Page() {
  const [session, setSession] = useState(null);
  if (!session) {
    return <GardeConnexion appSlug="liste-personnel" nomApp="Liste de contacts" onPret={setSession} />;
  }
  return <ListePersonnel userId={session.userId} nom={session.nom} poste={session.poste} />;
}

function Modal({ th, titre, children, large }) {
  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.55)', zIndex: 9999, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}>
      <div style={{ background: th.panel, color: th.text, borderRadius: 8, padding: 22, width: '100%', maxWidth: large ? 620 : 460, maxHeight: '88vh', overflowY: 'auto', fontFamily: 'Calibri, sans-serif', boxShadow: th.ombre }}>
        <h3 style={{ marginTop: 0, color: th.accent }}>{titre}</h3>
        {children}
      </div>
    </div>
  );
}

function Champ({ th, label, children }) {
  return (
    <div style={{ marginBottom: 12 }}>
      <label style={{ display: 'block', fontSize: 11.5, textTransform: 'uppercase', letterSpacing: '0.04em', color: th.textDim, marginBottom: 4 }}>{label}</label>
      {children}
    </div>
  );
}

function FichePersonne({ th, personne, peutModifier, onModifier, onFermer }) {
  const { btn, btnGhost } = styles(th);
  return (
    <div onClick={onFermer} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.45)', zIndex: 9999, display: 'flex', alignItems: 'flex-end', justifyContent: 'center' }}>
      <div onClick={(e) => e.stopPropagation()} style={{ background: th.panel, color: th.text, width: '100%', maxWidth: 460, padding: 22, borderTopLeftRadius: 10, borderTopRightRadius: 10, fontFamily: 'Calibri, sans-serif' }}>
        <div style={{ fontSize: 18, fontWeight: 700, color: th.accent }}>{personne.nom}</div>
        {personne.titre && <div style={{ fontSize: 13, color: th.textDim, marginBottom: 16 }}>{personne.titre}</div>}

        {personne.cellulaire && (
          <div style={{ marginBottom: 12 }}>
            <div style={{ fontSize: 11, color: th.textDim, textTransform: 'uppercase', letterSpacing: '0.04em' }}>Cellulaire</div>
            <a href={`tel:${personne.cellulaire}`} style={{ fontSize: 17, fontWeight: 600, color: th.accent, textDecoration: 'none' }}>{personne.cellulaire}</a>
          </div>
        )}
        {personne.poste && (
          <div style={{ marginBottom: 12 }}>
            <div style={{ fontSize: 11, color: th.textDim, textTransform: 'uppercase', letterSpacing: '0.04em' }}>Poste</div>
            <a href={`tel:${TELEPHONE_PRINCIPAL},${personne.poste}`} style={{ fontSize: 15, color: th.text, textDecoration: 'none' }}>
              {TELEPHONE_PRINCIPAL} p.{personne.poste}
            </a>
          </div>
        )}
        {personne.courriel && (
          <div style={{ marginBottom: 12 }}>
            <div style={{ fontSize: 11, color: th.textDim, textTransform: 'uppercase', letterSpacing: '0.04em' }}>Courriel</div>
            <a href={`mailto:${personne.courriel}`} style={{ fontSize: 14, color: th.lien, textDecoration: 'none', wordBreak: 'break-all' }}>{personne.courriel}</a>
          </div>
        )}

        <div style={{ display: 'flex', gap: 8, marginTop: 20 }}>
          {peutModifier && <button style={{ ...btnGhost, flex: 1 }} onClick={onModifier}>Modifier</button>}
          <button style={{ ...btn, flex: 1 }} onClick={onFermer}>Fermer</button>
        </div>
      </div>
    </div>
  );
}

function ModalPersonne({ th, personne, departements, onSave, onCancel, saving }) {
  const { btn, btnGhost, input } = styles(th);
  const [form, setForm] = useState(personne);
  const set = (k, v) => setForm((f) => ({ ...f, [k]: v }));
  const nomValide = form.nom?.trim().length > 0;

  return (
    <Modal th={th} titre={form.id ? `Modifier ${personne.nom}` : 'Nouvelle personne'}>
      <Champ th={th} label="Nom">
        <input style={input} value={form.nom || ''} onChange={(e) => set('nom', e.target.value)} placeholder="Prénom Nom" />
      </Champ>
      <Champ th={th} label="Titre">
        <input style={input} value={form.titre || ''} onChange={(e) => set('titre', e.target.value)} placeholder="ex. Chargé de projets" />
      </Champ>
      <Champ th={th} label="Département">
        <select style={input} value={form.departement || ''} onChange={(e) => set('departement', e.target.value)}>
          <option value="">— Sans département —</option>
          {departements.map((d) => <option key={d.nom} value={d.nom}>{d.nom}</option>)}
        </select>
      </Champ>
      <Champ th={th} label="Courriel">
        <input style={input} value={form.courriel || ''} onChange={(e) => set('courriel', e.target.value)} placeholder="prenom@pep2000.com" />
      </Champ>
      <div style={{ display: 'flex', gap: 10 }}>
        <div style={{ flex: 1 }}>
          <Champ th={th} label="Cellulaire">
            <input style={input} value={form.cellulaire || ''} onChange={(e) => set('cellulaire', e.target.value)} placeholder="514-000-0000" />
          </Champ>
        </div>
        <div style={{ width: 110 }}>
          <Champ th={th} label="Poste">
            <input style={input} value={form.poste || ''} onChange={(e) => set('poste', e.target.value)} placeholder="000" />
          </Champ>
        </div>
      </div>
      <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13.5, marginTop: 4, cursor: 'pointer' }}>
        <input type="checkbox" checked={!!form.actif} onChange={(e) => set('actif', e.target.checked)} style={{ accentColor: th.accent }} />
        Personne active
      </label>

      <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 20 }}>
        <button style={btnGhost} onClick={onCancel}>Annuler</button>
        <button style={btn} disabled={saving || !nomValide} onClick={() => onSave(form)}>
          {saving ? 'Enregistrement…' : 'Enregistrer'}
        </button>
      </div>
    </Modal>
  );
}

function ModalDepartements({ th, departements, personnes, onFerme, setErreur }) {
  const { btn, btnGhost, btnDanger, input } = styles(th);
  const [liste, setListe] = useState(departements);
  const [nouveau, setNouveau] = useState('');
  const [occupe, setOccupe] = useState(false);

  const compte = (nom) => personnes.filter((p) => p.departement === nom).length;

  async function ajouter() {
    const nom = nouveau.trim();
    if (!nom) return;
    setOccupe(true);
    const ordre = (liste.length ? Math.max(...liste.map((d) => d.ordre)) : 0) + 10;
    const { error } = await supabasePers.from('departements').insert({ nom, ordre });
    setOccupe(false);
    if (error) { setErreur("Ce département existe déjà, ou l'ajout a échoué."); return; }
    setListe([...liste, { nom, ordre }]);
    setNouveau('');
  }

  async function deplacer(index, direction) {
    const cible = index + direction;
    if (cible < 0 || cible >= liste.length) return;
    const copie = [...liste];
    [copie[index], copie[cible]] = [copie[cible], copie[index]];
    // On réécrit tous les ordres pour rester cohérent même après plusieurs
    // déplacements successifs.
    const renumerotee = copie.map((d, i) => ({ ...d, ordre: (i + 1) * 10 }));
    setListe(renumerotee);
    setOccupe(true);
    await Promise.all(renumerotee.map((d) =>
      supabasePers.from('departements').update({ ordre: d.ordre }).eq('nom', d.nom)));
    setOccupe(false);
  }

  async function supprimer(nom) {
    if (compte(nom) > 0) {
      setErreur(`Impossible de supprimer « ${nom} » : des personnes y sont encore rattachées.`);
      return;
    }
    setOccupe(true);
    const { error } = await supabasePers.from('departements').delete().eq('nom', nom);
    setOccupe(false);
    if (error) { setErreur("La suppression du département a échoué."); return; }
    setListe(liste.filter((d) => d.nom !== nom));
  }

  return (
    <Modal th={th} titre="Départements" large>
      <p style={{ fontSize: 12.5, color: th.textDim, marginTop: 0 }}>
        L&apos;ordre ci-dessous est celui utilisé pour afficher la liste. Un département ne peut
        être supprimé que s&apos;il ne contient plus personne.
      </p>

      {liste.map((d, i) => (
        <div key={d.nom} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '7px 0', borderBottom: `1px solid ${th.line}` }}>
          <div style={{ flex: 1, fontSize: 13.5 }}>
            {d.nom} <span style={{ color: th.textDim }}>({compte(d.nom)})</span>
          </div>
          <button style={{ ...btnGhost, ...btnSmall }} disabled={occupe || i === 0} onClick={() => deplacer(i, -1)}>&#8593;</button>
          <button style={{ ...btnGhost, ...btnSmall }} disabled={occupe || i === liste.length - 1} onClick={() => deplacer(i, 1)}>&#8595;</button>
          <button style={{ ...btnDanger, ...btnSmall }} disabled={occupe} onClick={() => supprimer(d.nom)}>Suppr.</button>
        </div>
      ))}

      <div style={{ display: 'flex', gap: 8, marginTop: 16 }}>
        <input style={input} value={nouveau} onChange={(e) => setNouveau(e.target.value)} placeholder="Nom d'un nouveau département" />
        <button style={btn} disabled={occupe || !nouveau.trim()} onClick={ajouter}>Ajouter</button>
      </div>

      <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 20 }}>
        <button style={btn} onClick={onFerme}>Fermer</button>
      </div>
    </Modal>
  );
}

// ---------------------------------------------------------------------------
// Onglet Groupes — réservé aux administrateurs.
// Un groupe est une liste nommée : des départements complets, plus des
// personnes ajoutées à l'unité. La colonne de droite montre en direct la
// liste résolue, dédoublonnée, telle qu'elle sera utilisée par les autres
// apps quand on les branchera.
// ---------------------------------------------------------------------------
function VueGroupes({
  th, groupes, groupeActif, setGroupeActif, departements, personnes,
  groupeDepts, groupePersonnes, resoudreGroupe, creerGroupe, supprimerGroupe,
  basculerDepartement, basculerPersonne, saving,
}) {
  const { btn, btnGhost, btnDanger, input } = styles(th);
  const [nouveau, setNouveau] = useState('');
  const [ajout, setAjout] = useState('');
  const [confirmSuppr, setConfirmSuppr] = useState(null);

  const actif = groupes.find((g) => g.nom === groupeActif) || null;
  const deptsDuGroupe = actif ? groupeDepts.filter((x) => x.groupe === actif.nom).map((x) => x.departement) : [];
  const idsDuGroupe = actif ? groupePersonnes.filter((x) => x.groupe === actif.nom).map((x) => x.personne_id) : [];
  const resolu = actif ? resoudreGroupe(actif.nom) : [];

  function compteGroupe(nom) {
    return resoudreGroupe(nom).length;
  }

  return (
    <div style={{ display: 'flex', gap: 16, alignItems: 'flex-start', flexWrap: 'wrap' }}>

      <div style={{ flex: '0 0 260px', minWidth: 240 }}>
        <div style={{ background: th.panel, border: `1px solid ${th.line}` }}>
          {groupes.length === 0 && (
            <div style={{ padding: 14, fontSize: 12.5, color: th.textDim }}>
              Aucun groupe pour l&apos;instant.
            </div>
          )}
          {groupes.map((g) => (
            <div
              key={g.nom}
              onClick={() => setGroupeActif(g.nom)}
              style={{
                padding: '10px 14px', cursor: 'pointer', fontSize: 13.5,
                borderBottom: `1px solid ${th.line}`,
                background: g.nom === groupeActif ? th.surligne : th.panel,
                borderLeft: g.nom === groupeActif ? `3px solid ${RED}` : '3px solid transparent',
                fontWeight: g.nom === groupeActif ? 700 : 400,
              }}
            >
              {g.nom} <span style={{ color: th.textDim }}>({compteGroupe(g.nom)})</span>
            </div>
          ))}
        </div>

        <div style={{ display: 'flex', gap: 8, marginTop: 10 }}>
          <input
            style={input}
            value={nouveau}
            onChange={(e) => setNouveau(e.target.value)}
            placeholder="Nom d'un nouveau groupe"
          />
          <button
            style={btn}
            disabled={saving || !nouveau.trim()}
            onClick={async () => { await creerGroupe(nouveau); setNouveau(''); }}
          >
            Créer
          </button>
        </div>
      </div>

      <div style={{ flex: 1, minWidth: 320 }}>
        {!actif ? (
          <div style={{ background: th.panel, border: `1px solid ${th.line}`, padding: 24, fontSize: 13.5, color: th.textDim }}>
            Choisis un groupe à gauche, ou crée-en un.
          </div>
        ) : (
          <div style={{ background: th.panel, border: `1px solid ${th.line}`, padding: 18 }}>

            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, marginBottom: 4 }}>
              <div style={{ fontSize: 17, fontWeight: 700, color: th.accent }}>{actif.nom}</div>
              <button style={{ ...btnDanger, ...btnSmall }} onClick={() => setConfirmSuppr(actif.nom)}>
                Supprimer le groupe
              </button>
            </div>
            <div style={{ fontSize: 12.5, color: th.textDim, marginBottom: 16 }}>
              {resolu.length} personne{resolu.length > 1 ? 's' : ''} au total
            </div>

            <div style={{ fontSize: 11.5, textTransform: 'uppercase', letterSpacing: '0.04em', color: th.textDim, marginBottom: 8 }}>
              Départements inclus
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(210px, 1fr))', gap: 6, marginBottom: 18 }}>
              {departements.map((d) => {
                const present = deptsDuGroupe.includes(d.nom);
                return (
                  <label key={d.nom} style={{
                    display: 'flex', alignItems: 'center', gap: 8, fontSize: 13,
                    padding: '7px 10px', cursor: 'pointer',
                    border: `1px solid ${present ? th.accent : th.line}`,
                    background: present ? th.surligne : th.panel,
                  }}>
                    <input
                      type="checkbox"
                      checked={present}
                      onChange={() => basculerDepartement(actif.nom, d.nom, present)}
                      style={{ accentColor: th.accent }}
                    />
                    {d.nom}
                  </label>
                );
              })}
            </div>

            <div style={{ fontSize: 11.5, textTransform: 'uppercase', letterSpacing: '0.04em', color: th.textDim, marginBottom: 8 }}>
              Personnes ajoutées à l&apos;unité
            </div>
            <div style={{ display: 'flex', gap: 8, marginBottom: 10 }}>
              <select style={input} value={ajout} onChange={(e) => setAjout(e.target.value)}>
                <option value="">— Choisir une personne —</option>
                {personnes
                  .filter((p) => !idsDuGroupe.includes(p.id))
                  .map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.nom}{p.departement ? ` — ${p.departement}` : ''}
                    </option>
                  ))}
              </select>
              <button
                style={btn}
                disabled={!ajout}
                onClick={async () => { await basculerPersonne(actif.nom, ajout, false); setAjout(''); }}
              >
                Ajouter
              </button>
            </div>

            {idsDuGroupe.length === 0 && (
              <div style={{ fontSize: 12.5, color: th.textDim, marginBottom: 18 }}>
                Aucune personne ajoutée individuellement.
              </div>
            )}
            {idsDuGroupe.length > 0 && (
              <div style={{ marginBottom: 18 }}>
                {idsDuGroupe.map((id) => {
                  const p = personnes.find((x) => x.id === id);
                  if (!p) return null;
                  const couvertParDept = p.departement && deptsDuGroupe.includes(p.departement);
                  return (
                    <div key={id} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, padding: '6px 0', borderBottom: `1px solid ${th.line}`, fontSize: 13 }}>
                      <span>
                        {p.nom}
                        {couvertParDept && (
                          <span style={{ color: th.textDim, fontSize: 12 }}>
                            {' '}— déjà inclus via {p.departement}
                          </span>
                        )}
                      </span>
                      <button
                        style={{ ...btnGhost, ...btnSmall }}
                        onClick={() => basculerPersonne(actif.nom, id, true)}
                      >
                        Retirer
                      </button>
                    </div>
                  );
                })}
              </div>
            )}

            <div style={{ fontSize: 11.5, textTransform: 'uppercase', letterSpacing: '0.04em', color: th.textDim, marginBottom: 8 }}>
              Liste résolue
            </div>
            <div style={{ border: `1px solid ${th.line}`, maxHeight: 320, overflowY: 'auto' }}>
              {resolu.length === 0 && (
                <div style={{ padding: 12, fontSize: 12.5, color: th.textDim }}>
                  Ce groupe ne contient encore personne.
                </div>
              )}
              {resolu.map((p, i) => (
                <div key={p.id} style={{ display: 'flex', justifyContent: 'space-between', gap: 10, padding: '6px 12px', fontSize: 13, background: i % 2 === 0 ? th.panel : th.panelAlt }}>
                  <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {p.nom} <span style={{ color: th.textDim }}>{p.courriel || 'sans courriel'}</span>
                  </span>
                  <span style={{ color: th.textDim, fontSize: 11.5, whiteSpace: 'nowrap' }}>
                    {p.viaDepartement ? p.departement : 'ajout direct'}
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      {confirmSuppr && (
        <Modal th={th} titre="Supprimer ce groupe?">
          <p style={{ fontSize: 14, marginTop: 0 }}>
            Le groupe <strong>{confirmSuppr}</strong> sera supprimé.
          </p>
          <p style={{ fontSize: 12.5, color: th.textDim }}>
            Aucune personne ni aucun département n&apos;est effacé : seule la liste
            elle-même disparaît.
          </p>
          <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 18 }}>
            <button style={btnGhost} onClick={() => setConfirmSuppr(null)}>Annuler</button>
            <button
              style={btnDanger}
              disabled={saving}
              onClick={async () => { await supprimerGroupe(confirmSuppr); setConfirmSuppr(null); }}
            >
              Supprimer
            </button>
          </div>
        </Modal>
      )}
    </div>
  );
}
