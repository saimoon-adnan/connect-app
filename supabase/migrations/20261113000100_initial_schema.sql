-- CONNECT initial Supabase schema. Run this migration in the Supabase SQL Editor.
create extension if not exists pgcrypto;

create table if not exists public.universities (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique,
  name text not null,
  city text not null default '',
  country text not null default 'Bangladesh',
  created_at timestamptz not null default now()
);

create table if not exists public.profiles (
  id uuid primary key default gen_random_uuid(),
  auth_user_id uuid unique references auth.users(id) on delete set null,
  university_id uuid references public.universities(id) on delete set null,
  username text unique,
  display_name text not null,
  headline text not null default '',
  avatar_url text,
  cover_url text,
  bio text not null default '',
  skills text[] not null default '{}',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.posts (
  id uuid primary key default gen_random_uuid(),
  author_id uuid not null references public.profiles(id) on delete cascade,
  university_id uuid references public.universities(id) on delete set null,
  body text not null,
  image_url text,
  tag text not null default 'Community',
  audience text not null default 'public' check (audience in ('public','university')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.post_likes (
  post_id uuid not null references public.posts(id) on delete cascade,
  profile_id uuid not null references public.profiles(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (post_id, profile_id)
);

create table if not exists public.comments (
  id uuid primary key default gen_random_uuid(),
  post_id uuid not null references public.posts(id) on delete cascade,
  author_id uuid not null references public.profiles(id) on delete cascade,
  body text not null check (length(trim(body)) > 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.groups (
  id uuid primary key default gen_random_uuid(),
  university_id uuid references public.universities(id) on delete set null,
  owner_id uuid references public.profiles(id) on delete set null,
  name text not null,
  description text not null default '',
  category text not null default 'Community',
  image_url text,
  visibility text not null default 'public' check (visibility in ('public','university','private')),
  created_at timestamptz not null default now()
);

create table if not exists public.group_members (
  group_id uuid not null references public.groups(id) on delete cascade,
  profile_id uuid not null references public.profiles(id) on delete cascade,
  role text not null default 'member' check (role in ('member','moderator','admin')),
  joined_at timestamptz not null default now(),
  primary key (group_id, profile_id)
);

create table if not exists public.events (
  id uuid primary key default gen_random_uuid(),
  university_id uuid references public.universities(id) on delete set null,
  group_id uuid references public.groups(id) on delete set null,
  created_by uuid references public.profiles(id) on delete set null,
  title text not null,
  description text not null default '',
  location text not null default '',
  starts_at timestamptz not null,
  image_url text,
  created_at timestamptz not null default now()
);

create table if not exists public.opportunities (
  id uuid primary key default gen_random_uuid(),
  university_id uuid references public.universities(id) on delete set null,
  created_by uuid references public.profiles(id) on delete set null,
  title text not null,
  company text not null,
  type text not null check (type in ('Job','Internship','Scholarship','Competition','Workshop')),
  location text not null default '',
  description text not null default '',
  application_url text,
  deadline timestamptz,
  created_at timestamptz not null default now()
);

create table if not exists public.saved_opportunities (
  opportunity_id uuid not null references public.opportunities(id) on delete cascade,
  profile_id uuid not null references public.profiles(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (opportunity_id, profile_id)
);

create table if not exists public.follows (
  follower_id uuid not null references public.profiles(id) on delete cascade,
  followed_id uuid not null references public.profiles(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (follower_id, followed_id),
  check (follower_id <> followed_id)
);

create table if not exists public.connection_requests (
  id uuid primary key default gen_random_uuid(),
  sender_id uuid not null references public.profiles(id) on delete cascade,
  recipient_id uuid not null references public.profiles(id) on delete cascade,
  status text not null default 'pending' check (status in ('pending','accepted','declined','cancelled')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (sender_id <> recipient_id),
  unique (sender_id, recipient_id)
);

create table if not exists public.notifications (
  id uuid primary key default gen_random_uuid(),
  recipient_id uuid not null references public.profiles(id) on delete cascade,
  actor_id uuid references public.profiles(id) on delete set null,
  kind text not null,
  body text not null default '',
  read_at timestamptz,
  created_at timestamptz not null default now()
);

create table if not exists public.conversations (
  id uuid primary key default gen_random_uuid(),
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now()
);

create table if not exists public.conversation_members (
  conversation_id uuid not null references public.conversations(id) on delete cascade,
  profile_id uuid not null references public.profiles(id) on delete cascade,
  joined_at timestamptz not null default now(),
  primary key (conversation_id, profile_id)
);

create table if not exists public.messages (
  id uuid primary key default gen_random_uuid(),
  conversation_id uuid not null references public.conversations(id) on delete cascade,
  sender_id uuid not null references public.profiles(id) on delete cascade,
  body text not null check (length(trim(body)) > 0),
  created_at timestamptz not null default now(),
  read_at timestamptz
);

create index if not exists posts_university_created_idx on public.posts (university_id, created_at desc);
create index if not exists posts_author_created_idx on public.posts (author_id, created_at desc);
create index if not exists comments_post_created_idx on public.comments (post_id, created_at);
create index if not exists groups_university_idx on public.groups (university_id, name);
create index if not exists events_university_starts_idx on public.events (university_id, starts_at);
create index if not exists opportunities_university_created_idx on public.opportunities (university_id, created_at desc);
create index if not exists notifications_recipient_created_idx on public.notifications (recipient_id, created_at desc);
create index if not exists messages_conversation_created_idx on public.messages (conversation_id, created_at);

grant usage on schema public to anon, authenticated;
grant select on public.universities, public.profiles, public.posts, public.post_likes,
  public.comments, public.groups, public.group_members, public.events, public.opportunities to anon, authenticated;
grant insert, update, delete on public.profiles, public.posts, public.post_likes,
  public.comments, public.groups, public.group_members, public.events, public.opportunities,
  public.saved_opportunities, public.follows, public.connection_requests,
  public.notifications, public.conversations, public.conversation_members, public.messages
to authenticated;
grant select, insert, delete on public.saved_opportunities, public.follows to authenticated;
grant select, insert, update on public.connection_requests, public.notifications to authenticated;
grant select, insert on public.conversations, public.conversation_members, public.messages to authenticated;

create or replace function public.is_conversation_member(target_conversation_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.conversation_members cm
    join public.profiles p on p.id = cm.profile_id
    where cm.conversation_id = target_conversation_id
      and p.auth_user_id = auth.uid()
  );
$$;
revoke all on function public.is_conversation_member(uuid) from public;
grant execute on function public.is_conversation_member(uuid) to authenticated;

alter table public.universities enable row level security;
alter table public.profiles enable row level security;
alter table public.posts enable row level security;
alter table public.post_likes enable row level security;
alter table public.comments enable row level security;
alter table public.groups enable row level security;
alter table public.group_members enable row level security;
alter table public.events enable row level security;
alter table public.opportunities enable row level security;
alter table public.saved_opportunities enable row level security;
alter table public.follows enable row level security;
alter table public.connection_requests enable row level security;
alter table public.notifications enable row level security;
alter table public.conversations enable row level security;
alter table public.conversation_members enable row level security;
alter table public.messages enable row level security;

create policy "Universities are readable" on public.universities for select using (true);
create policy "Profiles are readable" on public.profiles for select using (true);
create policy "Users create their profile" on public.profiles for insert to authenticated with check (auth_user_id = auth.uid());
create policy "Users update their profile" on public.profiles for update to authenticated using (auth_user_id = auth.uid()) with check (auth_user_id = auth.uid());

create policy "Public and campus posts are readable" on public.posts for select using (
  audience = 'public' or (
    audience = 'university' and exists (
      select 1 from public.profiles p
      where p.auth_user_id = auth.uid() and p.university_id = posts.university_id
    )
  )
);
create policy "Signed-in users create their posts" on public.posts for insert to authenticated with check (
  exists (select 1 from public.profiles p where p.id = author_id and p.auth_user_id = auth.uid())
);
create policy "Authors update their posts" on public.posts for update to authenticated using (
  exists (select 1 from public.profiles p where p.id = author_id and p.auth_user_id = auth.uid())
) with check (
  exists (select 1 from public.profiles p where p.id = author_id and p.auth_user_id = auth.uid())
);
create policy "Authors delete their posts" on public.posts for delete to authenticated using (
  exists (select 1 from public.profiles p where p.id = author_id and p.auth_user_id = auth.uid())
);

create policy "Post likes are readable" on public.post_likes for select using (true);
create policy "Users like as themselves" on public.post_likes for insert to authenticated with check (
  exists (select 1 from public.profiles p where p.id = profile_id and p.auth_user_id = auth.uid())
);
create policy "Users remove their likes" on public.post_likes for delete to authenticated using (
  exists (select 1 from public.profiles p where p.id = profile_id and p.auth_user_id = auth.uid())
);

create policy "Comments are readable with their posts" on public.comments for select using (
  exists (select 1 from public.posts p where p.id = post_id)
);
create policy "Signed-in users comment as themselves" on public.comments for insert to authenticated with check (
  exists (select 1 from public.profiles p where p.id = author_id and p.auth_user_id = auth.uid())
);
create policy "Authors update their comments" on public.comments for update to authenticated using (
  exists (select 1 from public.profiles p where p.id = author_id and p.auth_user_id = auth.uid())
) with check (
  exists (select 1 from public.profiles p where p.id = author_id and p.auth_user_id = auth.uid())
);
create policy "Authors delete their comments" on public.comments for delete to authenticated using (
  exists (select 1 from public.profiles p where p.id = author_id and p.auth_user_id = auth.uid())
);

create policy "Groups are readable" on public.groups for select using (visibility = 'public' or visibility = 'university');
create policy "Signed-in users create groups" on public.groups for insert to authenticated with check (
  exists (select 1 from public.profiles p where p.id = owner_id and p.auth_user_id = auth.uid())
);
create policy "Group owners manage groups" on public.groups for update to authenticated using (
  exists (select 1 from public.profiles p where p.id = owner_id and p.auth_user_id = auth.uid())
) with check (
  exists (select 1 from public.profiles p where p.id = owner_id and p.auth_user_id = auth.uid())
);
create policy "Group membership is readable" on public.group_members for select using (true);
create policy "Users join as themselves" on public.group_members for insert to authenticated with check (
  exists (select 1 from public.profiles p where p.id = profile_id and p.auth_user_id = auth.uid())
);
create policy "Users leave their groups" on public.group_members for delete to authenticated using (
  exists (select 1 from public.profiles p where p.id = profile_id and p.auth_user_id = auth.uid())
);

create policy "Events are readable" on public.events for select using (true);
create policy "Users create events as themselves" on public.events for insert to authenticated with check (
  exists (select 1 from public.profiles p where p.id = created_by and p.auth_user_id = auth.uid())
);
create policy "Event creators update events" on public.events for update to authenticated using (
  exists (select 1 from public.profiles p where p.id = created_by and p.auth_user_id = auth.uid())
);
create policy "Opportunities are readable" on public.opportunities for select using (true);
create policy "Users create opportunities as themselves" on public.opportunities for insert to authenticated with check (
  exists (select 1 from public.profiles p where p.id = created_by and p.auth_user_id = auth.uid())
);
create policy "Opportunity creators update opportunities" on public.opportunities for update to authenticated using (
  exists (select 1 from public.profiles p where p.id = created_by and p.auth_user_id = auth.uid())
);

create policy "Users read their saved opportunities" on public.saved_opportunities for select to authenticated using (
  exists (select 1 from public.profiles p where p.id = profile_id and p.auth_user_id = auth.uid())
);
create policy "Users save opportunities as themselves" on public.saved_opportunities for insert to authenticated with check (
  exists (select 1 from public.profiles p where p.id = profile_id and p.auth_user_id = auth.uid())
);
create policy "Users unsave their opportunities" on public.saved_opportunities for delete to authenticated using (
  exists (select 1 from public.profiles p where p.id = profile_id and p.auth_user_id = auth.uid())
);

create policy "Follows are readable" on public.follows for select using (true);
create policy "Users follow as themselves" on public.follows for insert to authenticated with check (
  exists (select 1 from public.profiles p where p.id = follower_id and p.auth_user_id = auth.uid())
);
create policy "Users unfollow as themselves" on public.follows for delete to authenticated using (
  exists (select 1 from public.profiles p where p.id = follower_id and p.auth_user_id = auth.uid())
);
create policy "Participants read connection requests" on public.connection_requests for select to authenticated using (
  exists (select 1 from public.profiles p where p.id = sender_id and p.auth_user_id = auth.uid()) or
  exists (select 1 from public.profiles p where p.id = recipient_id and p.auth_user_id = auth.uid())
);
create policy "Users send connection requests" on public.connection_requests for insert to authenticated with check (
  exists (select 1 from public.profiles p where p.id = sender_id and p.auth_user_id = auth.uid())
);
create policy "Recipients respond to requests" on public.connection_requests for update to authenticated using (
  exists (select 1 from public.profiles p where p.id = recipient_id and p.auth_user_id = auth.uid())
) with check (
  exists (select 1 from public.profiles p where p.id = recipient_id and p.auth_user_id = auth.uid())
);

create policy "Users read their notifications" on public.notifications for select to authenticated using (
  exists (select 1 from public.profiles p where p.id = recipient_id and p.auth_user_id = auth.uid())
);
create policy "Users update their notifications" on public.notifications for update to authenticated using (
  exists (select 1 from public.profiles p where p.id = recipient_id and p.auth_user_id = auth.uid())
) with check (
  exists (select 1 from public.profiles p where p.id = recipient_id and p.auth_user_id = auth.uid())
);
create policy "Conversation members read conversations" on public.conversations for select to authenticated using (
  public.is_conversation_member(conversations.id)
);
create policy "Conversation members read membership" on public.conversation_members for select to authenticated using (
  exists (select 1 from public.profiles p where p.id = profile_id and p.auth_user_id = auth.uid()) or
  public.is_conversation_member(conversation_members.conversation_id)
);
create policy "Users add themselves to conversations" on public.conversation_members for insert to authenticated with check (
  exists (select 1 from public.profiles p where p.id = profile_id and p.auth_user_id = auth.uid())
);
create policy "Conversation members read messages" on public.messages for select to authenticated using (
  public.is_conversation_member(messages.conversation_id)
);
create policy "Members send messages as themselves" on public.messages for insert to authenticated with check (
  exists (select 1 from public.profiles p where p.id = sender_id and p.auth_user_id = auth.uid()) and
  public.is_conversation_member(messages.conversation_id)
);

insert into public.universities (id, slug, name, city)
values ('00000000-0000-4000-8000-000000000001', 'northern-university-bangladesh', 'Northern University Bangladesh', 'Dhaka')
on conflict (slug) do nothing;

