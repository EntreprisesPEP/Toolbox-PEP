-- ===========================================================================
-- CUBAGE BÉTON — 001 : INSCRIPTION DE L'APP DANS LE TOOLBOX
--
-- L'app ne garde aucune donnée (calculateur pur) : pas de schéma à créer.
-- Ce script ajoute seulement la ligne dans pep_apps, pour que « Cubage béton »
-- apparaisse dans l'app Administration et qu'on puisse cocher l'accès des
-- personnes (pep_user_apps). Les administrateurs y ont accès d'office.
--
-- Idempotent : on peut le relancer sans erreur.
-- ===========================================================================

insert into public.pep_apps (slug, label, sort_order)
values ('cubage-beton', 'Cubage béton', (select coalesce(max(sort_order), 0) + 1 from public.pep_apps))
on conflict (slug) do nothing;
