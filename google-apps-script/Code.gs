/**
 * Experiment Log — Read + Append Endpoint (v5)
 * Bound to: Experiment Log - SquadStack (Live)
 *
 * Deploy as: Web app
 *   Execute as: Me
 *   Who has access: Anyone
 *   (The URL is secret on Vercel. List/append from the website use APPS_SCRIPT_TOKEN.)
 *
 * READ (for the hosted dashboard):
 *   GET ?action=list&token=YOUR_SECRET
 *   → JSON array of all experiment rows
 *
 * APPEND — browser click-to-log (unchanged):
 *   GET ?client=...&experimentName=...  (user must be signed into SquadStack Google)
 *   GET ?batch=<url-encoded JSON array>
 *
 * APPEND — from Vercel server:
 *   GET ?token=YOUR_SECRET&client=...  OR  ?token=YOUR_SECRET&batch=...
 *   POST JSON body with { "token": "...", "batch": "..." } or flat fields
 */

const SHEET_NAME = "Sheet1";
const TOKEN_PROPERTY = "APPS_SCRIPT_TOKEN";

function getCallerEmail() {
  try {
    const email = Session.getActiveUser().getEmail();
    return email || "";
  } catch (err) {
    return "";
  }
}

function getConfiguredToken_() {
  return PropertiesService.getScriptProperties().getProperty(TOKEN_PROPERTY) || "";
}

function verifyToken_(token) {
  const expected = getConfiguredToken_();
  if (!expected) {
    throw new Error(
      "APPS_SCRIPT_TOKEN is not set. Run setApiToken() once in the script editor."
    );
  }
  if (token !== expected) {
    throw new Error("Unauthorized");
  }
}

/**
 * Run this ONCE from the Apps Script editor after pasting this file:
 * 1. Set the token string below to a long random password
 * 2. Run setApiToken
 * 3. Paste the same token into Vercel as APPS_SCRIPT_TOKEN
 */
function setApiToken() {
  const token = "REPLACE-WITH-A-LONG-RANDOM-SECRET";
  PropertiesService.getScriptProperties().setProperty(TOKEN_PROPERTY, token);
  Logger.log("Token saved. Use the same value in Vercel as APPS_SCRIPT_TOKEN.");
}

function buildRow(params, loggedBy, now) {
  return [
    now,
    loggedBy,
    params.client || "",
    params.industry || "",
    params.useCase || "",
    params.bucket || "",
    params.experimentName || "",
    params.metricType || "",
    params.metricLabel || "",
    params.before !== undefined ? params.before : "",
    params.after !== undefined ? params.after : "",
    params.pctChange || "",
    params.direction || "",
    params.evidenceNote || "",
    params.endorsements || "",
    params.pinned || "",
  ];
}

function appendRows(rows) {
  const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(SHEET_NAME);
  rows.forEach(function (row) {
    sheet.appendRow(row);
  });
}

function resolveLoggedBy_(params) {
  if (params.loggedBy) return params.loggedBy;
  const email = getCallerEmail();
  if (email) return email.split("@")[0];
  return params.owner || "unknown";
}

function handleRequest(params) {
  const loggedBy = resolveLoggedBy_(params);
  const now =
    params.dateLogged ||
    Utilities.formatDate(new Date(), Session.getScriptTimeZone(), "yyyy-MM-dd HH:mm");
  let rows = [];

  if (params.batch) {
    const experiments =
      typeof params.batch === "string" ? JSON.parse(params.batch) : params.batch;
    rows = experiments.map(function (exp) {
      return buildRow(exp, exp.loggedBy || loggedBy, now);
    });
  } else {
    rows = [buildRow(params, loggedBy, now)];
  }

  appendRows(rows);
  return rows;
}

