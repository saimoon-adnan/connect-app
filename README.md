# CONNECT

**Your campus. Your network. Your future.**

CONNECT is a social network for university students. Members sign up with their university, share posts and stories, discover classmates, send connection requests, chat, join groups, register for events and find career opportunities. It runs as a web app and can be packaged as an Android app.

> CONNECT is a student community platform. It is **not** an official page of any university.

---

## Features

- **Auth:** sign up, sign in, email confirmation, password reset. Sign-up collects university, department, study year and interests.
- **Startup flow:** signed-out visitors land directly on the sign-up form; signed-in users go straight into the app.
- **Feed:** posts with images, likes, comments, save, share link, edit and delete. Tabs: *My university*, *For you*, *Events*.
- **Stories:** 24-hour campus stories.
- **Discover:** browse members of your university (ranked by department and shared interests), follow, connect and message.
- **Connections:** send, accept or decline requests. The Connect button shows the real state (Connect, Request sent, Connected). Your profile shows your connection count, and you can open the list to message or remove connections.
- **Messages:** one-to-one chat with realtime updates.
- **Notifications:** connection requests, accepted requests and activity.
- **Groups:** create, join and save groups.
- **Careers:** browse, save and apply to opportunities.
- **Events:** see upcoming events and register from the Feed.
- **Profile:** avatar and cover upload (5 MB limit), bio, own posts, public view for other members.
- **Multi-university:** every member belongs to one university, and feeds, groups, events and people are scoped to it.
- **UI:** dark and light theme, mobile bottom navigation (floating glass pill with Feed, Discover, My groups, Careers, Messages) and a desktop sidebar.

## Tech stack

| Area | Technology |
|---|---|
| Framework | Next.js 15 (App Router, static export), React 19, TypeScript |
| Styling | Tailwind CSS, lucide-react icons |
| Backend | Supabase (Auth, Postgres, Storage, Realtime, Row Level Security) |
| Mobile | Capacitor 8 (Android, `com.connect.university`) |
| CI | GitHub Actions builds a debug APK |

## Project structure

```
app/
  page.tsx              Main app (feed, discover, groups, careers, messages, profile)
  login/page.tsx        Sign in, sign up, confirm email, reset password
  components/           Shared components (for example StoryRail)
lib/supabase/
  client.ts             Browser Supabase client
  server.ts             Server client (not used by the static export)
  data.ts               All database reads and writes
data/mock.ts            Shared TypeScript types
supabase/migrations/    SQL migrations (run in order)
scripts/                Android icon generator
.github/workflows/      build-android-apk.yml
capacitor.config.ts     Capacitor config (webDir: out)
```

## Getting started

### 1. Requirements

