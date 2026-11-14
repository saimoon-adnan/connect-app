-- Campus image stories expire 24 hours after creation.
create table if not exists public.stories (
  id uuid primary key default gen_random_uuid(),
  author_id uuid not null references public.profiles(id) on delete cascade,
  image_url text not null,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null default (now() + interval '24 hours')
);

create or replace function public.set_campus_story_expiry()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  new.created_at := now();
  new.expires_at := new.created_at + interval '24 hours';
  return new;
end;
$$;

drop trigger if exists set_campus_story_expiry on public.stories;
create trigger set_campus_story_expiry
before insert on public.stories
for each row execute function public.set_campus_story_expiry();

create index if not exists stories_active_campus_idx on public.stories (expires_at desc, created_at desc);
alter table public.stories enable row level security;
grant select, insert, delete on public.stories to authenticated;

drop policy if exists "Members read active campus stories" on public.stories;
create policy "Members read active campus stories" on public.stories
for select to authenticated using (
  expires_at > now() and exists (
    select 1 from public.profiles author
    join public.profiles viewer on viewer.auth_user_id = auth.uid()
    where author.id = stories.author_id and author.university_id = viewer.university_id
  )
);

drop policy if exists "Members create their own campus stories" on public.stories;
create policy "Members create their own campus stories" on public.stories
for insert to authenticated with check (
  exists (
    select 1 from public.profiles author
    where author.id = stories.author_id and author.auth_user_id = auth.uid()
  )
  and image_url like ('%/storage/v1/object/public/profile-media/' || auth.uid()::text || '/stories/%')
);

drop policy if exists "Members delete their own campus stories" on public.stories;
create policy "Members delete their own campus stories" on public.stories
for delete to authenticated using (
  exists (
    select 1 from public.profiles author
    where author.id = stories.author_id and author.auth_user_id = auth.uid()
  )
);
