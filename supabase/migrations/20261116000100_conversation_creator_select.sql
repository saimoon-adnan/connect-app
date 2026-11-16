-- Allow the creator of a conversation to read it immediately after creation.
-- createConversation() inserts into public.conversations with .select("id"), but the
-- existing SELECT policy only allows members (is_conversation_member), and the creator
-- is not a member until the conversation_members insert succeeds afterwards. RLS
-- therefore rejects the insert's SELECT. This policy lets the creator read their
-- own conversation, while the member-based policy still applies to everyone else.
drop policy if exists "Conversation creators read their conversations" on public.conversations;
create policy "Conversation creators read their conversations" on public.conversations
for select to authenticated using (
  public.is_conversation_creator(conversations.id)
);