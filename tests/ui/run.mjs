// UI tests for the Moltworld landing page across desktop, tablet and phone viewports.
// Boots the offline local stack (mock chain + reference facilitator + seeded traffic),
// then drives the real page with Playwright.
//
//   pnpm test:ui                     # all viewports, light + dark
//   UI_SHOTS=/path pnpm test:ui      # where screenshots go (default ./ui-artifacts)
import { spawn } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { chromium, devices } from "playwright-core";

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), "../..");
const SHOTS = process.env.UI_SHOTS ?? path.join(ROOT, "ui-artifacts");
const PORT = Number(process.env.UI_PORT ?? 3499);
const BASE = `http://127.0.0.1:${PORT}`;

const VIEWPORTS = [
  { name: "desktop-1440", options: { viewport: { width: 1440, height: 900 } }, mobile: false },
  { name: "laptop-1024", options: { viewport: { width: 1024, height: 768 } }, mobile: false },
  { name: "tablet-ipad-mini", options: devices["iPad Mini"], mobile: true },
  { name: "phone-iphone-13", options: devices["iPhone 13"], mobile: true },
  { name: "phone-pixel-7", options: devices["Pixel 7"], mobile: true },
  { name: "phone-small-320", options: { viewport: { width: 320, height: 640 }, isMobile: true, hasTouch: true, deviceScaleFactor: 2 }, mobile: true },
];

const results = [];
let current = "";
function check(name, condition, detail = "") {
  results.push({ viewport: current, name, ok: !!condition, detail: condition ? "" : String(detail) });
  if (!condition) console.error(`  ✗ [${current}] ${name} ${detail}`);
}

async function startStack() {
  const child = spawn(path.join(ROOT, "node_modules/.bin/tsx"), ["scripts/local-stack.ts"], {
    cwd: ROOT,
    // Twelve browser sessions from one IP would trip the production rate limit.
    env: { ...process.env, PORT: String(PORT), PUBLIC_DOMAIN: BASE, RATE_LIMIT_MAX: "100000" },
    stdio: ["ignore", "pipe", "pipe"],
  });
  let log = "";
  await new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`stack did not start:\n${log.slice(-2000)}`)), 90_000);
    const onData = (d) => {
      log += d;
      if (log.includes("LOCAL STACK READY")) {
        clearTimeout(timer);
        resolve();
      }
    };
    child.stdout.on("data", onData);
    child.stderr.on("data", onData);
    child.on("exit", (code) => reject(new Error(`stack exited ${code}:\n${log.slice(-2000)}`)));
  });
  return child;
}

async function noHorizontalOverflow(page) {
  return page.evaluate(() => {
    const vw = document.documentElement.clientWidth;
    const offenders = [];
    for (const el of document.querySelectorAll("body *")) {
      const style = getComputedStyle(el);
      if (style.display === "none" || style.visibility === "hidden" || el.closest("pre, .table-wrap, .skip, .sr-only")) continue;
      const r = el.getBoundingClientRect();
      if (r.width && (r.right > vw + 1 || r.left < -1)) offenders.push(`${el.tagName.toLowerCase()}.${el.className}`.slice(0, 60));
    }
    return { scroll: document.documentElement.scrollWidth - vw, offenders: offenders.slice(0, 5) };
  });
}

