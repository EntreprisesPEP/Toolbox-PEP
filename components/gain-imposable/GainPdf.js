// ============================================================================
// Le document PDF du gain imposable.
//
// Il montre le CHEMIN du calcul, pas seulement le résultat. C'est ce que le
// chiffrier faisait de bien : quelqu'un qui reçoit la feuille doit pouvoir
// refaire l'arithmétique à la main et tomber sur le même chiffre.
// ============================================================================

import React from 'react';
import { Document, Page, Text, View, Image, StyleSheet } from '@react-pdf/renderer';
import { enCents } from '../../lib/gain-imposable/calculs';

const NAVY = '#14213d';
const ROUGE = '#c41230';
const GRIS = '#6b7280';
const FILET = '#dde1ea';
const PALE = '#f4f6f9';

const s = StyleSheet.create({
  page: { paddingTop: 26, paddingBottom: 40, paddingHorizontal: 30, fontSize: 9, color: '#111827', fontFamily: 'Helvetica' },

  bandeau: { flexDirection: 'row', alignItems: 'center', backgroundColor: NAVY, padding: 10, borderRadius: 3, marginBottom: 12 },
  logo: { width: 34, height: 34, marginRight: 10 },
  bandeauTitre: { color: '#fff', fontSize: 13, fontFamily: 'Helvetica-Bold', letterSpacing: 0.6 },
  bandeauSous: { color: '#c9d2e3', fontSize: 7.5, marginTop: 2 },

  boites: { flexDirection: 'row', gap: 8, marginBottom: 12 },
  boite: { flex: 1, borderWidth: 1, borderColor: FILET, borderRadius: 3, paddingVertical: 6, paddingHorizontal: 8 },
  boiteTitre: { fontSize: 6.5, color: GRIS, letterSpacing: 0.5, marginBottom: 3, fontFamily: 'Helvetica-Bold' },
  boiteLigne: { fontSize: 8.5, marginBottom: 1.5 },
  boiteFort: { fontSize: 9.5, fontFamily: 'Helvetica-Bold' },

  sectionTitre: {
    fontSize: 8, fontFamily: 'Helvetica-Bold', color: ROUGE, letterSpacing: 0.7,
    marginTop: 10, marginBottom: 4,
  },

  tr: { flexDirection: 'row', paddingVertical: 3.5, borderBottomWidth: 0.5, borderBottomColor: FILET },
  trPale: { flexDirection: 'row', paddingVertical: 3.5, backgroundColor: PALE, borderBottomWidth: 0.5, borderBottomColor: FILET },
  libelle: { flex: 1, paddingRight: 10 },
  montant: { width: 82, textAlign: 'right' },
  fort: { fontFamily: 'Helvetica-Bold' },
  attenue: { color: GRIS },

  total: {
    flexDirection: 'row', marginTop: 8, paddingVertical: 8, paddingHorizontal: 10,
    backgroundColor: NAVY, borderRadius: 3, alignItems: 'center',
  },
  totalTexte: { flex: 1, color: '#fff', fontSize: 9.5, fontFamily: 'Helvetica-Bold', letterSpacing: 0.4 },
  totalMontant: { color: '#fff', fontSize: 13, fontFamily: 'Helvetica-Bold' },

  avis: {
    marginTop: 8, padding: 7, backgroundColor: '#fff8e6', borderLeftWidth: 2,
    borderLeftColor: '#b45309', fontSize: 7.5, color: '#7c4a03', lineHeight: 1.4,
  },
  note: { marginTop: 10, fontSize: 7.5, color: GRIS, lineHeight: 1.45 },

  pied: {
    position: 'absolute', bottom: 18, left: 30, right: 30,
    flexDirection: 'row', justifyContent: 'space-between',
    fontSize: 7, color: GRIS, borderTopWidth: 0.5, borderTopColor: FILET, paddingTop: 5,
  },
});

function argent(cents) {
  const v = Number.isFinite(cents) ? cents / 100 : 0;
  return `${v.toLocaleString('fr-CA', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} $`;
}
function km(n) {
  if (!Number.isFinite(n)) return '—';
  return `${n.toLocaleString('fr-CA', { maximumFractionDigits: 1 })} km`;
}
function pourcent(f) {
  if (!Number.isFinite(f)) return '—';
  return `${(f * 100).toLocaleString('fr-CA', { minimumFractionDigits: 1, maximumFractionDigits: 1 })} %`;
}
function taux(t) {
  if (!Number.isFinite(t)) return '—';
  return t.toLocaleString('fr-CA', { minimumFractionDigits: 2, maximumFractionDigits: 4 });
}
function periodesTexte(p) {
  if (!Number.isFinite(p)) return '—';
  return Number.isInteger(p) ? String(p) : p.toFixed(2);
}
function dateFr(iso) {
  if (!iso) return '—';
  const m = String(iso).match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (!m) return String(iso);
  return `${m[3]}-${m[2]}-${m[1]}`;
}

