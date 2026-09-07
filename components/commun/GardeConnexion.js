import { useState, useEffect } from 'react';
import { createClient } from '@supabase/supabase-js';

// ---------------------------------------------------------------------------
// GARDE DE CONNEXION — commun à toutes les apps du Toolbox
//
// UNE SEULE PORTE D'ENTRÉE : on se connecte dans le Toolbox, jamais dans une
// app. Ce fichier ne montre donc aucun écran de connexion, aucun lien « mot de
// passe oublié » et aucun bouton de déconnexion — tout ça vit dans le hub.
//
// Ce qu'il fait :
//   1. Pas de session   -> renvoie au Toolbox en gardant la destination en
//                          mémoire (/?retour=/mon-app/). Le hub y ramène la
//                          personne dès qu'elle est connectée.
//   2. Session, pas de droit sur l'app -> message d'accès refusé, avec un
//                          retour au Toolbox. La session reste ouverte : c'est
//                          un manque de droits, pas un problème de connexion.
//   3. Session et droit -> appelle onPret({ userId, nom, poste, email,
//                          accessToken }).
//
// Le nom et le titre du poste viennent de Liste de contacts
// (schéma personnel, table personnes). Repli sur l'ancienne liste
// liste_projets.personnel, puis sur le courriel, pour que personne ne reste
// bloqué si sa fiche manque.
// ---------------------------------------------------------------------------

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SUPABASE_ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
const supabasePers = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, { db: { schema: 'personnel' } });
const supabaseLP = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, { db: { schema: 'liste_projets' } });

const NAVY = '#0f2138';
const ROUGE = '#e4022e';

function Cadre({ titre, children }) {
  return (
    <div style={{
      minHeight: '100vh', background: '#edeff1', display: 'flex',
      alignItems: 'center', justifyContent: 'center', padding: 20,
      fontFamily: "Calibri, 'Segoe UI', Candara, Optima, Arial, sans-serif",
    }}>
      <div style={{ width: '100%', maxWidth: 460, background: '#fff', border: '1px solid #d7dbe0' }}>
        <div style={{ height: 4, background: ROUGE }} />
        <div style={{ background: NAVY, padding: '20px 24px' }}>
          <div style={{ color: '#aec0f5', fontSize: 12, letterSpacing: '0.14em', fontWeight: 600 }}>
            LES ENTREPRISES
          </div>
          <div style={{ color: '#fff', fontSize: 24, fontWeight: 700 }}>PEP2000 INC.</div>
          {titre && <div style={{ color: '#b9c2cc', fontSize: 13, marginTop: 2 }}>{titre}</div>}
        </div>
        <div style={{ padding: 24 }}>{children}</div>
      </div>
    </div>
  );
}

export default function GardeConnexion({ appSlug, nomApp, adminSeulement = false, onPret }) {
  // phase : 'verification' | 'redirection' | 'acces-refuse'
  const [phase, setPhase] = useState('verification');

  useEffect(() => {
    let actif = true;

    async function resoudrePersonne(email) {
      // 1. Liste de contacts — la source à jour, avec le titre du poste
      const { data: p } = await supabasePers
        .from('personnes').select('nom, titre').eq('courriel', email).maybeSingle();
      if (p?.nom) return { nom: p.nom, poste: p.titre || '' };

      // 2. Ancienne liste, sans titre
      const { data: ancien } = await supabaseLP
        .from('personnel').select('nom').eq('courriel', email).maybeSingle();
      if (ancien?.nom) return { nom: ancien.nom, poste: '' };

      // 3. Rien trouvé : au moins le courriel, pour ne bloquer personne
      return { nom: email, poste: '' };
    }

    async function verifier(session) {
      const [{ data: acces }, { data: role }] = await Promise.all([
        supabase.from('pep_user_apps').select('app_slug')
          .eq('user_id', session.user.id).eq('app_slug', appSlug).maybeSingle(),
        supabase.from('pep_user_roles').select('role')
          .eq('user_id', session.user.id).maybeSingle(),
      ]);
      if (!actif) return;

      const estAdmin = role?.role === 'admin';
      // adminSeulement : le panneau d'administration ne s'ouvre a personne
      // d'autre, meme avec une case cochee dans les droits par app.
      const autorise = adminSeulement ? estAdmin : (!!acces || estAdmin);
      if (!autorise) {
        setPhase('acces-refuse');
        return;
      }

      const { nom, poste } = await resoudrePersonne(session.user.email);
      if (!actif) return;
      onPret({
        userId: session.user.id,
        nom,
        poste,
        email: session.user.email,
        accessToken: session.access_token,
      });
    }

    function versLeToolbox() {
      if (!actif) return;
      setPhase('redirection');
      const destination = typeof window !== 'undefined'
        ? window.location.pathname + window.location.search
        : '/';
      window.location.replace('/?retour=' + encodeURIComponent(destination));
    }

    supabase.auth.getSession().then(({ data: { session } }) => {
      if (!actif) return;
      if (session) verifier(session);
      else versLeToolbox();
    });

    const { data: abonnement } = supabase.auth.onAuthStateChange((evenement, session) => {
      if (!actif) return;
      if (evenement === 'SIGNED_IN' && session) verifier(session);
      else if (evenement === 'SIGNED_OUT') versLeToolbox();
    });

    return () => { actif = false; abonnement?.subscription?.unsubscribe(); };
  }, [appSlug, adminSeulement, onPret]);

  if (phase === 'acces-refuse') {
    return (
      <Cadre titre={nomApp}>
        <div style={{ fontSize: 14.5, color: '#495260', lineHeight: 1.6, marginBottom: 18 }}>
          {adminSeulement
            ? `Ton compte est bien connecté, mais ${nomApp} est réservé aux administrateurs du Toolbox.`
            : `Ton compte est bien connecté, mais tu n'as pas accès à ${nomApp}. Demande à un administrateur du Toolbox de te l'accorder dans le panneau d'administration.`}
        </div>
        <a href="/" style={{
          display: 'block', textAlign: 'center', background: ROUGE, color: '#fff',
          padding: 13, fontWeight: 600, fontSize: 14, letterSpacing: '0.04em',
          textTransform: 'uppercase', textDecoration: 'none',
        }}>
          Retour au Toolbox PEP
        </a>
      </Cadre>
    );
  }

  return (
    <Cadre titre={nomApp}>
      <div style={{ textAlign: 'center', color: '#6b7480', fontSize: 14 }}>
        {phase === 'redirection' ? 'Redirection vers le Toolbox…' : 'Vérification de la session…'}
      </div>
    </Cadre>
  );
}
