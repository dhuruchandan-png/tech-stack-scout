-- Seed watchlist: 16 real companies. Paste into the Neon SQL editor after 0000_init.sql.
-- GitHub orgs and job-board slugs below were verified against the live APIs on 2026-10-11.
-- Freshworks' public code lives in github.com/freshworks-developers (not the empty freshworks-org).
-- Zerodha, Postman, Hasura, Chargebee, BrowserStack and HashiCorp have no public Greenhouse/Lever/Ashby board
-- under the guessed slugs, so they show "Not found" for jobs until an override is set.
-- Re-running is safe (domain is unique).

INSERT INTO companies (name, domain, github_org, github_match_confidence, job_board_provider, job_board_slug) VALUES
  ('Razorpay',     'razorpay.com',    'razorpay',    'high', 'greenhouse', 'razorpaysoftwareprivatelimited'),
  ('Zerodha',      'zerodha.com',     'zerodha',     'high', NULL, NULL),
  ('Postman',      'postman.com',     'postmanlabs', 'high', NULL, NULL),
  ('Hasura',       'hasura.io',       'hasura',      'high', NULL, NULL),
  ('Freshworks',   'freshworks.com',  'freshworks-developers', 'high', NULL, NULL),
  ('Chargebee',    'chargebee.com',   'chargebee',   'high', NULL, NULL),
  ('BrowserStack', 'browserstack.com','browserstack','high', NULL, NULL),
  ('Atlan',        'atlan.com',       'atlanhq',     'high', 'ashby', 'atlan'),
  ('Vercel',       'vercel.com',      'vercel',      'high', 'greenhouse', 'vercel'),
  ('Cloudflare',   'cloudflare.com',  'cloudflare',  'high', 'greenhouse', 'cloudflare'),
  ('Grafana Labs', 'grafana.com',     'grafana',     'high', 'greenhouse', 'grafanalabs'),
  ('PostHog',      'posthog.com',     'PostHog',     'high', 'ashby', 'posthog'),
  ('Sentry',       'sentry.io',       'getsentry',   'high', 'ashby', 'sentry'),
  ('Temporal',     'temporal.io',     'temporalio',  'high', 'ashby', 'temporal'),
  ('HashiCorp',    'hashicorp.com',   'hashicorp',   'high', NULL, NULL),
  ('Stripe',       'stripe.com',      'stripe',      'high', 'greenhouse', 'stripe')
ON CONFLICT (domain) DO NOTHING;
