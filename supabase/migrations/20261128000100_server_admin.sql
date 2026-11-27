-- Campus servers: join approval, roles, moderation, delete server, transfer ownership.

alter table public.groups add column if not exists join_mode text not null default 'open';
alter table public.groups drop constraint if exists groups_join_mode_check;
alter table public.groups add constraint groups_join_mode_check check (join_mode in ('open', 'approval'));

create table if not exists public.group_join_requests (
  id uuid primary key default gen_random_uuid(),
  group_id uuid not null references public.groups(id) on delete cascade,
  profile_id uuid not null references public.profiles(id) on delete cascade,
  message text not null default '' check (char_length(message) <= 300),
  status text not null default 'pending' check (status in ('pending', 'approved', 'declined')),
  created_at timestamptz not null default now(),
  decided_at timestamptz,
  decided_by uuid references public.profiles(id) on delete set null,
  unique (group_id, profile_id)
);
create index if not exists group_join_requests_group_idx on public.group_join_requests (group_id, status, created_at);

-- ---------- helpers ----------
create or replace function public.current_profile_id()
returns uuid language sql stable security definer set search_path = public as $$
  select id from public.profiles where auth_user_id = auth.uid() limit 1
$$;

create or replace function public.is_group_manager(target_group uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.groups g where g.id = target_group and g.owner_id = public.current_profile_id())
      or exists (select 1 from public.group_members m
                 where m.group_id = target_group and m.profile_id = public.current_profile_id()
                   and m.role in ('admin', 'moderator'))
$$;

-- ---------- row level security ----------
alter table public.group_join_requests enable row level security;
grant select on public.group_join_requests to authenticated;
grant delete on public.groups to authenticated;
grant execute on function public.current_profile_id() to authenticated;
grant execute on function public.is_group_manager(uuid) to authenticated;

drop policy if exists "Requesters and managers read join requests" on public.group_join_requests;
create policy "Requesters and managers read join requests" on public.group_join_requests for select to authenticated using (
  profile_id = public.current_profile_id() or public.is_group_manager(group_id)
);

-- Joining directly is only allowed for open servers (or by the owner when creating one).
drop policy if exists "Users join as themselves" on public.group_members;
create policy "Users join as themselves" on public.group_members for insert to authenticated with check (
  role = 'member'
  and exists (select 1 from public.profiles p where p.id = profile_id and p.auth_user_id = auth.uid())
  and exists (select 1 from public.groups g where g.id = group_id and (g.join_mode = 'open' or g.owner_id = profile_id))
);

drop policy if exists "Group owners delete groups" on public.groups;
create policy "Group owners delete groups" on public.groups for delete to authenticated using (
  owner_id = public.current_profile_id()
);

drop policy if exists "Senders and owners delete server chat" on public.group_messages;
drop policy if exists "Senders and managers delete server chat" on public.group_messages;
create policy "Senders and managers delete server chat" on public.group_messages for delete to authenticated using (
  sender_id = public.current_profile_id() or public.is_group_manager(group_id)
);

drop policy if exists "Group managers delete server posts" on public.posts;
create policy "Group managers delete server posts" on public.posts for delete to authenticated using (
  group_id is not null and public.is_group_manager(group_id)
);

-- ---------- actions ----------
create or replace function public.request_join_group(target_group uuid, note text default '')
returns text language plpgsql security definer set search_path = public as $$
declare
  me uuid := public.current_profile_id();
  g public.groups%rowtype;
begin
  if me is null then raise exception 'Sign in first.'; end if;
  select * into g from public.groups where id = target_group;
  if not found then raise exception 'This server no longer exists.'; end if;
  if exists (select 1 from public.group_members where group_id = target_group and profile_id = me) then return 'joined'; end if;

  if g.join_mode = 'open' then
    insert into public.group_members (group_id, profile_id) values (target_group, me) on conflict do nothing;
    return 'joined';
  end if;

  insert into public.group_join_requests (group_id, profile_id, message, status)
  values (target_group, me, left(coalesce(note, ''), 300), 'pending')
  on conflict (group_id, profile_id) do update
    set status = 'pending', message = excluded.message, created_at = now(), decided_at = null, decided_by = null;

  insert into public.notifications (recipient_id, actor_id, kind, body)
  select distinct r.pid, me, 'server_request', 'asked to join ' || g.name
  from (
    select g.owner_id as pid
    union
    select profile_id from public.group_members where group_id = target_group and role in ('admin', 'moderator')
  ) r
  where r.pid is not null and r.pid <> me;
  return 'pending';
