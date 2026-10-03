import React, { useState, useEffect, useCallback, useMemo } from "react";
import {
  Truck, Users, Wrench, ClipboardList, Package, ChevronDown, Fuel, Bell, Mail,
  Save, CheckCircle2, AlertCircle, RefreshCw, Plus, ChevronRight, SendHorizontal
} from "lucide-react";
import { storage } from "./lib/storage";
import { supabase } from "./lib/supabaseClient";
import { entetesAuth } from "./lib/entetesAuth";
import GardeConnexion from "../commun/GardeConnexion";
import EnTeteApp from "../commun/EnTeteApp";
import { useModePep } from "../commun/ThemeToolbox";
import PaletteOrdreDuJour from "./PaletteOrdreDuJour";

/* Hook responsive */
function useWindowWidth() {
  const [w, setW] = useState(() => window.innerWidth);
  useEffect(() => {
    const h = () => setW(window.innerWidth);
    window.addEventListener("resize", h);
    return () => window.removeEventListener("resize", h);
  }, []);
  return w;
}
// Breakpoints: phone < 640, tablet 640-1024, desktop > 1024
function useDevice() {
  const w = useWindowWidth();
  return { isPhone: w < 640, isTablet: w >= 640 && w < 1024, isDesktop: w >= 1024, width: w };
}

// Revision 66 — LOGO_PEP retire : 74 Ko (26 % du fichier) d'une image en
// base64 qu'aucun composant n'affichait. Elle partait dans le navigateur
// de chaque personne a chaque ouverture de l'app.

/* ---------------------------------------------------------------------
   TOKENS
   bg #EDEFF1 · surface #FFFFFF · ink #15181B · charbon #1B1B1D
   rouge PEP #E4022E (accent) · or #F0A202 (ajouter) · vert #3C8C5D (garder)
   red #C23B3B (retirer) · line #D7DBE0
--------------------------------------------------------------------- */

const ROLES = [
  { value: "contremaitre", label: "Contremaître", groupe: "Terrain" },
  { value: "dispatch_camions", label: "Dispatch — Transport en vrac", groupe: "Dispatch" },
  { value: "dispatch_machines", label: "Dispatch — Transport petites machines", groupe: "Dispatch" },
  { value: "surintendant", label: "Surintendant", groupe: "Direction" },
  { value: "charge_projet", label: "Chargé de projet", groupe: "Direction" },
  { value: "arpenteur", label: "Arpenteur", groupe: "Direction" },
  { value: "coordonnateur", label: "Coordonnateur de projet", groupe: "Direction" },
  { value: "estimateur", label: "Estimateur", groupe: "Direction" },
  { value: "directeur", label: "Directeur construction", groupe: "Direction" },
  { value: "president", label: "Président", groupe: "Direction" },
];

// Combinaisons rôle+accès couvrant chaque vue distincte de l'app — utilisées
// uniquement par le sélecteur d'Aperçu (mode test, profils.peut_previsualiser).
// Ne change QUE l'affichage : les données restent enregistrées sous la vraie
// identité (nom/userId) de la personne connectée.
const OPTIONS_APERCU = [
  { label: "Contremaître", role: "contremaitre", accesSpecial: "tout" },
  { label: "Surintendant", role: "surintendant", accesSpecial: "tout" },
  { label: "Gestion de projet (vue complète)", role: "directeur", accesSpecial: "tout" },
  { label: "Dispatch — Camions", role: "dispatch_camions", accesSpecial: "camions" },
  { label: "Dispatch — Machinerie", role: "dispatch_machines", accesSpecial: "machinerie" },
];

// Qui peut laisser un commentaire de révision sur une requête (ex: signaler
// qu'une équipe semble trop grosse pour l'ouvrage prévu) : les 4 surintendants
// (par leur rôle) + Davio et William spécifiquement (par leur nom) — 6 personnes au total.
function peutCommenter(profil) {
  return profil?.role === "surintendant" || profil?.nom === "William Dubreuil" || profil?.nom === "Davio Pallotta";
}

// --- Centre de notifications (boîte personnelle par personne) ---------
async function creerNotification(destinataireUserId, type, titre, corps, cible) {
  try {
    const cle = `notif:${destinataireUserId}:${new Date().toISOString()}:${Math.random().toString(36).slice(2, 7)}`;
    await storage.set(cle, JSON.stringify({ type, titre, corps, cible, lu: false, horodatage: new Date().toISOString() }), true);
  } catch (e) { /* notification secondaire — on ignore l'échec */ }
}
// Nouvelle requête ou requête modifiée -> tout le monde sauf les contremaîtres et l'auteur
async function notifierNouvelleRequete(profil, cible, titre, corps) {
  const destinataires = MEMBRES.filter((m) => m.role !== "contremaitre" && m.userId !== profil.userId);
  await Promise.all(destinataires.map((m) => creerNotification(m.userId, "nouvelle_requete", titre, corps, cible)));
}
// Commentaire ou écart signalé -> le propriétaire de la fiche + tous ceux qui peuvent commenter (sauf l'auteur du message)
async function notifierCommentaire(profil, proprietaireUserId, cible, titre, corps, type = "commentaire") {
  const idsUniques = new Set();
  if (proprietaireUserId !== profil.userId) idsUniques.add(proprietaireUserId);
  MEMBRES.filter((m) => peutCommenter(m) && m.userId !== profil.userId).forEach((m) => idsUniques.add(m.userId));
  await Promise.all([...idsUniques].map((id) => creerNotification(id, type, titre, corps, cible)));
}

// Libellés affichés pour chaque type d'accès spécial (vues détaillées)

// Cache des membres — remplace l'ancien tableau USERS codé en dur.
// Rempli en interrogeant ordre_du_jour.profils (rempli depuis le panneau
// /administration/ du Toolbox). Voir chargerMembresCache() ci-dessous,
// appelé au montage de AppInner et à chaque connexion.
let MEMBRES = [];
async function chargerMembresCache() {
  try {
    const { data, error } = await supabase.from("profils").select("user_id, nom, role, acces_special");
    if (error) throw error;
    MEMBRES = (data || []).map((p) => ({
      userId: p.user_id, nom: p.nom, role: p.role, accesSpecial: p.acces_special,
    }));
  } catch (e) {
    // Hors ligne ou erreur passagère — on garde l'ancien cache plutôt que
    // de planter l'app (comportement identique à chargerJoursFeriesCache).
  }
}

// Liste de projets — 5 projets d'essai. Remplacer par la vraie liste quand disponible.
// Liste des projets actifs (à jour juin 2026). Il manque encore 3 projets — à ajouter dès qu'ils seront fournis.
// Format de chaque entrée: { numero, nom, adresse }
const PROJETS_DONNEES = [
  { numero: "26-190", nom: "Ville St-Laurent Plomberie", adresse: "7300 Chemin De La Côte-De-Liesse, Saint-Laurent", charge: "Santiago Sanchez", surintendant: "François Ouellet" },
  { numero: "26-177", nom: "Plomberie Dagenais", adresse: "1630 Boulevard Dagenais Ouest, Laval", charge: "Santiago Sanchez", surintendant: "Tony Moschetta" },
  { numero: "26-172", nom: "Coupe Springhill", adresse: "221 Rue Springhill, Rosemère", charge: "William Dubreuil", surintendant: "Stéphane Lalande" },
  { numero: "26-171", nom: "Outlet A13", adresse: "2400 Desserte Ouest Chomedey (A-13), Laval", charge: "William Dubreuil", surintendant: "Stephan Nadeau" },
  { numero: "26-158", nom: "Distech QMD", adresse: "4205 Place De Java, Brossard", charge: "Mathis Lapointe", surintendant: "François Ouellet" },
  { numero: "26-153", nom: "Stationnement Morea", adresse: "12285 Rue De Chaumont, Mirabel", charge: "Mathis Lapointe", surintendant: "Stéphane Lalande" },
  { numero: "26-123", nom: "Alubase 3.0", adresse: "3175 Avenue De La Gare, Mascouche", charge: "Matteo Carbone", surintendant: "Tony Moschetta" },
  { numero: "26-119", nom: "Agrandissement maison Bellevue", adresse: "33 Avenue Bellevue, Laval", charge: "William Dubreuil", surintendant: "Tony Moschetta" },
  { numero: "26-112", nom: "Le Bohar", adresse: "500 Boulevard Harwood, Vaudreuil-Dorion", charge: "Santiago Sanchez", surintendant: "François Ouellet" },
  { numero: "25-238", nom: "Mini-Entrepôt Orange", adresse: "100 rue Prévost, Boisbriand", charge: "Mathis Lapointe", surintendant: "Tony Moschetta" },
  { numero: "25-245", nom: "Kim Phat Jarry", adresse: "3733 Rue Jarry Est, Montréal, Québec H1Z 2G1", charge: "Matteo Carbone", surintendant: "François Ouellet" },
  { numero: "25-235", nom: "Harbour Lachine", adresse: "1900 Rue Notre-Dame, Lachine, Québec H8S 2G2", charge: "Santiago Sanchez", surintendant: "François Ouellet" },
  { numero: "25-232", nom: "Anjou-Ford", adresse: "7000 Boulevard Louis-H.-Lafontaine, Anjou", charge: "Mathis Lapointe", surintendant: "Tony Moschetta" },
  { numero: "25-220", nom: "Civil Jasmin", adresse: "200 Rue Hector-Lanthier, Boisbriand", charge: "William Dubreuil", surintendant: "François Ouellet" },
  { numero: "25-214", nom: "Montpak", adresse: "5730 Place Maurice-Cullen, Laval", charge: "Matteo Carbone", surintendant: "François Ouellet" },
  { numero: "25-213", nom: "Kim Phat Phase 2", adresse: "1000 Boulevard St-Martin Ouest, Laval", charge: "Mathis Lapointe", surintendant: "Stephan Nadeau" },
  { numero: "25-207", nom: "Terrain Hamelin", adresse: "1401 Montée Masson, Laval", charge: "William Dubreuil", surintendant: "Stephan Nadeau" },
  { numero: "25-204", nom: "Bureau Hulix", adresse: "1480 Montée Masson, Laval", charge: "William Dubreuil", surintendant: "Tony Moschetta" },
  { numero: "25-199", nom: "Métro St-Hilaire", adresse: "325 rue Honorius Charbonneau, Mont-St-Hilaire", charge: "Mathis Lapointe", surintendant: "François Ouellet" },
  { numero: "25-192", nom: "Momento", adresse: "5660 rue de Marseille, Montréal", charge: "Matteo Carbone", surintendant: "Tony Moschetta" },
  { numero: "25-190", nom: "Deux-Montagnes", adresse: "577 20e Avenue, Deux-Montagnes", charge: "Mathis Lapointe", surintendant: "Tony Moschetta" },
  { numero: "25-172", nom: "SkyBlu Phase 3", adresse: "12039 Rue de Blois, Mirabel", charge: "Mathis Lapointe", surintendant: "Stéphane Lalande" },
  { numero: "25-171", nom: "Proanima Civil", adresse: "9350 Boul. Pie-IX, Montréal", charge: "Thomas Lawrence", surintendant: "Tony Moschetta" },
  { numero: "25-170", nom: "Maraicher", adresse: "9230 Boul. Pie-IX, Montréal", charge: "Thomas Lawrence", surintendant: "Tony Moschetta" },
  { numero: "25-168", nom: "PA SuperMarché", adresse: "19 Donegani Avenue, Pointe-Claire", charge: "William Dubreuil", surintendant: "Stephan Nadeau" },
  { numero: "25-165", nom: "Maison Ray", adresse: "1689 Route 344, St-Placide", charge: "William Dubreuil", surintendant: "Stéphane Lalande" },
  { numero: "25-155", nom: "Maxi Mirabel", adresse: "8229 Rue St-Jacques, Mirabel", charge: "Mathis Lapointe", surintendant: "Tony Moschetta" },
  { numero: "25-151", nom: "QDL Phase 2", adresse: "1400 René-Lévesque Est, Montréal", charge: "Santiago Sanchez", surintendant: "François Ouellet" },
  { numero: "25-144", nom: "CITTA B", adresse: "4765 Boulevard Robert, Montréal", charge: "Matteo Carbone", surintendant: "François Ouellet" },
  { numero: "25-120", nom: "Lineage", adresse: "6100 Chemin de la Côte-de-Liesse, Ville St-Laurent", charge: "William Dubreuil", surintendant: "François Ouellet" },
  { numero: "25-113", nom: "Exal Quartier Olympique", adresse: "5222 rue Sherbrooke Est, Montréal", charge: "Matteo Carbone", surintendant: "Tony Moschetta" },
  { numero: "24-286", nom: "Quartier des Lumières - Radio-Canada", adresse: "1400 René-Lévesque Est, Montréal", charge: "Santiago Sanchez", surintendant: "François Ouellet" },
  { numero: "24-284", nom: "Centropolis Laval", adresse: "2255 Bd Daniel-Johnson, Laval", charge: "Matteo Carbone", surintendant: "François Ouellet" },
  { numero: "24-280", nom: "St-Elzéar", adresse: "135 Boulevard Saint-Elzéar Ouest, Laval", charge: "Mathis Lapointe", surintendant: "Tony Moschetta" },
  { numero: "24-276", nom: "Le Nua Bellerose", adresse: "2203 Boulevard Des Laurentides, Laval", charge: "Mathis Lapointe", surintendant: "Tony Moschetta" },
  { numero: "24-268", nom: "HOOP Vaudreuil", adresse: "3041 Blvd. De La Gare, Vaudreuil-Dorion", charge: "Mathis Lapointe", surintendant: "Stephan Nadeau" },
  { numero: "24-266", nom: "Faubourg-Lacordaire", adresse: "5755 Boulevard Des Grandes-Prairies, St-Léonard", charge: "Matteo Carbone", surintendant: "Tony Moschetta" },
  { numero: "24-251", nom: "Immeuble Assomption", adresse: "5501 Rue De Marseille, Montréal", charge: "William Dubreuil", surintendant: "Tony Moschetta" },
  { numero: "24-244", nom: "Curé-Labelle", adresse: "160 Curé-Labelle, Laval", charge: "Matteo Carbone", surintendant: "François Ouellet" },
  { numero: "24-231", nom: "Centre Pneu à rabais", adresse: "848 Rue Lamontagne, St-Jérôme", charge: "William Dubreuil", surintendant: "François Ouellet" },
  { numero: "24-203", nom: "Plaza Ste-Thérèse", adresse: "300 Sicard, Ste-Thérèse", charge: "Thomas Lawrence", surintendant: "François Ouellet" },
  { numero: "24-196", nom: "Azur", adresse: "1829 Chemin Gascon, Terrebonne", charge: "William Dubreuil", surintendant: "Tony Moschetta" },
  { numero: "24-191", nom: "Bois-Franc", adresse: "5375 Boul. Henri Bourassa Ouest, Montréal", charge: "Matteo Carbone", surintendant: "Tony Moschetta" },
  { numero: "24-165", nom: "1345 Av. Des Lacasse", adresse: "1345 Av. Des Lacasse, Laval", charge: "John Vannicola", surintendant: "Tony Moschetta" },
  { numero: "24-141", nom: "Clément Phase 4", adresse: "9440 Clément, Montréal", charge: "William Dubreuil", surintendant: "Stéphane Lalande" },
  { numero: "24-113", nom: "Léo-Lacombe", adresse: "1300 Avenue Léo-Lacombe, Laval", charge: "Santiago Sanchez", surintendant: "François Ouellet" },
  { numero: "24-102", nom: "CSL", adresse: "4845 Côte St-Luc Road, Montréal", charge: "William Dubreuil", surintendant: "Tony Moschetta" },
  { numero: "23-215", nom: "Gardenia", adresse: "775 1re Avenue, Lachine", charge: "William Dubreuil", surintendant: "François Ouellet" },
  { numero: "23-212", nom: "3800 DDO", adresse: "3800 Boulevard des Sources, DDO", charge: "William Dubreuil", surintendant: "Stéphane Lalande" },
  { numero: "22-056", nom: "Complexe Santé Mtl-Nord", adresse: "3955 Rue Fleury Est, Montréal", charge: "Bryan Wong", surintendant: "Tony Moschetta" },
];
const PROJETS = PROJETS_DONNEES.map((p) => `${p.numero} — ${p.nom}`);
function adresseDuProjet(chantier) {
  const p = PROJETS_DONNEES.find((p) => `${p.numero} — ${p.nom}` === chantier);
  return p?.adresse || "";
}

// Postes disponibles pour le personnel additionnel/retiré
const POSTES = [
  { key: "contremaitre", label: "Contremaître" },
  { key: "signaleur", label: "Signaleur" },
  { key: "journalier", label: "Journalier" },
  { key: "operateur", label: "Opérateur" },
];

// Types de machines — flotte réelle PEP2000 (source: FlotteAccess v3.1, juillet 2026)
// Le champ "stock" indique le nombre d'unités dans la flotte (pour info dispatch).
const EQUIPEMENTS = [
  { key: "excavatrice",  label: "Excavatrice",  stock: 47 },
  { key: "compacteur",   label: "Compacteur (Corniver)",   stock: 16 },
  { key: "loader",       label: "Loader",        stock: 13 },
  { key: "skid_steer",   label: "Skid steer",    stock: 11 },
  { key: "rouleau",      label: "Rouleau",       stock: 10 },
  { key: "belier",       label: "Bélier",        stock:  6 },
  { key: "pepine",       label: "Pépine",        stock:  2 },
  { key: "grader",       label: "Grader",        stock:  2 },
  { key: "hors_route",   label: "Hors route",    stock:  2 },
  { key: "brouette",     label: "Brouette",      stock:  2 },
  { key: "chargeur",     label: "Chargeur",      stock:  1 },
  { key: "paveuse",      label: "Paveuse",       stock:  1 },
  { key: "autre",        label: "Autre",         stock:  3 },
];

// Accessoires — inventaire réel PEP2000 (source: FlotteAccess v3.1, juillet 2026)
const ACCESSOIRES = [
  { key: "godet",        label: "Godet",         stock: 12 },
  { key: "ripper",       label: "Ripper",        stock: 10 },
  { key: "marteau",      label: "Marteau",       stock: 18 },
  { key: "plaque",       label: "Plaque",        stock:  1 },
];

const STATUTS = {
  machinerie: [
    { value: "retirer", label: "Retirer", tone: "red" },
    { value: "meme", label: "Aucun changement", tone: "gray" },
    { value: "ajouter", label: "Ajouter", tone: "green" },
  ],
};

const TONE_HEX = {
  blue:   "var(--odj-lien)",    // ajout personnel
  steel:  "var(--odj-accent)",  // même personnel
  orange: "var(--odj-orange)",  // retrait personnel
  green:  "var(--odj-ok)",      // ajout machinerie
  gray:   "var(--odj-dim)",     // même machinerie
  red:    "var(--odj-err)",     // retrait machinerie
  rust:   "var(--odj-ambre)",   // conservé pour autres usages
};

function emptyLignes(list) {
  const o = {};
  list.forEach((item) => { o[item.key] = { qte: "0", commentaire: "" }; });
  return o;
}

// Clé publique VAPID — sert à identifier l'app auprès des navigateurs pour
// les notifications push. Pas un secret (contrairement à la clé privée,
// gardée uniquement côté serveur).
const VAPID_PUBLIC_KEY = process.env.NEXT_PUBLIC_ORDREDUJOUR_VAPID_PUBLIC_KEY || "";

function urlBase64ToUint8Array(base64String) {
  const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, "+").replace(/_/g, "/");
  const rawData = window.atob(base64);
  const outputArray = new Uint8Array(rawData.length);
  for (let i = 0; i < rawData.length; ++i) outputArray[i] = rawData.charCodeAt(i);
  return outputArray;
}

async function hashEndpoint(endpoint) {
  try {
    const enc = new TextEncoder().encode(endpoint);
    const buf = await crypto.subtle.digest("SHA-256", enc);
    return Array.from(new Uint8Array(buf)).map((b) => b.toString(16).padStart(2, "0")).join("").slice(0, 24);
  } catch (e) {
    // repli si crypto.subtle indisponible (ex: contexte non sécurisé)
    return String(endpoint.length) + endpoint.slice(-20).replace(/[^a-zA-Z0-9]/g, "");
  }
}

const emptyFiche = () => ({
  chantier: "",
  aucunTravaux: false, // vrai quand le contremaître signale explicitement qu'il n'y a pas de travaux prévus
  personnel: {
    // Nombre total requis pour chaque poste (pas un ajout/retrait) — le
    // contremaître indique l'équipe complète nécessaire chaque jour.
    postes: emptyLignes(POSTES),
    notes: "",
  },
  machinerie: {
    statut: "meme",
    equipements: emptyLignes(EQUIPEMENTS),
    accessoires: emptyLignes(ACCESSOIRES),
    notes: "",
    // mémoire séparée pour chaque statut — évite de perdre les données quand on switche
    _ajout: { equipements: emptyLignes(EQUIPEMENTS), accessoires: emptyLignes(ACCESSOIRES) },
    _retrait: { equipements: emptyLignes(EQUIPEMENTS), accessoires: emptyLignes(ACCESSOIRES) },
  },
  diesel: {
    requis: "", // "" | "oui" | "non"
    grosses: "0", // nombre de grosses machines à remplir
    petites: "0", // nombre de petites machines à remplir
    commentaire: "",
  },
  // Fil de discussion sur la requête — surintendants/Davio/William peuvent
  // commenter (ex: "on pourrait faire ça à 3 gars"), et le contremaître peut
  // répondre. Remis à zéro à chaque nouvelle soumission/modification de la
  // fiche par le contremaître (nouvelle version = nouvelle discussion).
  commentaires: [], // [{ auteur, texte, horodatage }]
  camions: {
    douze: "0", douzePlein: false, douzeVide: false, douzeToile: false,
    deux: "0", deuxPlein: false, deuxVide: false, deuxToile: false,
    trois: "0", troisPlein: false, troisVide: false, troisToile: false,
    notes: "",
  },
  travaux: "",
  materiel: "",
  maj: null,
});

function slugify(s) {
  return (s || "")
    .normalize("NFD").replace(/[\u0300-\u036f]/g, "")
    .toLowerCase().trim().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "");
}
function capitaliserMots(s) {
  return (s || "").split(" ").filter(Boolean).map((m) =>
    m.split("-").map((p) => p.charAt(0).toUpperCase() + p.slice(1)).join("-")
  ).join(" ");
}
// NOTE Phase 3 : les clés de stockage (fiche:{date}:{id}, etc.) utilisent
// encore historiquement le nom de champ "slug" un peu partout dans ce
// fichier, mais la valeur qu'il contient est maintenant le user_id
// (UUID Supabase) de la personne, plus un slug lisible dérivé du nom.
function nomDepuisUserId(userId) {
  const m = MEMBRES.find((m) => m.userId === userId);
  return m ? m.nom : "Utilisateur";
}
// Gestion des demandes multiples par personne/jour :
// 1ère demande -> fiche:{date}:{slug}
// 2e, 3e... demande -> fiche:{date}:{slug}::2, ::3, etc.
function ficheKey(date, slug, seq = 1) {
  return seq <= 1 ? `fiche:${date}:${slug}` : `fiche:${date}:${slug}::${seq}`;
}
function parseSeqSuffix(key) {
  const m = key.match(/::(\d+)$/);
  return m ? parseInt(m[1], 10) : 1;
}
// Cherche la dernière requête soumise par cette personne AVANT la date donnée
// (jusqu'à 10 jours en arrière), pour comparer "aujourd'hui vs la dernière fois".
// Retourne les postes (main d'oeuvre) de cette requête précédente, ou null.
async function trouverPostesPrecedents(dateActuelle, slug) {
  for (let i = 1; i <= 10; i++) {
    const d = new Date(dateActuelle + "T12:00:00");
    d.setDate(d.getDate() - i);
    const dISO = isoDate(d);
    let meilleure = null;
    try {
      const r = await storage.get(ficheKey(dISO, slug, 1), true);
      if (r) meilleure = { seq: 1, value: r.value };
    } catch (e) { /* rien ce jour-là */ }
    try {
      const listRes = await storage.list(`fiche:${dISO}:${slug}::`, true);
      for (const k of listRes?.keys || []) {
        const seq = parseSeqSuffix(k);
        if (!meilleure || seq > meilleure.seq) {
          try {
            const r2 = await storage.get(k, true);
            if (r2) meilleure = { seq, value: r2.value };
          } catch (e) { /* entrée corrompue ignorée */ }
        }
      }
    } catch (e) { /* pas de demandes additionnelles */ }
    if (meilleure) {
      try {
        const parsed = JSON.parse(meilleure.value);
        return { postes: { ...emptyLignes(POSTES), ...(parsed.personnel?.postes || {}) }, date: dISO };
      } catch (e) { return null; }
    }
  }
  return null;
}
// Journal des requêtes (audit log) — un résumé léger est stocké à chaque
// envoi, plutôt qu'une copie complète de la fiche, pour économiser l'espace.
function compterLignes(obj) {
  return Object.values(obj || {}).reduce((s, l) => s + (parseInt(l?.qte, 10) || 0), 0);
}
function resumerFiche(f) {
  const parts = [];
  const persTotal = compterLignes(f?.personnel?.postes);
  if (persTotal) parts.push(`Personnel : ${persTotal}`);
  const machAjout = compterLignes(f?.machinerie?._ajout?.equipements) + compterLignes(f?.machinerie?._ajout?.accessoires);
  const machRetrait = compterLignes(f?.machinerie?._retrait?.equipements) + compterLignes(f?.machinerie?._retrait?.accessoires);
  if (machAjout) parts.push(`Machinerie +${machAjout}`);
  if (machRetrait) parts.push(`Machinerie -${machRetrait}`);
  const camions = (parseInt(f?.camions?.douze, 10) || 0) + (parseInt(f?.camions?.deux, 10) || 0) + (parseInt(f?.camions?.trois, 10) || 0);
  if (camions) parts.push(`Camions ${camions}`);
  return parts.length ? parts.join(" · ") : "Aucun changement quantifiable";
}
// Revision 66 — AAAA-MM-JJ dans le fuseau de Montreal, et non en UTC.
// toISOString() donne l'heure UTC : passe 20 h l'ete (19 h l'hiver), on est
// deja au lendemain la-bas, et la requete du contremaitre se deposait sur la
// mauvaise journee — le dispatch ne la voyait pas, et le rappel du midi ne
// relancait personne puisqu'il trouvait une fiche. Aucun signal d'erreur.
// Meme cause et meme correctif que le bogue du Defi Strava (revision 57);
// meme methode que dateDuJourEst() dans lib/commun/planification.js.
const FORMAT_DATE_EST = new Intl.DateTimeFormat("en-CA", {
  timeZone: "America/Toronto", year: "numeric", month: "2-digit", day: "2-digit",
});
function isoDate(d) { return FORMAT_DATE_EST.format(d); }

