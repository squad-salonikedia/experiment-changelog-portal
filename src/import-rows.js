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
  function pad2(n) { return (n < 10 ? "0" : "") + n; }

  /**
   * Spreadsheets do not hand back the date somebody typed. Excel stores dates as
   * a day count from 1899-12-30 and SheetJS passes that straight through, so
   * "2026-09-02" arrives as 46267.229 — where the fraction is the reader's
   * timezone offset, not a time of day. Slicing the first ten characters of that
   * (which is what used to happen) produced "46267.2292", which the API could
   * not read, so it fell back to today: every uploaded row silently lost its
   * real date.
   *
   * Rounding to the nearest whole day recovers the intended date from any
   * timezone — the offset can only ever push it half a day either way. 25569 is
   * 1970-01-01 in Excel's counting.
   */
  function normaliseDate(value) {
    if (value === null || value === undefined || value === "") return "";

    if (Object.prototype.toString.call(value) === "[object Date]") {
      if (isNaN(value.getTime())) return "";
      return value.getFullYear() + "-" + pad2(value.getMonth() + 1) + "-" + pad2(value.getDate());
    }

    const text = String(value).trim();
    const iso = text.match(/^\d{4}-\d{2}-\d{2}/);
    if (iso) return iso[0];

    if (/^\d+(\.\d+)?$/.test(text)) {
      const days = Math.round(Number(text));
      // Serials outside living memory are some other number, not a date.
      if (days < 20000 || days > 80000) return "";
      const d = new Date((days - 25569) * 86400000);
      return d.getUTCFullYear() + "-" + pad2(d.getUTCMonth() + 1) + "-" + pad2(d.getUTCDate());
    }

    return "";
  }

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
      const findKey = (keys) => {
        for (const k of keys) {
          const hit = Object.keys(raw).find(
            (rk) => rk.toLowerCase().replace(/[^a-z]/g, "") === k
          );
          if (hit && String(raw[hit]).trim() !== "") return hit;
        }
        return null;
      };
      const get = (...keys) => {
        const key = findKey(keys);
        return key ? String(raw[key]).trim() : "";
      };
      // The date has to be read unstringified — see normaliseDate.
      const getRaw = (...keys) => {
        const key = findKey(keys);
        return key ? raw[key] : "";
      };

      const title = get("title", "experiment", "experimentname");
      const client = get("client");
      const date = normaliseDate(getRaw("date", "datelogged"));
      if (!title && !client) continue;

      // Rows sharing a date, title and client are one experiment with several
      // metrics — which is how a sheet usually records a before/after pair.
      const key = date + "|" + title + "|" + client;
      if (!grouped.has(key)) {
        grouped.set(key, {
          date: date || today,
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

  /**
   * The downloadable starter sheet. It lives next to the parser deliberately —
   * when the two drift, people fill in a template whose columns are quietly
   * ignored, and the upload silently drops what they typed.
   *
   * Row 1 is a quantitative experiment, row 2 a qualitative one (no before or
   * after, so Direction carries the result instead).
   */
  var TEMPLATE_COLUMNS = [
    "Date", "Client", "Industry", "Use case", "Bucket", "Title",
    "Description", "Prompt", "Metric", "Before", "After", "Direction", "Owner",
  ];

  function templateCsv(options) {
    const today = (options && options.today) || new Date().toISOString().slice(0, 10);
    const owner = (options && options.owner) || "Saloni";
    const rows = [
      [today, "Khatabook", "BFSI", "Pre-approved Business Loan", "Cadence",
       "Shortened retry window", "Cut retries from 3 to 1", "", "ADC%", "30", "15", "", owner],
      [today, "DMI", "BFSI", "PA-PL", "Prompt",
       "Moved to a cheaper model", "Swapped the model to cut per-call cost", "",
       "Cost per call", "", "", "better", owner],
    ];
    return [TEMPLATE_COLUMNS.join(",")]
      .concat(rows.map((r) => r.join(",")))
      .join("\n") + "\n";
  }

  root.FlywheelImport = {
    importRows: importRows,
    normaliseDate: normaliseDate,
    templateCsv: templateCsv,
    TEMPLATE_COLUMNS: TEMPLATE_COLUMNS,
  };
})(typeof globalThis !== "undefined" ? globalThis : this);