end $$;

create or replace function public.cancel_join_request(target_group uuid)
returns void language plpgsql security definer set search_path = public as $$
begin
  delete from public.group_join_requests
  where group_id = target_group and profile_id = public.current_profile_id() and status = 'pending';
end $$;

create or replace function public.decide_join_request(request_id uuid, approve boolean)
returns void language plpgsql security definer set search_path = public as $$
declare
  me uuid := public.current_profile_id();
  req public.group_join_requests%rowtype;
  group_name text;
begin
  select * into req from public.group_join_requests where id = request_id;
  if not found or req.status <> 'pending' then return; end if;
  if not public.is_group_manager(req.group_id) then raise exception 'You cannot manage this server.'; end if;
  select name into group_name from public.groups where id = req.group_id;

  update public.group_join_requests
    set status = case when approve then 'approved' else 'declined' end, decided_at = now(), decided_by = me
    where id = request_id;

  if approve then
    insert into public.group_members (group_id, profile_id) values (req.group_id, req.profile_id) on conflict do nothing;
  end if;

  insert into public.notifications (recipient_id, actor_id, kind, body)
  values (req.profile_id, me, case when approve then 'server_approved' else 'server_declined' end,
          case when approve then 'approved your request to join ' || group_name else 'declined your request to join ' || group_name end);
end $$;

create or replace function public.remove_group_member(target_group uuid, target_profile uuid)
returns void language plpgsql security definer set search_path = public as $$
declare
  me uuid := public.current_profile_id();
  owner uuid;
  my_role text;
  their_role text;
  group_name text;
begin
  select owner_id, name into owner, group_name from public.groups where id = target_group;
  if target_profile = owner then raise exception 'The owner cannot be removed.'; end if;
  select role into their_role from public.group_members where group_id = target_group and profile_id = target_profile;
  if their_role is null then return; end if;

  if me = owner then
    null;
  else
    select role into my_role from public.group_members where group_id = target_group and profile_id = me;
    if my_role = 'admin' and their_role in ('member', 'moderator') then
      null;
    else
      raise exception 'You cannot remove this member.';
    end if;
  end if;

  delete from public.group_members where group_id = target_group and profile_id = target_profile;
  insert into public.notifications (recipient_id, actor_id, kind, body)
  values (target_profile, me, 'server_removed', 'removed you from ' || group_name);
end $$;

create or replace function public.set_group_member_role(target_group uuid, target_profile uuid, new_role text)
returns void language plpgsql security definer set search_path = public as $$
declare owner uuid;
begin
  if new_role not in ('member', 'moderator', 'admin') then raise exception 'Unknown role.'; end if;
  select owner_id into owner from public.groups where id = target_group;
  if owner is distinct from public.current_profile_id() then raise exception 'Only the owner can change roles.'; end if;
  if target_profile = owner then raise exception 'The owner role cannot be changed.'; end if;
  update public.group_members set role = new_role where group_id = target_group and profile_id = target_profile;
end $$;

create or replace function public.transfer_group_ownership(target_group uuid, new_owner uuid)
returns void language plpgsql security definer set search_path = public as $$
declare
  me uuid := public.current_profile_id();
  group_name text;
begin
  select name into group_name from public.groups where id = target_group and owner_id = me;
  if group_name is null then raise exception 'Only the owner can transfer this server.'; end if;
  if not exists (select 1 from public.group_members where group_id = target_group and profile_id = new_owner) then
    raise exception 'The new owner must already be a member.';
  end if;
  update public.groups set owner_id = new_owner where id = target_group;
  update public.group_members set role = 'member' where group_id = target_group and profile_id = new_owner;
  update public.group_members set role = 'admin' where group_id = target_group and profile_id = me;
  insert into public.notifications (recipient_id, actor_id, kind, body)
  values (new_owner, me, 'server_owner', 'made you the owner of ' || group_name);
end $$;

grant execute on function public.request_join_group(uuid, text) to authenticated;
grant execute on function public.cancel_join_request(uuid) to authenticated;
grant execute on function public.decide_join_request(uuid, boolean) to authenticated;
grant execute on function public.remove_group_member(uuid, uuid) to authenticated;
grant execute on function public.set_group_member_role(uuid, uuid, text) to authenticated;
grant execute on function public.transfer_group_ownership(uuid, uuid) to authenticated;
