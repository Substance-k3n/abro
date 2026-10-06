# Deploying ABRO

How ABRO runs in production: one VPS running Docker Compose
(docs/DECISIONS.md ADR-011). Everything lives in `infra/docker/prod/`:

| Service            | What it does                                                    |
| ------------------ | --------------------------------------------------------------- |
| `caddy`            | HTTPS (automatic Let's Encrypt) for both hostnames              |
| `web`              | Next.js app (`apps/web/Dockerfile`)                             |
| `api`              | Go API (`apps/api/Dockerfile`)                                  |
| `migrate`          | One-shot: applies migrations from the api image, then exits     |
| `postgres`         | Database (no public port)                                       |
| `backup`           | Daily `pg_dump` into `infra/docker/prod/backups/`, 14 days kept |
| `s3` (+ 2 helpers) | RustFS receipt storage and its bucket (no public port)          |

## 1. One-time setup

1. **Server.** A small Linux VPS (2 GB RAM is plenty) with Docker Engine
   and the Compose plugin. Open ports 22, 80 and 443 only.
2. **DNS.** Point two records at the server, e.g. `app.<domain>` and
   `api.<domain>`. They must be subdomains of the same domain: the
   session cookie relies on web and API being the same site.
3. **Code.** Clone the repo on the server (or copy
   `infra/docker/prod/` and pull prebuilt images; see step 3).
4. **Config.** In `infra/docker/prod/`, copy `.env.example` to `.env` and
   fill it in:
   - `APP_DOMAIN`, `API_DOMAIN`, `ACME_EMAIL`;
   - `POSTGRES_PASSWORD` and the two `S3_*` keys. Generate them with
     `openssl rand -hex 32`; hex keeps them URL-safe.
   - `RESEND_API_KEY` and `RESEND_FROM_EMAIL`. The from-address's domain
     must be verified in Resend, or OTP emails won't send (without a key
     the codes only appear in `docker compose logs api`).
   - `GOOGLE_CLIENT_ID`/`SECRET` only if Google sign-in is wanted. Add
     `https://<API_DOMAIN>/auth/google/callback` as an authorised
     redirect URI in Google Cloud.

   `.env` is gitignored. Keep a copy somewhere safe, because the
   database password is in it.

## 2. First start

```sh
cd infra/docker/prod
docker compose up -d --build
docker compose ps            # migrate: exited (0); everything else: running/healthy
docker compose logs -f api   # "listening" and no errors
```

Then open `https://<APP_DOMAIN>` and sign in with an email code. The
first request can take a few seconds while Caddy gets certificates.

## 3. Updating

```sh
cd infra/docker/prod
git pull
docker compose up -d --build   # rebuilds changed images; migrate runs before api
```

Migrations only ever move forward on deploy. Roll back by redeploying
the previous commit; a down-migration is a manual, deliberate step.

To pull prebuilt images instead of building on the server, set
`WEB_IMAGE`/`API_IMAGE` in `.env` and run
`docker compose pull && docker compose up -d`. The web image has
`NEXT_PUBLIC_API_URL` baked in, so it must be built for this
`API_DOMAIN`.

## 4. Backups and restore

`backup` writes `backups/abro-YYYYMMDD-HHMM.dump` every 24 h and
deletes dumps older than 14 days. **Copy them off the server** (e.g. a
nightly `rsync` or `rclone` to other storage). A backup that only lives
on the server won't survive losing the server.

Restore into a fresh database:

```sh
docker compose stop api web
# abro/abro = POSTGRES_USER/POSTGRES_DB from .env
docker compose exec -T postgres pg_restore -U abro -d abro \
  --clean --if-exists < backups/abro-YYYYMMDD-HHMM.dump
docker compose start api web
```

Receipts live in the `s3-data` volume. Back that up too: the expense
detail screen can attach receipts now.

## 5. Useful commands

```sh
docker compose logs -f api web caddy     # follow logs
docker compose exec postgres psql -U abro abro
docker compose run --rm migrate          # re-run migrations by hand
```

## Known gaps (ADR-011)

- **Receipts:** presigned download URLs point at the internal S3 host.
  S3 needs a public hostname through Caddy before the receipt section on
  the expense detail screen can show images.
- **Recurring expenses:** no scheduler yet (ADR-005). Nothing generates
  them automatically.

---

# Free tier: Vercel + Render + Neon

A no-cost, no-card alternative to the VPS (docs/DECISIONS.md ADR-012).
It needs no domain, since every service gives you a subdomain. Good for an MVP or
demo. Move to the VPS stack above when the limits below start to hurt.

| Piece    | Where  | Notes                                                 |
| -------- | ------ | ----------------------------------------------------- |
| web      | Vercel | `https://<project>.vercel.app`                        |
| api      | Render | Free web service from `render.yaml`; sleeps when idle |
| postgres | Neon   | Free project                                          |

The browser only ever talks to the Vercel URL. `apps/web/next.config.mjs`
forwards `/api/*` to Render, so the session cookie stays first-party
and the API's `SameSite=Lax` cookie keeps working.

Sign up for each with your GitHub account. Replace `<project>` below
with your real Vercel project name. You can't know it until step 3,
so steps 2 and 3 loop once.

