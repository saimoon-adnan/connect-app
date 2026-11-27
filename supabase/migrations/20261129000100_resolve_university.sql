-- Let people type their university at sign-up. The app matches typos to an existing
-- university on the device; anything genuinely new is created here (signed-in users only).

alter table public.universities add column if not exists name_key text;
update public.universities
  set name_key = regexp_replace(lower(name), '[^a-z0-9]+', '', 'g')
  where name_key is null;

-- Only enforce uniqueness when no two existing rows already share a key.
do $$
begin
  create unique index if not exists universities_name_key_idx on public.universities (name_key) where name_key is not null and name_key <> '';
exception when unique_violation then
  raise notice 'Skipped unique index: duplicate university names already exist.';
end $$;

create or replace function public.resolve_university(p_name text)
returns uuid language plpgsql security definer set search_path = public as $$
declare
  clean text := btrim(regexp_replace(coalesce(p_name, ''), '\s+', ' ', 'g'));
  key text;
  found_id uuid;
begin
  if auth.uid() is null then raise exception 'Sign in first.'; end if;
  if char_length(clean) < 3 or char_length(clean) > 100 then
    raise exception 'University name must be between 3 and 100 characters.';
  end if;
  key := regexp_replace(lower(clean), '[^a-z0-9]+', '', 'g');
  if key = '' then raise exception 'University name must contain letters or numbers.'; end if;

  select id into found_id from public.universities where name_key = key limit 1;
  if found_id is not null then return found_id; end if;

  insert into public.universities (slug, name, city, name_key)
  values (left(key, 40) || '-' || substr(md5(random()::text || clock_timestamp()::text), 1, 5), clean, '', key)
  returning id into found_id;
  return found_id;
end $$;

grant execute on function public.resolve_university(text) to authenticated;
