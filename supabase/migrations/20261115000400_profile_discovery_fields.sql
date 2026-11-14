-- Add onboarding details used to prioritize relevant campus connections.
alter table public.profiles
  add column if not exists department text not null default '',
  add column if not exists study_year text not null default '',
  add column if not exists interests text[] not null default '{}';

create index if not exists profiles_university_department_idx
  on public.profiles (university_id, department);

create index if not exists profiles_interests_gin_idx
  on public.profiles using gin (interests);
