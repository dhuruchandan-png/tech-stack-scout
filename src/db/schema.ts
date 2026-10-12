import {
  pgTable, serial, text, boolean, timestamp, integer, jsonb, real, uniqueIndex, index, primaryKey,
} from "drizzle-orm/pg-core";

export const companies = pgTable(
  "companies",
  {
    id: serial("id").primaryKey(),
    name: text("name").notNull(),
    domain: text("domain").notNull(),
    active: boolean("active").notNull().default(true),
    addedAt: timestamp("added_at", { withTimezone: true }).notNull().defaultNow(),
    removedAt: timestamp("removed_at", { withTimezone: true }),
    githubOrg: text("github_org"),
    githubMatchConfidence: text("github_match_confidence"), // high | medium | low
    githubCandidates: jsonb("github_candidates").$type<GithubCandidate[]>(),
    jobBoardProvider: text("job_board_provider"), // greenhouse | lever | ashby
    jobBoardSlug: text("job_board_slug"),
    blogRssUrl: text("blog_rss_url"),
    youtubeQuery: text("youtube_query"),
    hubspotCompanyId: text("hubspot_company_id"),
    notes: text("notes"),
  },
  (t) => [uniqueIndex("companies_domain_uq").on(t.domain)],
);

export const runs = pgTable("runs", {
  id: serial("id").primaryKey(),
  companyId: integer("company_id").notNull().references(() => companies.id),
  trigger: text("trigger").notNull(), // cron | manual | bulk
  status: text("status").notNull().default("queued"), // queued | running | done | partial | failed
  startedAt: timestamp("started_at", { withTimezone: true }).notNull().defaultNow(),
  finishedAt: timestamp("finished_at", { withTimezone: true }),
  error: text("error"),
  geminiTokens: integer("gemini_tokens"),
  costUsd: real("cost_usd"),
});

