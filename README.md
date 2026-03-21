# DevCollab Hub v2.0

Enterprise Engineering Operations Platform — GitHub + Chat + Tasks + AI in one place.

## Quick Start

### 1. Database (Supabase)
- Create a project at [supabase.com](https://supabase.com)
- Go to SQL Editor → paste `database/schema.sql` → Run

### 2. Backend
```bash
cd backend
npm install
cp .env.example .env
# Fill in all values in .env
npm run generate-keys   # Generate JWT_SECRET, ENCRYPTION_KEY, WEBHOOK_SECRET
node server.js
```

### 3. Frontend
Deploy `frontend/index.html` to Vercel (no build step needed).

Set the `API_URL` env variable in Vercel to your backend URL.

### 4. GitHub OAuth
Create app at `github.com/settings/developers` → OAuth Apps
- Callback: `https://your-backend.onrender.com/api/auth/github/callback`

## Architecture
- **Backend**: Node.js + Express + Socket.io (single `server.js`)
- **Frontend**: Vanilla HTML/CSS/JS SPA (`index.html`)
- **Database**: PostgreSQL via Supabase
- **Auth**: GitHub OAuth + JWT
- **Encryption**: AES-256-GCM for all stored data
- **AI**: Gemini 2.0 Flash / 2.5 Pro

## Tech Stack
| Layer | Tech |
|-------|------|
| Runtime | Node.js 20 |
| HTTP | Express 4 |
| Realtime | Socket.io 4 |
| Database | Supabase (PostgreSQL 15) |
| Auth | GitHub OAuth + JWT (HS256) |
| Encryption | AES-256-GCM (built-in crypto) |
| AI | Google Gemini API |
| Frontend | Vanilla JS SPA |

## Security
- All DMs and private channel messages encrypted at rest
- GitHub access tokens encrypted before storage
- JWT tokens never stored in DB (hashed)
- Rate limiting on all endpoints
- CSRF protection via SameSite cookies
- Helmet security headers
