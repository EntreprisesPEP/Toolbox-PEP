-- ===========================================================================
-- PEPday RV02 — 002 : RÈGLES (rôles, RLS, gel des taux, verrou, transitions)
--
-- C'est la base qui a le dernier mot. L'interface (lib/pepday/workflow.js)
-- applique les mêmes règles pour ne pas proposer ce qui serait refusé ici.
--
-- Qui entre : une session Toolbox ET l'accès à l'app « pepday »
-- (public.pep_user_apps) ou le rôle admin du Toolbox (public.pep_user_roles).
-- Ce qu'on y fait : les rôles de pepday.membres.
-- Le directeur construction et les admins du Toolbox agissent à toutes les
-- étapes (remplacements, vacances).
-- ===========================================================================

-- ---------------------------------------------------------------------------
-- 1. Fonctions d'identité et de rôle
--    SECURITY DEFINER : elles lisent membres et les tables du Toolbox sans
--    repasser par les règles RLS (sinon une règle sur membres qui appelle une
--    fonction qui lit membres tournerait en rond).
-- ---------------------------------------------------------------------------
create or replace function pepday.est_admin_toolbox() returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.pep_user_roles where user_id = auth.uid() and role = 'admin');
$$;

create or replace function pepday.a_acces() returns boolean
language sql stable security definer set search_path = '' as $$
  select auth.uid() is not null and (
    pepday.est_admin_toolbox()
    or exists (select 1 from public.pep_user_apps where user_id = auth.uid() and app_slug = 'pepday')
  );
$$;

create or replace function pepday.mon_membre_id() returns uuid
language sql stable security definer set search_path = '' as $$
  select m.id from pepday.membres m where m.user_id = auth.uid() and m.actif limit 1;
$$;

create or replace function pepday.a_role(p_role text) returns boolean
language sql stable security definer set search_path = '' as $$
  select pepday.a_acces() and exists (
    select 1 from pepday.membres m where m.user_id = auth.uid() and m.actif and p_role = any (m.roles)
  );
$$;

create or replace function pepday.est_superviseur() returns boolean
language sql stable security definer set search_path = '' as $$
  select pepday.a_acces() and (pepday.est_admin_toolbox() or pepday.a_role('directeur'));
$$;

-- Tous les rôles sauf « contremaître seul » voient tous les rapports.
create or replace function pepday.voit_tout() returns boolean
language sql stable security definer set search_path = '' as $$
  select pepday.est_superviseur() or exists (
    select 1 from pepday.membres m
    where m.user_id = auth.uid() and m.actif and pepday.a_acces()
      and exists (select 1 from unnest(m.roles) r where r <> 'contremaitre')
  );
$$;

create or replace function pepday.peut_gerer_projets() returns boolean
language sql stable security definer set search_path = '' as $$
  select pepday.est_superviseur() or pepday.a_role('charge_projet') or pepday.a_role('coordonnateur');
$$;

create or replace function pepday.peut_gerer_taux() returns boolean
language sql stable security definer set search_path = '' as $$
  select pepday.est_superviseur() or pepday.a_role('coordonnateur');
$$;

create or replace function pepday.peut_gerer_repertoires() returns boolean
language sql stable security definer set search_path = '' as $$
  select pepday.est_superviseur() or pepday.a_role('coordonnateur') or pepday.a_role('charge_projet') or pepday.a_role('dispatch');
$$;

-- ---------------------------------------------------------------------------
-- 2. Règles d'un rapport (miroir de workflow.js)
-- ---------------------------------------------------------------------------
create or replace function pepday.peut_voir_rapport(p_rapport_id uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from pepday.rapports r
    where r.id = p_rapport_id
      and (pepday.voit_tout()
           or (pepday.a_role('contremaitre') and r.contremaitre_id = pepday.mon_membre_id() and r.etape >= 2))
  );
$$;

