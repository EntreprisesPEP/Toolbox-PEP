-- ===========================================================================
-- PLANIFICATION HEBDOMADAIRE — 002 : LA VUE RÉUNION (écran de la télé)
--
-- Deux colonnes sur app_settings, pour que l'écran de la télé suive la
-- navigation de l'animateur :
--   ecran_onglet  : l'onglet que l'animateur regarde ('admin', '1', '2',
--                   '3', 'coupes', 'vacances')
--   ecran_besoins : la fenêtre « Besoins de la semaine » est-elle ouverte
--
-- Seul le mode ADMIN écrit dans ces colonnes; la télé ne fait que lire. La
-- table est déjà diffusée en temps réel, donc rien d'autre à brancher.
--
-- Idempotent : on peut le relancer sans erreur.
-- ===========================================================================

alter table planif_hebdo.app_settings
  add column if not exists ecran_onglet  text    not null default '1',
  add column if not exists ecran_besoins boolean not null default false;
