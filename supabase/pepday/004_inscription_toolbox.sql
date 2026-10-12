-- ===========================================================================
-- PEPday RV02 — 004 : INSCRIPTION DE L'APP DANS LE TOOLBOX ET PREMIER DIRECTEUR
--
-- Touche le schéma public du Toolbox : à relire avant d'appliquer.
--
-- 1. pep_apps : rend l'app visible dans l'app Administration, pour cocher
--    « PEPday » dans les droits d'une personne (pep_user_apps).
--    Colonnes déduites du code de l'Administration (slug, label,
--    sort_order) : VÉRIFIER dans Supabase avant d'exécuter, et ajuster si la
--    table a d'autres colonnes obligatoires.
-- ===========================================================================

insert into public.pep_apps (slug, label, sort_order)
values ('pepday', 'PEPday', (select coalesce(max(sort_order), 0) + 1 from public.pep_apps))
on conflict (slug) do nothing;

-- ---------------------------------------------------------------------------
-- 2. Premier membre de l'équipe PEPday, avec le rôle directeur : c'est lui
--    qui ajoutera les autres dans PEPday > Répertoires > Équipe PEPday.
--    Remplacer le nom et le courriel (celui du compte Toolbox, en minuscules)
--    puis décommenter. Le compte se rattache tout seul à la première
--    ouverture de l'app.
-- ---------------------------------------------------------------------------
-- insert into pepday.membres (nom, titre, courriel, roles)
-- values ('Prénom Nom', 'Directeur construction', 'prenom.nom@pep2000.com', array['directeur'])
-- on conflict (courriel) do update set roles = excluded.roles;

-- ---------------------------------------------------------------------------
-- 3. RV02 — Fermeture automatique des rapports jamais remplis (optionnel).
--    pepday.fermer_rapports_abandonnes() marque « Abandonné » les rapports
--    vides aux étapes Dispatch/Contremaître plus vieux que
--    pepday.parametres.jours_avant_abandon (14 jours par défaut).
--    Avec l'extension pg_cron de Supabase (Database > Extensions), décommenter :
-- ---------------------------------------------------------------------------
-- select cron.schedule('pepday-fermer-abandonnes', '15 3 * * *',
--   $$select pepday.fermer_rapports_abandonnes()$$);
