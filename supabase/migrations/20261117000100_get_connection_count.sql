-- Mirror the existing public.get_connection_count(target_profile_id uuid) RPC
-- so the repository matches the live Supabase schema. The function already
-- exists in the database; this migration keeps it in version control.
create or replace function public.get_connection_count(target_profile_id uuid)
returns integer
language sql
stable
as $$
  select count(*)::integer
  from public.connection_requests
  where status = 'accepted'
    and (sender_id = target_profile_id or recipient_id = target_profile_id);
$$;