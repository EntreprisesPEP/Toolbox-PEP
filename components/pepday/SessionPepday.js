import { useState } from 'react';
import GardeConnexion from '../commun/GardeConnexion';
import { APP_SLUG, NOM_APP } from '../../lib/pepday/constantes';

// ---------------------------------------------------------------------------
// PEPDAY — ADAPTATEUR DE SESSION  ·  VERSION TOOLBOX
//
// C'EST LE SEUL FICHIER QUI CHANGE À L'IMPORT DANS LE TOOLBOX.
//
// Ici, la session est celle du Toolbox : GardeConnexion vérifie qu'une
// session existe (sinon retour au hub avec ?retour=/pepday/) et que la
// personne a le droit d'ouvrir l'app « pepday » (pep_user_apps, ou rôle
// admin). L'app lit alors le schéma Supabase pepday; ses propres rôles
// (dispatch, contremaître…) viennent de la table pepday.membres.
//
// Le mode démonstration reste accessible dans le Toolbox avec ?demo=1 dans
// l'adresse (/pepday/?demo=1) — toujours derrière GardeConnexion.
//
// Le contrat est le même que la version du dépôt de développement :
//   <SessionPepday>{(session) => ...}</SessionPepday>
//   session = { userId, nom, poste, email, estAdmin, source }
// ---------------------------------------------------------------------------

export default function SessionPepday({ children }) {
  const [session, setSession] = useState(null);
  if (!session) {
    return <GardeConnexion appSlug={APP_SLUG} nomApp={NOM_APP} onPret={setSession} />;
  }
  return children({
    userId: session.userId,
    nom: session.nom,
    poste: session.poste,
    email: session.email,
    estAdmin: Boolean(session.estAdmin),
    source: 'toolbox',
  });
}
