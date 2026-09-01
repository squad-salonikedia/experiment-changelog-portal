/**
 * End-to-end smoke test for the Flywheel API.
 *
 * Exercises every endpoint the dashboard and the Claude skill depend on, against
 * a running server, and cleans up everything it creates. Run it before a release
 * or after touching anything under app/api/.
 *
 *   node scripts/smoke-test.mjs                        # http://localhost:3000
 *   node scripts/smoke-test.mjs https://your-app.app   # a deployed environment
 *
 * It mints a temporary API token directly in the database (the same kind the
 * "Download my skill" button creates), uses it for the whole run, and revokes it
 * at the end — so it needs SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY from
 * .env.local. Nothing it writes survives a successful run.
 */
import { createHash, randomBytes, randomUUID } from "crypto";
import { readFileSync } from "fs";
import { createClient } from "@supabase/supabase-js";
import { encode } from "next-auth/jwt";

const BASE = (process.argv[2] || process.env.BASE_URL || "http://localhost:3000").replace(/\/$/, "");

// ---------------------------------------------------------------- env
for (const line of readFileSync(new URL("../.env.local", import.meta.url), "utf8").split("\n")) {
  const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
  if (m && !process.env[m[1]]) process.env[m[1]] = m[2].trim().replace(/^["']|["']$/g, "");
}
const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false },
});

// ---------------------------------------------------------------- harness
let passed = 0, failed = 0;
const failures = [];