const MOIS_FR = {
  janvier: 1, février: 2, fevrier: 2, mars: 3, avril: 4, mai: 5, juin: 6,
  juillet: 7, août: 8, aout: 8, septembre: 9, octobre: 10, novembre: 11, décembre: 12, decembre: 12,
};
// Essaie de reconnaître une date dans plusieurs formats courants et retourne
// un YYYY-MM-DD, ou null si le format n'est pas reconnu.
// Reconnaît une ligne du type "2026-06-24 - St-Jean-Baptiste" ou juste une
// date seule. Retourne { date, description } ou null si rien n'est reconnu.
function parserLigneFerie(ligne) {
  const s = ligne.trim().replace(/^[-•*]\s*/, ""); // retire les puces de liste
  if (!s) return null;

  let m, date;

  // YYYY-MM-DD au début de la ligne
  m = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/);
  if (m) date = `${m[1]}-${String(m[2]).padStart(2, "0")}-${String(m[3]).padStart(2, "0")}`;

  // DD/MM/YYYY ou DD-MM-YYYY au début de la ligne
  if (!date) {
    m = s.match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{4})/);
    if (m) date = `${m[3]}-${String(m[1]).padStart(2, "0")}-${String(m[2]).padStart(2, "0")}`;
  }

  // "1 janvier 2026" ou "1er janvier 2026" au début de la ligne
  if (!date) {
    m = s.toLowerCase().match(/^(\d{1,2})(?:er)?\s+([a-zéû]+)\s+(\d{4})/);
    if (m && MOIS_FR[m[2]]) date = `${m[3]}-${String(MOIS_FR[m[2]]).padStart(2, "0")}-${String(m[1]).padStart(2, "0")}`;
  }

  if (!date) return null;

  // Tout ce qui suit la date reconnue devient la description, en retirant
  // les séparateurs habituels (-, —, ,, :, tabulation) au début.
  const reste = s.slice(m[0].length).trim().replace(/^[-—,:\t]+\s*/, "");
  return { date, description: reste || "" };
}
// Copie en mémoire des jours fériés — chargée une fois au démarrage de l'app
// (voir chargerJoursFeriesCache) pour que tomorrowISO() puisse les sauter de
// façon synchrone, comme elle le fait déjà pour les fins de semaine.
let JOURS_FERIES_CACHE = [];
async function chargerJoursFeriesCache() {
  try {
    const r = await storage.get("jours-feries", true);
    if (r) JOURS_FERIES_CACHE = JSON.parse(r.value);
  } catch (e) { /* aucun jour férié enregistré encore */ }
}

// Vérifie si une date est fériée, peu importe si l'entrée est une simple
// chaîne (ancien format) ou un objet { date, description } (nouveau format).
function estJourFerie(liste, iso) {
  return liste.some((f) => (typeof f === "string" ? f : f.date) === iso);
}

function tomorrowISO() {
  const d = new Date();
  d.setDate(d.getDate() + 1);
  // saute les fins de semaine ET les jours fériés enregistrés
  while (d.getDay() === 0 || d.getDay() === 6 || estJourFerie(JOURS_FERIES_CACHE, isoDate(d))) {
    d.setDate(d.getDate() + 1);
  }
  return isoDate(d);
}
// Le vrai jour civil suivant, sans sauter la fin de semaine — utilisé quand
// un contremaître veut exceptionnellement soumettre une requête pour un samedi.
function demainReel() {
  const d = new Date();
  d.setDate(d.getDate() + 1);
  return isoDate(d);
}
function deuxDernieresSemaines() {
  // De 3 jours dans le futur (pour couvrir le saut vendredi -> lundi) jusqu'à
  // 13 jours en arrière (17 dates), du plus récent au plus ancien
  const dates = [];
  for (let i = 3; i >= -13; i--) {
    const d = new Date();
    d.setDate(d.getDate() + i);
    dates.push(isoDate(d));
  }
  return dates;
}
function labelDate(iso) {
  const d = new Date(iso + "T12:00:00");
  const s = d.toLocaleDateString("fr-CA", { weekday: "long", day: "numeric", month: "long" });
  return s.charAt(0).toUpperCase() + s.slice(1);
}

function useGoogleFonts() {
  useEffect(() => {
    const l = document.createElement("link");
    l.rel = "stylesheet";
    // Revision 61 : Oswald et Inter sont retires — tout le site est sur une
    // seule ecriture (styles/commun.css). Il ne reste qu'IBM Plex Mono, qui
    // sert aux colonnes de chiffres alignes, pas au texte.
    l.href = "https://fonts.googleapis.com/css2?family=IBM+Plex+Mono:wght@400;500;600&display=swap";
    document.head.appendChild(l);
    return () => { try { document.head.removeChild(l); } catch (e) {} };
  }, []);
}

