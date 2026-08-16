import React, { useState, useEffect } from "react";
import { createClient } from "@supabase/supabase-js";

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SUPABASE_ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

// Client sur le schema public (session, pep_apps, pep_user_roles)
const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
// Client sur le schema liste_projets (pour retrouver le vrai nom via le
// courriel de connexion — pas de table de "profils" séparée pour cette app,
// on réutilise l'annuaire du personnel déjà existant)
const supabaseLP = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, { db: { schema: "liste_projets" } });

const LOGO_PEP = "/_static/planification-hebdomadaire/logo-pep.png";
const APP_SLUG = "demandes-arpentage";

/* ---------------------------------------------------------------------
   AUTH GATE — Demandes d'arpentage
   Même patron que Planification hebdomadaire : login obligatoire, accès
   réservé aux personnes cochées "Demandes d'arpentage" dans le panneau
   /administration/. Le nom réel affiché est retrouvé en matchant le
   courriel de connexion avec liste_projets.personnel.courriel (pas de
   champ "Ton nom" modifiable par la personne).
--------------------------------------------------------------------- */

const CHAMP_STYLE = {
  width: "100%", padding: "11px 12px", border: "1px solid #D7DBE0", fontSize: 15,
  fontFamily: "'Inter',sans-serif", boxSizing: "border-box", marginBottom: 14,
};
const LABEL_STYLE = {
  display: "block", fontSize: 12, fontWeight: 600, color: "#15181B", marginBottom: 6,
  textTransform: "uppercase", letterSpacing: "0.04em",
};
const BOUTON_PRINCIPAL = {
  width: "100%", background: "#E4022E", color: "#fff", border: "none", padding: "13px",
  fontFamily: "'Oswald',sans-serif", fontWeight: 600, fontSize: 14, letterSpacing: "0.04em",
  textTransform: "uppercase", cursor: "pointer",
};
const LIEN_DISCRET = {
  display: "block", margin: "14px auto 0", background: "transparent", border: "none",
  color: "#8a93a0", fontSize: 12, textDecoration: "underline", cursor: "pointer", textAlign: "center",
};

function Cadre({ children }) {
  return (
    <div style={{ minHeight: "100vh", background: "#EDEFF1", display: "flex", alignItems: "center", justifyContent: "center", fontFamily: "'Inter',sans-serif", padding: 20 }}>
      <div style={{ width: "100%", maxWidth: 420, background: "#fff", border: "1px solid #D7DBE0", boxShadow: "0 1px 0 #D7DBE0" }}>
        <div style={{ background: "#0F2138", padding: "22px 24px", borderTop: "4px solid #E4022E", display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12 }}>
          <div>
            <div style={{ color: "#AEC0F5", fontFamily: "'Oswald',sans-serif", fontSize: 12, letterSpacing: "0.14em", fontWeight: 600 }}>LES ENTREPRISES</div>
            <div style={{ color: "#fff", fontFamily: "'Oswald',sans-serif", fontSize: 26, fontWeight: 700, letterSpacing: "0.02em" }}>PEP2000 INC.</div>
            <div style={{ color: "#B9C2CC", fontSize: 13, marginTop: 2 }}>Demandes d'arpentage</div>
            <a href="/" style={{ color: "#AEC0F5", fontSize: 12, textDecoration: "underline", marginTop: 6, display: "inline-block" }}>→ Retour au Toolbox PEP</a>
          </div>
          <img src={LOGO_PEP} alt="Les Entreprises PEP" style={{ height: 60, width: "auto", flexShrink: 0 }} onError={(e) => { e.currentTarget.style.display = "none"; }} />
        </div>
        <div style={{ padding: 24 }}>{children}</div>
      </div>
    </div>
  );
}

