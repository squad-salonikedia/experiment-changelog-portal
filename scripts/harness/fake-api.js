// ---- fake API so the real dashboard.js can be driven without a server ----
window.__calls = [];
const now = new Date().toISOString();
const db = {
  experiments: [
    { id: "exp-mine", date: "2026-08-30", createdAt: now, updatedAt: now, loggedBy: "Saloni",
      client: "BlackBuck", industry: "Logistics", useCase: "", bucket: "App Opener",
      experimentName: "Mine — deletable", metricType: "Quantitative", metricLabel: "ADC%",
      before: "1", after: "2", pctChange: "100.0%", direction: "", evidenceNote: "",
      prompt: "", pinned: "", reactions: { up: [], down: [] }, canEdit: true,
      ownerEmail: "saloni.kedia@squadstack.ai" },
    { id: "exp-other", date: "2026-08-21", createdAt: now, updatedAt: now, loggedBy: "Rajat",
      client: "BlackBuck", industry: "Logistics", useCase: "", bucket: "App Opener",
      experimentName: "Split intro line into two separate turns (Campaign 951)",
      metricType: "Quantitative", metricLabel: "Conversion%", before: "10", after: "12",
      pctChange: "20.0%", direction: "", evidenceNote: "", prompt: "", pinned: "",
      reactions: { up: [], down: [] }, canEdit: false, ownerEmail: "rajat@squadstack.ai" },
  ],
  comments: { "exp-mine": [] },
};
const J = (b, s) => Promise.resolve({ ok: (s||200) < 400, status: s||200, json: () => Promise.resolve(b), text: () => Promise.resolve(JSON.stringify(b)) });
window.fetch = function (url, init) {
  init = init || {};
  const method = (init.method || "GET").toUpperCase();
  window.__calls.push(method + " " + url);
  const body = init.body ? JSON.parse(init.body) : null;
  if (url.startsWith("/api/me")) return J({ name: "Saloni Kedia", email: "saloni.kedia@squadstack.ai", firstName: "Saloni", role: "admin" });
  if (url.startsWith("/api/options")) return J({ clients: ["BlackBuck", "Khatabook"], industries: ["BFSI", "Logistics"], buckets: ["App Opener", "Cadence"], metrics: ["ADC%", "Conversion%"], owners: ["Saloni", "Rajat"], useCasesByIndustry: { BFSI: ["PA-PL"], Logistics: [] }, features: { prompt: true, ownerEmail: true } });
  if (url.startsWith("/api/tokens")) return J({ enabled: true, tokens: [] });
  const cm = url.match(/^\/api\/experiments\/([^\/?]+)\/comments/);
  if (cm) {
    const id = cm[1];
    db.comments[id] = db.comments[id] || [];
    if (method === "GET") return J({ comments: db.comments[id] });
    if (method === "POST") {
      const c = { id: "c" + (db.comments[id].length + 1), author: "Saloni Kedia", authorEmail: "saloni.kedia@squadstack.ai", body: body.body, createdAt: new Date().toISOString(), canDelete: true };
      db.comments[id].push(c);
      return J({ ok: true, comment: c });
    }
    if (method === "DELETE") {
      const cid = new URL("http://x" + url).searchParams.get("commentId");
      db.comments[id] = db.comments[id].filter((c) => c.id !== cid);
      return J({ ok: true });
    }
  }
  const em = url.match(/^\/api\/experiments\/([^\/?]+)$/);
  if (em) {
    const id = em[1];
    const row = db.experiments.find((e) => e.id === id);
    if (!row) return J({ error: "Experiment not found" }, 404);
    if (method === "DELETE") {
      if (!row.canEdit) return J({ error: "Only Rajat can delete this experiment." }, 403);
      db.experiments = db.experiments.filter((e) => e.id !== id);
      return J({ ok: true });
    }
    if (method === "PATCH") {
      Object.assign(row, { experimentName: body.title, client: body.client, updatedAt: new Date().toISOString() });
      return J({ ok: true, entry: row });
    }
  }
  if (url.startsWith("/api/experiments")) {
    if (method === "GET") return J(db.experiments);
    if (method === "POST") {
      const saved = (body.entries || []).map((e, i) => ({
        id: "new-" + (db.experiments.length + i), date: e.date || "2026-09-01", createdAt: now, updatedAt: now,
        loggedBy: "Saloni", client: e.client, industry: e.industry, useCase: e.useCase || "", bucket: e.bucket,
        experimentName: e.title, metricType: "Quantitative", metricLabel: (e.metrics||[{}])[0].metric || "",
        before: String((e.metrics||[{}])[0].before ?? ""), after: String((e.metrics||[{}])[0].after ?? ""),
        pctChange: "", direction: "", evidenceNote: e.description || "", prompt: "", pinned: "",
        reactions: { up: [], down: [] }, canEdit: true, ownerEmail: "saloni.kedia@squadstack.ai" }));
      db.experiments = saved.concat(db.experiments);
      return J({ ok: true, count: saved.length, entries: saved });
    }
  }
  return J({ error: "not stubbed: " + method + " " + url }, 404);
};
window.__errors = [];
window.addEventListener("error", (e) => window.__errors.push(String(e.message)));
