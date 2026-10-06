# Production image for apps/api (docs/DECISIONS.md ADR-011).
# Build context: apps/api. One image serves two roles:
#   - default command: the API server (`/app/start.sh` -> `/app/api`;
#     with RUN_MIGRATIONS=true it migrates first, ADR-012)
#   - `/app/migrate ...`: golang-migrate with this image's own
#     migrations baked in, run as a one-shot before the API starts
#     (infra/docker/prod/compose.yml's `migrate` service) -- so a server
#     never needs the repo checked out, and the schema always matches the
#     code in the same image.

FROM golang:1.25-alpine AS build
WORKDIR /src
# Same golang-migrate release and build tag CI and local dev use.
RUN CGO_ENABLED=0 go install -tags postgres \
    github.com/golang-migrate/migrate/v4/cmd/migrate@v4.20.1
COPY go.mod go.sum ./
RUN go mod download
COPY . .
RUN CGO_ENABLED=0 go build -trimpath -ldflags='-s -w' -o /out/api ./cmd/api

FROM alpine:3.20
# ca-certificates: outbound HTTPS to Resend and Google OAuth.
RUN apk add --no-cache ca-certificates tzdata \
    && addgroup -S abro && adduser -S -G abro abro
WORKDIR /app
COPY --from=build /out/api /app/api
COPY --from=build /go/bin/migrate /app/migrate
COPY migrations /app/migrations
COPY --chmod=755 start.sh /app/start.sh
USER abro
ENV PORT=3201 NODE_ENV=production
EXPOSE 3201
CMD ["/app/start.sh"]
