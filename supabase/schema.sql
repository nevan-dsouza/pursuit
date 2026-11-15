-- Already applied to the Supabase project "pursuit" (uxhyrjextnxqbnfrngzk). Kept here for reference.
create table public.user_state (
  user_id uuid primary key references auth.users (id) on delete cascade,
  data jsonb not null default '{}'::jsonb,
  client_id text,
  updated_at timestamptz not null default now()
);
alter table public.user_state enable row level security;
create policy "read own state" on public.user_state for select to authenticated using ((select auth.uid()) = user_id);
create policy "insert own state" on public.user_state for insert to authenticated with check ((select auth.uid()) = user_id);
create policy "update own state" on public.user_state for update to authenticated using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
create policy "delete own state" on public.user_state for delete to authenticated using ((select auth.uid()) = user_id);
alter publication supabase_realtime add table public.user_state;

-- ---------- Shared spaces (already applied) ----------
-- public.spaces(id, name, code unique, owner, data jsonb, version, client_id, updated_at, created_at)
-- public.space_members(space_id, user_id, display_name, joined_at)
-- Rules:
--   * only members can read or save a space; saving uses "where version = <last seen>" so two people
--     can't silently overwrite each other (the app merges and retries)
--   * members can change only the shared document, not the name, code or owner
--   * create_space(p_name) and join_space(p_code) are the only ways to create a space or become a member
--   * a member can remove their own membership (leave); the owner can delete the space
-- The full SQL is in the Supabase migration "create_spaces".