/* ---------------------------------------------------------------------
   ERROR BOUNDARY — affiche l'erreur plutôt qu'un écran blanc
--------------------------------------------------------------------- */
class ErrorBoundary extends React.Component {
  constructor(props) { super(props); this.state = { error: null }; }
  static getDerivedStateFromError(error) { return { error }; }
  componentDidCatch(error, info) { console.error("Erreur capturée:", error, info); }
  render() {
    if (this.state.error) {
      return (
        <div style={{ minHeight: "100vh", background: "var(--odj-bg)", display: "flex", alignItems: "center", justifyContent: "center", padding: 24 }}>
          <div style={{ maxWidth: 480, background: "var(--odj-panel)", border: "1px solid var(--odj-line)", padding: 20 }}>
            <div style={{ fontWeight: 700, marginBottom: 8, color: "var(--odj-err)" }}>Une erreur est survenue</div>
            <div style={{ fontSize: 13, color: "var(--odj-texte2)", whiteSpace: "pre-wrap" }}>{String(this.state.error?.message || this.state.error)}</div>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}

/* ---------------------------------------------------------------------
   PLATE — badge signature (coin coupé, style plaque d'équipement)
--------------------------------------------------------------------- */
function Plate({ children, tone = "steel", size = "sm" }) {
  const bg = tone === "steel" ? "var(--odj-accent)" : TONE_HEX[tone] || "var(--odj-accent)";
  return (
    <span
      style={{
        background: bg,
        color: "#fff",
        fontWeight: 600,
        letterSpacing: "0.06em",
        textTransform: "uppercase",
        fontSize: size === "sm" ? 11 : 13,
        padding: size === "sm" ? "3px 10px 3px 8px" : "5px 14px 5px 11px",
        clipPath: "polygon(0 0, 100% 0, 100% 70%, 92% 100%, 0 100%)",
        display: "inline-block",
        whiteSpace: "nowrap",
      }}
    >
      {children}
    </span>
  );
}

/* ---------------------------------------------------------------------
   Il n'y a plus d'écran de connexion ici. On entre par le Toolbox, et
   components/commun/GardeConnexion.js vérifie la session et l'accès à
   l'app. Cette page ne garde de ordre_du_jour.profils que la fiche
   métier : le nom affiché et le rôle.
--------------------------------------------------------------------- */

/* ---------------------------------------------------------------------
   BARRE D'OUTILS — sous le bandeau commun. Rien de propre à l'app ne
   monte dans le bandeau : ni le menu, ni les notifications, ni la date.
--------------------------------------------------------------------- */
// Centre de notifications — boîte personnelle, avec lu/non-lu
function NotificationCenter({ profil, onNaviguer }) {
  const { isPhone } = useDevice();
  const [notifs, setNotifs] = useState([]);
  const [ouvert, setOuvert] = useState(false);
  const slug = profil.userId;

  const charger = useCallback(async () => {
    try {
      const listRes = await storage.list(`notif:${slug}:`, true);
      const cles = (listRes?.keys || []).sort().reverse().slice(0, 50);
      const items = [];
      for (const k of cles) {
        try {
          const r = await storage.get(k, true);
          if (r) items.push({ key: k, ...JSON.parse(r.value) });
        } catch (e) { /* entrée corrompue ignorée */ }
      }
      setNotifs(items);
    } catch (e) { setNotifs([]); }
  }, [slug]);

  useEffect(() => {
    charger();
    const id = setInterval(charger, 60000);
    return () => clearInterval(id);
  }, [charger]);

  const nonLues = notifs.filter((n) => !n.lu).length;

  const cliquer = async (n) => {
    setOuvert(false);
    if (!n.lu) {
      try {
        await storage.set(n.key, JSON.stringify({ type: n.type, titre: n.titre, corps: n.corps, cible: n.cible, lu: true, horodatage: n.horodatage }), true);
        setNotifs((prev) => prev.map((x) => (x.key === n.key ? { ...x, lu: true } : x)));
      } catch (e) { /* secondaire */ }
    }
    onNaviguer(n);
  };

  const icone = { nouvelle_requete: "📋", commentaire: "💬", ecart: "⚠️" };

  return (
    <div style={{ position: "relative" }}>
      <button
        onClick={() => setOuvert((o) => !o)}
        style={{ position: "relative", background: "transparent", border: "1px solid var(--odj-navyLine)", color: "#B9C2CC", padding: "6px 9px", cursor: "pointer", display: "flex", alignItems: "center" }}
        title="Notifications"
      >
        <Bell size={14} />
        {nonLues > 0 && (
          <span style={{ position: "absolute", top: -6, right: -6, background: "var(--odj-rouge)", color: "#fff", fontSize: 10, fontWeight: 700, borderRadius: "50%", width: 16, height: 16, display: "flex", alignItems: "center", justifyContent: "center" }}>
            {nonLues > 9 ? "9+" : nonLues}
          </span>
        )}
      </button>
      {ouvert && (
        <>
          <div onClick={() => setOuvert(false)} style={{ position: "fixed", inset: 0, zIndex: 998 }} />
          <div
            style={
              isPhone
                ? { position: "fixed", top: 64, left: 8, right: 8, maxHeight: "70vh", overflowY: "auto", background: "var(--odj-panel)", border: "1px solid var(--odj-line)", zIndex: 999, boxShadow: "0 6px 20px rgba(0,0,0,0.25)" }
                : { position: "absolute", top: "calc(100% + 6px)", right: 0, width: 320, maxWidth: "90vw", maxHeight: 420, overflowY: "auto", background: "var(--odj-panel)", border: "1px solid var(--odj-line)", zIndex: 999, boxShadow: "0 6px 20px rgba(0,0,0,0.18)" }
            }
          >
            <div style={{ padding: "10px 14px", borderBottom: "1px solid var(--odj-lineFaible)", fontWeight: 700, fontSize: 13, color: "var(--odj-accent)", textTransform: "uppercase", letterSpacing: "0.03em" }}>
              Notifications
            </div>
            {notifs.length === 0 ? (
              <div style={{ padding: 24, textAlign: "center", color: "var(--odj-dim)", fontSize: 13 }}>Aucune notification</div>
            ) : (
              notifs.map((n) => (
                <button
                  key={n.key}
                  onClick={() => cliquer(n)}
                  style={{ display: "block", width: "100%", textAlign: "left", padding: "10px 14px", border: "none", borderBottom: "1px solid var(--odj-lineFaible)", background: n.lu ? "var(--odj-panel)" : "var(--odj-surligne)", cursor: "pointer" }}
                >
                  <div style={{ fontSize: 13, fontWeight: n.lu ? 500 : 700, color: "var(--odj-texte)" }}>
                    {icone[n.type] || ""} {n.titre}
                  </div>
                  {n.corps && <div style={{ fontSize: 12, color: "var(--odj-dim)", marginTop: 2 }}>{n.corps}</div>}
                </button>
              ))
            )}
          </div>
        </>
      )}
    </div>
  );
}

function BarreOutils({ profil, date, setDate, masquerDate, onMenuSelect, onNaviguerNotification }) {
  const { isPhone } = useDevice();
  const [menuOuvert, setMenuOuvert] = useState(false);

  const MENU_ITEMS = [
    { type: "item", label: "\u2190 Retour au menu", id: "retour" },
    { type: "titre", label: "Information g\u00e9n\u00e9rale" },
    { type: "item", label: "Projets en cours", id: "projets" },
    { type: "item", label: "Liste contacts", id: "contacts" },
    { type: "item", label: "Notification PUSH", id: "notifications" },
    { type: "item", label: "Comment utiliser la plateforme", id: "guide" },
  ];

  const boutonStyle = {
    background: "var(--odj-panel)", border: "1px solid var(--odj-line)", color: "var(--odj-texte2)",
    padding: isPhone ? "5px 8px" : "7px 10px", cursor: "pointer", display: "flex",
    alignItems: "center", gap: 5, fontSize: 12,
  };

  return (
    <div style={{ maxWidth: 960, margin: "0 auto", padding: isPhone ? "0 14px 10px" : "0 20px 12px", display: "flex", flexWrap: "wrap", gap: 8, alignItems: "center", justifyContent: "space-between" }}>
      <div style={{ fontSize: 12.5, color: "var(--odj-dim)" }}>
        {ROLES.find((r) => r.value === profil.role)?.label}
      </div>

      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
        {/* Menu */}
        <div style={{ position: "relative" }}>
          <button
            onClick={() => setMenuOuvert((v) => !v)}
            title="Menu"
            style={{ ...boutonStyle, background: menuOuvert ? "var(--odj-surligne)" : "var(--odj-panel)" }}
          >
            <span style={{ fontSize: 16, lineHeight: 1 }}>&#9776;</span>
            {!isPhone && <span style={{ fontSize: 12 }}>Menu</span>}
          </button>
          {menuOuvert && (
            <>
              <div onClick={() => setMenuOuvert(false)} style={{ position: "fixed", inset: 0, zIndex: 998 }} />
              <div style={{ position: "absolute", right: 0, top: "calc(100% + 6px)", background: "var(--odj-panel)", border: "1px solid var(--odj-line)", boxShadow: "0 4px 16px rgba(0,0,0,0.25)", minWidth: 200, zIndex: 999 }}>
                {MENU_ITEMS.map((item, i) =>
                  item.type === "titre" ? (
                    <div key={i} style={{ padding: "10px 16px 6px", fontWeight: 700, fontSize: 12, textTransform: "uppercase", letterSpacing: "0.06em", color: "var(--odj-dim)", borderBottom: "1px solid var(--odj-lineFaible)", userSelect: "none" }}>
                      {item.label}
                    </div>
                  ) : (
                    <button
                      key={i}
                      onClick={() => { onMenuSelect(item.id); setMenuOuvert(false); }}
                      style={{ display: "block", width: "100%", textAlign: "left", padding: "11px 16px", background: "transparent", border: "none", fontSize: 14, color: "var(--odj-texte)", cursor: "pointer", borderBottom: i < MENU_ITEMS.length - 1 ? "1px solid var(--odj-lineFaible)" : "none" }}
                      onMouseEnter={(e) => e.currentTarget.style.background = "var(--odj-panelAlt)"}
                      onMouseLeave={(e) => e.currentTarget.style.background = "transparent"}
                    >
                      {item.label}
                    </button>
                  )
                )}
              </div>
            </>
          )}
        </div>

        <NotificationCenter profil={profil} onNaviguer={onNaviguerNotification} />

        {!masquerDate && (
          <input
            type="date" value={date} onChange={(e) => setDate(e.target.value)}
            style={{ fontFamily: "'IBM Plex Mono', ui-monospace, 'SF Mono', Menlo, monospace", fontSize: isPhone ? 12 : 13, padding: isPhone ? "5px 7px" : "7px 10px", border: "1px solid var(--odj-line)", background: "var(--odj-panel)", color: "var(--odj-texte)" }}
          />
        )}
      </div>
    </div>
  );
}

function Section({ icon: Icon, title, children }) {
  return (
    <div style={{ background: "var(--odj-panel)", border: "1px solid var(--odj-line)", marginBottom: 16 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "12px 16px", borderBottom: "1px solid var(--odj-line)", background: "var(--odj-panelAlt)" }}>
        <Icon size={16} color="#0F2138" />
        <span style={{ fontWeight: 600, fontSize: 13, letterSpacing: "0.05em", textTransform: "uppercase", color: "var(--odj-texte)" }}>{title}</span>
      </div>
      <div style={{ padding: 16 }}>{children}</div>
    </div>
  );
}

function StatutChoix({ groupe, valeur, onChange }) {
  return (
    <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 12 }}>
      {STATUTS[groupe].map((opt) => {
        const active = valeur === opt.value;
        return (
          <button
            key={opt.value} type="button" onClick={() => onChange(opt.value)}
            style={{
              padding: "8px 14px", fontWeight: 600, fontSize: 13,
              border: `1.5px solid ${active ? TONE_HEX[opt.tone] : "var(--odj-line)"}`,
              background: active ? TONE_HEX[opt.tone] : "var(--odj-panel)",
              color: active ? "#fff" : "var(--odj-texte)", cursor: "pointer",
            }}
          >
            {opt.label}
          </button>
        );
      })}
    </div>
  );
}

// Tableau de lignes (poste ou équipement) : quantité déroulante + commentaire
function LignesTable({ items, valeurs, onChangeQte, onChangeCommentaire, showStock }) {
  const { isPhone } = useDevice();
  return (
    <div style={{ display: "grid", gap: isPhone ? 12 : 8 }}>
      {items.map((item) => (
        <div key={item.key} style={isPhone
          ? { display: "grid", gridTemplateColumns: "1fr 60px", gap: 6, alignItems: "start", background: "var(--odj-panelAlt)", padding: "10px 12px", border: "1px solid var(--odj-lineFaible)" }
          : { display: "grid", gridTemplateColumns: "minmax(120px,160px) 70px 1fr", gap: 8, alignItems: "center" }
        }>
          <div>
            <div style={{ fontSize: 13.5, fontWeight: 600, color: "var(--odj-texte)" }}>{item.label}</div>
            {showStock && item.stock != null && (
              <div style={{ fontSize: 11, color: "var(--odj-dim)", fontFamily: "'IBM Plex Mono', ui-monospace, 'SF Mono', Menlo, monospace", marginTop: 1 }}>Flotte: {item.stock}</div>
            )}
            {isPhone && (
              <input
                placeholder="Commentaire (optionnel)"
                value={valeurs[item.key]?.commentaire ?? ""}
                onChange={(e) => onChangeCommentaire(item.key, e.target.value)}
                style={{ padding: "5px 8px", border: "1px solid var(--odj-line)", fontSize: 12, marginTop: 4, width: "100%", boxSizing: "border-box" }}
              />
            )}
          </div>
          <select
            value={valeurs[item.key]?.qte ?? "0"}
            onChange={(e) => onChangeQte(item.key, e.target.value)}
            style={{ padding: isPhone ? "10px 6px" : "7px 6px", border: "1px solid var(--odj-line)", fontFamily: "'IBM Plex Mono', ui-monospace, 'SF Mono', Menlo, monospace", fontSize: isPhone ? 18 : 14, fontWeight: 600, textAlign: "center", background: "var(--odj-panel)" }}
          >
            {Array.from({ length: 21 }, (_, i) => i).map((n) => <option key={n} value={String(n)}>{n}</option>)}
          </select>
          {!isPhone && (
            <input
              placeholder="Commentaire (optionnel)"
              value={valeurs[item.key]?.commentaire ?? ""}
              onChange={(e) => onChangeCommentaire(item.key, e.target.value)}
              style={{ padding: "7px 10px", border: "1px solid var(--odj-line)", fontSize: 13.5 }}
            />
          )}
        </div>
      ))}
    </div>
  );
}

const inputStyle = { width: "100%", padding: "9px 11px", border: "1px solid var(--odj-line)", fontSize: 14, boxSizing: "border-box" };
const labelStyle = { display: "block", fontSize: 12, fontWeight: 600, color: "var(--odj-texte2)", marginBottom: 6 };
const selectStyle = { ...inputStyle, appearance: "none", background: "var(--odj-panel)" };

/* ---------------------------------------------------------------------
   CONTREMAÎTRE FORM
--------------------------------------------------------------------- */
/* ---------------------------------------------------------------------
   ACCUEIL CONTREMAÎTRE — bouton "nouvelle requête" + historique 2 semaines
--------------------------------------------------------------------- */
/* ---------------------------------------------------------------------
   HISTORIQUE PERSONNEL — vues en tableau pour un seul contremaître,
   une ligne par date (même style que les vues du dashboard).
--------------------------------------------------------------------- */
function HistoriquePersonnel({ fiches }) {
  const lignes = useMemo(() => fiches.map((f) => {
    const postes = {};
    POSTES.forEach((p) => {
      postes[p.key] = { qte: Number(f.data.personnel?.postes?.[p.key]?.qte) || 0, commentaire: f.data.personnel?.postes?.[p.key]?.commentaire || "" };
    });
    return { date: f.date, seq: f.seq, chantier: f.data.chantier, notes: f.data.personnel?.notes, postes, aucunTravaux: f.data.aucunTravaux };
  }), [fiches]);

  // Moyenne sur les 10 derniers jours où une vraie fiche a été soumise (on
  // exclut les jours « Aucun travaux »). lignes est déjà trié du plus récent
  // au plus ancien, donc on prend simplement les 10 premiers jours travaillés.
  const joursTravailles = useMemo(() => lignes.filter((l) => !l.aucunTravaux).slice(0, 10), [lignes]);
  const moyennes = useMemo(() => {
    const t = {}; POSTES.forEach((p) => { t[p.key] = 0; });
    joursTravailles.forEach((l) => { POSTES.forEach((p) => { t[p.key] += l.postes[p.key].qte; }); });
    const n = joursTravailles.length || 1;
    POSTES.forEach((p) => { t[p.key] = Math.round((t[p.key] / n) * 10) / 10; });
    return t;
  }, [joursTravailles]);

  const hasMoyennes = POSTES.some((p) => moyennes[p.key] > 0);
  const thStyle = { textAlign: "left", padding: "9px 12px", fontWeight: 600, fontSize: 11.5, textTransform: "uppercase", letterSpacing: "0.03em", color: "var(--odj-texte2)", whiteSpace: "nowrap" };

  return (
    <div>
      <div style={{ display: "flex", gap: 10, flexWrap: "wrap", marginBottom: 8 }}>
        {POSTES.filter((p) => moyennes[p.key] > 0).map((p) => <StatCard key={p.key} label={`Moyenne — ${p.label}`} value={moyennes[p.key]} tone="var(--odj-accent)" />)}
        {!hasMoyennes && <StatCard label="Main d'oeuvre demandée" value="—" tone="var(--odj-accent)" />}
      </div>
      <div style={{ fontSize: 11.5, color: "var(--odj-dim)", marginBottom: 12 }}>
        Moyenne sur les {joursTravailles.length} derniers jours travaillés (fiches « Aucun travaux » exclues).
      </div>
      {lignes.length === 0 ? (
        <div style={{ padding: 40, textAlign: "center", color: "var(--odj-dim)", border: "1px dashed var(--odj-line)", background: "var(--odj-panel)" }}>
          Aucune requête envoyée dans les deux dernières semaines.
        </div>
      ) : (
        <div style={{ background: "var(--odj-panel)", border: "1px solid var(--odj-line)", overflowX: "auto" }}>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13.5 }}>
            <thead>
              <tr style={{ background: "var(--odj-panelAlt)", borderBottom: "1px solid var(--odj-line)" }}>
                <th style={thStyle}>Date</th>
                <th style={thStyle}>Chantier</th>
                {POSTES.map((p) => <th key={p.key} style={{ ...thStyle, textAlign: "center" }}>{p.label}</th>)}
                <th style={thStyle}>Notes</th>
              </tr>
            </thead>
            <tbody>
              {lignes.map((l, i) => (
                <tr key={`${l.date}-${l.seq}`} style={{ borderBottom: i < lignes.length - 1 ? "1px solid var(--odj-lineFaible)" : "none" }}>
                  <td style={{ padding: "9px 12px", fontWeight: 600, whiteSpace: "nowrap" }}>
                    {labelDate(l.date)}{l.seq > 1 ? ` (${l.seq}e)` : ""}
                  </td>
                  <td style={{ padding: "9px 12px", color: "var(--odj-dim)" }}>{l.chantier || "—"}</td>
                  {l.aucunTravaux ? (
                    <td colSpan={POSTES.length} style={{ padding: "9px 12px", textAlign: "center", color: "var(--odj-dim)", fontStyle: "italic" }}>Aucun travaux prévu</td>
                  ) : POSTES.map((p) => (
                    <td key={p.key} style={{ padding: "9px 12px", textAlign: "center", fontFamily: "'IBM Plex Mono', ui-monospace, 'SF Mono', Menlo, monospace" }}>
                      {l.postes[p.key].qte === 0 ? "—" : <b>{l.postes[p.key].qte}</b>}
                    </td>
                  ))}
                  <td style={{ padding: "9px 12px", color: "var(--odj-texte2)", maxWidth: 200 }}>{l.aucunTravaux ? "" : (l.notes || "—")}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

function HistoriqueCamions({ fiches }) {
  const lignes = fiches.map((f) => ({ date: f.date, seq: f.seq, chantier: f.data.chantier, camions: f.data.camions || {}, aucunTravaux: f.data.aucunTravaux }));

  // Moyenne sur les 10 derniers jours travaillés (fiches déjà triées du plus
  // récent au plus ancien, on exclut les jours « Aucun travaux »).
  const joursTravailles = useMemo(() => lignes.filter((l) => !l.aucunTravaux).slice(0, 10), [lignes]);
  const moyennes = useMemo(() => {
    const t = { douze: 0, deux: 0, trois: 0 };
    joursTravailles.forEach((l) => {
      t.douze += Number(l.camions.douze) || 0;
      t.deux += Number(l.camions.deux) || 0;
      t.trois += Number(l.camions.trois) || 0;
    });
    const n = joursTravailles.length || 1;
    return { douze: Math.round((t.douze / n) * 10) / 10, deux: Math.round((t.deux / n) * 10) / 10, trois: Math.round((t.trois / n) * 10) / 10 };
  }, [joursTravailles]);

  const thLeft = { textAlign: "left", padding: "9px 12px", fontWeight: 600, fontSize: 11.5, textTransform: "uppercase", letterSpacing: "0.03em", color: "var(--odj-texte2)", whiteSpace: "nowrap" };
  const thCenter = { ...thLeft, textAlign: "center" };

  return (
    <div>
      <div style={{ display: "flex", gap: 10, flexWrap: "wrap", marginBottom: 8 }}>
        <StatCard label="Moyenne 12 roues" value={moyennes.douze} tone="var(--odj-accent)" />
        <StatCard label="Moyenne 2 essieux" value={moyennes.deux} tone="var(--odj-accent)" />
        <StatCard label="Moyenne 3 essieux" value={moyennes.trois} tone="var(--odj-accent)" />
        <StatCard label="Moyenne camions" value={Math.round((moyennes.douze + moyennes.deux + moyennes.trois) * 10) / 10} tone="var(--odj-ambre)" />
      </div>
      <div style={{ fontSize: 11.5, color: "var(--odj-dim)", marginBottom: 12 }}>
        Moyenne sur les {joursTravailles.length} derniers jours travaillés (fiches « Aucun travaux » exclues).
      </div>
      {lignes.length === 0 ? (
        <div style={{ padding: 40, textAlign: "center", color: "var(--odj-dim)", border: "1px dashed var(--odj-line)", background: "var(--odj-panel)" }}>
          Aucune requête envoyée dans les deux dernières semaines.
        </div>
      ) : (
        <div style={{ background: "var(--odj-panel)", border: "1px solid var(--odj-line)", overflowX: "auto" }}>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13.5 }}>
            <thead>
              <tr style={{ background: "var(--odj-panelAlt)", borderBottom: "1px solid var(--odj-line)" }}>
                <th style={thLeft}>Date</th>
                <th style={thLeft}>Chantier</th>
                <th style={thCenter}>12 roues</th>
                <th style={thCenter}>2 essieux</th>
                <th style={thCenter}>3 essieux</th>
                <th style={thCenter}>Total</th>
                <th style={thLeft}>Commentaires</th>
              </tr>
            </thead>
            <tbody>
              {lignes.map((l, i) => {
                const d = Number(l.camions.douze) || 0, e2 = Number(l.camions.deux) || 0, e3 = Number(l.camions.trois) || 0;
                return (
                  <tr key={`${l.date}-${l.seq}`} style={{ borderBottom: i < lignes.length - 1 ? "1px solid var(--odj-lineFaible)" : "none" }}>
                    <td style={{ padding: "9px 12px", fontWeight: 600, whiteSpace: "nowrap" }}>{labelDate(l.date)}{l.seq > 1 ? ` (${l.seq}e)` : ""}</td>
                    <td style={{ padding: "9px 12px", color: "var(--odj-dim)" }}>{l.chantier || "—"}</td>
                    {l.aucunTravaux ? (
                      <td colSpan={4} style={{ padding: "9px 12px", textAlign: "center", color: "var(--odj-dim)", fontStyle: "italic" }}>Aucun travaux prévu</td>
                    ) : (
                      <>
                        <td style={{ padding: "9px 12px", textAlign: "center", fontFamily: "'IBM Plex Mono', ui-monospace, 'SF Mono', Menlo, monospace" }}>{d > 0 ? <b>{d}</b> : "—"}</td>
                        <td style={{ padding: "9px 12px", textAlign: "center", fontFamily: "'IBM Plex Mono', ui-monospace, 'SF Mono', Menlo, monospace" }}>{e2 > 0 ? <b>{e2}</b> : "—"}</td>
                        <td style={{ padding: "9px 12px", textAlign: "center", fontFamily: "'IBM Plex Mono', ui-monospace, 'SF Mono', Menlo, monospace" }}>{e3 > 0 ? <b>{e3}</b> : "—"}</td>
                        <td style={{ padding: "9px 12px", textAlign: "center", fontFamily: "'IBM Plex Mono', ui-monospace, 'SF Mono', Menlo, monospace", fontWeight: 700 }}>{d + e2 + e3}</td>
                      </>
                    )}
                    <td style={{ padding: "9px 12px", color: "var(--odj-texte2)", maxWidth: 220 }}>{l.aucunTravaux ? "" : (l.camions.notes || "—")}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

function HistoriqueMachinerie({ fiches }) {
  const lignes = useMemo(() => fiches.map((f) => {
    const mach = f.data.machinerie;
    const ajout = [...ligneResume(EQUIPEMENTS, mach?._ajout?.equipements), ...ligneResume(ACCESSOIRES, mach?._ajout?.accessoires)];
    const retrait = [...ligneResume(EQUIPEMENTS, mach?._retrait?.equipements), ...ligneResume(ACCESSOIRES, mach?._retrait?.accessoires)];
    return { date: f.date, seq: f.seq, chantier: f.data.chantier, ajout, retrait, aucunTravaux: f.data.aucunTravaux };
  }), [fiches]);

  const thStyle = { textAlign: "left", padding: "9px 12px", fontWeight: 600, fontSize: 11.5, textTransform: "uppercase", letterSpacing: "0.03em", color: "var(--odj-texte2)", whiteSpace: "nowrap" };

  return (
    <div>
      {lignes.length === 0 ? (
        <div style={{ padding: 40, textAlign: "center", color: "var(--odj-dim)", border: "1px dashed var(--odj-line)", background: "var(--odj-panel)" }}>
          Aucune requête envoyée dans les deux dernières semaines.
        </div>
      ) : (
        <div style={{ background: "var(--odj-panel)", border: "1px solid var(--odj-line)", overflowX: "auto" }}>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13.5 }}>
            <thead>
              <tr style={{ background: "var(--odj-panelAlt)", borderBottom: "1px solid var(--odj-line)" }}>
                <th style={thStyle}>Date</th>
                <th style={thStyle}>Chantier</th>
                <th style={thStyle}>Ajout</th>
                <th style={thStyle}>Retrait</th>
              </tr>
            </thead>
            <tbody>
              {lignes.map((l, i) => (
                <tr key={`${l.date}-${l.seq}`} style={{ borderBottom: i < lignes.length - 1 ? "1px solid var(--odj-lineFaible)" : "none" }}>
                  <td style={{ padding: "9px 12px", fontWeight: 600, whiteSpace: "nowrap" }}>{labelDate(l.date)}{l.seq > 1 ? ` (${l.seq}e)` : ""}</td>
                  <td style={{ padding: "9px 12px", color: "var(--odj-dim)" }}>{l.chantier || "—"}</td>
                  {l.aucunTravaux ? (
                    <td colSpan={2} style={{ padding: "9px 12px", textAlign: "center", color: "var(--odj-dim)", fontStyle: "italic" }}>Aucun travaux prévu</td>
                  ) : (
                    <>
                      <td style={{ padding: "9px 12px", color: "var(--odj-ok)" }}>{l.ajout.length > 0 ? l.ajout.map((x) => `${x.label} : ${x.qte}`).join(", ") : "—"}</td>
                      <td style={{ padding: "9px 12px", color: "var(--odj-err)" }}>{l.retrait.length > 0 ? l.retrait.map((x) => `${x.label} : ${x.qte}`).join(", ") : "—"}</td>
                    </>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

function HistoriqueDiesel({ fiches }) {
  const lignes = fiches.map((f) => ({ date: f.date, seq: f.seq, chantier: f.data.chantier, diesel: f.data.diesel || {}, aucunTravaux: f.data.aucunTravaux }));
  const thStyle = { textAlign: "left", padding: "9px 12px", fontWeight: 600, fontSize: 11.5, textTransform: "uppercase", letterSpacing: "0.03em", color: "var(--odj-texte2)", whiteSpace: "nowrap" };

  return (
    <div>
      {lignes.length === 0 ? (
        <div style={{ padding: 40, textAlign: "center", color: "var(--odj-dim)", border: "1px dashed var(--odj-line)", background: "var(--odj-panel)" }}>
          Aucune requête envoyée dans les deux dernières semaines.
        </div>
      ) : (
        <div style={{ background: "var(--odj-panel)", border: "1px solid var(--odj-line)", overflowX: "auto" }}>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13.5 }}>
            <thead>
              <tr style={{ background: "var(--odj-panelAlt)", borderBottom: "1px solid var(--odj-line)" }}>
                <th style={thStyle}>Date</th>
                <th style={thStyle}>Chantier</th>
                <th style={{ ...thStyle, textAlign: "center" }}>Requis</th>
                <th style={{ ...thStyle, textAlign: "center" }}>Grosses</th>
                <th style={{ ...thStyle, textAlign: "center" }}>Petites</th>
                <th style={thStyle}>Commentaire</th>
              </tr>
            </thead>
            <tbody>
              {lignes.map((l, i) => (
                <tr key={`${l.date}-${l.seq}`} style={{ borderBottom: i < lignes.length - 1 ? "1px solid var(--odj-lineFaible)" : "none" }}>
                  <td style={{ padding: "9px 12px", fontWeight: 600, whiteSpace: "nowrap" }}>{labelDate(l.date)}{l.seq > 1 ? ` (${l.seq}e)` : ""}</td>
                  <td style={{ padding: "9px 12px", color: "var(--odj-dim)" }}>{l.chantier || "—"}</td>
                  {l.aucunTravaux ? (
                    <td colSpan={4} style={{ padding: "9px 12px", textAlign: "center", color: "var(--odj-dim)", fontStyle: "italic" }}>Aucun travaux prévu</td>
                  ) : (
                    <>
                      <td style={{ padding: "9px 12px", textAlign: "center" }}>{l.diesel.requis === "oui" ? "Oui" : l.diesel.requis === "non" ? "Non" : "—"}</td>
                      <td style={{ padding: "9px 12px", textAlign: "center", fontFamily: "'IBM Plex Mono', ui-monospace, 'SF Mono', Menlo, monospace" }}>{l.diesel.requis === "oui" ? (l.diesel.grosses || 0) : "—"}</td>
                      <td style={{ padding: "9px 12px", textAlign: "center", fontFamily: "'IBM Plex Mono', ui-monospace, 'SF Mono', Menlo, monospace" }}>{l.diesel.requis === "oui" ? (l.diesel.petites || 0) : "—"}</td>
                      <td style={{ padding: "9px 12px", color: "var(--odj-texte2)", maxWidth: 220 }}>{l.diesel.commentaire || "—"}</td>
                    </>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

function ContremaitreAccueil({ profil, onNouvelle, onOuvrirDate, cacherBouton }) {
  const [fiches, setFiches] = useState([]);
  const [loading, setLoading] = useState(true);
  const slug = profil.userId;

  const charger = useCallback(async () => {
    setLoading(true);
    const dates = deuxDernieresSemaines();
    // Revision 66 — les 14 journees sont interrogees EN PARALLELE. Avant,
    // cette boucle attendait chaque date avant de passer a la suivante :
    // jusqu'a 28 allers-retours a la file, soit plusieurs secondes sur un
    // lien de chantier, juste pour afficher l'accueil. Meme nombre de
    // requetes, mais un seul temps d'attente au lieu de vingt-huit.
    const parDate = await Promise.all(dates.map(async (d) => {
      const pourCetteDate = [];
      try {
        const r = await storage.get(ficheKey(d, slug, 1), true);
        if (r) pourCetteDate.push({ date: d, seq: 1, data: JSON.parse(r.value) });
      } catch (e) { /* aucune fiche pour cette date */ }
      try {
        const listRes = await storage.list(`fiche:${d}:${slug}::`, true);
        const extras = await Promise.all((listRes?.keys || []).map(async (k) => {
          try {
            const r2 = await storage.get(k, true);
            return r2 ? { date: d, seq: parseSeqSuffix(k), data: JSON.parse(r2.value) } : null;
          } catch (e) { return null; /* entrée corrompue ignorée */ }
        }));
        for (const e of extras) if (e) pourCetteDate.push(e);
      } catch (e) { /* pas de demandes additionnelles */ }
      return pourCetteDate;
    }));
    const trouvees = parDate.flat();
    trouvees.sort((a, b) => {
      const ta = a.data.creeLe ? new Date(a.data.creeLe).getTime() : 0;
      const tb = b.data.creeLe ? new Date(b.data.creeLe).getTime() : 0;
      if (ta !== tb) return tb - ta; // plus récemment soumise en premier
      return a.date === b.date ? b.seq - a.seq : (a.date < b.date ? 1 : -1);
    });
    setFiches(trouvees); // déjà du plus récent au plus ancien
    setLoading(false);
  }, [slug]);

  useEffect(() => { charger(); }, [charger]);

  const demain = tomorrowISO();
  const estVendredi = new Date().getDay() === 5;
  const [ciblerSamedi, setCiblerSamedi] = useState(false);
  const dateCible = (estVendredi && ciblerSamedi) ? demainReel() : demain;
  const dejaRepondu = fiches.some((f) => f.date === dateCible);
  const [envoiAucunTravaux, setEnvoiAucunTravaux] = useState(false);
  const [vueType, setVueType] = useState(null); // null | 'personnel' | 'camions' | 'machinerie' | 'diesel'
  const nomJourCible = capitaliserMots(new Date(dateCible + "T12:00:00").toLocaleDateString("fr-CA", { weekday: "long" }));

  const enregistrerAucunTravaux = async () => {
    if (dejaRepondu || envoiAucunTravaux) return;
    setEnvoiAucunTravaux(true);
    try {
      const donnees = {
        ...emptyFiche(),
        aucunTravaux: true,
        creeLe: new Date().toISOString(),
        maj: new Date().toISOString(),
      };
      await storage.set(ficheKey(dateCible, slug, 1), JSON.stringify(donnees), true);

      // ---------------------------------------------------------------------
      // Revision 43 : « Aucun travaux » previent maintenant les memes
      // personnes qu'une requete normale.
      //
      // Avant, cette fonction enregistrait la fiche et s'arretait la : aucun
      // courriel, aucun push, rien dans le centre de notifications. Et comme
      // la fiche compte comme « repondu », le rappel de 16 h et 20 h cessait
      // de relancer la personne — le silence etait donc complet, personne
      // n'apprenait qu'il n'y avait pas de travaux le lendemain.
      //
      // Les trois avis sont les memes que dans save(), avec des quantites a
      // zero et un texte explicite. Chacun est dans son propre try/catch :
      // la fiche est deja enregistree, une notification qui echoue ne doit
      // jamais faire perdre la reponse du contremaitre.
      // ---------------------------------------------------------------------
      const dateTexte = new Date(dateCible + "T12:00:00")
        .toLocaleDateString("fr-CA", { day: "numeric", month: "long", year: "numeric" });

      try {
        await fetch("/api/ordre-du-jour/send-notification/", {
          method: "POST",
          headers: await entetesAuth(),
          body: JSON.stringify({
            nom: profil.nom,
            date: dateCible,
            chantier: "Aucun travaux prévu",
            aucunTravaux: true,
            personnel: [],
            machinerie: { ajout: [], retrait: [] },
            camions: { douze: 0, deux: 0, trois: 0 },
            diesel: { requis: "non", grosses: 0, petites: 0, commentaire: "" },
          }),
        });
      } catch (eNotif) { /* notification secondaire — on ignore l'échec */ }

      try {
        await fetch("/api/ordre-du-jour/send-push/", {
          method: "POST",
          headers: await entetesAuth(),
          body: JSON.stringify({
            title: "PEP2000 — Ordre du jour",
            body: `Aucun travaux prévu — ${profil.nom} — ${dateTexte}`,
          }),
        });
      } catch (ePush) { /* notification secondaire — on ignore l'échec */ }

      try {
        await notifierNouvelleRequete(
          profil,
          { date: dateCible, slug: profil.userId, seq: 1 },
          `Aucun travaux — ${profil.nom}`,
          `Aucun travaux prévu pour le ${dateTexte}`
        );
      } catch (eCentre) { /* notification secondaire — on ignore l'échec */ }

      await charger();
      onOuvrirDate(dateCible, 1);
    } finally {
      setEnvoiAucunTravaux(false);
    }
  };

  return (
    <div style={{ maxWidth: 640, margin: "0 auto", padding: "20px 16px 60px" }}>
      {!cacherBouton && estVendredi && (
        <label style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 12, fontSize: 13.5, color: "var(--odj-texte2)", cursor: "pointer" }}>
          <input type="checkbox" checked={ciblerSamedi} onChange={(e) => setCiblerSamedi(e.target.checked)} style={{ width: 16, height: 16 }} />
          Cette requête est pour samedi (au lieu de lundi)
        </label>
      )}
      {!cacherBouton && (
        <button
          onClick={() => onNouvelle(estVendredi && ciblerSamedi ? dateCible : undefined)}
          style={{
            width: "100%", background: "var(--odj-rouge)", color: "#fff", border: "none",
            padding: "22px 20px", marginBottom: 12, cursor: "pointer",
            display: "flex", alignItems: "center", justifyContent: "center", gap: 12,
            fontWeight: 700, fontSize: 22, letterSpacing: "0.03em", textTransform: "uppercase",
            boxShadow: "0 3px 0 #a80121",
          }}
        >
          <Plus size={28} strokeWidth={3} /> Faire une nouvelle requête
        </button>
      )}

      {!cacherBouton && !dejaRepondu && (
        <div style={{ marginBottom: 26 }}>
          <button
            onClick={enregistrerAucunTravaux}
            disabled={envoiAucunTravaux}
            style={{
              width: "100%", background: "var(--odj-panel)", color: "var(--odj-texte2)", border: "1.5px solid var(--odj-line)",
              padding: "12px 20px", cursor: "pointer",
              fontWeight: 600, fontSize: 14,
              opacity: envoiAucunTravaux ? 0.6 : 1,
            }}
          >
            {envoiAucunTravaux ? "…" : `Aucun travaux ${nomJourCible}`}
          </button>
          <div style={{ fontSize: 11.5, color: "var(--odj-dim)", textAlign: "center", marginTop: 6 }}>
            Prochaine journée ouvrable — saute automatiquement la fin de semaine
          </div>
        </div>
      )}

      <div style={{ display: "grid", gridTemplateColumns: "repeat(3,1fr)", gap: 6, marginBottom: 10 }}>
        <button onClick={() => setVueType(null)} style={{ padding: "8px 4px", fontSize: 12, fontWeight: 600, border: `1.5px solid ${!vueType ? "var(--odj-accent)" : "var(--odj-line)"}`, background: !vueType ? "var(--odj-accent)" : "var(--odj-panel)", color: !vueType ? "#fff" : "var(--odj-texte)", cursor: "pointer", textAlign: "center" }}>
          Vue générale
        </button>
        <button onClick={() => setVueType("personnel")} style={{ padding: "8px 4px", fontSize: 12, fontWeight: 600, border: `1.5px solid ${vueType === "personnel" ? "var(--odj-accent)" : "var(--odj-line)"}`, background: vueType === "personnel" ? "var(--odj-accent)" : "var(--odj-panel)", color: vueType === "personnel" ? "#fff" : "var(--odj-texte)", cursor: "pointer", textAlign: "center" }}>
          Main d'oeuvre
        </button>
        <button onClick={() => setVueType("camions")} style={{ padding: "8px 4px", fontSize: 12, fontWeight: 600, border: `1.5px solid ${vueType === "camions" ? "var(--odj-accent)" : "var(--odj-line)"}`, background: vueType === "camions" ? "var(--odj-accent)" : "var(--odj-panel)", color: vueType === "camions" ? "#fff" : "var(--odj-texte)", cursor: "pointer", textAlign: "center" }}>
          Camions
        </button>
        <button onClick={() => setVueType("machinerie")} style={{ padding: "8px 4px", fontSize: 12, fontWeight: 600, border: `1.5px solid ${vueType === "machinerie" ? "var(--odj-accent)" : "var(--odj-line)"}`, background: vueType === "machinerie" ? "var(--odj-accent)" : "var(--odj-panel)", color: vueType === "machinerie" ? "#fff" : "var(--odj-texte)", cursor: "pointer", textAlign: "center" }}>
          Machinerie
        </button>
        <button onClick={() => setVueType("diesel")} style={{ padding: "8px 4px", fontSize: 12, fontWeight: 600, border: `1.5px solid ${vueType === "diesel" ? "var(--odj-accent)" : "var(--odj-line)"}`, background: vueType === "diesel" ? "var(--odj-accent)" : "var(--odj-panel)", color: vueType === "diesel" ? "#fff" : "var(--odj-texte)", cursor: "pointer", textAlign: "center" }}>
          Diesel (Fuel)
        </button>
      </div>

      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", flexWrap: "wrap", gap: 8, marginBottom: 12 }}>
        <div style={{ fontSize: 15, fontWeight: 600, color: "var(--odj-texte2)", textTransform: "uppercase", letterSpacing: "0.04em" }}>
          Vos requêtes — 2 dernières semaines
        </div>
        <button onClick={charger} style={{ background: "transparent", border: "1px solid var(--odj-line)", padding: "7px 11px", cursor: "pointer", display: "flex", alignItems: "center", gap: 6, fontSize: 12.5 }}>
          <RefreshCw size={13} /> Actualiser
        </button>
      </div>

      {loading ? (
        <div style={{ padding: 30, textAlign: "center", color: "var(--odj-dim)" }}>Chargement…</div>
      ) : fiches.length === 0 ? (
        <div style={{ padding: 30, textAlign: "center", color: "var(--odj-dim)", border: "1px dashed var(--odj-line)", background: "var(--odj-panel)" }}>
          Aucune requête envoyée dans les deux dernières semaines.
        </div>
      ) : vueType === "personnel" ? (
        <HistoriquePersonnel fiches={fiches} />
      ) : vueType === "camions" ? (
        <HistoriqueCamions fiches={fiches} />
      ) : vueType === "machinerie" ? (
        <HistoriqueMachinerie fiches={fiches} />
      ) : vueType === "diesel" ? (
        <HistoriqueDiesel fiches={fiches} />
      ) : (
        <div style={{ display: "grid", gap: 10 }}>
          {fiches.map((f) => (
            <button
              key={`${f.date}-${f.seq}`}
              onClick={() => onOuvrirDate(f.date, f.seq)}
              style={{ textAlign: "left", background: "var(--odj-panel)", border: "1px solid var(--odj-line)", borderLeft: "4px solid var(--odj-accent)", padding: "14px 16px", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10 }}
            >
              <div>
                <div style={{ fontWeight: 700, fontSize: 14.5, color: "var(--odj-texte)" }}>
                  {labelDate(f.date)}
                  {f.seq > 1 && (
                    <span style={{ marginLeft: 8, fontSize: 11, fontWeight: 700, color: "var(--odj-accent)", background: "var(--odj-bg)", padding: "2px 7px", borderRadius: 3, textTransform: "uppercase", letterSpacing: "0.03em" }}>
                      {f.seq}e demande
                    </span>
                  )}
                  {Array.isArray(f.data.commentaires) && f.data.commentaires.length > 0 && (
                    <span style={{ marginLeft: 8, fontSize: 11, fontWeight: 700, color: "var(--odj-avisTexte)", background: "var(--odj-avisBg)", padding: "2px 7px", borderRadius: 3, textTransform: "uppercase", letterSpacing: "0.03em" }}>
                      💬 {f.data.commentaires.length}
                    </span>
                  )}
                  {f.data.aucunTravaux && (
                    <span style={{ marginLeft: 8, fontSize: 11, fontWeight: 700, color: "var(--odj-texte2)", background: "var(--odj-bg)", padding: "2px 7px", borderRadius: 3, textTransform: "uppercase", letterSpacing: "0.03em" }}>
                      Aucun travaux
                    </span>
                  )}
                </div>
                <div style={{ fontSize: 12.5, color: "var(--odj-dim)", marginTop: 2 }}>
                  {f.data.aucunTravaux ? "Aucun travaux prévu" : (
                    <>
                      {f.data.chantier || "Aucun projet sélectionné"}
                      {" · "}12R {f.data.camions?.douze || 0} · 2E {f.data.camions?.deux || 0} · 3E {f.data.camions?.trois || 0}
                    </>
                  )}
                </div>
              </div>
              <ChevronRight size={18} color="#8a93a0" style={{ flexShrink: 0 }} />
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

/* ---------------------------------------------------------------------
   FICHE DÉTAIL — vue lecture seule d'une requête déjà envoyée
--------------------------------------------------------------------- */
function FicheDetail({ profil, date, seq = 1, onRetour, onModifier }) {
  const key = ficheKey(date, profil.userId, seq);
  const [fiche, setFiche] = useState(null);
  const [loading, setLoading] = useState(true);
  const [texteReponse, setTexteReponse] = useState("");
  const [envoiEnCours, setEnvoiEnCours] = useState(false);
  const [modalEcartOuvert, setModalEcartOuvert] = useState(false);
  const [texteEcart, setTexteEcart] = useState("");
  const [envoiEcartEnCours, setEnvoiEcartEnCours] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const r = await storage.get(key, true);
        if (!cancelled) setFiche(r ? JSON.parse(r.value) : null);
      } catch (e) {
        if (!cancelled) setFiche(null);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [key]);

  const envoyerReponse = async () => {
    if (!texteReponse.trim()) return;
    setEnvoiEnCours(true);
    try {
      const r = await storage.get(key, true);
      const donnees = r ? JSON.parse(r.value) : { ...fiche };
      const commentairesActuels = Array.isArray(donnees.commentaires) ? donnees.commentaires : [];
      const nouveauTexte = texteReponse.trim();
      donnees.commentaires = [...commentairesActuels, { auteur: profil.nom, texte: nouveauTexte, horodatage: new Date().toISOString() }];
      await storage.set(key, JSON.stringify(donnees), true);
      setFiche(donnees);
      setTexteReponse("");

      const dateTexte = new Date(date + "T12:00:00").toLocaleDateString("fr-CA", { day: "numeric", month: "long", year: "numeric" });
      const titreOriginal = `Ordre du jour - ${dateTexte} - ${profil.nom}`;
      try {
        await fetch("/api/ordre-du-jour/send-notification/", {
          method: "POST",
          headers: await entetesAuth(),
          body: JSON.stringify({ nom: profil.nom, date, chantier: donnees.chantier, commentateur: profil.nom, commentaire: nouveauTexte }),
        });
      } catch (eNotif) { /* secondaire */ }
      try {
        await fetch("/api/ordre-du-jour/send-push/", {
          method: "POST",
          headers: await entetesAuth(),
          body: JSON.stringify({ title: `IMPORTANT - ${profil.nom} - ${titreOriginal}`, body: nouveauTexte }),
        });
      } catch (ePush) { /* secondaire */ }
      try {
        await notifierCommentaire(profil, profil.userId, { date, slug: profil.userId, seq }, `Réponse de ${profil.nom}`, nouveauTexte);
      } catch (eCentre) { /* secondaire */ }
    } finally {
      setEnvoiEnCours(false);
    }
  };

  const envoyerEcart = async () => {
    if (!texteEcart.trim()) return;
    setEnvoiEcartEnCours(true);
    try {
      const r = await storage.get(key, true);
      const donnees = r ? JSON.parse(r.value) : { ...fiche };
      const commentairesActuels = Array.isArray(donnees.commentaires) ? donnees.commentaires : [];
      const nouveauTexte = texteEcart.trim();
      donnees.commentaires = [...commentairesActuels, { auteur: profil.nom, texte: nouveauTexte, horodatage: new Date().toISOString(), type: "ecart" }];
      await storage.set(key, JSON.stringify(donnees), true);
      setFiche(donnees);
      setTexteEcart("");
      setModalEcartOuvert(false);

      const dateTexte = new Date(date + "T12:00:00").toLocaleDateString("fr-CA", { day: "numeric", month: "long", year: "numeric" });
      const titreOriginal = `Ordre du jour - ${dateTexte} - ${profil.nom}`;
      try {
        await fetch("/api/ordre-du-jour/send-notification/", {
          method: "POST",
          headers: await entetesAuth(),
          body: JSON.stringify({ nom: profil.nom, date, chantier: donnees.chantier, commentateur: `${profil.nom} (Écart signalé)`, commentaire: nouveauTexte }),
        });
      } catch (eNotif) { /* secondaire */ }
      try {
        await fetch("/api/ordre-du-jour/send-push/", {
          method: "POST",
          headers: await entetesAuth(),
          body: JSON.stringify({ title: `ÉCART SIGNALÉ - ${profil.nom} - ${titreOriginal}`, body: nouveauTexte }),
        });
      } catch (ePush) { /* secondaire */ }
      try {
        await notifierCommentaire(profil, profil.userId, { date, slug: profil.userId, seq }, `Écart signalé par ${profil.nom}`, nouveauTexte, "ecart");
      } catch (eCentre) { /* secondaire */ }
    } finally {
      setEnvoiEcartEnCours(false);
    }
  };

  if (loading) return <div style={{ padding: 40, textAlign: "center", color: "var(--odj-dim)" }}>Chargement…</div>;
  if (!fiche) {
    return (
      <div style={{ maxWidth: 640, margin: "0 auto", padding: "20px 16px 60px" }}>
        <button onClick={onRetour} style={{ background: "transparent", border: "none", color: "var(--odj-accent)", fontSize: 13, fontWeight: 600, cursor: "pointer", marginBottom: 12, padding: 0 }}>← Retour à l'accueil</button>
        <div style={{ padding: 30, textAlign: "center", color: "var(--odj-dim)", border: "1px dashed var(--odj-line)", background: "var(--odj-panel)" }}>Cette requête est introuvable.</div>
      </div>
    );
  }

  const heuresDepuis = fiche.creeLe ? (Date.now() - new Date(fiche.creeLe).getTime()) / 3600000 : Infinity;
  const modifiable = heuresDepuis < 4;
  const postesActifs = ligneResume(POSTES, fiche.personnel?.postes);
  // Revision 66 — le contremaitre lit exactement ce que le dispatch recoit.
  // Le formulaire garde une copie de travail dans machinerie.equipements ET
  // en depose une sous _ajout ou _retrait selon le statut; c'est _ajout /
  // _retrait que le dispatch affiche. En lisant la copie de travail, cet
  // ecran pouvait presenter un RETRAIT comme s'il s'agissait d'un ajout.
  // On lit donc la meme source que le dispatch, et on dit laquelle c'est.
  const statutMach = fiche.machinerie?.statut;
  const sourceMach = statutMach === "retirer" ? fiche.machinerie?._retrait
    : statutMach === "ajouter" ? fiche.machinerie?._ajout
      : null;
  const equipActifs = ligneResume(EQUIPEMENTS, (sourceMach || fiche.machinerie)?.equipements);
  const accessActifs = ligneResume(ACCESSOIRES, (sourceMach || fiche.machinerie)?.accessoires);
  const etiquetteMach = statutMach === "retirer" ? "À RETIRER"
    : statutMach === "ajouter" ? "À AJOUTER" : null;
  const commentaires = Array.isArray(fiche.commentaires) ? fiche.commentaires : [];

  return (
    <div style={{ maxWidth: 640, margin: "0 auto", padding: "20px 16px 60px" }}>
      <button onClick={onRetour} style={{ background: "transparent", border: "none", color: "var(--odj-accent)", fontSize: 13, fontWeight: 600, cursor: "pointer", marginBottom: 12, padding: 0 }}>
        ← Retour à l'accueil
      </button>

      <div style={{ marginBottom: 16 }}>
        <div style={{ fontSize: 20, fontWeight: 700, color: "var(--odj-texte)" }}>Requête envoyée</div>
        <div style={{ color: "var(--odj-dim)", fontSize: 14 }}>{labelDate(date)}</div>
        {fiche.maj && <div style={{ color: "var(--odj-dim)", fontSize: 12, marginTop: 4, fontFamily: "'IBM Plex Mono', ui-monospace, 'SF Mono', Menlo, monospace" }}>Envoyée le {new Date(fiche.maj).toLocaleString("fr-CA")}</div>}
      </div>

      {fiche.aucunTravaux && (
        <div style={{ background: "var(--odj-panelAlt)", border: "1px solid var(--odj-line)", padding: "16px 18px", marginBottom: 16, fontStyle: "italic", color: "var(--odj-texte2)", fontSize: 14 }}>
          Aucun travaux prévu — pas de main d'œuvre requise pour cette journée.
        </div>
      )}

      {commentaires.length > 0 && (
        <div style={{ background: "var(--odj-avisBg)", border: "1px solid var(--odj-ambre)", borderLeft: "4px solid var(--odj-ambre)", padding: "12px 16px", marginBottom: 12, display: "grid", gap: 10 }}>
          <div style={{ fontWeight: 700, fontSize: 12, textTransform: "uppercase", letterSpacing: "0.03em", color: "var(--odj-avisTexte)" }}>
            Commentaires
          </div>
          {commentaires.map((c, i) => (
            <div key={i}>
              <div style={{ fontSize: 11.5, fontWeight: 700, color: c.type === "ecart" ? "var(--odj-err)" : "var(--odj-avisTexte)", marginBottom: 2 }}>
                {c.type === "ecart" ? `⚠️ Écart signalé par ${c.auteur}` : c.auteur}
              </div>
              <div style={{ fontSize: 13.5, color: "var(--odj-avisTexte)" }}>{c.texte}</div>
            </div>
          ))}
        </div>
      )}

      <div style={{ marginBottom: 16 }}>
        <button
          onClick={() => setModalEcartOuvert(true)}
          style={{ background: "transparent", border: "1px solid var(--odj-err)", color: "var(--odj-err)", padding: "9px 14px", fontWeight: 600, fontSize: 13, cursor: "pointer" }}
        >
          ⚠️ Signaler un écart (dispatch n'a pas livré ce qui était demandé)
        </button>
      </div>

      {modalEcartOuvert && (
        <div onClick={() => setModalEcartOuvert(false)} style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.45)", zIndex: 9999, display: "flex", alignItems: "flex-end", justifyContent: "center" }}>
          <div onClick={(e) => e.stopPropagation()} style={{ background: "var(--odj-panel)", width: "100%", maxWidth: 480, borderTop: "3px solid var(--odj-err)", padding: "24px 20px 20px" }}>
            <div style={{ fontWeight: 700, fontSize: 17, color: "var(--odj-accent)", marginBottom: 16 }}>
              Signaler un écart
            </div>
            <textarea
              value={texteEcart}
              onChange={(e) => setTexteEcart(e.target.value)}
              placeholder="Ex. Reçu 3 camions au lieu des 7 demandés."
              style={{ width: "100%", minHeight: 90, padding: "10px 12px", border: "1px solid var(--odj-line)", fontSize: 14, boxSizing: "border-box", marginBottom: 16 }}
            />
            <div style={{ display: "grid", gap: 8 }}>
              <button
                onClick={envoyerEcart}
                disabled={envoiEcartEnCours || !texteEcart.trim()}
                style={{ width: "100%", background: "var(--odj-err)", color: "#fff", border: "none", padding: "12px", fontWeight: 600, fontSize: 14, letterSpacing: "0.04em", textTransform: "uppercase", cursor: "pointer", opacity: (envoiEcartEnCours || !texteEcart.trim()) ? 0.6 : 1 }}
              >
                {envoiEcartEnCours ? "Envoi…" : "Envoyer le signalement"}
              </button>
              <button onClick={() => setModalEcartOuvert(false)} style={{ width: "100%", background: "transparent", color: "var(--odj-dim)", border: "none", padding: "8px", fontWeight: 600, fontSize: 13, cursor: "pointer" }}>
                Annuler
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Revision 66 — le champ etait conditionne a commentaires.length > 0 :
          le contremaitre ne pouvait que repondre, jamais ouvrir la
          discussion. Il est maintenant toujours la. */}
      <div style={{ marginBottom: 16 }}>
        <textarea
          value={texteReponse}
          onChange={(e) => setTexteReponse(e.target.value)}
          placeholder="Répondre…"
          style={{ width: "100%", minHeight: 70, padding: "10px 12px", border: "1px solid var(--odj-line)", fontSize: 14, boxSizing: "border-box", marginBottom: 8 }}
        />
        <button
          onClick={envoyerReponse}
          disabled={envoiEnCours || !texteReponse.trim()}
          style={{ background: "var(--odj-navy)", color: "#fff", border: "none", padding: "9px 16px", fontWeight: 600, fontSize: 13, letterSpacing: "0.03em", textTransform: "uppercase", cursor: "pointer", opacity: (envoiEnCours || !texteReponse.trim()) ? 0.6 : 1 }}
        >
          {envoiEnCours ? "Envoi…" : "Répondre"}
        </button>
      </div>


      <Section icon={ClipboardList} title="Chantier / projet">
        <div style={{ fontSize: 14.5 }}>{fiche.chantier || <span style={{ color: "var(--odj-dim)" }}>Aucun projet sélectionné</span>}</div>
        {fiche.chantier && adresseDuProjet(fiche.chantier) && (
          <div style={{ fontSize: 12.5, color: "#B9C2CC", marginTop: 4 }}>{adresseDuProjet(fiche.chantier)}</div>
        )}
      </Section>

      <Section icon={Users} title="Main d'oeuvre">
        {postesActifs.length > 0 ? (
          <div style={{ fontSize: 13.5 }}>
            {postesActifs.map((l) => `${l.label}: ${l.qte}${l.commentaire ? ` (${l.commentaire})` : ""}`).join(" · ")}
          </div>
        ) : (
          <div style={{ fontSize: 13.5, color: "var(--odj-dim)" }}>Aucune main d'oeuvre demandée</div>
        )}
        {fiche.personnel?.notes && <div style={{ fontSize: 13.5, color: "var(--odj-texte2)", marginTop: 6 }}>{fiche.personnel.notes}</div>}
      </Section>

      <Section icon={Wrench} title="Machinerie">
        <div style={{ marginBottom: (equipActifs.length || accessActifs.length || fiche.machinerie?.notes) ? 10 : 0 }}>
          <Plate tone={STATUTS.machinerie.find((s) => s.value === fiche.machinerie?.statut)?.tone}>
            {STATUTS.machinerie.find((s) => s.value === fiche.machinerie?.statut)?.label || "Aucun changement"}
          </Plate>
        </div>
        {equipActifs.length > 0 && (
          <div style={{ fontSize: 13.5, marginBottom: 4 }}>
            <span style={{ fontWeight: 600, color: "var(--odj-texte2)", fontSize: 11, textTransform: "uppercase", letterSpacing: "0.06em" }}>Machines {etiquetteMach ? `${etiquetteMach} ` : ""}— </span>
            {equipActifs.map((l) => `${l.label}: ${l.qte}${l.commentaire ? ` (${l.commentaire})` : ""}`).join(" · ")}
          </div>
        )}
        {accessActifs.length > 0 && (
          <div style={{ fontSize: 13.5, marginBottom: 6 }}>
            <span style={{ fontWeight: 600, color: "var(--odj-texte2)", fontSize: 11, textTransform: "uppercase", letterSpacing: "0.06em" }}>Accessoires — </span>
            {accessActifs.map((l) => `${l.label}: ${l.qte}${l.commentaire ? ` (${l.commentaire})` : ""}`).join(" · ")}
          </div>
        )}
        {fiche.machinerie?.notes && <div style={{ fontSize: 13.5, color: "var(--odj-texte2)" }}>{fiche.machinerie.notes}</div>}
      </Section>

      <Section icon={Fuel} title="Diesel (Fuel)">
        {fiche.diesel?.requis ? (
          <>
            <div style={{ fontSize: 13.5 }}>{fiche.diesel.requis === "oui" ? "Oui" : "Non"}</div>
            {fiche.diesel.requis === "oui" && (Number(fiche.diesel.grosses) > 0 || Number(fiche.diesel.petites) > 0) && (
              <div style={{ fontSize: 13.5, color: "var(--odj-texte2)", marginTop: 6 }}>
                Grosses machines : <b>{Number(fiche.diesel.grosses) || 0}</b> · Petites machines : <b>{Number(fiche.diesel.petites) || 0}</b>
              </div>
            )}
            {fiche.diesel.commentaire && <div style={{ fontSize: 13.5, color: "var(--odj-texte2)", marginTop: 6 }}>{fiche.diesel.commentaire}</div>}
          </>
        ) : (
          <div style={{ fontSize: 13.5, color: "var(--odj-dim)" }}>Non précisé</div>
        )}
      </Section>

      <Section icon={Truck} title="Transport en vrac">
        <div style={{ display: "flex", alignItems: "center", gap: 14, fontFamily: "'IBM Plex Mono', ui-monospace, 'SF Mono', Menlo, monospace", fontSize: 16, fontWeight: 400, flexWrap: "wrap" }}>
          <span>12 roues: <b style={{ fontWeight: 700 }}>{fiche.camions?.douze || 0}</b></span>
          <span style={{ color: "var(--odj-dim)" }}>|</span>
          <span>2 essieux: <b style={{ fontWeight: 700 }}>{fiche.camions?.deux || 0}</b></span>
          <span style={{ color: "var(--odj-dim)" }}>|</span>
          <span>3 essieux: <b style={{ fontWeight: 700 }}>{fiche.camions?.trois || 0}</b></span>
        </div>
        {[["douze", "12 roues"], ["deux", "2 essieux"], ["trois", "3 essieux"]].map(([k, l]) => {
          const drapeaux = [
            fiche.camions?.[`${k}Plein`] && "Plein",
            fiche.camions?.[`${k}Vide`] && "Vide",
            fiche.camions?.[`${k}Toile`] && "Toile",
          ].filter(Boolean);
          if (!drapeaux.length) return null;
          return (
            <div key={k} style={{ fontSize: 12.5, color: "var(--odj-texte2)", marginTop: 6 }}>
              <span style={{ fontWeight: 600 }}>{l} — </span>{drapeaux.join(" · ")}
            </div>
          );
        })}
        {fiche.camions?.notes && <div style={{ fontSize: 13.5, color: "var(--odj-texte2)", marginTop: 8 }}>{fiche.camions.notes}</div>}
      </Section>

      <Section icon={ClipboardList} title="Description des travaux du lendemain">
        <div style={{ fontSize: 14.5, whiteSpace: "pre-wrap" }}>{fiche.travaux || <span style={{ color: "var(--odj-dim)" }}>Aucune description</span>}</div>
      </Section>

      <Section icon={Package} title="Commentaires connexes">
        <div style={{ fontSize: 14.5, whiteSpace: "pre-wrap" }}>{fiche.materiel || <span style={{ color: "var(--odj-dim)" }}>Aucun</span>}</div>
      </Section>

      {modifiable ? (
        <button
          onClick={onModifier}
          style={{ width: "100%", background: "var(--odj-navy)", color: "#fff", border: "none", padding: "13px", fontWeight: 600, fontSize: 15, letterSpacing: "0.04em", textTransform: "uppercase", cursor: "pointer" }}
        >
          Modifier cette requête
        </button>
      ) : (
        /* Revision 66 — le gel apres 4 h est voulu, mais le contremaitre
           restait devant un mur. On lui dit quoi faire : telephoner, puis
           ecrire l'entente dans le fil pour que tout le monde la voie. */
        <div style={{ fontSize: 13, color: "var(--odj-texte2)", padding: "12px 14px", border: "1px solid var(--odj-line)", background: "var(--odj-avisBg)", lineHeight: 1.45 }}>
          <div style={{ fontWeight: 700, marginBottom: 4 }}>Cette requête est figée</div>
          Elle a été envoyée il y a plus de 4 h. Pour la changer, <b>appelle le dispatch
          directement par téléphone</b>, puis écris l’entente dans un commentaire ci-dessus —
          c’est ce qui laisse une trace et met tout le monde au courant.
        </div>
      )}
    </div>
  );
}

function FicheForm({ profil, date, onRetourAccueil, seq = 1 }) {
  const key = ficheKey(date, profil.userId, seq);
  const [fiche, setFiche] = useState(emptyFiche());
  const [loading, setLoading] = useState(true);
  const [status, setStatus] = useState(null);
  const [errMsg, setErrMsg] = useState("");
  const [confirme, setConfirme] = useState(false);
  const [dejaExistante, setDejaExistante] = useState(false);
  const { isPhone } = useDevice();

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    (async () => {
      let loaded = emptyFiche();
      try {
        const r = await storage.get(key, true);
        if (r) {
          setDejaExistante(true);
          const parsed = JSON.parse(r.value);
          loaded = {
            ...emptyFiche(),
            ...parsed,
            personnel: { ...emptyFiche().personnel, ...(parsed.personnel || {}), postes: { ...emptyLignes(POSTES), ...((parsed.personnel || {}).postes || {}) } },
            machinerie: { ...emptyFiche().machinerie, ...(parsed.machinerie || {}), equipements: { ...emptyLignes(EQUIPEMENTS), ...((parsed.machinerie || {}).equipements || {}) }, accessoires: { ...emptyLignes(ACCESSOIRES), ...((parsed.machinerie || {}).accessoires || {}) }, _ajout: { equipements: { ...emptyLignes(EQUIPEMENTS), ...((parsed.machinerie || {})._ajout?.equipements || {}) }, accessoires: { ...emptyLignes(ACCESSOIRES), ...((parsed.machinerie || {})._ajout?.accessoires || {}) } }, _retrait: { equipements: { ...emptyLignes(EQUIPEMENTS), ...((parsed.machinerie || {})._retrait?.equipements || {}) }, accessoires: { ...emptyLignes(ACCESSOIRES), ...((parsed.machinerie || {})._retrait?.accessoires || {}) } } },
            camions: { ...emptyFiche().camions, ...(parsed.camions || {}) },
          };
        } else {
          // Nouvelle fiche : initialise le nombre de contremaîtres selon le rôle
          // de la personne qui soumet (reste modifiable ensuite).
          loaded.personnel.postes.contremaitre.qte = profil.role === "contremaitre" ? "1" : "0";
        }
      } catch (e) {
        // pas de fiche existante — fiche vide
      }
      if (!cancelled) { setFiche(loaded); setLoading(false); }
    })();
    return () => { cancelled = true; };
  }, [key]);

  const update = (path, value) => {
    setFiche((prev) => {
      const next = JSON.parse(JSON.stringify(prev));
      let obj = next;
      for (let i = 0; i < path.length - 1; i++) obj = obj[path[i]];
      obj[path[path.length - 1]] = value;
      return next;
    });
  };

  const sleep = (ms) => new Promise((res) => setTimeout(res, ms));

  const save = async () => {
    // Revision 66 — le chantier est le minimum exigible : sans lui, le
    // dispatch ne sait meme pas ou envoyer. Avant, une fiche entierement
    // vide partait et declenchait un courriel a toute la direction.
    if (!String(fiche.chantier || "").trim()) {
      setErrMsg("Indique le chantier avant d'envoyer ta requête.");
      setStatus("");
      return;
    }
    setStatus("saving");
    setErrMsg("");
    // Synchroniser les données courantes dans la bonne mémoire avant de sauvegarder
    const ficheSync = JSON.parse(JSON.stringify(fiche));
    if (ficheSync.machinerie.statut === "ajouter") {
      ficheSync.machinerie._ajout = { equipements: { ...ficheSync.machinerie.equipements }, accessoires: { ...ficheSync.machinerie.accessoires } };
    } else if (ficheSync.machinerie.statut === "retirer") {
      ficheSync.machinerie._retrait = { equipements: { ...ficheSync.machinerie.equipements }, accessoires: { ...ficheSync.machinerie.accessoires } };
    }
    // Revision 66 — on ne jette plus le fil de commentaires quand le
    // contremaitre corrige sa requete. Avant, `commentaires: []` effacait
    // tout l'echange sans que rien ne le dise a l'ecran : le dispatch
    // repondait, le contremaitre modifiait, la reponse disparaissait.
    // On garde le fil et on y ajoute une ligne du systeme, pour que la
    // modification soit visible de tout le monde plutot que silencieuse.
    const dejaLa = Array.isArray(ficheSync.commentaires) ? ficheSync.commentaires : [];
    const estUneModification = Boolean(ficheSync.creeLe);
    const toSave = {
      ...ficheSync,
      maj: new Date().toISOString(),
      creeLe: ficheSync.creeLe || new Date().toISOString(),
      commentaires: estUneModification
        ? [...dejaLa, {
            auteur: "Système",
            texte: `Requête modifiée par ${profil?.nom || "le contremaître"}.`,
            horodatage: new Date().toISOString(),
            systeme: true,
          }]
        : dejaLa,
    };
    const tentatives = [0, 700, 1800];
    let derniereErreur = null;

    // 1) Tentatives sur le stockage PARTAGÉ (visible par dispatch/direction)
    for (let i = 0; i < tentatives.length; i++) {
      if (tentatives[i] > 0) await sleep(tentatives[i]);
      try {
        const r = await storage.set(key, JSON.stringify(toSave), true);
        if (!r) throw new Error("Le serveur n'a pas confirmé l'enregistrement.");
        setFiche(toSave);
        setStatus("saved");
        setConfirme(true);
        // Journal des requêtes (n'empêche jamais l'enregistrement principal en cas d'échec)
        try {
          const horodatage = new Date().toISOString();
          await storage.set(`log:${horodatage}:${profil.userId}`, JSON.stringify({
            nom: profil.nom,
            role: profil.role,
            dateFiche: date,
            seq,
            action: dejaExistante ? "Modification" : "Nouvelle demande",
            resume: resumerFiche(toSave),
            horodatage,
          }), true);
        } catch (eLog) { /* journal secondaire — on ignore l'échec */ }
        // Notification par courriel (secondaire — n'empêche jamais l'enregistrement principal)
        try {
          const persoNotif = POSTES
            .map((p) => ({ label: p.label, qte: Number(toSave.personnel.postes[p.key]?.qte) || 0, commentaire: toSave.personnel.postes[p.key]?.commentaire || "" }))
            .filter((l) => l.qte > 0);
          const ajoutMach = [
            ...ligneResume(EQUIPEMENTS, toSave.machinerie._ajout?.equipements),
            ...ligneResume(ACCESSOIRES, toSave.machinerie._ajout?.accessoires),
          ];
          const retraitMach = [
            ...ligneResume(EQUIPEMENTS, toSave.machinerie._retrait?.equipements),
            ...ligneResume(ACCESSOIRES, toSave.machinerie._retrait?.accessoires),
          ];
          await fetch("/api/ordre-du-jour/send-notification/", {
            method: "POST",
            headers: await entetesAuth(),
            body: JSON.stringify({
              nom: profil.nom,
              date,
              chantier: toSave.chantier,
              personnel: persoNotif,
              machinerie: { ajout: ajoutMach, retrait: retraitMach },
              camions: {
                douze: Number(toSave.camions.douze) || 0,
                deux: Number(toSave.camions.deux) || 0,
                trois: Number(toSave.camions.trois) || 0,
              },
              diesel: {
                requis: toSave.diesel.requis,
                grosses: Number(toSave.diesel.grosses) || 0,
                petites: Number(toSave.diesel.petites) || 0,
                commentaire: toSave.diesel.commentaire,
              },
            }),
          });
        } catch (eNotif) { /* notification secondaire — on ignore l'échec */ }
        // Notification push (secondaire — n'empêche jamais l'enregistrement principal)
        try {
          await fetch("/api/ordre-du-jour/send-push/", {
            method: "POST",
            headers: await entetesAuth(),
            body: JSON.stringify({
              title: "PEP2000 — Ordre du jour",
              body: `Nouvelle requête soumise par ${profil.nom}`,
            }),
          });
        } catch (ePush) { /* notification secondaire — on ignore l'échec */ }
        // Notification dans le centre de notifications de l'app (secondaire)
        try {
          await notifierNouvelleRequete(
            profil,
            { date, slug: profil.userId, seq },
            dejaExistante ? `Requête modifiée — ${profil.nom}` : `Nouvelle requête — ${profil.nom}`,
            toSave.chantier || "Aucun chantier sélectionné"
          );
        } catch (eCentre) { /* notification secondaire — on ignore l'échec */ }
        return;
      } catch (e) {
        derniereErreur = e;
      }
    }

    // 2) Filet de sécurité: stockage LOCAL (non partagé) pour ne pas perdre la saisie
    try {
      await storage.set(`brouillon:${key}`, JSON.stringify(toSave), false);
      setFiche(toSave);
      setStatus("local");
    } catch (e2) {
      setStatus("error");
      setErrMsg((derniereErreur?.message || String(derniereErreur)) + " (3 tentatives, brouillon local aussi échoué)");
    }
  };

  const [diag, setDiag] = useState(null);
  const runDiagnostic = async () => {
    setDiag("Test en cours…");
    const out = [];
    try {
      await storage.set("diag:test", "ok", false);
      out.push("Stockage personnel: OK");
    } catch (e) { out.push("Stockage personnel: ÉCHEC — " + (e?.message || e)); }
    try {
      await storage.set("diag:test", "ok", true);
      out.push("Stockage partagé: OK");
    } catch (e) { out.push("Stockage partagé: ÉCHEC — " + (e?.message || e)); }
    setDiag(out.join("  ·  "));
  };

  if (loading) return <div style={{ padding: 40, textAlign: "center", color: "var(--odj-dim)" }}>Chargement…</div>;

  if (confirme) {
    const heure = new Date().getHours() * 60 + new Date().getMinutes();
    const avant12h = heure < 12 * 60;
    return (
      <div style={{ minHeight: "100vh", background: "var(--odj-bg)", display: "flex", alignItems: "center", justifyContent: "center", padding: 20 }}>
        <div style={{ width: "100%", maxWidth: 440, background: "var(--odj-panel)", border: "1px solid var(--odj-line)", textAlign: "center" }}>
          <div style={{ background: "var(--odj-okBg)", padding: "40px 24px 28px", borderTop: "4px solid var(--odj-ok)" }}>
            <CheckCircle2 size={56} color="#3C8C5D" style={{ marginBottom: 14 }} />
            <div style={{ fontWeight: 700, fontSize: 24, color: "var(--odj-ok)" }}>Merci de votre envoi !</div>
            <div style={{ fontSize: 15, color: avant12h ? "var(--odj-ok)" : "var(--odj-err)", marginTop: 6 }}>
              {avant12h
                ? "Demande avant 12h00, super ça, merci !"
                : "On comprend que des fois il y a des exceptions mais on essaye d'envoyer ça avant 12h00 svp !"}
            </div>
            <div style={{ fontSize: 13.5, color: "var(--odj-ok)", marginTop: 10 }}>Les dispatchs et la direction peuvent maintenant voir votre requête pour {labelDate(date).toLowerCase()}.</div>
          </div>
          <div style={{ padding: 24, display: "grid", gap: 10 }}>
            <button
              onClick={onRetourAccueil}
              style={{ width: "100%", background: "var(--odj-navy)", color: "#fff", border: "none", padding: "13px", fontWeight: 600, fontSize: 14, letterSpacing: "0.04em", textTransform: "uppercase", cursor: "pointer" }}
            >
              Confirmer, retour à l'accueil
            </button>
            <button
              onClick={() => setConfirme(false)}
              style={{ width: "100%", background: "var(--odj-panel)", color: "var(--odj-accent)", border: "1.5px solid var(--odj-accent)", padding: "13px", fontWeight: 600, fontSize: 14, letterSpacing: "0.04em", textTransform: "uppercase", cursor: "pointer" }}
            >
              Modifier ma requête
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div style={{ maxWidth: 640, margin: "0 auto", padding: isPhone ? "12px 12px 60px" : "20px 16px 60px" }}>
      <button onClick={onRetourAccueil} style={{ background: "transparent", border: "none", color: "var(--odj-accent)", fontSize: 13, fontWeight: 600, cursor: "pointer", marginBottom: 12, padding: 0 }}>
        ← Retour à l'accueil
      </button>
      <div style={{ marginBottom: 16 }}>
        <div style={{ fontSize: 20, fontWeight: 700, color: "var(--odj-texte)" }}>Fiche du lendemain</div>
        <div style={{ color: "var(--odj-dim)", fontSize: 14 }}>{labelDate(date)}</div>
        {fiche.maj && <div style={{ color: "var(--odj-dim)", fontSize: 12, marginTop: 4, fontFamily: "'IBM Plex Mono', ui-monospace, 'SF Mono', Menlo, monospace" }}>Dernière mise à jour {new Date(fiche.maj).toLocaleString("fr-CA")}</div>}
      </div>

      <Section icon={ClipboardList} title="Chantier / projet">
        <div style={{ position: "relative" }}>
          <select style={selectStyle} value={fiche.chantier} onChange={(e) => update(["chantier"], e.target.value)}>
            <option value="">— Sélectionner un projet —</option>
            {PROJETS.map((p) => <option key={p} value={p}>{p}</option>)}
          </select>
          <ChevronDown size={16} style={{ position: "absolute", right: 11, top: 12, color: "var(--odj-dim)", pointerEvents: "none" }} />
        </div>
        {fiche.chantier && adresseDuProjet(fiche.chantier) && (
          <div style={{ fontSize: 12.5, color: "#B9C2CC", marginTop: 6 }}>{adresseDuProjet(fiche.chantier)}</div>
        )}
      </Section>

      <Section icon={Users} title="Main d'oeuvre">
        <label style={labelStyle}>Équipe requise pour demain (nombre total par poste)</label>
        <LignesTable
          items={POSTES}
          valeurs={fiche.personnel.postes}
          onChangeQte={(k, v) => update(["personnel", "postes", k, "qte"], v)}
          onChangeCommentaire={(k, v) => update(["personnel", "postes", k, "commentaire"], v)}
        />
        <label style={{ ...labelStyle, marginTop: 12 }}>Autres notes (optionnel)</label>
        <textarea style={{ ...inputStyle, minHeight: 50 }} value={fiche.personnel.notes} onChange={(e) => update(["personnel", "notes"], e.target.value)} />
      </Section>

      <Section icon={Wrench} title="Machinerie">
        <StatutChoix groupe="machinerie" valeur={fiche.machinerie.statut} onChange={(v) => {
          // Sauvegarder les données courantes dans la mémoire du statut actuel, puis charger celles du nouveau statut
          setFiche((prev) => {
            const next = JSON.parse(JSON.stringify(prev));
            const ancienStatut = prev.machinerie.statut;
            // Sauvegarder dans la bonne mémoire si on était sur ajouter ou retirer
            if (ancienStatut === "ajouter") {
              next.machinerie._ajout = { equipements: { ...prev.machinerie.equipements }, accessoires: { ...prev.machinerie.accessoires } };
            } else if (ancienStatut === "retirer") {
              next.machinerie._retrait = { equipements: { ...prev.machinerie.equipements }, accessoires: { ...prev.machinerie.accessoires } };
            }
            // Charger la mémoire du nouveau statut
            if (v === "ajouter") {
              next.machinerie.equipements = { ...prev.machinerie._ajout.equipements };
              next.machinerie.accessoires = { ...prev.machinerie._ajout.accessoires };
            } else if (v === "retirer") {
              next.machinerie.equipements = { ...prev.machinerie._retrait.equipements };
              next.machinerie.accessoires = { ...prev.machinerie._retrait.accessoires };
            } else {
              next.machinerie.equipements = emptyLignes(EQUIPEMENTS);
              next.machinerie.accessoires = emptyLignes(ACCESSOIRES);
            }
            next.machinerie.statut = v;
            return next;
          });
        }} />
        {fiche.machinerie.statut !== "meme" && (
          <div style={{ marginBottom: 12 }}>
            <label style={labelStyle}>{fiche.machinerie.statut === "retirer" ? "Machines à retirer" : "Machines à ajouter"}</label>
            <LignesTable
              items={EQUIPEMENTS}
              valeurs={fiche.machinerie.equipements}
              onChangeQte={(k, v) => update(["machinerie", "equipements", k, "qte"], v)}
              onChangeCommentaire={(k, v) => update(["machinerie", "equipements", k, "commentaire"], v)}
              showStock
            />
            <label style={{ ...labelStyle, marginTop: 14 }}>Accessoires à {fiche.machinerie.statut === "retirer" ? "retirer" : "ajouter"}</label>
            <LignesTable
              items={ACCESSOIRES}
              valeurs={fiche.machinerie.accessoires}
              onChangeQte={(k, v) => update(["machinerie", "accessoires", k, "qte"], v)}
              onChangeCommentaire={(k, v) => update(["machinerie", "accessoires", k, "commentaire"], v)}
              showStock
            />
          </div>
        )}
        <label style={labelStyle}>Autres notes (optionnel)</label>
        <textarea style={{ ...inputStyle, minHeight: 50 }} placeholder="Ex. l'endroit à laquelle la machine se trouve, condition spéciale, code de cadenas…" value={fiche.machinerie.notes} onChange={(e) => update(["machinerie", "notes"], e.target.value)} />
      </Section>

      <Section icon={Fuel} title="Diesel (Fuel)">
        <div style={{ display: "flex", gap: 8, marginBottom: 10 }}>
          {[["oui", "Oui"], ["non", "Non"]].map(([val, label]) => {
            const actif = fiche.diesel.requis === val;
            return (
              <button
                key={val}
                type="button"
                onClick={() => update(["diesel", "requis"], val)}
                style={{
                  flex: 1, padding: "9px 12px", fontSize: 13.5, fontWeight: 600,
                  border: `1.5px solid ${actif ? "var(--odj-accent)" : "var(--odj-line)"}`,
                  background: actif ? "var(--odj-accent)" : "var(--odj-panel)",
                  color: actif ? "#fff" : "var(--odj-texte2)",
                  cursor: "pointer",
                }}
              >
                {label}
              </button>
            );
          })}
        </div>
        {fiche.diesel.requis === "oui" && (
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginBottom: 12 }}>
            <div>
              <label style={labelStyle}>Grosses machines</label>
              <select
                value={fiche.diesel.grosses ?? "0"}
                onChange={(e) => update(["diesel", "grosses"], e.target.value)}
                style={selectStyle}
              >
                {Array.from({ length: 21 }, (_, i) => i).map((n) => <option key={n} value={String(n)}>{n}</option>)}
              </select>
            </div>
            <div>
              <label style={labelStyle}>Petites machines</label>
              <select
                value={fiche.diesel.petites ?? "0"}
                onChange={(e) => update(["diesel", "petites"], e.target.value)}
                style={selectStyle}
              >
                {Array.from({ length: 21 }, (_, i) => i).map((n) => <option key={n} value={String(n)}>{n}</option>)}
              </select>
            </div>
          </div>
        )}
        <label style={labelStyle}>Autres notes (optionnel)</label>
        <textarea
          style={{ ...inputStyle, minHeight: 50 }}
          placeholder="Quelles machines?"
          value={fiche.diesel.commentaire || ""}
          onChange={(e) => update(["diesel", "commentaire"], e.target.value)}
        />
      </Section>

      <Section icon={Truck} title="Transport en vrac">
        <div style={{ display: "grid", gridTemplateColumns: isPhone ? "1fr" : "repeat(3,1fr)", gap: 12 }}>
          {[["douze", "12 roues"], ["deux", "2 essieux"], ["trois", "3 essieux"]].map(([k, l]) => (
            <div key={k}>
              <label style={labelStyle}>{l}</label>
              <input
                style={{ ...inputStyle, fontFamily: "'IBM Plex Mono', ui-monospace, 'SF Mono', Menlo, monospace", textAlign: "center", fontSize: 18, fontWeight: 600 }}
                type="text"
                inputMode="numeric"
                pattern="[0-9]*"
                placeholder="—"
                value={fiche.camions[k] === "0" || fiche.camions[k] === 0 ? "" : fiche.camions[k]}
                onChange={(e) => {
                  const val = e.target.value.replace(/[^0-9]/g, "");
                  update(["camions", k], val === "" ? "0" : val);
                }}
              />
              <div style={{ display: "flex", gap: 6, marginTop: 6 }}>
                {[["Plein", `${k}Plein`], ["Vide", `${k}Vide`], ["Toile", `${k}Toile`]].map(([label, champ]) => {
                  const actif = !!fiche.camions[champ];
                  return (
                    <button
                      key={champ}
                      type="button"
                      onClick={() => update(["camions", champ], !actif)}
                      style={{
                        flex: 1, padding: "5px 4px", fontSize: 11, fontWeight: 600,
                        border: `1.5px solid ${actif ? "var(--odj-accent)" : "var(--odj-line)"}`,
                        background: actif ? "var(--odj-accent)" : "var(--odj-panel)",
                        color: actif ? "#fff" : "var(--odj-texte2)",
                        cursor: "pointer",
                      }}
                    >
                      {label}
                    </button>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
        <div style={{ marginTop: 12 }}>
          <label style={labelStyle}>Commentaires (optionnel)</label>
          <textarea
            style={{ ...inputStyle, minHeight: 50 }}
            placeholder="Ex. camions vides, camions chargés, type de matériel, lieu de chargement, chargement à 6h, adresse spéciale…"
            value={fiche.camions.notes || ""}
            onChange={(e) => update(["camions", "notes"], e.target.value)}
          />
        </div>
      </Section>

      <Section icon={ClipboardList} title="Description des travaux du lendemain">
        <textarea style={{ ...inputStyle, minHeight: 90 }} placeholder="Brève description des travaux à réaliser" value={fiche.travaux} onChange={(e) => update(["travaux"], e.target.value)} />
      </Section>

      <Section icon={Package} title="Commentaires connexes">
        <textarea style={{ ...inputStyle, minHeight: 70 }} placeholder="Svp aviser la personne concernée par téléphone également dans les débuts de l'application." value={fiche.materiel} onChange={(e) => update(["materiel"], e.target.value)} />
      </Section>

      <button
        onClick={save}
        /* Revision 66 — l'envoi peut durer 2,5 s (3 tentatives, attentes de
           700 et 1800 ms) et le bouton restait cliquable : sur un lien de
           chantier, deux clics = deux courriels a toute la direction. */
        disabled={status === "saving"}
        style={{ width: "100%", background: "var(--odj-navy)", color: "#fff", border: "none", padding: "13px", fontWeight: 600, fontSize: 15, letterSpacing: "0.04em", textTransform: "uppercase", cursor: status === "saving" ? "default" : "pointer", opacity: status === "saving" ? 0.6 : 1, display: "flex", alignItems: "center", justifyContent: "center", gap: 8 }}
      >
        {status === "saving" ? "Envoi en cours…" : status === "local" ? <><CheckCircle2 size={17} /> Brouillon local sauvegardé</> : <><SendHorizontal size={17} /> Envoyer ma requête</>}
      </button>
      {status === "local" && (
        <div style={{ marginTop: 10, color: "var(--odj-avisTexte)", background: "var(--odj-avisBg)", border: "1px solid var(--odj-ambre)", padding: "10px 12px", fontSize: 13, display: "flex", alignItems: "flex-start", gap: 6 }}>
          <AlertCircle size={15} style={{ flexShrink: 0, marginTop: 1 }} /> Le stockage partagé est indisponible en ce moment — votre saisie est gardée localement (visible seulement par vous). Réessayez "Envoyer" plus tard pour la rendre visible aux dispatchs.
        </div>
      )}
      {status === "error" && (
        <div style={{ marginTop: 10, color: "var(--odj-err)", fontSize: 13, display: "flex", alignItems: "flex-start", gap: 6 }}>
          <AlertCircle size={15} style={{ flexShrink: 0, marginTop: 1 }} /> Échec de l'envoi — {errMsg || "réessayez."}
        </div>
      )}
    </div>
  );
}

/* ---------------------------------------------------------------------
   DASHBOARD (vues dispatch / direction)
--------------------------------------------------------------------- */
function StatCard({ label, value, tone, compact }) {
  return (
    <div style={{ background: "var(--odj-panel)", border: "1px solid var(--odj-line)", borderTop: `3px solid ${tone || "var(--odj-accent)"}`, padding: compact ? "8px 6px" : "14px 16px", minWidth: compact ? 0 : 110, flex: 1 }}>
      <div style={{ fontFamily: "'IBM Plex Mono', ui-monospace, 'SF Mono', Menlo, monospace", fontWeight: 600, fontSize: compact ? 20 : 26, color: "var(--odj-texte)" }}>{value}</div>
      <div style={{ fontSize: compact ? 9.5 : 12, lineHeight: 1.25, color: "var(--odj-dim)", textTransform: "uppercase", letterSpacing: "0.02em", marginTop: 2, wordBreak: compact ? "break-word" : "normal" }}>{label}</div>
    </div>
  );
}

function ligneResume(items, valeurs) {
  return items
    .map((it) => ({ label: it.label, qte: Number(valeurs?.[it.key]?.qte) || 0, commentaire: valeurs?.[it.key]?.commentaire || "" }))
    .filter((l) => l.qte > 0 || l.commentaire);
}

function FicheCard({ f, precedent, profil, onCommentaire }) {
  const separateur = { borderTop: "1px solid var(--odj-lineFaible)", paddingTop: 10, marginTop: 2 };
  const titreStyle = { fontSize: 11, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.06em", color: "var(--odj-dim)", marginBottom: 4 };
  const contenuStyle = { fontSize: 13.5, color: "var(--odj-texte)" };
  const commentaireStyle = { fontSize: 13, color: "var(--odj-texte2)", marginTop: 4 };
  const [modalOuvert, setModalOuvert] = useState(false);
  const [texteCommentaire, setTexteCommentaire] = useState("");
  const [envoiEnCours, setEnvoiEnCours] = useState(false);
  const commentaires = Array.isArray(f.data.commentaires) ? f.data.commentaires : [];

  if (f.data.aucunTravaux) {
    return (
      <div style={{ background: "var(--odj-panel)", border: "1px solid var(--odj-line)", borderLeft: "3px solid var(--odj-dim)", marginBottom: 14, padding: "16px 18px" }}>
        <div style={{ fontWeight: 700, fontSize: 15.5, color: "var(--odj-texte)", marginBottom: 4 }}>{f.nom}</div>
        <div style={{ fontSize: 13.5, color: "var(--odj-dim)", fontStyle: "italic" }}>Aucun travaux prévu — pas de main d'œuvre requise</div>
      </div>
    );
  }

  const envoyerCommentaire = async () => {
    if (!texteCommentaire.trim()) return;
    setEnvoiEnCours(true);
    try {
      await onCommentaire(f, texteCommentaire.trim());
      setTexteCommentaire("");
      setModalOuvert(false);
    } finally {
      setEnvoiEnCours(false);
    }
  };

  // Personnel — total requis + différence vs la dernière requête soumise
  const postesActifs = POSTES
    .map((p) => {
      const qte = Number(f.data.personnel.postes?.[p.key]?.qte) || 0;
      const commentaire = f.data.personnel.postes?.[p.key]?.commentaire || "";
      const qtePrec = precedent ? (Number(precedent.postes?.[p.key]?.qte) || 0) : null;
      const delta = qtePrec === null ? null : qte - qtePrec;
      return { label: p.label, qte, commentaire, delta };
    })
    .filter((l) => l.qte > 0 || l.commentaire);

  // Machinerie — lire les deux mémoires
  const equipAjout    = ligneResume(EQUIPEMENTS, f.data.machinerie._ajout?.equipements);
  const equipRetrait  = ligneResume(EQUIPEMENTS, f.data.machinerie._retrait?.equipements);
  const accessAjout   = ligneResume(ACCESSOIRES, f.data.machinerie._ajout?.accessoires);
  const accessRetrait = ligneResume(ACCESSOIRES, f.data.machinerie._retrait?.accessoires);
  const statutMach    = f.data.machinerie.statut;
  const equipCourant  = ligneResume(EQUIPEMENTS, f.data.machinerie.equipements);
  const accessCourant = ligneResume(ACCESSOIRES, f.data.machinerie.accessoires);
  const equipAjoutFinal    = equipAjout.length > 0 ? equipAjout : (statutMach === "ajouter" ? equipCourant : []);
  const equipRetraitFinal  = equipRetrait.length > 0 ? equipRetrait : (statutMach === "retirer" ? equipCourant : []);
  const accessAjoutFinal   = accessAjout.length > 0 ? accessAjout : (statutMach === "ajouter" ? accessCourant : []);
  const accessRetraitFinal = accessRetrait.length > 0 ? accessRetrait : (statutMach === "retirer" ? accessCourant : []);

  const hasCamions    = Number(f.data.camions.douze) > 0 || Number(f.data.camions.deux) > 0 || Number(f.data.camions.trois) > 0 || f.data.camions.notes;
  const hasPersonnel  = postesActifs.length > 0 || f.data.personnel.notes;
  const hasMachinerie = equipAjoutFinal.length > 0 || equipRetraitFinal.length > 0 || accessAjoutFinal.length > 0 || accessRetraitFinal.length > 0 || f.data.machinerie.notes;

  const rangeeStatut = (items, type, section) => items.map((l) => {
    const isRetrait = type === "retrait";
    const couleur = section === "personnel"
      ? (isRetrait ? TONE_HEX.orange : TONE_HEX.blue)
      : (isRetrait ? TONE_HEX.red : TONE_HEX.green);
    return (
      <span key={`${type}-${l.key}`}>
        <span style={{ fontWeight: 700, color: couleur, fontSize: 11, textTransform: "uppercase", letterSpacing: "0.04em", marginRight: 6 }}>
          {isRetrait ? "↓ Retrait" : "↑ Ajout"}
        </span>
        {l.label} : {l.qte}{l.commentaire ? `  -  ${l.commentaire}` : ""}
      </span>
    );
  });

  // Badge en-tête — Main d'oeuvre montre maintenant le total, pas ajout/retrait
  const totalPerso = postesActifs.reduce((s, l) => s + l.qte, 0);
  const badgePerso = hasPersonnel
    ? <Plate tone="steel">Main d'oeuvre : {totalPerso}</Plate>
    : <Plate tone="steel">Main d'oeuvre : Aucune</Plate>;

  const badgeMach = hasMachinerie
    ? ((equipAjoutFinal.length > 0 || accessAjoutFinal.length > 0) && (equipRetraitFinal.length > 0 || accessRetraitFinal.length > 0)
        ? <><Plate tone="green">Machinerie : Ajout</Plate><Plate tone="red">Machinerie : Retrait</Plate></>
        : <Plate tone={(equipRetraitFinal.length > 0 || accessRetraitFinal.length > 0) ? "red" : "green"}>Machinerie : {(equipRetraitFinal.length > 0 || accessRetraitFinal.length > 0) ? "Retrait" : "Ajout"}</Plate>)
    : <Plate tone="gray">Machinerie : Aucun changement</Plate>;

  return (
    <div style={{ background: "var(--odj-panel)", border: "1px solid var(--odj-line)", borderLeft: "3px dashed var(--odj-dim)", marginBottom: 14 }}>
      <div style={{ padding: "12px 16px", borderBottom: "1px solid var(--odj-lineFaible)", display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 8 }}>
        <div>
          <div style={{ display: "flex", alignItems: "baseline", gap: 10, flexWrap: "wrap" }}>
            <div style={{ fontWeight: 700, fontSize: 16 }}>{f.nom}</div>
            {f.data.chantier && <div style={{ fontSize: 14, color: "var(--odj-dim)" }}>{f.data.chantier}</div>}
          </div>
        </div>
        <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
          {badgePerso}
          {badgeMach}
        </div>
      </div>

      <div style={{ padding: "14px 16px", display: "grid", gap: 10 }}>

        {/* Transport en vrac */}
        {hasCamions && (
          <div>
            <div style={titreStyle}>Transport en vrac</div>
            <div style={{ ...contenuStyle, display: "flex", flexDirection: "column", gap: 2 }}>
              {Number(f.data.camions.douze) > 0 && <span>12 roues : {f.data.camions.douze}</span>}
              {Number(f.data.camions.deux) > 0 && <span>2 essieux : {f.data.camions.deux}</span>}
              {Number(f.data.camions.trois) > 0 && <span>3 essieux : {f.data.camions.trois}</span>}
              {Number(f.data.camions.douze) === 0 && Number(f.data.camions.deux) === 0 && Number(f.data.camions.trois) === 0 && <span style={{ color: "var(--odj-dim)" }}>Aucun</span>}
            </div>
            {f.data.camions.notes && <div style={commentaireStyle}><span style={{ fontWeight: 600 }}>Commentaire :</span> {f.data.camions.notes}</div>}
          </div>
        )}

        {/* Main d'oeuvre */}
        {hasPersonnel && (
          <div style={hasCamions ? separateur : {}}>
            <div style={titreStyle}>Main d'oeuvre</div>
            <div style={{ ...contenuStyle, display: "flex", flexDirection: "column", gap: 2 }}>
              {postesActifs.map((l) => (
                <span key={l.label}>
                  {l.label} : <b>{l.qte}</b>
                  {l.delta !== null && l.delta !== 0 && (
                    <span style={{ color: l.delta > 0 ? TONE_HEX.blue : TONE_HEX.orange, fontWeight: 700, marginLeft: 6 }}>
                      ({l.delta > 0 ? "+" : ""}{l.delta} vs dernière)
                    </span>
                  )}
                  {l.commentaire ? `  -  ${l.commentaire}` : ""}
                </span>
              ))}
            </div>
            {f.data.personnel.notes && <div style={commentaireStyle}><span style={{ fontWeight: 600 }}>Commentaire :</span> {f.data.personnel.notes}</div>}
          </div>
        )}

        {/* Machinerie */}
        {hasMachinerie && (
          <div style={(hasCamions || hasPersonnel) ? separateur : {}}>
            <div style={titreStyle}>Machinerie</div>
            <div style={{ ...contenuStyle, display: "flex", flexDirection: "column", gap: 2 }}>
              {rangeeStatut(equipAjoutFinal, "ajout", "machinerie")}
              {rangeeStatut(equipRetraitFinal, "retrait", "machinerie")}
              {(accessAjoutFinal.length > 0 || accessRetraitFinal.length > 0) && (
                <span style={{ color: "var(--odj-violet)", fontWeight: 600, fontSize: 11, textTransform: "uppercase", letterSpacing: "0.04em", marginTop: 4 }}>Accessoires</span>
              )}
              {rangeeStatut(accessAjoutFinal, "ajout", "machinerie")}
              {rangeeStatut(accessRetraitFinal, "retrait", "machinerie")}
            </div>
            {f.data.machinerie.notes && <div style={commentaireStyle}><span style={{ fontWeight: 600 }}>Commentaire :</span> {f.data.machinerie.notes}</div>}
          </div>
        )}

        {/* Diesel (Fuel) retiré de la Vue générale — visible uniquement dans l'onglet Diesel dédié */}

        {/* Travaux */}
        {f.data.travaux && (
          <div style={(hasCamions || hasPersonnel || hasMachinerie) ? separateur : {}}>
            <div style={titreStyle}>Description des travaux</div>
            <div style={contenuStyle}>{f.data.travaux}</div>
          </div>
        )}

        {/* Commentaires connexes */}
        {f.data.materiel && (
          <div style={(hasCamions || hasPersonnel || hasMachinerie || f.data.travaux) ? separateur : {}}>
            <div style={titreStyle}>Commentaires connexes</div>
            <div style={contenuStyle}>{f.data.materiel}</div>
          </div>
        )}

      </div>

      {commentaires.length > 0 && (
        <div style={{ margin: "0 16px 14px", background: "var(--odj-avisBg)", border: "1px solid var(--odj-ambre)", borderLeft: "4px solid var(--odj-ambre)", padding: "10px 14px", display: "grid", gap: 8 }}>
          {commentaires.map((c, i) => (
            <div key={i}>
              <div style={{ fontWeight: 700, fontSize: 11, textTransform: "uppercase", letterSpacing: "0.03em", color: c.type === "ecart" ? "var(--odj-err)" : "var(--odj-avisTexte)", marginBottom: 2 }}>
                {c.type === "ecart" ? `⚠️ Écart signalé par ${c.auteur}` : c.auteur}
              </div>
              <div style={{ fontSize: 13.5, color: "var(--odj-avisTexte)" }}>{c.texte}</div>
            </div>
          ))}
        </div>
      )}

      {peutCommenter(profil) && (
        <div style={{ padding: "0 16px 14px" }}>
          <button
            onClick={() => setModalOuvert(true)}
            style={{ background: "transparent", border: "1px solid var(--odj-line)", padding: "7px 12px", fontSize: 12.5, cursor: "pointer", color: "var(--odj-texte2)" }}
          >
            💬 {commentaires.length > 0 ? "Ajouter un commentaire" : "Commenter"}
          </button>
        </div>
      )}

      {modalOuvert && (
        <div onClick={() => setModalOuvert(false)} style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.45)", zIndex: 9999, display: "flex", alignItems: "flex-end", justifyContent: "center" }}>
          <div onClick={(e) => e.stopPropagation()} style={{ background: "var(--odj-panel)", width: "100%", maxWidth: 480, borderTop: "3px solid var(--odj-ambre)", padding: "24px 20px 20px", maxHeight: "85vh", overflowY: "auto" }}>
            <div style={{ fontWeight: 700, fontSize: 17, color: "var(--odj-accent)", marginBottom: 2 }}>
              Commentaires — {f.nom}
            </div>
            {f.data.chantier && <div style={{ fontSize: 13, color: "var(--odj-dim)", marginBottom: 16 }}>{f.data.chantier}</div>}

            {commentaires.length > 0 && (
              <div style={{ display: "grid", gap: 10, marginBottom: 16, paddingBottom: 16, borderBottom: "1px solid var(--odj-lineFaible)" }}>
                {commentaires.map((c, i) => (
                  <div key={i} style={{ background: "var(--odj-panelAlt)", padding: "8px 12px" }}>
                    <div style={{ fontSize: 11, fontWeight: 700, color: c.type === "ecart" ? "var(--odj-err)" : "var(--odj-texte2)", marginBottom: 2 }}>
                      {c.type === "ecart" ? `⚠️ Écart signalé par ${c.auteur}` : c.auteur}
                    </div>
                    <div style={{ fontSize: 13.5, color: "var(--odj-texte)" }}>{c.texte}</div>
                  </div>
                ))}
              </div>
            )}

            <textarea
              value={texteCommentaire}
              onChange={(e) => setTexteCommentaire(e.target.value)}
              placeholder="Ex. On pourrait faire ça à 3 gars, pas besoin de 4."
              style={{ width: "100%", minHeight: 90, padding: "10px 12px", border: "1px solid var(--odj-line)", fontSize: 14, boxSizing: "border-box", marginBottom: 16 }}
            />
            <div style={{ display: "grid", gap: 8 }}>
              <button
                onClick={envoyerCommentaire}
                disabled={envoiEnCours || !texteCommentaire.trim()}
                style={{ width: "100%", background: "var(--odj-navy)", color: "#fff", border: "none", padding: "12px", fontWeight: 600, fontSize: 14, letterSpacing: "0.04em", textTransform: "uppercase", cursor: "pointer", opacity: (envoiEnCours || !texteCommentaire.trim()) ? 0.6 : 1 }}
              >
                {envoiEnCours ? "Envoi…" : "Ajouter ce commentaire"}
              </button>
              <button onClick={() => setModalOuvert(false)} style={{ width: "100%", background: "transparent", color: "var(--odj-dim)", border: "none", padding: "8px", fontWeight: 600, fontSize: 13, cursor: "pointer" }}>
                Annuler
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function VuePersonnelDetail({ fiches, date, precedents }) {
  const lignes = useMemo(() => fiches.map((f) => {
    const perso = f.data.personnel;
    const precedent = precedents?.[f.slug];
    const postes = {};
    POSTES.forEach((p) => {
      const qte = Number(perso?.postes?.[p.key]?.qte) || 0;
      const commentaire = perso?.postes?.[p.key]?.commentaire || "";
      const qtePrec = precedent ? (Number(precedent.postes?.[p.key]?.qte) || 0) : null;
      postes[p.key] = { qte, commentaire, delta: qtePrec === null ? null : qte - qtePrec };
    });
    return { nom: f.nom, chantier: f.data.chantier, notes: perso?.notes, postes };
  }), [fiches, precedents]);

  const totaux = useMemo(() => {
    const t = {}; POSTES.forEach((p) => { t[p.key] = 0; });
    lignes.forEach((l) => { POSTES.forEach((p) => { t[p.key] += l.postes[p.key].qte; }); });
    return t;
  }, [lignes]);

  const hasTotaux = POSTES.some((p) => totaux[p.key] > 0);
  const thStyle = { textAlign: "left", padding: "9px 12px", fontWeight: 600, fontSize: 11.5, textTransform: "uppercase", letterSpacing: "0.03em", color: "var(--odj-texte2)", whiteSpace: "nowrap" };

  const cellule = (qte, comm, delta) => {
    if (qte === 0 && !comm) return "—";
    return (
      <div style={{ display: "flex", flexDirection: "column", gap: 2, alignItems: "center" }}>
        <div>
          <b>{qte}</b>
          {delta !== null && delta !== 0 && (
            <span style={{ color: delta > 0 ? TONE_HEX.blue : TONE_HEX.orange, fontWeight: 700, marginLeft: 4, fontSize: 12 }}>
              ({delta > 0 ? "+" : ""}{delta})
            </span>
          )}
        </div>
        {comm && <div style={{ fontSize: 11, color: "var(--odj-dim)" }}>{comm}</div>}
      </div>
    );
  };

  return (
    <div>
      <div style={{ display: "flex", gap: 10, flexWrap: "wrap", marginBottom: 20 }}>
        {POSTES.filter((p) => totaux[p.key] > 0).map((p) => <StatCard key={p.key} label={`Total — ${p.label}`} value={totaux[p.key]} tone={TONE_HEX.blue} />)}
        {!hasTotaux && <StatCard label="Main d'oeuvre demandée" value="—" tone={TONE_HEX.blue} />}
      </div>
      <div style={{ fontSize: 12, color: "var(--odj-dim)", marginBottom: 12 }}>
        Les chiffres entre parenthèses indiquent la différence avec la dernière requête soumise par cette personne.
      </div>
      {lignes.length === 0 ? (
        <div style={{ padding: 40, textAlign: "center", color: "var(--odj-dim)", border: "1px dashed var(--odj-line)", background: "var(--odj-panel)" }}>
          Aucune fiche soumise pour cette date pour l'instant.
        </div>
      ) : (
        <div style={{ background: "var(--odj-panel)", border: "1px solid var(--odj-line)", overflowX: "auto" }}>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13.5 }}>
            <thead>
              <tr style={{ background: "var(--odj-panelAlt)", borderBottom: "1px solid var(--odj-line)" }}>
                <th style={thStyle}>Contremaître</th>
                <th style={thStyle}>Chantier</th>
                {POSTES.map((p) => <th key={p.key} style={{ ...thStyle, textAlign: "center" }}>{p.label}</th>)}
                <th style={thStyle}>Notes</th>
              </tr>
            </thead>
            <tbody>
              {lignes.map((l, i) => (
                <tr key={l.nom} style={{ borderBottom: i < lignes.length - 1 ? "1px solid var(--odj-lineFaible)" : "none" }}>
                  <td style={{ padding: "9px 12px", fontWeight: 600, whiteSpace: "nowrap" }}>{l.nom}</td>
                  <td style={{ padding: "9px 12px", color: "var(--odj-dim)" }}>{l.chantier || "—"}</td>
                  {POSTES.map((p) => (
                    <td key={p.key} style={{ padding: "9px 12px", textAlign: "center", fontFamily: "'IBM Plex Mono', ui-monospace, 'SF Mono', Menlo, monospace" }}>
                      {cellule(l.postes[p.key].qte, l.postes[p.key].commentaire, l.postes[p.key].delta)}
                    </td>
                  ))}
                  <td style={{ padding: "9px 12px", color: "var(--odj-texte2)", maxWidth: 200 }}>{l.notes || "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

function VueCamionsDetail({ fiches }) {
  const lignes = fiches
    .map((f) => ({ nom: f.nom, chantier: f.data.chantier, camions: f.data.camions || { douze: 0, deux: 0, trois: 0, notes: "" } }))
    .filter((l) => (Number(l.camions.douze) || 0) + (Number(l.camions.deux) || 0) + (Number(l.camions.trois) || 0) > 0)
    .sort((a, b) => a.nom.localeCompare(b.nom));

  const totaux = useMemo(() => {
    const t = { douze: 0, deux: 0, trois: 0 };
    fiches.forEach((f) => {
      t.douze += Number(f.data.camions?.douze) || 0;
      t.deux += Number(f.data.camions?.deux) || 0;
      t.trois += Number(f.data.camions?.trois) || 0;
    });
    return t;
  }, [fiches]);

  const thLeft = { textAlign: "left", padding: "9px 12px", fontWeight: 600, fontSize: 11.5, textTransform: "uppercase", letterSpacing: "0.03em", color: "var(--odj-texte2)", whiteSpace: "nowrap" };
  const thCenter = { ...thLeft, textAlign: "center" };

  return (
    <div>
      <div style={{ display: "flex", gap: 10, flexWrap: "wrap", marginBottom: 20 }}>
        <StatCard label="Total 12 roues" value={totaux.douze} tone="var(--odj-accent)" />
        <StatCard label="Total 2 essieux" value={totaux.deux} tone="var(--odj-accent)" />
        <StatCard label="Total 3 essieux" value={totaux.trois} tone="var(--odj-accent)" />
        <StatCard label="Total camions" value={totaux.douze + totaux.deux + totaux.trois} tone="var(--odj-ambre)" />
      </div>
      {lignes.length === 0 ? (
        <div style={{ padding: 40, textAlign: "center", color: "var(--odj-dim)", border: "1px dashed var(--odj-line)", background: "var(--odj-panel)" }}>
          Aucun camion demandé pour cette date pour l'instant.
        </div>
      ) : (
        <div style={{ background: "var(--odj-panel)", border: "1px solid var(--odj-line)", overflowX: "auto" }}>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13.5 }}>
            <thead>
              <tr style={{ background: "var(--odj-panelAlt)", borderBottom: "1px solid var(--odj-line)" }}>
                <th style={thLeft}>Contremaître</th>
                <th style={thLeft}>Chantier</th>
                <th style={thCenter}>12 roues</th>
                <th style={thCenter}>2 essieux</th>
                <th style={thCenter}>3 essieux</th>
                <th style={thCenter}>Total</th>
                <th style={thLeft}>Commentaires / lieu de chargement</th>
              </tr>
            </thead>
            <tbody>
              {lignes.map((l, i) => {
                const d = Number(l.camions.douze) || 0, e2 = Number(l.camions.deux) || 0, e3 = Number(l.camions.trois) || 0;
                const drapeaux = (k) => [
                  l.camions[`${k}Plein`] && "Plein",
                  l.camions[`${k}Vide`] && "Vide",
                  l.camions[`${k}Toile`] && "Toile",
                ].filter(Boolean).join(" · ");
                return (
                  <tr key={l.nom} style={{ borderBottom: i < lignes.length - 1 ? "1px solid var(--odj-lineFaible)" : "none" }}>
                    <td style={{ padding: "9px 12px", fontWeight: 600, whiteSpace: "nowrap" }}>{l.nom}</td>
                    <td style={{ padding: "9px 12px", color: "var(--odj-dim)" }}>{l.chantier || "—"}</td>
                    <td style={{ padding: "9px 12px", textAlign: "center", fontFamily: "'IBM Plex Mono', ui-monospace, 'SF Mono', Menlo, monospace" }}>
                      {d > 0 ? <b>{d}</b> : "—"}
                      {drapeaux("douze") && <div style={{ fontSize: 10, color: "var(--odj-dim)" }}>{drapeaux("douze")}</div>}
                    </td>
                    <td style={{ padding: "9px 12px", textAlign: "center", fontFamily: "'IBM Plex Mono', ui-monospace, 'SF Mono', Menlo, monospace" }}>
                      {e2 > 0 ? <b>{e2}</b> : "—"}
                      {drapeaux("deux") && <div style={{ fontSize: 10, color: "var(--odj-dim)" }}>{drapeaux("deux")}</div>}
                    </td>
                    <td style={{ padding: "9px 12px", textAlign: "center", fontFamily: "'IBM Plex Mono', ui-monospace, 'SF Mono', Menlo, monospace" }}>
                      {e3 > 0 ? <b>{e3}</b> : "—"}
                      {drapeaux("trois") && <div style={{ fontSize: 10, color: "var(--odj-dim)" }}>{drapeaux("trois")}</div>}
                    </td>
                    <td style={{ padding: "9px 12px", textAlign: "center", fontFamily: "'IBM Plex Mono', ui-monospace, 'SF Mono', Menlo, monospace", fontWeight: 700 }}>{d + e2 + e3}</td>
                    <td style={{ padding: "9px 12px", color: "var(--odj-texte2)", maxWidth: 260 }}>{l.camions.notes || "—"}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

function VueMachinerieDetail({ fiches }) {
  // Une ligne par contremaître avec les deux mémoires (ajout + retrait)
  const lignes = useMemo(() => fiches.map((f) => {
    const mach = f.data.machinerie;
    const statut = mach?.statut;
    const lireEquip = (source) => {
      const eq = {}; const ac = {};
      EQUIPEMENTS.forEach((e) => { const v = source?.equipements?.[e.key]; eq[e.key] = { qte: Number(v?.qte) || 0, commentaire: v?.commentaire || "" }; });
      ACCESSOIRES.forEach((a) => { const v = source?.accessoires?.[a.key]; ac[a.key] = { qte: Number(v?.qte) || 0, commentaire: v?.commentaire || "" }; });
      return { equipements: eq, accessoires: ac };
    };
    const hasQte = (data) => EQUIPEMENTS.some((e) => data.equipements[e.key].qte > 0) || ACCESSOIRES.some((a) => data.accessoires[a.key].qte > 0);
    const dataAjout   = lireEquip(mach?._ajout);
    const dataRetrait = lireEquip(mach?._retrait);
    const dataCourant = lireEquip(mach);
    const ajout   = hasQte(dataAjout)   ? dataAjout   : (statut === "ajouter"  ? dataCourant : lireEquip({}));
    const retrait = hasQte(dataRetrait) ? dataRetrait : (statut === "retirer"  ? dataCourant : lireEquip({}));
    const hasAjout   = hasQte(ajout);
    const hasRetrait = hasQte(retrait);
    return { nom: f.nom, chantier: f.data.chantier, statut, notes: mach?.notes, ajout, retrait, hasAjout, hasRetrait };
  }), [fiches]);

  const totauxAjout = useMemo(() => {
    const t = {}; EQUIPEMENTS.forEach((e) => { t[e.key] = 0; }); ACCESSOIRES.forEach((a) => { t[a.key] = 0; });
    lignes.forEach((l) => { EQUIPEMENTS.forEach((e) => { t[e.key] += l.ajout.equipements[e.key].qte; }); ACCESSOIRES.forEach((a) => { t[a.key] += l.ajout.accessoires[a.key].qte; }); });
    return t;
  }, [lignes]);

  const totauxRetrait = useMemo(() => {
    const t = {}; EQUIPEMENTS.forEach((e) => { t[e.key] = 0; }); ACCESSOIRES.forEach((a) => { t[a.key] = 0; });
    lignes.forEach((l) => { EQUIPEMENTS.forEach((e) => { t[e.key] += l.retrait.equipements[e.key].qte; }); ACCESSOIRES.forEach((a) => { t[a.key] += l.retrait.accessoires[a.key].qte; }); });
    return t;
  }, [lignes]);

  const colEquip  = EQUIPEMENTS.filter((e) => lignes.some((l) => l.ajout.equipements[e.key].qte > 0 || l.retrait.equipements[e.key].qte > 0));
  const colAccess = ACCESSOIRES.filter((a) => lignes.some((l) => l.ajout.accessoires[a.key].qte > 0 || l.retrait.accessoires[a.key].qte > 0));
  const thStyle = { textAlign: "left", padding: "9px 12px", fontWeight: 600, fontSize: 11.5, textTransform: "uppercase", letterSpacing: "0.03em", color: "var(--odj-texte2)", whiteSpace: "nowrap" };
  const hasAjouts  = EQUIPEMENTS.some((e) => totauxAjout[e.key] > 0)  || ACCESSOIRES.some((a) => totauxAjout[a.key] > 0);
  const hasRetraits = EQUIPEMENTS.some((e) => totauxRetrait[e.key] > 0) || ACCESSOIRES.some((a) => totauxRetrait[a.key] > 0);

  // Affiche +qteAjout en vert et -qteRetrait en rouge dans la même cellule
  const cellule = (qteA, commA, qteR, commR, isAccess = false) => {
    if (qteA === 0 && qteR === 0) return "—";
    return (
      <div style={{ display: "flex", flexDirection: "column", gap: 2, alignItems: "center" }}>
        {qteA > 0 && <div><b style={{ color: isAccess ? "var(--odj-violet)" : TONE_HEX.green }}>+{qteA}</b>{commA && <div style={{ fontSize: 11, color: "var(--odj-dim)" }}>{commA}</div>}</div>}
        {qteR > 0 && <div><b style={{ color: TONE_HEX.red }}>-{qteR}</b>{commR && <div style={{ fontSize: 11, color: "var(--odj-dim)" }}>{commR}</div>}</div>}
      </div>
    );
  };

  return (
    <div>
      <div style={{ display: "flex", gap: 10, flexWrap: "wrap", marginBottom: 24 }}>
        {EQUIPEMENTS.filter((e) => totauxAjout[e.key] > 0).map((e) => <StatCard key={`a-${e.key}`} label={`Ajout — ${e.label}`} value={totauxAjout[e.key]} tone={TONE_HEX.green} />)}
        {ACCESSOIRES.filter((a) => totauxAjout[a.key] > 0).map((a) => <StatCard key={`a-${a.key}`} label={`Ajout — ${a.label}`} value={totauxAjout[a.key]} tone="var(--odj-violet)" />)}
        {!hasAjouts && <StatCard label="Ajouts" value="—" tone={TONE_HEX.green} />}
        {(hasAjouts || hasRetraits) && <div style={{ width: 1, background: "var(--odj-line)", alignSelf: "stretch", margin: "0 4px" }} />}
        {EQUIPEMENTS.filter((e) => totauxRetrait[e.key] > 0).map((e) => <StatCard key={`r-${e.key}`} label={`Retrait — ${e.label}`} value={totauxRetrait[e.key]} tone={TONE_HEX.red} />)}
        {ACCESSOIRES.filter((a) => totauxRetrait[a.key] > 0).map((a) => <StatCard key={`r-${a.key}`} label={`Retrait — ${a.label}`} value={totauxRetrait[a.key]} tone={TONE_HEX.red} />)}
        {!hasRetraits && <StatCard label="Retraits" value="—" tone={TONE_HEX.red} />}
      </div>
      {lignes.length === 0 ? (
        <div style={{ padding: 40, textAlign: "center", color: "var(--odj-dim)", border: "1px dashed var(--odj-line)", background: "var(--odj-panel)" }}>Aucune fiche soumise pour cette date pour l'instant.</div>
      ) : (
        <div style={{ background: "var(--odj-panel)", border: "1px solid var(--odj-line)", overflowX: "auto" }}>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13.5 }}>
            <thead>
              <tr style={{ background: "var(--odj-panelAlt)", borderBottom: "1px solid var(--odj-line)" }}>
                <th style={thStyle}>Contremaître</th>
                <th style={thStyle}>Chantier</th>
                <th style={thStyle}>Statut</th>
                {colEquip.map((e) => <th key={e.key} style={{ ...thStyle, textAlign: "center" }}>{e.label}</th>)}
                {colAccess.map((a) => <th key={a.key} style={{ ...thStyle, textAlign: "center", color: "var(--odj-violet)" }}>{a.label}</th>)}
                <th style={thStyle}>Notes</th>
              </tr>
            </thead>
            <tbody>
              {lignes.map((l, i) => (
                <tr key={l.nom} style={{ borderBottom: i < lignes.length - 1 ? "1px solid var(--odj-lineFaible)" : "none" }}>
                  <td style={{ padding: "9px 12px", fontWeight: 600, whiteSpace: "nowrap" }}>{l.nom}</td>
                  <td style={{ padding: "9px 12px", color: "var(--odj-dim)" }}>{l.chantier || "—"}</td>
                  <td style={{ padding: "9px 12px" }}>
                    <div style={{ display: "flex", gap: 4, flexWrap: "wrap" }}>
                      {l.hasAjout && <Plate tone={STATUTS.machinerie.find((s) => s.value === "ajouter")?.tone} size="sm">Ajouter</Plate>}
                      {l.hasRetrait && <Plate tone={STATUTS.machinerie.find((s) => s.value === "retirer")?.tone} size="sm">Retirer</Plate>}
                      {!l.hasAjout && !l.hasRetrait && <Plate tone={STATUTS.machinerie.find((s) => s.value === "meme")?.tone} size="sm">Aucun changement</Plate>}
                    </div>
                  </td>
                  {colEquip.map((e) => (
                    <td key={e.key} style={{ padding: "9px 12px", textAlign: "center", fontFamily: "'IBM Plex Mono', ui-monospace, 'SF Mono', Menlo, monospace" }}>
                      {cellule(l.ajout.equipements[e.key].qte, l.ajout.equipements[e.key].commentaire, l.retrait.equipements[e.key].qte, l.retrait.equipements[e.key].commentaire)}
                    </td>
                  ))}
                  {colAccess.map((a) => (
                    <td key={a.key} style={{ padding: "9px 12px", textAlign: "center", fontFamily: "'IBM Plex Mono', ui-monospace, 'SF Mono', Menlo, monospace" }}>
                      {cellule(l.ajout.accessoires[a.key].qte, l.ajout.accessoires[a.key].commentaire, l.retrait.accessoires[a.key].qte, l.retrait.accessoires[a.key].commentaire, true)}
                    </td>
                  ))}
                  <td style={{ padding: "9px 12px", color: "var(--odj-texte2)", maxWidth: 200 }}>{l.notes || "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

/* ---------------------------------------------------------------------
   VUE DIESEL (FUEL) — récapitulatif indépendant, onglet dédié
--------------------------------------------------------------------- */
function VueDieselDetail({ fiches }) {
  const lignes = useMemo(() => fiches
    .map((f) => ({
      nom: f.nom,
      chantier: f.data.chantier,
      requis: f.data.diesel?.requis,
      grosses: Number(f.data.diesel?.grosses) || 0,
      petites: Number(f.data.diesel?.petites) || 0,
      commentaire: f.data.diesel?.commentaire,
    }))
    .filter((l) => l.requis)
    .sort((a, b) => a.nom.localeCompare(b.nom)), [fiches]);

  const nbChantiersRequis = lignes.filter((l) => l.requis === "oui").length;
  const totalMachines = lignes.filter((l) => l.requis === "oui").reduce((s, l) => s + l.grosses + l.petites, 0);
  const thStyle = { textAlign: "left", padding: "9px 12px", fontWeight: 600, fontSize: 11.5, textTransform: "uppercase", letterSpacing: "0.03em", color: "var(--odj-texte2)", whiteSpace: "nowrap" };

  return (
    <div>
      <div style={{ display: "flex", gap: 10, flexWrap: "wrap", marginBottom: 20 }}>
        <StatCard label="Chantier avec diesel requis" value={nbChantiersRequis} tone="var(--odj-ambre)" />
        <StatCard label="Machines à remplir (total)" value={totalMachines} tone="var(--odj-dim)" />
      </div>
      {lignes.length === 0 ? (
        <div style={{ padding: 40, textAlign: "center", color: "var(--odj-dim)", border: "1px dashed var(--odj-line)", background: "var(--odj-panel)" }}>
          Personne n'a précisé de besoin en diesel pour cette date pour l'instant.
        </div>
      ) : (
        <div style={{ background: "var(--odj-panel)", border: "1px solid var(--odj-line)", overflowX: "auto" }}>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13.5 }}>
            <thead>
              <tr style={{ background: "var(--odj-panelAlt)", borderBottom: "1px solid var(--odj-line)" }}>
                <th style={thStyle}>Contremaître</th>
                <th style={thStyle}>Chantier</th>
                <th style={{ ...thStyle, textAlign: "center" }}>Grosses machines</th>
                <th style={{ ...thStyle, textAlign: "center" }}>Petites machines</th>
                <th style={thStyle}>Commentaires</th>
              </tr>
            </thead>
            <tbody>
              {lignes.map((l, i) => (
                <tr key={l.nom} style={{ borderBottom: i < lignes.length - 1 ? "1px solid var(--odj-lineFaible)" : "none" }}>
                  <td style={{ padding: "9px 12px", fontWeight: 600, whiteSpace: "nowrap" }}>{l.nom}</td>
                  <td style={{ padding: "9px 12px", color: "var(--odj-dim)" }}>{l.chantier || "—"}</td>
                  <td style={{ padding: "9px 12px", textAlign: "center", fontFamily: "'IBM Plex Mono', ui-monospace, 'SF Mono', Menlo, monospace" }}>{l.requis === "oui" ? l.grosses : "—"}</td>
                  <td style={{ padding: "9px 12px", textAlign: "center", fontFamily: "'IBM Plex Mono', ui-monospace, 'SF Mono', Menlo, monospace" }}>{l.requis === "oui" ? l.petites : "—"}</td>
                  <td style={{ padding: "9px 12px", color: "var(--odj-texte2)", maxWidth: 260 }}>
                    {l.requis === "oui" ? (l.commentaire || "Oui") : "Non"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

function Dashboard({ date, profil, boutonRequete, onOuvrirDate, scrollCible, onScrollFait, resetSignal }) {
  const [fiches, setFiches] = useState([]);
  const [precedents, setPrecedents] = useState({}); // slug -> { postes, date } | null — pour comparer vs la dernière requête
  const [loading, setLoading] = useState(true);
  const [vueSpeciale, setVueSpeciale] = useState(null); // toujours Vue générale à l'ouverture

  useEffect(() => {
    if (scrollCible) setVueSpeciale(null);
  }, [scrollCible]);

  useEffect(() => {
    if (resetSignal) setVueSpeciale(null);
  }, [resetSignal]);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const listRes = await storage.list(`fiche:${date}:`, true);
      const keys = listRes?.keys || [];
      const results = [];
      for (const k of keys) {
        try {
          const r = await storage.get(k, true);
          if (r) {
            const parsed = JSON.parse(r.value);
            const data = {
              ...emptyFiche(),
              ...parsed,
              personnel: { ...emptyFiche().personnel, ...(parsed.personnel || {}), postes: { ...emptyLignes(POSTES), ...((parsed.personnel || {}).postes || {}) } },
              machinerie: { ...emptyFiche().machinerie, ...(parsed.machinerie || {}), equipements: { ...emptyLignes(EQUIPEMENTS), ...((parsed.machinerie || {}).equipements || {}) }, accessoires: { ...emptyLignes(ACCESSOIRES), ...((parsed.machinerie || {}).accessoires || {}) }, _ajout: { equipements: { ...emptyLignes(EQUIPEMENTS), ...((parsed.machinerie || {})._ajout?.equipements || {}) }, accessoires: { ...emptyLignes(ACCESSOIRES), ...((parsed.machinerie || {})._ajout?.accessoires || {}) } }, _retrait: { equipements: { ...emptyLignes(EQUIPEMENTS), ...((parsed.machinerie || {})._retrait?.equipements || {}) }, accessoires: { ...emptyLignes(ACCESSOIRES), ...((parsed.machinerie || {})._retrait?.accessoires || {}) } } },
            };
            const nomSlug = k.replace(`fiche:${date}:`, "").replace(/::\d+$/, "");
            const seq = parseSeqSuffix(k);
            const nomAffiche = seq > 1 ? `${nomDepuisUserId(nomSlug)} (${seq}e demande)` : nomDepuisUserId(nomSlug);
            results.push({ nom: nomAffiche, data, key: k, seq, slug: nomSlug, date });
          }
        } catch (e) { /* entrée corrompue ignorée */ }
      }
      results.sort((a, b) => a.nom.localeCompare(b.nom));
      setFiches(results);
      // Comparaison "vs dernière requête" pour la main d'oeuvre — une recherche par personne unique
      const slugsUniques = [...new Set(results.map((r) => r.slug))];
      const precMap = {};
      await Promise.all(slugsUniques.map(async (slug) => {
        precMap[slug] = await trouverPostesPrecedents(date, slug);
      }));
      setPrecedents(precMap);
    } catch (e) {
      setFiches([]);
      setPrecedents({});
    } finally {
      setLoading(false);
    }
  }, [date]);

  useEffect(() => { load(); }, [load]);

  // Défile jusqu'à la carte visée après un clic sur une notification
  useEffect(() => {
    if (!scrollCible || loading || vueSpeciale) return;
    const cible = fiches.find((f) => f.slug === scrollCible.slug && f.seq === (scrollCible.seq || 1));
    if (cible) {
      const el = document.getElementById(`fiche-card-${cible.key}`);
      if (el) {
        el.scrollIntoView({ behavior: "smooth", block: "center" });
        el.style.transition = "box-shadow 0.3s";
        el.style.boxShadow = "0 0 0 3px #E4022E";
        setTimeout(() => { el.style.boxShadow = ""; }, 2000);
      }
    }
    onScrollFait && onScrollFait();
  }, [scrollCible, loading, vueSpeciale, fiches, onScrollFait]);

  const enregistrerCommentaire = async (f, texte) => {
    try {
      const r = await storage.get(f.key, true);
      const donnees = r ? JSON.parse(r.value) : { ...f.data };
      const commentairesActuels = Array.isArray(donnees.commentaires) ? donnees.commentaires : [];
      donnees.commentaires = [
        ...commentairesActuels,
        { auteur: profil.nom, texte, horodatage: new Date().toISOString() },
      ];
      await storage.set(f.key, JSON.stringify(donnees), true);
      await load();

      const nomPropre = nomDepuisUserId(f.slug);
      const dateTexte = new Date(f.date + "T12:00:00").toLocaleDateString("fr-CA", { day: "numeric", month: "long", year: "numeric" });
      const titreOriginal = `Ordre du jour - ${dateTexte} - ${nomPropre}`;
      // Notification par courriel (secondaire — n'empêche jamais l'enregistrement du commentaire)
      try {
        await fetch("/api/ordre-du-jour/send-notification/", {
          method: "POST",
          headers: await entetesAuth(),
          body: JSON.stringify({
            nom: nomPropre,
            date: f.date,
            chantier: donnees.chantier,
            commentateur: profil.nom,
            commentaire: texte,
          }),
        });
      } catch (eNotif) { /* notification secondaire — on ignore l'échec */ }
      // Notification push (secondaire)
      try {
        await fetch("/api/ordre-du-jour/send-push/", {
          method: "POST",
          headers: await entetesAuth(),
          body: JSON.stringify({
            title: `IMPORTANT - ${profil.nom} - ${titreOriginal}`,
            body: texte,
          }),
        });
      } catch (ePush) { /* notification secondaire — on ignore l'échec */ }
      // Notification dans le centre de notifications de l'app (secondaire)
      try {
        await notifierCommentaire(profil, f.slug, { date: f.date, slug: f.slug, seq: f.seq }, `Commentaire de ${profil.nom}`, texte);
      } catch (eCentre) { /* notification secondaire — on ignore l'échec */ }
    } catch (e) {
      // silencieux — la fenêtre reste ouverte pour réessayer si besoin
      throw e;
    }
  };

  const totaux = useMemo(() => {
    const t = { douze: 0, deux: 0, trois: 0, mainOeuvre: 0, camions: 0, machinerie: 0, diesel: 0 };
    fiches.forEach((f) => {
      t.douze += Number(f.data.camions.douze) || 0;
      t.deux += Number(f.data.camions.deux) || 0;
      t.trois += Number(f.data.camions.trois) || 0;

      const hasPerso = POSTES.some((p) => (Number(f.data.personnel.postes[p.key]?.qte) || 0) > 0);
      if (hasPerso) t.mainOeuvre++;

      const hasCamions = (Number(f.data.camions.douze) || 0) + (Number(f.data.camions.deux) || 0) + (Number(f.data.camions.trois) || 0) > 0;
      if (hasCamions) t.camions++;

      const mach = f.data.machinerie || {};
      const hasMachAjout = EQUIPEMENTS.some((e) => (Number(mach._ajout?.equipements?.[e.key]?.qte) || 0) > 0) || ACCESSOIRES.some((a) => (Number(mach._ajout?.accessoires?.[a.key]?.qte) || 0) > 0);
      const hasMachRetrait = EQUIPEMENTS.some((e) => (Number(mach._retrait?.equipements?.[e.key]?.qte) || 0) > 0) || ACCESSOIRES.some((a) => (Number(mach._retrait?.accessoires?.[a.key]?.qte) || 0) > 0);
      if (hasMachAjout || hasMachRetrait) t.machinerie++;

      if (f.data.diesel?.requis === "oui") t.diesel++;
    });
    return t;
  }, [fiches]);

  const { isPhone, isTablet } = useDevice();

  return (
    <div style={{ maxWidth: 900, margin: "0 auto", padding: isPhone ? "12px 10px 60px" : "20px 16px 60px" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", flexWrap: "wrap", gap: 8, marginBottom: 16 }}>
        <div>
          <div style={{ fontSize: isPhone ? 16 : 20, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.03em" }}>Ordre du jour — Planification journalière</div>
          <div style={{ color: "var(--odj-dim)", fontSize: 13 }}>{labelDate(date)} · {fiches.length} fiche{fiches.length !== 1 ? "s" : ""} soumise{fiches.length !== 1 ? "s" : ""}</div>
        </div>
        <div style={{ display: "flex", gap: 8, width: isPhone ? "100%" : "auto", justifyContent: isPhone ? "space-between" : "flex-start" }}>
          <button onClick={load} style={{ background: "transparent", border: "1px solid var(--odj-line)", padding: "8px 12px", cursor: "pointer", display: "flex", alignItems: "center", gap: 6, fontSize: 13 }}>
            <RefreshCw size={14} /> Actualiser
          </button>
          {boutonRequete && (
            <button onClick={() => boutonRequete()} style={{ padding: "8px 14px", fontSize: 13, fontWeight: 600, border: "1.5px solid var(--odj-rouge)", background: "var(--odj-rouge)", color: "#fff", cursor: "pointer" }}>
              + Nouvelle requête
            </button>
          )}
        </div>
      </div>

      {profil?.accesSpecial && (
        <div style={isPhone
          ? { display: "grid", gridTemplateColumns: "repeat(3,1fr)", gap: 6, marginBottom: 18 }
          : { display: "flex", gap: 6, marginBottom: 18, flexWrap: "wrap" }
        }>
          <button
            onClick={() => setVueSpeciale(null)}
            style={{ padding: isPhone ? "8px 4px" : "8px 14px", fontSize: isPhone ? 12 : 13, fontWeight: 600, border: `1.5px solid ${!vueSpeciale ? "var(--odj-accent)" : "var(--odj-line)"}`, background: !vueSpeciale ? "var(--odj-accent)" : "var(--odj-panel)", color: !vueSpeciale ? "#fff" : "var(--odj-texte)", cursor: "pointer", textAlign: "center" }}
          >
            Vue générale
          </button>
          {(profil.accesSpecial === "personnel" || profil.accesSpecial === "tout") && (
            <button onClick={() => setVueSpeciale("personnel")} style={{ padding: isPhone ? "8px 4px" : "8px 14px", fontSize: isPhone ? 12 : 13, fontWeight: 600, border: `1.5px solid ${vueSpeciale === "personnel" ? "var(--odj-accent)" : "var(--odj-line)"}`, background: vueSpeciale === "personnel" ? "var(--odj-accent)" : "var(--odj-panel)", color: vueSpeciale === "personnel" ? "#fff" : "var(--odj-texte)", cursor: "pointer", textAlign: "center" }}>
              Main d'oeuvre
            </button>
          )}
          {(profil.accesSpecial === "camions" || profil.accesSpecial === "tout") && (
            <button onClick={() => setVueSpeciale("camions")} style={{ padding: isPhone ? "8px 4px" : "8px 14px", fontSize: isPhone ? 12 : 13, fontWeight: 600, border: `1.5px solid ${vueSpeciale === "camions" ? "var(--odj-accent)" : "var(--odj-line)"}`, background: vueSpeciale === "camions" ? "var(--odj-accent)" : "var(--odj-panel)", color: vueSpeciale === "camions" ? "#fff" : "var(--odj-texte)", cursor: "pointer", textAlign: "center" }}>
              Camions
            </button>
          )}
          {(profil.accesSpecial === "machinerie" || profil.accesSpecial === "tout") && (
            <button onClick={() => setVueSpeciale("machinerie")} style={{ padding: isPhone ? "8px 4px" : "8px 14px", fontSize: isPhone ? 12 : 13, fontWeight: 600, border: `1.5px solid ${vueSpeciale === "machinerie" ? "var(--odj-accent)" : "var(--odj-line)"}`, background: vueSpeciale === "machinerie" ? "var(--odj-accent)" : "var(--odj-panel)", color: vueSpeciale === "machinerie" ? "#fff" : "var(--odj-texte)", cursor: "pointer", textAlign: "center" }}>
              Machinerie
            </button>
          )}
          {(profil.accesSpecial === "machinerie" || profil.accesSpecial === "tout") && (
            <button onClick={() => setVueSpeciale("diesel")} style={{ padding: isPhone ? "8px 4px" : "8px 14px", fontSize: isPhone ? 12 : 13, fontWeight: 600, border: `1.5px solid ${vueSpeciale === "diesel" ? "var(--odj-accent)" : "var(--odj-line)"}`, background: vueSpeciale === "diesel" ? "var(--odj-accent)" : "var(--odj-panel)", color: vueSpeciale === "diesel" ? "#fff" : "var(--odj-texte)", cursor: "pointer", textAlign: "center" }}>
              Diesel (Fuel)
            </button>
          )}
          {boutonRequete && (
            <button onClick={() => setVueSpeciale("mesrequetes")} style={{ padding: isPhone ? "8px 4px" : "8px 14px", fontSize: isPhone ? 12 : 13, fontWeight: 600, border: `1.5px solid ${vueSpeciale === "mesrequetes" ? "var(--odj-accent)" : "var(--odj-line)"}`, background: vueSpeciale === "mesrequetes" ? "var(--odj-accent)" : "var(--odj-panel)", color: vueSpeciale === "mesrequetes" ? "#fff" : "var(--odj-texte)", cursor: "pointer", textAlign: "center" }}>
              Mes requêtes
            </button>
          )}
        </div>
      )}

      {vueSpeciale === "mesrequetes" ? (
        <ContremaitreAccueil profil={profil} onNouvelle={boutonRequete} onOuvrirDate={onOuvrirDate} cacherBouton />
      ) : vueSpeciale && profil?.accesSpecial ? (
        loading ? <div style={{ padding: 40, textAlign: "center", color: "var(--odj-dim)" }}>Chargement…</div> :
        vueSpeciale === "personnel" ? <VuePersonnelDetail fiches={fiches} date={date} precedents={precedents} /> :
        vueSpeciale === "camions" ? <VueCamionsDetail fiches={fiches} /> :
        vueSpeciale === "diesel" ? <VueDieselDetail fiches={fiches} /> : <VueMachinerieDetail fiches={fiches} />
      ) : (
        <>
          <div style={{ display: "grid", gridTemplateColumns: isPhone ? "repeat(4,1fr)" : "repeat(auto-fill, minmax(130px,1fr))", gap: 10, marginBottom: 20 }}>
            <StatCard label="Requêtes Main d'oeuvre reçues" value={totaux.mainOeuvre} tone="var(--odj-accent)" compact={isPhone} />
            <StatCard label="Requêtes Camions reçues" value={totaux.camions} tone="var(--odj-accent)" compact={isPhone} />
            <StatCard label="Requêtes Machinerie reçues" value={totaux.machinerie} tone="var(--odj-ok)" compact={isPhone} />
            <StatCard label="Requêtes Diesel (Fuel) reçues" value={totaux.diesel} tone="var(--odj-ambre)" compact={isPhone} />
          </div>

          {loading ? (
            <div style={{ padding: 40, textAlign: "center", color: "var(--odj-dim)" }}>Chargement…</div>
          ) : fiches.length === 0 ? (
            <div style={{ padding: 40, textAlign: "center", color: "var(--odj-dim)", border: "1px dashed var(--odj-line)", background: "var(--odj-panel)" }}>
              Aucune fiche soumise pour cette date pour l'instant.
            </div>
          ) : (
            fiches.map((f) => (
              <div id={`fiche-card-${f.key}`} key={f.key}>
                <FicheCard f={f} precedent={precedents[f.slug]} profil={profil} onCommentaire={enregistrerCommentaire} />
              </div>
            ))
          )}
        </>
      )}
    </div>
  );
}

/* ---------------------------------------------------------------------
   APP
--------------------------------------------------------------------- */
/* ---------------------------------------------------------------------
   INFO GÉNÉRALE — Projets et Contacts
--------------------------------------------------------------------- */
/* ---------------------------------------------------------------------
   NOTIFICATION PUSH — page dédiée (accessible via le menu ☰)
--------------------------------------------------------------------- */
function NotificationsPushPage({ profil, onRetour }) {
  const [etat, setEtat] = useState("verification"); // 'verification' | 'non-supporte' | 'inactif' | 'actif' | 'en-cours'
  const [etatCourriel, setEtatCourriel] = useState("verification"); // 'verification' | 'actif' | 'inactif' | 'en-cours'

  useEffect(() => {
    let annule = false;
    (async () => {
      if (!("serviceWorker" in navigator) || !("PushManager" in window) || !VAPID_PUBLIC_KEY) {
        if (!annule) setEtat("non-supporte");
        return;
      }
      try {
        const reg = await navigator.serviceWorker.register("/sw-ordre-du-jour.js", { scope: "/ordre-du-jour/" });
        const sub = await reg.pushManager.getSubscription();
        if (!annule) setEtat(sub ? "actif" : "inactif");
      } catch (e) {
        if (!annule) setEtat("non-supporte");
      }
    })();
    return () => { annule = true; };
  }, []);

  useEffect(() => {
    let annule = false;
    (async () => {
      try {
        const slug = profil.userId;
        const r = await storage.get(`pref-courriel:${slug}`, true);
        if (!annule) setEtatCourriel(r?.value === "inactif" ? "inactif" : "actif"); // actif par défaut
      } catch (e) {
        if (!annule) setEtatCourriel("actif");
      }
    })();
    return () => { annule = true; };
  }, [profil.nom]);

  const basculerCourriel = async () => {
    if (etatCourriel === "en-cours") return;
    const slug = profil.userId;
    const nouveauEtat = etatCourriel === "actif" ? "inactif" : "actif";
    setEtatCourriel("en-cours");
    try {
      await storage.set(`pref-courriel:${slug}`, nouveauEtat, true);
      setEtatCourriel(nouveauEtat);
    } catch (e) {
      setEtatCourriel(etatCourriel); // revert
    }
  };

  const activer = async () => {
    if (etat === "en-cours" || etat === "non-supporte" || etat === "verification") return;
    setEtat("en-cours");
    const slug = profil.userId;
    try {
      const reg = await navigator.serviceWorker.ready;
      const permission = await Notification.requestPermission();
      if (permission !== "granted") {
        setEtat("inactif");
        return;
      }
      const sub = await reg.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(VAPID_PUBLIC_KEY),
      });
      const hash = await hashEndpoint(sub.endpoint);
      await storage.set(`push:${slug}:${hash}`, JSON.stringify(sub.toJSON()), true);
      setEtat("actif");
    } catch (e) {
      setEtat("inactif");
    }
  };

  const desactiver = async () => {
    if (etat === "en-cours") return;
    setEtat("en-cours");
    const slug = profil.userId;
    try {
      const reg = await navigator.serviceWorker.ready;
      const sub = await reg.pushManager.getSubscription();
      if (sub) {
        const hash = await hashEndpoint(sub.endpoint);
        await sub.unsubscribe();
        await storage.delete(`push:${slug}:${hash}`, true);
      }
      setEtat("inactif");
    } catch (e) {
      setEtat("inactif");
    }
  };

  return (
    <div style={{ background: "var(--odj-bg)", minHeight: "100vh" }}>
      <div style={{ maxWidth: 560, margin: "0 auto", padding: "20px 16px 60px" }}>
        <button onClick={onRetour} style={{ background: "transparent", border: "none", color: "var(--odj-accent)", fontSize: 13, fontWeight: 600, cursor: "pointer", marginBottom: 16, padding: 0 }}>
          ← Retour
        </button>

        <div style={{ background: "var(--odj-panel)", border: "1px solid var(--odj-line)", padding: "32px 24px", textAlign: "center" }}>
          <Bell size={40} color="#0F2138" style={{ marginBottom: 16 }} />
          <div style={{ fontWeight: 700, fontSize: 20, color: "var(--odj-texte)", marginBottom: 8 }}>
            Notification PUSH
          </div>

          {etat === "non-supporte" && (
            <div style={{ fontSize: 14, color: "var(--odj-dim)" }}>
              Les notifications push ne sont pas disponibles sur cet appareil ou ce navigateur.
              {" "}Sur iPhone, assure-toi d'avoir ajouté l'app à l'écran d'accueil.
            </div>
          )}

          {etat === "verification" && (
            <div style={{ fontSize: 14, color: "var(--odj-dim)" }}>Vérification…</div>
          )}

          {etat === "actif" && (
            <>
              <div style={{ fontSize: 14, color: "var(--odj-ok)", marginBottom: 20, fontWeight: 600 }}>
                ✓ Les notifications push sont activées sur cet appareil.
              </div>
              <button
                onClick={desactiver}
                style={{ background: "var(--odj-panel)", color: "var(--odj-err)", border: "1.5px solid var(--odj-err)", padding: "12px 20px", fontWeight: 600, fontSize: 14, letterSpacing: "0.03em", textTransform: "uppercase", cursor: "pointer" }}
              >
                Désactiver
              </button>
            </>
          )}

          {(etat === "inactif" || etat === "en-cours") && (
            <>
              <div style={{ fontSize: 14, color: "var(--odj-texte2)", marginBottom: 20 }}>
                Voulez-vous recevoir des notifications push sur cet appareil pour les nouvelles requêtes et les commentaires?
              </div>
              <button
                onClick={activer}
                disabled={etat === "en-cours"}
                style={{ background: "var(--odj-navy)", color: "#fff", border: "none", padding: "12px 28px", fontWeight: 600, fontSize: 14, letterSpacing: "0.03em", textTransform: "uppercase", cursor: "pointer", opacity: etat === "en-cours" ? 0.6 : 1 }}
              >
                {etat === "en-cours" ? "…" : "Oui"}
              </button>
            </>
          )}
        </div>

        <div style={{ background: "var(--odj-panel)", border: "1px solid var(--odj-line)", padding: "32px 24px", textAlign: "center", marginTop: 16 }}>
          <Mail size={40} color="#0F2138" style={{ marginBottom: 16 }} />
          <div style={{ fontWeight: 700, fontSize: 20, color: "var(--odj-texte)", marginBottom: 8 }}>
            Notification par courriel
          </div>

          {etatCourriel === "verification" && (
            <div style={{ fontSize: 14, color: "var(--odj-dim)" }}>Vérification…</div>
          )}

          {etatCourriel !== "verification" && (
            <>
              <div style={{ fontSize: 14, color: etatCourriel === "actif" ? "var(--odj-ok)" : "var(--odj-texte2)", marginBottom: 20, fontWeight: etatCourriel === "actif" ? 600 : 400 }}>
                {etatCourriel === "actif"
                  ? "✓ Les notifications par courriel sont activées pour toi."
                  : "Les notifications par courriel sont désactivées pour toi."}
              </div>
              <button
                onClick={basculerCourriel}
                disabled={etatCourriel === "en-cours"}
                style={
                  etatCourriel === "actif"
                    ? { background: "var(--odj-panel)", color: "var(--odj-err)", border: "1.5px solid var(--odj-err)", padding: "12px 20px", fontWeight: 600, fontSize: 14, letterSpacing: "0.03em", textTransform: "uppercase", cursor: "pointer", opacity: etatCourriel === "en-cours" ? 0.6 : 1 }
                    : { background: "var(--odj-navy)", color: "#fff", border: "none", padding: "12px 28px", fontWeight: 600, fontSize: 14, letterSpacing: "0.03em", textTransform: "uppercase", cursor: "pointer", opacity: etatCourriel === "en-cours" ? 0.6 : 1 }
                }
              >
                {etatCourriel === "en-cours" ? "…" : etatCourriel === "actif" ? "Désactiver" : "Activer"}
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

function InfoGenerale({ section, onRetour }) {
  const { isPhone } = useDevice();
  const [recherche, setRecherche] = useState("");
  const [contactOuvert, setContactOuvert] = useState(null);

  const projetsFiltres = PROJETS_DONNEES.filter((p) =>
    [p.numero, p.nom, p.adresse, p.charge, p.surintendant].some((v) =>
      v?.toLowerCase().includes(recherche.toLowerCase())
    )
  );

  const thStyle = { textAlign: "left", padding: "9px 12px", fontWeight: 600, fontSize: 11.5, textTransform: "uppercase", letterSpacing: "0.03em", color: "var(--odj-texte2)", whiteSpace: "nowrap", background: "var(--odj-panelAlt)", borderBottom: "1px solid var(--odj-line)" };
  const tdStyle = { padding: "9px 12px", fontSize: 13, color: "var(--odj-texte)", verticalAlign: "top", borderBottom: "1px solid var(--odj-lineFaible)" };

  return (
    <div style={{ background: "var(--odj-bg)", minHeight: "100vh" }}>

      {/* Modal unique — projets ET contacts */}
      {contactOuvert && (
        <div onClick={() => setContactOuvert(null)} style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.45)", zIndex: 9999, display: "flex", alignItems: "flex-end", justifyContent: "center" }}>
          <div onClick={(e) => e.stopPropagation()} style={{ background: "var(--odj-panel)", width: "100%", maxWidth: 480, borderTop: "3px solid var(--odj-accent)", padding: "24px 20px 36px" }}>
            <div style={{ fontWeight: 700, fontSize: 17, color: "var(--odj-accent)", marginBottom: 2 }}>
              {contactOuvert.numero ? `${contactOuvert.numero} — ${contactOuvert.nom}` : contactOuvert.nom}
            </div>
            {contactOuvert.titre && <div style={{ fontSize: 13, color: "var(--odj-dim)", marginBottom: 16 }}>{contactOuvert.titre}</div>}
            {contactOuvert.numero ? (
              <>
                <div style={{ fontSize: 11, color: "var(--odj-dim)", marginBottom: 12 }}>{contactOuvert.adresse}</div>
                <div style={{ display: "grid", gap: 12, marginBottom: 4 }}>
                  <div>
                    <div style={{ fontSize: 11, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.06em", color: "var(--odj-dim)", marginBottom: 2 }}>Chargé de projet</div>
                    <div style={{ fontSize: 15, fontWeight: 600, color: contactOuvert.charge ? "var(--odj-texte)" : "var(--odj-dim)" }}>{contactOuvert.charge || "—"}</div>
                  </div>
                  <div>
                    <div style={{ fontSize: 11, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.06em", color: "var(--odj-dim)", marginBottom: 2 }}>Surintendant</div>
                    <div style={{ fontSize: 15, fontWeight: 600, color: contactOuvert.surintendant ? "var(--odj-texte)" : "var(--odj-dim)" }}>{contactOuvert.surintendant || "—"}</div>
                  </div>
                </div>
              </>
            ) : (
              <div style={{ display: "grid", gap: 12, marginBottom: 4 }}>
                {contactOuvert.cell && contactOuvert.cell !== "N/A" && (
                  <div>
                    <div style={{ fontSize: 11, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.06em", color: "var(--odj-dim)", marginBottom: 2 }}>Cellulaire</div>
                    <a href={`tel:${contactOuvert.cell}`} style={{ fontSize: 16, fontWeight: 600, fontFamily: "'IBM Plex Mono', ui-monospace, 'SF Mono', Menlo, monospace", color: "var(--odj-accent)", textDecoration: "none" }}>{contactOuvert.cell}</a>
                  </div>
                )}
                {contactOuvert.poste && (
                  <div>
                    <div style={{ fontSize: 11, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.06em", color: "var(--odj-dim)", marginBottom: 2 }}>Poste</div>
                    <div style={{ fontSize: 15, fontFamily: "'IBM Plex Mono', ui-monospace, 'SF Mono', Menlo, monospace", color: "var(--odj-texte2)" }}>450-661-5050 p.{contactOuvert.poste}</div>
                  </div>
                )}
                {contactOuvert.courriel && (
                  <div>
                    <div style={{ fontSize: 11, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.06em", color: "var(--odj-dim)", marginBottom: 2 }}>Courriel</div>
                    <a href={`mailto:${contactOuvert.courriel}`} style={{ fontSize: 14, color: "var(--odj-lien)", textDecoration: "none" }}>{contactOuvert.courriel}</a>
                  </div>
                )}
              </div>
            )}
            <button onClick={() => setContactOuvert(null)} style={{ marginTop: 20, width: "100%", background: "var(--odj-navy)", color: "#fff", border: "none", padding: "12px", fontWeight: 600, fontSize: 14, letterSpacing: "0.04em", textTransform: "uppercase", cursor: "pointer" }}>
              Fermer
            </button>
          </div>
        </div>
      )}
      <div style={{ maxWidth: 1100, margin: "0 auto", padding: isPhone ? "12px 12px 60px" : "20px 16px 60px" }}>
        <button onClick={onRetour} style={{ background: "transparent", border: "none", color: "var(--odj-accent)", fontSize: 13, fontWeight: 600, cursor: "pointer", marginBottom: 16, padding: 0 }}>
          ← Retour
        </button>

        {section === "projets" && (
          <>
            <div style={{ marginBottom: 14, display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: 10 }}>
              <div style={{ fontWeight: 700, fontSize: 20, textTransform: "uppercase" }}>Projets en cours</div>
              <input
                placeholder="Rechercher…"
                value={recherche}
                onChange={(e) => setRecherche(e.target.value)}
                style={{ padding: "7px 12px", border: "1px solid var(--odj-line)", fontSize: 13, minWidth: 200, background: "var(--odj-panel)" }}
              />
            </div>


            <div style={{ background: "var(--odj-panel)", border: "1px solid var(--odj-line)", overflowX: isPhone ? "visible" : "auto" }}>
              <table style={{ width: "100%", borderCollapse: "collapse" }}>
                <thead>
                  <tr>
                    <th style={thStyle}>No.</th>
                    <th style={thStyle}>Nom du projet</th>
                    {!isPhone && <th style={thStyle}>Adresse du chantier</th>}
                    {!isPhone && <th style={thStyle}>Chargé de projet</th>}
                    {!isPhone && <th style={thStyle}>Surintendant</th>}
                    {isPhone && <th style={{ ...thStyle, textAlign: "center" }}>Adresse</th>}
                    {isPhone && <th style={{ ...thStyle, textAlign: "center" }}>Contact</th>}
                  </tr>
                </thead>
                <tbody>
                  {projetsFiltres.map((p, i) => (
                    <tr key={p.numero} style={{ background: i % 2 === 0 ? "var(--odj-panel)" : "var(--odj-panelAlt)" }}>
                      <td style={{ ...tdStyle, fontFamily: "'IBM Plex Mono', ui-monospace, 'SF Mono', Menlo, monospace", fontWeight: 600, whiteSpace: "nowrap", color: "var(--odj-accent)" }}>{p.numero}</td>
                      <td style={{ ...tdStyle, fontWeight: 600 }}>{p.nom}</td>
                      {!isPhone && <td style={{ ...tdStyle, color: "var(--odj-texte2)" }}>{p.adresse}</td>}
                      {!isPhone && <td style={{ ...tdStyle, color: p.charge ? "var(--odj-texte)" : "var(--odj-dim)" }}>{p.charge || "—"}</td>}
                      {!isPhone && <td style={{ ...tdStyle, color: p.surintendant ? "var(--odj-texte)" : "var(--odj-dim)" }}>{p.surintendant || "—"}</td>}
                      {isPhone && (
                        <td style={{ ...tdStyle, fontSize: 11, color: "var(--odj-texte2)", maxWidth: 100 }}>{p.adresse}</td>
                      )}
                      {isPhone && (
                        <td style={{ ...tdStyle, textAlign: "center", padding: "6px 8px", verticalAlign: "middle" }}>
                          <button
                            onClick={() => setContactOuvert(p)}
                            style={{ background: "var(--odj-navy)", color: "#fff", border: "none", width: 32, height: 32, fontSize: 15, cursor: "pointer", display: "inline-flex", alignItems: "center", justifyContent: "center" }}
                          >
                            👤
                          </button>
                        </td>
                      )}
                    </tr>
                  ))}
                  {projetsFiltres.length === 0 && (
                    <tr><td colSpan={isPhone ? 4 : 5} style={{ ...tdStyle, textAlign: "center", color: "var(--odj-dim)", padding: 32 }}>Aucun résultat</td></tr>
                  )}
                </tbody>
              </table>
            </div>
            <div style={{ marginTop: 8, fontSize: 12, color: "var(--odj-dim)" }}>{projetsFiltres.length} projet{projetsFiltres.length !== 1 ? "s" : ""}</div>
          </>
        )}

        {section === "contacts" && (
          <>
            <div style={{ marginBottom: 14, display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: 10 }}>
              <div style={{ fontWeight: 700, fontSize: 20, textTransform: "uppercase" }}>Liste contacts</div>
              <input
                placeholder="Rechercher…"
                value={recherche}
                onChange={(e) => setRecherche(e.target.value)}
                style={{ padding: "7px 12px", border: "1px solid var(--odj-line)", fontSize: 13, minWidth: 200, background: "var(--odj-panel)" }}
              />
            </div>

            <div style={{ marginBottom: 16, padding: "10px 14px", background: "var(--odj-avisBg)", border: "1px solid var(--odj-ambre)", borderLeft: "3px solid var(--odj-ambre)", fontSize: 13, color: "var(--odj-avisTexte)" }}>
              📞 Tout numéro indiqué avec un poste est accessible via le numéro principal : <b>450-661-5050</b> + le numéro de poste
            </div>
            {[
              { dept: "Administration", membres: [
                { nom: "Annie Laberge", titre: "Commis aux comptes recevables", courriel: "alaberge@pep2000.com", cell: "438-407-5328", poste: "244" },
                { nom: "Davio Pallotta", titre: "Président", courriel: "dpallotta@pep2000.com", cell: "514-838-9898", poste: "" },
                { nom: "Francis Battista", titre: "Gestionnaire aux opérations administratives et systèmes", courriel: "fbattista@pep2000.com", cell: "514-865-0595", poste: "" },
                { nom: "Isabelle Wagner", titre: "Coordonnatrice aux événements et projets spéciaux", courriel: "iwagner@pep2000.com", cell: "514-660-7830", poste: "233" },
                { nom: "Josée Lefebvre", titre: "Commis de bureau", courriel: "jlefebvre@pep2000.com", cell: "", poste: "102" },
                { nom: "Julie Sgariglia", titre: "Ressources Humaines - Paies", courriel: "jsgariglia@pep2000.com", cell: "", poste: "221" },
                { nom: "Julie St-Jean", titre: "Technicienne comptable", courriel: "jst-jean@pep2000.com", cell: "", poste: "212" },
                { nom: "Marilyn Charlebois", titre: "Commis aux comptes payables", courriel: "payables@pep2000.com", cell: "514-776-7789", poste: "238" },
                { nom: "Mélanie Lelièvre", titre: "Réceptionniste / Commis de bureau", courriel: "mlelievre@pep2000.com", cell: "", poste: "248" },
                { nom: "Nancy Cournoyer", titre: "Directrice des Finances", courriel: "ncournoyer@pep2000.com", cell: "514-707-5671", poste: "229" },
                { nom: "Nathalie Gaetano", titre: "Technicienne comptable", courriel: "ngaetano@pep2000.com", cell: "", poste: "234" },
                { nom: "Sophie Carbonneau", titre: "Facturation", courriel: "scarbonneau@pep2000.com", cell: "514-623-0604", poste: "247" },
              ]},
              { dept: "Excavation", membres: [
                { nom: "William Dubreuil", titre: "Directeur Construction", courriel: "wdubreuil@pep2000.com", cell: "819-755-0176", poste: "" },
                { nom: "Bryan Wong", titre: "Coordonnateur de Projet", courriel: "bwong@pep2000.com", cell: "514-833-3090", poste: "249" },
                { nom: "Giuseppe Pallotta", titre: "Chargé des Coupes de Rue", courriel: "gpallotta@pep2000.com", cell: "514-898-4295", poste: "223" },
                { nom: "Martin Potvin", titre: "Acheteur", courriel: "mpotvin@pep2000.com", cell: "438-524-3769", poste: "237" },
                { nom: "Mathis Lapointe", titre: "Chargé de projets junior", courriel: "mlapointe@pep2000.com", cell: "438-405-5980", poste: "" },
                { nom: "Matteo Carbone", titre: "Chargé de projets", courriel: "mcarbone@pep2000.com", cell: "438-498-5406", poste: "" },
                { nom: "Santiago Sanchez", titre: "Chargé de projets", courriel: "ssanchez@pep2000.com", cell: "514-664-1669", poste: "" },
              ]},
              { dept: "Surintendants", membres: [
                { nom: "François Ouellet", titre: "Surintendant", courriel: "fouellet@pep2000.com", cell: "514-730-0178", poste: "" },
                { nom: "Stephan Nadeau", titre: "Surintendant", courriel: "snadeau@pep2000.com", cell: "514-829-6484", poste: "226" },
                { nom: "Stéphane Lalande", titre: "Surintendant", courriel: "slalande@pep2000.com", cell: "514-829-7276", poste: "228" },
                { nom: "Tony Moschetta", titre: "Surintendant", courriel: "amoschetta@pep2000.com", cell: "514-809-4571", poste: "240" },
              ]},
              { dept: "Contremaîtres — Excavation", membres: [
                { nom: "Biagio Pirro", titre: "Contremaître", courriel: "bpirro@pep2000.com", cell: "514-516-1870", poste: "" },
                { nom: "Brian Labelle", titre: "Contremaître", courriel: "blabelle@pep2000.com", cell: "514-269-7554", poste: "" },
                { nom: "Claude Cyr", titre: "Contremaître", courriel: "ccyr@pep2000.com", cell: "514-567-5589", poste: "" },
                { nom: "Daniel Boudreault", titre: "Contremaître", courriel: "dboudreault@pep2000.com", cell: "514-226-8013", poste: "" },
                { nom: "Dominic Hamel-Leduc", titre: "Contremaître", courriel: "dhamel-leduc@pep2000.com", cell: "450-822-4191", poste: "" },
                { nom: "Francis Jobin", titre: "Contremaître", courriel: "", cell: "514-974-9272", poste: "" },
                { nom: "François Gosselin", titre: "Contremaître", courriel: "fgosselin@pep2000.com", cell: "514-977-0018", poste: "" },
                { nom: "Jérémy Juneau", titre: "Contremaître", courriel: "jjuneau@pep2000.com", cell: "438-494-7068", poste: "" },
                { nom: "Jocelyn Denicolai", titre: "Contremaître", courriel: "jdenicolai@pep2000.com", cell: "514-886-9405", poste: "" },
                { nom: "Jonathan Baulne", titre: "Contremaître", courriel: "jbaulne@pep2000.com", cell: "514-968-9596", poste: "" },
                { nom: "Marco Chiovitti", titre: "Contremaître", courriel: "mchiovitti@pep2000.com", cell: "514-838-2538", poste: "" },
                { nom: "Martin Guillemette", titre: "Contremaître", courriel: "mguillemette@pep2000.com", cell: "514-550-4801", poste: "" },
                { nom: "Michel Coulombe", titre: "Contremaître", courriel: "mcoulombe@pep2000.com", cell: "514-838-1808", poste: "" },
                { nom: "Patrick Courteau", titre: "Contremaître", courriel: "pcourteau@pep2000.com", cell: "514-821-9571", poste: "" },
                { nom: "Patrick Desmeules", titre: "Contremaître", courriel: "pdesmeules@pep2000.com", cell: "438-889-5239", poste: "" },
              ]},
              { dept: "Aménagement Paysager", membres: [
                { nom: "Carl Pallotta", titre: "Coordonnateur de projets Aménagement", courriel: "cpallotta@pep2000.com", cell: "514-232-0046", poste: "" },
                { nom: "John Vannicola", titre: "Chargé de projet Aménagement", courriel: "jvannicola@pep2000.com", cell: "514-838-9987", poste: "254" },
                { nom: "Fredy Mejia", titre: "Contremaître paysagement", courriel: "fmejia@pep2000.com", cell: "514-812-5530", poste: "" },
                { nom: "Leonel Mejia", titre: "Contremaître pavé", courriel: "lmejia@pep2000.com", cell: "514-815-7489", poste: "" },
                { nom: "Peter Napoli", titre: "Contremaître béton", courriel: "pnapoli@pep2000.com", cell: "514-730-1501", poste: "" },
              ]},
              { dept: "Arpentage", membres: [
                { nom: "André Pichette", titre: "Arpenteur en Chef", courriel: "apichette@pep2000.com", cell: "514-827-6085", poste: "228" },
                { nom: "Anthony Pelliccia", titre: "Arpenteur", courriel: "apelliccia@pep2000.com", cell: "514-653-7391", poste: "" },
                { nom: "Martin Monette", titre: "Arpenteur", courriel: "mmonette@pep2000.com", cell: "514-821-8911", poste: "" },
              ]},
              { dept: "Estimation", membres: [
                { nom: "Marc-Antoine Blais", titre: "Estimateur en Chef", courriel: "mablais@pep2000.com", cell: "514-839-9517", poste: "232" },
                { nom: "Yann Leclerc", titre: "Estimateur", courriel: "yleclerc@pep2000.com", cell: "438-889-4889", poste: "251" },
              ]},
              { dept: "Pavage et Béton", membres: [
                { nom: "Angelo Pallotta", titre: "Surintendant béton", courriel: "apallotta@borduresadp.com", cell: "514-829-2153", poste: "" },
                { nom: "Fred Bélec", titre: "Surintendant béton", courriel: "fbelec@borduresadp.com", cell: "514-686-9599", poste: "" },
                { nom: "Karl Bélanger", titre: "Surintendant pavage", courriel: "kbelanger@pep2000.com", cell: "514-318-9899", poste: "" },
                { nom: "Stéphane Boisvert", titre: "Chargé de projet Asphalte", courriel: "sboisvert@pep2000.com", cell: "514-229-5745", poste: "" },
                { nom: "Thomas Lawrence", titre: "Chargé de Projet Asphalte / Béton", courriel: "tlawrence@pep2000.com", cell: "514-831-6721", poste: "231" },
              ]},
              { dept: "PEP VRAC / Sud-Ouest", membres: [
                { nom: "Audrey Dandurand", titre: "Répartitrice Sud-Ouest", courriel: "adandurand@transportsudouest.com", cell: "438-378-9878", poste: "296" },
                { nom: "Jacques Laflèche", titre: "Directeur Mécanique", courriel: "jlafleche@pep2000.com", cell: "514-267-1948", poste: "" },
                { nom: "Nick Del Vecchio", titre: "Répartiteur Sud-Ouest", courriel: "nick@transportsudouest.com", cell: "514-641-1002", poste: "295" },
              ]},
            ].map((groupe) => {
              const membres = groupe.membres.filter((m) =>
                !recherche || [m.nom, m.titre, m.courriel, m.cell].some((v) => v?.toLowerCase().includes(recherche.toLowerCase()))
              );
              if (membres.length === 0) return null;
              return (
                <div key={groupe.dept} style={{ marginBottom: 20 }}>
                  <div style={{ fontWeight: 700, fontSize: 13, textTransform: "uppercase", letterSpacing: "0.06em", color: "var(--odj-accent)", background: "var(--odj-surligne)", padding: "8px 14px", marginBottom: 0, borderLeft: "3px solid var(--odj-rouge)" }}>
                    {groupe.dept}
                  </div>
                  <div style={{ background: "var(--odj-panel)", border: "1px solid var(--odj-line)", borderTop: "none", overflowX: isPhone ? "visible" : "auto" }}>
                    <table style={{ width: "100%", borderCollapse: "collapse", tableLayout: "fixed" }}>
                      <colgroup>
                        <col style={{ width: isPhone ? "50%" : "22%" }} />
                        {!isPhone && <col style={{ width: "38%" }} />}
                        <col style={{ width: isPhone ? "30%" : "18%" }} />
                        {isPhone && <col style={{ width: "20%" }} />}
                        {!isPhone && <col style={{ width: "22%" }} />}
                      </colgroup>
                      <thead>
                        <tr style={{ background: "var(--odj-panelAlt)", borderBottom: "1px solid var(--odj-line)" }}>
                          <th style={{ padding: "7px 14px", textAlign: "left", fontSize: 11, fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.05em", color: "var(--odj-dim)" }}>Nom</th>
                          {!isPhone && <th style={{ padding: "7px 14px", textAlign: "left", fontSize: 11, fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.05em", color: "var(--odj-dim)" }}>Titre</th>}
                          <th style={{ padding: "7px 14px", textAlign: "left", fontSize: 11, fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.05em", color: "var(--odj-dim)" }}>Cellulaire</th>
                          {isPhone && <th style={{ padding: "7px 14px", textAlign: "center", fontSize: 11, fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.05em", color: "var(--odj-dim)" }}>Info</th>}
                          {!isPhone && <th style={{ padding: "7px 14px", textAlign: "left", fontSize: 11, fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.05em", color: "var(--odj-dim)" }}>Courriel</th>}
                        </tr>
                      </thead>
                      <tbody>
                        {membres.map((m, i) => (
                          <tr key={m.nom} style={{ borderBottom: i < membres.length - 1 ? "1px solid var(--odj-lineFaible)" : "none", background: i % 2 === 0 ? "var(--odj-panel)" : "var(--odj-panelAlt)" }}>
                            <td style={{ padding: "9px 14px", fontWeight: 600, fontSize: 13.5, color: "var(--odj-texte)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{m.nom}</td>
                            {!isPhone && <td style={{ padding: "9px 14px", fontSize: 13, color: "var(--odj-texte2)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{m.titre}</td>}
                            <td style={{ padding: "9px 14px", fontSize: 13, fontFamily: "'IBM Plex Mono', ui-monospace, 'SF Mono', Menlo, monospace" }}>
                              {m.cell && m.cell !== "N/A" ? (
                                <a href={`tel:${m.cell}`} style={{ color: "var(--odj-accent)", textDecoration: "none", fontWeight: 600 }}>{m.cell}</a>
                              ) : m.poste ? (
                                <span style={{ color: "var(--odj-dim)" }}>Poste {m.poste}</span>
                              ) : "—"}
                            </td>
                            {isPhone && (
                              <td style={{ padding: "6px 8px", textAlign: "center", verticalAlign: "middle" }}>
                                <button
                                  onClick={() => setContactOuvert(m)}
                                  style={{ background: "var(--odj-navy)", color: "#fff", border: "none", width: 32, height: 32, fontSize: 15, cursor: "pointer", display: "inline-flex", alignItems: "center", justifyContent: "center" }}
                                >
                                  👤
                                </button>
                              </td>
                            )}
                            {!isPhone && <td style={{ padding: "9px 14px", fontSize: 12.5, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                              {m.courriel ? <a href={`mailto:${m.courriel}`} style={{ color: "var(--odj-lien)", textDecoration: "none" }}>{m.courriel}</a> : "—"}
                            </td>}
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              );
            })}
          </>
        )}
      </div>
    </div>
  );
}

/* ---------------------------------------------------------------------
   SÉLECTEUR D'APERÇU — visible uniquement si profil.peutPrevisualiser.
   Change l'affichage (rôle/accès) sans changer l'identité réelle : tout
   ce qui est soumis reste enregistré sous le vrai compte de la personne.
--------------------------------------------------------------------- */
function SelecteurApercu({ apercu, onChange }) {
  const [ouvert, setOuvert] = useState(false);
  const optionActuelle = OPTIONS_APERCU.find((o) => o.role === apercu?.role && o.accesSpecial === apercu?.accesSpecial);

  return (
    <div style={{ position: "fixed", bottom: 14, right: 14, zIndex: 2000 }}>
      {ouvert && (
        <div style={{ background: "var(--odj-panel)", border: "1px solid var(--odj-line)", boxShadow: "0 2px 10px rgba(0,0,0,0.15)", marginBottom: 8, width: 240 }}>
          <div style={{ padding: "8px 12px", fontSize: 11, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.04em", color: "var(--odj-dim)", borderBottom: "1px solid var(--odj-lineFaible)" }}>
            Aperçu — voir comme
          </div>
          <button
            onClick={() => { onChange(null); setOuvert(false); }}
            style={{ display: "block", width: "100%", textAlign: "left", padding: "9px 12px", border: "none", background: !apercu ? "var(--odj-bg)" : "transparent", cursor: "pointer", fontSize: 13, fontWeight: !apercu ? 700 : 400 }}
          >
            Mon rôle réel
          </button>
          {OPTIONS_APERCU.map((o) => (
            <button
              key={o.label}
              onClick={() => { onChange({ role: o.role, accesSpecial: o.accesSpecial }); setOuvert(false); }}
              style={{ display: "block", width: "100%", textAlign: "left", padding: "9px 12px", border: "none", background: optionActuelle?.label === o.label ? "var(--odj-bg)" : "transparent", cursor: "pointer", fontSize: 13, fontWeight: optionActuelle?.label === o.label ? 700 : 400 }}
            >
              {o.label}
            </button>
          ))}
        </div>
      )}
      <button
        onClick={() => setOuvert((o) => !o)}
        style={{
          background: apercu ? "var(--odj-rouge)" : "var(--odj-navy)", color: "#fff", border: "none", borderRadius: 20,
          padding: "10px 16px", fontSize: 12.5, fontWeight: 600, cursor: "pointer",
          boxShadow: "0 2px 8px rgba(0,0,0,0.2)",
        }}
      >
        {apercu ? `Aperçu : ${optionActuelle?.label || "?"}` : "Aperçu…"}
      </button>
    </div>
  );
}

function AppInner({ session, mode, onChangerMode }) {
  useGoogleFonts();
  // profil = la fiche metier (role, acces special) de ordre_du_jour.profils.
  // La session, elle, vient de GardeConnexion : une seule porte d'entree pour
  // tout le Toolbox.
  const [profil, setProfil] = useState(null);
  const [profilManquant, setProfilManquant] = useState(false);
  const [apercu, setApercu] = useState(null); // { role, accesSpecial } | null — mode test (voir profil.peutPrevisualiser)
  const [date, setDate] = useState(tomorrowISO());
  const [vue, setVue] = useState({ ecran: "accueil" });
  const [menuSection, setMenuSection] = useState(null); // 'projets' | 'contacts' | null
  const [scrollCible, setScrollCible] = useState(null); // { slug, seq } | null — pour défiler jusqu'à la bonne fiche après un clic sur une notification
  const [resetSignal, setResetSignal] = useState(0); // incrémenté à chaque clic sur "Retour au menu" pour forcer la Vue générale
  const [confirmNouvelle, setConfirmNouvelle] = useState(null); // { date } | null
  const [verifNouvelle, setVerifNouvelle] = useState(false);

  useEffect(() => { chargerJoursFeriesCache(); }, []);

  // La fiche metier vit dans ordre_du_jour.profils. GardeConnexion a deja
  // valide la session et l'acces a l'app; ici on va seulement chercher le
  // role et le nom affiche.
  useEffect(() => {
    let actif = true;
    (async () => {
      const { data, error } = await supabase
        .from("profils").select("*").eq("user_id", session.userId).maybeSingle();
      if (!actif) return;
      if (error || !data) { setProfilManquant(true); return; }
      setProfil({
        userId: session.userId,
        nom: data.nom,
        role: data.role,
        accesSpecial: data.acces_special,
        slug: slugify(data.nom),
        peutPrevisualiser: !!data.peut_previsualiser,
      });
    })();
    return () => { actif = false; };
  }, [session.userId]);
  // Recharge le cache des membres (ordre_du_jour.profils) dès qu'une session
  // est établie — nécessaire pour les listes de destinataires de
  // notifications et la conversion userId -> nom affiché.
  useEffect(() => { if (profil) chargerMembresCache(); }, [profil]);

  if (profilManquant) {
    return (
      <div style={{ minHeight: "100vh", background: "var(--odj-bg)", display: "flex", alignItems: "center", justifyContent: "center", padding: 24 }}>
        <div style={{ maxWidth: 460, background: "var(--odj-panel)", border: "1px solid var(--odj-line)", padding: 24 }}>
          <div style={{ fontWeight: 700, fontSize: 18, color: "var(--odj-texte)", marginBottom: 10 }}>
            Fiche manquante
          </div>
          <div style={{ fontSize: 14.5, color: "var(--odj-texte2)", lineHeight: 1.6, marginBottom: 18 }}>
            Ton compte est bien connect\u00e9, mais tu n&apos;as pas encore de fiche dans Ordre du jour
            (nom affich\u00e9 et r\u00f4le m\u00e9tier). Un administrateur peut la cr\u00e9er dans le panneau
            d&apos;administration du Toolbox.
          </div>
          <a href="/" style={{ display: "block", textAlign: "center", background: "var(--odj-rouge)", color: "#fff", padding: 13, fontWeight: 600, fontSize: 14, letterSpacing: "0.04em", textTransform: "uppercase", textDecoration: "none" }}>
            Retour au Toolbox PEP
          </a>
        </div>
      </div>
    );
  }

  if (!profil) {
    return (
      <div style={{ minHeight: "100vh", background: "var(--odj-bg)", display: "flex", alignItems: "center", justifyContent: "center", color: "var(--odj-dim)", fontSize: 14 }}>
        Chargement du profil\u2026
      </div>
    );
  }

  // Mode Aperçu (profil.peutPrevisualiser) : change uniquement role/accesSpecial
  // pour l'affichage. Le nom (donc l'identité réelle pour tout ce qui est
  // enregistré) reste toujours celui de la vraie personne connectée.
  const profilEffectif = apercu ? { ...profil, role: apercu.role, accesSpecial: apercu.accesSpecial } : profil;

  // Appelé quand on clique "Faire une nouvelle requête" : vérifie s'il y a déjà
  // une demande pour demain, et si oui, propose de modifier ou d'en soumettre une 2e.
  const demarrerNouvelleRequete = async (dateOverride) => {
    const d = dateOverride || tomorrowISO();
    const slug = profil.userId;
    setVerifNouvelle(true);
    try {
      const r = await storage.get(ficheKey(d, slug, 1), true);
      if (r) {
        setConfirmNouvelle({ date: d });
      } else {
        setVue({ ecran: "form", date: d, seq: 1 });
      }
    } catch (e) {
      setVue({ ecran: "form", date: d, seq: 1 });
    } finally {
      setVerifNouvelle(false);
    }
  };

  const soumettreDeuxiemeDemande = async () => {
    const { date: d } = confirmNouvelle;
    const slug = profil.userId;
    let prochainSeq = 2;
    try {
      const listRes = await storage.list(`fiche:${d}:${slug}::`, true);
      const seqs = (listRes?.keys || []).map(parseSeqSuffix);
      if (seqs.length) prochainSeq = Math.max(...seqs) + 1;
    } catch (e) { /* défaut: 2 */ }
    setVue({ ecran: "form", date: d, seq: prochainSeq });
    setConfirmNouvelle(null);
  };

  return (
    <div style={{ minHeight: "100vh", background: "var(--odj-bg)", color: "var(--odj-texte)" }}>
      <EnTeteApp
        titre="Ordre du jour"
        sousTitre="Demandes de main-d&apos;oeuvre, camions et machinerie"
        mode={mode}
        onChangerMode={onChangerMode}
        nom={profil.nom}
        poste={session.poste}
        onAccueil={() => { setMenuSection(null); setVue({ ecran: "accueil" }); setResetSignal((n) => n + 1); }}
      />

      <BarreOutils
        profil={profilEffectif}
        date={date}
        setDate={setDate}
        masquerDate={profilEffectif.role === "contremaitre"}
        onMenuSelect={(id) => {
          if (id === "retour") {
            setMenuSection(null);
            setVue({ ecran: "accueil" });
            setResetSignal((s) => s + 1);
          } else if (id === "guide") {
            window.open("/_static/ordre-du-jour/guide-pep2000.html", "_blank");
          } else {
            setMenuSection(id);
          }
        }}
        onNaviguerNotification={(n) => {
          setMenuSection(null);
          if (n.cible?.slug === profil.userId) {
            setVue({ ecran: "detail", date: n.cible.date, seq: n.cible.seq || 1 });
          } else {
            setDate(n.cible.date);
            setVue({ ecran: "accueil" });
            setScrollCible({ slug: n.cible?.slug, seq: n.cible?.seq || 1 });
          }
        }}
      />
      {profil.peutPrevisualiser && <SelecteurApercu apercu={apercu} onChange={setApercu} />}
      {confirmNouvelle && (
        <div style={{ position: "fixed", inset: 0, background: "rgba(15,33,56,0.55)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 1000, padding: 20 }}>
          <div style={{ width: "100%", maxWidth: 420, background: "var(--odj-panel)", border: "1px solid var(--odj-line)", padding: 24 }}>
            <div style={{ fontWeight: 700, fontSize: 18, color: "var(--odj-texte)", marginBottom: 10 }}>
              Demande déjà soumise
            </div>
            <div style={{ fontSize: 14.5, color: "var(--odj-texte2)", marginBottom: 20, lineHeight: 1.5 }}>
              Vous avez déjà soumis une demande pour {labelDate(confirmNouvelle.date).toLowerCase()}. Pour modifier votre demande existante, retournez-y directement depuis « Vos requêtes ». Voulez-vous en soumettre une deuxième malgré tout ?
            </div>
            <div style={{ display: "grid", gap: 10 }}>
              <button
                onClick={soumettreDeuxiemeDemande}
                style={{ width: "100%", background: "var(--odj-rouge)", color: "#fff", border: "none", padding: "13px", fontWeight: 600, fontSize: 14, letterSpacing: "0.04em", textTransform: "uppercase", cursor: "pointer" }}
              >
                Soumettre une deuxième demande
              </button>
              <button
                onClick={() => setConfirmNouvelle(null)}
                style={{ width: "100%", background: "transparent", color: "var(--odj-dim)", border: "none", padding: "8px", fontWeight: 600, fontSize: 13, cursor: "pointer" }}
              >
                Annuler
              </button>
            </div>
          </div>
        </div>
      )}
      {menuSection === "notifications" ? (
        <NotificationsPushPage profil={profilEffectif} onRetour={() => setMenuSection(null)} />
      ) : menuSection ? (
        <InfoGenerale section={menuSection} onRetour={() => setMenuSection(null)} />
      ) : profilEffectif.role === "contremaitre" ? (
        vue.ecran === "accueil" ? (
          <ContremaitreAccueil
            profil={profilEffectif}
            onNouvelle={demarrerNouvelleRequete}
            onOuvrirDate={(d, s) => setVue({ ecran: "detail", date: d, seq: s })}
          />
        ) : vue.ecran === "detail" ? (
          <FicheDetail
            profil={profilEffectif}
            date={vue.date}
            seq={vue.seq}
            onRetour={() => setVue({ ecran: "accueil" })}
            onModifier={() => setVue({ ecran: "form", date: vue.date, seq: vue.seq })}
          />
        ) : (
          <FicheForm profil={profilEffectif} date={vue.date} seq={vue.seq} onRetourAccueil={() => setVue({ ecran: "accueil" })} />
        )
      ) : profilEffectif.role === "surintendant" ? (
        vue.ecran === "form" ? (
          <FicheForm profil={profilEffectif} date={vue.date || tomorrowISO()} seq={vue.seq} onRetourAccueil={() => setVue({ ecran: "accueil" })} />
        ) : vue.ecran === "detail" ? (
          <FicheDetail
            profil={profilEffectif}
            date={vue.date}
            seq={vue.seq}
            onRetour={() => setVue({ ecran: "accueil" })}
            onModifier={() => setVue({ ecran: "form", date: vue.date, seq: vue.seq })}
          />
        ) : (
          <Dashboard
            date={date}
            profil={profilEffectif}
            boutonRequete={demarrerNouvelleRequete}
            onOuvrirDate={(d, s) => setVue({ ecran: "detail", date: d, seq: s })}
            scrollCible={scrollCible}
            onScrollFait={() => setScrollCible(null)}
            resetSignal={resetSignal}
          />
        )
      ) : (
        <Dashboard date={date} profil={profilEffectif} scrollCible={scrollCible} onScrollFait={() => setScrollCible(null)} resetSignal={resetSignal} />
      )}
    </div>
  );
}

export default function App() {
  const [session, setSession] = useState(null);
  const [mode, setMode] = useModePep();

  if (!session) {
    return <GardeConnexion appSlug="ordre-du-jour" nomApp="Ordre du jour" onPret={setSession} />;
  }

  return (
    <ErrorBoundary>
      <PaletteOrdreDuJour mode={mode} />
      <AppInner session={session} mode={mode} onChangerMode={setMode} />
    </ErrorBoundary>
  );
}