- Node.js 20 or newer
- A free [Supabase](https://supabase.com) project

### 2. Install

```bash
npm install
```

### 3. Environment variables

Copy `.env.example` to `.env.local` and fill in the values from Supabase (Project Settings, API):

```
NEXT_PUBLIC_SUPABASE_URL=your-supabase-project-url
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=your-supabase-publishable-key
```

Never commit `.env.local`. `NEXT_PUBLIC_` values are baked in at build time, so rebuild or redeploy after changing them.

### 4. Database

Open the Supabase **SQL Editor** and run every file in `supabase/migrations/` **in filename order**, one at a time:

1. `20261113000100_initial_schema.sql` (tables, policies, first university)
2. `20261114000100_profile_media.sql` (storage bucket for avatars, covers, post images)
3. `20261115000100_social_actions.sql` (conversations, connection requests, notifications, saves)
4. `20261115000200_remove_demo_seed_data.sql`
5. `20261115000300_registrations_and_realtime.sql`
6. `20261115000400_profile_discovery_fields.sql` (department, study year, interests)
7. `20261115000500_campus_stories.sql`

"Success. No rows returned" means a file ran. Migrations are applied once and persist, so you do not rerun them on each deploy. A file that says something "already exists" was applied before and can be skipped. Add new changes as new migration files instead of editing old ones.

#### Extra SQL

These changes were applied after the original migrations. If a migration file for them is not in `supabase/migrations/` yet, run them once on a fresh project:

```sql
-- Creators can read the conversation they just created
create policy "Creators read own conversations directly"
on public.conversations for select to authenticated
using (
  exists (
    select 1 from public.profiles p
    where p.id = created_by and p.auth_user_id = auth.uid()
  )
);

-- Connection counts without exposing who is connected to whom
create or replace function public.get_connection_count(target_profile_id uuid)
returns integer
language sql
stable
security definer
set search_path = public
as $$
  select count(*)::int
  from public.connection_requests
  where status = 'accepted'
    and (sender_id = target_profile_id or recipient_id = target_profile_id);
$$;

revoke all on function public.get_connection_count(uuid) from public;
grant execute on function public.get_connection_count(uuid) to authenticated;

-- Either person can remove an accepted connection
grant delete on public.connection_requests to authenticated;

drop policy if exists "Participants remove accepted connections" on public.connection_requests;
create policy "Participants remove accepted connections"
on public.connection_requests for delete to authenticated
using (
  status = 'accepted'
  and exists (
    select 1 from public.profiles p
    where p.auth_user_id = auth.uid()
      and p.id in (sender_id, recipient_id)
  )
);
```

### 5. Supabase Auth settings

In **Authentication**:

- **URL Configuration:** set *Site URL* to your deployed URL (for example `https://your-app.vercel.app`) and add `https://your-app.vercel.app/**` to *Redirect URLs*. Without this, confirmation and password reset links point to the wrong address.
- **Sign In / Providers, Email:** for testing you can turn **Confirm email** off. The free plan has a low hourly email limit, so many sign-ups at once can hit "rate limit" errors. Turning it off does not confirm users who already signed up; confirm them from Authentication, Users.

### 6. Run locally

```bash
npm run dev
```

Open <http://localhost:3000>.

### Useful commands

| Command | What it does |
|---|---|
| `npm run dev` | Start the dev server |
| `npm run build` | Production build and static export to `out/` |
| `npm run lint` | Type check (`tsc --noEmit`) |

Run `npm run build` once before every push to catch syntax errors early.

## Adding a university

The sign-up form lists the rows of `public.universities`. Add one in the SQL Editor:

```sql
insert into public.universities (slug, name, city) values
  ('example-university', 'Example University', 'Dhaka')
on conflict (slug) do nothing;
```

Events, groups and career opportunities have no admin screen yet. For a new university, add them with SQL. Members can already create their own posts and groups.

## Deploy the web app (Vercel)

1. Push the project to GitHub (without `.env.local` and `node_modules`).
2. In Vercel choose **Add New, Project** and import the repo.
3. Add the two `NEXT_PUBLIC_SUPABASE_*` environment variables.
4. Deploy. Each push to the main branch redeploys automatically.
5. Update the Supabase **Site URL** and **Redirect URLs** (see above).

Netlify and Cloudflare Pages also work: build command `npm run build`, output directory `out`.

## Build the Android app

**With GitHub Actions (no Android Studio needed):**

1. In the repo, open Settings, Secrets and variables, Actions, and add `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`.
2. Open the **Actions** tab, choose **Build CONNECT Android APK** and click **Run workflow**.
3. Download the APK from the run's **Artifacts** and install it on your phone.

**Locally (needs Android Studio and JDK):**

```bash
npm run build
npx cap add android      # first time only
npx cap sync android
npx cap open android
```

## Troubleshooting

| Problem | Likely cause and fix |
|---|---|
| Login shows "Something went wrong" | Profile creation failed. Run all migrations, especially the profile discovery fields one. |
| Confirmation email opens the wrong page | Set Site URL and Redirect URLs in Supabase Auth. Then sign up again, old emails keep the old link. |
| "Email not confirmed" | Click the link in the email, confirm the user in Authentication, Users, or turn off Confirm email for testing. |
| `new row violates row-level security policy` (42501) | A required RLS policy is missing. Check the Extra SQL section and the migrations. |
| A delete silently does nothing | Supabase RLS deletes 0 rows without an error. Check the DELETE policy for that table. |
| Env changes have no effect on Vercel | `NEXT_PUBLIC_` values are baked in at build time. Redeploy. |
| Build fails with a JSX syntax error | An element or fragment in `app/page.tsx` is unclosed. Fix it before pushing. |

## Security notes

- Row Level Security is enabled on every table. Keep it that way and add a policy for each new action.
- Only the Supabase **publishable** key belongs in the frontend. Never put a service role key in this project.
- Keep `.env.local` out of git and out of shared zip files.

## License

Private project. All rights reserved.