create or replace function pepday.est_charge_du_projet(p_projet_id uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select pepday.est_superviseur() or (
    pepday.a_role('charge_projet') and exists (
      select 1 from pepday.projets p
      where p.id = p_projet_id and (p.charge_projet_id is null or p.charge_projet_id = pepday.mon_membre_id())
    )
  );
$$;

-- La personne peut-elle faire avancer ou renvoyer le rapport à son étape ?
create or replace function pepday.peut_agir(p_rapport_id uuid) returns boolean
language plpgsql stable security definer set search_path = '' as $$
declare
  r   pepday.rapports;
  p   pepday.projets;
  moi uuid := pepday.mon_membre_id();
begin
  select * into r from pepday.rapports where id = p_rapport_id;
  if not found or r.etape >= 6 or r.abandonne then return false; end if;
  if pepday.est_superviseur() then return true; end if;
  select * into p from pepday.projets where id = r.projet_id;
  return coalesce(case r.etape
    when 1 then pepday.a_role('dispatch')
    when 2 then pepday.a_role('contremaitre') and r.contremaitre_id = moi
    when 3 then pepday.a_role('surintendant') and (p.surintendant_id is null or p.surintendant_id = moi)
    when 4 then pepday.a_role('coordonnateur') and (p.coordonnateur_id is null or p.coordonnateur_id = moi)
    when 5 then pepday.a_role('charge_projet') and (p.charge_projet_id is null or p.charge_projet_id = moi)
    else false
  end, false);
end $$;

-- Ce que l'étape permet de modifier. p_droit :
--   entete, contenu, lignes_ajout, lignes_qte, lignes_suppr, taux_custom,
--   photos, commentaires, flag, accuser, supprimer, quart, abandonner
create or replace function pepday.droit(p_rapport_id uuid, p_droit text) returns boolean
language plpgsql stable security definer set search_path = '' as $$
declare
  r pepday.rapports;
begin
  select * into r from pepday.rapports where id = p_rapport_id;
  if not found or r.etape >= 6 or r.abandonne or not pepday.peut_voir_rapport(p_rapport_id) then return false; end if;

  if p_droit = 'commentaires' then return true; end if;
  if p_droit = 'abandonner' then
    return r.etape <= 2 and (pepday.est_superviseur() or pepday.a_role('dispatch'));
  end if;
  if p_droit = 'flag' then
    return pepday.est_superviseur() or (pepday.a_role('contremaitre') and r.contremaitre_id = pepday.mon_membre_id());
  end if;
  if p_droit = 'accuser' then return pepday.est_charge_du_projet(r.projet_id); end if;

  if not pepday.peut_agir(p_rapport_id) then return false; end if;
  return case r.etape
    when 1 then p_droit in ('entete','contenu','quart','lignes_ajout','lignes_qte','lignes_suppr','photos','supprimer')
    when 2 then p_droit in ('contenu','quart','lignes_ajout','lignes_qte','lignes_suppr','photos')
    when 3 then p_droit in ('lignes_ajout','lignes_qte','lignes_suppr','taux_custom')
    when 4 then p_droit in ('lignes_ajout','lignes_qte','lignes_suppr','taux_custom')
    when 5 then p_droit in ('taux_custom')
    else false
  end;
end $$;

-- ---------------------------------------------------------------------------
-- 3. Déclencheurs
-- ---------------------------------------------------------------------------

-- Création d'un rapport : toujours à l'étape 1, au nom de la personne.
create or replace function pepday.avant_insertion_rapport() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  new.etape := 1;
  new.created_by := pepday.mon_membre_id();
  new.created_at := now();
  new.updated_at := now();
  new.confirme_par_id := null;
  new.confirme_par_nom := null;
  new.confirme_le := null;
  new.abandonne := false;
  new.abandonne_le := null;
  new.abandonne_raison := null;
  return new;
end $$;

-- La création est la première ligne de l'historique.
create or replace function pepday.historique_creation() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  insert into pepday.historique (rapport_id, de_etape, a_etape, action, par_id, par_nom)
  values (new.id, null, 1, 'creer', new.created_by,
          coalesce((select nom from pepday.membres where id = new.created_by), ''));
  return new;
end $$;

-- Modification d'un rapport : verrou, étape intouchable hors transition,
-- et colonnes permises selon l'étape.
create or replace function pepday.avant_modification_rapport() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  en_transition boolean := coalesce(current_setting('pepday.transition', true), '') = 'on';
begin
  if old.etape >= 6 then
    raise exception 'Ce rapport est verrouillé : le cost final est confirmé.';
  end if;
  if not en_transition then
    if old.abandonne then
      raise exception 'Ce rapport est abandonné : un directeur doit le réactiver avant toute modification.';
    end if;
    if new.etape is distinct from old.etape
       or new.confirme_par_id is distinct from old.confirme_par_id
       or new.confirme_le is distinct from old.confirme_le
       or new.abandonne is distinct from old.abandonne
       or new.abandonne_le is distinct from old.abandonne_le
       or new.abandonne_raison is distinct from old.abandonne_raison then
      raise exception 'L''étape et l''abandon d''un rapport changent seulement par une transition (pepday.transition_rapport).';
    end if;
    if (new.projet_id, new.date, new.contremaitre_id, new.equipe_id) is distinct from (old.projet_id, old.date, old.contremaitre_id, old.equipe_id)
       and not pepday.droit(old.id, 'entete') then
      raise exception 'Le projet, la date, l''équipe et le contremaître se modifient seulement à l''étape Dispatch.';
    end if;
    if new.quart_id is distinct from old.quart_id and not pepday.droit(old.id, 'quart') then
      raise exception 'Le quart se modifie seulement aux étapes Dispatch et Contremaître.';
    end if;
    if (new.titre, new.description, new.meteo_conditions, new.meteo_temp_min, new.meteo_temp_max,
        new.meteo_precipitations_mm, new.meteo_vent)
       is distinct from
       (old.titre, old.description, old.meteo_conditions, old.meteo_temp_min, old.meteo_temp_max,
        old.meteo_precipitations_mm, old.meteo_vent)
       and not pepday.droit(old.id, 'contenu') then
      raise exception 'La description et la météo se modifient seulement aux étapes Dispatch et Contremaître.';
    end if;
  end if;
  new.id := old.id;
  new.created_by := old.created_by;
  new.created_at := old.created_at;
  new.updated_at := now();
  return new;
end $$;

-- Un rapport verrouillé ne change plus, ni ses lignes, photos ou commentaires.
create or replace function pepday.verrou_enfant() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  rid uuid := coalesce(new.rapport_id, old.rapport_id);
begin
  -- La régularisation d'une ressource hors catalogue (lien vers sa fiche)
  -- reste permise après le verrou : elle ne change aucun cost.
  if tg_table_name = 'ressources_provisoires' and tg_op = 'UPDATE' then
    if (new.rapport_id, new.categorie, new.nom, new.type) is distinct from (old.rapport_id, old.categorie, old.nom, old.type) then
      raise exception 'Seule la régularisation d''une ressource hors catalogue peut changer.';
    end if;
    return new;
  end if;
  if exists (select 1 from pepday.rapports where id = rid and etape >= 6) then
    raise exception 'Ce rapport est verrouillé : le cost final est confirmé.';
  end if;
  if tg_op = 'UPDATE' and new.rapport_id is distinct from old.rapport_id then
    raise exception 'Une ligne ne change pas de rapport.';
  end if;
  return coalesce(new, old);
end $$;

-- GEL DU TAUX à la saisie d'une ligne : la base va chercher elle-même le
-- preset de l'année du rapport et l'écrit dans la ligne, quoi que le client
-- ait envoyé. S'il n'y a pas de preset, le prix saisi est gardé (« manuel »).
-- Un taux custom ne s'insère pas : il se pose ensuite par une modification,
-- avec sa raison.
create or replace function pepday.figer_taux_ligne() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  v_annee  integer;
  v_preset pepday.taux;
  v_classe uuid;
begin
  select extract(year from date)::integer into v_annee from pepday.rapports where id = new.rapport_id;
  v_preset := null;

  -- Prime : le montant du catalogue est figé dans la ligne, comme un preset.
  if new.prime_id is not null then
    select montant into new.taux from pepday.primes where id = new.prime_id;
    if new.taux is null then raise exception 'Prime introuvable.'; end if;
    if not exists (select 1 from pepday.lignes where id = new.parent_ligne_id and rapport_id = new.rapport_id
                   and categorie = 'main_oeuvre' and prime_id is null) then
      raise exception 'Une prime s''ajoute sous une ligne de main-d''œuvre du même rapport.';
    end if;
    new.taux_preset := new.taux;
    new.taux_supp := 0; new.taux_supp_preset := 0; new.quantite_supp := 0;
    new.taux_source := 'preset'; new.taux_preset_id := null; new.taux_annee := v_annee;
    new.custom_raison := null; new.custom_par_id := null; new.custom_par_nom := null; new.custom_le := null;
    new.created_by := pepday.mon_membre_id();
    new.created_at := now();
    return new;
  end if;

  if new.categorie = 'main_oeuvre' and new.ref_id is not null then
    select * into v_preset from pepday.taux
     where annee = v_annee and categorie = 'main_oeuvre' and ref_type = 'employe' and ref_id = new.ref_id and actif limit 1;
    if v_preset.id is null then
      select metier_id into v_classe from pepday.employes where id = new.ref_id;
      select * into v_preset from pepday.taux
       where annee = v_annee and categorie = 'main_oeuvre' and ref_type = 'metier' and ref_id = v_classe and actif limit 1;
    end if;
  elsif new.categorie in ('equipement','materiau') and new.ref_id is not null then
    select * into v_preset from pepday.taux
     where annee = v_annee and categorie = new.categorie and ref_id = new.ref_id and actif limit 1;
  elsif new.categorie = 'sous_traitant' and new.taux_preset_id is not null then
    -- Un sous-traitant a plusieurs prix : on prend celui que le client a
    -- choisi, s'il correspond bien à ce sous-traitant et à cette année.
    select * into v_preset from pepday.taux
     where id = new.taux_preset_id and annee = v_annee and categorie = 'sous_traitant' and ref_id = new.ref_id and actif;
  end if;

  if v_preset.id is not null then
    new.taux := v_preset.taux;
    new.taux_preset := v_preset.taux;
    new.taux_preset_id := v_preset.id;
    if new.categorie = 'main_oeuvre' then
      new.taux_supp := coalesce(v_preset.taux_supp, round(v_preset.taux * 1.5, 4));
      new.taux_supp_preset := new.taux_supp;
    else
      new.taux_supp := null;
      new.taux_supp_preset := null;
    end if;
    new.taux_source := 'preset';
  else
    new.taux_preset := null;
    new.taux_supp_preset := null;
    new.taux_preset_id := null;
    new.taux_source := 'manuel';
    if new.categorie <> 'main_oeuvre' then new.taux_supp := null; end if;
  end if;

  new.taux_annee := v_annee;
  new.custom_raison := null;
  new.custom_par_id := null;
  new.custom_par_nom := null;
  new.custom_le := null;
  new.created_by := pepday.mon_membre_id();
  new.created_at := now();
  return new;
end $$;

-- Modification d'une ligne : quantités selon l'étape, taux seulement par un
-- taux custom (raison obligatoire, auteur et heure posés ici) ou un retour au
-- preset. Le preset d'origine reste figé dans la ligne.
create or replace function pepday.controle_ligne() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  moi uuid := pepday.mon_membre_id();
begin
  -- Ce qui identifie la ligne et son preset d'origine ne bouge jamais.
  new.categorie := old.categorie;
  new.ref_id := old.ref_id;
  new.taux_preset := old.taux_preset;
  new.taux_supp_preset := old.taux_supp_preset;
  new.taux_preset_id := old.taux_preset_id;
  new.taux_annee := old.taux_annee;
  new.created_by := old.created_by;
  new.created_at := old.created_at;
  new.prime_id := old.prime_id;
  new.parent_ligne_id := old.parent_ligne_id;
  new.ressource_provisoire_id := old.ressource_provisoire_id;

  if (new.quantite, new.quantite_supp, new.detail, new.libelle, new.unite, new.organisation_id, new.sous_tache_id)
     is distinct from (old.quantite, old.quantite_supp, old.detail, old.libelle, old.unite, old.organisation_id, old.sous_tache_id)
     and not pepday.droit(old.rapport_id, 'lignes_qte') then
    raise exception 'Les quantités ne se modifient pas à cette étape.';
  end if;

  if (new.taux, new.taux_supp, new.taux_source, new.custom_raison)
     is distinct from (old.taux, old.taux_supp, old.taux_source, old.custom_raison) then
    if new.taux_source = 'custom' then
      if not pepday.droit(old.rapport_id, 'taux_custom') then
        raise exception 'Un taux custom ne se pose pas à cette étape.';
      end if;
      if new.custom_raison is null or length(trim(new.custom_raison)) = 0 then
        raise exception 'La raison est obligatoire pour un taux custom.';
      end if;
      new.custom_par_id := moi;
      new.custom_par_nom := coalesce((select nom from pepday.membres where id = moi), '');
      new.custom_le := now();
    elsif new.taux_source = 'preset' then
      -- Retour au preset : on remet exactement le taux figé à la saisie.
      if old.taux_preset is null then raise exception 'Cette ligne n''a pas de preset.'; end if;
      if not pepday.droit(old.rapport_id, 'taux_custom') then
        raise exception 'Le taux ne se modifie pas à cette étape.';
      end if;
      new.taux := old.taux_preset;
      new.taux_supp := old.taux_supp_preset;
      new.custom_raison := null; new.custom_par_id := null; new.custom_par_nom := null; new.custom_le := null;
    elsif new.taux_source = 'manuel' then
      -- Prix saisi d'un élément sans preset : corrigeable avec les quantités.
      if old.taux_preset is not null then raise exception 'Cette ligne a un preset : utilise un taux custom.'; end if;
      if not (pepday.droit(old.rapport_id, 'lignes_qte') or pepday.droit(old.rapport_id, 'taux_custom')) then
        raise exception 'Le prix ne se modifie pas à cette étape.';
      end if;
      new.custom_raison := null; new.custom_par_id := null; new.custom_par_nom := null; new.custom_le := null;
    end if;
  end if;
  return new;
end $$;

create or replace function pepday.maj_updated_at() returns trigger
language plpgsql as $$
begin
  new.updated_at := now();
  return new;
end $$;

drop trigger if exists t_rapports_insert on pepday.rapports;
create trigger t_rapports_insert before insert on pepday.rapports
  for each row execute function pepday.avant_insertion_rapport();
drop trigger if exists t_rapports_historique on pepday.rapports;
create trigger t_rapports_historique after insert on pepday.rapports
  for each row execute function pepday.historique_creation();
drop trigger if exists t_rapports_update on pepday.rapports;
create trigger t_rapports_update before update on pepday.rapports
  for each row execute function pepday.avant_modification_rapport();

drop trigger if exists t_lignes_verrou on pepday.lignes;
create trigger t_lignes_verrou before insert or update or delete on pepday.lignes
  for each row execute function pepday.verrou_enfant();
drop trigger if exists t_lignes_taux on pepday.lignes;
create trigger t_lignes_taux before insert on pepday.lignes
  for each row execute function pepday.figer_taux_ligne();
drop trigger if exists t_lignes_controle on pepday.lignes;
create trigger t_lignes_controle before update on pepday.lignes
  for each row execute function pepday.controle_ligne();

drop trigger if exists t_photos_verrou on pepday.photos;
create trigger t_photos_verrou before insert or update or delete on pepday.photos
  for each row execute function pepday.verrou_enfant();
drop trigger if exists t_commentaires_verrou on pepday.commentaires;
create trigger t_commentaires_verrou before insert or update or delete on pepday.commentaires
  for each row execute function pepday.verrou_enfant();

drop trigger if exists t_projets_maj on pepday.projets;
create trigger t_projets_maj before update on pepday.projets
  for each row execute function pepday.maj_updated_at();
drop trigger if exists t_taux_maj on pepday.taux;
create trigger t_taux_maj before update on pepday.taux
  for each row execute function pepday.maj_updated_at();

-- ---------------------------------------------------------------------------
-- 4. Fonctions appelées par l'app (rpc)
-- ---------------------------------------------------------------------------

-- Avancer ou renvoyer un rapport, avec l'historique horodaté.
create or replace function pepday.transition_rapport(p_rapport_id uuid, p_action text, p_commentaire text default null)
returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  r       pepday.rapports;
  h       pepday.historique;
  moi     uuid := pepday.mon_membre_id();
  moi_nom text := coalesce((select nom from pepday.membres where id = pepday.mon_membre_id()), '');
  v_a     smallint;
  v_flags integer;
begin
  select * into r from pepday.rapports where id = p_rapport_id for update;
  if not found then raise exception 'Rapport introuvable.'; end if;

  -- RV02 : abandon (rapport jamais soumis) et réactivation.
  if p_action in ('abandonner', 'reactiver') then
    if p_action = 'abandonner' then
      if not pepday.droit(p_rapport_id, 'abandonner') then
        raise exception 'Seul le dispatch peut abandonner un rapport, et seulement avant sa soumission.';
      end if;
      if p_commentaire is null or length(trim(p_commentaire)) = 0 then
        raise exception 'Indique pourquoi le rapport est abandonné.';
      end if;
    else
      if not r.abandonne then raise exception 'Ce rapport n''est pas abandonné.'; end if;
      if not pepday.est_superviseur() then raise exception 'Seul un directeur peut réactiver un rapport abandonné.'; end if;
    end if;
    perform set_config('pepday.transition', 'on', true);
    update pepday.rapports
       set abandonne = (p_action = 'abandonner'),
           abandonne_le = case when p_action = 'abandonner' then now() end,
           abandonne_raison = case when p_action = 'abandonner' then trim(p_commentaire) end
     where id = p_rapport_id
    returning * into r;
    perform set_config('pepday.transition', 'off', true);
    insert into pepday.historique (rapport_id, de_etape, a_etape, action, commentaire, par_id, par_nom)
    values (p_rapport_id, r.etape, r.etape, p_action, coalesce(trim(p_commentaire), ''), moi, moi_nom)
    returning * into h;
    return jsonb_build_object('rapport', to_jsonb(r), 'historique', to_jsonb(h));
  end if;

  if r.abandonne then raise exception 'Ce rapport est abandonné.'; end if;
  if r.etape >= 6 then raise exception 'Ce rapport est verrouillé.'; end if;
  if not pepday.peut_agir(p_rapport_id) then raise exception 'Cette étape ne t''est pas assignée.'; end if;

  if p_action = 'renvoyer' then
    if r.etape < 2 then raise exception 'Un rapport au dispatch ne peut pas être renvoyé plus loin.'; end if;
    if p_commentaire is null or length(trim(p_commentaire)) = 0 then
      raise exception 'Un commentaire est obligatoire pour renvoyer un rapport.';
    end if;
    v_a := r.etape - 1;
  elsif p_action = 'avancer' then
    if r.etape = 1 and r.contremaitre_id is null then raise exception 'Assigne un contremaître avant de transmettre.'; end if;
    if r.etape = 1 and r.projet_id is null then raise exception 'Choisis le projet avant de transmettre (rapport « À planifier »).'; end if;
    if r.etape = 5 then
      select count(*) into v_flags from pepday.commentaires
       where rapport_id = p_rapport_id and lecture_obligatoire and lu_le is null;
      if v_flags > 0 then
        raise exception 'Impossible de confirmer le cost final : % commentaire(s) « Lecture obligatoire » non lu(s).', v_flags;
      end if;
    end if;
    v_a := r.etape + 1;
  else
    raise exception 'Action inconnue : %', p_action;
  end if;

  perform set_config('pepday.transition', 'on', true);
  update pepday.rapports
     set etape = v_a,
         confirme_par_id  = case when v_a = 6 then moi else confirme_par_id end,
         confirme_par_nom = case when v_a = 6 then moi_nom else confirme_par_nom end,
         confirme_le      = case when v_a = 6 then now() else confirme_le end
   where id = p_rapport_id
  returning * into r;
  perform set_config('pepday.transition', 'off', true);

  insert into pepday.historique (rapport_id, de_etape, a_etape, action, commentaire, par_id, par_nom)
  values (p_rapport_id, v_a + case when p_action = 'renvoyer' then 1 else -1 end, v_a, p_action,
          coalesce(trim(p_commentaire), ''), moi, moi_nom)
  returning * into h;

  return jsonb_build_object('rapport', to_jsonb(r), 'historique', to_jsonb(h));
end $$;

-- Accusé de lecture d'un commentaire « Lecture obligatoire », horodaté.
create or replace function pepday.accuser_lecture(p_commentaire_id uuid) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  c   pepday.commentaires;
  moi uuid := pepday.mon_membre_id();
begin
  select * into c from pepday.commentaires where id = p_commentaire_id for update;
  if not found then raise exception 'Commentaire introuvable.'; end if;
  if not pepday.droit(c.rapport_id, 'accuser') then
    raise exception 'Seul le chargé de projet peut accuser la lecture.';
  end if;
  if c.lu_le is null then
    update pepday.commentaires
       set lu_par_id = moi,
           lu_par_nom = coalesce((select nom from pepday.membres where id = moi), ''),
           lu_le = now()
     where id = p_commentaire_id
    returning * into c;
  end if;
  return to_jsonb(c);
end $$;

-- Rattache le compte Toolbox à sa fiche pepday.membres (par courriel), une
-- seule fois, et renvoie la fiche (ou null si la personne n'est pas dans
-- l'équipe PEPday : elle peut alors consulter sans rôle).
create or replace function pepday.mon_membre() returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  m          pepday.membres;
  v_courriel text := lower(coalesce(auth.jwt() ->> 'email', ''));
begin
  if not pepday.a_acces() then return null; end if;
  select * into m from pepday.membres where user_id = auth.uid();
  if not found and v_courriel <> '' then
    update pepday.membres set user_id = auth.uid()
     where courriel = v_courriel and user_id is null
    returning * into m;
  end if;
  if m.id is null then return null; end if;
  return to_jsonb(m);
end $$;

-- RV02 — Organisations : nom normalisé (unicité « PEP Pavage » = « pep  pavage »).
create or replace function pepday.normaliser_organisation() returns trigger
language plpgsql as $$
begin
  new.nom := trim(new.nom);
  new.nom_normalise := pepday.normaliser(new.nom);
  return new;
end $$;
drop trigger if exists t_organisations_nom on pepday.organisations;
create trigger t_organisations_nom before insert or update on pepday.organisations
  for each row execute function pepday.normaliser_organisation();

drop trigger if exists t_activites_verrou on pepday.activites;
create trigger t_activites_verrou before insert or update or delete on pepday.activites
  for each row execute function pepday.verrou_enfant();
drop trigger if exists t_ressources_verrou on pepday.ressources_provisoires;
create trigger t_ressources_verrou before insert or update or delete on pepday.ressources_provisoires
  for each row execute function pepday.verrou_enfant();

-- RV02 — Fermeture automatique des rapports jamais remplis : étapes 1 et 2,
-- aucune ligne, date plus vieille que le délai (pepday.parametres,
-- jours_avant_abandon, 14 par défaut). Renvoie le nombre de rapports fermés.
-- À lancer chaque nuit (voir IMPORT-TOOLBOX.md : pg_cron ou cron Vercel).
create or replace function pepday.fermer_rapports_abandonnes() returns integer
language plpgsql security definer set search_path = '' as $$
declare
  v_jours integer := coalesce((select (valeur #>> '{}')::integer from pepday.parametres where id = 'jours_avant_abandon'), 14);
  v_raison text := format('Fermeture automatique : jamais rempli après %s jours', v_jours);
  v_n integer;
begin
  perform set_config('pepday.transition', 'on', true);
  with fermes as (
    update pepday.rapports r
       set abandonne = true, abandonne_le = now(), abandonne_raison = v_raison
     where not r.abandonne and r.etape <= 2 and r.date < current_date - v_jours
       and not exists (select 1 from pepday.lignes l where l.rapport_id = r.id)
    returning r.id, r.etape
  ), hist as (
    insert into pepday.historique (rapport_id, de_etape, a_etape, action, commentaire, par_id, par_nom)
    select id, etape, etape, 'abandonner', v_raison, null, 'Fermeture automatique' from fermes
    returning 1
  )
  select count(*) into v_n from hist;
  perform set_config('pepday.transition', 'off', true);
  return v_n;
end $$;

-- ---------------------------------------------------------------------------
-- 5. Droits d'accès et règles RLS
-- ---------------------------------------------------------------------------
revoke all on schema pepday from anon;
grant usage on schema pepday to authenticated, service_role;
grant select, insert, update, delete on all tables in schema pepday to authenticated;
grant all on all tables in schema pepday to service_role;
grant usage, select on all sequences in schema pepday to authenticated, service_role;
revoke insert, update, delete on pepday.historique from authenticated;
revoke all on all functions in schema pepday from public, anon;
grant execute on all functions in schema pepday to authenticated, service_role;
-- La fermeture automatique tourne la nuit (pg_cron, service_role), pas depuis l'app.
revoke execute on function pepday.fermer_rapports_abandonnes() from authenticated;

do $$
declare t text;
begin
  foreach t in array array['membres','quarts','metiers','taches','sous_taches','parametres','organisations','equipes',
                           'employes','equipements','materiaux','materiau_organisations','primes',
                           'projets','budgets','documents','taux','rapports','ressources_provisoires','lignes',
                           'activites','photos','commentaires','historique','trajets']
  loop
    execute format('alter table pepday.%I enable row level security', t);
  end loop;
end $$;

-- Lecture ouverte à toute personne qui a accès à l'app ; écriture selon le rôle.
do $$
declare
  t text;
  regle text;
begin
  for t, regle in
    select * from (values
      ('membres', 'pepday.est_superviseur()'),
      ('parametres', 'pepday.est_superviseur()'),
      ('quarts', 'pepday.peut_gerer_repertoires()'),
      ('metiers', 'pepday.peut_gerer_repertoires()'),
      ('taches', 'pepday.est_superviseur()'),
      ('sous_taches', 'pepday.est_superviseur()'),
      ('organisations', 'pepday.peut_gerer_repertoires()'),
      ('equipes', 'pepday.peut_gerer_repertoires()'),
      ('employes', 'pepday.peut_gerer_repertoires()'),
      ('equipements', 'pepday.peut_gerer_repertoires()'),
      ('materiaux', 'pepday.peut_gerer_repertoires()'),
      ('materiau_organisations', 'pepday.peut_gerer_repertoires()'),
      ('primes', 'pepday.peut_gerer_taux()'),
      ('trajets', 'pepday.peut_gerer_repertoires()'),
      ('projets', 'pepday.peut_gerer_projets()'),
      ('budgets', 'pepday.peut_gerer_projets()'),
      ('documents', 'pepday.peut_gerer_projets()'),
      ('taux', 'pepday.peut_gerer_taux()')
    ) as v(t, regle)
  loop
    execute format('drop policy if exists lecture on pepday.%I', t);
    execute format('create policy lecture on pepday.%I for select to authenticated using (pepday.a_acces())', t);
    execute format('drop policy if exists ajout on pepday.%I', t);
    execute format('create policy ajout on pepday.%I for insert to authenticated with check (%s)', t, regle);
    execute format('drop policy if exists modification on pepday.%I', t);
    execute format('create policy modification on pepday.%I for update to authenticated using (%s) with check (%s)', t, regle, regle);
    execute format('drop policy if exists suppression on pepday.%I', t);
    execute format('create policy suppression on pepday.%I for delete to authenticated using (%s)', t, regle);
  end loop;
end $$;

-- Rapports : le contremaître ne voit que les siens (à partir de l'étape 2).
drop policy if exists lecture on pepday.rapports;
create policy lecture on pepday.rapports for select to authenticated using (
  pepday.voit_tout()
  or (pepday.a_role('contremaitre') and contremaitre_id = pepday.mon_membre_id() and etape >= 2)
);
drop policy if exists ajout on pepday.rapports;
create policy ajout on pepday.rapports for insert to authenticated
  with check (pepday.a_role('dispatch') or pepday.est_superviseur());
-- Le détail colonne par colonne est vérifié par le déclencheur
-- avant_modification_rapport.
drop policy if exists modification on pepday.rapports;
create policy modification on pepday.rapports for update to authenticated
  using (pepday.droit(id, 'entete') or pepday.droit(id, 'contenu'))
  with check (true);
drop policy if exists suppression on pepday.rapports;
create policy suppression on pepday.rapports for delete to authenticated using (pepday.droit(id, 'supprimer'));

-- Lignes de cost.
drop policy if exists lecture on pepday.lignes;
create policy lecture on pepday.lignes for select to authenticated using (pepday.peut_voir_rapport(rapport_id));
drop policy if exists ajout on pepday.lignes;
create policy ajout on pepday.lignes for insert to authenticated with check (pepday.droit(rapport_id, 'lignes_ajout'));
drop policy if exists modification on pepday.lignes;
create policy modification on pepday.lignes for update to authenticated
  using (pepday.droit(rapport_id, 'lignes_qte') or pepday.droit(rapport_id, 'taux_custom'))
  with check (true);
drop policy if exists suppression on pepday.lignes;
create policy suppression on pepday.lignes for delete to authenticated using (pepday.droit(rapport_id, 'lignes_suppr'));

-- Photos.
drop policy if exists lecture on pepday.photos;
create policy lecture on pepday.photos for select to authenticated using (pepday.peut_voir_rapport(rapport_id));
drop policy if exists ajout on pepday.photos;
create policy ajout on pepday.photos for insert to authenticated with check (pepday.droit(rapport_id, 'photos'));
drop policy if exists suppression on pepday.photos;
create policy suppression on pepday.photos for delete to authenticated using (pepday.droit(rapport_id, 'photos'));

-- Commentaires : on écrit en son propre nom; « Lecture obligatoire »
-- seulement pour le contremaître du rapport (ou un superviseur). Pas de
-- modification directe : l'accusé de lecture passe par accuser_lecture().
drop policy if exists lecture on pepday.commentaires;
create policy lecture on pepday.commentaires for select to authenticated using (pepday.peut_voir_rapport(rapport_id));
drop policy if exists ajout on pepday.commentaires;
create policy ajout on pepday.commentaires for insert to authenticated with check (
  pepday.droit(rapport_id, 'commentaires')
  and auteur_id is not distinct from pepday.mon_membre_id()
  and lu_le is null and lu_par_id is null
  and (not lecture_obligatoire or pepday.droit(rapport_id, 'flag'))
);

-- Historique : lecture seulement (écrit par les fonctions ci-dessus).
drop policy if exists lecture on pepday.historique;
create policy lecture on pepday.historique for select to authenticated using (pepday.peut_voir_rapport(rapport_id));

-- RV02 — Activités (sous-tâches et quantités réalisées du rapport).
drop policy if exists lecture on pepday.activites;
create policy lecture on pepday.activites for select to authenticated using (pepday.peut_voir_rapport(rapport_id));
drop policy if exists ajout on pepday.activites;
create policy ajout on pepday.activites for insert to authenticated with check (pepday.droit(rapport_id, 'lignes_ajout') or pepday.droit(rapport_id, 'lignes_qte'));
drop policy if exists modification on pepday.activites;
create policy modification on pepday.activites for update to authenticated
  using (pepday.droit(rapport_id, 'lignes_ajout') or pepday.droit(rapport_id, 'lignes_qte')) with check (true);
drop policy if exists suppression on pepday.activites;
create policy suppression on pepday.activites for delete to authenticated using (pepday.droit(rapport_id, 'lignes_suppr'));

-- RV02 — Ressources hors catalogue : créées avec le rapport, régularisées
-- par le bureau (modification réservée aux gestionnaires des répertoires).
drop policy if exists lecture on pepday.ressources_provisoires;
create policy lecture on pepday.ressources_provisoires for select to authenticated using (pepday.peut_voir_rapport(rapport_id));
drop policy if exists ajout on pepday.ressources_provisoires;
create policy ajout on pepday.ressources_provisoires for insert to authenticated with check (pepday.droit(rapport_id, 'lignes_ajout'));
drop policy if exists modification on pepday.ressources_provisoires;
create policy modification on pepday.ressources_provisoires for update to authenticated
  using (pepday.peut_gerer_repertoires()) with check (pepday.peut_gerer_repertoires());
drop policy if exists suppression on pepday.ressources_provisoires;
create policy suppression on pepday.ressources_provisoires for delete to authenticated using (pepday.droit(rapport_id, 'lignes_suppr'));
