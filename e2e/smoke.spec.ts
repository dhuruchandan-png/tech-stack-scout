import { expect, test } from "@playwright/test";

/**
 * Smoke: every page renders without console errors or uncaught exceptions, in both themes.
 * Run against a deployed URL with:  E2E_BASE_URL=https://your-app.vercel.app npm run e2e
 */
const PAGES = [
  { path: "/", name: "Today" },
  { path: "/accounts", name: "Watchlist" },
  { path: "/outreach", name: "Outreach" },
  { path: "/radar", name: "Radar" },
  { path: "/runs", name: "Runs" },
  { path: "/settings", name: "Settings" },
];

for (const theme of ["dark", "light"] as const) {
  test.describe(`${theme} theme`, () => {
    test.beforeEach(async ({ page }) => {
      await page.addInitScript((t) => localStorage.setItem("tss-theme", t), theme);
    });

    for (const p of PAGES) {
      test(`${p.name} renders`, async ({ page }) => {
        const errors: string[] = [];
        page.on("pageerror", (e) => errors.push(e.message));
        page.on("console", (m) => { if (m.type() === "error" && !/favicon|Failed to load resource/i.test(m.text())) errors.push(m.text()); });
        const res = await page.goto(p.path);
        expect(res?.status()).toBeLessThan(500);
        await expect(page.locator("main")).toBeVisible();
        await expect(page.locator("html")).toHaveAttribute("data-theme", theme);
        expect(errors, errors.join("\n")).toEqual([]);
      });
    }

    test("first account brief and one-pager render", async ({ page }) => {
      await page.goto("/accounts");
      const link = page.locator('a[href^="/accounts/"]').first();
      if ((await link.count()) === 0) test.skip(true, "No accounts yet (seed the database first)");
      const href = await link.getAttribute("href");
      const errors: string[] = [];
      page.on("pageerror", (e) => errors.push(e.message));
      await page.goto(href!);
      await expect(page.locator("h1")).toBeVisible();
      await page.goto(`${href}/brief`);
      await expect(page.getByText("Prepared by Tech Stack Scout").or(page.getByText("No snapshot yet"))).toBeVisible();
      expect(errors).toEqual([]);
    });
  });
}

test("command palette opens with Ctrl+K", async ({ page }) => {
  await page.goto("/");
  await page.keyboard.press("Control+k");
  await expect(page.getByPlaceholder(/Jump to an account/)).toBeVisible();
});

test("cron endpoints reject a wrong secret when CRON_SECRET is set", async ({ request }) => {
  test.skip(!process.env.E2E_EXPECT_CRON_SECRET, "CRON_SECRET not set on this deployment");
  expect((await request.get("/api/cron/weekly-refresh")).status()).toBe(401);
  expect((await request.get("/api/cron/monday-brief")).status()).toBe(401);
});
