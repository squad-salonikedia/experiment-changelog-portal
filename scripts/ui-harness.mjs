/**
 * Builds a standalone copy of the dashboard that runs against a fake API.
 *
 *   node scripts/ui-harness.mjs && open .ui-harness.html
 *
 * It inlines the live src/dashboard.{html,css,js}, so what you click is the real
 * client code — but every request is answered by scripts/harness/fake-api.js
 * instead of the server. That means no login, no database, and no test rows in
 * the shared changelog: useful for checking a UI change (a drawer, the detail
 * sheet, delete/edit/comment flows) before it goes anywhere near production.
 *
 * The page records what it did, for assertions from the console or a driver:
 *   window.__calls   — every request the dashboard made, in order
 *   window.__errors  — uncaught errors, which should stay empty
 *
 * For the server side of the same features, use scripts/smoke-test.mjs.
 */
import { readFileSync, writeFileSync } from "fs";
import { fileURLToPath } from "url";
import path from "path";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const read = (p) => readFileSync(path.join(root, p), "utf8");

const out = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>Flywheel — UI harness (fake API)</title>
<style>${read("src/dashboard.css")}</style>
</head>
<body>
${read("src/dashboard.html")}
<script>
${read("scripts/harness/fake-api.js")}
</script>
<script>${read("src/import-rows.js")}</script>
<script>${read("src/dashboard.js")}</script>
</body>
</html>`;

const target = path.join(root, ".ui-harness.html");
writeFileSync(target, out);
console.log(`Built ${path.relative(root, target)} — open it in a browser.`);
console.log("Everything is stubbed: nothing it does reaches the database.");