## 1. Neon (database)

1. Create a project (region close to your Render region, e.g. AWS
   Frankfurt with Render Frankfurt).
2. Copy the connection string. It looks like
   `postgresql://user:pass@ep-xxx.eu-central-1.aws.neon.tech/neondb?sslmode=require`.
   Use the **direct** (non-pooled) one: migrations take locks that a
   pooler can break.

## 2. Render (api)

1. **New → Blueprint**, pick this repo and the branch to deploy. Render
   reads `render.yaml`.
2. Fill in the prompted values:
   - `DATABASE_URL`: the Neon string from step 1
   - `WEB_ORIGIN`: `https://<project>.vercel.app` (a placeholder is
     fine for now. Fix it after step 3.)
   - `GOOGLE_CALLBACK_URL`: `https://<project>.vercel.app/api/auth/google/callback`
   - The rest can stay empty (see "Sign-in" below).
3. Deploy. The container runs migrations first (`RUN_MIGRATIONS=true`
   → `apps/api/start.sh`), then starts the API. Check the log for the
   migrate output, then note the URL, e.g. `https://abro-api.onrender.com`.

## 3. Vercel (web)

1. **Add New → Project**, import this repo.
2. **Root Directory:** `apps/web`. Framework preset Next.js.
   `apps/web/vercel.json` already sets the install and build commands
   (turbo builds `@abro/types` first).
3. Environment variables (Production):
   - `NEXT_PUBLIC_API_URL` = `/api`
   - `API_PROXY_TARGET` = the Render URL from step 2 (no trailing slash)
4. Deploy. If the project name differs from what you guessed, update
   `WEB_ORIGIN` and `GOOGLE_CALLBACK_URL` on Render (saving redeploys it).

Both env vars are read at **build** time, so changing either one needs
a Vercel redeploy.

## Sign-in on the free tier

- **Email OTP:** with no mailer configured, codes are only printed in the
  Render log. Resend needs a verified domain to email other people.
  Without a domain, use **Brevo** (ADR-013, free, 300 emails/day):
  1. Sign up at brevo.com (no card).
  2. **Senders, Domains & Dedicated IPs → Senders → Add a sender** with
     your own email (e.g. your Gmail), then confirm it from your inbox.
  3. **SMTP & API → API Keys → Generate a new API key.**
  4. On Render set `BREVO_API_KEY` = the key and `BREVO_SENDER_EMAIL` =
     the verified address, and leave the `RESEND_*` vars empty.
  5. The API log should say `OTP email: Brevo` after the restart. A
     failed send logs `ERROR POST /auth/otp/request: brevo returned ...`
     with Brevo's reason.

  Mail from a Gmail sender sent through Brevo may land in spam at first.
  A domain of your own fixes that later.

- **Google:** create an OAuth client (Web application) in Google Cloud
  Console with the authorized redirect URI
  `https://<project>.vercel.app/api/auth/google/callback`, then set
  `GOOGLE_CLIENT_ID`/`GOOGLE_CLIENT_SECRET` on Render. This is the
  practical way to let other people sign in without a domain.

  A new OAuth app starts in **Testing** mode, where only the Google
  accounts listed under "Test users" can sign in. Everyone else gets
  "Access blocked". To open it up, go to Google Auth Platform → Audience
  and click **Publish app**. ABRO only asks for `openid email profile`,
  which Google doesn't review, so publishing takes effect right away.

  A failed attempt lands back on `/auth/signin?error=<reason>` with a
  message (`google_cancelled`, `google_unverified`, `oauth_state`,
  `google`). For `google`, the cause is in the Render log as
  `ERROR GET /auth/google/callback: ...`.

## Free-tier limits

- **Cold starts:** Render's free service sleeps after ~15 min idle. The
  first request after that takes ~30-60 s.
- **Backups:** Neon keeps a short restore window on the free plan. There's no
  `backup` service here. Take a manual `pg_dump "$DATABASE_URL"` before
  anything risky.
- **Receipts:** no S3 is configured, so the expense detail screen's
  receipt section says "Receipts aren't available on this server yet"
  (the API answers 501). To turn receipts on, create a **private**
  S3-compatible bucket (e.g. Backblaze B2, or Cloudflare R2) and an
  application key limited to that bucket, then set on Render:
  - `S3_ENDPOINT` -- the provider's S3 endpoint, with `https://`
    (B2: `https://s3.<region>.backblazeb2.com`)
  - `S3_REGION` -- the bucket's region (B2: e.g. `eu-central-003`;
    R2: `auto`)
  - `S3_ACCESS_KEY_ID` / `S3_SECRET_ACCESS_KEY` -- the key's ID and secret
  - `RECEIPTS_BUCKET` -- the bucket name

  Images load in the browser through 5-minute presigned URLs, so the
  bucket stays private and needs no CORS rule. Not yet verified: whether
  Vercel's `/api` proxy accepts uploads near the 10 MB receipt limit;
  check with a large photo after the first deploy.

- **Client IPs** in session metadata are whatever Vercel forwards in
  `X-Forwarded-For` (chi's `RealIP`). They're informational only.
