# Operations

## Environments

| Environment | Web | API | DB | Cache |
|---|---|---|---|---|
| Local | Docker Compose | Docker Compose | Postgres 15 | Redis 7 |
| Staging | Vercel Preview | Render (staging service) | Supabase (staging project) | Redis 7 |
| Production | Vercel Production | Render (prod service) | Supabase (prod project) | Redis 7 |

## Staging Pipeline

1. Pull request opens
   - CI runs lint/typecheck/tests/build
   - Vercel Preview deploy posts a preview URL to the PR
2. Merge to `main`
   - Containers publish to GHCR
   - Production deploy triggers (Render deploy hook + Vercel production)

## Rollback Strategy

- Web (Vercel): rollback by promoting a previous deployment in the Vercel dashboard
- API (Render): rollback by redeploying the previous image tag from GHCR or using Render rollback
- DB (Supabase): use migration-based changes; never mutate schema by hand in production

## Blue-Green Deployments

Blue-green is implemented at the API layer using two Render services (blue + green) pointing at the same database:
- Deploy new version to idle color
- Run smoke checks against the idle service
- Switch traffic at DNS / reverse proxy layer
- Keep old color available for instant rollback

## Observability

- OpenTelemetry: export traces to an OTLP endpoint (Grafana Tempo or equivalent)
- Metrics: scrape Fastify/Node metrics via a collector and forward to Grafana
- Errors: Sentry for both web and API, with release tags from CI

