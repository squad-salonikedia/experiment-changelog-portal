/**
 * Unit tests for the spreadsheet import parser (src/import-rows.js).
 *
 *   node scripts/test-import.mjs
 *
 * No server, no database, no browser — this is the "Upload a file" path's only
 * real logic, and until now the only way to exercise it was to drag a file into
 * the drawer and see what came out.
 */
import { readFileSync } from "fs";

new Function(readFileSync(new URL("../src/import-rows.js", import.meta.url), "utf8"))();
const { importRows } = globalThis.FlywheelImport;

let passed = 0, failed = 0;
const failures = [];

function check(name, fn) {
  try {
    fn();
    passed++;
    console.log(`  \x1b[32m✔\x1b[0m ${name}`);
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

const OPTS = { today: "2026-09-02", owner: "Saloni" };

console.log("\n\x1b[1mSpreadsheet import\x1b[0m");

check("reads a straightforward row", () => {
  const [e] = importRows([{
    Date: "2026-08-21", Client: "Khatabook", Industry: "BFSI", "Use case": "PA-BL",
    Bucket: "Cadence", Title: "Cut retries", Description: "Why", Metric: "ADC%",
    Before: "30", After: "15", Owner: "Rajat",
  }], OPTS);
  eq(e.client, "Khatabook", "client");
  eq(e.useCase, "PA-BL", "useCase");
  eq(e.title, "Cut retries", "title");
  eq(e.owner, "Rajat", "owner");
  eq(e.metrics, [{ metric: "ADC%", qualitative: false, before: "30", after: "15" }], "metrics");
});

check("header spelling does not matter", () => {
  const [e] = importRows([{
    "  DATE  ": "2026-08-21", "client_name": "x", "Client": "Khatabook",
    "Experiment Name": "Title here", "Metric Label": "ADC%", "Before Value": "3", "After Value": "1",
  }], OPTS);
  eq(e.title, "Title here", "title from 'Experiment Name'");
  eq(e.metrics[0].metric, "ADC%", "metric from 'Metric Label'");
  eq(e.metrics[0].before, "3", "before from 'Before Value'");
});

check("rows sharing date + title + client merge into one experiment", () => {
  const rows = [
    { Date: "2026-08-21", Client: "DMI", Title: "Same change", Metric: "ADC%", Before: "20", After: "18" },
    { Date: "2026-08-21", Client: "DMI", Title: "Same change", Metric: "Conversion%", Before: "5", After: "7" },
  ];
  const out = importRows(rows, OPTS);
  eq(out.length, 1, "experiment count");
  eq(out[0].metrics.length, 2, "metric count");
  eq(out[0].metrics.map((m) => m.metric), ["ADC%", "Conversion%"], "metric labels");
});

check("a different date splits them apart", () => {
  const out = importRows([
    { Date: "2026-08-21", Client: "DMI", Title: "Same change", Metric: "ADC%", Before: "20", After: "18" },
    { Date: "2026-08-22", Client: "DMI", Title: "Same change", Metric: "ADC%", Before: "18", After: "16" },
  ], OPTS);
  eq(out.length, 2, "experiment count");
});

check("no numbers means a qualitative metric", () => {
  const [e] = importRows([{
    Client: "Everest Fleet", Title: "Fixed pronunciation", Metric: "Call Quality",
    Direction: "BETTER", Notes: "Reviewers stopped flagging it",
  }], OPTS);
  eq(e.metrics[0].qualitative, true, "qualitative");
  eq(e.metrics[0].direction, "better", "direction is lowercased");
  eq(e.metrics[0].note, "Reviewers stopped flagging it", "note");
});

check("a missing direction defaults to better", () => {
  const [e] = importRows([{ Client: "X", Title: "Y", Metric: "Call Quality" }], OPTS);
  eq(e.metrics[0].direction, "better", "direction");
});

check("a missing date falls back to today, a missing owner to the viewer", () => {
  const [e] = importRows([{ Client: "X", Title: "Y", Metric: "ADC%", Before: "1", After: "2" }], OPTS);
  eq(e.date, "2026-09-02", "date");
  eq(e.owner, "Saloni", "owner");
});

check("a timestamp is trimmed to a calendar day", () => {
  const [e] = importRows([{
    Date: "2026-08-21T00:00:00+05:30", Client: "X", Title: "Y", Metric: "ADC%", Before: "1", After: "2",
  }], OPTS);
  eq(e.date, "2026-08-21", "date");
});

check("rows with no metric are dropped", () => {
  eq(importRows([{ Client: "X", Title: "No metric here" }], OPTS), [], "result");
});

check("rows with neither title nor client are skipped", () => {
  eq(importRows([{ Metric: "ADC%", Before: "1", After: "2" }], OPTS), [], "result");
});

check("blank cells do not count as values", () => {
  const [e] = importRows([{
    Client: "X", Title: "Y", Industry: "   ", Bucket: "", Metric: "ADC%", Before: "1", After: "2",
  }], OPTS);
  eq(e.industry, "", "industry");
  eq(e.bucket, "", "bucket");
});

check("empty and malformed input do not throw", () => {
  eq(importRows([], OPTS), [], "empty array");
  eq(importRows(undefined, OPTS), [], "undefined");
  eq(importRows([{}], OPTS), [], "empty row");
});

check("numbers from a spreadsheet arrive as strings", () => {
  const [e] = importRows([{ Client: "X", Title: "Y", Metric: "ADC%", Before: 30, After: 15 }], OPTS);
  eq(e.metrics[0].before, "30", "before");
  ok(typeof e.metrics[0].after === "string", "after should be a string");
});

console.log(`\n\x1b[1m${passed} passed, ${failed} failed\x1b[0m`);
if (failures.length) {
  console.log("\nFailures:");
  for (const f of failures) console.log(`  • ${f}`);
}
console.log("");
process.exit(failed ? 1 : 0);
