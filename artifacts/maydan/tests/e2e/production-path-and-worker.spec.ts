import { expect, test } from "@playwright/test";
import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";

const appBase = "/release-check/";
const workerPath = path.resolve(import.meta.dirname, "../../dist/public/service-worker.js");

test("keeps legal, OAuth, and share URLs inside the production base path", async ({ page }) => {
  await page.route("https://placeholder.supabase.co/**", async (route) => {
    const url = new URL(route.request().url());
    if (url.pathname.includes("/authorize")) {
      await route.fulfill({ status: 200, contentType: "application/json", body: "{}" });
      return;
    }
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ user: null, session: null }),
    });
  });

  await page.goto(".");
  await expect(page.getByRole("button", { name: /Google/i })).toBeVisible();
  const legalHrefs = await page.locator(`a[href^="${appBase}"]`).evaluateAll((links) =>
    links.map((link) => (link as HTMLAnchorElement).getAttribute("href")),
  );
  expect(legalHrefs).toEqual(expect.arrayContaining([
    `${appBase}terms`,
    `${appBase}privacy`,
  ]));

  let oauthRedirect = "";
  page.on("request", (request) => {
    if (request.url().includes("/authorize?")) {
      oauthRedirect = new URL(request.url()).searchParams.get("redirect_to") ?? "";
    }
  });
  await page.getByRole("button", { name: /Google/i }).click();
  await expect.poll(() => oauthRedirect).toContain(appBase);

  await page.addInitScript(() => {
    localStorage.setItem("maydan_guest_mode", "1");
    localStorage.setItem("maydan_onboarding_completed", "1");
    localStorage.setItem("maydan_challenges", JSON.stringify({
      "base-path-check": {
        id: "base-path-check",
        creatorId: "creator",
        creatorName: "Creator",
        categoryId: "general",
        questionCount: 0,
        questions: [],
        creatorAnswers: [],
        creatorScore: 0,
        creatorTime: 0,
        createdAt: "2026-01-01T00:00:00.000Z",
        status: "waiting",
      },
    }));
  });
  await page.goto("results/base-path-check/player1");
  const shareInput = page.locator(`input[value*="${appBase}challenge/base-path-check"]`);
  await expect(shareInput).toHaveValue(
    new RegExp(`${appBase.replaceAll("/", "\\/")}challenge\\/base-path-check$`),
  );
});

test("waits to activate an updated worker, then serves the new cache to a fresh tab", async ({ browser }) => {
  const firstContext = await browser.newContext({ serviceWorkers: "allow" });
  const firstPage = await firstContext.newPage();
  await firstPage.goto(`http://127.0.0.1:4178${appBase}`);
  await firstPage.evaluate(async (scope) => {
    let registration = await navigator.serviceWorker.getRegistration(scope);
    registration ??= await navigator.serviceWorker.register(
      `${scope}service-worker.js`,
      { scope },
    );
    if (!registration.active) {
      await new Promise<void>((resolve, reject) => {
        const worker = registration.installing ?? registration.waiting;
        if (!worker) {
          reject(new Error("Service worker did not begin installing"));
          return;
        }
        worker.addEventListener("statechange", () => {
          if (worker.state === "activated") resolve();
          if (worker.state === "redundant") reject(new Error("Service worker became redundant"));
        });
      });
    }
  }, appBase);
  if (!await firstPage.evaluate(() => !!navigator.serviceWorker.controller)) {
    await firstPage.reload();
  }
  await firstPage.waitForFunction(() => {
    return !!navigator.serviceWorker.controller;
  });

  const initialCaches = await firstPage.evaluate(() => caches.keys());
  const initialVersion = initialCaches.find((key) => key.endsWith("-shell"));
  expect(initialVersion).toBeTruthy();

  const originalWorker = await readFile(workerPath, "utf8");
  const updatedId = `e2e-${Date.now().toString(36)}`;
  const updatedWorker = originalWorker.replace(
    /const CACHE_VERSION = "maydan-[^"]+";/,
    `const CACHE_VERSION = "maydan-${updatedId}";`,
  );
  await writeFile(workerPath, updatedWorker, "utf8");

  try {
    await firstPage.evaluate(async () => {
      const registration = await navigator.serviceWorker.ready;
      await registration.update();
    });
    await firstPage.waitForFunction(() =>
      navigator.serviceWorker.getRegistration().then((registration) => !!registration?.waiting),
    );

    await firstPage.reload();
    await expect.poll(() =>
      firstPage.evaluate(() =>
        navigator.serviceWorker.getRegistration().then((registration) => registration?.waiting?.state),
      ),
    ).toBe("installed");
    expect(await firstPage.evaluate(() => caches.keys())).toContain(initialVersion);

    await firstPage.close();
    const freshPage = await firstContext.newPage();
    await freshPage.goto(`http://127.0.0.1:4178${appBase}`);
    await freshPage.evaluate(async () => {
      const registration = await navigator.serviceWorker.ready;
      if (!navigator.serviceWorker.controller) location.reload();
      await new Promise<void>((resolve) => {
        if (registration.active?.state === "activated") {
          resolve();
          return;
        }
        registration.active?.addEventListener("statechange", () => {
          if (registration.active?.state === "activated") resolve();
        });
      });
    });
    await expect.poll(() =>
      freshPage.evaluate(() =>
        navigator.serviceWorker.getRegistration().then((registration) => ({
          active: registration?.active?.state,
          waiting: registration?.waiting?.state ?? null,
        })),
      ),
    ).toEqual({ active: "activated", waiting: null });
    await expect.poll(async () => freshPage.evaluate(() => caches.keys())).toContain(
      `maydan-${updatedId}-shell`,
    );
    const activatedCaches = await freshPage.evaluate(() => caches.keys());
    expect(activatedCaches).not.toContain(initialVersion);

    await expect(freshPage.getByRole("button", { name: /Google/i })).toBeVisible();
    await firstContext.setOffline(true);
    await freshPage.reload({ waitUntil: "domcontentloaded" });
    await expect(freshPage.getByRole("button", { name: /Google/i })).toBeVisible();
    await expect(freshPage.locator("#root")).not.toBeEmpty();
    await firstContext.setOffline(false);
    await firstContext.close();
  } finally {
    await writeFile(workerPath, originalWorker, "utf8");
  }
});