import { and, desc, eq, lt, ne } from "drizzle-orm";
import { getDb, schema } from "@/db";
import type { ActivityResult, InfraResult, MicroservicesResult, SourceStatus } from "@/db/schema";
import { ensureSchema, getYoutubeChannelId, setYoutubeChannelId } from "@/db/raw";
import { gateByConfidence, makeCheckContext } from "@/lib/ai/context";
import { isDocsRepo } from "@/lib/compute/repos";
import { GeminiUnavailable } from "@/lib/ai/gemini";
import { generateBrief } from "@/lib/ai/generate";
import type { CheckContext } from "@/lib/ai/check";
import { activityLevel, computeActivity } from "@/lib/compute/activity";
import { computeConfidence } from "@/lib/compute/confidence";
import { diffSnapshots, type CurrentSnap, type Snap } from "@/lib/compute/diff";
import { assignRefs, buildEvidence, selectForGemini, type Ref } from "@/lib/compute/evidence";
import { factsToText } from "@/lib/compute/facts";
import { addJobCloudSignals, detectInfra, microservicesSignal, type RepoTree } from "@/lib/compute/infra";
import { computeLanguages, isActiveRepo } from "@/lib/compute/languages";
import { syncCompanyFacts } from "@/lib/hubspot";
import { discoverGithubOrg, fetchGithub, RateLimitError } from "@/lib/sources/github";
import { fetchBlog } from "@/lib/sources/blog";
import { fetchHn } from "@/lib/sources/hn";
import { fetchJobs } from "@/lib/sources/jobs";
import { fetchYoutube } from "@/lib/sources/youtube";
import type { BlogData, EvidenceDraft, GithubData, HnData, JobsData, SourceResult, YoutubeData } from "@/lib/types";
import { summarizeJobTech } from "@/lib/compute/techdict";
import { DAY, weekOf } from "@/lib/util";

const { companies, runs, runSteps, snapshots, evidence, briefs, sourceCache } = schema;
const CACHE_MS = 6 * 3_600_000;

export type Trigger = "cron" | "manual" | "bulk";

/* ---------------- run bookkeeping ---------------- */

export async function queueRun(companyId: number, trigger: Trigger): Promise<number> {
  const db = getDb();
  const [r] = await db.insert(runs).values({ companyId, trigger, status: "queued" }).returning({ id: runs.id });
  return r.id;
}

async function logStep(runId: number, step: string, status: "running" | "ok" | "warn" | "fail" | "skipped", detail: string, startedAt?: number) {
  await getDb().insert(runSteps).values({ runId, step, status, detail, durationMs: startedAt ? Date.now() - startedAt : null });
}

/* ---------------- 6h raw-response cache ---------------- */

async function cached<T>(companyId: number, source: string, force: boolean, fn: () => Promise<SourceResult<T>>): Promise<SourceResult<T>> {
  const db = getDb();
  if (!force) {
    const [row] = await db.select().from(sourceCache).where(and(eq(sourceCache.companyId, companyId), eq(sourceCache.source, source)));
    if (row && Date.now() - row.fetchedAt.getTime() < CACHE_MS) return { ok: true, data: row.payload as T };
  }
  const r = await fn();
  if (r.ok) {
    await db
      .insert(sourceCache)
      .values({ companyId, source, payload: r.data as never, fetchedAt: new Date() })
      .onConflictDoUpdate({ target: [sourceCache.companyId, sourceCache.source], set: { payload: r.data as never, fetchedAt: new Date() } });
  }
  return r;
}

/* ---------------- main entry ---------------- */

