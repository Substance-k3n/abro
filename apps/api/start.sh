#!/bin/sh
# Container entrypoint (docs/DECISIONS.md ADR-012). With RUN_MIGRATIONS=true
# the image applies its own baked-in migrations before starting the API --
# for hosts with no separate one-shot/pre-deploy step (Render's free plan).
# The VPS compose stack leaves it unset and keeps its `migrate` service.
set -e

if [ "$RUN_MIGRATIONS" = "true" ]; then
  /app/migrate -path /app/migrations -database "$DATABASE_URL" up
fi

exec /app/api
