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
const { importRows, templateCsv, TEMPLATE_COLUMNS, normaliseDate } = globalThis.FlywheelImport;

/** Minimal CSV reader — enough for the template, which has no quoted commas. */
function parseCsv(text) {
  const [head, ...lines] = text.trim().split("\n");
  const headers = head.split(",");
  return lines.map((line) => {
    const cells = line.split(",");
    return Object.fromEntries(headers.map((h, i) => [h, cells[i] ?? ""]));
  });
}

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

console.log("\n\x1b[1mDates out of a spreadsheet\x1b[0m");

check("an ISO date is taken as written", () => {
  eq(normaliseDate("2026-09-02"), "2026-09-02", "iso");
  eq(normaliseDate("2026-09-02T00:00:00+05:30"), "2026-09-02", "iso with a time");
});

check("an Excel serial becomes the date it stands for", () => {
  // What SheetJS actually hands back for a .xlsx date cell.
  eq(normaliseDate(46267.00011574074), "2026-09-02", "xlsx serial");
  eq(normaliseDate(46267), "2026-09-02", "whole serial");
});

check("the reader's timezone cannot shift the day", () => {
  // The fraction in a serial is the offset of whoever opened the file, not a
  // time of day — half a day either way must still land on the same date.
  eq(normaliseDate(46267.22928240741), "2026-09-02", "read in IST (+5:30)");
  eq(normaliseDate(46266.667), "2026-09-02", "read in UTC-8");
  eq(normaliseDate(46267.49), "2026-09-02", "just under half a day late");
});

check("a Date object is read as the day it shows", () => {
  eq(normaliseDate(new Date(2026, 8, 2, 14, 30)), "2026-09-02", "date object");
  eq(normaliseDate(new Date("nonsense")), "", "invalid date");
});

check("numbers that are not dates are refused", () => {
  eq(normaliseDate(5), "", "a count, not a date");
  eq(normaliseDate(999999), "", "far future");
  eq(normaliseDate("not a date"), "", "text");
  eq(normaliseDate(""), "", "empty");
});

check("a spreadsheet date survives the whole import", () => {
  const [e] = importRows([{
    Date: 46267.22928240741, Client: "X", Title: "Y", Metric: "ADC%", Before: 30, After: 15,
  }], OPTS);
  eq(e.date, "2026-09-02", "date");
});

check("an unreadable date falls back to today rather than garbage", () => {
  const [e] = importRows([{
    Date: "sometime last week", Client: "X", Title: "Y", Metric: "ADC%", Before: 1, After: 2,
  }], OPTS);
  eq(e.date, "2026-09-02", "date");
});

console.log("\n\x1b[1mThe downloadable template\x1b[0m");

const TEMPLATE = templateCsv({ today: "2026-09-02", owner: "Saloni" });

check("every column the template offers is one the parser reads", () => {
  // Each header, normalised the way the parser normalises it, must be a key it
  // actually looks for — otherwise people fill in a column that gets dropped.
  const understood = new Set([
    "date", "datelogged", "client", "industry", "usecase", "bucket", "title",
    "experiment", "experimentname", "description", "notes", "evidencenote",
    "prompt", "owner", "loggedby", "metric", "metriclabel", "before",
    "beforevalue", "after", "aftervalue", "direction",
  ]);
  const unread = TEMPLATE_COLUMNS.filter(
    (h) => !understood.has(h.toLowerCase().replace(/[^a-z]/g, ""))
  );
  eq(unread, [], "columns the parser ignores");
});

check("the template round-trips into two experiments", () => {
  const out = importRows(parseCsv(TEMPLATE), OPTS);
  eq(out.length, 2, "experiment count");
});

check("the quantitative sample row keeps every value", () => {
  const [e] = importRows(parseCsv(TEMPLATE), OPTS);
  eq(e.date, "2026-09-02", "date");
  eq(e.client, "Khatabook", "client");
  eq(e.industry, "BFSI", "industry");
  eq(e.useCase, "Pre-approved Business Loan", "useCase");
  eq(e.bucket, "Cadence", "bucket");
  eq(e.title, "Shortened retry window", "title");
  eq(e.description, "Cut retries from 3 to 1", "description");
  eq(e.owner, "Saloni", "owner");
  eq(e.metrics, [{ metric: "ADC%", qualitative: false, before: "30", after: "15" }], "metrics");
});

check("the qualitative sample row uses Direction instead of numbers", () => {
  const [, e] = importRows(parseCsv(TEMPLATE), OPTS);
  eq(e.client, "DMI", "client");
  eq(e.bucket, "Prompt", "bucket");
  eq(e.metrics[0].qualitative, true, "qualitative");
  eq(e.metrics[0].metric, "Cost per call", "metric");
  eq(e.metrics[0].direction, "better", "direction");
  eq(e.metrics[0].note, "Swapped the model to cut per-call cost", "note");
});

check("nothing typed in the template is silently dropped", () => {
  const rows = parseCsv(TEMPLATE);
  const out = importRows(rows, OPTS);
  rows.forEach((row, i) => {
    const entry = out[i];
    const flat = JSON.stringify(entry);
    for (const [header, value] of Object.entries(row)) {
      if (!value) continue;
      ok(flat.includes(value), `"${header}" = "${value}" did not survive the import`);
    }
  });
});

console.log(`\n\x1b[1m${passed} passed, ${failed} failed\x1b[0m`);
if (failures.length) {
  console.log("\nFailures:");
  for (const f of failures) console.log(`  • ${f}`);
}
console.log("");
process.exit(failed ? 1 : 0);
