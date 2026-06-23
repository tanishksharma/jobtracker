# V2 Setup — accounts, database, and keys

> Do these steps **before** the V2 build. They create the three accounts the hosted app
> needs (Supabase, Google Cloud, Vercel), set up the database, and wire Google sign-in.
> Work top to bottom — later steps reuse values from earlier ones.
>
> **Security:** never paste your **service_role key** or **Google client secret** into chat
> or commit them anywhere. You'll type them directly into Supabase/Vercel. The only values
> that ever go in the app are the two `NEXT_PUBLIC_…` ones below, which are safe to expose.

---

## Part A — Supabase (database + auth)

1. Go to **supabase.com** → sign up (GitHub login is easiest) → **New project**.
   - Name: `jobtracker` (anything).
   - Database password: generate a strong one and save it in your password manager.
   - Region: **Mumbai (ap-south-1)** — closest to India and good for data residency (DPDP).
   - Wait ~2 min for it to provision.
2. **Project Settings → API.** Copy and keep these three (you'll paste them into Vercel in
   Part D):
   - **Project URL** → `NEXT_PUBLIC_SUPABASE_URL`
   - **anon / public key** → `NEXT_PUBLIC_SUPABASE_ANON_KEY`
   - **service_role key** → `SUPABASE_SERVICE_ROLE_KEY` *(SECRET — keep private)*
3. **SQL Editor → New query.** Paste the entire SQL block from
   [`supabase/0001_v2_foundation.sql`](../supabase/0001_v2_foundation.sql) and click **Run**.
   You should see "Success". This creates the `profiles` and `companies` tables with
   per-user Row Level Security.

## Part B — Google sign-in (Google Cloud Console)

4. Go to **console.cloud.google.com** → create a new project (top bar → New Project).
5. **APIs & Services → OAuth consent screen:**
   - User type: **External** → Create.
   - App name (e.g. "JobTracker"), your email for support + developer contact → Save.
   - While the app is in **Testing** mode, add your own Google address under **Test users**
     (otherwise sign-in is blocked for you).
6. First get the callback URL from Supabase: **Supabase → Authentication → Providers →
   Google.** Copy the **Callback URL** it shows — it looks like
   `https://<your-project-ref>.supabase.co/auth/v1/callback`.
7. Back in Google Cloud: **APIs & Services → Credentials → Create Credentials → OAuth client
   ID → Web application.**
   - **Authorized redirect URIs:** paste the Supabase callback URL from step 6.
   - Create → copy the **Client ID** and **Client secret**.

## Part C — Connect Google to Supabase

8. **Supabase → Authentication → Providers → Google** → toggle **Enable**, paste the
   **Client ID** and **Client secret** from step 7 → **Save**.
9. **Supabase → Authentication → URL Configuration:**
   - **Site URL:** `http://localhost:3000` for now (we'll change it to your Vercel domain
     after the first deploy).
   - **Redirect URLs:** add `http://localhost:3000/**` (we'll add the Vercel URL later).

## Part D — Vercel (hosting)

10. Go to **vercel.com** → **Sign up with GitHub** → authorize Vercel to access your
    `tanishksharma/jobtracker` repo.
11. **Stop there for now** — do *not* import/deploy the project yet. The repo isn't a
    Next.js app until I build V2. Once I've pushed the V2 code, you'll: Import the repo →
    add the environment variables below → Deploy.

### Environment variables (you'll add these in Vercel in step 11)

| Variable | Value (from Part A) | Notes |
|---|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | Project URL | Public — safe to expose |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | anon/public key | Public — RLS protects the data |
| `SUPABASE_SERVICE_ROLE_KEY` | service_role key | **Secret.** Set it now; used by later phases |

Google's client ID/secret are **not** app env vars — Supabase holds them and runs the OAuth
flow itself, so they never touch Vercel or the code.

---

## When you're done

Tell me which parts are complete (you don't need to share any values with me — you'll paste
them into Vercel yourself). Then I'll build the V2 Next.js app wired to these env vars, push
it, and walk you through the final Vercel import + deploy so we can verify sign-in and your
imported `tracker.csv` data live.
