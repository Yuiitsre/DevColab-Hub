-- DevCollab Hub v2.0 — Seed Data
-- No demo users. Tables are populated via the application.
-- Run this after schema.sql to ensure everything is clean.

-- Verify tables exist
SELECT table_name FROM information_schema.tables 
WHERE table_schema = 'public' 
ORDER BY table_name;
