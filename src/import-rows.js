/**
 * Turns spreadsheet rows into experiment payloads.
 *
 * Lives outside dashboard.js so it can be tested without a browser — it is the
 * one piece of the upload path with real logic in it (header matching, grouping,
 * quantitative vs qualitative), and the only way to exercise it before was to
 * drag a file into the drawer and see what happened.
 *
 * Loaded as a plain script before dashboard.js (see app/api/dashboard/route.ts)
 * and read straight off disk by scripts/test-import.mjs.
 */
(function (root) {
  /**
   * @param rows     objects keyed by whatever the sheet's header row said
   * @param options  { today: "YYYY-MM-DD", owner: "Saloni" } — defaults for
   *                 rows that leave the date or the owner column empty
   */
  function importRows(rows, options) {
    const today = (options && options.today) || new Date().toISOString().slice(0, 10);
    const fallbackOwner = (options && options.owner) || "";
    const grouped = new Map();

    for (const raw of rows || []) {
      // Headers are matched on letters only, so "Metric label", "metric_label"
      // and "MetricLabel" are all the same column.
      const get = (...keys) => {
        for (const k of keys) {
          const hit = Object.keys(raw).find(
            (rk) => rk.toLowerCase().replace(/[^a-z]/g, "") === k
          );
          if (hit && String(raw[hit]).trim() !== "") return String(raw[hit]).trim();
        }
        return "";
      };

      const title = get("title", "experiment", "experimentname");
      const client = get("client");
      const date = get("date", "datelogged");
      if (!title && !client) continue;

      // Rows sharing a date, title and client are one experiment with several
      // metrics — which is how a sheet usually records a before/after pair.
      const key = date + "|" + title + "|" + client;
      if (!grouped.has(key)) {
        grouped.set(key, {
          date: (date || today).slice(0, 10),
          client,
          industry: get("industry"),
          useCase: get("usecase"),
          bucket: get("bucket"),
          title,
          description: get("description", "notes", "evidencenote"),
          prompt: get("prompt"),
          owner: get("owner", "loggedby") || fallbackOwner,
          metrics: [],
        });
      }

      const metric = get("metric", "metriclabel");
      if (metric) {
        const before = get("before", "beforevalue");
        const after = get("after", "aftervalue");
        grouped.get(key).metrics.push(
          before === "" && after === ""
            ? {
                metric,
                qualitative: true,
                direction: (get("direction") || "better").toLowerCase(),
                note: get("description", "notes"),
              }
            : { metric, qualitative: false, before, after }
        );
      }
    }

    // An experiment with no metric has nothing to say, so it is not imported.
    return [...grouped.values()].filter((e) => e.metrics.length);
  }

  root.FlywheelImport = { importRows: importRows };
})(typeof globalThis !== "undefined" ? globalThis : this);