async function runViewport(browser, vp, scheme) {
  current = `${vp.name}/${scheme}`;
  console.log(`▶ ${current}`);
  const context = await browser.newContext({ ...vp.options, colorScheme: scheme });
  const page = await context.newPage();
  const errors = [];
  page.on("pageerror", (e) => errors.push(`pageerror: ${e.message}`));
  // Browsers log every non-2xx fetch as "Failed to load resource"; statuses are checked below instead.
  page.on("console", (m) => m.type() === "error" && !m.text().startsWith("Failed to load resource") && errors.push(`console: ${m.text()}`));
  const EXPECTED = [
    [402, /\/v1\/models\/[^/]+\/chat\/completions$/], // "Show 402 challenge"
    [400, /\/v1\/quote$/], // the deliberate invalid-input check
    [404, /\/v1\/mandates\/[A-Z2-7]{58}$/], // looking up an unknown mandate id
  ];
  page.on("response", (r) => {
    if (r.status() < 400 || !r.url().startsWith(BASE)) return;
    const pathname = new URL(r.url()).pathname;
    if (!EXPECTED.some(([status, re]) => status === r.status() && re.test(pathname))) errors.push(`HTTP ${r.status()} ${r.url()}`);
  });

  await page.goto(BASE + "/", { waitUntil: "networkidle" });
  await page.waitForFunction(() => document.getElementById("sPaid")?.textContent !== "-");

  // Layout
  const overflow = await noHorizontalOverflow(page);
  check("no horizontal page scroll", overflow.scroll <= 0, `scrollWidth exceeds viewport by ${overflow.scroll}px`);
  check("no element extends past the viewport", overflow.offenders.length === 0, overflow.offenders.join(", "));
  check("single h1", (await page.locator("h1").count()) === 1);
  check("html has lang", (await page.getAttribute("html", "lang")) === "en");
  const unlabeled = await page.evaluate(() =>
    [...document.querySelectorAll("input, select, textarea")]
      .filter((el) => !(el.id && document.querySelector(`label[for="${el.id}"]`)) && !el.getAttribute("aria-label"))
      .map((el) => el.id || el.name)
  );
  check("every form control has a label", unlabeled.length === 0, unlabeled.join(","));
  check("images have alt text", (await page.locator("img:not([alt])").count()) === 0);
  const bg = await page.evaluate(() => getComputedStyle(document.body).backgroundColor);
  check(`${scheme} color scheme applied`, scheme === "dark" ? bg === "rgb(7, 9, 14)" : bg === "rgb(246, 247, 251)", bg);

  if (vp.mobile) {
    const small = await page.evaluate(() =>
      [...document.querySelectorAll("button, .btn, nav a")]
        .filter((el) => el.offsetParent !== null)
        .filter((el) => el.getBoundingClientRect().height < 36)
        .map((el) => el.textContent.trim().slice(0, 20))
    );
    check("tap targets at least 36px tall", small.length === 0, small.join(" | "));
  }

  await page.screenshot({ path: path.join(SHOTS, `${current.replace("/", "-")}-full.png`), fullPage: true });

  // Header: no in-page section links, live network label
  check("no in-page nav links in the header", (await page.locator('header a[href^="#"]').count()) === 0);
  const label = (await page.textContent("#netLabel")).trim();
  check("header shows the network from /health", /^Algorand (Mainnet|Testnet)$/.test(label), label);

  // Quote calculator: chat
  await page.selectOption("#qModel", "gpt-4o");
  await page.fill("#qMessage", "Explain atomic transfers on Algorand.");
  await page.fill("#qMaxTokens", "500");
  await page.click("#quoteBtn");
  await page.waitForSelector("#quoteOut .big-price");
  const shown = (await page.textContent("#quoteOut .big-price")).trim();
  const expected = await page.evaluate(async () => {
    const r = await fetch("/v1/quote", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ model: "gpt-4o", messages: [{ role: "user", content: "Explain atomic transfers on Algorand." }], max_tokens: 500 }),
    });
    return (await r.json()).quote.formattedPrice;
  });
  check("chat quote matches /v1/quote", shown === expected, `${shown} vs ${expected}`);

  await page.click("#challengeBtn");
  await page.waitForFunction(() => document.querySelector("#quoteOut .note")?.textContent.includes("402"));
  const challengePrice = (await page.textContent("#quoteOut .big-price")).trim();
  check("402 challenge amount equals the quote", challengePrice === expected, `${challengePrice} vs ${expected}`);
  check("402 challenge shows payTo", (await page.textContent("#quoteOut")).includes("Pay to"));

  // Quote calculator: video fields follow the model's spec
  await page.selectOption("#qModel", "veo-3.1-fast");
  check("video fields shown for video model", await page.locator('[data-for="video"]').isVisible());
  check("chat fields hidden for video model", !(await page.locator('[data-for="chat"]').isVisible()));
  const durations = await page.locator("#qDuration option").allTextContents();
  check("video durations follow the model", durations.join(",") === "4 s,6 s,8 s", durations.join(","));
  await page.click("#quoteBtn");
  await page.waitForFunction(() => document.querySelector("#quoteOut")?.textContent.includes("seconds"));
  check("video quote shows seconds", true);

  // Validation errors are shown, not swallowed
  await page.selectOption("#qModel", "gpt");
  await page.fill("#qMaxTokens", "999999");
  await page.click("#quoteBtn");
  await page.waitForSelector("#quoteOut .err");
  check("invalid input shows an error", (await page.textContent("#quoteOut .err")).includes("max_tokens"));
  await page.fill("#qMaxTokens", "300");

  // Catalog
  await page.click('[data-filter="video"]');
  const videoCards = page.locator("#modelList .model:not(.hidden)");
  const videoCount = await videoCards.count();
  const modalities = await videoCards.evaluateAll((els) => els.map((e) => e.dataset.modality));
  check("video filter shows only video models", videoCount === 5 && modalities.every((m) => m === "video"), `${videoCount} ${modalities}`);
  await page.click('[data-filter="all"]');
  check("catalog paginates", (await page.locator("#modelList .model:not(.hidden)").count()) === 9);
  await page.click("#moreBtn");
  check("show more reveals more models", (await page.locator("#modelList .model:not(.hidden)").count()) > 9);
  await page.fill("#search", "claude");
  const names = await page.locator("#modelList .model:not(.hidden) h3").allTextContents();
  check("search filters by name", names.length > 0 && names.every((n) => n.toLowerCase().includes("claude")), names.join(","));
  await page.fill("#search", "zzz-no-such-model");
  check("empty search shows a message", await page.locator("#noModels").isVisible());
  await page.fill("#search", "flux");
  await page.locator('#modelList .model:not(.hidden) [data-quote="flux-2-pro"]').click();
  await page.waitForFunction(() => document.getElementById("qModel").value === "flux-2-pro" && document.querySelector("#quoteOut .big-price"));
  check("'Get exact quote' prefills and quotes", (await page.inputValue("#qModel")) === "flux-2-pro");

  // Receipts: look one up by id, verified in the browser with WebCrypto Ed25519
  const requestId = await page.evaluate(async () => (await (await fetch("/v1/stats")).json()).recent_settlements[0].request_id);
  await page.fill("#receiptInput", requestId);
  await page.click('#receiptForm button[type="submit"]');
  await page.waitForSelector("#receiptOut .badge");
  check("receipt lookup verifies as valid", (await page.textContent("#receiptOut .badge")).trim() === "Valid", await page.textContent("#receiptOut"));
  check("receipt verified in the browser", (await page.textContent("#receiptOut")).includes("checked in your browser"));
  const tampered = await page.evaluate(async (id) => {
    const r = (await (await fetch("/v1/receipts/" + id)).json()).receipt;
    return JSON.stringify({ ...r, amountMicro: r.amountMicro + 1 });
  }, requestId);
  await page.fill("#receiptInput", tampered);
  await page.click('#receiptForm button[type="submit"]');
  await page.waitForFunction(() => document.querySelector("#receiptOut .badge")?.textContent.trim() === "Invalid");
  check("tampered receipt is rejected", true);

  // Mandate lookup
  await page.fill("#mandateQuery", "not-an-address");
  await page.click('#mandateForm button[type="submit"]');
  await page.waitForSelector("#mandateOut .err");
  check("mandate lookup validates input", true);
  await page.fill("#mandateQuery", "TQWEL54TCBYH3QJLN2OU2QH7XZTHRDZMF2YQIU5B7W2HK6GS7I2TWHDMXU");
  await page.click('#mandateForm button[type="submit"]');
  await page.waitForFunction(() => document.getElementById("mandateOut").textContent.includes("No mandates"));
  check("mandate lookup handles unknown ids", true);

  // Marketplace
  await page.waitForFunction(() => document.getElementById("marketOut").textContent.includes("Weather Now"));
  check("live marketplace listings render", true);
  await page.fill("#earnAddr", "TQWEL54TCBYH3QJLN2OU2QH7XZTHRDZMF2YQIU5B7W2HK6GS7I2TWHDMXU");
  await page.click('#earnForm button[type="submit"]');
  await page.waitForFunction(() => document.getElementById("earnOut").textContent.includes("Unpaid"));
  check("creator earnings lookup works", true);

  // Stats
  const rows = await page.locator("#recentRows tr").count();
  check("recent settlements listed", rows >= 5, `${rows} rows`);
  const href = await page.locator("#recentRows a").first().getAttribute("href");
  check("settlements link to the explorer", href?.startsWith("https://lora.algokit.io/testnet/transaction/"), href);

  // Code tabs with keyboard
  await page.locator("#t-ts").focus();
  await page.keyboard.press("ArrowRight");
  check("arrow key switches code tab", (await page.getAttribute("#t-py", "aria-selected")) === "true" && (await page.locator("#p-py").isVisible()));
  check("previous panel hidden", !(await page.locator("#p-ts").isVisible()));

  const after = await noHorizontalOverflow(page);
  check("no horizontal scroll after interactions", after.scroll <= 0 && after.offenders.length === 0, `${after.scroll} ${after.offenders}`);
  check("no console errors or failed requests", errors.length === 0, errors.join(" | "));

  await page.locator("#quote").screenshot({ path: path.join(SHOTS, `${current.replace("/", "-")}-quote.png`) });
  await page.evaluate(() => window.scrollTo({ top: 0, behavior: "instant" }));
  await page.screenshot({ path: path.join(SHOTS, `${current.replace("/", "-")}-top.png`) });
  await context.close();
}

fs.mkdirSync(SHOTS, { recursive: true });
const stack = await startStack();
const browser = await chromium.launch();
try {
  for (const vp of VIEWPORTS) {
    for (const scheme of ["light", "dark"]) {
      try {
        await runViewport(browser, vp, scheme);
      } catch (err) {
        check("viewport run completed", false, err.message.split("\n")[0]);
      }
    }
  }
} finally {
  await browser.close();
  stack.kill();
}

const failed = results.filter((r) => !r.ok);
const summary = { total: results.length, passed: results.length - failed.length, failed: failed.length, viewports: VIEWPORTS.length * 2, screenshots: SHOTS };
fs.writeFileSync(path.join(SHOTS, "results.json"), JSON.stringify({ summary, results }, null, 2));
console.log(JSON.stringify(summary));
process.exit(failed.length ? 1 : 0);
