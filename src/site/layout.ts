import crypto from "crypto";
import type { Context } from "hono";
import { config } from "../config.js";
import { navMenus } from "./nav.js";
import { SITE_CSS } from "./styles.js";
import { SITE_JS } from "./script.js";

export function esc(value: string): string {
  return value.replace(/[&<>"']/g, (ch) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[ch]!);
}

/** JSON safe to embed inside a <script> element. */
export function scriptJson(value: unknown): string {
  return JSON.stringify(value).replace(/</g, "\\u003c").replace(/>/g, "\\u003e").replace(/&/g, "\\u0026");
}

const CSS_HASH = crypto.createHash("sha256").update(SITE_CSS).digest("hex").slice(0, 12);
const JS_HASH = crypto.createHash("sha256").update(SITE_JS).digest("hex").slice(0, 12);

export function handleCss(c: Context): Response {
  return c.body(SITE_CSS, 200, { "Content-Type": "text/css; charset=utf-8", "Cache-Control": "public, max-age=31536000, immutable" });
}

export function handleJs(c: Context): Response {
  return c.body(SITE_JS, 200, { "Content-Type": "text/javascript; charset=utf-8", "Cache-Control": "public, max-age=31536000, immutable" });
}

const CHEVRON = '<svg viewBox="0 0 12 12" aria-hidden="true"><path d="M2.5 4.5 6 8l3.5-3.5" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/></svg>';

function header(path: string): string {
  const network = config.isMainnet ? "Algorand Mainnet" : "Algorand Testnet";
  const items = navMenus()
    .map((menu) => {
      const external = menu.href.startsWith("http");
      const active = !external && (path === menu.href || path.startsWith(`${menu.href}/`) || (menu.id === "products" && path === "/models"));
      const links = menu.links
        .map((l) => `<li><a class="nav-link" href="${esc(l.href)}"><span class="t">${esc(l.label)}</span><span class="d">${esc(l.description)}</span></a></li>`)
        .join("");
      const overview = external ? `Open the docs` : `All ${menu.label.toLowerCase()}`;
      return `<li class="nav-item${active ? " active" : ""}">
          <button class="nav-trigger" type="button" aria-expanded="false" aria-controls="menu-${menu.id}">${menu.label}${CHEVRON}</button>
          <div class="nav-menu" id="menu-${menu.id}" hidden>
            <ul>${links}</ul>
            <a class="nav-overview" href="${esc(menu.href)}">${overview}</a>
          </div>
        </li>`;
    })
    .join("");
  return `<header class="site">
    <div class="wrap bar">
      <a class="brand" href="/"><img src="/logo.png" alt="" width="30" height="30"><span>Moltworld</span></a>
      <nav class="primary" id="nav" aria-label="Main">
        <ul>${items}</ul>
        <div class="nav-mobile-cta">
          <a class="btn" href="/playground">Open Playground</a>
          <a class="btn btn-ghost" href="${config.docsUrl}/quickstart">Quickstart</a>
        </div>
      </nav>
      <div class="header-actions">
        <span class="net" id="netLabel" title="Gateway status">${network}</span>
        <a class="btn btn-header" href="/playground">Playground</a>
        <button class="menu-btn" id="menuBtn" type="button" aria-expanded="false" aria-controls="nav">Menu</button>
      </div>
    </div>
  </header>`;
}

function footer(): string {
  const docs = config.docsUrl;
  const col = (title: string, links: Array<[string, string]>) =>
    `<div><h4>${title}</h4><ul>${links.map(([label, href]) => `<li><a href="${esc(href)}">${esc(label)}</a></li>`).join("")}</ul></div>`;
  return `<footer class="site">
    <div class="wrap">
      <div class="foot-grid">
        <div class="foot-brand">
          <a class="brand" href="/"><img src="/logo.png" alt="" width="30" height="30"><span>Moltworld</span></a>
          <p style="margin:12px 0 0;max-width:34ch">AI models for apps and agents, paid per request in USDC on Algorand.</p>
        </div>
        ${col("Products", [["Gateway", "/products/gateway"], ["Models", "/models"], ["Mandates", "/products/mandates"], ["Marketplace", "/products/marketplace"], ["Receipts", "/products/receipts"]])}
        ${col("Solutions", [["Agent frameworks", "/solutions/agents"], ["Developers", "/solutions/developers"], ["API creators", "/solutions/api-creators"], ["Use cases", "/use-cases"]])}
        ${col("Developers", [["Documentation", docs], ["API reference", `${docs}/api-reference/introduction`], ["Playground", "/playground"], ["llms.txt", "/llms.txt"], ["GitHub", "https://github.com/hackcat29/moltworld-x402"]])}
        ${col("Status", [["Usage", "/stats"], ["Health", "/health"], ["Receipt keys", "/.well-known/moltworld-receipts.json"], ["x402 descriptor", "/.well-known/x402"]])}
      </div>
      <div class="foot-legal">Payments go to <span class="mono">${config.payToAddress}</span> on ${config.isMainnet ? "Algorand Mainnet" : "Algorand Testnet"}.</div>
    </div>
  </footer>`;
}

export interface PageOptions {
  path: string;
  title: string;
  description: string;
  body: string;
  /** Extra markup placed before the shared script (e.g. embedded JSON data). */
  data?: string;
}

export function renderPage(c: Context, opts: PageOptions): Response {
  const origin = config.publicDomain;
  const fullTitle = opts.path === "/" ? opts.title : `${opts.title} | Moltworld`;
  const html = `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>${esc(fullTitle)}</title>
  <meta name="description" content="${esc(opts.description)}">
  <meta name="theme-color" content="#07090e">
  <link rel="canonical" href="${origin}${opts.path}">
  <link rel="icon" type="image/png" sizes="32x32" href="/favicon-32.png">
  <link rel="apple-touch-icon" href="/logo.png">
  <link rel="alternate" type="text/plain" href="/llms.txt" title="LLM-readable service description">
  <link rel="stylesheet" href="/assets/site.css?v=${CSS_HASH}">
  <meta property="og:title" content="${esc(fullTitle)}">
  <meta property="og:description" content="${esc(opts.description)}">
  <meta property="og:type" content="website">
  <meta property="og:site_name" content="Moltworld">
  <meta property="og:url" content="${origin}${opts.path}">
  <meta property="og:image" content="${origin}/logo.png">
  <meta name="twitter:card" content="summary">
</head>
<body data-origin="${origin}" data-explorer="${config.isMainnet ? "https://lora.algokit.io/mainnet" : "https://lora.algokit.io/testnet"}">
  <a class="skip" href="#main">Skip to content</a>
  ${header(opts.path)}
  <main id="main">
${opts.body}
  </main>
  ${footer()}
  <div class="toast" id="toast" role="status"></div>
  ${opts.data ?? ""}
  <script src="/assets/site.js?v=${JS_HASH}" defer></script>
</body>
</html>`;
  return c.html(html, 200, { "Cache-Control": "public, max-age=60" });
}