export async function runRefresh(companyId: number, trigger: Trigger, runId?: number, opts: { force?: boolean } = {}): Promise<{ runId: number; status: string }> {
  const db = getDb();
  const rid = runId ?? (await queueRun(companyId, trigger));
  const t0 = Date.now();
  try {
    await ensureSchema();
    const [company] = await db.select().from(companies).where(eq(companies.id, companyId));
    if (!company || !company.active) {
      await db.update(runs).set({ status: "done", finishedAt: new Date(), error: "Company removed; skipped" }).where(eq(runs.id, rid));
      return { runId: rid, status: "done" };
    }
    await db.update(runs).set({ status: "running", startedAt: new Date() }).where(eq(runs.id, rid));

    /* ---- step 4: match sources ---- */
    let org = company.githubOrg;
    let orgConfidence = company.githubMatchConfidence as "high" | "medium" | "low" | null;
    let ghMatchError: string | null = null;
    {
      const s = Date.now();
      await logStep(rid, "match", "running", `matching ${company.domain}`);
      if (!org) {
        try {
          const m = await discoverGithubOrg(company.name, company.domain);
          org = m.org;
          orgConfidence = m.confidence;
          await db.update(companies).set({ githubOrg: m.org, githubMatchConfidence: m.confidence, githubCandidates: m.candidates }).where(eq(companies.id, companyId));
        } catch (e) {
          ghMatchError = (e as Error).message;
        }
      }
      if (org) await logStep(rid, "match", "ok", `matched github.com/${org} (${orgConfidence ?? "override"})`, s);
      else await logStep(rid, "match", ghMatchError ? "fail" : "warn", ghMatchError ?? "no public GitHub org matched; other sources only", s);
    }

    /* ---- step 6 (early): previous snapshot ---- */
    const prev = await loadPrevious(companyId);

    /* ---- step 5: fetch live data (parallel) ---- */
    const force = !!opts.force;
    const timed = async <T>(step: string, fn: () => Promise<SourceResult<T>>, describe: (d: T) => string) => {
      const s = Date.now();
      await logStep(rid, step, "running", "fetching");
      let r: SourceResult<T>;
      try {
        r = await fn();
      } catch (e) {
        const limited = e instanceof RateLimitError;
        r = { ok: false, status: "failed", error: limited ? (e as Error).message : (e as Error).message };
      }
      if (r.ok) await logStep(rid, step, "ok", describe(r.data), s);
      else if (r.status === "not_found") await logStep(rid, step, "skipped", "not found. Add an override in Sources & matching", s);
      else if (r.status === "skipped") await logStep(rid, step, "skipped", r.error ?? "not configured", s);
      else await logStep(rid, step, "fail", r.error ?? "failed; keeping last week's data", s);
      return r;
    };

    const ytChannel = await getYoutubeChannelId(companyId);
    const [ghRes, jobsRes, blogRes, ytRes, hnRes] = await Promise.all([
      org
        ? timed<GithubData>("github", () => cached(companyId, `github:v3:${org}`, force, async () => ({ ok: true, data: await fetchGithub(org!) } as SourceResult<GithubData>)),
            (g) => `${g.repoTotal} repos · ${g.repos.filter((r) => isActiveRepo(r)).length} active · ${Object.keys(g.trees).length} trees scanned`)
        : Promise.resolve<SourceResult<GithubData>>({ ok: false, status: "not_found" }),
      timed<JobsData>("jobs", () => cached(companyId, `jobs:v3:${company.jobBoardProvider ?? ""}:${company.jobBoardSlug ?? ""}`, force, () => fetchJobs({ name: company.name, domain: company.domain, provider: company.jobBoardProvider, slug: company.jobBoardSlug })),
        (j) => `${j.engineeringJobs.length} engineering roles (${j.provider})`),
      timed<BlogData>("blog", () => cached(companyId, `blog:${company.blogRssUrl ?? ""}`, force, () => fetchBlog(company.domain, company.blogRssUrl)), (b) => `${b.posts.length} posts · ${new URL(b.feedUrl).host}`),
      timed<YoutubeData>("youtube", () => cached(companyId, `youtube:v3:${company.youtubeQuery ?? ""}:${ytChannel ?? ""}`, force, () => fetchYoutube(company.name, { query: company.youtubeQuery, channelId: ytChannel, onDetected: (id) => setYoutubeChannelId(companyId, id) })), (y) => `${y.talks.length} talks from own channel or tech-titled videos`),
      timed<HnData>("hn", () => cached(companyId, "hn", force, () => fetchHn(company.name, company.domain)), (h) => `${h.items.length} stories`),
    ]);

    // If the org was auto-matched but doesn't resolve, that's a failure of github, not "not found".
    const gh = ghRes.ok ? ghRes.data : null;
    const jobs = jobsRes.ok ? jobsRes.data : null;
    const blog = blogRes.ok ? blogRes.data : null;
    const yt = ytRes.ok ? ytRes.data : null;
    const hn = hnRes.ok ? hnRes.data : null;

    const sourceStatus: Record<string, SourceStatus> = {};
    const stat = (key: string, r: SourceResult<unknown>, noOrg = false) => {
      if (r.ok) sourceStatus[key] = { state: "ok" };
      else if (r.status === "not_found") sourceStatus[key] = { state: "not_found", detail: noOrg ? "No GitHub org matched" : undefined };
      else if (r.status === "skipped") sourceStatus[key] = { state: "skipped", detail: r.error };
      else {
        const prevStale = prev?.snap.sourceStatus?.[key]?.staleSince;
        sourceStatus[key] = { state: "failed", staleSince: prevStale ?? prev?.createdAt.toISOString().slice(0, 10), detail: r.error };
      }
    };
    stat("github", ghRes, !org); stat("jobs", jobsRes); stat("blog", blogRes); stat("youtube", ytRes); stat("hn", hnRes);
    const failed = (k: string) => sourceStatus[k]?.state === "failed" && !!prev;

    /* ---- step 8: code answers Q1–Q3 ---- */
    const s8 = Date.now();
    let languages = gh ? computeLanguages(gh.repos) : [];
    const trees: RepoTree[] = gh
      ? Object.entries(gh.trees).map(([repo, paths]) => ({ repo, owner: gh.org, branch: gh.repos.find((r) => r.name === repo)?.defaultBranch ?? "main", paths }))
      : [];
    let infra = gh ? detectInfra(trees, gh.files) : null;
    let microservices: MicroservicesResult = { level: "unknown", reasons: [] };
    let commitSeries = gh?.commitSeries ?? new Array(13).fill(0);
    const githubStale = failed("github") && !!prev;
    if (githubStale && prev) {
      languages = prev.snap.languages ?? [];
      infra = prev.snap.infra ?? null;
      commitSeries = prev.snap.commitSeries ?? commitSeries;
    }

    // Q2 also reads the job posts: tools named by open engineering roles (code, from a curated dictionary)
    const jobMentions = jobs
      ? summarizeJobTech(jobs.engineeringJobs.map((j) => `${j.title} ${j.text}`))
      : failed("jobs") ? prev!.snap.infra?.jobMentions ?? [] : [];
    if (jobMentions.length) {
      const base: InfraResult = infra ?? { items: [], clouds: [], categories: {}, reposScanned: 0 };
      // a cloud named in 3+ open roles is a "runs on" signal from jobs; strengths are recomputed
      infra = addJobCloudSignals({ ...base, jobMentions }, jobMentions);
    }
    // microservices signal: deployable services in code, plus whether open roles name Kubernetes
    microservices = githubStale && prev?.snap.microservices
      ? prev.snap.microservices
      : microservicesSignal(gh?.repos ?? [], infra, jobMentions.find((m) => m.name === "Kubernetes")?.count ?? 0);

    const now = Date.now();
    const blogPosts90 = blog ? blog.posts.filter((p) => p.publishedAt && now - new Date(p.publishedAt).getTime() <= 90 * DAY).length : failed("blog") ? prev!.snap.activity?.blogPosts90 ?? 0 : 0;
    const talks12mo = yt ? yt.talks.filter((t) => now - new Date(t.publishedAt).getTime() <= 365 * DAY).length : failed("youtube") ? prev!.snap.activity?.talks12mo ?? 0 : 0;
    const openRoles = jobs ? jobs.engineeringJobs.length : failed("jobs") ? prev!.snap.activity?.openRoles ?? 0 : 0;

    const totalRoles = jobs ? jobs.totalJobs : failed("jobs") ? prev!.snap.activity?.totalRoles : undefined;
    let activity: ActivityResult = computeActivity({
      repos: gh?.repos ?? [], openRoles, totalRoles, blogPosts90, talks12mo, botShare: gh?.botShare, repoTotal: gh?.repoTotal,
    });
    if (failed("github") && prev?.snap.activity) {
      const p = prev.snap.activity;
      activity = { ...activity, commits30: p.commits30, commits90: p.commits90, commitsPrev30: p.commitsPrev30, commitsKnown: p.commitsKnown, botShare: p.botShare, docsRepos: p.docsRepos, sdkHeavy: p.sdkHeavy, reposPushed30: p.reposPushed30, releases90: p.releases90, activeRepos: p.activeRepos, repoTotal: p.repoTotal, wowChangePct: null };
      activity.level = activityLevel(activity);
    }

    if (activity.serviceRepos == null) activity.serviceRepos = (gh?.repos ?? []).filter((r) => !r.isFork && !r.isArchived && /(-service|-svc|-api|-worker|-gateway)/i.test(r.name)).length;
    const activeRepos = gh ? gh.repos.filter((r) => isActiveRepo(r)).length : failed("github") ? (prev?.activeRepos ?? 0) : 0;
    const conf = computeConfidence({
      githubMatch: org ? orgConfidence ?? "high" : null, // an explicit override counts as high
      activeRepos, reposScanned: infra?.reposScanned ?? 0,
      jobPosts: openRoles, blogPosts: blog?.posts.length ?? 0, talks: yt?.talks.length ?? 0, hnItems: hn?.items.length ?? 0, sourceStatus,
    });
    await logStep(rid, "compute", "ok", `Q1–Q3 · diff vs last week · confidence ${conf.level}`, s8);

    /* ---- step 7: evidence pack ---- */
    let drafts: EvidenceDraft[] = buildEvidence({ github: gh, languages, infra, jobs, blog, youtube: yt, hn, activity, microservices, docsExcluded: activity.docsRepos });
    // carry last week's evidence for failed sources, flagged as stale
    if (prev) {
      for (const src of ["github", "jobs", "blog", "youtube", "hn"] as const) {
        if (failed(src)) {
          for (const e of prev.evidence.filter((x) => x.source === src)) {
            drafts.push({ source: src, kind: e.kind, title: e.title, snippet: e.snippet, url: e.url, observedAt: e.observedAt, meta: { ...(e.meta ?? {}), stale: true } });
          }
        }
      }
    }
    const refs: Ref[] = assignRefs(drafts);

    /* ---- diff (step 8: what changed) ---- */
    const prevUrls = (src: string) => new Set((prev?.evidence ?? []).filter((e) => e.source === src).map((e) => e.url));
    const prevJobs = prevUrls("jobs"), prevBlog = prevUrls("blog"), prevTalks = prevUrls("youtube");
    const prevRepoNames = new Set((prev?.evidence ?? []).filter((e) => e.kind === "repo").map((e) => String((e.meta as { repo?: string } | null)?.repo ?? "")));
    const cur: CurrentSnap = {
      languages, infra, microservices, activity,
      newJobs: prevJobs.size ? refs.filter((e) => e.source === "jobs" && !prevJobs.has(e.url) && !e.meta?.stale).map((e) => ({ title: e.title, techs: (e.meta?.techs as string[]) ?? [], ref: e.ref })) : [],
      newBlogs: prevBlog.size ? refs.filter((e) => e.source === "blog" && !prevBlog.has(e.url) && !e.meta?.stale).slice(0, 2).map((e) => ({ title: e.title, ref: e.ref })) : [],
      newTalks: prevTalks.size ? refs.filter((e) => e.source === "youtube" && !prevTalks.has(e.url) && !e.meta?.stale).slice(0, 2).map((e) => ({ title: e.title, ref: e.ref })) : [],
      // "New repo" means created in the last 7 days. A repo that merely started getting commits is "Newly active".
      newRepos: prev && gh
        ? gh.repos
            .filter((r) => !r.isFork && !r.isArchived && !isDocsRepo(r.name) && prevRepoNames.size > 0 && !prevRepoNames.has(r.name))
            .map((r) => ({ r, created: !!r.createdAt && now - new Date(r.createdAt).getTime() <= 7 * DAY }))
            .filter(({ r, created }) => created || (r.commits90 >= 20 && r.commits30 === r.commits90))
            .slice(0, 2)
            .map(({ r, created }) => ({ name: r.name, created, commits30: r.commits30, language: r.primaryLanguage, ref: refs.find((e) => e.kind === "repo" && e.meta?.repo === r.name)?.ref }))
        : [],
    };
    const changes = diffSnapshots(prev ? prev.snap : null, cur);

    /* ---- steps 9 + 10: Gemini + code check ---- */
    const serviceRepoCount = (gh?.repos ?? []).filter((r) => !r.isFork && !r.isArchived && /(-service|-svc|-api|-worker|-gateway)/i.test(r.name)).length;
    const sourceNotes = Object.entries(sourceStatus).filter(([, s]) => s.state !== "ok").map(([k, s]) => `${k}: ${s.state === "failed" ? `failed (showing data since ${s.staleSince ?? "earlier"})` : "none found"}`);
    const factsText = factsToText({ company: company.name, languages, infra, microservices, activity, confidence: conf.level, confidenceReason: conf.reason, changes, activeRepoCount: activeRepos, serviceRepoCount, sourceNotes });
    const ctx: CheckContext = makeCheckContext(company.name, refs, factsText);
    const [settingsRow] = await db.select().from(schema.settings).limit(1);

    let briefRow: typeof briefs.$inferInsert | null = null;
    let geminiCost = 0, geminiTokens = 0, geminiDown = false;
    const s9 = Date.now();
    if (refs.length === 0) {
      await logStep(rid, "gemini", "skipped", "no evidence to write from", s9);
      briefRow = { snapshotId: 0, checkStatus: "needs_review", checkReasons: ["No public evidence found for this company. Add overrides in Sources & matching."] };
    } else {
      await logStep(rid, "gemini", "running", "Gemini drafting");
      try {
        const r = await generateBrief(
          {
            company: company.name, facts: factsText, productNotes: settingsRow?.productNotes,
            evidence: selectForGemini(refs).map((e) => ({ ref: e.ref, source: e.source, title: e.title, snippet: e.snippet, date: e.observedAt?.toISOString().slice(0, 10) ?? null })),
          },
          ctx,
        );
        geminiCost = r.usage.costUsd; geminiTokens = r.usage.inputTokens + r.usage.outputTokens;
        const gated = gateByConfidence(r.checkStatus, r.checkReasons, conf.level);
        const unknowns = [...r.brief.unknowns];
        if (activity.sdkHeavy) unknowns.push("Mostly public SDKs: their internal stack may differ from what the public code suggests.");
        if (activity.commitsKnown === false) unknowns.push("Commit counts were unavailable for this very large org, so activity is estimated from repo pushes only.");
        await logStep(rid, "gemini", "ok", `summary + opener · ${(geminiTokens / 1000).toFixed(1)}k tok${r.regenerated ? " · regenerated once" : ""}`, s9);
        briefRow = {
          snapshotId: 0, summaryP1: r.brief.summary_p1, summaryP2: r.brief.summary_p2, openerText: r.brief.opener.text,
          openerEvidenceIds: r.brief.opener.evidence_ids, hookType: r.brief.opener.hook_type, talkingPoints: r.brief.talking_points,
          unknowns, checkStatus: gated.status, checkReasons: gated.reasons, model: r.usage.model,
          inputTokens: r.usage.inputTokens, outputTokens: r.usage.outputTokens, costUsd: r.usage.costUsd,
        };
        const evs = r.brief.opener.evidence_ids.join(", ");
        await logStep(rid, "check", gated.status === "verified" ? "ok" : "warn",
          gated.status === "verified" ? `opener verified [${evs}]` : `Needs review: ${gated.reasons[0] ?? "see reasons"}`);
      } catch (e) {
        geminiDown = true;
        const msg = e instanceof GeminiUnavailable ? e.message : (e as Error).message;
        await logStep(rid, "gemini", "fail", `Summary pending (Gemini unavailable): ${msg.slice(0, 120)}`, s9);
        briefRow = { snapshotId: 0, checkStatus: "pending", checkReasons: ["Summary pending (Gemini unavailable). Will retry next run."] };
      }
    }

    /* ---- step 11: save snapshot ---- */
    const s11 = Date.now();
    const [snap] = await db
      .insert(snapshots)
      .values({
        companyId, runId: rid, weekOf: weekOf(), languages, infra, microservices, activity, commitSeries,
        confidence: conf.level, confidenceReason: conf.reason, sourceStatus, changes,
      })
      .returning({ id: snapshots.id });
    if (refs.length) {
      await db.insert(evidence).values(
        refs.map((r) => ({ ref: r.ref, companyId, snapshotId: snap.id, source: r.source, kind: r.kind, title: r.title, snippet: r.snippet, url: r.url, observedAt: r.observedAt, meta: r.meta ?? null })),
      );
    }
    if (briefRow) await db.insert(briefs).values({ ...briefRow, snapshotId: snap.id });
    await logStep(rid, "save", "ok", `saved snapshot · ${refs.length} evidence items`, s11);

    /* ---- step 12/13: HubSpot facts (automatic, never breaks the run) ---- */
    const s13 = Date.now();
    const hs = await syncCompanyFacts(companyId, snap.id);
    await logStep(rid, "hubspot", hs.status === "synced" ? "ok" : hs.status === "skipped" ? "skipped" : "warn", hs.message, s13);

    const anyFailed = Object.values(sourceStatus).some((s) => s.state === "failed") || geminiDown;
    await db.update(runs).set({ status: anyFailed ? "partial" : "done", finishedAt: new Date(), geminiTokens, costUsd: geminiCost }).where(eq(runs.id, rid));
    await logStep(rid, "done", "ok", `done in ${((Date.now() - t0) / 1000).toFixed(1)}s`);
    return { runId: rid, status: anyFailed ? "partial" : "done" };
  } catch (e) {
    const msg = (e as Error).message ?? String(e);
    await db.update(runs).set({ status: "failed", finishedAt: new Date(), error: msg.slice(0, 500) }).where(eq(runs.id, rid));
    await logStep(rid, "done", "fail", msg.slice(0, 200));
    return { runId: rid, status: "failed" };
  }
}

