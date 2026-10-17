import { useCallback, useEffect, useRef, useState } from 'react';
import { supabase } from '../../lib/planification-hebdomadaire/supabaseClient';

// ---------------------------------------------------------------------------
// L'ÉCRAN PARTAGÉ — ce que l'animateur montre à la télé, en direct
//
// Deux choses doivent suivre l'animateur sans passer par la base :
//   - le DÉFILEMENT : la télé descend quand il descend;
//   - la FRAPPE : on voit le texte s'écrire pendant qu'il tape.
//
// Ni l'un ni l'autre ne doit toucher app_settings. Une écriture en base
// déclenche un rechargement complet chez tout le monde : à chaque cran de
// molette et à chaque lettre, l'app passerait son temps à se recharger.
//
// On passe donc par un canal « broadcast » de Supabase : des messages qui
// traversent en temps réel sans rien écrire ni recharger. Le texte, lui, est
// bel et bien enregistré — mais une seule fois, une demi-seconde après la
// dernière lettre (voir AutoTextarea). Le broadcast ne sert qu'à l'affichage
// entre deux enregistrements.
//
// `self: false` : l'animateur ne se réécoute pas lui-même, sinon sa propre
// position de défilement lui reviendrait et son écran sauterait.
// ---------------------------------------------------------------------------

const CANAL = 'planif-ecran';

export function useEcranPartage({ actif, suiveur }) {
  const canal = useRef(null);
  const [defile, setDefile] = useState(null);
  const [frappes, setFrappes] = useState({});

  useEffect(() => {
    if (!actif) return undefined;
    const c = supabase.channel(CANAL, { config: { broadcast: { self: false } } });
    if (suiveur) {
      c.on('broadcast', { event: 'defile' }, ({ payload }) => {
        setDefile({ fraction: payload && payload.fraction, t: Date.now() });
      });
      c.on('broadcast', { event: 'frappe' }, ({ payload }) => {
        if (!payload || !payload.cle) return;
        setFrappes((f) => ({ ...f, [payload.cle]: payload.texte }));
      });
    }
    c.subscribe();
    canal.current = c;
    return () => { supabase.removeChannel(c); canal.current = null; };
  }, [actif, suiveur]);

  const emettre = useCallback((event, payload) => {
    const c = canal.current;
    if (!c) return;
    try { c.send({ type: 'broadcast', event, payload }); } catch (e) { /* un message perdu n'est pas grave */ }
  }, []);

  return { defile, frappes, emettre };
}