function Ligne({ libelle, montant, fort, attenue, pale }) {
  return (
    <View style={pale ? s.trPale : s.tr} wrap={false}>
      <Text style={[s.libelle, fort && s.fort, attenue && s.attenue]}>{libelle}</Text>
      <Text style={[s.montant, fort && s.fort, attenue && s.attenue]}>{montant}</Text>
    </View>
  );
}

export default function GainPdf({ calcul: c, resultat: r, logoDataUrl }) {
  const estAchat = c.mode === 'achat';
  // Le coût vient de la SAISIE, pas d'une division à l'envers du résultat :
  // celle-ci se casse dès que le nombre de périodes vaut zéro.
  const coutCents = enCents(c.cout ?? c.cout_cents) ?? 0;

  return (
    <Document title={`Gain imposable — ${c.employe_nom} ${c.annee}`}>
      <Page size="LETTER" style={s.page}>

        <View style={s.bandeau} fixed>
          {logoDataUrl ? <Image src={logoDataUrl} style={s.logo} /> : null}
          <View>
            <Text style={s.bandeauTitre}>AVANTAGE IMPOSABLE — AUTOMOBILE</Text>
            <Text style={s.bandeauSous}>
              Droit d'usage et frais de fonctionnement · Année d'imposition {c.annee}
            </Text>
          </View>
        </View>

        <View style={s.boites}>
          <View style={s.boite}>
            <Text style={s.boiteTitre}>EMPLOYÉ</Text>
            <Text style={s.boiteFort}>{c.employe_nom}</Text>
            {c.employe_courriel ? <Text style={[s.boiteLigne, s.attenue]}>{c.employe_courriel}</Text> : null}
          </View>
          <View style={s.boite}>
            <Text style={s.boiteTitre}>EMPLOYEUR</Text>
            <Text style={s.boiteLigne}>{c.employeur}</Text>
          </View>
          <View style={s.boite}>
            <Text style={s.boiteTitre}>VÉHICULE</Text>
            <Text style={s.boiteLigne}>{c.vehicule || '—'}</Text>
            <Text style={[s.boiteLigne, s.attenue]}>{estAchat ? 'Acheté' : 'Loué'}</Text>
          </View>
        </View>

        <View style={s.boites}>
          <View style={s.boite}>
            <Text style={s.boiteTitre}>MISE À DISPOSITION</Text>
            <Text style={s.boiteLigne}>{dateFr(c.date_debut)} au {dateFr(c.date_fin)}</Text>
            <Text style={[s.boiteLigne, s.attenue]}>
              {r.jours} jours = {periodesTexte(r.periodes)} période{r.periodes > 1 ? 's' : ''} de 30 jours
            </Text>
          </View>
          <View style={s.boite}>
            <Text style={s.boiteTitre}>KILOMÉTRAGE</Text>
            <Text style={s.boiteLigne}>Total {km(r.kmTotal)}</Text>
            <Text style={[s.boiteLigne, s.attenue]}>
              Personnel {km(r.kmPersonnel)} · Affaires {km(r.kmAffaires)}
            </Text>
          </View>
          <View style={s.boite}>
            <Text style={s.boiteTitre}>RÉPARTITION</Text>
            <Text style={s.boiteFort}>{pourcent(r.partAffaires)} affaires</Text>
            <Text style={[s.boiteLigne, s.attenue]}>{pourcent(r.partPersonnelle)} personnel</Text>
          </View>
        </View>

        {/* ---------------- Droit d'usage ---------------- */}
        <View wrap={false}>
          <Text style={s.sectionTitre}>DROIT D'USAGE</Text>
          {estAchat ? (
            <Ligne
              libelle={`${taux(r.tauxUsage * 100)} % × ${argent(coutCents)} (coût du véhicule, taxes incluses)`
                + ` × ${periodesTexte(r.periodes)} période${r.periodes > 1 ? 's' : ''}`}
              montant={argent(r.usageCompletCents)}
              pale
            />
          ) : (
            <>
              <Ligne libelle="Coût de location total (taxes incluses)" montant={argent(r.coutLocationCents)} attenue />
              <Ligne libelle="Moins les assurances comprises" montant={`− ${argent(r.assurancesTotalCents)}`} attenue />
              <Ligne
                libelle={`⅔ × ${argent((r.coutLocationCents || 0) - (r.assurancesTotalCents || 0))}`}
                montant={argent(r.usageCompletCents)}
                pale
              />
            </>
          )}

          {r.reductionAdmissible ? (
            <>
              <Ligne
                libelle={`Réduction : ${km(r.kmPersonnel)} ÷ (1 667 km × ${periodesTexte(r.periodes)}) = ${pourcent(r.fractionReduction)}`}
                montant=""
                attenue
              />
              <Ligne libelle="Droit d'usage réduit" montant={argent(r.usageCents)} fort />
            </>
          ) : (
            <Text style={s.avis}>
              Aucune réduction du droit d'usage. {
                !r.conditionExige ? "L'employeur n'exige pas l'utilisation du véhicule dans l'exercice des fonctions."
                  : !r.conditionAffaires ? "L'utilisation à des fins d'affaires ne dépasse pas 50 %."
                    : `Les ${km(r.kmPersonnel)} parcourus à des fins personnelles dépassent le plafond de ${km(r.plafondKmPersonnel)} (1 667 km × ${periodesTexte(r.periodes)} périodes).`
              }
            </Text>
          )}

          {r.rembUsageCents > 0 && (
            <Ligne libelle="Moins la somme remboursée par l'employé" montant={`− ${argent(r.rembUsageCents)}`} attenue />
          )}
          <Ligne libelle="DROIT D'USAGE RETENU" montant={argent(r.usageNetCents)} fort pale />
        </View>

        {/* ---------------- Frais de fonctionnement ---------------- */}
        <View wrap={false}>
          <Text style={s.sectionTitre}>FRAIS DE FONCTIONNEMENT</Text>
          <Ligne
            libelle={`${km(r.kmPersonnel)} × ${taux(r.tauxKm)} $/km`}
            montant={argent(r.parKmCents)}
            attenue={r.methodeRetenue !== 'kilometrique'}
            fort={r.methodeRetenue === 'kilometrique'}
          />
          {r.moitieCents !== null ? (
            <Ligne
              libelle="Ou 50 % du droit d'usage"
              montant={argent(r.moitieCents)}
              attenue={r.methodeRetenue !== 'moitie'}
              fort={r.methodeRetenue === 'moitie'}
            />
          ) : (
            <Ligne
              libelle="La méthode de 50 % du droit d'usage n'est pas ouverte (usage d'affaires de 50 % ou moins)"
              montant=""
              attenue
            />
          )}
          {r.rembFonctCents > 0 && (
            <Ligne libelle="Moins la somme remboursée par l'employé" montant={`− ${argent(r.rembFonctCents)}`} attenue />
          )}
          <Ligne libelle="FRAIS DE FONCTIONNEMENT RETENUS" montant={argent(r.fonctNetCents)} fort pale />
        </View>

        <View style={s.total} wrap={false}>
          <Text style={s.totalTexte}>AVANTAGE IMPOSABLE TOTAL</Text>
          <Text style={s.totalMontant}>{argent(r.totalCents)}</Text>
        </View>

        {/* ---------------- Taxes ---------------- */}
        <View wrap={false}>
          <Text style={s.sectionTitre}>TAXES À REMETTRE PAR L'EMPLOYEUR</Text>
          <Ligne libelle="TPS — droit d'usage × 4/104, frais de fonctionnement × 3 %" montant={argent(r.tpsCents)} />
          <Ligne libelle="TVQ — droit d'usage × 9,975/109,975, frais de fonctionnement × 6 %" montant={argent(r.tvqCents)} />
        </View>

        <Text style={s.note}>
          Cotisation à retenir sur l'avantage imposable : RRQ seulement — ni RQAP, ni assurance-emploi.
          {'\n'}
          Taux de {r.taux?.annee} appliqué aux frais de fonctionnement : {taux(r.taux?.fonctionnement)} $ le kilomètre.
          {r.taux?.provenance === 'repli' ? " (valeur de secours de l'application — à confirmer)" : ''}
        </Text>

        <View style={s.pied} fixed>
          <Text>Les Entreprises PEP2000 inc. — {c.employe_nom}, année {c.annee}</Text>
          <Text render={({ pageNumber, totalPages }) => `Page ${pageNumber} de ${totalPages}`} />
        </View>
      </Page>
    </Document>
  );
}
