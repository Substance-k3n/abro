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

Receipts live in the `s3-data` volume. Back that up too once the
receipt UI ships.

## 5. Useful commands

```sh
docker compose logs -f api web caddy     # follow logs
docker compose exec postgres psql -U abro abro
docker compose run --rm migrate          # re-run migrations by hand
```

## Known gaps (ADR-011)

- **Receipts:** presigned download URLs point at the internal S3 host.
  S3 needs a public hostname through Caddy before a receipt UI can work.
- **Recurring expenses:** no scheduler yet (ADR-005). Nothing generates
  them automatically.