function listExperiments_() {
  const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(SHEET_NAME);
  const values = sheet.getDataRange().getValues();
  if (values.length < 2) return [];

  const rows = [];
  for (let i = 1; i < values.length; i++) {
    const row = values[i];
    if (
      !row.some(function (cell) {
        return cell !== "" && cell !== null && cell !== undefined;
      })
    ) {
      continue;
    }

    rows.push({
      dateLogged: row[0] || "",
      loggedBy: row[1] || "",
      client: row[2] || "",
      industry: row[3] || "",
      useCase: row[4] || "",
      bucket: row[5] || "",
      experimentName: row[6] || "",
      metricType: row[7] || "",
      metricLabel: row[8] || "",
      before: row[9] ?? "",
      after: row[10] ?? "",
      pctChange: row[11] ?? "",
      direction: row[12] || "",
      evidenceNote: row[13] || "",
      endorsements: row[14] ?? "",
      pinned: row[15] ?? "",
    });
  }

  return rows;
}

function jsonResponse_(payload) {
  return ContentService.createTextOutput(JSON.stringify(payload)).setMimeType(
    ContentService.MimeType.JSON
  );
}

function htmlSuccess_(rows) {
  const summaryItems = rows
    .map(function (row) {
      return (
        "<li><strong>" +
        row[6] +
        "</strong> (" +
        row[2] +
        ") — " +
        row[8] +
        ": " +
        row[9] +
        " → " +
        row[10] +
        " (" +
        row[11] +
        ")</li>"
      );
    })
    .join("");

  return HtmlService.createHtmlOutput(
    '<html><body style="font-family:Arial;padding:40px;text-align:center;">' +
      '<h2 style="color:#1a7f37;">✅ ' +
      rows.length +
      " experiment" +
      (rows.length > 1 ? "s" : "") +
      " logged</h2>" +
      '<ul style="text-align:left;display:inline-block;">' +
      summaryItems +
      "</ul>" +
      '<p style="color:#888;font-size:12px;">Logged by: ' +
      (rows[0][1] || "unknown") +
      "</p>" +
      '<p><a href="https://docs.google.com/spreadsheets/d/1rFzvgx8jP7453egcse4VjprxkG0Yp2CUB2wdcqg420w/edit" target="_blank">Open the sheet</a></p>' +
      "</body></html>"
  );
}

function doGet(e) {
  const params = e.parameter || {};

  try {
    if (params.action === "list") {
      verifyToken_(params.token);
      return jsonResponse_(listExperiments_());
    }

    if (params.token) {
      verifyToken_(params.token);
      const rows = handleRequest(params);
      return jsonResponse_({ status: "success", count: rows.length });
    }

    const rows = handleRequest(params);
    return htmlSuccess_(rows);
  } catch (err) {
    if (params.action === "list" || params.token) {
      return jsonResponse_({ status: "error", message: err.message });
    }
    return HtmlService.createHtmlOutput(
      "<h3>Error logging experiment(s)</h3><p>" + err.message + "</p>"
    );
  }
}

function doPost(e) {
  try {
    const body = JSON.parse(e.postData.contents);
    if (body.token) verifyToken_(body.token);
    const rows = handleRequest(body);
    return jsonResponse_({ status: "success", count: rows.length, rows: rows });
  } catch (err) {
    return jsonResponse_({ status: "error", message: err.message });
  }
}

function testBatchAppend() {
  const rows = handleRequest({
    batch: JSON.stringify([
      {
        client: "Khatabook",
        bucket: "Cadence",
        experimentName: "Test batch row 1 - safe to delete",
        metricType: "Quantitative",
        metricLabel: "Conversions (avg)",
        before: 5,
        after: 7,
        pctChange: "+40%",
        direction: "better",
      },
      {
        client: "Flipkart",
        bucket: "Prompt",
        experimentName: "Test batch row 2 - safe to delete",
        metricType: "Qualitative",
        metricLabel: "Call Quality",
        direction: "better",
        evidenceNote: "test",
      },
    ]),
  });
  Logger.log(rows);
}

function testListExperiments() {
  Logger.log(JSON.stringify(listExperiments_().slice(0, 3)));
}
