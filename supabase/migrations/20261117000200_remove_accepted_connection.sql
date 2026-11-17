-- Mirror the live Supabase grants/policy for removing accepted connections.
-- The database already grants DELETE on public.connection_requests and has a
-- policy "Participants remove accepted connections" (accepted rows only, either
-- participant). This migration keeps that in version control.

grant delete on public.connection_requests to authenticated;

drop policy if exists "Participants remove accepted connections" on public.connection_requests;
create policy "Participants remove accepted connections" on public.connection_requests
  for delete to authenticated
  using (
    status = 'accepted'
    and (
      exists (select 1 from public.profiles p where p.id = sender_id and p.auth_user_id = auth.uid())
      or
      exists (select 1 from public.profiles p where p.id = recipient_id and p.auth_user_id = auth.uid())
    )
  );