export const runSteps = pgTable(
  "run_steps",
  {
    id: serial("id").primaryKey(),
    runId: integer("run_id").notNull().references(() => runs.id),
    step: text("step").notNull(),
    status: text("status").notNull(), // running | ok | warn | fail | skipped
    detail: text("detail"),
    durationMs: integer("duration_ms"),
    at: timestamp("at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("run_steps_run_idx").on(t.runId)],
);

export const snapshots = pgTable(
  "snapshots",
  {
    id: serial("id").primaryKey(),
    companyId: integer("company_id").notNull().references(() => companies.id),
    runId: integer("run_id").references(() => runs.id),
    weekOf: text("week_of").notNull(), // ISO date of Monday
    languages: jsonb("languages").$type<LanguageShare[]>(),
    infra: jsonb("infra").$type<InfraResult>(),
    microservices: jsonb("microservices").$type<MicroservicesResult>(),
    activity: jsonb("activity").$type<ActivityResult>(),
    commitSeries: jsonb("commit_series").$type<number[]>(),
    confidence: text("confidence"), // high | medium | low
    confidenceReason: text("confidence_reason"),
    sourceStatus: jsonb("source_status").$type<Record<string, SourceStatus>>(),
    changes: jsonb("changes").$type<ChangeItem[]>(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("snapshots_company_idx").on(t.companyId, t.createdAt)],
);

export const evidence = pgTable(
  "evidence",
  {
    id: serial("id").primaryKey(),
    ref: text("ref").notNull(), // "E12", unique within a snapshot
    companyId: integer("company_id").notNull().references(() => companies.id),
    snapshotId: integer("snapshot_id").notNull().references(() => snapshots.id),
    source: text("source").notNull(), // github | jobs | blog | youtube | hn
    kind: text("kind").notNull(),
    title: text("title").notNull(),
    snippet: text("snippet").notNull().default(""),
    url: text("url").notNull(),
    observedAt: timestamp("observed_at", { withTimezone: true }),
    meta: jsonb("meta").$type<Record<string, unknown>>(),
  },
  (t) => [index("evidence_snapshot_idx").on(t.snapshotId)],
);

export const briefs = pgTable("briefs", {
  snapshotId: integer("snapshot_id").primaryKey().references(() => snapshots.id),
  summaryP1: text("summary_p1"),
  summaryP2: text("summary_p2"),
  openerText: text("opener_text"),
  openerEvidenceIds: jsonb("opener_evidence_ids").$type<string[]>(),
  hookType: text("hook_type"),
  talkingPoints: jsonb("talking_points").$type<{ text: string; evidence_ids: string[] }[]>(),
  unknowns: jsonb("unknowns").$type<string[]>(),
  checkStatus: text("check_status"), // verified | needs_review | pending
  checkReasons: jsonb("check_reasons").$type<string[]>(),
  model: text("model"),
  inputTokens: integer("input_tokens"),
  outputTokens: integer("output_tokens"),
  costUsd: real("cost_usd"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const drafts = pgTable("drafts", {
  id: serial("id").primaryKey(),
  companyId: integer("company_id").notNull().references(() => companies.id),
  snapshotId: integer("snapshot_id").references(() => snapshots.id),
  recipientName: text("recipient_name"),
  recipientEmail: text("recipient_email"),
  subject: text("subject").notNull().default(""),
  body: text("body").notNull().default(""),
  evidenceIds: jsonb("evidence_ids").$type<string[]>(),
  // draft | internal_review | approved | opened | sent | replaced (superseded by a newer draft for the same account)
  status: text("status").notNull().default("draft"),
  checkStatus: text("check_status"),
  checkReasons: jsonb("check_reasons").$type<string[]>(),
  internalReviewers: jsonb("internal_reviewers").$type<string[]>(),
  approvedAt: timestamp("approved_at", { withTimezone: true }),
  approvedBy: text("approved_by"),
  openedInMailAt: timestamp("opened_in_mail_at", { withTimezone: true }),
  sentLoggedAt: timestamp("sent_logged_at", { withTimezone: true }),
  hubspotEngagementId: text("hubspot_engagement_id"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const internalSends = pgTable("internal_sends", {
  id: serial("id").primaryKey(),
  draftId: integer("draft_id").references(() => drafts.id),
  to: text("to").notNull(),
  resendId: text("resend_id"),
  sentAt: timestamp("sent_at", { withTimezone: true }).notNull().defaultNow(),
});

export const hubspotSync = pgTable("hubspot_sync", {
  id: serial("id").primaryKey(),
  companyId: integer("company_id").notNull().references(() => companies.id),
  kind: text("kind").notNull(), // facts | approved_text | email_log
  status: text("status").notNull(), // synced | pending | failed
  error: text("error"),
  at: timestamp("at", { withTimezone: true }).notNull().defaultNow(),
});

export const settings = pgTable("settings", {
  id: integer("id").primaryKey().default(1),
  productNotes: text("product_notes"),
  internalAllowlist: jsonb("internal_allowlist").$type<string[]>().default([]),
  briefRecipients: jsonb("brief_recipients").$type<string[]>().default([]),
});

export const qaMessages = pgTable("qa_messages", {
  id: serial("id").primaryKey(),
  companyId: integer("company_id").notNull().references(() => companies.id),
  question: text("question").notNull(),
  answer: text("answer").notNull(),
  evidenceIds: jsonb("evidence_ids").$type<string[]>(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

// Raw API response cache (6h) so repeated "Refresh now" taps don't hammer the APIs.
export const sourceCache = pgTable(
  "source_cache",
  {
    companyId: integer("company_id").notNull(),
    source: text("source").notNull(),
    payload: jsonb("payload").notNull(),
    fetchedAt: timestamp("fetched_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [primaryKey({ columns: [t.companyId, t.source] })],
);

/* ---------- shared JSON types ---------- */
export type SourceStatus = {
  state: "ok" | "not_found" | "failed" | "skipped";
  staleSince?: string;
  detail?: string;
};
export type GithubCandidate = {
  login: string; avatarUrl?: string; description?: string; website?: string;
  repoCount?: number; confidence: "high" | "medium" | "low";
};
export type LanguageShare = { name: string; color: string; bytes: number; share: number; repoCount?: number };
export type InfraItem = {
  category: "containers" | "orchestration" | "iac" | "cicd" | "platform" | "rpc" | "sdk";
  tool: string; repo?: string; path?: string; url?: string;
};
/** One independent piece of evidence that a company runs on, or merely integrates with, a cloud. */
export type CloudSignal = {
  cloud: string;
  kind: "runs" | "integrates";
  source: "terraform" | "ci-deploy" | "serverless" | "platform" | "jobs" | "sdk" | "docs-hosting";
  repo?: string; path?: string; url?: string;
};
export type CloudStrength = {
  cloud: string;
  group: "runs" | "integrates";
  strength: "strong" | "some" | "weak";
  signals: number;
  origins: number; // distinct repos (+ job posts) the signals come from
};
export type InfraResult = {
  items: InfraItem[];
  /** clouds the company RUNS ON / deploys to (not SDK-only or docs hosting) */
  clouds: string[]; // AWS | GCP | Azure | Vercel | Cloudflare ...
  /** every cloud signal, tagged runs vs integrates */
  cloudSignals?: CloudSignal[];
  /** per cloud and group, how strong the evidence is */
  cloudStrength?: CloudStrength[];
  categories: Record<string, string[]>; // category -> tool names
  reposScanned: number;
  /** cloud / infra tools named in open engineering roles, with how many roles name each (code-computed) */
  jobMentions?: { name: string; count: number }[];
};
export type MicroservicesResult = {
  /** "some" is the legacy name for "medium" and may still appear in old snapshots */
  level: "strong" | "medium" | "weak" | "some" | "none" | "unknown";
  reasons: string[];
};
export type ActivityResult = {
  commits30: number; commits90: number; reposPushed30: number; releases90: number;
  openRoles: number; blogPosts90: number; talks12mo: number;
  /** false when no Greenhouse / Lever / Ashby board was found, so "0 roles" would be wrong: the data is unavailable */
  jobsFound?: boolean;
  activeRepos?: number; repoTotal?: number; serviceRepos?: number;
  /** open roles that count as engineering, out of all open roles */
  totalRoles?: number;
  /** commits in the 30 days before the latest 30 (days 31-60), bots excluded */
  commitsPrev30?: number;
  /** estimated share of commits that came from bots, removed from the commit counts */
  botShare?: number;
  /** docs / website / example repos excluded from Q1 */
  docsRepos?: number;
  /** more than 60% of active repos are public SDKs / client libraries */
  sdkHeavy?: boolean;
  /** false when GitHub's heavy query failed and only repo metadata (no commit counts) is available */
  commitsKnown?: boolean;
  level: "high" | "medium" | "low" | "dormant";
  wowChangePct: number | null;
};
export type ChangeItem = {
  sign: "+" | "-" | "~"; text: string; evidenceIds?: string[];
};
