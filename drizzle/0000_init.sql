-- Tech Stack Scout: initial schema (Neon / any Postgres).
-- Paste into the Neon SQL editor and run once. Mirrors src/db/schema.ts exactly.
-- Safe to re-run: every statement is IF NOT EXISTS.

CREATE TABLE IF NOT EXISTS companies (
  id                      serial PRIMARY KEY,
  name                    text NOT NULL,
  domain                  text NOT NULL,
  active                  boolean NOT NULL DEFAULT true,
  added_at                timestamptz NOT NULL DEFAULT now(),
  removed_at              timestamptz,
  github_org              text,
  github_match_confidence text,
  github_candidates       jsonb,
  job_board_provider      text,
  job_board_slug          text,
  blog_rss_url            text,
  youtube_query           text,
  hubspot_company_id      text,
  notes                   text
);
CREATE UNIQUE INDEX IF NOT EXISTS companies_domain_uq ON companies (domain);

CREATE TABLE IF NOT EXISTS runs (
  id            serial PRIMARY KEY,
  company_id    integer NOT NULL REFERENCES companies(id),
  trigger       text NOT NULL,
  status        text NOT NULL DEFAULT 'queued',
  started_at    timestamptz NOT NULL DEFAULT now(),
  finished_at   timestamptz,
  error         text,
  gemini_tokens integer,
  cost_usd      real
);

CREATE TABLE IF NOT EXISTS run_steps (
  id          serial PRIMARY KEY,
  run_id      integer NOT NULL REFERENCES runs(id),
  step        text NOT NULL,
  status      text NOT NULL,
  detail      text,
  duration_ms integer,
  at          timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS run_steps_run_idx ON run_steps (run_id);

CREATE TABLE IF NOT EXISTS snapshots (
  id                serial PRIMARY KEY,
  company_id        integer NOT NULL REFERENCES companies(id),
  run_id            integer REFERENCES runs(id),
  week_of           text NOT NULL,
  languages         jsonb,
  infra             jsonb,
  microservices     jsonb,
  activity          jsonb,
  commit_series     jsonb,
  confidence        text,
  confidence_reason text,
  source_status     jsonb,
  changes           jsonb,
  created_at        timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS snapshots_company_idx ON snapshots (company_id, created_at);

CREATE TABLE IF NOT EXISTS evidence (
  id          serial PRIMARY KEY,
  ref         text NOT NULL,
  company_id  integer NOT NULL REFERENCES companies(id),
  snapshot_id integer NOT NULL REFERENCES snapshots(id),
  source      text NOT NULL,
  kind        text NOT NULL,
  title       text NOT NULL,
  snippet     text NOT NULL DEFAULT '',
  url         text NOT NULL,
  observed_at timestamptz,
  meta        jsonb
);
CREATE INDEX IF NOT EXISTS evidence_snapshot_idx ON evidence (snapshot_id);

CREATE TABLE IF NOT EXISTS briefs (
  snapshot_id         integer PRIMARY KEY REFERENCES snapshots(id),
  summary_p1          text,
  summary_p2          text,
  opener_text         text,
  opener_evidence_ids jsonb,
  hook_type           text,
  talking_points      jsonb,
  unknowns            jsonb,
  check_status        text,
  check_reasons       jsonb,
  model               text,
  input_tokens        integer,
  output_tokens       integer,
  cost_usd            real,
  created_at          timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS drafts (
  id                    serial PRIMARY KEY,
  company_id            integer NOT NULL REFERENCES companies(id),
  snapshot_id           integer REFERENCES snapshots(id),
  recipient_name        text,
  recipient_email       text,
  subject               text NOT NULL DEFAULT '',
  body                  text NOT NULL DEFAULT '',
  evidence_ids          jsonb,
  status                text NOT NULL DEFAULT 'draft',
  check_status          text,
  check_reasons         jsonb,
  internal_reviewers    jsonb,
  approved_at           timestamptz,
  approved_by           text,
  opened_in_mail_at     timestamptz,
  sent_logged_at        timestamptz,
  hubspot_engagement_id text,
  created_at            timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS internal_sends (
  id        serial PRIMARY KEY,
  draft_id  integer REFERENCES drafts(id),
  "to"      text NOT NULL,
  resend_id text,
  sent_at   timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS hubspot_sync (
  id         serial PRIMARY KEY,
  company_id integer NOT NULL REFERENCES companies(id),
  kind       text NOT NULL,
  status     text NOT NULL,
  error      text,
  at         timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS settings (
  id                 integer PRIMARY KEY DEFAULT 1,
  product_notes      text,
  internal_allowlist jsonb DEFAULT '[]'::jsonb,
  brief_recipients   jsonb DEFAULT '[]'::jsonb
);
INSERT INTO settings (id) VALUES (1) ON CONFLICT (id) DO NOTHING;

CREATE TABLE IF NOT EXISTS qa_messages (
  id           serial PRIMARY KEY,
  company_id   integer NOT NULL REFERENCES companies(id),
  question     text NOT NULL,
  answer       text NOT NULL,
  evidence_ids jsonb,
  created_at   timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS source_cache (
  company_id integer NOT NULL,
  source     text NOT NULL,
  payload    jsonb NOT NULL,
  fetched_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (company_id, source)
);
