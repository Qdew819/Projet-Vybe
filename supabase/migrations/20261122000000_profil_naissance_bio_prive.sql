-- Colonnes utilisées par la page de création du profil (app/profil/creer/page.tsx).
-- Déjà appliquées sur le projet Supabase actuel le 2026-11-22.
-- À lancer dans l'éditeur SQL de Supabase pour un nouveau projet. Sans risque si les colonnes existent déjà.

alter table public.profiles add column if not exists birth_date date;
alter table public.profiles add column if not exists bio text;
alter table public.profiles add column if not exists is_private boolean not null default false;

-- Demande à Supabase de prendre en compte les nouvelles colonnes tout de suite
notify pgrst, 'reload schema';
