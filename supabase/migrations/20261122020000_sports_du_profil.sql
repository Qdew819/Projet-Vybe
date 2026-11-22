-- Sports du profil (onglets de sports dans les paramètres, lib/sports.ts).
-- Liste ordonnée d'identifiants de sports, ex. {hockey,basketball,soccer}. Le premier est le sport principal.
-- À lancer dans l'éditeur SQL de Supabase. Sans risque si la colonne existe déjà.

alter table public.profiles add column if not exists sports text[] not null default '{}';

-- Demande à Supabase de prendre en compte la nouvelle colonne tout de suite
notify pgrst, 'reload schema';
