-- ===========================================================================
-- PEPday RV02 — 005 : SEMENCES (listes de référence)
--
-- FICHIER GÉNÉRÉ par scripts/generer-semences.js à partir de
-- lib/pepday/referentiel.js. Ne pas modifier à la main : modifier la source
-- et régénérer. Rejouable : rien n'est remplacé si la valeur existe déjà.
-- ===========================================================================

-- Quarts (heures_normales informatif : seuil de temps supp. à confirmer).
insert into pepday.quarts (nom, heures_normales, code_paie) values
  ('9h', 9, '9H'),
  ('Pavage 10h', 10, 'PAV10'),
  ('Hors CCQ', null, 'HCCQ'),
  ('Nuit', null, 'NUIT')
on conflict (nom) do nothing;

-- Métiers (liste fermée).
insert into pepday.metiers (nom) values
  ('Administration'),
  ('Arpenteur'),
  ('Chargé de projet'),
  ('Chauffeur / Livreur'),
  ('Chauffeur Balai'),
  ('Opérateur de pelles'),
  ('Manoeuvre spécialisé'),
  ('Signaleurs'),
  ('Mécanicien'),
  ('Chauffeur Semi'),
  ('Chauffeur Fardier'),
  ('Journalier'),
  ('Contremaître'),
  ('Opérateur d’équipement lourd')
on conflict (nom) do nothing;

-- Structure des tâches, reprise telle quelle de Civalgo.
insert into pepday.taches (code, nom, unite) values
  ('100', '1- EXCAVATION', 'h'),
  ('200', '2- GÉNIE CIVIL', 'h'),
  ('300', '3- BORDURE, TROTTOIR', 'h'),
  ('400', '4- PAVAGE', 'h'),
  ('500', '5- AMEN. PAYSAGER', 'h'),
  ('600', '6- PROJETS À TEMPS ET MATÉRIEL', 'h')
on conflict (code) do nothing;

insert into pepday.sous_taches (code, nom, tache_id, unite)
select v.code, v.nom, t.id, v.unite from (values
  ('101', 'Arpentage et implantation', '100', 'h'),
  ('102', 'Décontaminations', '100', 'h'),
  ('103', 'Excavations de masse', '100', 'h'),
  ('104', 'Excavation locale', '100', 'h'),
  ('105', 'Empierrement et grade final', '100', 'h'),
  ('106', 'Remblai extérieur et de dalle tréfonds', '100', 'h'),
  ('107', 'Plomberie et drain français', '100', 'h'),
  ('108', 'Électricités sous-dalle', '100', 'h'),
  ('201', 'Excavation / remblais des tranchées', '200', 'h'),
  ('202', 'Assise et enrobage des conduites', '200', 'h'),
  ('203', 'Installation pluvial / sanitaire / aqueduc', '200', 'h'),
  ('204', 'Installation des regards et puisards', '200', 'h'),
  ('205', 'Bassins de rétention', '200', 'h'),
  ('206', 'Électricité extérieure', '200', 'h'),
  ('207', 'Infrastructure de chaussée', '200', 'h'),
  ('208', 'Coupes de rue', '200', 'h'),
  ('301', 'Préparation de la fondation', '300', 'h'),
  ('302', 'Coffrage', '300', 'h'),
  ('303', 'Coulage du béton', '300', 'h'),
  ('304', 'Décoffrage', '300', 'h'),
  ('305', 'Bordures et Trottoirs - Divers', '300', 'h'),
  ('401', 'Pulvérisation', '400', 'h'),
  ('402', 'Travaux d’empierrement', '400', 'h'),
  ('403', 'Nivellement final de la fondation', '400', 'h'),
  ('404', 'Pose de la couche de base', '400', 'h'),
  ('405', 'Pose de la couche de finition', '400', 'h'),
  ('501', 'Excavation amen. Paysager', '500', 'h'),
  ('502', 'Terrassement & remblais infra.', '500', 'h'),
  ('503', 'Nivellement de finition', '500', 'h'),
  ('504', 'Pose de pavés / blocs / bordures', '500', 'h'),
  ('505', 'Plantation d’arbres et arbustres', '500', 'h'),
  ('506', 'Engazonnement & ensemencement', '500', 'h'),
  ('507', 'Aménagement hardscape', '500', 'h'),
  ('508', 'Aménagement softscape', '500', 'h')
) as v(code, nom, tache_code, unite)
join pepday.taches t on t.code = v.tache_code
on conflict (code) do nothing;

-- Sans code, comme dans Civalgo : clé naturelle = nom + tâche.
insert into pepday.sous_taches (code, nom, tache_id, unite)
select null, 'Travaux à temps et matériel', t.id, null from pepday.taches t
where t.code = '600'
  and not exists (select 1 from pepday.sous_taches s where s.code is null and s.nom = 'Travaux à temps et matériel' and s.tache_id = t.id);

-- Paramètres.
insert into pepday.parametres (id, valeur) values ('jours_avant_abandon', '14'::jsonb)
on conflict (id) do nothing;
