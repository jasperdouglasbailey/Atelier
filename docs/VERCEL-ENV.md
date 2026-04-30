# Vercel environment variables

The Vercel deployment at https://atelier-bice-mu.vercel.app needs these
variables set in **Project Settings → Environment Variables**. Apply to
**all environments** (Production, Preview, Development).

## Required

```
NEXT_PUBLIC_SUPABASE_URL=https://diaxxsxytqpzrbtgyqho.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=eyJhbGciOi...   # legacy anon key, see Supabase Dashboard → Project Settings → API Keys
NEXT_PUBLIC_APP_URL=https://atelier-bice-mu.vercel.app
```

## Optional (not yet used)

```
SUPABASE_SERVICE_ROLE_KEY=         # leave blank until background jobs need it
ANTHROPIC_API_KEY=                 # add when wiring up agents
XERO_CLIENT_ID=
XERO_CLIENT_SECRET=
DROPBOX_APP_KEY=
DROPBOX_APP_SECRET=
MICROSOFT_GRAPH_CLIENT_ID=
MICROSOFT_GRAPH_CLIENT_SECRET=
```

## How to get the values

- `NEXT_PUBLIC_SUPABASE_URL` — Supabase Dashboard → "Crew Booking System" project → Project Settings → API
- `NEXT_PUBLIC_SUPABASE_ANON_KEY` — same page, "Legacy anon key" row. (The new "publishable key" format `sb_publishable_...` works too — pick one and stick with it.)
- `SUPABASE_SERVICE_ROLE_KEY` — same page, **never share this**. Used only when bypassing RLS on the server.

## After updating

Vercel re-runs the build automatically when env vars change. Watch the
deployment log to confirm it picks up the new values.

## Note on the "Crew Booking System" name

That project hosts Atelier's tables (`atelier_*`). The handoff doc said
project ID `diaxxsxytqpzrbtgyqho` and named it as Atelier — that label
is just the Supabase org/project name, not the app name. Atelier the app
is what runs against it. The empty Free-tier project named "Atelier" at
`tokngeuenmfkemrnrqsc.supabase.co` is unused and can be deleted.
