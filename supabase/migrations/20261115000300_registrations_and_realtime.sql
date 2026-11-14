-- Campus event registrations and opportunity applications.
create table if not exists public.event_registrations (
  event_id uuid not null references public.events(id) on delete cascade,
  profile_id uuid not null references public.profiles(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (event_id, profile_id)
);

create table if not exists public.opportunity_applications (
  id uuid primary key default gen_random_uuid(),
  opportunity_id uuid not null references public.opportunities(id) on delete cascade,
  applicant_id uuid not null references public.profiles(id) on delete cascade,
  status text not null default 'submitted' check (status in ('submitted','reviewing','accepted','declined','withdrawn')),
  created_at timestamptz not null default now(),
  unique (opportunity_id, applicant_id)
);

create table if not exists public.saved_groups (
  group_id uuid not null references public.groups(id) on delete cascade,
  profile_id uuid not null references public.profiles(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (group_id, profile_id)
);

alter table public.event_registrations enable row level security;
alter table public.opportunity_applications enable row level security;
alter table public.saved_groups enable row level security;
grant select, insert, delete on public.event_registrations to authenticated;
grant select, insert, update, delete on public.opportunity_applications to authenticated;
grant select, insert, delete on public.saved_groups to authenticated;

drop policy if exists "Users read their saved groups" on public.saved_groups;
create policy "Users read their saved groups" on public.saved_groups for select to authenticated using (
  exists (select 1 from public.profiles p where p.id = profile_id and p.auth_user_id = auth.uid())
);
drop policy if exists "Users save groups as themselves" on public.saved_groups;
create policy "Users save groups as themselves" on public.saved_groups for insert to authenticated with check (
  exists (select 1 from public.profiles p where p.id = profile_id and p.auth_user_id = auth.uid())
);
drop policy if exists "Users unsave their groups" on public.saved_groups;
create policy "Users unsave their groups" on public.saved_groups for delete to authenticated using (
  exists (select 1 from public.profiles p where p.id = profile_id and p.auth_user_id = auth.uid())
);

drop policy if exists "Users read their event registrations" on public.event_registrations;
create policy "Users read their event registrations" on public.event_registrations for select to authenticated using (
  exists (select 1 from public.profiles p where p.id = profile_id and p.auth_user_id = auth.uid())
);
drop policy if exists "Users register themselves for events" on public.event_registrations;
create policy "Users register themselves for events" on public.event_registrations for insert to authenticated with check (
  exists (select 1 from public.profiles p where p.id = profile_id and p.auth_user_id = auth.uid())
);
drop policy if exists "Users cancel their event registrations" on public.event_registrations;
create policy "Users cancel their event registrations" on public.event_registrations for delete to authenticated using (
  exists (select 1 from public.profiles p where p.id = profile_id and p.auth_user_id = auth.uid())
);

drop policy if exists "Applicants read their applications" on public.opportunity_applications;
create policy "Applicants read their applications" on public.opportunity_applications for select to authenticated using (
  exists (select 1 from public.profiles p where p.id = applicant_id and p.auth_user_id = auth.uid())
);
drop policy if exists "Applicants submit applications as themselves" on public.opportunity_applications;
create policy "Applicants submit applications as themselves" on public.opportunity_applications for insert to authenticated with check (
  status = 'submitted' and exists (
    select 1 from public.profiles p where p.id = applicant_id and p.auth_user_id = auth.uid()
  )
);
drop policy if exists "Applicants withdraw their applications" on public.opportunity_applications;
create policy "Applicants withdraw their applications" on public.opportunity_applications for delete to authenticated using (
  exists (select 1 from public.profiles p where p.id = applicant_id and p.auth_user_id = auth.uid())
);

-- Enable live inbox/notification refresh where the Supabase realtime publication exists.
do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    if not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'messages') then
      alter publication supabase_realtime add table public.messages;
    end if;
    if not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'notifications') then
      alter publication supabase_realtime add table public.notifications;
    end if;
  end if;
end;
$$;
