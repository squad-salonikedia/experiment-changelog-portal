(function () {
  "use strict";

  /* ============================================================
     STATE
     ============================================================ */
  const state = {
    entries: [],
    options: {
      clients: [], industries: [], buckets: [], metrics: [], owners: [],
      useCasesByIndustry: {},
      // Server reports which optional columns exist; fields whose column is
      // missing stay hidden rather than quietly discarding what is typed.
      features: { prompt: false, ownerEmail: false },
    },
    me: { name: "", email: "", firstName: "", role: "member" },
    // Comment thread state: who a reply is aimed at, which comment is being
    // edited, and whether the server has the columns for either (migration 007).
    commentReplyTo: null,
    commentEditing: null,
    commentThreading: false,
    // null until /api/tokens answers. false is what lights the setup dots.
    hasKey: null,
    filters: { client: "", industry: "", useCase: "", bucket: "", owner: "", metricType: "" },
    search: "",
    sortKey: "date",
    sortDir: "desc",
    view: "overview",
    loadError: false,
    lastLoadedAt: 0,
    openPopover: null,
    searchIndex: -1,
    // Drawer
    draft: null,
    editingId: null,
    step: 0,
    method: "manual",
    saving: false,
    // In-progress "add a new …" text, keyed by form field.
    adding: {},
    // Fields whose auto-filled value the user chose to override.
    unlock: {},
  };

  const LOWER_IS_BETTER = new Set(["ADC%", "Cost per call", "Call Drop rate", "Latency"]);
  const AVATAR_COLORS = [
    "#6f39f5", "#0f9f6e", "#e0453c", "#d97706", "#2563eb",
    "#db2777", "#7c3aed", "#0d9488", "#ea580c", "#4f46e5",
  ];

  /* ============================================================
     UTILITIES
     ============================================================ */
  const $ = (id) => document.getElementById(id);

  function esc(str) {
    return String(str ?? "").replace(/[&<>"']/g, (m) => ({
      "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
    }[m]));
  }

  /** A dark, copyable one-liner — a shell command, a URL to hand someone. */
  function codeBlock(text, marginTop) {
    return '<div class="fly-code-block wrap" style="margin-top:' + (marginTop || 7) + 'px"><code>' +
      esc(text) + "</code>" +
      '<button class="fly-btn fly-btn-ghost fly-btn-sm" data-copy="' + esc(text) + '">Copy</button></div>';
  }

  function avatarColor(name) {
    if (!name) return AVATAR_COLORS[0];
    let h = 0;
    for (let i = 0; i < name.length; i++) h = name.charCodeAt(i) + ((h << 5) - h);
    return AVATAR_COLORS[Math.abs(h) % AVATAR_COLORS.length];
  }

  function initials(name) {
    if (!name) return "?";
    return name.trim().split(/\s+/).map((w) => w[0]).slice(0, 2).join("").toUpperCase();
  }

  function resolveAvatarName(name) {
    if (!name) return "";
    var lower = name.toLowerCase();
    var meFirst = (state.me.firstName || "").toLowerCase();
    var meFull = (state.me.name || "").toLowerCase();
    if ((meFirst && lower === meFirst) || (meFull && lower === meFull)) {
      return state.me.name || state.me.firstName || name;
    }
    return name;
  }

  function avatar(name, size) {
    var resolved = resolveAvatarName(name);
    return '<span class="fly-avatar fly-avatar-' + (size || "sm") + '" style="background:' +
      avatarColor(resolved) + '">' + esc(initials(resolved)) + "</span>";
  }

  function myAvatar(size) {
    return avatar(state.me.name || state.me.firstName || "User", size);
  }

  const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

  /** "2026-08-21T00:00:00+00:00" -> "21 Aug 2026". Never shows a raw timestamp. */
  function formatDate(value) {
    if (!value) return "";
    const m = String(value).match(/^(\d{4})-(\d{2})-(\d{2})/);
    if (!m) return "";
    return Number(m[3]) + " " + MONTHS[Number(m[2]) - 1] + " " + m[1];
  }

  function todayISO() {
    const d = new Date();
    return d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0") + "-" +
      String(d.getDate()).padStart(2, "0");
  }

  /* ============================================================
     DRAFTS — localStorage persistence
     ============================================================ */
  const DRAFTS_KEY = "flywheel_drafts";

  function loadDrafts() {
    try {
      return JSON.parse(localStorage.getItem(DRAFTS_KEY) || "[]");
    } catch { return []; }
  }

  function saveDraftToStorage(draft) {
    const drafts = loadDrafts();
    const id = draft._draftId || ("d_" + Date.now() + "_" + Math.random().toString(36).slice(2, 6));
    draft._draftId = id;
    draft._savedAt = new Date().toISOString();
    const idx = drafts.findIndex((d) => d._draftId === id);
    if (idx >= 0) drafts[idx] = draft;
    else drafts.unshift(draft);
    localStorage.setItem(DRAFTS_KEY, JSON.stringify(drafts));
    paintDraftsBadge();
    return id;
  }

  function deleteDraft(draftId) {
    const drafts = loadDrafts().filter((d) => d._draftId !== draftId);
    localStorage.setItem(DRAFTS_KEY, JSON.stringify(drafts));
    paintDraftsBadge();
  }

  function paintDraftsBadge() {
    const badge = $("flyDraftsBadge");
    if (!badge) return;
    const count = loadDrafts().length;
    badge.textContent = count;
    badge.style.display = count ? "" : "none";
  }

  function openDraftsPanel() {
    const drafts = loadDrafts();
    const sheet = $("flySheet");
    let html = '<div class="fly-sheet-grip"></div>' +
      '<div class="fly-sheet-head">' +
      '<div class="fly-sheet-head-main"><div class="fly-sheet-title">My drafts</div>' +
      '<div class="fly-sheet-meta"><span class="fly-tag fly-tag-plain">' + drafts.length + ' saved</span></div></div>' +
      '<button class="fly-sheet-close" data-action="close-sheet" aria-label="Close">' + ICONS.close + "</button></div>";
    html += '<div class="fly-sheet-body">';
    if (!drafts.length) {
      html += '<div class="fly-empty" style="padding:32px 16px;text-align:center">' +
        '<div style="font-size:14px;font-weight:600;margin-bottom:6px">No drafts yet</div>' +
        '<div style="font-size:13px;color:var(--text-secondary)">When you save a draft while logging an experiment, it will appear here.</div></div>';
    } else {
      for (const d of drafts) {
        const saved = d._savedAt ? formatDate(d._savedAt) : "—";
        html += '<div class="fly-recent-card" data-draft-id="' + esc(d._draftId) + '" style="margin-bottom:8px;cursor:pointer">' +
          '<div style="min-width:0;flex:1">' +
            '<div class="fly-recent-title">' + esc(d.title || "Untitled experiment") + "</div>" +
            '<div class="fly-recent-meta">' + [d.client, d.bucket, d.industry].filter(Boolean).map(esc).join(" · ") + "</div>" +
            '<div class="fly-recent-meta" style="margin-top:2px">Saved ' + saved + "</div>" +
          "</div>" +
          '<div style="display:flex;gap:6px;align-items:center;flex-shrink:0">' +
            '<button class="fly-btn fly-btn-soft fly-btn-sm" data-action="resume-draft" data-draft-id="' + esc(d._draftId) + '">Resume</button>' +
            '<button class="fly-btn fly-btn-ghost fly-btn-sm" data-action="delete-draft" data-draft-id="' + esc(d._draftId) + '" style="color:var(--bad)">Delete</button>' +
          "</div></div>";
      }
    }
    html += "</div>";
    html += '<div class="fly-sheet-foot"><button class="fly-btn fly-btn-ghost" data-action="close-sheet">Close</button></div>';
    sheet.innerHTML = html;
    openOverlay(sheet, $("flySheetScrim"));
  }

  function resumeDraft(draftId) {
    const drafts = loadDrafts();
    const draft = drafts.find((d) => d._draftId === draftId);
    if (!draft) return;
    closeDetail();
    state.editingId = null;
    state.draft = { ...draft };
    if (!state.draft.metrics || !state.draft.metrics.length) {
      state.draft.metrics = emptyDraft().metrics;
    }
    state.step = 0;
    state.method = "manual";
    state.adding = {};
    state.unlock = {};
    $("flyDrawerTitle").textContent = "Resume draft";
    $("flyDrawerSub").textContent = "Pick up where you left off.";
    showDrawer();
    paintStep("next");
  }

  function pctChange(before, after, metric) {
    const b = Number(before);
    const a = Number(after);
    if (!isFinite(b) || !isFinite(a) || b === 0 || before === "" || after === "") return null;
    const pct = ((a - b) / Math.abs(b)) * 100;
    const lowerBetter = LOWER_IS_BETTER.has(metric);
    return { pct, improved: lowerBetter ? a < b : a > b };
  }

  function pctBadge(change) {
    if (!change) return '<span class="fly-empty">—</span>';
    const sign = change.pct > 0 ? "+" : "";
    const arrow = change.pct > 0 ? "↑" : change.pct < 0 ? "↓" : "→";
    const word = change.improved ? "better" : "worse";
    return '<span class="fly-pct ' + (change.improved ? "good" : "bad") + '" title="' + word + '">' +
      arrow + " " + sign + change.pct.toFixed(1) + '%<span class="fly-pct-note">' + word + "</span></span>";
  }

  function qualBadge(direction, label) {
    const dir = (direction || "same").toLowerCase();
    const arrow = dir === "better" ? "↑" : dir === "worse" ? "↓" : "→";
    const cls = dir === "better" ? "good" : dir === "worse" ? "bad" : "neutral";
    return '<span class="fly-pct ' + cls + '">' + arrow + " " + dir +
      (label ? '<span class="fly-pct-note">' + esc(label) + "</span>" : "") + "</span>";
  }

  function highlight(text, query) {
    const safe = esc(text);
    if (!query) return safe;
    const idx = safe.toLowerCase().indexOf(query.toLowerCase());
    if (idx === -1) return safe;
    return safe.slice(0, idx) + '<span class="fly-search-highlight">' +
      safe.slice(idx, idx + query.length) + "</span>" + safe.slice(idx + query.length);
  }

  const ICONS = {
    edit: '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 20h9"/><path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4Z"/></svg>',
    lock: '<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="11" width="18" height="11" rx="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg>',
    close: '<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>',
    expand: '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M15 3h6v6"/><path d="M9 21H3v-6"/><path d="M21 3l-7 7"/><path d="M3 21l7-7"/></svg>',
    pencilLarge: '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M12 20h9"/><path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4Z"/></svg>',
    sheet: '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8Z"/><path d="M14 2v6h6"/><path d="M8 13h8"/><path d="M8 17h8"/></svg>',
  };

  /* ============================================================
     TOASTS
     ============================================================ */
  function toast(message, kind) {
    const stack = $("flyToastStack");
    if (!stack) return;
    const el = document.createElement("div");
    el.className = "fly-toast" + (kind ? " " + kind : "");
    el.textContent = message;
    stack.appendChild(el);

    // Keep at most three on screen so a burst of saves cannot bury the UI.
    while (stack.children.length > 3) stack.firstElementChild.remove();

    setTimeout(() => {
      el.classList.add("closing");
      // Timed removal, not animationend — a missed animation frame must not
      // leave toasts stacking up forever.
      setTimeout(() => el.remove(), 260);
    }, 3200);
  }

  /* ============================================================
     DATA
     ============================================================ */
  function rowToEntry(row) {
    const qualitative =
      String(row.metricType || "").toLowerCase().startsWith("qual") ||
      (row.before === "" && row.after === "");
    const metric = qualitative
      ? {
          metric: row.metricLabel || row.bucket || "Outcome",
          qualitative: true,
          direction: (row.direction || "same").toLowerCase(),
          note: row.evidenceNote || "",
        }
      : {
          metric: row.metricLabel || "",
          qualitative: false,
          before: row.before,
          after: row.after,
        };

    return {
      id: row.id,
      date: row.date || "",
      createdAt: row.createdAt || "",
      updatedAt: row.updatedAt || "",
      client: row.client || "",
      industry: row.industry || "",
      useCase: row.useCase || "",
      bucket: row.bucket || "",
      title: row.experimentName || "(untitled experiment)",
      description: qualitative ? "" : row.evidenceNote || "",
      prompt: row.prompt || "",
      metrics: [metric],
      owner: row.loggedBy || "",
      ownerEmail: row.ownerEmail || "",
      canEdit: !!row.canEdit,
      reactions: row.reactions || { up: [], down: [] },
    };
  }

  async function loadAll() {
    const [meRes, optRes, expRes] = await Promise.allSettled([
      fetch("/api/me", { cache: "no-store" }),
      fetch("/api/options", { cache: "no-store" }),
      fetch("/api/experiments", { cache: "no-store" }),
    ]);

    if (meRes.status === "fulfilled" && meRes.value.ok) {
      state.me = await meRes.value.json();
    }
    if (optRes.status === "fulfilled" && optRes.value.ok) {
      state.options = await optRes.value.json();
    }
    if (expRes.status === "fulfilled" && expRes.value.ok) {
      const rows = await expRes.value.json();
      state.entries = Array.isArray(rows) ? rows.map(rowToEntry) : [];
      state.loadError = false;
      state.lastLoadedAt = Date.now();
    } else {
      state.loadError = true;
    }
  }

  /** Merge server rows into local state without a full reload. */
  function upsertEntries(rows) {
    for (const row of rows) {
      const entry = rowToEntry(row);
      const idx = state.entries.findIndex((e) => e.id === entry.id);
      if (idx === -1) state.entries.unshift(entry);
      else state.entries[idx] = { ...state.entries[idx], ...entry };
    }
  }

  async function refreshData(silent) {
    try {
      const res = await fetch("/api/experiments", { cache: "no-store" });
      if (!res.ok) throw new Error("read failed");
      const rows = await res.json();
      state.entries = rows.map(rowToEntry);
      state.loadError = false;
      state.lastLoadedAt = Date.now();
      repaintAll();
      if (!silent) toast("Up to date.", "success");
    } catch (e) {
      state.loadError = true;
      paintStaleBanner();
      paintRefreshed();
      if (!silent) toast("Could not refresh. Check your connection.", "error");
    }
  }

  /* ============================================================
     DERIVED
     ============================================================ */
  function filtered() {
    const f = state.filters;
    const q = state.search.trim().toLowerCase();
    return state.entries.filter((e) => {
      if (f.client && e.client !== f.client) return false;
      if (f.industry && e.industry !== f.industry) return false;
      if (f.useCase && e.useCase !== f.useCase) return false;
      if (f.bucket && e.bucket !== f.bucket) return false;
      if (f.owner && e.owner !== f.owner) return false;
      if (f.metricType === "qual" && !e.metrics.some((m) => m.qualitative)) return false;
      if (f.metricType === "quant" && !e.metrics.some((m) => !m.qualitative)) return false;
      if (q) {
        const hay = [e.title, e.description, e.client, e.bucket, e.owner, e.industry, e.useCase,
          ...e.metrics.map((m) => (m.metric || "") + " " + (m.note || ""))]
          .filter(Boolean).join(" ").toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });
  }

  function sorted(list) {
    const arr = list.slice();
    const dir = state.sortDir === "asc" ? 1 : -1;
    arr.sort((a, b) => {
      let av, bv;
      if (state.sortKey === "pct") {
        const ac = bestChange(a), bc = bestChange(b);
        av = ac ? Math.abs(ac.pct) : -1;
        bv = bc ? Math.abs(bc.pct) : -1;
      } else if (state.sortKey === "date") {
        av = a.date || "";
        bv = b.date || "";
      } else {
        av = String(a[state.sortKey] || "").toLowerCase();
        bv = String(b[state.sortKey] || "").toLowerCase();
      }
      if (av < bv) return -dir;
      if (av > bv) return dir;
      return 0;
    });
    return arr;
  }

  function bestChange(entry) {
    let best = null;
    for (const m of entry.metrics || []) {
      const c = pctChange(m.before, m.after, m.metric);
      if (c && (!best || Math.abs(c.pct) > Math.abs(best.pct))) best = c;
    }
    return best;
  }

  function countFor(key, value) {
    return state.entries.filter((e) => {
      if (key === "metricType") {
        return value === "qual"
          ? e.metrics.some((m) => m.qualitative)
          : e.metrics.some((m) => !m.qualitative);
      }
      return e[key] === value;
    }).length;
  }

  /* ============================================================
     OVERVIEW
     ============================================================ */
  function paintOverview() {
    const all = state.entries;
    const clients = new Set(all.map((e) => e.client).filter(Boolean));
    const industries = new Set(all.map((e) => e.industry).filter(Boolean));
    const useCases = new Set(all.map((e) => e.useCase).filter(Boolean));
    const owners = new Set(all.map((e) => e.owner).filter(Boolean));

    const rows = [];
    for (const e of all) {
      for (const m of e.metrics || []) {
        const c = pctChange(m.before, m.after, m.metric);
        if (c) rows.push({ e, m, c });
      }
    }
    const topWins = rows.filter((r) => r.c.improved)
      .sort((a, b) => Math.abs(b.c.pct) - Math.abs(a.c.pct)).slice(0, 5);

    const recent = all.filter((e) => e.date)
      .slice().sort((a, b) => (b.date < a.date ? -1 : b.date > a.date ? 1 : 0)).slice(0, 6);

    const moverRow = (r) =>
      '<div class="fly-mover-row" data-open="' + esc(r.e.id) + '">' +
        '<div style="min-width:0"><div class="fly-mover-main">' + esc(r.e.title) + "</div>" +
        '<div class="fly-mover-sub">' + esc(r.e.client) + " · " + esc(r.e.bucket) + " · " + esc(r.m.metric) + "</div></div>" +
        pctBadge(r.c) + "</div>";

    let html = "";

    const now = new Date();
    const thisMonth = all.filter((e) => {
      if (!e.date) return false;
      const d = new Date(e.date);
      return d.getFullYear() === now.getFullYear() && d.getMonth() === now.getMonth();
    }).length;
    const monthLabel = now.toLocaleString("default", { month: "short" });

    html += '<div class="fly-stats-row fly-stagger">' +
      statCard("Experiments logged", all.length, clients.size + " clients · " + industries.size + " industries") +
      statCard("Logged in " + monthLabel, thisMonth, thisMonth === 0 ? "Nothing yet this month" : "this month so far") +
      statCard("Use cases covered", useCases.size, industries.size + " industries") +
      statCard("Contributors", owners.size, "across " + clients.size + " clients", null, Array.from(owners).join(", ")) +
      "</div>";

    html += '<div class="fly-section-title">Top movers <span class="fly-section-sub">click any row to open it</span></div>';
    html += '<div class="fly-movers">' +
      '<div class="fly-panel fly-mover-col"><h3>What worked</h3>' +
        (topWins.length ? topWins.map(moverRow).join("") : '<div class="fly-empty" style="padding:10px">No measured wins yet.</div>') +
      "</div></div>";

    // Every breakdown filters the Experiments view on click.
    const breakdowns = [
      { key: "bucket", title: "Type of change", label: "buckets" },
      { key: "client", title: "Client", label: "clients" },
      { key: "industry", title: "Industry", label: "industries" },
      { key: "useCase", title: "Use case", label: "use cases" },
      { key: "owner", title: "Contributor", label: "people" },
    ].filter((b) => all.some((e) => e[b.key]));

    if (breakdowns.length) {
      html += '<div class="fly-section-title">Breakdown <span class="fly-section-sub">click a bar to filter the list</span></div>';
      html += '<div class="fly-charts-grid">';
      breakdowns.forEach((b, i) => {
        const counts = {};
        for (const e of all) if (e[b.key]) counts[e[b.key]] = (counts[e[b.key]] || 0) + 1;
        const entries = Object.entries(counts).sort((a, c) => c[1] - a[1]);
        const max = Math.max(...entries.map((x) => x[1]), 1);
        const shown = entries.slice(0, 8);

        html += '<div class="fly-panel"' + (breakdowns.length % 2 === 1 && i === breakdowns.length - 1 ? ' style="grid-column:1/-1"' : "") + ">";
        html += '<div class="fly-chart-head"><h3>' + esc(b.title) + "</h3>" +
          '<span class="fly-chart-total">' + entries.length + " " + esc(b.label) + "</span></div>";
        html += '<div class="fly-bucket-chart">';
        for (const [value, count] of shown) {
          const ratio = Math.max(count / max, 0.04);
          const inside = ratio > 0.16;
          html += '<div class="fly-bar-row" data-facet="' + esc(b.key) + '" data-facet-value="' + esc(value) + '" title="Filter by ' + esc(value) + '">' +
            '<div class="fly-bar-label">' + esc(value) + "</div>" +
            '<div class="fly-bar-track">' +
              '<div class="fly-bar-fill" style="--fill:' + ratio.toFixed(4) + '"></div>' +
              (inside ? '<span class="fly-bar-count">' + count + "</span>" : "") +
            "</div>" +
            (inside ? "" : '<span class="fly-bar-count-outside">' + count + "</span>") +
            "</div>";
        }
        if (entries.length > shown.length) {
          html += '<div class="fly-hint" style="margin-top:8px;text-align:right">+ ' +
            (entries.length - shown.length) + " more</div>";
        }
        html += "</div></div>";
      });
      html += "</div>";
    }

    html += '<div class="fly-section-title">Latest activity</div>';
    html += '<div class="fly-recent-list">';
    if (!recent.length) {
      html += '<div class="fly-panel" style="padding:26px;text-align:center"><div class="fly-empty">Nothing logged yet.</div></div>';
    }
    for (const e of recent) {
      html += '<div class="fly-recent-card" data-open="' + esc(e.id) + '">' +
        avatar(e.owner, "md") +
        '<div class="fly-recent-info"><div class="fly-recent-title">' + esc(e.title) + "</div>" +
        '<div class="fly-recent-meta">' + esc(e.client || "—") + " · " + esc(e.bucket || "—") + " · " + esc(e.owner || "—") + "</div></div>" +
        '<div class="fly-recent-date">' + esc(formatDate(e.date) || "—") + "</div>" +
        "</div>";
    }
    html += "</div>";

    $("flyOverviewView").innerHTML = html;
    document.querySelectorAll("#flyOverviewView [data-count]").forEach(countUp);
    statsAnimated = true;

    // Opt into the grow animation only once we know a frame is being painted.
    if (!barsAnimated && state.view === "overview") {
      requestAnimationFrame(() => {
        document.querySelectorAll("#flyOverviewView .fly-bar-fill")
          .forEach((el) => el.classList.add("grow"));
        barsAnimated = true;
      });
    }
  }
  let barsAnimated = false;

  function statCard(label, value, sub, color, tooltip) {
    return '<div class="fly-stat-card"' +
      (tooltip ? ' title="' + esc(tooltip) + '" style="cursor:help"' : "") + ">" +
      '<div class="fly-stat-label">' + esc(label) + "</div>" +
      '<div class="fly-stat-value" data-count="' + value + '"' +
        (color ? ' style="color:' + color + '"' : "") + ">" + value + "</div>" +
      '<div class="fly-stat-sub">' + esc(sub) + "</div></div>";
  }

  /**
   * Counts up on the first paint only. Re-running this on every data refresh
   * both distracts and — when the overview is the hidden tab — can leave the
   * card showing 0, because the animation never gets a frame to finish in.
   */
  let statsAnimated = false;
  function countUp(el) {
    const target = Number(el.dataset.count) || 0;
    const instant =
      statsAnimated ||
      target === 0 ||
      state.view !== "overview" ||
      document.hidden ||
      window.matchMedia("(prefers-reduced-motion: reduce)").matches;

    if (instant) {
      el.textContent = String(target);
      return;
    }
    const duration = 620;
    const start = performance.now();
    (function tick(now) {
      const t = Math.min((now - start) / duration, 1);
      el.textContent = String(Math.round(target * (1 - Math.pow(1 - t, 4))));
      if (t < 1) requestAnimationFrame(tick);
      else el.textContent = String(target);
    })(start);
  }

  /* ============================================================
     FILTER BAR — popovers toggle by class, never by re-render
     ============================================================ */
  const FILTER_DEFS = [
    { key: "client", label: "Client" },
    { key: "industry", label: "Industry" },
    { key: "useCase", label: "Use case" },
    { key: "bucket", label: "Bucket" },
    { key: "owner", label: "Owner" },
    { key: "metricType", label: "Type" },
  ];

  function optionsFor(key) {
    if (key === "metricType") {
      return [{ value: "quant", label: "Quantitative" }, { value: "qual", label: "Qualitative" }];
    }
    // Drive options off the data so a filter can never offer a dead end.
    const present = [...new Set(state.entries.map((e) => e[key]).filter(Boolean))];
    return present.sort((a, b) => a.localeCompare(b)).map((v) => ({ value: v, label: v }));
  }

  function paintFilterBar() {
    let html = '<div class="fly-filters-row">';
    for (const def of FILTER_DEFS) {
      const active = state.filters[def.key];
      const opts = optionsFor(def.key);
      if (!opts.length) continue;
      const shown = active
        ? (def.key === "metricType" ? (active === "quant" ? "Quantitative" : "Qualitative") : active)
        : def.label;

      html += '<div class="fly-chip-wrap" data-filter="' + def.key + '">';
      html += '<button class="fly-chip' + (active ? " active" : "") + '" data-chip="' + def.key +
        '" aria-haspopup="true" aria-expanded="false">' + esc(shown) +
        (active
          ? '<span class="fly-chip-x" data-clear="' + def.key + '" role="button" aria-label="Clear ' + esc(def.label) + '">&times;</span>'
          : '<span class="fly-chip-caret">▼</span>') +
        "</button>";
      html += '<div class="fly-popover" role="listbox">';
      if (opts.length > 8) {
        html += '<input class="fly-popover-search" data-popsearch="' + def.key + '" placeholder="Filter…" />';
      }
      for (const opt of opts) {
        html += '<button class="fly-popover-item' + (active === opt.value ? " selected" : "") +
          '" data-set="' + def.key + '" data-value="' + esc(opt.value) + '">' +
          "<span>" + esc(opt.label) + "</span>" +
          '<span class="fly-popover-count">' + countFor(def.key, opt.value) + "</span></button>";
      }
      html += "</div></div>";
    }

    if (Object.values(state.filters).some(Boolean) || state.search) {
      html += '<button class="fly-clear-link" data-action="reset-filters">Clear all</button>';
    }
    html += "</div>";
    $("flyFilterBar").innerHTML = html;
    paintFilterBarMobile();
    if ($("flyFilterDrawer").classList.contains("open")) paintFilterSheet();
  }

  const SORTS = [
    { key: "date", dir: "desc", label: "Newest first" },
    { key: "date", dir: "asc", label: "Oldest first" },
    { key: "pct", dir: "desc", label: "Biggest impact" },
    { key: "client", dir: "asc", label: "Client A–Z" },
    { key: "owner", dir: "asc", label: "Contributor A–Z" },
  ];

  /** Mobile replaces the chip row with one Filters button plus a sort select. */
  function paintFilterBarMobile() {
    const active = FILTER_DEFS.filter((d) => state.filters[d.key]).length;
    $("flyFilterBarMobile").innerHTML =
      '<button class="fly-filter-btn" data-action="open-filters">' +
        '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"><line x1="4" y1="6" x2="20" y2="6"/><line x1="7" y1="12" x2="17" y2="12"/><line x1="10" y1="18" x2="14" y2="18"/></svg>' +
        "Filters" + (active ? '<span class="count">' + active + "</span>" : "") +
      "</button>" +
      '<select class="fly-sort-select" data-sort-select>' +
        SORTS.map((s, i) =>
          '<option value="' + i + '"' +
          (s.key === state.sortKey && s.dir === state.sortDir ? " selected" : "") +
          ">" + esc(s.label) + "</option>").join("") +
      "</select>";
  }

  function paintFilterSheet() {
    const active = FILTER_DEFS.filter((d) => state.filters[d.key]).length;
    $("flyFilterSub").textContent = active
      ? active + (active === 1 ? " filter" : " filters") + " on · " + sorted(filtered()).length + " results"
      : sorted(filtered()).length + " experiments";

    let html = "";
    for (const def of FILTER_DEFS) {
      const opts = optionsFor(def.key);
      if (!opts.length) continue;
      html += '<div class="fly-facet"><h4>' + esc(def.label) + "</h4>";
      html += '<div class="fly-facet-options">';
      for (const opt of opts) {
        const on = state.filters[def.key] === opt.value;
        html += '<button class="fly-facet-opt' + (on ? " on" : "") +
          '" data-set="' + def.key + '" data-value="' + esc(opt.value) + '">' +
          esc(opt.label) + '<span class="fly-facet-count">' + countFor(def.key, opt.value) + "</span></button>";
      }
      html += "</div></div>";
    }
    $("flyFilterBody").innerHTML = html || '<div class="fly-empty">Nothing to filter yet.</div>';
  }

  function closePopovers() {
    document.querySelectorAll(".fly-chip-wrap.open, .fly-menu-wrap.open")
      .forEach((el) => {
        el.classList.remove("open");
        const trigger = el.querySelector("[aria-expanded]");
        if (trigger) trigger.setAttribute("aria-expanded", "false");
      });
    state.openPopover = null;
  }

  /* ============================================================
     TABLE
     ============================================================ */
  const COLUMNS = [
    { key: "date", label: "Date", sortable: true },
    { key: "title", label: "Experiment", sortable: true, sticky: "title" },
    { key: "client", label: "Client", sortable: true },
    { key: "industry", label: "Industry / Use case" },
    { key: "bucket", label: "Bucket", sortable: true },
    { key: "pct", label: "Impact", sortable: true },
    { key: "owner", label: "Owner", sortable: true },
    { key: "reactions", label: "Reactions" },
    { key: "actions", label: "", sticky: "actions" },
  ];

  const MOBILE_QUERY = "(max-width: 760px)";
  const isMobile = () => window.matchMedia(MOBILE_QUERY).matches;

  function paintTable(firstPaint) {
    const list = sorted(filtered());
    const host = $("flyTableHost");

    // Reacting to a row 40 deep must not throw the reader back to the top.
    const prev = $("flyTableScroll");
    const keepScroll = prev ? { left: prev.scrollLeft, top: prev.scrollTop } : null;

    $("flyResultsCount").innerHTML =
      "Showing <strong>" + list.length + "</strong> of " + state.entries.length + " experiments" +
      (list.length !== state.entries.length
        ? ' · <button class="fly-clear-link" data-action="reset-filters" style="padding:0 2px">reset</button>'
        : "");
    const tabCount = $("flyTabCount");
    if (tabCount) tabCount.textContent = String(state.entries.length);

    // A nine-column grid does not survive a phone. On mobile the same data is
    // rendered as a grouped card feed instead — see paintCards.
    if (isMobile()) {
      paintCards(list, firstPaint);
      return;
    }

    const arrow = (key) =>
      state.sortKey === key
        ? '<span class="fly-sort-arrow">' + (state.sortDir === "asc" ? "▲" : "▼") + "</span>"
        : "";

    let html = '<div class="fly-table-scroll" id="flyTableScroll"><table class="fly-table"><thead><tr>';
    for (const col of COLUMNS) {
      html += "<th" +
        (col.sortable ? ' class="sortable' + (col.sticky ? " fly-col-" + col.sticky : "") + '" data-sort="' + col.key + '"' :
          col.sticky ? ' class="fly-col-' + col.sticky + '"' : "") +
        ">" + esc(col.label) + (col.sortable ? arrow(col.key) : "") + "</th>";
    }
    html += "</tr></thead><tbody>";

    if (!list.length) {
      html += '<tr><td colspan="' + COLUMNS.length + '"><div class="fly-table-empty">' +
        '<div class="fly-table-empty-title">Nothing matches these filters</div>' +
        '<div class="fly-table-empty-sub">Try clearing a filter or searching for something else.</div>' +
        "</div></td></tr>";
    }

    for (const e of list) {
      const metricsHtml = (e.metrics || []).filter((m) => m.metric).map((m) => {
        if (m.qualitative) return '<div class="fly-metric-line">' + qualBadge(m.direction, m.metric) + "</div>";
        const c = pctChange(m.before, m.after, m.metric);
        return '<div class="fly-metric-line"><span class="fly-metric-values">' + esc(m.metric) + " " +
          esc(m.before) + " → " + esc(m.after) + "</span> " + pctBadge(c) + "</div>";
      }).join("") || '<span class="fly-empty">—</span>';

      const r = e.reactions || { up: [], down: [] };
      const meUp = r.up.includes(state.me.email);
      const meDown = r.down.includes(state.me.email);

      html += '<tr data-row="' + esc(e.id) + '">';
      html += '<td class="fly-nowrap"><div class="fly-date-main">' + esc(formatDate(e.date) || "—") + "</div></td>";
      html += '<td class="fly-col-title"><div class="fly-title-main">' + esc(e.title) + "</div>" +
        (e.description ? '<div class="fly-title-desc">' + esc(e.description) + "</div>" : "") + "</td>";
      html += "<td>" + esc(e.client || "—") + "</td>";
      html += "<td>" + (e.industry ? '<span class="fly-tag fly-tag-plain">' + esc(e.industry) + "</span>" : '<span class="fly-empty">—</span>') +
        (e.useCase ? '<div class="fly-title-desc" style="margin-top:4px">' + esc(e.useCase) + "</div>" : "") + "</td>";
      html += "<td>" + (e.bucket ? '<span class="fly-tag">' + esc(e.bucket) + "</span>" : '<span class="fly-empty">—</span>') + "</td>";
      html += "<td>" + metricsHtml + "</td>";
      html += '<td class="fly-nowrap"><span class="fly-owner-badge">' + avatar(e.owner) + esc(e.owner || "—") + "</span></td>";
      html += '<td class="fly-nowrap"><div class="fly-reactions">' +
        '<button class="fly-react-btn ' + (meUp ? "active-up" : "") + '" data-react="up" data-id="' + esc(e.id) + '">👍 ' + r.up.length + "</button>" +
        '<button class="fly-react-btn ' + (meDown ? "active-down" : "") + '" data-react="down" data-id="' + esc(e.id) + '">👎 ' + r.down.length + "</button>" +
        "</div></td>";
      html += '<td class="fly-col-actions"><div style="display:flex;gap:5px">' +
        '<button class="fly-row-btn" data-detail="' + esc(e.id) + '" title="Open details">' + ICONS.expand + "</button>" +
        (e.canEdit
          ? '<button class="fly-row-btn" data-edit="' + esc(e.id) + '" title="Edit">' + ICONS.edit + "</button>"
          : '<button class="fly-row-btn" disabled title="Only ' + esc(e.owner || "the contributor") + ' can edit this">' + ICONS.lock + "</button>") +
        "</div></td>";
      html += "</tr>";
    }

    html += "</tbody></table></div>";
    host.innerHTML = html;

    if (firstPaint) {
      const body = host.querySelector("tbody");
      if (body) body.classList.add("fly-stagger");
    }

    const scroller = $("flyTableScroll");
    if (scroller && keepScroll && !firstPaint) {
      scroller.scrollLeft = keepScroll.left;
      scroller.scrollTop = keepScroll.top;
    }
    if (scroller) {
      scroller.addEventListener("scroll", updateScrollShadows, { passive: true });
      updateScrollShadows();
    }
  }

  /**
   * Mobile list. The table's job is comparison across columns; on a phone that
   * is impossible, so the job changes to scanning. Each card leads with the
   * title and the one number that matters, everything else is secondary, and
   * cards are grouped by month so the feed has landmarks while scrolling.
   */
  function paintCards(list, firstPaint) {
    const host = $("flyTableHost");

    if (!list.length) {
      host.innerHTML = '<div class="fly-panel fly-table-empty">' +
        '<div class="fly-table-empty-title">Nothing matches these filters</div>' +
        '<div class="fly-table-empty-sub">Try clearing a filter or searching for something else.</div>' +
        "</div>";
      return;
    }

    // Sorting by date gives meaningful month headings; any other sort would
    // scatter them, so the grouping only applies when it actually groups.
    const grouped = state.sortKey === "date";
    let html = '<div class="fly-cards"' + (firstPaint ? ' class="fly-cards fly-stagger"' : "") + ">";
    let lastGroup = null;

    for (const e of list) {
      if (grouped) {
        const group = e.date
          ? MONTHS[Number(e.date.slice(5, 7)) - 1] + " " + e.date.slice(0, 4)
          : "No date";
        if (group !== lastGroup) {
          lastGroup = group;
          html += '<div class="fly-card-group">' + esc(group) + "</div>";
        }
      }

      const metrics = (e.metrics || []).filter((m) => m.metric);
      const lead = metrics[0];
      let impact = "";
      if (lead) {
        impact = lead.qualitative
          ? qualBadge(lead.direction, "")
          : pctBadge(pctChange(lead.before, lead.after, lead.metric));
      }

      html += '<article class="fly-card" data-row="' + esc(e.id) + '">';
      html += '<div class="fly-card-top">' +
        '<h3 class="fly-card-title">' + esc(e.title) + "</h3>" +
        (impact ? '<div class="fly-card-impact">' + impact + "</div>" : "") +
        "</div>";

      if (lead && !lead.qualitative) {
        html += '<div class="fly-card-metric">' + esc(lead.metric) + " " +
          '<span class="fly-metric-values">' + esc(lead.before) + " → " + esc(lead.after) + "</span>" +
          (metrics.length > 1 ? ' <span class="fly-card-more">+' + (metrics.length - 1) + " more</span>" : "") +
          "</div>";
      } else if (lead) {
        html += '<div class="fly-card-metric">' + esc(lead.metric) + "</div>";
      }

      html += '<div class="fly-card-tags">' +
        (e.client ? '<span class="fly-tag fly-tag-plain">' + esc(e.client) + "</span>" : "") +
        (e.bucket ? '<span class="fly-tag">' + esc(e.bucket) + "</span>" : "") +
        (e.useCase ? '<span class="fly-tag fly-tag-plain">' + esc(e.useCase) + "</span>" : "") +
        "</div>";

      const r = e.reactions || { up: [], down: [] };
      const meUp = r.up.includes(state.me.email);
      const meDown = r.down.includes(state.me.email);

      html += '<div class="fly-card-foot">' +
        '<span class="fly-owner-badge">' + avatar(e.owner) + esc(e.owner || "—") + "</span>" +
        '<span class="fly-card-date">' + esc(formatDate(e.date) || "—") + "</span>" +
        '<div class="fly-card-actions">' +
          '<button class="fly-react-btn ' + (meUp ? "active-up" : "") + '" data-react="up" data-id="' + esc(e.id) + '">👍 ' + r.up.length + "</button>" +
          '<button class="fly-react-btn ' + (meDown ? "active-down" : "") + '" data-react="down" data-id="' + esc(e.id) + '">👎 ' + r.down.length + "</button>" +
          (e.canEdit
            ? '<button class="fly-row-btn" data-edit="' + esc(e.id) + '" aria-label="Edit">' + ICONS.edit + "</button>"
            : "") +
        "</div></div>";
      html += "</article>";
    }
    html += "</div>";
    host.innerHTML = html;
  }

  /** Shows the sticky-column shadows only when there is actually overflow. */
  function updateScrollShadows() {
    const scroller = $("flyTableScroll");
    if (!scroller) return;
    const maxLeft = scroller.scrollWidth - scroller.clientWidth;
    scroller.classList.toggle("can-scroll-x", maxLeft > 1 && scroller.scrollLeft < maxLeft - 1);
    scroller.classList.toggle("scrolled-x", scroller.scrollLeft > 1);
  }

  /* ============================================================
     OVERLAY CONTROLLER
     A half-closed scrim covers the viewport and swallows every click, so
     closing must never depend on an animationend that might not arrive
     (child animations bubble, reduced-motion finishes early, a re-open
     mid-close cancels it). Each overlay owns one timer and always lands
     in a clean state.
     ============================================================ */
  const overlayTimers = new Map();

  function openOverlay(panel, scrim) {
    const key = panel.id;
    clearTimeout(overlayTimers.get(key));
    overlayTimers.delete(key);
    for (const el of [panel, scrim]) {
      if (!el) continue;
      el.classList.remove("closing");
      el.classList.add("open");
    }
  }

  function closeOverlay(panel, scrim, duration) {
    const key = panel.id;
    if (!panel.classList.contains("open")) {
      // Already closed (or stuck mid-close) — normalise and bail.
      if (scrim) scrim.classList.remove("open", "closing");
      panel.classList.remove("closing");
      return false;
    }
    clearTimeout(overlayTimers.get(key));
    for (const el of [panel, scrim]) {
      if (el) el.classList.add("closing");
    }
    const timer = setTimeout(() => {
      for (const el of [panel, scrim]) {
        if (el) el.classList.remove("open", "closing");
      }
      overlayTimers.delete(key);
    }, duration || 220);
    overlayTimers.set(key, timer);
    return true;
  }

  /* ============================================================
     DETAIL SHEET
     ============================================================ */
  /**
   * This runs inside an iframe on /dashboard, so window.location is
   * /api/dashboard. A link built from it opens the bare frame instead of the
   * app, which is why shared experiment links looked broken.
   */
  function appUrl(expId) {
    return window.location.origin + "/dashboard" +
      (expId ? "?exp=" + encodeURIComponent(expId) : "");
  }

  /** Keeps the browser's address bar — the parent page — in step with the sheet. */
  function syncTopUrl(expId) {
    try {
      if (window.parent === window) return;
      const url = new URL(window.parent.location.href);
      if (expId) url.searchParams.set("exp", expId);
      else url.searchParams.delete("exp");
      window.parent.history.replaceState(null, "", url);
    } catch {
      // Cross-origin parent: the in-frame URL below is still correct.
    }
  }

  function openDetail(id) {
    const e = state.entries.find((x) => x.id === id);
    if (!e) return;

    const url = new URL(window.location);
    url.searchParams.set("exp", id);
    history.replaceState(null, "", url);
    syncTopUrl(id);

    // --- Metrics ---
    let metricsHtml = "";
    for (const m of e.metrics || []) {
      if (!m.metric) continue;
      metricsHtml += '<div class="fly-metric-card">';
      metricsHtml += '<div class="fly-metric-name">' + esc(m.metric) + "</div>";
      if (m.qualitative) {
        metricsHtml += '<div class="fly-metric-delta">' + qualBadge(m.direction, "") + "</div>";
        if (m.note) metricsHtml += '<div class="fly-metric-note">' + esc(m.note) + "</div>";
      } else {
        const c = pctChange(m.before, m.after, m.metric);
        metricsHtml += '<div class="fly-metric-delta"><span class="fly-metric-ba">' +
          esc(m.before || "—") + '<span class="fly-metric-arrow">→</span>' + esc(m.after || "—") +
          "</span>" + pctBadge(c) + "</div>";
      }
      metricsHtml += "</div>";
    }

    // --- Reactions ---
    const r = e.reactions || { up: [], down: [] };
    const hasReactions = r.up.length || r.down.length;

    // --- Header ---
    let html = '<div class="fly-sheet-grip"></div>' +
      '<div class="fly-sheet-head">' +
        '<div class="fly-sheet-head-main">' +
          '<div class="fly-sheet-title" id="flySheetTitle">' + esc(e.title) + "</div>" +
          '<div class="fly-sheet-byline">' +
            avatar(e.owner || "", "sm") +
            '<span>' + esc(e.owner || "Unknown") + '</span>' +
            '<span class="fly-sheet-byline-sep">·</span>' +
            '<span>' + esc(formatDate(e.date) || "No date") + '</span>' +
          '</div>' +
        "</div>" +
        '<button class="fly-sheet-close" data-action="close-sheet" aria-label="Close">' + ICONS.close + "</button>" +
      "</div>";

    html += '<div class="fly-sheet-body">';

    // --- Tags row ---
    const tags = [e.bucket, e.client, e.industry].filter(Boolean);
    if (tags.length) {
      html += '<div class="fly-detail-tags">';
      if (e.bucket) html += '<span class="fly-tag">' + esc(e.bucket) + "</span>";
      if (e.client) html += '<span class="fly-tag fly-tag-plain">' + esc(e.client) + "</span>";
      if (e.industry) html += '<span class="fly-tag fly-tag-plain">' + esc(e.industry) + "</span>";
      html += "</div>";
    }

    // --- Impact (always shown) ---
    if (metricsHtml) {
      html += '<div class="fly-detail-section">' + metricsHtml + "</div>";
    }

    // --- Description ---
    html += '<div class="fly-detail-section">';
    if (e.description) {
      html += '<div class="fly-detail-desc">' + esc(e.description) + "</div>";
    } else {
      html += '<div class="fly-detail-desc fly-detail-empty">No description added' +
        (e.canEdit ? ' — <a href="#" data-edit="' + esc(e.id) + '">add one</a>' : '') + '</div>';
    }
    html += "</div>";

    // --- Prompt ---
    if (e.prompt) {
      html += '<div class="fly-detail-section">' +
        '<div class="fly-field-label">Prompt used</div>' +
        '<div class="fly-prompt-box">' + esc(e.prompt) + "</div></div>";
    }

    // --- Context: compact key-value grid, always show all fields ---
    var kvEmpty = '<span class="fly-detail-kv-empty">Not specified</span>';
    html += '<div class="fly-detail-context">';
    html += '<div class="fly-detail-kv"><span class="fly-detail-kv-label">Use case</span>' +
      '<span class="fly-detail-kv-value">' + (e.useCase ? esc(e.useCase) : kvEmpty) + '</span></div>';
    html += '<div class="fly-detail-kv"><span class="fly-detail-kv-label">Type of change</span>' +
      '<span class="fly-detail-kv-value">' + (e.bucket ? esc(e.bucket) : kvEmpty) + '</span></div>';
    html += '<div class="fly-detail-kv"><span class="fly-detail-kv-label">Client</span>' +
      '<span class="fly-detail-kv-value">' + (e.client ? esc(e.client) : kvEmpty) + '</span></div>';
    html += '<div class="fly-detail-kv"><span class="fly-detail-kv-label">Industry</span>' +
      '<span class="fly-detail-kv-value">' + (e.industry ? esc(e.industry) : kvEmpty) + '</span></div>';
    html += "</div>";

    // --- Reactions (only if they exist) ---
    if (hasReactions) {
      html += '<div class="fly-detail-reactions">' +
        (r.up.length ? '<span class="fly-reaction-pill up">👍 ' + r.up.length + '</span>' : '') +
        (r.down.length ? '<span class="fly-reaction-pill down">👎 ' + r.down.length + '</span>' : '') +
        '</div>';
    }

    // --- Related experiments ---
    const related = state.entries
      .filter((x) => x.id !== e.id && x.client && x.client === e.client)
      .slice(0, 4);
    if (related.length) {
      html += '<div class="fly-detail-divider"></div>';
      html += '<div class="fly-field-label">Also on ' + esc(e.client) + "</div>";
      html += '<div class="fly-detail-related">';
      for (const rel of related) {
        html += '<div class="fly-recent-card" data-open="' + esc(rel.id) + '">' +
          avatar(rel.owner, "sm") +
          '<div class="fly-recent-info"><div class="fly-recent-title">' + esc(rel.title) + "</div>" +
          '<div class="fly-recent-meta">' + esc(rel.bucket || "") +
            (rel.bucket && rel.date ? " · " : "") + esc(formatDate(rel.date) || "") + "</div></div></div>";
      }
      html += "</div>";
    }
    // --- Comments — deliberately last. Anything rendered below the composer
    // reads as part of the thread, which is how a related-experiment card ended
    // up looking like someone's comment. ---
    html += '<div class="fly-detail-divider"></div>';
    html += '<div class="fly-detail-comments">' +
      '<div class="fly-detail-comments-head">' +
        '<span class="fly-field-label" style="margin:0">Comments</span>' +
      '</div>' +
      '<div id="flyCommentsList" data-experiment-id="' + esc(e.id) + '">' +
        '<div class="fly-comment-loading">Loading…</div>' +
      '</div>' +
      '<div class="fly-comment-compose">' +
        '<div id="flyReplyTarget"></div>' +
        '<div class="fly-comment-input-row">' +
          myAvatar("sm") +
          '<textarea id="flyCommentInput" class="fly-comment-input" placeholder="Leave a comment…" rows="1"></textarea>' +
          '<button class="fly-btn fly-btn-primary fly-btn-sm" id="flyCommentSend" disabled>Post</button>' +
        '</div>' +
      '</div>' +
    '</div>';

    html += "</div>";

    // --- Footer ---
    html += '<div class="fly-sheet-foot">';
    html += '<button class="fly-btn fly-btn-ghost fly-btn-sm" data-copy-link="' + esc(e.id) + '" title="Copy link">' +
      '<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"/><path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"/></svg>' +
      " Copy link</button>";
    if (e.canEdit) {
      html += '<button class="fly-btn fly-btn-ghost fly-btn-sm fly-btn-danger" data-delete="' + esc(e.id) + '" title="Delete experiment">' +
        '<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg>' +
        " Delete</button>";
      html += '<div style="flex:1"></div>' +
        '<button class="fly-btn fly-btn-ghost fly-btn-sm" data-action="close-sheet">Close</button>' +
        '<button class="fly-btn fly-btn-primary fly-btn-sm" data-edit="' + esc(e.id) + '">' + ICONS.edit + " Edit</button>";
    } else {
      html += '<span class="fly-lock-note">' + ICONS.lock +
        " Only " + esc(e.owner || "the author") + " can edit</span>";
      html += '<div style="flex:1"></div><button class="fly-btn fly-btn-ghost fly-btn-sm" data-action="close-sheet">Close</button>';
    }
    html += "</div>";

    state.commentReplyTo = null;
    state.commentEditing = null;

    const sheet = $("flySheet");
    sheet.innerHTML = html;
    openOverlay(sheet, $("flySheetScrim"));
    loadComments(e.id);
    setupCommentInput(e.id);
  }

  function renderComment(c, replies) {
    const editing = state.commentEditing === c.id;
    let html = '<div class="fly-comment' + (c.parentId ? " fly-comment-reply" : "") +
      '" data-comment-id="' + esc(c.id) + '">' +
      '<div class="fly-comment-head">' +
        avatar(c.author, "sm") +
        '<div class="fly-comment-author">' + esc(c.author) + '</div>' +
        '<div class="fly-comment-time"' +
          (c.editedAt ? ' title="Posted ' + esc(fullTimestamp(c.createdAt)) +
            ', edited ' + esc(fullTimestamp(c.editedAt)) + '"' : '') + '>' +
          (c.editedAt ? "edited " + timeAgo(c.editedAt) : timeAgo(c.createdAt)) +
        '</div>' +
        (state.commentThreading && !c.parentId && !editing
          ? '<button class="fly-comment-act" data-action="reply-to" data-comment-id="' + esc(c.id) + '">Reply</button>'
          : '') +
        (c.canEdit && !editing
          ? '<button class="fly-comment-act" data-action="edit-comment" data-comment-id="' + esc(c.id) + '">Edit</button>'
          : '') +
        (c.canDelete && !editing
          ? '<button class="fly-comment-delete" data-action="delete-comment" data-comment-id="' + esc(c.id) + '" title="Delete">' + ICONS.close + '</button>'
          : '') +
      '</div>';

    if (editing) {
      html += '<div class="fly-comment-body">' +
        '<textarea class="fly-comment-input" data-comment-edit="' + esc(c.id) + '" rows="2">' + esc(c.body) + '</textarea>' +
        '<div class="fly-comment-edit-actions">' +
          '<button class="fly-btn fly-btn-ghost fly-btn-sm" data-action="cancel-comment-edit">Cancel</button>' +
          '<button class="fly-btn fly-btn-primary fly-btn-sm" data-action="save-comment-edit" data-comment-id="' + esc(c.id) + '">Save</button>' +
        '</div></div>';
    } else {
      html += '<div class="fly-comment-body">' + esc(c.body) + '</div>';
    }

    html += (replies || []).map((r) => renderComment(r, [])).join("");
    return html + '</div>';
  }

  /** Exact date and time, for the tooltip on an edited comment. */
  function fullTimestamp(dateStr) {
    if (!dateStr) return "";
    const d = new Date(dateStr);
    if (isNaN(d.getTime())) return "";
    const time = String(d.getHours()).padStart(2, "0") + ":" + String(d.getMinutes()).padStart(2, "0");
    return d.getDate() + " " + MONTHS[d.getMonth()] + " " + d.getFullYear() + ", " + time;
  }

  function timeAgo(dateStr) {
    const now = Date.now();
    const then = new Date(dateStr).getTime();
    const diff = Math.max(0, now - then);
    const mins = Math.floor(diff / 60000);
    if (mins < 1) return "just now";
    if (mins < 60) return mins + "m ago";
    const hrs = Math.floor(mins / 60);
    if (hrs < 24) return hrs + "h ago";
    const days = Math.floor(hrs / 24);
    if (days < 30) return days + "d ago";
    return formatDate(dateStr);
  }

  async function loadComments(experimentId) {
    const list = $("flyCommentsList");
    if (!list) return;
    try {
      const res = await fetch("/api/experiments/" + experimentId + "/comments");
      if (!res.ok) throw new Error();
      const data = await res.json();
      if (data.pending) {
        list.innerHTML = '<div class="fly-comment-empty">Comments will be available after the migration is run.</div>';
        return;
      }
      state.commentThreading = !!data.threading;
      if (!data.comments.length) {
        list.innerHTML = '<div class="fly-comment-empty">No comments yet. Be the first to ask a question or share feedback.</div>';
        paintCommentComposer();
        return;
      }
      // One level deep: replies hang off their parent, in the order they arrived.
      const repliesFor = new Map();
      for (const c of data.comments) {
        if (!c.parentId) continue;
        if (!repliesFor.has(c.parentId)) repliesFor.set(c.parentId, []);
        repliesFor.get(c.parentId).push(c);
      }
      list.innerHTML = data.comments
        .filter((c) => !c.parentId)
        .map((c) => renderComment(c, repliesFor.get(c.id) || []))
        .join("");
      paintCommentComposer();
    } catch {
      list.innerHTML = '<div class="fly-comment-empty">Could not load comments.</div>';
    }
  }

  /** Shows who a reply is aimed at, and gives a way out of it. */
  function paintCommentComposer() {
    const host = $("flyReplyTarget");
    if (!host) return;
    const target = state.commentReplyTo;
    host.innerHTML = target
      ? '<span class="fly-reply-chip">Replying to ' + esc(target.author) +
        '<button data-action="cancel-reply" aria-label="Cancel reply">' + ICONS.close + "</button></span>"
      : "";
    const input = $("flyCommentInput");
    if (input) {
      input.placeholder = target ? "Write a reply…" : "Leave a comment…";
    }
  }

  async function saveCommentEdit(experimentId, commentId) {
    const field = document.querySelector('[data-comment-edit="' + commentId + '"]');
    const body = field ? field.value.trim() : "";
    if (!body) { toast("A comment cannot be empty.", "error"); return; }
    try {
      const res = await fetch(
        "/api/experiments/" + experimentId + "/comments?commentId=" + encodeURIComponent(commentId),
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ body }),
        }
      );
      if (!res.ok) throw new Error();
      state.commentEditing = null;
      loadComments(experimentId);
    } catch {
      toast("Could not save that edit.", "error");
    }
  }

  function setupCommentInput(experimentId) {
    const input = $("flyCommentInput");
    const btn = $("flyCommentSend");
    if (!input || !btn) return;

    input.addEventListener("input", function () {
      btn.disabled = !this.value.trim();
      this.style.height = "auto";
      this.style.height = Math.min(this.scrollHeight, 120) + "px";
    });

    btn.addEventListener("click", async function () {
      const body = input.value.trim();
      if (!body) return;
      btn.disabled = true;
      btn.textContent = "Posting…";
      try {
        const parentId = state.commentReplyTo ? state.commentReplyTo.id : null;
        const res = await fetch("/api/experiments/" + experimentId + "/comments", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(parentId ? { body, parentId } : { body }),
        });
        if (!res.ok) throw new Error();
        input.value = "";
        input.style.height = "auto";
        btn.textContent = "Post";
        state.commentReplyTo = null;
        await loadComments(experimentId);
        const posted = ($("flyCommentsList") || {}).lastElementChild;
        if (posted && posted.scrollIntoView) {
          posted.scrollIntoView({ behavior: "smooth", block: "nearest" });
        }
      } catch {
        toast("Could not post comment.", "error");
        btn.disabled = false;
        btn.textContent = "Post";
      }
    });
  }

  async function deleteComment(experimentId, commentId) {
    try {
      const res = await fetch("/api/experiments/" + experimentId + "/comments?commentId=" + commentId, {
        method: "DELETE",
      });
      if (!res.ok) throw new Error();
      loadComments(experimentId);
    } catch {
      toast("Could not delete comment.", "error");
    }
  }

  function closeDetail() {
    closeOverlay($("flySheet"), $("flySheetScrim"), 220);
    const url = new URL(window.location);
    if (url.searchParams.has("exp")) {
      url.searchParams.delete("exp");
      history.replaceState(null, "", url);
    }
    syncTopUrl(null);
  }

  /* ============================================================
     REACTIONS
     ============================================================ */
  async function toggleReaction(id, type) {
    const entry = state.entries.find((e) => e.id === id);
    if (!entry) return;
    // The server records the reaction against the signed-in email and ignores
    // anything the browser claims, so this is only for the optimistic paint.
    const me = state.me.email;
    if (!me) { toast("Could not identify you — try signing in again.", "error"); return; }

    // Optimistic, then reconciled with the server response.
    const r = entry.reactions || (entry.reactions = { up: [], down: [] });
    const other = type === "up" ? "down" : "up";
    r[other] = r[other].filter((n) => n !== me);
    r[type] = r[type].includes(me) ? r[type].filter((n) => n !== me) : r[type].concat(me);
    paintTable(false);

    try {
      const res = await fetch("/api/experiments/" + encodeURIComponent(id) + "/reactions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ reaction: type }),
      });
      if (res.ok) {
        entry.reactions = await res.json();
        paintTable(false);
      }
    } catch (e) {
      toast("Reaction did not save.", "error");
    }
  }

  /* ============================================================
     FORM DRAWER — progressive steps
     ============================================================ */
  const STEPS = [
    { id: "context", label: "Context" },
    { id: "change", label: "What changed" },
    { id: "impact", label: "Impact" },
    { id: "review", label: "Review" },
  ];

  function emptyDraft() {
    return {
      date: todayISO(),
      client: "", industry: "", useCase: "", bucket: "",
      title: "", description: "", prompt: "",
      metrics: [{ metric: "", qualitative: false, before: "", after: "", direction: "better", note: "" }],
      owner: state.me.firstName || "",
    };
  }

  function openLogDrawer() {
    state.editingId = null;
    state.draft = emptyDraft();
    state.step = -1; // method picker
    state.method = "manual";
    state.adding = {};
    state.unlock = {};
    $("flyDrawerTitle").textContent = "Log an experiment";
    $("flyDrawerSub").textContent = "A few quick steps — nothing is saved until the last one.";
    showDrawer();
    paintStep("next");
  }

  function openEditDrawer(id) {
    const e = state.entries.find((x) => x.id === id);
    if (!e) return;
    if (!e.canEdit) {
      toast("Only " + (e.owner || "the contributor who logged this") + " can edit this experiment.", "error");
      return;
    }
    closeDetail();
    state.editingId = id;
    state.draft = {
      date: e.date || todayISO(),
      client: e.client, industry: e.industry, useCase: e.useCase, bucket: e.bucket,
      title: e.title, description: e.description, prompt: e.prompt,
      metrics: (e.metrics || []).map((m) => ({
        metric: m.metric || "", qualitative: !!m.qualitative,
        before: m.before ?? "", after: m.after ?? "",
        direction: m.direction || "better", note: m.note || "",
      })),
      // Ownership is fixed to whoever logged it — an edit must never reassign it.
      owner: e.owner,
    };
    if (!state.draft.metrics.length) state.draft.metrics = emptyDraft().metrics;
    state.step = 0;
    state.method = "manual";
    state.adding = {};
    state.unlock = {};
    $("flyDrawerTitle").textContent = "Edit experiment";
    $("flyDrawerSub").textContent = "Changes save straight to the database for everyone.";
    showDrawer();
    paintStep("next");
  }

  function showDrawer() {
    clearDrawerMsg();
    openOverlay($("flyDrawer"), $("flyDrawerScrim"));
  }

  function closeDrawer() {
    if (closeOverlay($("flyDrawer"), $("flyDrawerScrim"), 220)) {
      state.editingId = null;
      state.saving = false;
    }
  }

  function drawerMsg(text, kind) {
    const el = $("flyDrawerMsg");
    el.textContent = text;
    el.className = "fly-msg show " + kind;
  }
  function clearDrawerMsg() {
    const el = $("flyDrawerMsg");
    if (el) { el.className = "fly-msg"; el.textContent = ""; }
  }

  function selectOptions(list, current, placeholder) {
    let html = placeholder ? '<option value="">' + esc(placeholder) + "</option>" : "";
    const values = list.slice();
    // Guarantee the current value is present, even if it is not in the option
    // list — otherwise the browser silently selects the first option instead.
    if (current && !values.some((v) => v === current)) values.unshift(current);
    for (const v of values) {
      html += '<option value="' + esc(v) + '"' + (v === current ? " selected" : "") + ">" + esc(v) + "</option>";
    }
    return html;
  }

  function paintSteps() {
    const host = $("flyStepsHost");
    if (state.step < 0) { host.innerHTML = ""; return; }
    let html = '<div class="fly-steps">';
    STEPS.forEach((s, i) => {
      const cls = i === state.step ? "current" : i < state.step ? "done" : "";
      html += '<div class="fly-step ' + cls + '">' +
        '<div class="fly-step-dot" data-goto-step="' + i + '">' + (i < state.step ? "✓" : i + 1) + "</div>" +
        '<div class="fly-step-label">' + esc(s.label) + "</div>" +
        (i < STEPS.length - 1 ? '<div class="fly-step-line"></div>' : "") +
        "</div>";
    });
    html += "</div>";
    host.innerHTML = html;
  }

  function paintStep(dir) {
    paintSteps();
    const host = $("flyStepHost");
    const d = state.draft;
    let html = '<div class="fly-step-panel" data-dir="' + (dir || "next") + '">';

    if (state.step === -1) {
      html += '<div class="fly-step-hint">How would you like to add this?</div>';
      html += '<div class="fly-method-grid">' +
        methodCard("manual", ICONS.pencilLarge, "Fill it in", "Step through the fields. Takes about a minute.") +
        methodCard("upload", ICONS.sheet, "Upload a file", "Excel or CSV. Good for logging many at once.") +
        "</div>";
      if (state.method === "upload") {
        html += '<div style="margin-top:16px"><div class="fly-dropzone" id="flyDropzone">' +
          '<div style="font-size:13px;font-weight:600;margin-bottom:4px">Drop an Excel or CSV file here</div>' +
          '<div class="fly-hint" style="margin-bottom:12px">Rows sharing Date + Title + Client merge into one experiment.</div>' +
          '<button class="fly-btn fly-btn-soft fly-btn-sm" data-action="pick-file">Choose a file</button> ' +
          '<button class="fly-btn fly-btn-ghost fly-btn-sm" data-action="template">Download template</button>' +
          "</div></div>";
      }
    }

    if (state.step === 0) {
      const known = knownClient(d.client);
      html += '<div class="fly-step-hint">Where does this experiment live? Pick a client and we fill in the rest from the last entry for them.</div>';
      html += '<div class="fly-form-grid">';

      html += fieldWrap("Client", true,
        comboSelect("client", state.options.clients, d.client, "Select a client…", "a new client"));

      // A known client already has an industry — show it settled, with a way
      // out. A brand-new client has to be asked.
      if (known && d.industry && !state.unlock.industry) {
        html += fieldWrap("Industry", false,
          lockedField(d.industry, "industry"),
          "Taken from this client's previous entries.");
      } else {
        html += fieldWrap("Industry", true,
          comboSelect("industry", state.options.industries, d.industry, "Select an industry…", "a new industry"));
      }

      html += fieldWrap("Use case", false,
        comboSelect("usecase", useCaseOptions(d), d.useCase, "Select a use case…", "a new use case"),
        "Shared across clients — reuse one if it fits.");

      html += fieldWrap("Type of change", true,
        comboSelect("bucket", state.options.buckets, d.bucket, "Select a type…", "a new type"));

      html += fieldWrap("Date", false,
        '<input class="fly-input" id="f_date" type="date" value="' + esc(d.date) + '" />');
      html += "</div>";
    }

    if (state.step === 1) {
      html += '<div class="fly-step-hint">Describe the change so someone outside your pod could follow it.</div>';
      html += '<div class="fly-form-grid">';
      html += fieldWrap("Title", true,
        '<input class="fly-input" id="f_title" value="' + esc(d.title) + '" placeholder="e.g. Removed the 3rd rebuttal on Path 3" />',
        "One line. Say what changed, not what you hoped for.", true);
      html += fieldWrap("What changed and why", false,
        '<textarea class="fly-textarea" id="f_desc" placeholder="Context, the reasoning, anything a reader would need.">' + esc(d.description) + "</textarea>",
        null, true);
      // Shown only in the detail panel, never as a table column — it is
      // reference material, not something you scan a list by. Hidden entirely
      // until its column exists, so nothing typed here is silently discarded.
      if (state.options.features && state.options.features.prompt) {
        html += fieldWrap("Prompt used", false,
          '<textarea class="fly-textarea" id="f_prompt" placeholder="Optional — paste the prompt snippet.">' + esc(d.prompt) + "</textarea>",
          "Kept on the experiment and shown when someone opens its details.", true);
      }
      html += "</div>";
    }

    if (state.step === 2) {
      html += '<div class="fly-step-hint">What moved? Add a row per metric. If you cannot put a number on it, switch that row to qualitative.</div>';
      html += '<div id="flyMetricsHost"></div>';
      html += '<button class="fly-btn fly-btn-ghost fly-btn-sm" data-action="add-metric">+ Add another metric</button>';
    }

    if (state.step === 3) {
      html += '<div class="fly-step-hint">Quick check before this goes live for the team.</div>';
      html += reviewHtml(d);
    }

    html += "</div>";
    host.innerHTML = html;

    if (state.step === 2) paintMetrics();
    paintDrawerFoot();

    const firstInput = host.querySelector("input:not([type=date]):not([disabled]), select, textarea");
    if (firstInput && state.step >= 0) setTimeout(() => firstInput.focus(), 60);
  }

  const NEW_VALUE = "__new__";

  function knownClient(name) {
    if (!name) return false;
    return state.entries.some((e) => e.client === name) ||
      state.options.clients.some((c) => c === name);
  }

  /**
   * Use cases are a shared pool rather than being scoped to one industry —
   * the same journey ("Collections", "Driver Acquisition") recurs across
   * clients. Ones already seen for this client or industry float to the top.
   */
  function useCaseOptions(d) {
    const all = new Set();
    for (const list of Object.values(state.options.useCasesByIndustry || {})) {
      for (const u of list) all.add(u);
    }
    for (const e of state.entries) if (e.useCase) all.add(e.useCase);

    const relevant = new Set(
      state.entries
        .filter((e) => (d.client && e.client === d.client) || (d.industry && e.industry === d.industry))
        .map((e) => e.useCase)
        .filter(Boolean)
    );
    const near = [...relevant].sort((a, b) => a.localeCompare(b));
    const rest = [...all].filter((u) => !relevant.has(u)).sort((a, b) => a.localeCompare(b));
    return near.concat(rest);
  }

  /**
   * A select that can also mint a new value inline, so nothing has to be
   * created up-front in a separate flow before the form can be filled in.
   */
  function comboSelect(field, list, current, placeholder, newLabel) {
    // An empty string is a valid in-progress value, so test for presence.
    const adding = state.adding[field] !== undefined;
    let html = '<select class="fly-select" id="f_' + field + '" data-combo="' + field + '">' +
      selectOptions(list, adding ? "" : current, placeholder) +
      '<option value="' + NEW_VALUE + '"' + (adding ? " selected" : "") + ">＋ Add " + esc(newLabel) + "…</option>" +
      "</select>";
    if (adding) {
      html += '<div class="fly-inline-new">' +
        '<input class="fly-input" id="f_' + field + '_new" value="' + esc(state.adding[field]) +
        '" placeholder="Type the new name" autocomplete="off" />' +
        '<button type="button" class="fly-btn fly-btn-ghost fly-btn-sm" data-cancel-new="' + field + '">Cancel</button>' +
        "</div>";
    }
    return html;
  }

  function lockedField(value, field) {
    return '<div class="fly-locked"><span class="fly-locked-value">' +
      '<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="11" width="18" height="11" rx="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg>' +
      esc(value) + "</span>" +
      '<button type="button" class="fly-locked-change" data-unlock="' + field + '">Change</button></div>';
  }

  function methodCard(id, icon, name, desc) {
    return '<button class="fly-method-card' + (state.method === id ? " active" : "") + '" data-method="' + id + '">' +
      '<span class="fly-method-icon">' + icon + "</span>" +
      '<div class="fly-method-name">' + esc(name) + "</div>" +
      '<div class="fly-method-desc">' + esc(desc) + "</div></button>";
  }

  function fieldWrap(label, required, control, hint, full) {
    return '<div class="' + (full ? "fly-full" : "") + '">' +
      '<label class="fly-label">' + esc(label) + (required ? ' <span class="fly-req">*</span>' : "") + "</label>" +
      control + (hint ? '<div class="fly-hint">' + esc(hint) + "</div>" : "") + "</div>";
  }

  function paintMetrics() {
    const host = $("flyMetricsHost");
    if (!host) return;
    let html = "";
    state.draft.metrics.forEach((m, i) => {
      html += '<div class="fly-metric-row">';
      html += '<div class="fly-metric-head"><span class="fly-metric-num">Metric ' + (i + 1) + "</span>" +
        '<div style="display:flex;gap:8px;align-items:center">' +
        '<div class="fly-segmented">' +
          '<button data-mtype="quant" data-i="' + i + '" class="' + (!m.qualitative ? "active" : "") + '">Number</button>' +
          '<button data-mtype="qual" data-i="' + i + '" class="' + (m.qualitative ? "active" : "") + '">Qualitative</button>' +
        "</div>" +
        (state.draft.metrics.length > 1
          ? '<button class="fly-btn fly-btn-ghost fly-btn-sm" data-remove-metric="' + i + '">Remove</button>' : "") +
        "</div></div>";

      html += '<div class="fly-metric-grid">';
      const addingMetric = state.adding["metric" + i] !== undefined;
      html += '<div class="fly-full"><label class="fly-label">Metric</label>' +
        '<select class="fly-select" data-metric-name="' + i + '" data-metric-combo="' + i + '">' +
        selectOptions(state.options.metrics, addingMetric ? "" : m.metric, "Select a metric…") +
        '<option value="' + NEW_VALUE + '"' + (addingMetric ? " selected" : "") + ">＋ Add a new metric…</option>" +
        "</select>" +
        (addingMetric
          ? '<div class="fly-inline-new"><input class="fly-input" data-metric-new="' + i + '" value="' +
            esc(state.adding["metric" + i]) + '" placeholder="e.g. QoC%" autocomplete="off" />' +
            '<button type="button" class="fly-btn fly-btn-ghost fly-btn-sm" data-cancel-new="metric' + i + '">Cancel</button></div>'
          : "") +
        "</div>";

      if (m.qualitative) {
        html += '<div><label class="fly-label">Direction</label>' +
          '<select class="fly-select" data-metric-dir="' + i + '">' +
          ["better", "same", "worse"].map((v) =>
            '<option value="' + v + '"' + (m.direction === v ? " selected" : "") + ">" +
            (v === "better" ? "↑ Better" : v === "worse" ? "↓ Worse" : "→ About the same") + "</option>").join("") +
          "</select></div>";
        html += '<div class="fly-full"><label class="fly-label">Evidence</label>' +
          '<input class="fly-input" data-metric-note="' + i + '" value="' + esc(m.note || "") +
          '" placeholder="e.g. Reviewers noted more natural pacing" /></div>';
      } else {
        html += '<div><label class="fly-label">Before</label>' +
          '<input class="fly-input" type="number" step="any" data-metric-before="' + i + '" value="' + esc(m.before ?? "") + '" /></div>';
        html += '<div><label class="fly-label">After</label>' +
          '<input class="fly-input" type="number" step="any" data-metric-after="' + i + '" value="' + esc(m.after ?? "") + '" /></div>';
        html += '<div class="fly-full" data-delta="' + i + '"></div>';
      }
      html += "</div></div>";
    });
    host.innerHTML = html;
    updateDeltaPreviews();
  }

  /** Rewrites only the delta preview nodes, leaving inputs (and focus) alone. */
  function updateDeltaPreviews() {
    const host = $("flyMetricsHost");
    if (!host) return;
    host.querySelectorAll("[data-delta]").forEach((slot) => {
      const m = state.draft.metrics[Number(slot.dataset.delta)];
      if (!m || m.qualitative) { slot.innerHTML = ""; return; }
      const c = pctChange(m.before, m.after, m.metric);
      slot.innerHTML = c
        ? '<div class="fly-delta-preview">That is ' + pctBadge(c) +
          '<span style="color:var(--text-muted)">— this is what the team will see.</span></div>'
        : "";
    });
  }

  function reviewHtml(d) {
    const line = (label, value) =>
      '<div class="fly-field" style="margin-bottom:12px"><div class="fly-field-label">' + esc(label) + "</div>" +
      '<div class="fly-field-value' + (value ? "" : " muted") + '">' + (value ? esc(value) : "Not set") + "</div></div>";

    let metrics = "";
    for (const m of d.metrics) {
      if (!m.metric) continue;
      if (m.qualitative) {
        metrics += '<div class="fly-metric-card"><div class="fly-metric-name">' + esc(m.metric) + "</div>" +
          '<div class="fly-metric-delta">' + qualBadge(m.direction, "") + "</div>" +
          (m.note ? '<div class="fly-metric-note">' + esc(m.note) + "</div>" : "") + "</div>";
      } else {
        const c = pctChange(m.before, m.after, m.metric);
        metrics += '<div class="fly-metric-card"><div class="fly-metric-name">' + esc(m.metric) + "</div>" +
          '<div class="fly-metric-delta"><span class="fly-metric-ba">' + esc(m.before || "—") +
          '<span class="fly-metric-arrow">→</span>' + esc(m.after || "—") + "</span>" + pctBadge(c) + "</div></div>";
      }
    }

    return '<div class="fly-panel" style="padding:16px">' +
      '<div class="fly-field" style="margin-bottom:14px"><div class="fly-field-label">Experiment</div>' +
      '<div class="fly-field-value" style="font-weight:600;font-size:15px">' + esc(d.title || "Untitled") + "</div></div>" +
      '<div class="fly-field-grid" style="margin-bottom:14px">' +
        line("Client", d.client) + line("Bucket", d.bucket) +
        line("Industry", d.industry) + line("Use case", d.useCase) +
        line("Date", formatDate(d.date)) + line("Logged by", d.owner) +
      "</div>" +
      (d.description ? line("What changed", d.description) : "") +
      '<div class="fly-field-label">Impact</div>' +
      (metrics || '<div class="fly-field-value muted">No metrics added</div>') +
      "</div>";
  }

  function paintDrawerFoot() {
    const left = $("flyDrawerFootLeft");
    const right = $("flyDrawerFootRight");

    if (state.step === -1) {
      left.innerHTML = "";
      right.innerHTML =
        '<button class="fly-btn fly-btn-ghost" data-action="close-drawer">Cancel</button>' +
        (state.method === "upload" ? "" :
          '<button class="fly-btn fly-btn-primary" data-action="start">Start</button>');
      return;
    }

    const draftBtn = !state.editingId && state.step >= 0
      ? '<button class="fly-btn fly-btn-ghost" data-action="save-draft">' +
          '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z"/><polyline points="17 21 17 13 7 13 7 21"/><polyline points="7 3 7 8 15 8"/></svg>' +
          ' Save draft</button>'
      : "";
    left.innerHTML = '<span class="fly-hint">Step ' + (state.step + 1) + " of " +
      STEPS.length + "</span>" + draftBtn;

    const isLast = state.step === STEPS.length - 1;
    // At step 0 there is nowhere back to except the method picker (new entries)
    // or out of the drawer entirely (edits).
    const backAction = state.step > 0 ? "prev" : state.editingId ? "close-drawer" : "back-to-method";
    right.innerHTML =
      '<button class="fly-btn fly-btn-ghost" data-action="' + backAction + '">' +
        (backAction === "close-drawer" ? "Cancel" : "Back") + "</button>" +
      (isLast
        ? '<button class="fly-btn fly-btn-primary" data-action="save"' + (state.saving ? " disabled" : "") + ">" +
          (state.saving ? '<span class="fly-btn-spinner"></span>Saving…' : (state.editingId ? "Save changes" : "Save experiment")) + "</button>"
        : '<button class="fly-btn fly-btn-primary" data-action="next">Continue</button>');
  }

  /** Reads the DOM for the current step back into the draft. */
  function syncStep() {
    const d = state.draft;
    if (!d) return;
    const val = (id) => { const el = $(id); return el ? el.value : undefined; };

    if (state.step === 0) {
      // A combo field reads from its inline "new value" box when one is open.
      const combo = (field) => {
        if (state.adding[field] !== undefined) {
          const typed = val("f_" + field + "_new");
          if (typed !== undefined) state.adding[field] = typed;
          return (typed || "").trim();
        }
        const picked = val("f_" + field);
        return picked === NEW_VALUE ? "" : picked;
      };
      const client = combo("client");
      if (client !== undefined) d.client = client;
      const industry = combo("industry");
      if (industry !== undefined && (state.adding.industry !== undefined || $("f_industry"))) {
        d.industry = industry;
      }
      const useCase = combo("usecase");
      if (useCase !== undefined) d.useCase = useCase;
      const bucket = combo("bucket");
      if (bucket !== undefined) d.bucket = bucket;
      if (val("f_date") !== undefined) d.date = val("f_date");
    }
    if (state.step === 1) {
      if (val("f_title") !== undefined) d.title = val("f_title").trim();
      if (val("f_desc") !== undefined) d.description = val("f_desc").trim();
      if (val("f_prompt") !== undefined) d.prompt = val("f_prompt").trim();
    }
    if (state.step === 2) syncMetrics();
  }

  function syncMetrics() {
    const host = $("flyMetricsHost");
    if (!host) return;
    state.draft.metrics = state.draft.metrics.map((m, i) => {
      const pick = (attr) => host.querySelector('[data-metric-' + attr + '="' + i + '"]');
      const name = pick("name");
      const newBox = host.querySelector('[data-metric-new="' + i + '"]');
      let metric = name ? name.value : m.metric;
      if (metric === NEW_VALUE || newBox) {
        if (newBox) state.adding["metric" + i] = newBox.value;
        metric = ((newBox && newBox.value) || "").trim();
      }
      const next = { ...m, metric };
      if (m.qualitative) {
        const dir = pick("dir"), note = pick("note");
        next.direction = dir ? dir.value : m.direction;
        next.note = note ? note.value : m.note;
      } else {
        const b = pick("before"), a = pick("after");
        next.before = b ? b.value : m.before;
        next.after = a ? a.value : m.after;
      }
      return next;
    });
  }

  function validateStep() {
    const d = state.draft;
    const missing = [];
    if (state.step === 0) {
      if (!d.client) missing.push(["f_client", "Client"]);
      if (!d.industry) missing.push(["f_industry", "Industry"]);
      if (!d.bucket) missing.push(["f_bucket", "Bucket"]);
    }
    if (state.step === 1) {
      if (!d.title) missing.push(["f_title", "Title"]);
    }
    if (state.step === 2) {
      if (!d.metrics.some((m) => m.metric)) {
        drawerMsg("Add at least one metric so the change is measurable.", "error");
        return false;
      }
      const broken = d.metrics.find(
        (m) => m.metric && !m.qualitative && (m.before === "" || m.after === "")
      );
      if (broken) {
        drawerMsg('"' + broken.metric + '" needs both a before and an after — or switch it to qualitative.', "error");
        return false;
      }
    }
    if (missing.length) {
      document.querySelectorAll(".invalid").forEach((el) => el.classList.remove("invalid"));
      for (const [id] of missing) { const el = $(id); if (el) el.classList.add("invalid"); }
      drawerMsg("Still needed: " + missing.map((m) => m[1]).join(", ") + ".", "error");
      const first = $(missing[0][0]);
      if (first) first.focus();
      return false;
    }
    clearDrawerMsg();
    return true;
  }

  function goStep(next) {
    syncStep();
    if (next > state.step && !validateStep()) return;
    if (next === state.step) return;
    const dir = next > state.step ? "next" : "prev";
    // Carry the client's usual industry/use case forward.
    if (state.step === 0 && dir === "next") {
      applyClientDefaults();
      registerNewOptions();
    }
    if (state.step === 2 && dir === "next") registerNewOptions();
    state.step = Math.max(0, Math.min(STEPS.length - 1, next));
    clearDrawerMsg();
    paintStep(dir);
  }

  /**
   * Anything the user typed into an inline "add new" box becomes a real option
   * as soon as they move on, so it shows up in filters and later entries
   * without needing a separate "create it first" step.
   */
  function registerNewOptions() {
    const d = state.draft;
    const push = (list, value) => {
      const v = (value || "").trim();
      if (!v || list.some((x) => x.toLowerCase() === v.toLowerCase())) return;
      list.push(v);
      list.sort((a, b) => a.localeCompare(b));
    };
    push(state.options.clients, d.client);
    push(state.options.industries, d.industry);
    push(state.options.buckets, d.bucket);
    for (const m of d.metrics || []) push(state.options.metrics, m.metric);
    if (d.industry && d.useCase) {
      if (!state.options.useCasesByIndustry[d.industry]) {
        state.options.useCasesByIndustry[d.industry] = [];
      }
      push(state.options.useCasesByIndustry[d.industry], d.useCase);
    }
    state.adding = {};
  }

  function applyClientDefaults() {
    const d = state.draft;
    if (!d.client || (d.industry && d.useCase)) return;
    const match = state.entries
      .filter((e) => e.client === d.client && e.industry)
      .sort((a, b) => (b.date > a.date ? 1 : -1))[0];
    if (!match) return;
    if (!d.industry) d.industry = match.industry;
    if (!d.useCase) d.useCase = match.useCase;
  }

  async function saveDraft() {
    syncStep();
    if (state.saving) return;
    const d = state.draft;

    if (!d.title || !d.client || !d.industry || !d.bucket || !d.metrics.some((m) => m.metric)) {
      drawerMsg("Something required is missing — step back through and check.", "error");
      return;
    }

    state.saving = true;

    const payload = {
      client: d.client, industry: d.industry, useCase: d.useCase, bucket: d.bucket,
      title: d.title, description: d.description, prompt: d.prompt,
      owner: d.owner, date: d.date,
      metrics: d.metrics.filter((m) => m.metric),
    };

    const editing = state.editingId;
    const draftId = d._draftId;

    closeDrawer();
    toast(editing ? "Saving changes…" : "Saving experiment…", "info");

    try {
      const res = await fetch(
        editing ? "/api/experiments/" + encodeURIComponent(editing) : "/api/experiments",
        {
          method: editing ? "PATCH" : "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(editing ? payload : { entries: [payload] }),
        }
      );

      const body = await res.json().catch(() => ({}));
      if (!res.ok) {
        toast(body.error || "Could not save. Please try again.", "error");
        state.saving = false;
        return;
      }

      upsertEntries(editing ? [body.entry] : body.entries || []);
      state.saving = false;

      if (draftId) {
        deleteDraft(draftId);
        paintDraftsBadge();
      }
      repaintAll();
      toast(editing ? "Changes saved." : "Experiment logged.", "success");

      if (!editing && body.entries && body.entries[0]) flashRow(body.entries[0].id);
    } catch (err) {
      toast("Network problem — your changes were not saved.", "error");
      state.saving = false;
    }
  }

  function flashRow(id) {
    switchView("experiments");
    setTimeout(() => {
      const row = document.querySelector('[data-row="' + id + '"]');
      if (!row) return;
      row.scrollIntoView({ behavior: "smooth", block: "center" });
      row.classList.add("fly-row-flash");
      setTimeout(() => row.classList.remove("fly-row-flash"), 1400);
    }, 120);
  }

  /* ============================================================
     DELETE EXPERIMENT
     ============================================================ */
  function confirmDeleteExperiment(id) {
    const e = state.entries.find((x) => x.id === id);
    if (!e) return;

    const sheet = $("flySheet");
    var foot = sheet.querySelector(".fly-sheet-foot");
    if (!foot) return;

    foot.style.justifyContent = "flex-end";
    foot.innerHTML =
      '<span class="fly-delete-confirm-msg" style="margin-right:auto">Delete this experiment?</span>' +
      '<button class="fly-btn fly-btn-ghost fly-btn-sm" data-action="cancel-delete">Cancel</button>' +
      '<button class="fly-btn fly-btn-sm fly-btn-danger-solid" data-action="do-delete" data-id="' + esc(id) + '">Delete</button>';
  }

  async function deleteExperiment(id) {
    try {
      const res = await fetch("/api/experiments/" + encodeURIComponent(id), { method: "DELETE" });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) {
        toast(body.error || "Could not delete.", "error");
        return;
      }
      state.entries = state.entries.filter((e) => e.id !== id);
      closeDetail();
      repaintAll();
      toast("Experiment deleted.", "success");
    } catch {
      toast("Network problem — could not delete.", "error");
    }
  }

  /* ============================================================
     FILE UPLOAD
     ============================================================ */
  /** Spreadsheet parsing lives in src/import-rows.js so it can be unit tested. */
  function importRows(rows) {
    return FlywheelImport.importRows(rows, {
      today: todayISO(),
      owner: state.me.firstName,
    });
  }

  async function handleFile(file) {
    if (!file) return;
    if (typeof XLSX === "undefined") {
      drawerMsg("The spreadsheet reader did not load. Check your connection and retry.", "error");
      return;
    }
    const reader = new FileReader();
    reader.onload = async (evt) => {
      try {
        const wb = XLSX.read(new Uint8Array(evt.target.result), { type: "array" });
        const rows = XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]], { defval: "" });
        const entries = importRows(rows);
        if (!entries.length) {
          drawerMsg("No rows we could read. Check the file matches the template columns.", "error");
          return;
        }
        const res = await fetch("/api/experiments", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ entries }),
        });
        const body = await res.json().catch(() => ({}));
        if (!res.ok) {
          drawerMsg(body.error || "Could not save those rows.", "error");
          return;
        }
        upsertEntries(body.entries || []);
        closeDrawer();
        repaintAll();
        toast("Added " + (body.count || entries.length) + " experiments.", "success");
      } catch (err) {
        drawerMsg("Could not read that file.", "error");
      }
    };
    reader.readAsArrayBuffer(file);
  }

  function downloadTemplate() {
    // Columns and sample rows come from src/import-rows.js, so the template can
    // never drift away from the parser that reads it back.
    const csv = FlywheelImport.templateCsv({
      today: todayISO(),
      owner: state.me.firstName || "Saloni",
    });
    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "flywheel-template.csv";
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  }

  function exportCurrentView() {
    const list = sorted(filtered());
    const head = ["Date", "Title", "Client", "Industry", "Use case", "Bucket", "Metric", "Before", "After", "Change", "Direction", "Description", "Owner"];
    const cell = (v) => '"' + String(v ?? "").replace(/"/g, '""') + '"';
    const lines = [head.join(",")];
    for (const e of list) {
      for (const m of e.metrics.length ? e.metrics : [{}]) {
        const c = pctChange(m.before, m.after, m.metric);
        lines.push([
          e.date, e.title, e.client, e.industry, e.useCase, e.bucket,
          m.metric || "", m.before ?? "", m.after ?? "",
          c ? c.pct.toFixed(1) + "%" : "", m.direction || "",
          e.description || m.note || "", e.owner,
        ].map(cell).join(","));
      }
    }
    const blob = new Blob([lines.join("\n")], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "flywheel-experiments-" + todayISO() + ".csv";
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
    toast("Exported " + list.length + " experiments.", "success");
  }

  /* ============================================================
     MANAGE ACCESS — admin-only invite list
     ============================================================ */

  /**
   * The sign-in gate is the `allowed_users` table: lib/auth.ts sends anyone
   * who is not on it to /not-authorized. So adding someone here IS the invite —
   * nothing is emailed, and the link has to be passed on by hand.
   */
  async function openAccess() {
    openOverlay($("flyAccessDrawer"), $("flyAccessScrim"));
    $("flyAccessBody").innerHTML =
      '<div class="fly-loading" style="padding:40px"><span class="fly-spinner"></span>Loading…</div>';
    await paintAccess();
  }

  async function paintAccess(message) {
    let users = null;
    try {
      const res = await fetch("/api/admin/invite", { cache: "no-store" });
      if (res.ok) users = await res.json();
    } catch (e) { /* offline */ }

    let html = "";

    if (message) {
      html += '<div class="fly-msg success show" style="margin-bottom:16px">' + esc(message) + "</div>";
    }
    if (!users) {
      html += '<div class="fly-msg error show" style="margin-bottom:16px">' +
        "Could not load the access list. Close this and try again.</div>";
      users = [];
    }

    html += '<div class="fly-field-label" style="margin-bottom:9px">Invite someone</div>';
    html += '<input class="fly-input" id="flyInviteEmail" type="email" autocomplete="off" ' +
      'placeholder="name@squadstack.ai" style="margin-bottom:8px" />';
    html += '<div style="display:flex;gap:8px;margin-bottom:10px">' +
      '<input class="fly-input" id="flyInviteName" type="text" autocomplete="off" ' +
      'placeholder="Full name (optional)" style="flex:1;min-width:0" />' +
      '<select class="fly-select" id="flyInviteRole" style="width:118px;flex:none">' +
      '<option value="member">Member</option><option value="admin">Admin</option></select></div>';
    html += '<button class="fly-btn fly-btn-primary" data-action="invite-user" ' +
      'style="width:100%;padding:11px">Add to the list</button>';
    html += '<div class="fly-hint" style="margin-bottom:20px">Admins can invite and remove people. ' +
      "Members just log experiments.</div>";

    html += '<div class="fly-field-label" style="margin-bottom:9px">Send them this link</div>';
    html += codeBlock(location.origin, 0);
    html += '<div class="fly-hint" style="margin-bottom:22px">Nothing is emailed automatically. ' +
      "They open the link, choose <strong>Continue with Google</strong>, and pick their " +
      "@squadstack.ai account.</div>";

    html += '<div class="fly-field-label" style="margin-bottom:9px">Who has access · ' + users.length + "</div>";
    if (!users.length) {
      html += '<div class="fly-empty">Nobody yet.</div>';
    } else {
      html += '<div class="fly-token-list">';
      for (const u of users) {
        const email = String(u.email || "");
        const isMe = email.toLowerCase() === String(state.me.email || "").toLowerCase();
        html += '<div class="fly-token-row"><div style="min-width:0">' +
          '<div class="fly-token-name">' + esc(u.name || email.split("@")[0]) +
            (u.role === "admin" ? '<span class="fly-role-tag">admin</span>' : "") +
            (isMe ? ' <span class="fly-token-meta" style="font-weight:500">· you</span>' : "") +
          "</div>" +
          '<div class="fly-token-meta">' + esc(email) +
            (u.invited_by && !isMe ? " · invited by " + esc(String(u.invited_by).split("@")[0]) : "") +
          "</div></div>" +
          // The API refuses self-removal anyway; hiding the button just avoids
          // offering an action that always fails.
          (isMe ? "" : '<button class="fly-btn fly-btn-danger fly-btn-sm" data-remove-user="' +
            esc(email) + '">Remove</button>') +
          "</div>";
      }
      html += "</div>";
      html += '<div class="fly-hint">Removing someone blocks their next sign-in and kills their ' +
        "API keys straight away. Experiments they logged stay.</div>";
    }

    $("flyAccessBody").innerHTML = html;
  }

  async function inviteUser() {
    const emailEl = $("flyInviteEmail");
    const nameEl = $("flyInviteName");
    const roleEl = $("flyInviteRole");
    if (!emailEl) return;

    const email = (emailEl.value || "").trim().toLowerCase();
    const name = (nameEl.value || "").trim();
    const role = roleEl.value === "admin" ? "admin" : "member";

    emailEl.classList.remove("invalid");
    const reject = (msg) => {
      emailEl.classList.add("invalid");
      emailEl.focus();
      toast(msg, "error");
    };
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) return reject("Enter a valid email address.");
    // Google sign-in is pinned to the workspace domain, so any other address
    // would sit on the list and never be able to log in.
    if (!email.endsWith("@squadstack.ai")) return reject("Only @squadstack.ai accounts can sign in.");

    const btn = document.querySelector('[data-action="invite-user"]');
    if (btn) { btn.disabled = true; btn.textContent = "Adding…"; }

    try {
      const res = await fetch("/api/admin/invite", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, name, role }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) {
        toast(body.error || "Could not add them.", "error");
        if (btn) { btn.disabled = false; btn.textContent = "Add to the list"; }
        return;
      }
      await paintAccess(email + " can now sign in.");
    } catch (e) {
      toast("Could not add them.", "error");
      if (btn) { btn.disabled = false; btn.textContent = "Add to the list"; }
    }
  }

  async function removeUser(email) {
    try {
      const res = await fetch("/api/admin/invite", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) { toast(body.error || "Could not remove them.", "error"); return; }
      await paintAccess(email + " no longer has access.");
    } catch (e) {
      toast("Could not remove them.", "error");
    }
  }

  /* ============================================================
     CONNECT YOUR AI — personal tokens + skill install
     ============================================================ */
  async function openConnect() {
    openOverlay($("flyConnectDrawer"), $("flyConnectScrim"));
    $("flyConnectBody").innerHTML =
      '<div class="fly-loading" style="padding:40px"><span class="fly-spinner"></span>Loading…</div>';
    await paintConnect();
  }

  /**
   * A key predating the current skill version — or one from before versions were
   * recorded at all — is attached to a file whose instructions have moved on.
   */
  function isStaleKey(token, currentVersion) {
    if (!currentVersion) return false;
    return (token.skill_version || 0) < currentVersion;
  }

  async function paintConnect(justDownloaded) {
    let data = { enabled: false, tokens: [] };
    try {
      const res = await fetch("/api/tokens", { cache: "no-store" });
      if (res.ok) data = await res.json();
    } catch (e) { /* offline */ }

    state.hasKey = !!(data.tokens && data.tokens.length);
    paintKeyNudge();

    let html = "";

    if (justDownloaded) {
      html += '<div class="fly-msg success show" style="margin-bottom:18px">' +
        "<strong>Downloaded " + esc(justDownloaded) + "</strong><br>" +
        "Run the command below to put it in your skills folder — that is the whole setup." +
        "</div>";
    }

    // One callout, one button, one ownership line, three steps. Attribution used
    // to be stated in the drawer subtitle, again here, and a third time at the
    // bottom; it now appears once, under the button that hands over the key.
    html += '<div class="fly-welcome-warn" style="margin:0 0 18px">' +
      '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" ' +
      'stroke-width="2" stroke-linecap="round" stroke-linejoin="round">' +
      '<path d="M12 9v4"/><path d="M12 17h.01"/>' +
      '<path d="M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z"/></svg>' +
      "<span><strong>Claude Code only.</strong> Flywheel is not on the org's allowed network " +
      "list, so the endpoint is blocked from Claude chat and Cowork.</span></div>";

    if (!data.enabled) {
      html += '<div class="fly-msg info show">Key storage is not set up yet. ' +
        "Run <code>supabase/migrations/003_api_tokens.sql</code> and this starts working.</div>";
    } else {
      html += '<button class="fly-btn fly-btn-primary" data-action="download-skill" style="width:100%;padding:13px">' +
        '<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>' +
        "Download my skill</button>";

      // Downloading again replaces the file; the old key keeps working until revoked.
      if ((data.tokens || []).some((t) => isStaleKey(t, data.skillVersion))) {
        html += '<div class="fly-msg warn show" style="margin-top:10px">' +
          "<strong>Your skill is out of date.</strong> It was downloaded before the " +
          "current version, so it is still following instructions that have since " +
          "changed. Download it again to replace the file." +
          "</div>";
      }

      html += '<div class="fly-note" style="margin-top:10px">Your key is inside the file, so anything ' +
        "you log is recorded as <strong>" + esc(state.me.name || state.me.firstName) +
        "</strong>. Keep it to yourself.</div>";

      // Claude Code only discovers a skill as a folder containing SKILL.md — a bare
      // flywheel.md in ~/.claude/skills/ is silently never loaded. Handing the file
      // to Claude Code lets it sort that out. No restart step: a new skill is picked
      // up in a running session.
      const installCmd =
        "mkdir -p ~/.claude/skills/flywheel && mv ~/Downloads/flywheel.md ~/.claude/skills/flywheel/SKILL.md";

      const step = (n, title, body) =>
        '<div class="fly-welcome-step"><div class="fly-welcome-step-num">' + n + "</div>" +
        '<div class="fly-welcome-step-text"><strong>' + title + "</strong>" +
        "<span>" + body + "</span></div></div>";

      html += '<div class="fly-field-label" style="margin:26px 0 13px">Set it up</div>';
      html += '<div class="fly-welcome-steps" style="margin-bottom:24px">';
      html += step(1, "Open Claude Code", "Any folder will do.");
      html += step(2, "Hand it the file",
        "Drag <code>flywheel.md</code> from Downloads into the chat and say " +
        "\u201cinstall this skill\u201d, or run this yourself:" + codeBlock(installCmd));
      html += step(3, "Ask it something",
        "\u201cWhat have we tried on Khatabook?\u201d or \u201clog this experiment\u201d.");
      html += "</div>";


      html += '<div class="fly-field-label" style="margin-bottom:9px">Your keys</div>';
      if (!data.tokens.length) {
        html += '<div class="fly-empty" style="margin-bottom:12px">None yet — download the skill to create one.</div>';
      } else {
        html += '<div class="fly-token-list">';
        for (const t of data.tokens) {
          // A downloaded skill never updates itself, so a key handed out before
          // the current version is following instructions that have changed.
          const stale = isStaleKey(t, data.skillVersion);
          html += '<div class="fly-token-row"><div style="min-width:0">' +
            '<div class="fly-token-name">' + esc(t.name) +
              (stale ? '<span class="fly-token-stale">Out of date</span>' : "") + "</div>" +
            '<div class="fly-token-meta"><code>' + esc(t.prefix) + "…</code> · created " +
            esc(formatDate(t.created_at)) +
            (t.last_used_at ? " · last used " + esc(formatDate(t.last_used_at)) : " · never used") +
            "</div></div>" +
            '<button class="fly-btn fly-btn-danger fly-btn-sm" data-revoke="' + esc(t.id) + '">Revoke</button>' +
            "</div>";
        }
        html += "</div>";
        html += '<div class="fly-hint">Revoking stops that copy of the skill working. Download a new one to replace it.</div>';
      }
    }

    html += '<div style="margin-top:20px;padding-top:16px;border-top:1px solid var(--border-subtle)">' +
      '<a class="fly-btn fly-btn-ghost fly-btn-sm" href="/api/skill" target="_blank" rel="noopener">' +
      "View the skill without a key</a></div>";

    $("flyConnectBody").innerHTML = html;
  }

  /** Downloads the personalised skill file, key already inside. */
  async function downloadSkill() {
    const btn = document.querySelector('[data-action="download-skill"]');
    if (btn) { btn.disabled = true; btn.innerHTML = '<span class="fly-btn-spinner"></span>Preparing…'; }
    try {
      const res = await fetch("/api/skill", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: "Claude skill" }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) {
        toast(body.error || "Could not create your skill file.", "error");
        await paintConnect();
        return;
      }
      const blob = new Blob([body.content], { type: "text/markdown" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = body.filename;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
      await paintConnect(body.filename);
      toast("Your skill is ready.", "success");
    } catch (e) {
      toast("Could not create your skill file.", "error");
      await paintConnect();
    }
  }

  async function copyText(text, label) {
    try {
      await navigator.clipboard.writeText(text);
      toast(label + " copied.", "success");
    } catch (e) {
      // Clipboard is blocked in some embedded contexts; select it instead so
      // the user can still copy by hand rather than hitting a dead end.
      toast("Could not copy automatically — select the text and copy it.", "error");
    }
  }

  /* ============================================================
     SEARCH DROPDOWN
     ============================================================ */
  function paintSearchDropdown() {
    const host = $("flySearchDropdown");
    const q = state.search.trim();
    $("flySearchClear").classList.toggle("show", !!q);
    if (q.length < 2) { host.innerHTML = ""; state.searchIndex = -1; return; }

    const matches = state.entries.filter((e) =>
      [e.title, e.client, e.bucket, e.owner, e.industry, e.useCase]
        .filter(Boolean).join(" ").toLowerCase().includes(q.toLowerCase())
    ).slice(0, 7);

    if (!matches.length) {
      host.innerHTML = '<div class="fly-search-dropdown"><div class="fly-search-empty">Nothing matches “' + esc(q) + "”</div></div>";
      return;
    }
    let html = '<div class="fly-search-dropdown">';
    matches.forEach((e, i) => {
      html += '<div class="fly-search-item' + (i === state.searchIndex ? " active" : "") + '" data-detail="' + esc(e.id) + '">' +
        '<div class="fly-search-item-title">' + highlight(e.title, q) + "</div>" +
        '<div class="fly-search-item-meta">' + highlight(e.client, q) + " · " + highlight(e.bucket, q) +
        " · " + esc(e.owner || "—") + "</div></div>";
    });
    html += "</div>";
    host.innerHTML = html;
  }

  function closeSearchDropdown() {
    $("flySearchDropdown").innerHTML = "";
    state.searchIndex = -1;
  }

  /* ============================================================
     VIEW SWITCHING + SHELL
     ============================================================ */
  function switchView(view) {
    if (state.view === view) return;
    state.view = view;
    document.querySelectorAll(".fly-tab").forEach((t) =>
      t.classList.toggle("active", t.dataset.tab === view));
    document.querySelectorAll(".fly-view").forEach((v) =>
      v.classList.toggle("active", v.id === "fly" + view[0].toUpperCase() + view.slice(1) + "View"));
    moveTabIndicator(true);
  }

  /**
   * `animate` is false for the initial placement and for resizes — otherwise
   * the indicator visibly slides in from the left edge on load, and a resize
   * reads as a tab change that never happened.
   */
  function moveTabIndicator(animate) {
    const tabs = $("flyTabs");
    const active = tabs && tabs.querySelector(".fly-tab.active");
    const indicator = $("flyTabIndicator");
    if (!active || !indicator || !tabs) return;
    const a = active.getBoundingClientRect();
    const t = tabs.getBoundingClientRect();
    const transform = "translateX(" + (a.left - t.left) + "px) scaleX(" + a.width + ")";

    if (animate) {
      indicator.style.transform = transform;
      return;
    }
    indicator.style.transition = "none";
    indicator.style.transform = transform;
    void indicator.offsetWidth; // flush so the transition does not replay
    indicator.style.transition = "";
  }

  /** Dots on the avatar chip and the Connect item while no key exists. */
  function paintKeyNudge() {
    const show = state.hasKey === false;
    for (const id of ["flyChipDot", "flyConnectDot"]) {
      const el = $(id);
      if (el) el.style.display = show ? "" : "none";
    }
  }

  async function refreshKeyState() {
    try {
      const res = await fetch("/api/tokens", { cache: "no-store" });
      const d = res.ok ? await res.json() : null;
      state.hasKey = d ? !!(d.tokens && d.tokens.length) : null;
    } catch (e) {
      state.hasKey = null;
    }
    paintKeyNudge();
    return state.hasKey;
  }

  function paintUserChip() {
    const label = state.me.firstName || state.me.name || "User";
    $("flyMenuBtn").innerHTML =
      myAvatar("md") +
      '<span class="fly-user-name">' + esc(label) + "</span>" +
      (state.me.role === "admin" ? '<span class="fly-user-role">admin</span>' : "") +
      '<span class="fly-chip-caret" style="opacity:.5">▼</span>';
    $("flyMenuIdentity").innerHTML =
      '<div class="fly-popover-name">' + esc(state.me.name || label) + "</div>" +
      '<div class="fly-popover-email">' + esc(state.me.email || "") + "</div>";

    // Members never see the access controls. This is presentation only — the
    // real gate is requireAdmin() in /api/admin/invite, which a member cannot
    // get past by unhiding a button.
    const accessItem = $("flyMenuAccess");
    if (accessItem) accessItem.style.display = state.me.role === "admin" ? "" : "none";
  }

  function paintRefreshed() {
    const el = $("flyRefreshed");
    if (!el) return;
    if (state.loadError) {
      el.className = "fly-refreshed stale";
      el.innerHTML = '<span class="dot"></span>Could not reach the database ' +
        '<button data-action="refresh">Retry</button>';
      return;
    }
    if (!state.lastLoadedAt) { el.innerHTML = ""; return; }
    const d = new Date(state.lastLoadedAt);
    const time = String(d.getHours()).padStart(2, "0") + ":" + String(d.getMinutes()).padStart(2, "0");
    el.className = "fly-refreshed";
    el.innerHTML = '<span class="dot"></span>Updated ' + time +
      ' <button data-action="refresh">Refresh</button>';
  }

  function paintStaleBanner() {
    $("flyStaleBanner").innerHTML = state.loadError
      ? '<div class="fly-banner">Could not reach the database — you are looking at the last data we loaded. ' +
        '<button class="fly-clear-link" data-action="refresh" style="color:inherit;text-decoration:underline">Retry</button></div>'
      : "";
  }

  function repaintAll() {
    paintStaleBanner();
    paintRefreshed();
    paintOverview();
    paintFilterBar();
    paintTable(false);
  }

  /* ============================================================
     EVENTS
     ============================================================ */
  function wireEvents() {
    // ---- Tabs
    $("flyTabs").addEventListener("click", (e) => {
      const tab = e.target.closest(".fly-tab");
      if (tab) switchView(tab.dataset.tab);
    });

    // ---- Header
    $("flyLogBtn").addEventListener("click", openLogDrawer);
    $("flyMenuBtn").addEventListener("click", (e) => {
      e.stopPropagation();
      const wrap = $("flyMenuWrap");
      const open = wrap.classList.contains("open");
      closePopovers();
      if (!open) {
        wrap.classList.add("open");
        $("flyMenuBtn").setAttribute("aria-expanded", "true");
      }
    });
    $("flyMenuPopover").addEventListener("click", (e) => {
      const item = e.target.closest("[data-menu]");
      if (!item) return;
      closePopovers();
      const kind = item.dataset.menu;
      if (kind === "drafts") openDraftsPanel();
      else if (kind === "connect") openConnect();
      else if (kind === "access") openAccess();
      else if (kind === "export") exportCurrentView();
      else if (kind === "template") downloadTemplate();
      else if (kind === "refresh") refreshData(false);
      else if (kind === "signout") {
        // The dashboard runs in an iframe, so navigate the top window.
        (window.top || window).location.href = "/signout";
      }
    });

    // ---- Search
    const searchInput = $("flySearchInput");
    let searchTimer = null;
    searchInput.addEventListener("input", (e) => {
      state.search = e.target.value;
      clearTimeout(searchTimer);
      searchTimer = setTimeout(() => {
        paintSearchDropdown();
        paintTable(false);
        paintFilterBar();
      }, 140);
    });
    searchInput.addEventListener("focus", paintSearchDropdown);
    searchInput.addEventListener("keydown", (e) => {
      const items = document.querySelectorAll(".fly-search-item");
      if (e.key === "ArrowDown" || e.key === "ArrowUp") {
        if (!items.length) return;
        e.preventDefault();
        state.searchIndex = e.key === "ArrowDown"
          ? Math.min(state.searchIndex + 1, items.length - 1)
          : Math.max(state.searchIndex - 1, 0);
        paintSearchDropdown();
      } else if (e.key === "Enter" && state.searchIndex >= 0 && items[state.searchIndex]) {
        e.preventDefault();
        openDetail(items[state.searchIndex].dataset.detail);
        closeSearchDropdown();
      } else if (e.key === "Escape") {
        closeSearchDropdown();
        searchInput.blur();
      }
    });
    $("flySearchClear").addEventListener("click", () => {
      state.search = "";
      searchInput.value = "";
      closeSearchDropdown();
      paintTable(false);
      paintFilterBar();
      searchInput.focus();
    });

    // ---- Global delegated clicks
    document.addEventListener("click", (e) => {
      const t = e.target;

      // Clear a single filter (must beat the chip toggle below).
      const clear = t.closest("[data-clear]");
      if (clear) {
        e.stopPropagation();
        state.filters[clear.dataset.clear] = "";
        closePopovers();
        paintFilterBar();
        paintTable(false);
        return;
      }

      // Toggle a filter popover — class only, no re-render.
      const chip = t.closest("[data-chip]");
      if (chip) {
        e.stopPropagation();
        const wrap = chip.closest(".fly-chip-wrap");
        const wasOpen = wrap.classList.contains("open");
        closePopovers();
        if (!wasOpen) {
          wrap.classList.add("open");
          chip.setAttribute("aria-expanded", "true");
          state.openPopover = chip.dataset.chip;
          const search = wrap.querySelector("[data-popsearch]");
          if (search) setTimeout(() => search.focus(), 60);
        }
        return;
      }

      const setFilter = t.closest("[data-set]");
      if (setFilter) {
        e.stopPropagation();
        const key = setFilter.dataset.set;
        state.filters[key] = state.filters[key] === setFilter.dataset.value ? "" : setFilter.dataset.value;
        if (key === "industry") state.filters.useCase = "";
        closePopovers();
        paintFilterBar();
        paintTable(false);
        return;
      }

      const action = t.closest("[data-action]");
      if (action) {
        e.stopPropagation();
        handleAction(action.dataset.action, action);
        return;
      }

      const sortHeader = t.closest("[data-sort]");
      if (sortHeader) {
        const key = sortHeader.dataset.sort;
        if (state.sortKey === key) state.sortDir = state.sortDir === "asc" ? "desc" : "asc";
        else { state.sortKey = key; state.sortDir = key === "date" ? "desc" : "asc"; }
        paintTable(false);
        return;
      }

      // Copy link to experiment
      const copyLink = t.closest("[data-copy-link]");
      if (copyLink) {
        e.stopPropagation();
        const expId = copyLink.dataset.copyLink;
        const url = appUrl(expId);
        navigator.clipboard.writeText(url).then(
          () => toast("Link copied to clipboard.", "success"),
          () => toast("Could not copy link.", "error")
        );
        return;
      }

      // Row-level actions
      const editBtn = t.closest("[data-edit]");
      if (editBtn) { e.stopPropagation(); openEditDrawer(editBtn.dataset.edit); return; }

      const deleteBtn = t.closest("[data-delete]");
      if (deleteBtn) { e.stopPropagation(); confirmDeleteExperiment(deleteBtn.dataset.delete); return; }

      const detailBtn = t.closest("[data-detail]");
      if (detailBtn) { e.stopPropagation(); closeSearchDropdown(); openDetail(detailBtn.dataset.detail); return; }

      const react = t.closest("[data-react]");
      if (react) { e.stopPropagation(); toggleReaction(react.dataset.id, react.dataset.react); return; }

      const row = t.closest("[data-row]");
      if (row) { openDetail(row.dataset.row); return; }

      const openTarget = t.closest("[data-open]");
      if (openTarget) { openDetail(openTarget.dataset.open); return; }

      // Any breakdown bar filters the list and jumps to it.
      const facet = t.closest("[data-facet]");
      if (facet) {
        state.filters = { client: "", industry: "", useCase: "", bucket: "", owner: "", metricType: "" };
        state.filters[facet.dataset.facet] = facet.dataset.facetValue;
        state.search = "";
        $("flySearchInput").value = "";
        switchView("experiments");
        paintFilterBar();
        paintTable(false);
        return;
      }

      // Step navigation
      const stepDot = t.closest("[data-goto-step]");
      if (stepDot) { goStep(Number(stepDot.dataset.gotoStep)); return; }

      const methodBtn = t.closest("[data-method]");
      if (methodBtn) {
        const picked = methodBtn.dataset.method;
        // Clicking the already-selected card means "yes, this one" — go on.
        if (state.method === picked && picked === "manual") {
          handleAction("start");
          return;
        }
        state.method = picked;
        clearDrawerMsg();
        paintStep("next");
        return;
      }

      const removeUserBtn = t.closest("[data-remove-user]");
      if (removeUserBtn) {
        e.stopPropagation();
        if (removeUserBtn.dataset.armed === "1") {
          removeUser(removeUserBtn.dataset.removeUser);
        } else {
          removeUserBtn.dataset.armed = "1";
          removeUserBtn.textContent = "Sure?";
          setTimeout(() => {
            if (!removeUserBtn.isConnected) return;
            removeUserBtn.dataset.armed = "";
            removeUserBtn.textContent = "Remove";
          }, 3000);
        }
        return;
      }

      const copyBtn = t.closest("[data-copy]");
      if (copyBtn) {
        e.stopPropagation();
        copyText(copyBtn.dataset.copy, "Copied");
        return;
      }

      const revokeBtn = t.closest("[data-revoke]");
      if (revokeBtn) {
        e.stopPropagation();
        fetch("/api/tokens?id=" + encodeURIComponent(revokeBtn.dataset.revoke), { method: "DELETE" })
          .then((r) => { if (r.ok) { toast("Token revoked.", "success"); paintConnect(); }
                         else toast("Could not revoke that token.", "error"); })
          .catch(() => toast("Could not revoke that token.", "error"));
        return;
      }

      const unlock = t.closest("[data-unlock]");
      if (unlock) {
        state.unlock[unlock.dataset.unlock] = true;
        paintStep("next");
        return;
      }

      const cancelNew = t.closest("[data-cancel-new]");
      if (cancelNew) {
        const field = cancelNew.dataset.cancelNew;
        delete state.adding[field];
        if (field.startsWith("metric")) {
          const idx = Number(field.slice(6));
          if (state.draft.metrics[idx]) state.draft.metrics[idx].metric = "";
          paintMetrics();
        } else {
          const map = { client: "client", industry: "industry", usecase: "useCase", bucket: "bucket" };
          if (map[field]) state.draft[map[field]] = "";
          // Remove the inline-new box and reset the select.
          const inlineNew = cancelNew.closest(".fly-inline-new");
          const sel = $("f_" + field);
          if (inlineNew) inlineNew.remove();
          if (sel) sel.value = "";
          if (!inlineNew) paintStep("next");
        }
        return;
      }

      const removeMetric = t.closest("[data-remove-metric]");
      if (removeMetric) {
        syncMetrics();
        state.draft.metrics.splice(Number(removeMetric.dataset.removeMetric), 1);
        paintMetrics();
        return;
      }

      const mtype = t.closest("[data-mtype]");
      if (mtype) {
        syncMetrics();
        state.draft.metrics[Number(mtype.dataset.i)].qualitative = mtype.dataset.mtype === "qual";
        paintMetrics();
        return;
      }

      // Outside click closes popovers and the search dropdown.
      if (!t.closest(".fly-popover")) closePopovers();
      if (!t.closest(".fly-search-wrap")) closeSearchDropdown();
    });

    // Filter inside a popover.
    document.addEventListener("input", (e) => {
      const search = e.target.closest("[data-popsearch]");
      if (search) {
        const q = search.value.toLowerCase();
        search.closest(".fly-popover").querySelectorAll(".fly-popover-item").forEach((item) => {
          item.style.display = item.textContent.toLowerCase().includes(q) ? "" : "none";
        });
        return;
      }
      // Any typing in the drawer means the user is acting on the last
      // complaint — the message should not sit there once it is addressed.
      if (e.target.closest("#flyDrawer")) clearDrawerMsg();

      // Live delta preview. Updates the preview node in place — re-rendering
      // the metric rows here would steal focus on every keystroke.
      if (e.target.matches("[data-metric-before], [data-metric-after], [data-metric-name]")) {
        syncMetrics();
        updateDeltaPreviews();
      }
      // Keep inline "new value" text in state so a repaint does not lose it.
      const newBox = e.target.closest("[id$='_new']");
      if (newBox && newBox.id.startsWith("f_")) {
        state.adding[newBox.id.slice(2, -4)] = newBox.value;
      }
    });

    document.addEventListener("change", (e) => {
      const sortSel = e.target.closest("[data-sort-select]");
      if (sortSel) {
        const s = SORTS[Number(sortSel.value)];
        state.sortKey = s.key;
        state.sortDir = s.dir;
        paintTable(false);
        return;
      }

      // A metric row asking for a brand new metric name.
      const metricCombo = e.target.closest("[data-metric-combo]");
      if (metricCombo) {
        const i = Number(metricCombo.dataset.metricCombo);
        if (metricCombo.value === NEW_VALUE) state.adding["metric" + i] = "";
        else delete state.adding["metric" + i];
        syncMetrics();
        paintMetrics();
        const box = document.querySelector('[data-metric-new="' + i + '"]');
        if (box) box.focus();
        return;
      }

      const combo = e.target.closest("[data-combo]");
      if (!combo) return;
      const field = combo.dataset.combo;
      const map = { client: "client", industry: "industry", usecase: "useCase", bucket: "bucket" };

      if (combo.value === NEW_VALUE) {
        state.adding[field] = "";
        state.draft[map[field]] = "";
        if (field === "client") {
          state.draft.industry = "";
          state.draft.useCase = "";
          state.unlock.industry = true;
          paintStep("next");
        } else {
          // Targeted update: insert the "new" input next to the select
          // without repainting the whole step.
          const wrapper = combo.parentNode;
          if (wrapper) {
            const existing = wrapper.querySelector(".fly-inline-new");
            if (!existing) {
              const div = document.createElement("div");
              div.className = "fly-inline-new";
              div.innerHTML =
                '<input class="fly-input" id="f_' + field + '_new" value="" placeholder="Type the new name" autocomplete="off" />' +
                '<button type="button" class="fly-btn fly-btn-ghost fly-btn-sm" data-cancel-new="' + field + '">Cancel</button>';
              combo.parentNode.insertBefore(div, combo.nextSibling);
            }
          }
        }
        const box = $("f_" + field + "_new");
        if (box) box.focus();
        return;
      }

      delete state.adding[field];
      state.draft[map[field]] = combo.value;

      // Remove inline "new" input if present.
      const inlineNew = combo.parentNode && combo.parentNode.querySelector(".fly-inline-new");
      if (inlineNew) inlineNew.remove();

      if (field === "client") {
        state.unlock.industry = false;
        state.draft.industry = "";
        state.draft.useCase = "";
        applyClientDefaults();
        paintStep("next");
      } else if (field === "industry") {
        const uc = $("f_usecase");
        if (uc) {
          const list = useCaseOptions(state.draft);
          uc.innerHTML = selectOptions(list, state.draft.useCase, "Select a use case…") +
            '<option value="' + NEW_VALUE + '">＋ Add a new use case…</option>';
        }
      }
    });

    // ---- Drawer scrims
    $("flyConnectScrim").addEventListener("click", () =>
      closeOverlay($("flyConnectDrawer"), $("flyConnectScrim"), 220));
    $("flyFilterScrim").addEventListener("click", () =>
      closeOverlay($("flyFilterDrawer"), $("flyFilterScrim"), 220));
    $("flyDrawerScrim").addEventListener("click", closeDrawer);
    $("flySheetScrim").addEventListener("click", closeDetail);

    // ---- File input
    $("flyFileInput").addEventListener("change", (e) => {
      handleFile(e.target.files && e.target.files[0]);
      e.target.value = "";
    });

    // ---- Keyboard
    document.addEventListener("keydown", (e) => {
      if (e.key === "Escape") {
        if ($("flyConnectDrawer").classList.contains("open")) {
          return closeOverlay($("flyConnectDrawer"), $("flyConnectScrim"), 220);
        }
        if ($("flyFilterDrawer").classList.contains("open")) {
          return closeOverlay($("flyFilterDrawer"), $("flyFilterScrim"), 220);
        }
        if ($("flyDrawer").classList.contains("open")) return closeDrawer();
        if ($("flySheet").classList.contains("open")) return closeDetail();
        if (state.openPopover) return closePopovers();
        closeSearchDropdown();
        return;
      }
      const typing = /^(INPUT|TEXTAREA|SELECT)$/.test(document.activeElement.tagName);
      if (e.key === "/" && !typing) {
        e.preventDefault();
        switchView("experiments");
        $("flySearchInput").focus();
        return;
      }
      const drawerOpen = $("flyDrawer").classList.contains("open");
      if ((e.metaKey || e.ctrlKey) && e.key === "Enter" && drawerOpen) {
        e.preventDefault();
        if (state.step === STEPS.length - 1) saveDraft();
        else if (state.step < 0) handleAction("start");
        else goStep(state.step + 1);
        return;
      }
      if (e.key === "Enter" && drawerOpen && document.activeElement.tagName !== "TEXTAREA") {
        // Enter moves forward from the method picker and through every step,
        // and commits on the last one.
        e.preventDefault();
        if (state.step < 0) handleAction("start");
        else if (state.step < STEPS.length - 1) goStep(state.step + 1);
        else saveDraft();
      }
    });

    // Registered once — re-registering per table paint would leak listeners.
    window.addEventListener("resize", () => {
      moveTabIndicator(false);
      updateScrollShadows();
    }, { passive: true });

    // Crossing the breakpoint swaps table <-> cards, so repaint that surface.
    const mq = window.matchMedia(MOBILE_QUERY);
    const onBreakpoint = () => { paintTable(false); paintFilterBarMobile(); };
    if (mq.addEventListener) mq.addEventListener("change", onBreakpoint);
    else mq.addListener(onBreakpoint);

    // A stale tab should not show stale numbers.
    window.addEventListener("focus", () => {
      if (Date.now() - state.lastLoadedAt > 30000) refreshData(true);
    });
  }

  async function handleAction(action, el) {
    switch (action) {
      case "reset-filters":
        state.filters = { client: "", industry: "", useCase: "", bucket: "", owner: "", metricType: "" };
        state.search = "";
        $("flySearchInput").value = "";
        closeSearchDropdown();
        paintFilterBar();
        paintTable(false);
        break;
      case "refresh": refreshData(false); break;
      case "open-filters":
        paintFilterSheet();
        openOverlay($("flyFilterDrawer"), $("flyFilterScrim"));
        break;
      case "close-filters":
        closeOverlay($("flyFilterDrawer"), $("flyFilterScrim"), 220);
        break;
      case "close-connect":
        closeOverlay($("flyConnectDrawer"), $("flyConnectScrim"), 220);
        break;
      case "close-access":
        closeOverlay($("flyAccessDrawer"), $("flyAccessScrim"), 220);
        break;
      case "invite-user": await inviteUser(); break;
      case "download-skill": await downloadSkill(); break;
      case "close-sheet": closeDetail(); break;
      case "cancel-delete": {
        const params = new URLSearchParams(window.location.search);
        const expId = params.get("exp");
        if (expId) openDetail(expId);
        break;
      }
      case "do-delete": {
        const delId = el && el.dataset.id;
        if (delId) deleteExperiment(delId);
        break;
      }
      case "close-drawer": closeDrawer(); break;
      case "next": goStep(state.step + 1); break;
      case "prev": goStep(state.step - 1); break;
      case "back-to-method":
        state.step = -1;
        paintStep("prev");
        break;
      case "start":
        state.step = 0;
        paintStep("next");
        break;
      case "save": saveDraft(); break;
      case "save-draft":
        syncStep();
        if (state.draft) {
          saveDraftToStorage({ ...state.draft });
          toast("Draft saved. Resume anytime from the menu.", "success");
          closeDrawer();
        }
        break;
      case "resume-draft": {
        const draftId = el && el.closest("[data-draft-id]");
        if (draftId) resumeDraft(draftId.dataset.draftId);
        break;
      }
      case "delete-draft": {
        const draftEl = el && el.closest("[data-draft-id]");
        if (draftEl) {
          deleteDraft(draftEl.dataset.draftId);
          openDraftsPanel();
        }
        break;
      }
      case "delete-comment": {
        const commentEl = el && el.closest("[data-comment-id]");
        const expEl = $("flyCommentsList");
        if (commentEl && expEl) {
          deleteComment(expEl.dataset.experimentId, commentEl.dataset.commentId);
        }
        break;
      }
      case "reply-to": {
        const id = el && el.dataset.commentId;
        const author = el && el.closest(".fly-comment");
        const name = author ? (author.querySelector(".fly-comment-author") || {}).textContent : "";
        if (!id) break;
        state.commentReplyTo = { id, author: name || "this comment" };
        paintCommentComposer();
        const input = $("flyCommentInput");
        if (input) input.focus();
        break;
      }
      case "cancel-reply":
        state.commentReplyTo = null;
        paintCommentComposer();
        break;
      case "edit-comment": {
        const id = el && el.dataset.commentId;
        const expEl = $("flyCommentsList");
        if (!id || !expEl) break;
        state.commentEditing = id;
        loadComments(expEl.dataset.experimentId);
        break;
      }
      case "cancel-comment-edit": {
        const expEl = $("flyCommentsList");
        state.commentEditing = null;
        if (expEl) loadComments(expEl.dataset.experimentId);
        break;
      }
      case "save-comment-edit": {
        const id = el && el.dataset.commentId;
        const expEl = $("flyCommentsList");
        if (id && expEl) saveCommentEdit(expEl.dataset.experimentId, id);
        break;
      }
      case "add-metric":
        syncMetrics();
        state.draft.metrics.push({ metric: "", qualitative: false, before: "", after: "", direction: "better", note: "" });
        paintMetrics();
        break;
      case "pick-file": $("flyFileInput").click(); break;
      case "template": downloadTemplate(); break;
      case "welcome-setup":
        closeWelcome(true);
        requestAnimationFrame(() => openConnect());
        break;
      case "welcome-later": closeWelcome(false); break;
      case "nudge-log":
        dismissNudge();
        requestAnimationFrame(() => openLogDrawer());
        break;
      case "nudge-dismiss": dismissNudge(); break;
      default: break;
    }
  }

  /* ============================================================
     WELCOME MODAL — first-time user onboarding (desktop only)
     ============================================================ */
  function shouldShowWelcome() {
    if (window.innerWidth <= 760) return false;
    try {
      if (sessionStorage.getItem("flywheel_welcome_dismissed")) return false;
    } catch {}
    return true;
  }

  function markWelcomed() {
    try { localStorage.setItem("flywheel_welcomed", Date.now()); } catch {}
  }

  function openWelcome() {
    const name = state.me.firstName || state.me.name || "";
    const greeting = name ? "Welcome, " + esc(name) : "Welcome to Flywheel";

    const card = $("flyWelcomeCard");
    // Deliberately thin: this hands over to the Connect drawer, which carries the
    // real setup. Repeating the steps here is what made the two screens read as
    // the same page twice.
    card.innerHTML =
      '<div class="fly-welcome-hero">' +
        '<div class="fly-welcome-icon">' +
          '<svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">' +
            '<path d="M12 2L2 7l10 5 10-5-10-5z"/><path d="M2 17l10 5 10-5"/><path d="M2 12l10 5 10-5"/>' +
          '</svg>' +
        '</div>' +
        '<h2 id="flyWelcomeTitle">' + greeting + '</h2>' +
        '<p>Flywheel logs every experiment your team runs on voice agents — so nothing gets lost and everyone learns faster.</p>' +
      '</div>' +
      '<div class="fly-welcome-body">' +
        '<div class="fly-note" style="text-align:center">' +
          'Connect Claude Code once, then log experiments and search what we have tried just by asking.' +
        '</div>' +
        '<div class="fly-welcome-warn">' +
          '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">' +
            '<path d="M12 9v4"/><path d="M12 17h.01"/>' +
            '<path d="M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z"/>' +
          '</svg>' +
          '<span><strong>Claude Code only.</strong> Flywheel is not on the org\'s allowed network ' +
          'list, so the endpoint is blocked from Claude chat and Cowork.</span>' +
        '</div>' +
      '</div>' +
      '<div class="fly-welcome-foot">' +
        '<button class="fly-btn fly-btn-primary" data-action="welcome-setup">Set up now</button>' +
        '<button class="fly-btn fly-btn-ghost" data-action="welcome-later">I\'ll do this later</button>' +

      '</div>';

    openOverlay($("flyWelcome"), $("flyWelcomeScrim"));
  }

  function closeWelcome(completed) {
    if (completed) {
      markWelcomed();
    } else {
      try { sessionStorage.setItem("flywheel_welcome_dismissed", "1"); } catch {}
    }
    closeOverlay($("flyWelcome"), $("flyWelcomeScrim"), 220);
  }

  /* ============================================================
     NUDGE — remind inactive users to contribute
     ============================================================ */
  function shouldShowNudge() {
    if (window.innerWidth <= 760) return false;
    try {
      const dismissed = localStorage.getItem("flywheel_nudge_dismissed");
      if (dismissed) {
        const elapsed = Date.now() - Number(dismissed);
        if (elapsed < 3 * 24 * 60 * 60 * 1000) return false;
      }
    } catch {}

    const myEmail = (state.me.email || "").toLowerCase();
    const myName = (state.me.name || state.me.firstName || "").toLowerCase();
    if (!myEmail && !myName) return false;

    const myEntries = state.entries.filter((e) => {
      if (myEmail && (e.ownerEmail || "").toLowerCase() === myEmail) return true;
      if (myName && (e.owner || "").toLowerCase() === myName) return true;
      return false;
    });

    if (!myEntries.length) return { days: null, first: true };

    const latest = myEntries.reduce((best, e) => {
      const d = e.date || e.createdAt || "";
      return d > best ? d : best;
    }, "");

    if (!latest) return false;
    const diffMs = Date.now() - new Date(latest).getTime();
    const days = Math.floor(diffMs / (24 * 60 * 60 * 1000));
    if (days >= 7) return { days: days, first: false };
    return false;
  }

  function showNudge(info) {
    const nudge = $("flyNudge");
    if (!nudge) return;

    let msg;
    if (info.first) {
      msg = "You haven't logged any experiments yet. " +
        "Once you do, your team can learn from what you've tried.";
    } else {
      msg = "It's been <strong>" + info.days + " day" + (info.days === 1 ? "" : "s") +
        "</strong> since your last experiment. Working on something new?";
    }

    nudge.innerHTML =
      '<div class="fly-nudge-bar">' +
        '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">' +
          '<path d="M22 11.08V12a10 10 0 11-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/>' +
        '</svg>' +
        '<div class="fly-nudge-bar-text">' + msg + '</div>' +
        '<div class="fly-nudge-actions">' +
          '<button class="fly-btn fly-btn-primary fly-btn-sm" data-action="nudge-log" style="white-space:nowrap">Log an experiment</button>' +
          '<button class="fly-nudge-dismiss" data-action="nudge-dismiss" aria-label="Dismiss">' +
            '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>' +
          '</button>' +
        '</div>' +
      '</div>';

    nudge.classList.remove("closing");
    nudge.classList.add("open");
  }

  function dismissNudge() {
    try { localStorage.setItem("flywheel_nudge_dismissed", Date.now()); } catch {}
    const nudge = $("flyNudge");
    if (!nudge) return;
    nudge.classList.add("closing");
    setTimeout(() => nudge.classList.remove("open", "closing"), 260);
  }

  /* ============================================================
     INIT
     ============================================================ */
  async function init() {
    await loadAll();
    $("flyLoading").style.display = "none";
    $("flyApp").style.display = "";

    paintUserChip();
    paintStaleBanner();
    paintRefreshed();
    paintOverview();
    paintFilterBar();
    paintTable(true);
    wireEvents();
    // Position immediately (layout is already done), then again on the next
    // frame in case web fonts land late and shift the tab widths.
    moveTabIndicator(false);
    requestAnimationFrame(() => moveTabIndicator(false));
    if (document.fonts && document.fonts.ready) {
      document.fonts.ready.then(() => moveTabIndicator(false));
    }

    if (state.loadError) toast("Could not load experiments from the database.", "error");

    // Deep link: ?exp=ID opens the experiment detail sheet on load.
    const params = new URLSearchParams(window.location.search);
    const expId = params.get("exp");
    if (expId && state.entries.some((e) => e.id === expId)) {
      requestAnimationFrame(() => openDetail(expId));
    }

    // Restore drafts indicator.
    paintDraftsBadge();

    // The key check runs for everyone, not just where the welcome modal is
    // eligible — mobile suppresses the modal but still needs the setup dots.
    refreshKeyState().then(function (hasKey) {
      if (hasKey === true) markWelcomed();

      var needsSetup = hasKey === false;
      if (hasKey === null) {
        // Could not reach /api/tokens. Fall back to whether they have ever been
        // welcomed rather than assuming either way.
        try { needsSetup = !localStorage.getItem("flywheel_welcomed"); } catch (e) { needsSetup = false; }
      }

      if (needsSetup && shouldShowWelcome()) {
        requestAnimationFrame(function () { openWelcome(); });
        return;
      }
      var nudgeInfo = shouldShowNudge();
      if (nudgeInfo) requestAnimationFrame(function () { showNudge(nudgeInfo); });
    });
  }

  init();
})();
