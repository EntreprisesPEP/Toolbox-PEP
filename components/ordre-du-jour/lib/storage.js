import { supabase } from "./supabaseClient";

/*
  Adaptateur de stockage — même signature que l'ancien window.storage
  des artifacts Claude, pour ne pas avoir à réécrire la logique de l'app.

  - shared = true  -> stocké dans Supabase (table kv_store), visible par tout le monde
  - shared = false -> stocké dans localStorage du navigateur (personnel, ex: brouillons)
*/

function localGet(key) {
  const raw = window.localStorage.getItem(key);
  if (raw === null) return null;
  return { key, value: raw, shared: false };
}

function localSet(key, value) {
  window.localStorage.setItem(key, value);
  return { key, value, shared: false };
}

function localDelete(key) {
  const existed = window.localStorage.getItem(key) !== null;
  window.localStorage.removeItem(key);
  return { key, deleted: existed, shared: false };
}

function localList(prefix = "") {
  const keys = [];
  for (let i = 0; i < window.localStorage.length; i++) {
    const k = window.localStorage.key(i);
    if (k && k.startsWith(prefix)) keys.push(k);
  }
  return { keys, prefix, shared: false };
}

export const storage = {
  async get(key, shared = false) {
    if (!shared) return localGet(key);
    const { data, error } = await supabase
      .from("kv_store")
      .select("value")
      .eq("key", key)
      .maybeSingle();
    if (error) throw error;
    if (!data) return null;
    return { key, value: data.value, shared: true };
  },

  async set(key, value, shared = false) {
    if (!shared) return localSet(key, value);
    const { error } = await supabase
      .from("kv_store")
      .upsert({ key, value, updated_at: new Date().toISOString() }, { onConflict: "key" });
    if (error) throw error;
    return { key, value, shared: true };
  },

  async delete(key, shared = false) {
    if (!shared) return localDelete(key);
    const { error } = await supabase.from("kv_store").delete().eq("key", key);
    if (error) throw error;
    return { key, deleted: true, shared: true };
  },

  async list(prefix = "", shared = false) {
    if (!shared) return localList(prefix);
    const { data, error } = await supabase
      .from("kv_store")
      .select("key")
      .like("key", `${prefix}%`);
    if (error) throw error;
    return { keys: (data || []).map((r) => r.key), prefix, shared: true };
  },
};
