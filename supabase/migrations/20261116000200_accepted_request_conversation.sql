-- When a recipient accepts a connection request, open a 1:1 chat between them so
-- the Accept button leads somewhere. Without this, the request flips to "accepted"
-- but no conversation exists, so the Messages tab stays empty and the action looks
-- broken. The trigger runs as the caller (security invoker) so it can only act on
-- rows the UPDATE policy already permitted.
drop trigger if exists connection_accepted_open_chat on public.connection_requests;
drop function if exists public.open_chat_on_accepted_request();

create or replace function public.open_chat_on_accepted_request()
returns trigger
language plpgsql
security invoker
set search_path = public
as $$
declare
  new_conversation_id uuid;
begin
  if new.status <> 'accepted' or old.status = 'accepted' then
    return new;
  end if;

  -- Idempotent: reuse an existing conversation between these two people.
  select cm.conversation_id into new_conversation_id
  from public.conversation_members cm
  where cm.profile_id = new.sender_id
    and exists (
      select 1 from public.conversation_members other
      where other.conversation_id = cm.conversation_id
        and other.profile_id = new.recipient_id
    )
  limit 1;

  if new_conversation_id is null then
    insert into public.conversations (created_by)
    values (new.recipient_id)
    returning id into new_conversation_id;

    insert into public.conversation_members (conversation_id, profile_id)
    values
      (new_conversation_id, new.sender_id),
      (new_conversation_id, new.recipient_id);
  end if;

  return new;
end;
$$;

create trigger connection_accepted_open_chat
after update of status on public.connection_requests
for each row execute function public.open_chat_on_accepted_request();