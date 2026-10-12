-- ===========================================================================
-- PEPday — 003 : STOCKAGE DES PHOTOS ET DES DOCUMENTS
--
-- Deux buckets PRIVÉS (aucune adresse publique) : l'app affiche les fichiers
-- par des liens signés valides une heure (createSignedUrl).
--   pepday-photos     <projet_id>/<rapport_id>/<horodatage>-<nom>.jpg
--   pepday-documents  <projet_id>/<horodatage>-<nom>
--
-- Les règles portent sur l'accès à l'app et le rôle. Le contrôle fin (qui
-- peut ajouter une photo à QUEL rapport) est fait sur la table pepday.photos :
-- un fichier téléversé sans rangée dans pepday.photos n'apparaît nulle part.
-- ===========================================================================

insert into storage.buckets (id, name, public, file_size_limit)
values ('pepday-photos', 'pepday-photos', false, 20971520),        -- 20 Mo
       ('pepday-documents', 'pepday-documents', false, 26214400)   -- 25 Mo
on conflict (id) do nothing;

drop policy if exists "pepday lecture" on storage.objects;
create policy "pepday lecture" on storage.objects for select to authenticated
  using (bucket_id in ('pepday-photos', 'pepday-documents') and pepday.a_acces());

drop policy if exists "pepday photos ajout" on storage.objects;
create policy "pepday photos ajout" on storage.objects for insert to authenticated
  with check (bucket_id = 'pepday-photos' and pepday.a_acces());

drop policy if exists "pepday photos suppression" on storage.objects;
create policy "pepday photos suppression" on storage.objects for delete to authenticated
  using (bucket_id = 'pepday-photos' and pepday.a_acces() and owner_id = auth.uid()::text);

drop policy if exists "pepday documents ajout" on storage.objects;
create policy "pepday documents ajout" on storage.objects for insert to authenticated
  with check (bucket_id = 'pepday-documents' and pepday.peut_gerer_projets());

drop policy if exists "pepday documents suppression" on storage.objects;
create policy "pepday documents suppression" on storage.objects for delete to authenticated
  using (bucket_id = 'pepday-documents' and pepday.peut_gerer_projets());
