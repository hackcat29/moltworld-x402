// Client script shared by every page. Each widget only runs when its root element exists.
export const SITE_JS = String.raw`
(() => {
  const $ = (id) => document.getElementById(id);
  const ORIGIN = document.body.dataset.origin || location.origin;
  const EXPLORER = document.body.dataset.explorer || "https://lora.algokit.io/mainnet";
  const el = (tag, attrs = {}, ...children) => {
    const node = document.createElement(tag);
    for (const [k, v] of Object.entries(attrs)) {
      if (k === "class") node.className = v; else if (k === "text") node.textContent = v; else node.setAttribute(k, v);
    }
    for (const child of children) node.append(child);
    return node;
  };
  const toast = (msg) => { const t = $("toast"); if (!t) return; t.textContent = msg; t.classList.add("show"); setTimeout(() => t.classList.remove("show"), 1800); };
  const fmtMicro = (m) => "$" + (Number(m) / 1e6).toFixed(6).replace(/0+$/, "").replace(/\.$/, "");
  const kv = (pairs) => { const dl = el("dl", { class: "kv" }); for (const [k, v] of pairs) { if (v === undefined || v === null || v === "") continue; dl.append(el("dt", { text: k }), typeof v === "string" ? el("dd", { text: v }) : el("dd", {}, v)); } return dl; };
  const txLink = (txid) => { const a = el("a", { href: EXPLORER + "/transaction/" + encodeURIComponent(txid), target: "_blank", rel: "noopener", text: txid.slice(0, 10) + "..." + txid.slice(-6) }); a.title = txid; return a; };
  const errorBox = (msg) => el("p", { class: "err", text: msg });
  const isAddress = (s) => /^[A-Z2-7]{58}$/.test(s);
  async function api(path, init) {
    const res = await fetch(path, init);
    let body = null;
    try { body = await res.json(); } catch {}
    return { res, body };
  }
  const catalogData = () => { const node = $("catalog"); return node ? JSON.parse(node.textContent) : []; };

  // ---------------------------------------------------------------- header
  const nav = $("nav"), menuBtn = $("menuBtn");
  const triggers = Array.from(document.querySelectorAll(".nav-trigger"));
  const desktop = () => window.matchMedia("(min-width: 961px)").matches;
  function setMenu(trigger, open) {
    trigger.setAttribute("aria-expanded", String(open));
    $(trigger.getAttribute("aria-controls")).hidden = !open;
  }
  function closeAll(except) { triggers.forEach((t) => t !== except && setMenu(t, false)); }
  triggers.forEach((t) => {
    let hoverOpenedAt = 0;
    t.addEventListener("click", (e) => {
      e.stopPropagation();
      // A click right after hover opened the menu should keep it open, not toggle it shut.
      if (desktop() && Date.now() - hoverOpenedAt < 500) return;
      const open = t.getAttribute("aria-expanded") !== "true";
      closeAll(t);
      setMenu(t, open);
    });
    const item = t.closest(".nav-item");
    let timer;
    item.addEventListener("mouseenter", () => {
      if (!desktop()) return;
      clearTimeout(timer);
      if (t.getAttribute("aria-expanded") !== "true") hoverOpenedAt = Date.now();
      closeAll(t);
      setMenu(t, true);
    });
    item.addEventListener("mouseleave", () => { if (!desktop()) return; timer = setTimeout(() => setMenu(t, false), 150); });
  });
  document.addEventListener("click", (e) => { if (desktop() && !e.target.closest(".nav-item")) closeAll(); });
  document.addEventListener("keydown", (e) => {
    if (e.key !== "Escape") return;
    const open = triggers.find((t) => t.getAttribute("aria-expanded") === "true");
    if (open) { setMenu(open, false); open.focus(); }
    else if (nav && nav.classList.contains("open")) { nav.classList.remove("open"); menuBtn.setAttribute("aria-expanded", "false"); menuBtn.focus(); }
  });
  if (menuBtn) {
    menuBtn.addEventListener("click", () => {
      const open = nav.classList.toggle("open");
      menuBtn.setAttribute("aria-expanded", String(open));
      menuBtn.textContent = open ? "Close" : "Menu";
      document.body.style.overflow = open ? "hidden" : "";
    });
  }

  // ---------------------------------------------------------------- network label
  const netLabel = $("netLabel");
  if (netLabel) {
    api("/health").then(({ res, body }) => {
      const ok = res.ok && body && body.ready;
      netLabel.textContent = (body && body.network === "mainnet" ? "Algorand Mainnet" : "Algorand Testnet") + (ok ? "" : " (unavailable)");
      netLabel.classList.toggle("down", !ok);
    }).catch(() => netLabel.classList.add("down"));
  }

  // ---------------------------------------------------------------- copy + tabs
  document.addEventListener("click", async (e) => {
    const btn = e.target.closest("[data-copy]");
    if (!btn) return;
    try { await navigator.clipboard.writeText(btn.dataset.copy); toast("Copied"); } catch { toast("Copy failed"); }
  });
  document.querySelectorAll('[role="tablist"]').forEach((list) => {
    const tabs = Array.from(list.querySelectorAll('[role="tab"]'));
    const select = (tab, focus) => {
      tabs.forEach((t) => { const on = t === tab; t.setAttribute("aria-selected", String(on)); t.tabIndex = on ? 0 : -1; $(t.getAttribute("aria-controls")).hidden = !on; });
      if (focus) tab.focus();
    };
    tabs.forEach((t, i) => {
      t.addEventListener("click", () => select(t, true));
      t.addEventListener("keydown", (e) => {
        if (e.key === "ArrowRight") select(tabs[(i + 1) % tabs.length], true);
        if (e.key === "ArrowLeft") select(tabs[(i - 1 + tabs.length) % tabs.length], true);
      });
    });
  });

  // ---------------------------------------------------------------- playground
  const quoteForm = $("quoteForm");
  if (quoteForm) {
    const MODELS = catalogData();
    const qModel = $("qModel"), out = $("quoteOut");
    for (const modality of ["chat", "image", "voice", "video"]) {
      const group = el("optgroup", { label: modality[0].toUpperCase() + modality.slice(1) });
      for (const m of MODELS.filter((x) => x.modality === modality)) group.append(el("option", { value: m.slug, text: m.name + " (from " + m.from + ")" }));
      if (group.children.length) qModel.append(group);
    }
    const wanted = new URLSearchParams(location.search).get("model");
    if (wanted && MODELS.some((m) => m.slug === wanted)) qModel.value = wanted;
    const fill = (select, values, labeler = String) => { select.replaceChildren(...values.map((v) => el("option", { value: String(v), text: labeler(v) }))); };
    const current = () => MODELS.find((m) => m.slug === qModel.value) || MODELS[0];
    const bodyFor = (m) => {
      switch (m.modality) {
        case "chat": return { messages: [{ role: "user", content: $("qMessage").value }], max_tokens: Number($("qMaxTokens").value) };
        case "image": return { prompt: $("qPrompt").value, n: Number($("qN").value), size: $("qSize").value };
        case "voice": return m.voices ? { input: $("qInput").value, voice: $("qVoice").value } : { input: $("qInput").value };
        case "video": return { prompt: $("qVideoPrompt").value, duration: Number($("qDuration").value), aspect_ratio: $("qRatio").value };
      }
    };
    const method = { chat: "chat", image: "image", voice: "speech", video: "video" };
    function renderSnippets() {
      const m = current(), body = bodyFor(m), json = JSON.stringify(body);
      $("snipCurl").textContent = "curl -s " + ORIGIN + "/v1/quote -H 'Content-Type: application/json' \\\n  -d '" + JSON.stringify({ model: m.slug, ...body }).replace(/'/g, "'\\''") + "'\n\n# Pay with any x402 client that supports Algorand:\nPOST " + ORIGIN + m.endpoint;
      $("snipTs").textContent = 'import { MoltworldClient } from "@moltworld/sdk";\n\nconst client = new MoltworldClient({ mnemonic: process.env.ALGORAND_MNEMONIC, maxPerRequestUsd: 1 });\nconst res = await client.' + method[m.modality] + '("' + m.slug + '", ' + JSON.stringify(body, null, 2) + ");\nconsole.log(res.data, res.receipt?.txid);";
      $("snipPy").textContent = "from moltworld import MoltworldClient\n\nclient = MoltworldClient(mnemonic=\"...\", max_per_request_usd=1)\nres = client.call(\"" + m.endpoint + "\", " + json.replace(/true/g, "True").replace(/false/g, "False") + ")\nprint(res.data, res.receipt[\"txid\"])";
    }
    function syncForm() {
      const m = current();
      document.querySelectorAll("[data-for]").forEach((n) => n.classList.toggle("hidden", n.dataset.for !== m.modality));
      if (m.modality === "chat") { $("qMaxTokens").max = m.maxOutput; $("qMaxNote").textContent = "(max " + m.maxOutput + ")"; if (Number($("qMaxTokens").value) > m.maxOutput) $("qMaxTokens").value = m.maxOutput; }
      if (m.modality === "image") { fill($("qN"), Array.from({ length: m.maxImages }, (_, i) => i + 1)); fill($("qSize"), m.sizes || ["1024x1024"]); }
      if (m.modality === "voice") { $("qVoiceWrap").classList.toggle("hidden", !m.voices); if (m.voices) fill($("qVoice"), m.voices); }
      if (m.modality === "video") { fill($("qDuration"), m.durations || [5], (d) => d + " s"); fill($("qRatio"), m.ratios || ["16:9"]); }
      renderSnippets();
    }
    qModel.addEventListener("change", syncForm);
    quoteForm.addEventListener("input", renderSnippets);
    quoteForm.addEventListener("change", renderSnippets);
    syncForm();

    quoteForm.addEventListener("submit", async (e) => {
      e.preventDefault();
      const m = current(), btn = $("quoteBtn");
      btn.disabled = true;
      try {
        const { res, body } = await api("/v1/quote", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ model: m.slug, ...bodyFor(m) }) });
        if (!res.ok) { out.replaceChildren(errorBox((body && body.error && body.error.message) || "Quote failed")); return; }
        const q = body.quote, u = q.units;
        const units = [u.estimatedInputTokens && u.estimatedInputTokens + " input tokens (estimated)", u.maxOutputTokens && u.maxOutputTokens + " max output tokens", u.images && u.images + " image(s)", u.characters && u.characters + " characters", u.seconds && u.seconds + " seconds"].filter(Boolean).join(", ");
        out.replaceChildren(
          el("div", { class: "note", text: body.name + ": " + (body.payment_flow === "authorization" ? "charged after the answer" : "charged first, refunded if it fails") }),
          el("div", { class: "big-price", text: q.formattedPrice }),
          kv([["Units", units], ["Upstream cost", "$" + q.upstreamCostUsd.toFixed(6) + " (" + q.costSource + ")"], ["Margin", q.marginPercent + "%"], ["Micro-USDC", String(q.microUsdc)], ["Endpoint", "POST " + body.endpoint]]),
          el("p", { class: "note", text: body.note })
        );
      } catch { out.replaceChildren(errorBox("Network error.")); } finally { btn.disabled = false; }
    });

    $("challengeBtn").addEventListener("click", async () => {
      const m = current(), btn = $("challengeBtn");
      btn.disabled = true;
      try {
        const res = await fetch(m.endpoint, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(bodyFor(m)) });
        const header = res.headers.get("payment-required");
        if (res.status !== 402 || !header) {
          let msg = "HTTP " + res.status; try { const b = await res.json(); msg = (b.error && b.error.message) || msg; } catch {}
          out.replaceChildren(errorBox(msg)); return;
        }
        const required = JSON.parse(atob(header)), a = required.accepts[0];
        out.replaceChildren(
          el("div", { class: "note", text: "HTTP 402 Payment Required (x402 v" + required.x402Version + ")" }),
          el("div", { class: "big-price", text: fmtMicro(a.amount) }),
          kv([["Scheme", a.scheme], ["Network", a.network], ["Asset (ASA)", a.asset], ["Pay to", a.payTo], ["Flow", (a.extra && a.extra.paymentFlow) || "authorization"], ["Fee payer", a.extra && a.extra.feePayer]]),
          el("pre", { class: "code" }, el("code", { text: JSON.stringify(required, null, 2) }))
        );
      } catch { out.replaceChildren(errorBox("Network error.")); } finally { btn.disabled = false; }
    });
  }

  // ---------------------------------------------------------------- catalog
  const modelList = $("modelList");
  if (modelList) {
    const cards = Array.from(modelList.querySelectorAll(".model"));
    const PAGE = Number(modelList.dataset.page || 12);
    let filter = "all", query = "", limit = PAGE;
    function renderCatalog() {
      const matches = cards.filter((c) => (filter === "all" || c.dataset.modality === filter) && (!query || c.dataset.search.includes(query)));
      cards.forEach((c) => c.classList.add("hidden"));
      matches.slice(0, limit).forEach((c) => c.classList.remove("hidden"));
      $("noModels").classList.toggle("hidden", matches.length > 0);
      $("moreBtn").parentElement.classList.toggle("hidden", matches.length <= limit);
      $("moreBtn").textContent = "Show more (" + (matches.length - limit) + ")";
    }
    document.querySelectorAll("[data-filter]").forEach((b) => b.addEventListener("click", () => {
      document.querySelectorAll("[data-filter]").forEach((x) => x.setAttribute("aria-pressed", String(x === b)));
      filter = b.dataset.filter; limit = PAGE; renderCatalog();
    }));
    $("search").addEventListener("input", (e) => { query = e.target.value.trim().toLowerCase(); limit = PAGE; renderCatalog(); });
    $("moreBtn").addEventListener("click", () => { limit += PAGE * 2; renderCatalog(); });
    renderCatalog();
  }

  // ---------------------------------------------------------------- mandates
  const mandateForm = $("mandateForm");
  if (mandateForm) {
    mandateForm.addEventListener("submit", async (e) => {
      e.preventDefault();
      const q = $("mandateQuery").value.trim(), target = $("mandateOut");
      if (!isAddress(q)) { target.replaceChildren(errorBox("Enter a 58-character Algorand address.")); return; }
      let { res, body } = await api("/v1/mandates?owner=" + q);
      let list = res.ok && body.data.length ? body.data : null;
      if (!list) { ({ res, body } = await api("/v1/mandates/" + q)); list = res.ok ? [body.mandate] : null; }
      if (!list || !list.length) { target.replaceChildren(el("p", { class: "note", text: "No mandates found for this id or owner." })); return; }
      target.replaceChildren(...list.map((m) => el("div", { class: "card", style: "margin-top:10px" },
        el("strong", { text: m.label + " " }), el("span", { class: "badge " + (m.status === "active" ? "good" : "bad"), text: m.status }),
        kv([["Id", m.id], ["Owner", m.owner], ["Per call", m.max_per_call], ["Daily cap", m.daily_cap], ["Spent (24h)", m.spent_24h], ["Models", m.allowed_models ? m.allowed_models.join(", ") : "any"], ["Expires at round", String(m.expiry_round)]]))));
    });
  }

  // ---------------------------------------------------------------- marketplace
  const marketOut = $("marketOut");
  if (marketOut) {
    api("/v1/market").then(({ res, body }) => {
      if (!res.ok) { marketOut.replaceChildren(errorBox("Could not load listings.")); return; }
      if (!body.data.length) { marketOut.replaceChildren(el("p", { class: "note", text: "No live listings yet." })); return; }
      marketOut.replaceChildren(...body.data.map((l) => el("div", { class: "card", style: "margin-top:10px" },
        el("div", { class: "model-top" }, el("strong", { text: l.name }), el("span", { class: "price", text: l.price })),
        el("p", { class: "note", text: l.description }),
        el("code", { class: "endpoint", text: "POST " + l.endpoint }))));
    }).catch(() => marketOut.replaceChildren(errorBox("Could not load listings.")));
  }
  const earnForm = $("earnForm");
  if (earnForm) {
    earnForm.addEventListener("submit", async (e) => {
      e.preventDefault();
      const addr = $("earnAddr").value.trim(), target = $("earnOut");
      if (!isAddress(addr)) { target.replaceChildren(errorBox("Enter a 58-character Algorand address.")); return; }
      const { res, body } = await api("/v1/market/creators/" + addr + "/earnings");
      if (!res.ok) { target.replaceChildren(errorBox((body && body.error && body.error.message) || "Lookup failed")); return; }
      target.replaceChildren(kv([["Paid calls", String(body.paid_calls)], ["Unpaid", body.unpaid], ["Paid out", body.paid_out], ["Payout threshold", body.payout_threshold]]));
    });
  }

  // ---------------------------------------------------------------- receipts
  const receiptForm = $("receiptForm");
  if (receiptForm) {
    let keysPromise = null;
    const keys = () => (keysPromise ||= api("/.well-known/moltworld-receipts.json").then(({ body }) => body.keys));
    const canonical = (v) => {
      if (v === null || typeof v !== "object") return JSON.stringify(v);
      if (Array.isArray(v)) return "[" + v.map(canonical).join(",") + "]";
      return "{" + Object.keys(v).filter((k) => v[k] !== undefined).sort().map((k) => JSON.stringify(k) + ":" + canonical(v[k])).join(",") + "}";
    };
    const b64 = (s) => Uint8Array.from(atob(s.replace(/-/g, "+").replace(/_/g, "/") + "===".slice((s.length + 3) % 4)), (c) => c.charCodeAt(0));
    async function verifyLocally(receipt) {
      const key = (await keys()).find((k) => k.kid === receipt.kid);
      if (!key) return { ok: false, why: "Unknown signing key " + receipt.kid };
      try {
        const pub = await crypto.subtle.importKey("raw", b64(key.publicKey), { name: "Ed25519" }, false, ["verify"]);
        const { sig, ...payload } = receipt;
        const ok = await crypto.subtle.verify({ name: "Ed25519" }, pub, b64(sig), new TextEncoder().encode(canonical(payload)));
        return { ok, why: ok ? "Signature valid (checked in your browser)" : "Signature does not match" };
      } catch { return { ok: null, why: "This browser can't verify Ed25519 signatures, so the gateway's check is shown instead." }; }
    }
    receiptForm.addEventListener("submit", async (e) => {
      e.preventDefault();
      const raw = $("receiptInput").value.trim(), target = $("receiptOut");
      if (!raw) return;
      let receipt = null, server = null;
      if (raw.startsWith("{")) { try { receipt = JSON.parse(raw); } catch { target.replaceChildren(errorBox("That is not valid JSON.")); return; } }
      else if (/^req_[A-Za-z0-9_-]+$/.test(raw)) {
        const { res, body } = await api("/v1/receipts/" + raw);
        if (!res.ok) { target.replaceChildren(errorBox((body && body.error && body.error.message) || "Not found")); return; }
        server = body; receipt = body.receipt;
      } else { target.replaceChildren(errorBox("Enter a request id (req_...) or receipt JSON.")); return; }
      if (!receipt) { target.replaceChildren(kv([["Status", server.status], ["Note", "No receipt: the request was not completed."]])); return; }
      const local = await verifyLocally(receipt);
      const verdict = local.ok === null ? (server && server.signature_valid) : local.ok;
      target.replaceChildren(
        el("p", {}, el("span", { class: "badge " + (verdict ? "good" : "bad"), text: verdict ? "Valid" : "Invalid" }), " " + local.why),
        kv([["Request", receipt.id], ["Status", server ? server.status : undefined], ["Model", receipt.model], ["Upstream", (receipt.upstreamProvider || "") + " / " + (receipt.upstreamModel || "")], ["Paid", fmtMicro(receipt.amountMicro)], ["Rebate", receipt.rebateMicro ? fmtMicro(receipt.rebateMicro) : undefined], ["Payer", receipt.payer], ["Transaction", txLink(receipt.txid)], ["Refund", server && server.refund ? server.refund.status + (server.refund.txid ? ", " + server.refund.txid : "") : undefined], ["Request sha256", receipt.requestSha256], ["Response sha256", receipt.responseSha256], ["Key id", receipt.kid]])
      );
    });
  }

  // ---------------------------------------------------------------- usage
  if ($("sPaid") || $("recentRows")) {
    const set = (id, v) => { const n = $(id); if (n) n.textContent = v; };
    const fmtUsd = (raw) => {
      if (!raw || raw === "-") return "-";
      const num = parseFloat(String(raw).replace(/[^0-9.]/g, ""));
      return isNaN(num) ? String(raw) : "$" + num.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    };

    const renderFacilitator = (f) => {
      if (!f) return;
      if (f.success_rate != null) set("sSuccessRate", f.success_rate + "%");
      if (f.avg_settle_ms != null) set("sAvgLatency", f.avg_settle_ms + " ms");
      if (f.avg_ticket_usd != null) set("sAvgTicket", "$" + Number(f.avg_ticket_usd).toFixed(2));
      const topBody = $("topModelRows");
      if (topBody && f.top_models && f.top_models.length) {
        const modelRows = f.top_models.map((m) => el("tr", {},
          el("td", { "data-label": "Model", text: m.model }),
          el("td", { "data-label": "Settles", text: Number(m.settles).toLocaleString() }),
          el("td", { "data-label": "Volume", text: "$" + Number(m.volume_usdc).toFixed(2) }),
          el("td", { "data-label": "Price", text: "$" + m.price_usdc + " USDC" })
        ));
        topBody.replaceChildren(...modelRows);
      }
    };

    api("/v1/stats").then(({ res, body }) => {
      if (!res.ok) return;
      const s = body.metrics;
      set("sPaid", typeof s.paid_requests === "number" ? s.paid_requests.toLocaleString() : s.paid_requests);
      set("sPaid24", typeof s.paid_requests_24h === "number" ? s.paid_requests_24h.toLocaleString() : s.paid_requests_24h);
      set("sGross", fmtUsd(s.gross_usdc)); set("sRebated", fmtUsd(s.rebated_usdc)); set("sNet", fmtUsd(s.net_revenue_usdc));
      set("sWallets", typeof s.unique_paying_wallets === "number" ? s.unique_paying_wallets.toLocaleString() : s.unique_paying_wallets);
      set("sRepeat", Math.round((s.repeat_payer_rate || 0) * 100) + "%");
      set("sRefunds", fmtUsd(s.refunded_usdc));

      if (body.facilitator) {
        renderFacilitator(body.facilitator);
      } else {
        // Direct fallback to facilitator data endpoint if server ran offline
        fetch("https://facilitator.goplausible.xyz/data/merchants/414f1538ce0d6de4")
          .then((r) => r.json())
          .then((fdata) => {
            if (!fdata || typeof fdata.settles !== "number") return;
            renderFacilitator({
              success_rate: (fdata.successRate * 100).toFixed(1),
              avg_settle_ms: Math.round(fdata.avgSettleMs),
              avg_ticket_usd: fdata.avgTicket,
              top_models: (fdata.resources || []).slice(0, 15).map((r) => ({
                model: r.url.split("/models/")[1]?.replace(/\/(chat|images|audio|videos)\/.*$/, "") || r.url,
                settles: r.settles,
                volume_usdc: r.volume,
                price_usdc: r.price,
              })),
            });
          })
          .catch(() => {});
      }

      const tbody = $("recentRows");
      if (!tbody) return;
      const rows = body.recent_settlements.map((r) => el("tr", {},
        el("td", { "data-label": "When", text: new Date(r.at).toLocaleString() }),
        el("td", { "data-label": "Model", text: r.model || r.modality || "market" }),
        el("td", { "data-label": "Amount", text: r.amount }),
        el("td", { "data-label": "Transaction", class: "mono" }, r.txid ? txLink(r.txid) : "-")));
      tbody.replaceChildren(...(rows.length ? rows : [el("tr", {}, el("td", { colspan: "4", text: "No settlements yet." }))]));
    }).catch(() => {});
  }
})();
`;