/* ---------------- previous snapshot ---------------- */

async function loadPrevious(companyId: number) {
  const db = getDb();
  const thisWeek = weekOf();
  let [row] = await db.select().from(snapshots).where(and(eq(snapshots.companyId, companyId), lt(snapshots.weekOf, thisWeek))).orderBy(desc(snapshots.createdAt)).limit(1);
  if (!row) {
    [row] = await db.select().from(snapshots).where(and(eq(snapshots.companyId, companyId), ne(snapshots.weekOf, ""))).orderBy(desc(snapshots.createdAt)).limit(1);
    // same-week repeat refresh: only diff against it if it is more than a day old
    if (row && Date.now() - row.createdAt.getTime() < DAY) {
      // still use it for stale carry-forward, but it is a poor "last week" baseline
    }
  }
  if (!row) return null;
  const ev = await db.select().from(evidence).where(eq(evidence.snapshotId, row.id));
  const snap: Snap & { commitSeries: number[] | null; sourceStatus: Record<string, SourceStatus> | null } = {
    languages: row.languages, infra: row.infra, microservices: row.microservices, activity: row.activity,
    commitSeries: row.commitSeries, sourceStatus: row.sourceStatus ?? {},
  };
  return { snap, evidence: ev, createdAt: row.createdAt, activeRepos: (row.languages ?? []).length ? ev.filter((e) => e.kind === "repo").length : 0 };
}