export default function AuthGate({ onDone }) {
  // phase: 'verification' | 'login' | 'acces-refuse' | 'recuperation-demandee' | 'recuperation-nouveau-mdp'
  const [phase, setPhase] = useState("verification");
  const [email, setEmail] = useState("");
  const [motDePasse, setMotDePasse] = useState("");
  const [nouveauMotDePasse, setNouveauMotDePasse] = useState("");
  const [erreur, setErreur] = useState("");
  const [envoi, setEnvoi] = useState(false);

  async function resoudreNom(session) {
    const { data: personne } = await supabaseLP
      .from("personnel").select("nom").eq("courriel", session.user.email).maybeSingle();
    return personne?.nom || session.user.email;
  }

  useEffect(() => {
    let actif = true;

    const verifierAcces = async (session) => {
      const { data: appAccess } = await supabase
        .from("pep_user_apps").select("app_slug")
        .eq("user_id", session.user.id).eq("app_slug", APP_SLUG).maybeSingle();
      const { data: roleRow } = await supabase
        .from("pep_user_roles").select("role").eq("user_id", session.user.id).maybeSingle();
      const estAdmin = roleRow?.role === "admin";

      if (!actif) return;
      if (!appAccess && !estAdmin) {
        setPhase("acces-refuse");
        return;
      }

      const nom = await resoudreNom(session);
      if (!actif) return;
      onDone({ userId: session.user.id, nom, email: session.user.email, accessToken: session.access_token });
    };

    supabase.auth.getSession().then(({ data: { session } }) => {
      if (!actif) return;
      if (session) verifierAcces(session);
      else setPhase("login");
    });

    const { data: subscription } = supabase.auth.onAuthStateChange((event, session) => {
      if (!actif) return;
      if (event === "PASSWORD_RECOVERY") {
        setPhase("recuperation-nouveau-mdp");
      } else if (event === "SIGNED_IN" && session) {
        verifierAcces(session);
      } else if (event === "SIGNED_OUT") {
        setPhase("login");
      }
    });

    return () => { actif = false; subscription?.subscription?.unsubscribe(); };
  }, [onDone]);

  const seConnecter = async () => {
    setErreur("");
    if (!email.trim() || !motDePasse) {
      setErreur("Entre ton courriel et ton mot de passe.");
      return;
    }
    setEnvoi(true);
    const { error } = await supabase.auth.signInWithPassword({
      email: email.trim(),
      password: motDePasse,
    });
    setEnvoi(false);
    if (error) {
      setErreur(
        error.message === "Invalid login credentials"
          ? "Courriel ou mot de passe incorrect."
          : "Impossible de se connecter pour le moment. Réessaie."
      );
      return;
    }
    // onAuthStateChange (SIGNED_IN) s'occupe de la suite.
  };

  const demanderRecuperation = async () => {
    setErreur("");
    if (!email.trim()) {
      setErreur("Entre ton courriel dans le champ ci-dessus, puis clique à nouveau sur ce lien.");
      return;
    }
    setEnvoi(true);
    const { error } = await supabase.auth.resetPasswordForEmail(email.trim(), {
      redirectTo: "https://www.toolbox-pep.com/demandes-arpentage/",
    });
    setEnvoi(false);
    if (error) {
      setErreur("Impossible d'envoyer le courriel de récupération pour le moment.");
      return;
    }
    setPhase("recuperation-demandee");
  };

  const definirNouveauMotDePasse = async () => {
    setErreur("");
    if (!nouveauMotDePasse || nouveauMotDePasse.length < 6) {
      setErreur("Le mot de passe doit contenir au moins 6 caractères.");
      return;
    }
    setEnvoi(true);
    const { error } = await supabase.auth.updateUser({ password: nouveauMotDePasse });
    setEnvoi(false);
    if (error) {
      setErreur("Impossible de mettre à jour le mot de passe. Réessaie.");
      return;
    }
    setPhase("verification");
    const { data: { session } } = await supabase.auth.getSession();
    if (session) {
      const { data: appAccess } = await supabase
        .from("pep_user_apps").select("app_slug")
        .eq("user_id", session.user.id).eq("app_slug", APP_SLUG).maybeSingle();
      const { data: roleRow } = await supabase
        .from("pep_user_roles").select("role").eq("user_id", session.user.id).maybeSingle();
      const estAdmin = roleRow?.role === "admin";
      if (!appAccess && !estAdmin) { setPhase("acces-refuse"); return; }
      const nom = await resoudreNom(session);
      onDone({ userId: session.user.id, nom, email: session.user.email, accessToken: session.access_token });
    } else {
      setPhase("login");
    }
  };

  if (phase === "verification") {
    return (
      <Cadre>
        <div style={{ textAlign: "center", color: "#6b7480", fontSize: 14 }}>Vérification de la session…</div>
      </Cadre>
    );
  }

  if (phase === "acces-refuse") {
    return (
      <Cadre>
        <div style={{ textAlign: "center", fontSize: 14.5, color: "#495260", lineHeight: 1.6, marginBottom: 18 }}>
          Ton compte existe, mais tu n'as pas accès à Demandes d'arpentage.
          Demande à un administrateur du Toolbox de te l'accorder dans le panneau
          d'administration.
        </div>
        <button
          style={BOUTON_PRINCIPAL}
          onClick={async () => { await supabase.auth.signOut(); setPhase("login"); }}
        >
          Se déconnecter
        </button>
      </Cadre>
    );
  }

  if (phase === "recuperation-demandee") {
    return (
      <Cadre>
        <div style={{ textAlign: "center", fontSize: 14.5, color: "#495260", lineHeight: 1.6, marginBottom: 18 }}>
          Un courriel a été envoyé à <strong>{email.trim()}</strong> avec un lien pour
          choisir un nouveau mot de passe.
        </div>
        <button style={LIEN_DISCRET} onClick={() => setPhase("login")}>← Retour à la connexion</button>
      </Cadre>
    );
  }

  if (phase === "recuperation-nouveau-mdp") {
    return (
      <Cadre>
        <div style={{ textAlign: "center", marginBottom: 16, fontSize: 14.5, color: "#495260" }}>
          Choisis un nouveau mot de passe.
        </div>
        <label style={LABEL_STYLE}>Nouveau mot de passe</label>
        <input
          type="password"
          value={nouveauMotDePasse}
          onChange={(e) => setNouveauMotDePasse(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && definirNouveauMotDePasse()}
          style={CHAMP_STYLE}
        />
        {erreur && <div style={{ color: "#C23B3B", fontSize: 13, marginBottom: 12 }}>{erreur}</div>}
        <button style={BOUTON_PRINCIPAL} onClick={definirNouveauMotDePasse} disabled={envoi}>
          {envoi ? "Enregistrement…" : "Enregistrer le mot de passe"}
        </button>
      </Cadre>
    );
  }

  // phase === "login"
  return (
    <Cadre>
      <label style={LABEL_STYLE}>Courriel</label>
      <input
        type="email"
        autoCapitalize="none"
        autoCorrect="off"
        value={email}
        onChange={(e) => setEmail(e.target.value)}
        onKeyDown={(e) => e.key === "Enter" && seConnecter()}
        style={CHAMP_STYLE}
      />
      <label style={LABEL_STYLE}>Mot de passe</label>
      <input
        type="password"
        value={motDePasse}
        onChange={(e) => setMotDePasse(e.target.value)}
        onKeyDown={(e) => e.key === "Enter" && seConnecter()}
        style={CHAMP_STYLE}
      />
      {erreur && <div style={{ color: "#C23B3B", fontSize: 13, marginBottom: 12 }}>{erreur}</div>}
      <button style={BOUTON_PRINCIPAL} onClick={seConnecter} disabled={envoi}>
        {envoi ? "Connexion…" : "Se connecter"}
      </button>
      <button style={LIEN_DISCRET} onClick={demanderRecuperation}>
        Mot de passe oublié ?
      </button>
    </Cadre>
  );
}
