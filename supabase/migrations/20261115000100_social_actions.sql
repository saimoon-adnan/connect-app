-- Persist post bookmarks and enable authenticated conversation creation.
create table if not exists public.saved_posts (
  post_id uuid not null references public.posts(id) on delete cascade,
  profile_id uuid not null references public.profiles(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (post_id, profile_id)
);

alter table public.saved_posts enable row level security;
grant select, insert, delete on public.saved_posts to authenticated;

drop policy if exists "Users read their saved posts" on public.saved_posts;
create policy "Users read their saved posts" on public.saved_posts for select to authenticated using (
  exists (select 1 from public.profiles p where p.id = profile_id and p.auth_user_id = auth.uid())
);
drop policy if exists "Users save posts as themselves" on public.saved_posts;
create policy "Users save posts as themselves" on public.saved_posts for insert to authenticated with check (
  exists (select 1 from public.profiles p where p.id = profile_id and p.auth_user_id = auth.uid())
);
drop policy if exists "Users unsave their posts" on public.saved_posts;
create policy "Users unsave their posts" on public.saved_posts for delete to authenticated using (
  exists (select 1 from public.profiles p where p.id = profile_id and p.auth_user_id = auth.uid())
);

drop policy if exists "Users create conversations" on public.conversations;
create policy "Users create conversations" on public.conversations for insert to authenticated with check (
  exists (select 1 from public.profiles p where p.id = created_by and p.auth_user_id = auth.uid())
);

create or replace function public.is_conversation_creator(target_conversation_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.conversations c
    join public.profiles p on p.id = c.created_by
    where c.id = target_conversation_id
      and p.auth_user_id = auth.uid()
  );
$$;
revoke all on function public.is_conversation_creator(uuid) from public;
grant execute on function public.is_conversation_creator(uuid) to authenticated;

drop policy if exists "Conversation creators add participants" on public.conversation_members;
create policy "Conversation creators add participants" on public.conversation_members for insert to authenticated with check (
  public.is_conversation_creator(conversation_id)
);

-- Joining a group must never let a member grant themselves elevated privileges.
drop policy if exists "Users join as themselves" on public.group_members;
create policy "Users join as themselves" on public.group_members for insert to authenticated with check (
  role = 'member' and exists (
    select 1 from public.profiles p where p.id = profile_id and p.auth_user_id = auth.uid()
  )
);
-- Only a conversation creator may add another participant. A user may join
-- only after they have already been added to that conversation.
drop policy if exists "Users add themselves to conversations" on public.conversation_members;
create policy "Users add themselves to conversations" on public.conversation_members for insert to authenticated with check (
  exists (select 1 from public.profiles p where p.id = profile_id and p.auth_user_id = auth.uid())
  and public.is_conversation_member(conversation_id)
);

create or replace function public.notify_post_author()
returns trigger language plpgsql security definer set search_path = public as $$
declare target_profile_id uuid;
begin
  select author_id into target_profile_id from public.posts where id = new.post_id;
  if target_profile_id is not null and target_profile_id <> new.profile_id then
    insert into public.notifications(recipient_id, actor_id, kind, body)
    values(target_profile_id, new.profile_id, 'post_like', 'liked your post');
  end if;
  return new;
end;
$$;
drop trigger if exists post_like_notification on public.post_likes;
create trigger post_like_notification after insert on public.post_likes
for each row execute function public.notify_post_author();

create or replace function public.notify_comment_author()
returns trigger language plpgsql security definer set search_path = public as $$
declare target_profile_id uuid;
begin
  select author_id into target_profile_id from public.posts where id = new.post_id;
  if target_profile_id is not null and target_profile_id <> new.author_id then
    insert into public.notifications(recipient_id, actor_id, kind, body)
    values(target_profile_id, new.author_id, 'post_comment', 'commented on your post');
  end if;
  return new;
end;
$$;
drop trigger if exists post_comment_notification on public.comments;
create trigger post_comment_notification after insert on public.comments
for each row execute function public.notify_comment_author();

create or replace function public.notify_connection_recipient()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.notifications(recipient_id, actor_id, kind, body)
  values(new.recipient_id, new.sender_id, 'connection_request', 'sent you a connection request');
  return new;
end;
$$;
drop trigger if exists connection_request_notification on public.connection_requests;
create trigger connection_request_notification after insert on public.connection_requests
for each row execute function public.notify_connection_recipient();

create or replace function public.notify_connection_accepted()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if old.status = 'pending' and new.status = 'accepted' then
    insert into public.notifications(recipient_id, actor_id, kind, body)
    values(new.sender_id, new.recipient_id, 'connection_accepted', 'accepted your connection request');
  end if;
  return new;
end;
$$;
drop trigger if exists connection_accepted_notification on public.connection_requests;
create trigger connection_accepted_notification after update of status on public.connection_requests
for each row execute function public.notify_connection_accepted();
