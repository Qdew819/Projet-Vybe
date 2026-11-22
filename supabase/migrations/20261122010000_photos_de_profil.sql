-- Photos de profil (page des paramètres, lib/avatar.ts).
-- Espace de stockage public « avatars » : chaque personne a un dossier à son identifiant
-- et ne peut écrire que dans le sien. Tout le monde peut voir les photos (adresse publique).
-- À lancer dans l'éditeur SQL de Supabase. Sans risque si c'est déjà en place.

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('avatars', 'avatars', true, 2097152, array['image/jpeg'])
on conflict (id) do nothing;

-- Lire son propre dossier (nécessaire pour remplacer une photo existante)
drop policy if exists "Avatars : lire son dossier" on storage.objects;
create policy "Avatars : lire son dossier" on storage.objects
  for select to authenticated
  using (bucket_id = 'avatars' and (storage.foldername(name))[1] = (select auth.uid())::text);

-- Envoyer une photo dans son propre dossier
drop policy if exists "Avatars : envoyer dans son dossier" on storage.objects;
create policy "Avatars : envoyer dans son dossier" on storage.objects
  for insert to authenticated
  with check (bucket_id = 'avatars' and (storage.foldername(name))[1] = (select auth.uid())::text);

-- Remplacer sa photo
drop policy if exists "Avatars : remplacer dans son dossier" on storage.objects;
create policy "Avatars : remplacer dans son dossier" on storage.objects
  for update to authenticated
  using (bucket_id = 'avatars' and (storage.foldername(name))[1] = (select auth.uid())::text)
  with check (bucket_id = 'avatars' and (storage.foldername(name))[1] = (select auth.uid())::text);

-- Supprimer sa photo
drop policy if exists "Avatars : supprimer dans son dossier" on storage.objects;
create policy "Avatars : supprimer dans son dossier" on storage.objects
  for delete to authenticated
  using (bucket_id = 'avatars' and (storage.foldername(name))[1] = (select auth.uid())::text);
