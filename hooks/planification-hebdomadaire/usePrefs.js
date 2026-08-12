import { useEffect, useState } from 'react';

const KEY = 'pep-planif-prefs-v1';
const DEFAULTS = {
  theme: 'jour',
  role: 'view',
  sortField1: null, sortDir1: 'asc',
  sortField3: null, sortDir3: 'asc',
  filters: { charge: null, surintendant: null },
};

export function usePrefs() {
  const [prefs, setPrefs] = useState(DEFAULTS);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    try {
      const raw = window.localStorage.getItem(KEY);
      if (raw) setPrefs({ ...DEFAULTS, ...JSON.parse(raw) });
    } catch (e) {
      /* ignore */
    }
    setReady(true);
  }, []);

  useEffect(() => {
    if (!ready) return;
    try {
      window.localStorage.setItem(KEY, JSON.stringify(prefs));
    } catch (e) {
      /* ignore */
    }
  }, [prefs, ready]);

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', prefs.theme);
  }, [prefs.theme]);

  function update(patch) {
    setPrefs((p) => ({ ...p, ...patch }));
  }

  return { prefs, update, ready };
}
