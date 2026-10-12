-- ===========================================================================
-- PEPday RV02 — 001 : SCHÉMA ET TABLES
--
-- Projet Supabase : celui du Toolbox PEP (même projet, schéma dédié).
-- À appliquer dans l'ordre : 001, 002, 003, 004 (semences), puis 005
-- (inscription au Toolbox). NE PAS appliquer depuis le dépôt de
-- développement : ces fichiers sont livrés pour l'import.
--
-- RV02 remplace entièrement les migrations de la v1 (jamais appliquées) :
-- c'est un schéma complet, pas une suite de modifications.
--
-- Après l'application : Settings > API > « Exposed schemas » : ajouter pepday.
--
-- Les codes (rôles, étapes, catégories, statuts, types) sont ceux de
-- lib/pepday/constantes.js : un code renommé d'un côté doit l'être de l'autre.
--
-- Colonne ref_civalgo (texte, indexée) sur projets, employés, équipements,
-- matériaux, organisations et rapports : prévue pour un import futur depuis
-- Civalgo. Aucune donnée n'est importée maintenant.
-- ===========================================================================

create schema if not exists pepday;

-- Nom normalisé pour l'unicité : minuscules, sans accents ni ponctuation.
-- « PEP  Pavage » = « pep pavage ». (translate est immuable, unaccent ne
-- l'est pas : il ne pourrait pas servir dans un index.)
create or replace function pepday.normaliser(t text) returns text
language sql immutable as $$
  select trim(regexp_replace(lower(translate(coalesce(t, ''),
    'ÀÂÄÁÃÇÉÈÊËÍÎÏÌÑÓÔÖÒÕÚÛÜÙÝàâäáãçéèêëíîïìñóôöòõúûüùýÿŒœÆæ’''',
    'AAAAACEEEEIIIINOOOOOUUUUYaaaaaceeeeiiiinooooouuuuyyooaa  ')), '[^a-z0-9]+', ' ', 'g'));
$$;

-- ---------------------------------------------------------------------------
-- Équipe PEPday : les personnes qui se connectent et leurs rôles.
-- ---------------------------------------------------------------------------
create table if not exists pepday.membres (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid unique references auth.users (id) on delete set null,
  nom         text not null,
  titre       text,
  courriel    text not null unique check (courriel = lower(courriel)),
  roles       text[] not null default '{}'
              check (roles <@ array['dispatch','contremaitre','surintendant','coordonnateur','charge_projet','directeur']::text[]),
  actif       boolean not null default true,
  created_at  timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- Référentiel (semé par 004_semences.sql, repris de Civalgo)
-- ---------------------------------------------------------------------------
create table if not exists pepday.quarts (
  id               uuid primary key default gen_random_uuid(),
  nom              text not null unique,
  heures_normales  numeric(4,1),            -- informatif : seuil de temps supp. à confirmer
  code_paie        text,
  actif            boolean not null default true,
  created_at       timestamptz not null default now()
);

create table if not exists pepday.metiers (
  id          uuid primary key default gen_random_uuid(),
  nom         text not null unique,
  actif       boolean not null default true,
  created_at  timestamptz not null default now()
);

create table if not exists pepday.taches (
  id          uuid primary key default gen_random_uuid(),
  code        text not null unique,
  nom         text not null,
  unite       text,
  actif       boolean not null default true
);

create table if not exists pepday.sous_taches (
  id          uuid primary key default gen_random_uuid(),
  code        text unique,                    -- « Travaux à temps et matériel » n'a pas de code
  nom         text not null,
  tache_id    uuid not null references pepday.taches (id) on delete restrict,
  unite       text,
  actif       boolean not null default true
);

-- Paramètres de l'app (ex. jours_avant_abandon).
create table if not exists pepday.parametres (
  id      text primary key,
  valeur  jsonb not null
);

-- ---------------------------------------------------------------------------
-- Organisations : un seul registre, type obligatoire (liste fermée), nom
-- unique une fois normalisé.
-- ---------------------------------------------------------------------------
create table if not exists pepday.organisations (
  id             uuid primary key default gen_random_uuid(),
  nom            text not null,
  nom_normalise  text not null,
  type           text not null check (type in ('entite_pep','client','fournisseur','carriere','transporteur','sous_traitant','signalisation')),
  contact_nom    text,
  telephone      text,
  courriel       text,
  adresse        text,
  lat            double precision,
  lng            double precision,
  notes          text,
  actif          boolean not null default true,
  ref_civalgo    text,
  created_at     timestamptz not null default now()
);
create unique index if not exists organisations_nom_unique on pepday.organisations (nom_normalise);
create index if not exists organisations_ref_civalgo on pepday.organisations (ref_civalgo);

-- ---------------------------------------------------------------------------
-- Équipes, employés, équipements, matériaux
-- ---------------------------------------------------------------------------
create table if not exists pepday.equipes (
  id               uuid primary key default gen_random_uuid(),
  nom              text not null unique,
  contremaitre_id  uuid references pepday.membres (id) on delete set null,
  departement      text check (departement in ('Excavation / Civil','Aménagement','Asphalte')),
  quart_id         uuid references pepday.quarts (id) on delete set null,
  actif            boolean not null default true,
  created_at       timestamptz not null default now()
);

create table if not exists pepday.employes (
  id                  uuid primary key default gen_random_uuid(),
  code                text,
  nom                 text not null,
  metier_id           uuid references pepday.metiers (id) on delete set null,
  equipe_id           uuid references pepday.equipes (id) on delete set null,
  departement         text check (departement in ('Excavation / Civil','Aménagement','Asphalte')),
  quart_id            uuid references pepday.quarts (id) on delete set null,
  type                text,
  opere               text,
  organisation_id     uuid references pepday.organisations (id) on delete set null,
  courriel            text,
  telephone           text,
  attestation         text,
  ccq                 boolean not null default true,
  manoeuvre_paysager  boolean not null default false,
  actif               boolean not null default true,
  ref_civalgo         text,
  created_at          timestamptz not null default now()
);
create unique index if not exists employes_code_unique on pepday.employes (lower(code)) where code is not null and code <> '';
create index if not exists employes_ref_civalgo on pepday.employes (ref_civalgo);

create table if not exists pepday.equipements (
  id               uuid primary key default gen_random_uuid(),
  code             text not null,
  nom              text not null,
  type             text,
  categorie        text,                    -- copie de type, pour les écrans de la v1
  marque           text,
  modele           text,
  plaque           text,
  niv              text,
  organisation_id  uuid references pepday.organisations (id) on delete set null,
  equipe_id        uuid references pepday.equipes (id) on delete set null,
  operateur_id     uuid references pepday.employes (id) on delete set null,
  titulaire        text not null default 'proprietaire' check (titulaire in ('proprietaire','location_externe')),
  actif            boolean not null default true,
  ref_civalgo      text,
  created_at       timestamptz not null default now()
);
create unique index if not exists equipements_code_unique on pepday.equipements (lower(code));
create index if not exists equipements_ref_civalgo on pepday.equipements (ref_civalgo);

create table if not exists pepday.materiaux (
  id           uuid primary key default gen_random_uuid(),
  code         text,
  nom          text not null,
  type         text check (type in ('Asphalte','Terre','Pierre','Matériaux revalorisés')),
  categorie    text,
  unite        text not null default 't',
  actif        boolean not null default true,
  ref_civalgo  text,
  created_at   timestamptz not null default now()
);
create unique index if not exists materiaux_code_unique on pepday.materiaux (lower(code)) where code is not null and code <> '';
create index if not exists materiaux_ref_civalgo on pepday.materiaux (ref_civalgo);

-- Un matériau a plusieurs fournisseurs (l'ESG-10 est lié à 24 carrières).
create table if not exists pepday.materiau_organisations (
  id               uuid primary key default gen_random_uuid(),
  materiau_id      uuid not null references pepday.materiaux (id) on delete cascade,
  organisation_id  uuid not null references pepday.organisations (id) on delete cascade,
  unique (materiau_id, organisation_id)
);

create table if not exists pepday.primes (
  id          uuid primary key default gen_random_uuid(),
  nom         text not null unique,
  code        text,
  montant     numeric(10,2) not null check (montant >= 0),
  unite       text not null check (unite in ('forfait','heure','jour')),
  actif       boolean not null default true,
  created_at  timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- Projets
-- ---------------------------------------------------------------------------
create table if not exists pepday.projets (
  id                uuid primary key default gen_random_uuid(),
  numero            text not null unique,
  nom               text not null,
  client            text,
  departement       text check (departement in ('Excavation / Civil','Aménagement','Asphalte')),
  adresse           text,
  lat               double precision,
  lng               double precision,
  date_debut        date,
  date_fin          date,
  montant_contrat   numeric(14,2) not null default 0,
  statut            text not null default 'a_venir'
                    check (statut in ('soumission','a_venir','en_cours','suspendu','termine','annule')),
  charge_projet_id  uuid references pepday.membres (id) on delete set null,
  coordonnateur_id  uuid references pepday.membres (id) on delete set null,
  surintendant_id   uuid references pepday.membres (id) on delete set null,
  contremaitre_ids  uuid[] not null default '{}',
  notes             text,
  ref_civalgo       text,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),
  check (date_fin is null or date_debut is null or date_fin >= date_debut)
);
create unique index if not exists projets_numero_normalise on pepday.projets (lower(trim(numero)));
create index if not exists projets_ref_civalgo on pepday.projets (ref_civalgo);

create table if not exists pepday.budgets (
  id          uuid primary key default gen_random_uuid(),
  projet_id   uuid not null references pepday.projets (id) on delete cascade,
  categorie   text not null check (categorie in ('main_oeuvre','equipement','materiau','sous_traitant','autre')),
  montant     numeric(14,2) not null default 0,
  created_at  timestamptz not null default now(),
  unique (projet_id, categorie)
);

create table if not exists pepday.documents (
  id              uuid primary key default gen_random_uuid(),
  projet_id       uuid not null references pepday.projets (id) on delete cascade,
  nom             text not null,
  chemin          text not null,
  taille          bigint,
  type_mime       text,
  created_by      uuid references pepday.membres (id) on delete set null,
  created_by_nom  text,
  created_at      timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- Taux preset par année
--   main_oeuvre   : ref_type 'employe' ou 'metier'
--   equipement    : ref_type 'equipement'
--   materiau      : ref_type 'materiau'
--   sous_traitant : ref_type 'organisation' + description (plusieurs prix)
-- ---------------------------------------------------------------------------
create table if not exists pepday.taux (
  id           uuid primary key default gen_random_uuid(),
  annee        integer not null check (annee between 2000 and 2100),
  categorie    text not null check (categorie in ('main_oeuvre','equipement','materiau','sous_traitant')),
  ref_type     text not null check (ref_type in ('employe','metier','equipement','materiau','organisation')),
  ref_id       uuid not null,
  description  text not null default '',
  unite        text,
  taux         numeric(12,4) not null check (taux >= 0),
  taux_supp    numeric(12,4) check (taux_supp >= 0),
  actif        boolean not null default true,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  unique (annee, categorie, ref_type, ref_id, description)
);

-- ---------------------------------------------------------------------------
-- Rapports journaliers
-- etape : 1 dispatch, 2 saisie contremaître, 3 surintendant,
--         4 coordonnateur, 5 chargé de projet, 6 verrouillé
-- Statuts « à la Civalgo » (dérivés) : À planifier = étape 1 sans projet;
-- À remplir = 1-2; À réviser = 3; À valider = 4-5; Validé = 6; Abandonné.
-- AUCUNE contrainte d'unicité (équipe, date) : une équipe peut avoir deux
-- rapports ou plus le même jour, sur des projets différents.
-- ---------------------------------------------------------------------------
create table if not exists pepday.rapports (
  id                       uuid primary key default gen_random_uuid(),
  numero                   bigint generated always as identity (start with 1001) unique,
  projet_id                uuid references pepday.projets (id) on delete restrict,
  date                     date not null,
  equipe_id                uuid references pepday.equipes (id) on delete set null,
  quart_id                 uuid references pepday.quarts (id) on delete set null,
  titre                    text not null default '',
  description              text not null default '',
  meteo_conditions         text,
  meteo_temp_min           numeric(5,1),
  meteo_temp_max           numeric(5,1),
  meteo_precipitations_mm  numeric(6,1),
  meteo_vent               text,
  contremaitre_id          uuid references pepday.membres (id) on delete set null,
  etape                    smallint not null default 1 check (etape between 1 and 6),
  abandonne                boolean not null default false,
  abandonne_le             timestamptz,
  abandonne_raison         text,
  created_by               uuid references pepday.membres (id) on delete set null,
  created_at               timestamptz not null default now(),
  updated_at               timestamptz not null default now(),
  confirme_par_id          uuid references pepday.membres (id) on delete set null,
  confirme_par_nom         text,
  confirme_le              timestamptz,
  ref_civalgo              text,
  -- « À planifier » : seulement au dispatch. Au-delà, un projet est requis.
  check (projet_id is not null or etape = 1)
);
create index if not exists rapports_projet_date on pepday.rapports (projet_id, date);
create index if not exists rapports_equipe_date on pepday.rapports (equipe_id, date);
create index if not exists rapports_etape on pepday.rapports (etape) where not abandonne;
create index if not exists rapports_contremaitre on pepday.rapports (contremaitre_id);
create index if not exists rapports_ref_civalgo on pepday.rapports (ref_civalgo);

-- Ressources ajoutées à la volée sur un rapport, hors catalogue. Liées au
-- rapport, pas au catalogue; le bureau les régularise (regularise_ref_id).
create table if not exists pepday.ressources_provisoires (
  id                  uuid primary key default gen_random_uuid(),
  rapport_id          uuid not null references pepday.rapports (id) on delete cascade,
  categorie           text not null check (categorie in ('main_oeuvre','equipement')),
  nom                 text not null,
  type                text,
  regularise_ref_id   uuid,                 -- employé ou équipement du catalogue, selon la catégorie
  regularise_le       timestamptz,
  regularise_par_nom  text,
  created_by          uuid references pepday.membres (id) on delete set null,
  created_at          timestamptz not null default now()
);
create index if not exists ressources_provisoires_rapport on pepday.ressources_provisoires (rapport_id);

-- Une ligne de cost. Le taux est COPIÉ ici à la saisie (gel du taux).
create table if not exists pepday.lignes (
  id                       uuid primary key default gen_random_uuid(),
  rapport_id               uuid not null references pepday.rapports (id) on delete cascade,
  categorie                text not null check (categorie in ('main_oeuvre','equipement','materiau','sous_traitant')),
  ref_id                   uuid,
  libelle                  text not null,
  detail                   text not null default '',
  quantite                 numeric(12,3) not null default 0 check (quantite >= 0),
  quantite_supp            numeric(12,3) check (quantite_supp >= 0),
  unite                    text,
  taux                     numeric(12,4) not null default 0 check (taux >= 0),
  taux_supp                numeric(12,4) check (taux_supp >= 0),
  taux_preset              numeric(12,4),
  taux_supp_preset         numeric(12,4),
  taux_annee               integer,
  taux_source              text not null default 'preset' check (taux_source in ('preset','custom','manuel')),
  taux_preset_id           uuid references pepday.taux (id) on delete set null,
  custom_raison            text,
  custom_par_id            uuid references pepday.membres (id) on delete set null,
  custom_par_nom           text,
  custom_le                timestamptz,
  organisation_id          uuid references pepday.organisations (id) on delete set null,   -- fournisseur d'un matériau
  sous_tache_id            uuid references pepday.sous_taches (id) on delete set null,
  prime_id                 uuid references pepday.primes (id) on delete restrict,
  parent_ligne_id          uuid references pepday.lignes (id) on delete cascade,          -- la prime suit l'employé
  ressource_provisoire_id  uuid references pepday.ressources_provisoires (id) on delete cascade,
  created_by               uuid references pepday.membres (id) on delete set null,
  created_at               timestamptz not null default now(),
  montant                  numeric(14,2) generated always as
                           (round(quantite * taux + coalesce(quantite_supp, 0) * coalesce(taux_supp, 0), 2)) stored,
  check (taux_source <> 'custom' or (custom_raison is not null and length(trim(custom_raison)) > 0)),
  check (prime_id is null or (categorie = 'main_oeuvre' and parent_ligne_id is not null))
);
create index if not exists lignes_rapport on pepday.lignes (rapport_id);
create index if not exists lignes_ref on pepday.lignes (categorie, ref_id);
create index if not exists lignes_parent on pepday.lignes (parent_ligne_id) where parent_ligne_id is not null;

-- Activités du rapport : les sous-tâches travaillées et la quantité réalisée.
create table if not exists pepday.activites (
  id                 uuid primary key default gen_random_uuid(),
  rapport_id         uuid not null references pepday.rapports (id) on delete cascade,
  sous_tache_id      uuid not null references pepday.sous_taches (id) on delete restrict,
  quantite_realisee  numeric(12,3) check (quantite_realisee >= 0),
  unite              text,
  note               text not null default '',
  created_by         uuid references pepday.membres (id) on delete set null,
  created_at         timestamptz not null default now(),
  unique (rapport_id, sous_tache_id)
);

create table if not exists pepday.photos (
  id          uuid primary key default gen_random_uuid(),
  rapport_id  uuid not null references pepday.rapports (id) on delete cascade,
  chemin      text not null,
  legende     text not null default '',
  prise_le    timestamptz,
  created_by  uuid references pepday.membres (id) on delete set null,
  created_at  timestamptz not null default now()
);
create index if not exists photos_rapport on pepday.photos (rapport_id);

create table if not exists pepday.commentaires (
  id                   uuid primary key default gen_random_uuid(),
  rapport_id           uuid not null references pepday.rapports (id) on delete cascade,
  auteur_id            uuid references pepday.membres (id) on delete set null,
  auteur_nom           text not null,
  texte                text not null check (length(trim(texte)) > 0),
  lecture_obligatoire  boolean not null default false,
  lu_par_id            uuid references pepday.membres (id) on delete set null,
  lu_par_nom           text,
  lu_le                timestamptz,
  created_at           timestamptz not null default now()
);
create index if not exists commentaires_rapport on pepday.commentaires (rapport_id);
create index if not exists commentaires_flags on pepday.commentaires (rapport_id) where lecture_obligatoire and lu_le is null;

create table if not exists pepday.historique (
  id           uuid primary key default gen_random_uuid(),
  rapport_id   uuid not null references pepday.rapports (id) on delete cascade,
  de_etape     smallint,
  a_etape      smallint not null,
  action       text not null check (action in ('creer','avancer','renvoyer','abandonner','reactiver')),
  commentaire  text not null default '',
  par_id       uuid references pepday.membres (id) on delete set null,
  par_nom      text not null default '',
  le           timestamptz not null default now()
);
create index if not exists historique_rapport on pepday.historique (rapport_id, le);

-- Trajets. points = [{ "type": "projet"|"organisation", "ref_id": "<uuid>" }, …]
create table if not exists pepday.trajets (
  id          uuid primary key default gen_random_uuid(),
  nom         text not null,
  projet_id   uuid references pepday.projets (id) on delete set null,
  points      jsonb not null default '[]'::jsonb check (jsonb_typeof(points) = 'array'),
  notes       text not null default '',
  created_by  uuid references pepday.membres (id) on delete set null,
  created_at  timestamptz not null default now()
);
