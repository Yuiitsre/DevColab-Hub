# DevCollab Hub v3.0

Engineering operations, done together.

This repository is a clean-slate rebuild focused on production-grade performance, security, and GitHub-native CI/CD.

## Stack

| Layer | Tech |
|---|---|
| Runtime | Node.js 20 LTS |
| Web | React 18 + Next.js 14 + TypeScript 5 + Tailwind CSS 3 |
| API | Node.js 20 + Fastify + GraphQL (Mercurius) + Socket.io |
| DB | PostgreSQL 15 (Supabase-compatible) |
| Cache | Redis 7 |
| Containers | Docker + GitHub Container Registry |
| CI/CD | GitHub Actions + CodeQL + Dependabot + semantic-release |
| Design system | Tokens + Storybook + a11y addon |

## Repo Layout

- [apps/web](file:///c:/Users/shukl/Documents/trae_projects/DevColab-Hub/apps/web) — Next.js web app (SSR/ISR, image optimization, offline service worker)
- [apps/api](file:///c:/Users/shukl/Documents/trae_projects/DevColab-Hub/apps/api) — API server (GraphQL + webhooks + realtime)
- [apps/storybook](file:///c:/Users/shukl/Documents/trae_projects/DevColab-Hub/apps/storybook) — UI component explorer (deployable to GitHub Pages)
- [packages/ui](file:///c:/Users/shukl/Documents/trae_projects/DevColab-Hub/packages/ui) — shared UI components
- [packages/tokens](file:///c:/Users/shukl/Documents/trae_projects/DevColab-Hub/packages/tokens) — design tokens (Figma-export friendly)

## One-Click Local Setup (Environment Parity)

1. Copy environment variables
   - `apps/api/.env.example` → `apps/api/.env`
2. Start everything
   - `docker compose up --build`
3. Open
   - Web: `http://localhost:3000`
   - API: `http://localhost:4000/health`
   - GraphQL: `http://localhost:4000/graphiql` (non-production only)
   - App: `http://localhost:3000/app`

## GitHub OAuth

Create an OAuth app at `github.com/settings/developers` → OAuth Apps:
- Authorization callback URL: `https://YOUR_API_HOST/auth/github/callback`

## GitHub-Native CI/CD

- CI: `.github/workflows/ci.yml`
- CodeQL scanning: `.github/workflows/codeql.yml`
- Container publishing (GHCR): `.github/workflows/docker-ghcr.yml`
- Storybook on GitHub Pages: `.github/workflows/storybook-pages.yml`
- Automated releases: `.github/workflows/release.yml`
- PR previews (Vercel): `.github/workflows/vercel-preview.yml`