async function check(name, fn) {
  try {
    const note = await fn();
    passed++;
    console.log(`  \x1b[32m✔\x1b[0m ${name}${note ? `  \x1b[2m${note}\x1b[0m` : ""}`);
  } catch (err) {
    failed++;
    failures.push(`${name} — ${err.message}`);
    console.log(`  \x1b[31m✘\x1b[0m ${name}\n      \x1b[31m${err.message}\x1b[0m`);
  }
}
function eq(actual, expected, what) {
  const a = JSON.stringify(actual), e = JSON.stringify(expected);
  if (a !== e) throw new Error(`${what}: expected ${e}, got ${a}`);
}
function ok(cond, msg) { if (!cond) throw new Error(msg); }
function section(title) { console.log(`\n\x1b[1m${title}\x1b[0m`); }

// ---------------------------------------------------------------- auth
let TOKEN, tokenRow, viewerEmail;

async function mintToken(email) {
  const token = "fw_" + randomBytes(24).toString("base64url");
  const hash = createHash("sha256").update(token, "utf8").digest("hex");
  const { data, error } = await supabase
    .from("api_tokens")
    .insert({ user_email: email, name: "smoke test (temporary)", token_hash: hash, prefix: token.slice(0, 11) })
    .select("id")
    .single();
  if (error) throw new Error(`could not mint a test token: ${error.message}`);
  return { token, id: data.id };
}

const api = (path, init = {}) =>
  fetch(BASE + path, {
    ...init,
    headers: {
      ...(init.body ? { "Content-Type": "application/json" } : {}),
      ...(init.noAuth || init.cookie
        ? {}
        : { Authorization: `Bearer ${init.token ?? TOKEN}` }),
      ...(init.cookie ? { Cookie: init.cookie } : {}),
      ...init.headers,
    },
  });

/**
 * Some routes only accept a browser session — minting keys, the access list.
 * A token deliberately cannot reach them, so to test them at all the suite
 * signs a session cookie with the app's own NEXTAUTH_SECRET. No password and no
 * browser involved; this is the same JWT Auth.js would have issued after login.
 */
let cookieName = null;
async function sessionCookie(email, name) {
  const secret = process.env.NEXTAUTH_SECRET ?? process.env.AUTH_SECRET;
  if (!secret) throw new Error("NEXTAUTH_SECRET is not set — cannot mint a test session");
  const candidates = cookieName
    ? [cookieName]
    : BASE.startsWith("https://")
      ? ["__Secure-authjs.session-token", "authjs.session-token"]
      : ["authjs.session-token", "__Secure-authjs.session-token"];
  for (const candidate of candidates) {
    const jwt = await encode({
      token: { email, name, sub: email },
      secret,
      salt: candidate,
      maxAge: 300,
    });
    const cookie = `${candidate}=${jwt}`;
    if ((await api("/api/me", { cookie })).status === 200) {
      cookieName = candidate;
      return cookie;
    }
  }
  throw new Error("could not mint a working session cookie — check NEXTAUTH_SECRET");
}

const json = async (res) => { try { return await res.json(); } catch { return null; } };

// ---------------------------------------------------------------- run
const created = { experiments: [], comments: [], people: [] };

async function main() {
  console.log(`\nFlywheel smoke test → \x1b[36m${BASE}\x1b[0m`);

  const { data: people } = await supabase
    .from("allowed_users").select("email, name, role").order("created_at").limit(50);
  ok(people?.length, "no rows in allowed_users — cannot pick a test identity");
  const me = people.find((p) => p.email === process.env.TEST_EMAIL) ?? people.find((p) => p.role === "admin") ?? people[0];
  viewerEmail = me.email;

  const minted = await mintToken(viewerEmail);
  TOKEN = minted.token;
  tokenRow = minted.id;
  console.log(`Acting as \x1b[36m${viewerEmail}\x1b[0m with a temporary token (revoked at the end).\n`);

  // ------------------------------------------------------------ auth
  section("Authentication");
  await check("no credentials are refused", async () => {
    const res = await api("/api/experiments", { noAuth: true, redirect: "manual" });
    ok(res.status !== 200, `expected a refusal, got ${res.status}`);
    return `${res.status}`;
  });
  await check("an unknown token is refused", async () => {
    const res = await api("/api/experiments", { token: "fw_not_a_real_token" });
    eq(res.status, 401, "status");
  });
  await check("a revoked token is refused", async () => {
    const temp = await mintToken(viewerEmail);
    await supabase.from("api_tokens").update({ revoked_at: new Date().toISOString() }).eq("id", temp.id);
    const res = await api("/api/experiments", { token: temp.token });
    await supabase.from("api_tokens").delete().eq("id", temp.id);
    eq(res.status, 401, "status");
  });

  // ------------------------------------------------------------ reads
  section("Reading");
  await check("GET /api/me identifies the token's owner", async () => {
    const res = await api("/api/me");
    eq(res.status, 200, "status");
    const body = await json(res);
    eq(body.email, viewerEmail, "email");
    return body.name;
  });
  await check("GET /api/options returns the vocabularies", async () => {
    const res = await api("/api/options");
    eq(res.status, 200, "status");
    const o = await json(res);
    for (const key of ["clients", "industries", "buckets", "metrics"]) {
      ok(Array.isArray(o[key]) && o[key].length, `${key} missing or empty`);
    }
    ok(o.useCasesByIndustry && typeof o.useCasesByIndustry === "object", "useCasesByIndustry missing");
    return `${o.clients.length} clients, ${o.buckets.length} buckets`;
  });
  let listBefore;
  await check("GET /api/experiments returns the changelog", async () => {
    const res = await api("/api/experiments");
    eq(res.status, 200, "status");
    listBefore = await json(res);
    ok(Array.isArray(listBefore), "expected an array");
    if (listBefore.length) {
      for (const field of ["id", "client", "experimentName", "loggedBy", "canEdit", "ownerEmail"]) {
        ok(field in listBefore[0], `entry is missing ${field}`);
      }
    }
    return `${listBefore.length} entries`;
  });
  await check("entries carry ownership, so \"what have I logged\" can filter", async () => {
    const mine = listBefore.filter((e) => (e.ownerEmail || "").toLowerCase() === viewerEmail.toLowerCase());
    const byCanEdit = listBefore.filter((e) => e.canEdit);
    ok(mine.every((e) => byCanEdit.includes(e)), "ownerEmail matches are not all editable — permission logic disagrees with itself");
    return `${mine.length} owned by ${viewerEmail}`;
  });

  // ------------------------------------------------------------ writes
  section("Writing");
  const stamp = new Date().toISOString().slice(0, 19).replace("T", " ");
  const quantTitle = `[smoke test] quantitative ${stamp}`;
  let quantId;

  await check("POST /api/experiments creates a quantitative entry", async () => {
    const res = await api("/api/experiments", {
      method: "POST",
      body: JSON.stringify({
        entries: [{
          client: "ZZ Smoke Test Co", industry: "BFSI", useCase: "Smoke Test Use Case",
          bucket: "Cadence", title: quantTitle, description: "Created by scripts/smoke-test.mjs.",
          date: new Date().toISOString().slice(0, 10),
          metrics: [{ metric: "ADC%", before: 30, after: 15 }],
        }],
      }),
    });
    eq(res.status, 200, "status");
    const body = await json(res);
    ok(body.ok && body.entries?.length === 1, "no saved entry came back");
    const entry = body.entries[0];
    quantId = entry.id;
    created.experiments.push(quantId);
    eq(entry.experimentName, quantTitle, "title");
    eq(entry.client, "ZZ Smoke Test Co", "client");
    eq(String(entry.before), "30", "before");
    eq(String(entry.after), "15", "after");
    eq(entry.pctChange, "-50.0%", "pctChange");
    return quantId;
  });

  await check("the new entry is really in the changelog", async () => {
    const list = await json(await api("/api/experiments"));
    const found = list.find((e) => e.id === quantId);
    ok(found, "the entry just created is not in the list");
    eq(found.canEdit, true, "canEdit for its own author");
    eq(found.ownerEmail, viewerEmail, "ownerEmail");
  });

  await check("a brand-new client shows up in /api/options", async () => {
    const o = await json(await api("/api/options"));
    ok(o.clients.includes("ZZ Smoke Test Co"), "the new client is missing from the options list");
  });

  await check("POST accepts a qualitative entry with no numbers", async () => {
    const res = await api("/api/experiments", {
      method: "POST",
      body: JSON.stringify({
        entries: [{
          client: "ZZ Smoke Test Co", industry: "BFSI", bucket: "Prompt",
          title: `[smoke test] qualitative ${stamp}`,
          metrics: [{ metric: "Call Quality", qualitative: true, direction: "better", note: "Reviewers noted more natural pacing." }],
        }],
      }),
    });
    eq(res.status, 200, "status");
    const entry = (await json(res)).entries[0];
    created.experiments.push(entry.id);
    eq(entry.metricType, "Qualitative", "metricType");
    eq(entry.direction, "better", "direction");
    eq(entry.evidenceNote, "Reviewers noted more natural pacing.", "note");
  });

  await check("POST with no entries is rejected", async () => {
    const res = await api("/api/experiments", { method: "POST", body: JSON.stringify({ entries: [] }) });
    eq(res.status, 400, "status");
  });

  // ------------------------------------------------------------ editing
  section("Editing");
  await check("PATCH updates an entry the caller owns", async () => {
    const res = await api(`/api/experiments/${quantId}`, {
      method: "PATCH",
      body: JSON.stringify({
        client: "ZZ Smoke Test Co", industry: "BFSI", useCase: "Smoke Test Use Case",
        bucket: "Cadence", title: quantTitle + " (edited)", description: "Edited by the smoke test.",
        date: new Date().toISOString().slice(0, 10),
        metrics: [{ metric: "ADC%", before: 30, after: 12 }],
      }),
    });
    eq(res.status, 200, "status");
    const entry = (await json(res)).entry;
    eq(entry.experimentName, quantTitle + " (edited)", "title");
    eq(String(entry.after), "12", "after");
    eq(entry.client, "ZZ Smoke Test Co", "client survived the edit");
  });

  await check("PATCH leaves out what it was not sent", async () => {
    const res = await api(`/api/experiments/${quantId}`, {
      method: "PATCH",
      body: JSON.stringify({ title: quantTitle + " (partial)" }),
    });
    eq(res.status, 200, "status");
    const entry = (await json(res)).entry;
    eq(entry.experimentName, quantTitle + " (partial)", "title");
    eq(entry.client, "ZZ Smoke Test Co", "client survived a partial patch");
    eq(entry.bucket, "Cadence", "bucket survived a partial patch");
    eq(entry.metricLabel, "ADC%", "metric survived a partial patch");
    eq(String(entry.after), "12", "after survived a partial patch");
  });

  await check("an empty string still clears a field", async () => {
    const res = await api(`/api/experiments/${quantId}`, {
      method: "PATCH",
      body: JSON.stringify({ useCase: "" }),
    });
    eq(res.status, 200, "status");
    eq((await json(res)).entry.useCase, "", "useCase");
    await api(`/api/experiments/${quantId}`, {
      method: "PATCH",
      body: JSON.stringify({ useCase: "Smoke Test Use Case", title: quantTitle }),
    });
  });

  await check("a PATCH with no fields is rejected", async () => {
    const res = await api(`/api/experiments/${quantId}`, { method: "PATCH", body: JSON.stringify({}) });
    eq(res.status, 400, "status");
  });

  await check("PATCH will not touch an entry someone else logged", async () => {
    const list = await json(await api("/api/experiments"));
    const theirs = list.find((e) => !e.canEdit);
    if (!theirs) return "no entry logged by anyone else — nothing to test against";
    const res = await api(`/api/experiments/${theirs.id}`, {
      method: "PATCH",
      // their current values, so a wrongly-successful write changes nothing
      body: JSON.stringify({
        client: theirs.client, industry: theirs.industry, useCase: theirs.useCase,
        bucket: theirs.bucket, title: theirs.experimentName, description: theirs.evidenceNote,
        date: theirs.date, metrics: [{ metric: theirs.metricLabel, before: theirs.before, after: theirs.after }],
      }),
    });
    eq(res.status, 403, "status");
  });

  await check("PATCH on an unknown id is a 404", async () => {
    const res = await api(`/api/experiments/${randomUUID()}`, { method: "PATCH", body: JSON.stringify({ title: "x" }) });
    eq(res.status, 404, "status");
  });

  // ------------------------------------------------------------ reactions
  section("Reactions");
  await check("POST records a reaction against the caller, not a name they sent", async () => {
    const res = await api(`/api/experiments/${quantId}/reactions`, {
      method: "POST",
      // deliberately lying about who we are — the server must ignore it
      body: JSON.stringify({ reaction: "up", userIdentity: "somebody.else@squadstack.ai" }),
    });
    eq(res.status, 200, "status");
    const r = await json(res);
    eq(r.up, [viewerEmail], "up");
    eq(r.down, [], "down");
  });
  await check("reacting again takes the reaction back", async () => {
    const r = await json(await api(`/api/experiments/${quantId}/reactions`, {
      method: "POST", body: JSON.stringify({ reaction: "up" }),
    }));
    eq(r.up, [], "up");
  });
  await check("up replaces down rather than stacking", async () => {
    await api(`/api/experiments/${quantId}/reactions`, { method: "POST", body: JSON.stringify({ reaction: "down" }) });
    const r = await json(await api(`/api/experiments/${quantId}/reactions`, {
      method: "POST", body: JSON.stringify({ reaction: "up" }),
    }));
    eq(r.up, [viewerEmail], "up");
    eq(r.down, [], "down");
  });
  await check("a nonsense reaction is rejected", async () => {
    const res = await api(`/api/experiments/${quantId}/reactions`, {
      method: "POST", body: JSON.stringify({ reaction: "sideways" }),
    });
    eq(res.status, 400, "status");
  });
  await check("reactions come back on the experiment itself", async () => {
    const list = await json(await api("/api/experiments"));
    const entry = list.find((e) => e.id === quantId);
    eq(entry.reactions.up, [viewerEmail], "reactions.up");
  });

  // ------------------------------------------------------------ comments
  section("Comments");
  let commentId;
  await check("POST a comment", async () => {
    const res = await api(`/api/experiments/${quantId}/comments`, {
      method: "POST",
      body: JSON.stringify({ body: "Smoke test comment — safe to ignore." }),
    });
    eq(res.status, 200, "status");
    const body = await json(res);
    ok(body.comment?.id, "no comment came back");
    commentId = body.comment.id;
    created.comments.push({ experimentId: quantId, id: commentId });
    eq(body.comment.canDelete, true, "canDelete");
  });
  await check("GET returns it, oldest first", async () => {
    const res = await api(`/api/experiments/${quantId}/comments`);
    eq(res.status, 200, "status");
    const { comments } = await json(res);
    ok(comments.some((c) => c.id === commentId), "the comment just posted is missing");
    const times = comments.map((c) => new Date(c.createdAt).getTime());
    ok(times.every((t, i) => i === 0 || times[i - 1] <= t), "comments are not in oldest-first order");
    return `${comments.length} on this entry`;
  });
  await check("an empty comment is rejected", async () => {
    const res = await api(`/api/experiments/${quantId}/comments`, { method: "POST", body: JSON.stringify({ body: "   " }) });
    eq(res.status, 400, "status");
  });
  await check("an over-long comment is rejected", async () => {
    const res = await api(`/api/experiments/${quantId}/comments`, { method: "POST", body: JSON.stringify({ body: "x".repeat(2001) }) });
    eq(res.status, 400, "status");
  });
  await check("a comment can be edited, and says so", async () => {
    const res = await api(`/api/experiments/${quantId}/comments?commentId=${commentId}`, {
      method: "PATCH", body: JSON.stringify({ body: "Smoke test comment — reworded." }),
    });
    if (res.status === 405) return "PATCH not deployed here yet";
    eq(res.status, 200, "status");
    const c = (await json(res)).comment;
    eq(c.body, "Smoke test comment — reworded.", "body");
    // edited_at and parent_id both arrive with migration 007. Before it is run
    // the edit still works, it just cannot be marked — which is the designed
    // fallback, not a failure.
    const { threading } = await json(await api(`/api/experiments/${quantId}/comments`));
    if (!threading) return "edited, but migration 007 not run so it is unmarked";
    ok(c.editedAt, "editedAt should be set");
  });

  await check("an empty edit is rejected", async () => {
    const res = await api(`/api/experiments/${quantId}/comments?commentId=${commentId}`, {
      method: "PATCH", body: JSON.stringify({ body: "  " }),
    });
    eq(res.status, 400, "status");
  });

  await check("a reply attaches to its parent", async () => {
    const res = await api(`/api/experiments/${quantId}/comments`, {
      method: "POST", body: JSON.stringify({ body: "A reply to that.", parentId: commentId }),
    });
    eq(res.status, 200, "status");
    const reply = (await json(res)).comment;
    created.comments.push({ experimentId: quantId, id: reply.id });
    const { comments, threading } = await json(await api(`/api/experiments/${quantId}/comments`));
    if (!threading) return "threading columns not migrated yet — stayed flat, as designed";
    eq(reply.parentId, commentId, "parentId");
    ok(comments.some((c) => c.id === reply.id && c.parentId === commentId), "the reply lost its parent");
    return "one level deep";
  });

  await check("a reply to a reply joins the same thread", async () => {
    const { comments, threading } = await json(await api(`/api/experiments/${quantId}/comments`));
    if (!threading) return "threading columns not migrated yet";
    const reply = comments.find((c) => c.parentId === commentId);
    const res = await api(`/api/experiments/${quantId}/comments`, {
      method: "POST", body: JSON.stringify({ body: "And a reply to the reply.", parentId: reply.id }),
    });
    eq(res.status, 200, "status");
    const nested = (await json(res)).comment;
    created.comments.push({ experimentId: quantId, id: nested.id });
    eq(nested.parentId, commentId, "should flatten onto the top-level comment");
  });

  await check("a reply cannot be attached across experiments", async () => {
    // Must be a different experiment — pointing this at the comment's own
    // experiment is just an ordinary reply, which is what it was doing before.
    const other = created.experiments.find((id) => id !== quantId);
    ok(other, "no second experiment to test against");
    const res = await api(`/api/experiments/${other}/comments`, {
      method: "POST", body: JSON.stringify({ body: "wrong thread", parentId: commentId }),
    });
    const { threading } = await json(await api(`/api/experiments/${quantId}/comments`));
    if (!threading) {
      const stray = (await json(res)).comment;
      created.comments.push({ experimentId: other, id: stray.id });
      ok(!stray.parentId, "a cross-experiment parent should not have been accepted");
      return "threading not migrated — parent ignored";
    }
    eq(res.status, 400, "status");
  });

  await check("deleting a comment takes its replies", async () => {
    const { threading } = await json(await api(`/api/experiments/${quantId}/comments`));
    if (!threading) return "threading columns not migrated yet";
    const res = await api(`/api/experiments/${quantId}/comments?commentId=${commentId}`, { method: "DELETE" });
    eq(res.status, 200, "status");
    const { comments } = await json(await api(`/api/experiments/${quantId}/comments`));
    eq(comments.filter((c) => c.parentId === commentId).length, 0, "replies left behind");
    created.comments = [];
    // put a comment back so the delete-cascade check below still has one
    const fresh = await json(await api(`/api/experiments/${quantId}/comments`, {
      method: "POST", body: JSON.stringify({ body: "Replacement comment." }),
    }));
    commentId = fresh.comment.id;
    created.comments.push({ experimentId: quantId, id: commentId });
  });

  await check("DELETE removes your own comment", async () => {
    const res = await api(`/api/experiments/${quantId}/comments?commentId=${commentId}`, { method: "DELETE" });
    eq(res.status, 200, "status");
    const { comments } = await json(await api(`/api/experiments/${quantId}/comments`));
    ok(!comments.some((c) => c.id === commentId), "the comment is still there after a delete");
    created.comments = created.comments.filter((c) => c.id !== commentId);
  });
  await check("DELETE of an unknown comment is a 404", async () => {
    const res = await api(`/api/experiments/${quantId}/comments?commentId=${randomUUID()}`, { method: "DELETE" });
    eq(res.status, 404, "status");
  });

  // ------------------------------------------------------------ session-only
  section("Keys and access (browser session only)");
  const adminCookie = await sessionCookie(viewerEmail, "Smoke Test Admin");

  await check("GET /api/tokens works with a session", async () => {
    const res = await api("/api/tokens", { cookie: adminCookie });
    eq(res.status, 200, "status");
    const body = await json(res);
    ok(body.enabled === true && Array.isArray(body.tokens), "unexpected shape");
    return `${body.tokens.length} active`;
  });

  await check("a token cannot mint another token", async () => {
    const res = await api("/api/tokens", { method: "POST", body: JSON.stringify({ name: "should not exist" }) });
    eq(res.status, 401, "status");
  });

  await check("a key can be created, used, then revoked", async () => {
    const made = await api("/api/tokens", {
      method: "POST", cookie: adminCookie, body: JSON.stringify({ name: "smoke test (round trip)" }),
    });
    eq(made.status, 200, "create status");
    const { token, prefix } = await json(made);
    ok(token && prefix, "no token came back");
    eq((await api("/api/me", { token })).status, 200, "the new key should work");

    // POST returns the plaintext but not the row id, so find it by prefix.
    const { tokens } = await json(await api("/api/tokens", { cookie: adminCookie }));
    const row = tokens.find((t) => t.prefix === prefix);
    ok(row, "the new key is not listed");

    const revoked = await api(`/api/tokens?id=${encodeURIComponent(row.id)}`, { method: "DELETE", cookie: adminCookie });
    eq(revoked.status, 200, "revoke status");
    eq((await api("/api/me", { token })).status, 401, "a revoked key must stop working");
  });

  await check("the access list is admin-only", async () => {
    const res = await api("/api/admin/invite", { cookie: adminCookie });
    eq(res.status, 200, "status for an admin");
    const people = await json(res);
    ok(Array.isArray(people), "expected a list of people");

    const member = people.find((p) => p.role !== "admin");
    if (member) {
      const theirs = await sessionCookie(member.email, member.name ?? "");
      eq((await api("/api/admin/invite", { cookie: theirs })).status, 403, "status for a member");
    }
    return `${people.length} people${member ? ", member refused" : " (no member to test with)"}`;
  });

  await check("inviting and removing a person", async () => {
    const email = `smoke-test-delete-me@squadstack.ai`;
    await supabase.from("allowed_users").delete().eq("email", email);
    const invited = await api("/api/admin/invite", {
      method: "POST", cookie: adminCookie,
      body: JSON.stringify({ email, name: "Smoke Test", role: "member" }),
    });
    eq(invited.status, 200, "invite status");
    created.people.push(email);

    const listed = await json(await api("/api/admin/invite", { cookie: adminCookie }));
    ok(listed.some((p) => p.email === email), "the invited person is not in the list");

    const removed = await api("/api/admin/invite", {
      method: "DELETE", cookie: adminCookie, body: JSON.stringify({ email }),
    });
    eq(removed.status, 200, "remove status");
    created.people = created.people.filter((e) => e !== email);

    const after = await json(await api("/api/admin/invite", { cookie: adminCookie }));
    ok(!after.some((p) => p.email === email), "the person is still there after removal");
  });

  await check("an admin cannot remove themselves", async () => {
    const res = await api("/api/admin/invite", {
      method: "DELETE", cookie: adminCookie, body: JSON.stringify({ email: viewerEmail }),
    });
    eq(res.status, 400, "status");
  });

  // ------------------------------------------------------------ deleting
  section("Deleting");
  await check("DELETE on an unknown id is a 404", async () => {
    const res = await api(`/api/experiments/${randomUUID()}`, { method: "DELETE" });
    eq(res.status, 404, "status");
  });
  await check("DELETE will not remove an entry someone else logged", async () => {
    const list = await json(await api("/api/experiments"));
    const theirs = list.find((e) => !e.canEdit);
    if (!theirs) return "no entry logged by anyone else — nothing to test against";
    const res = await api(`/api/experiments/${theirs.id}`, { method: "DELETE" });
    eq(res.status, 403, "status");
    const after = await json(await api("/api/experiments"));
    ok(after.some((e) => e.id === theirs.id), "a 403 still removed the row");
  });
  await check("deleting an entry takes its comments with it", async () => {
    const made = await json(await api("/api/experiments", {
      method: "POST",
      body: JSON.stringify({ entries: [{ client: "ZZ Smoke Test Co", industry: "BFSI", bucket: "Cadence",
        title: `[smoke test] cascade ${stamp}`, metrics: [{ metric: "ADC%", before: 1, after: 2 }] }] }),
    }));
    const id = made.entries[0].id;
    created.experiments.push(id);
    await api(`/api/experiments/${id}/comments`, { method: "POST", body: JSON.stringify({ body: "attached to a doomed entry" }) });
    const before = await json(await api(`/api/experiments/${id}/comments`));
    eq(before.comments.length, 1, "comment count before the delete");
    eq((await api(`/api/experiments/${id}`, { method: "DELETE" })).status, 200, "delete status");
    created.experiments = created.experiments.filter((x) => x !== id);
    const after = await json(await api(`/api/experiments/${id}/comments`));
    eq(after.comments.length, 0, "comments left behind after the experiment was deleted");
  });

  await check("DELETE removes your own entry, and it stays gone", async () => {
    const res = await api(`/api/experiments/${quantId}`, { method: "DELETE" });
    eq(res.status, 200, "status");
    const list = await json(await api("/api/experiments"));
    ok(!list.some((e) => e.id === quantId), "the entry is still in the changelog after a successful delete");
    created.experiments = created.experiments.filter((id) => id !== quantId);
  });
}

// ---------------------------------------------------------------- cleanup
async function cleanup() {
  for (const c of created.comments) {
    await api(`/api/experiments/${c.experimentId}/comments?commentId=${c.id}`, { method: "DELETE" }).catch(() => {});
  }
  for (const id of created.experiments) {
    const res = await api(`/api/experiments/${id}`, { method: "DELETE" }).catch(() => null);
    if (!res || !res.ok) await supabase.from("experiments").delete().eq("id", id);
  }
  for (const email of created.people) {
    await supabase.from("allowed_users").delete().eq("email", email);
  }
  await supabase.from("api_tokens").delete().eq("name", "smoke test (round trip)");
  if (tokenRow) await supabase.from("api_tokens").delete().eq("id", tokenRow);
}

try {
  await main();
} catch (err) {
  failed++;
  failures.push(`run aborted — ${err.message}`);
  console.log(`\n\x1b[31mRun aborted: ${err.message}\x1b[0m`);
} finally {
  await cleanup();
  console.log(`\n\x1b[1m${passed} passed, ${failed} failed\x1b[0m`);
  if (failures.length) {
    console.log("\nFailures:");
    for (const f of failures) console.log(`  • ${f}`);
  }
  console.log("Test data and the temporary token have been removed.\n");
  process.exit(failed ? 1 : 0);
}
