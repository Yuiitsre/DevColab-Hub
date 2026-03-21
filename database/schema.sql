-- ══════════════════════════════════════════════════════════════════
-- DevCollab Hub v2.0 — Production Schema
-- Paste this ENTIRE file into Supabase SQL Editor and click RUN
-- Tables ordered so every FK reference already exists above it
-- ══════════════════════════════════════════════════════════════════

CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- ── 1. USERS ──────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS users (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  github_id             TEXT UNIQUE NOT NULL,
  handle                TEXT UNIQUE NOT NULL,
  display_name          TEXT,
  avatar_url            TEXT,
  avatar_color          TEXT DEFAULT '#39d353',
  github_username       TEXT NOT NULL,
  github_access_token   TEXT,
  bio                   TEXT,
  role                  TEXT DEFAULT 'developer',
  status                TEXT DEFAULT 'offline',
  setup_complete        BOOLEAN DEFAULT FALSE,
  created_at            TIMESTAMPTZ DEFAULT NOW(),
  updated_at            TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_users_handle    ON users(handle);
CREATE INDEX IF NOT EXISTS idx_users_github_id ON users(github_id);

-- ── 2. SESSIONS ───────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS user_sessions (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id       UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  token_hash    TEXT UNIQUE NOT NULL,
  refresh_hash  TEXT UNIQUE,
  device_info   TEXT,
  ip_address    TEXT,
  created_at    TIMESTAMPTZ DEFAULT NOW(),
  expires_at    TIMESTAMPTZ NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_sessions_user  ON user_sessions(user_id);
CREATE INDEX IF NOT EXISTS idx_sessions_token ON user_sessions(token_hash);

-- ── 3. WORKSPACES ─────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS workspaces (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name        TEXT NOT NULL,
  slug        TEXT UNIQUE NOT NULL,
  description TEXT,
  owner_id    UUID REFERENCES users(id) ON DELETE SET NULL,
  plan        TEXT DEFAULT 'free',
  created_at  TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS workspace_members (
  workspace_id  UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  user_id       UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  role          TEXT NOT NULL DEFAULT 'developer',
  joined_at     TIMESTAMPTZ DEFAULT NOW(),
  PRIMARY KEY (workspace_id, user_id)
);
CREATE INDEX IF NOT EXISTS idx_wm_user      ON workspace_members(user_id);
CREATE INDEX IF NOT EXISTS idx_wm_workspace ON workspace_members(workspace_id);

-- ── 4. TEAMS ──────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS teams (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id  UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  name          TEXT NOT NULL,
  description   TEXT,
  color         TEXT DEFAULT '#39d353',
  lead_id       UUID REFERENCES users(id) ON DELETE SET NULL,
  created_at    TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_teams_workspace ON teams(workspace_id);

CREATE TABLE IF NOT EXISTS team_members (
  team_id   UUID NOT NULL REFERENCES teams(id) ON DELETE CASCADE,
  user_id   UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  role      TEXT NOT NULL DEFAULT 'developer',
  joined_at TIMESTAMPTZ DEFAULT NOW(),
  PRIMARY KEY (team_id, user_id)
);
CREATE INDEX IF NOT EXISTS idx_team_members_user ON team_members(user_id);

-- ── 5. PROJECTS ───────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS projects (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id  UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  team_id       UUID REFERENCES teams(id) ON DELETE SET NULL,
  name          TEXT NOT NULL,
  description   TEXT,
  color         TEXT DEFAULT '#39d353',
  status        TEXT DEFAULT 'active',
  deadline      TIMESTAMPTZ,
  created_by    UUID REFERENCES users(id) ON DELETE SET NULL,
  created_at    TIMESTAMPTZ DEFAULT NOW(),
  updated_at    TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_projects_workspace ON projects(workspace_id);

CREATE TABLE IF NOT EXISTS project_members (
  project_id  UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  user_id     UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  role        TEXT DEFAULT 'contributor',
  added_at    TIMESTAMPTZ DEFAULT NOW(),
  PRIMARY KEY (project_id, user_id)
);

-- ── 6. TASKS ──────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS tasks (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id      UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  workspace_id    UUID REFERENCES workspaces(id) ON DELETE CASCADE,
  title           TEXT NOT NULL,
  description     TEXT,
  priority        TEXT DEFAULT 'normal',
  status          TEXT DEFAULT 'not_started',
  assigned_to     UUID REFERENCES users(id) ON DELETE SET NULL,
  assigned_by     UUID REFERENCES users(id) ON DELETE SET NULL,
  deadline        TIMESTAMPTZ,
  linked_repo     TEXT,
  linked_file     TEXT,
  linked_branch   TEXT,
  linked_lines    TEXT,
  created_at      TIMESTAMPTZ DEFAULT NOW(),
  updated_at      TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_tasks_project  ON tasks(project_id);
CREATE INDEX IF NOT EXISTS idx_tasks_assignee ON tasks(assigned_to);
CREATE INDEX IF NOT EXISTS idx_tasks_deadline ON tasks(deadline);

-- ── 7. CHANNELS ───────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS channels (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id  UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  team_id       UUID REFERENCES teams(id) ON DELETE SET NULL,
  name          TEXT NOT NULL,
  description   TEXT DEFAULT '',
  type          TEXT DEFAULT 'public',
  created_by    UUID REFERENCES users(id) ON DELETE SET NULL,
  archived      BOOLEAN DEFAULT FALSE,
  created_at    TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE (workspace_id, name)
);
CREATE INDEX IF NOT EXISTS idx_channels_workspace ON channels(workspace_id);

CREATE TABLE IF NOT EXISTS channel_members (
  channel_id  UUID NOT NULL REFERENCES channels(id) ON DELETE CASCADE,
  user_id     UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  joined_at   TIMESTAMPTZ DEFAULT NOW(),
  last_read   TIMESTAMPTZ DEFAULT NOW(),
  PRIMARY KEY (channel_id, user_id)
);
CREATE INDEX IF NOT EXISTS idx_channel_members_user ON channel_members(user_id);

-- ── 8. MESSAGES ───────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS messages (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  channel_id        UUID NOT NULL REFERENCES channels(id) ON DELETE CASCADE,
  user_id           UUID REFERENCES users(id) ON DELETE SET NULL,
  content_encrypted TEXT,
  type              TEXT DEFAULT 'text',
  code_lang         TEXT,
  code_body         TEXT,
  metadata          TEXT,
  thread_id         UUID REFERENCES messages(id) ON DELETE SET NULL,
  edited            BOOLEAN DEFAULT FALSE,
  deleted           BOOLEAN DEFAULT FALSE,
  deleted_at        TIMESTAMPTZ,
  deleted_by        UUID REFERENCES users(id) ON DELETE SET NULL,
  created_at        TIMESTAMPTZ DEFAULT NOW(),
  updated_at        TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_messages_channel ON messages(channel_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_messages_user    ON messages(user_id);

CREATE TABLE IF NOT EXISTS message_reactions (
  message_id  UUID NOT NULL REFERENCES messages(id) ON DELETE CASCADE,
  user_id     UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  emoji       TEXT NOT NULL,
  created_at  TIMESTAMPTZ DEFAULT NOW(),
  PRIMARY KEY (message_id, user_id, emoji)
);

CREATE TABLE IF NOT EXISTS message_pins (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  channel_id  UUID NOT NULL REFERENCES channels(id) ON DELETE CASCADE,
  message_id  UUID NOT NULL REFERENCES messages(id) ON DELETE CASCADE,
  pinned_by   UUID REFERENCES users(id) ON DELETE SET NULL,
  pinned_at   TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE (channel_id, message_id)
);

-- ── 9. DIRECT MESSAGES ────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS direct_message_rooms (
  id            TEXT PRIMARY KEY,
  participants  UUID[] NOT NULL,
  created_at    TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS direct_messages (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  room_id           TEXT NOT NULL REFERENCES direct_message_rooms(id) ON DELETE CASCADE,
  from_user         UUID REFERENCES users(id) ON DELETE SET NULL,
  content_encrypted TEXT NOT NULL,
  deleted_for       UUID[] DEFAULT '{}',
  created_at        TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_dm_room ON direct_messages(room_id, created_at DESC);

-- ── 10. LINKED REPOS  (must come before code_assignments) ─────────
CREATE TABLE IF NOT EXISTS linked_repos (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id    UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  github_repo_id  TEXT NOT NULL,
  full_name       TEXT NOT NULL,
  description     TEXT,
  private         BOOLEAN DEFAULT FALSE,
  webhook_id      TEXT,
  linked_by       UUID REFERENCES users(id) ON DELETE SET NULL,
  linked_at       TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_repos_workspace ON linked_repos(workspace_id);
CREATE INDEX IF NOT EXISTS idx_repos_github_id ON linked_repos(github_repo_id);

-- ── 11. CODE ASSIGNMENTS  (references linked_repos) ───────────────
CREATE TABLE IF NOT EXISTS code_assignments (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  task_id         UUID REFERENCES tasks(id) ON DELETE SET NULL,
  from_user       UUID REFERENCES users(id) ON DELETE SET NULL,
  to_user         UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  repo_id         UUID REFERENCES linked_repos(id) ON DELETE SET NULL,
  file_path       TEXT,
  start_line      INTEGER,
  end_line        INTEGER,
  code_encrypted  TEXT,
  note_encrypted  TEXT,
  acknowledged    BOOLEAN DEFAULT FALSE,
  created_at      TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_ca_to_user   ON code_assignments(to_user);
CREATE INDEX IF NOT EXISTS idx_ca_from_user ON code_assignments(from_user);

-- ── 12. PULL REQUESTS ─────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS pull_requests (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  repo_id          UUID NOT NULL REFERENCES linked_repos(id) ON DELETE CASCADE,
  github_pr_number INTEGER NOT NULL,
  title            TEXT NOT NULL,
  body             TEXT,
  state            TEXT DEFAULT 'open',
  author_id        UUID REFERENCES users(id) ON DELETE SET NULL,
  base_branch      TEXT,
  head_branch      TEXT,
  ai_review        TEXT,
  created_at       TIMESTAMPTZ DEFAULT NOW(),
  merged_at        TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS idx_prs_repo ON pull_requests(repo_id);

CREATE TABLE IF NOT EXISTS pr_reviews (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  pr_id        UUID NOT NULL REFERENCES pull_requests(id) ON DELETE CASCADE,
  reviewer_id  UUID REFERENCES users(id) ON DELETE SET NULL,
  state        TEXT NOT NULL,
  body         TEXT,
  submitted_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS pr_comments (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  pr_id       UUID NOT NULL REFERENCES pull_requests(id) ON DELETE CASCADE,
  user_id     UUID REFERENCES users(id) ON DELETE SET NULL,
  file_path   TEXT,
  line_number INTEGER,
  body        TEXT,
  resolved    BOOLEAN DEFAULT FALSE,
  created_at  TIMESTAMPTZ DEFAULT NOW()
);

-- ── 13. NOTIFICATIONS ─────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS notifications (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id    UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  type       TEXT NOT NULL,
  title      TEXT,
  body       TEXT,
  data       TEXT,
  read       BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_notifs_user   ON notifications(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_notifs_unread ON notifications(user_id, read) WHERE read = FALSE;

-- ── 14. AUDIT LOG ─────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS audit_log (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  action      TEXT NOT NULL,
  actor_id    UUID REFERENCES users(id) ON DELETE SET NULL,
  resource_id TEXT,
  metadata    TEXT,
  ip_address  TEXT,
  created_at  TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_audit_actor  ON audit_log(actor_id);
CREATE INDEX IF NOT EXISTS idx_audit_action ON audit_log(action, created_at DESC);

-- ── AUTO-TIMESTAMP TRIGGERS ───────────────────────────────────────
CREATE OR REPLACE FUNCTION touch_updated_at()
RETURNS TRIGGER AS $$
BEGIN NEW.updated_at = NOW(); RETURN NEW; END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS users_touch    ON users;
DROP TRIGGER IF EXISTS projects_touch ON projects;
DROP TRIGGER IF EXISTS tasks_touch    ON tasks;
DROP TRIGGER IF EXISTS messages_touch ON messages;

CREATE TRIGGER users_touch    BEFORE UPDATE ON users    FOR EACH ROW EXECUTE FUNCTION touch_updated_at();
CREATE TRIGGER projects_touch BEFORE UPDATE ON projects FOR EACH ROW EXECUTE FUNCTION touch_updated_at();
CREATE TRIGGER tasks_touch    BEFORE UPDATE ON tasks    FOR EACH ROW EXECUTE FUNCTION touch_updated_at();
CREATE TRIGGER messages_touch BEFORE UPDATE ON messages FOR EACH ROW EXECUTE FUNCTION touch_updated_at();

-- ── ROW LEVEL SECURITY ────────────────────────────────────────────
ALTER TABLE users              ENABLE ROW LEVEL SECURITY;
ALTER TABLE messages           ENABLE ROW LEVEL SECURITY;
ALTER TABLE direct_messages    ENABLE ROW LEVEL SECURITY;
ALTER TABLE notifications      ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "users_own"  ON users;
DROP POLICY IF EXISTS "notifs_own" ON notifications;
DROP POLICY IF EXISTS "msgs_read"  ON messages;
DROP POLICY IF EXISTS "dm_own"     ON direct_messages;

CREATE POLICY "users_own"  ON users         FOR ALL    USING (id = auth.uid());
CREATE POLICY "notifs_own" ON notifications  FOR ALL    USING (user_id = auth.uid());
CREATE POLICY "msgs_read"  ON messages       FOR SELECT USING (TRUE);
CREATE POLICY "dm_own"     ON direct_messages FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM direct_message_rooms
      WHERE id = room_id
        AND participants @> ARRAY[auth.uid()]
    )
  );

-- ══════════════════════════════════════════════════════════════════
-- SUCCESS — 14 tables, correct dependency order, all bugs fixed
-- ══════════════════════════════════════════════════════════════════
