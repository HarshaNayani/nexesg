# Deploying NexESG on Render

Two Render services (defined in `render.yaml`) plus an external Postgres database:

| Piece | What | Render type |
|-------|------|-------------|
| `nexesg-api` | Django REST API | Web service (Python) |
| `nexesg-web` | React app | Static site |
| Database | PostgreSQL | Neon, Supabase, or Render Postgres |

## Free-tier things to know

- **Free web services sleep after 15 minutes of no traffic.** The first request afterwards takes about a minute. Open the site a few minutes before any demo.
- **Render's free Postgres expires 30 days after creation** (14-day grace period, then it is deleted). For a link that must stay alive, use a free Postgres from another provider (Neon, Supabase) and check its current free-tier terms. The API only needs a `DATABASE_URL`, so any Postgres works.
- Free web services have no shell access. That is fine here: the first admin is created automatically from `FIRST_ADMIN_EMAIL`.

## 1. Create the database

Create a free Postgres project (for example on Neon) and copy its connection string. It looks like:

```
postgresql://USER:PASSWORD@HOST/DBNAME?sslmode=require
```

Keep it secret. It goes only into Render's environment settings, never into git.

## 2. Push the code

Push your branch to GitHub. You can deploy straight from the branch; merge to `main` after it works.

> **Before merging to `main`:** if the old BreatheESG services on Render auto-deploy from `main`, they will redeploy with the new code and fail. In each old service open **Settings → Build & Deploy** and turn **Auto-Deploy** off (or delete the service once NexESG works).

## 3. Create the services

1. Render dashboard → **New → Blueprint** → select the repo and branch.
2. Render reads `render.yaml` and asks for the values marked `sync: false`:

| Variable | Service | Value |
|----------|---------|-------|
| `DATABASE_URL` | nexesg-api | Postgres connection string from step 1 |
| `GOOGLE_CLIENT_ID` | nexesg-api | Your Google OAuth Client ID |
| `CORS_ALLOWED_ORIGINS` | nexesg-api | The frontend URL, e.g. `https://nexesg-web.onrender.com` (no trailing slash) |
| `REACT_APP_API_URL` | nexesg-web | The API URL plus `/api`, e.g. `https://nexesg-api.onrender.com/api` |
| `REACT_APP_GOOGLE_CLIENT_ID` | nexesg-web | The same Client ID |

The real URLs are only known after creation. If Render adds a suffix because a name is taken, open each service, correct the variables above, then redeploy. `REACT_APP_*` values are baked in at build time, so the static site must be **redeployed** (Manual Deploy → Clear build cache & deploy) after changing them.

## 4. Allow the site in Google

Google Cloud Console → **Credentials** → your OAuth client → **Authorized JavaScript origins** → add the frontend URL exactly, for example `https://nexesg-web.onrender.com` (https, no trailing slash, no path). Keep `http://localhost:3000` for local work. Changes can take a few minutes to apply.

## 5. Check it works

1. Open `https://<api-url>/api/auth/me/`. You should see `{"detail":"Authentication credentials were not provided."}`. That means the API is up.
2. Open the frontend URL and sign in with the `FIRST_ADMIN_EMAIL` account. You become **Admin**.
3. On **Users**, create a company, then sign in with a second Google account and assign it a role and company.

## 6. Let visitors sign in (demo workspaces)

With `AUTO_DEMO_SIGNUP=true` (the default in `render.yaml`), anyone who signs in with a verified Google account gets their **own private demo workspace**: a sandbox company filled with sample emission records and the **Demo** role. They can upload CSVs, approve, flag and reject records, but only inside their own workspace. They cannot see other visitors' or real data, and they cannot open the Users page.

- Your `FIRST_ADMIN_EMAIL` account is still created as **Admin**.
- To go back to manual approval, set `AUTO_DEMO_SIGNUP` to `false` on `nexesg-api`. New users then start as Pending until an Admin assigns a role.
- An Admin can still change any visitor's role and company on the **Users** page (for example, to make a real Analyst).
- Uploads are limited to 2 MB and 1,000 rows per file (`MAX_UPLOAD_BYTES`, `MAX_UPLOAD_ROWS`) so one visitor cannot fill a free database. Each new visitor also adds a small sandbox (about 12 records), so clean up old demo companies now and then.

**Google must allow strangers to sign in.** In Google Cloud Console, **OAuth consent screen**, check the publishing status. If it says **Testing**, only the test users you list can sign in. Click **Publish app** to move it to **In production**. For basic sign-in (email and profile) Google normally does not require a verification review, but confirm what the console shows for your project.

## 7. Sign in by email code (no Google account needed)

The login page also has **Email me a code**: the visitor types an email address, receives a 6-digit code (valid 10 minutes, one use, 5 attempts) and gets the same private demo workspace as a Google sign-in.

Render's free web services block outgoing SMTP, so the API sends mail through **Brevo's HTTPS API** (free plan, about 300 emails a day; check Brevo's current terms).

1. Create a free account at brevo.com.
2. **Senders, Domains & Dedicated IPs → Senders → Add a sender**: use an email address you own (for example your Gmail) and confirm the verification email Brevo sends.
3. **SMTP & API → API keys → Generate a new API key**. Copy it once.
4. On Render, `nexesg-api` → **Environment**, add:
   - `BREVO_API_KEY` = the key
   - `EMAIL_FROM` = the verified sender address
5. Save (the API redeploys), then open the site, choose **Email me a code** and check the inbox. **Look in spam the first time**: mail sent from a free Gmail address through a shared service is often filtered. A sender on your own domain (with Brevo's SPF/DKIM records) is much more reliable.

Without these two variables the page shows "Email sign-in is not set up on the server yet" and Google sign-in keeps working.

Limits that protect the free tiers: one code per email per minute, 5 codes per email per hour, 20 code requests per hour per address, and a code locks after 5 wrong guesses.

## Troubleshooting

| Symptom | Cause |
|---------|-------|
| Google says `origin_mismatch` or `no registered origin` | The site URL is not in **Authorized JavaScript origins**, or does not match exactly. |
| Google says "Access blocked: app not verified" or only some people can sign in | The consent screen is still in **Testing**. Publish it (section 6). |
| "Invalid Google token" | `GOOGLE_CLIENT_ID` on `nexesg-api` differs from `REACT_APP_GOOGLE_CLIENT_ID` on `nexesg-web`. |
| Browser console shows a CORS error | `CORS_ALLOWED_ORIGINS` on `nexesg-api` does not exactly match the frontend URL. |
| "Email sign-in is not set up on the server yet" | `BREVO_API_KEY` or `EMAIL_FROM` is missing on `nexesg-api` (section 7). |
| "Could not send the email" | Brevo rejected the request: the sender in `EMAIL_FROM` is not verified, the key is wrong, or the daily limit is used. Check Brevo's logs. |
| "Cannot reach the server" | The free API is waking up (wait about a minute) or `REACT_APP_API_URL` is wrong. |
| API fails to start | Check the deploy logs: usually `SECRET_KEY` or `DATABASE_URL` is missing or malformed. |
| Data disappears after a deploy | The API is using SQLite instead of Postgres: `DATABASE_URL` is not set. |

## Local development

Nothing changes locally: without `DATABASE_URL` the API uses SQLite, and `DEBUG=true` allows a development `SECRET_KEY`. See `backend/.env.example` and `frontend/.env.example`.
