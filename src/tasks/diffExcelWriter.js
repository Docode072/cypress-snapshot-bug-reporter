"use strict";

const fs = require("fs");
const XlsxPopulate = require("xlsx-populate");
const { ensureDir } = require("./imageUtils");

// ---------------------------------------------------------------------------
// Styling constants
// ---------------------------------------------------------------------------

const SEVERITY_BADGE_COLOR = {
  Critical: "FF4444",
  High: "FF8800",
  Medium: "FFCC00",
  Low: "5CB85C",
};

const SEVERITY_ROW_COLOR = {
  Critical: "FFCCCC",
  High: "FFE8CC",
  Medium: "FFFACC",
  Low: "E8F5E9",
};

const CHANGE_TYPE_COLOR = {
  value_changed: "FFF3CD", // soft yellow
  added: "D4EDDA", // soft green
  removed: "F8D7DA", // soft red
  color_changed: "E2D9F3", // soft purple
  header_changed: "CCE5FF", // soft blue
  format_changed: "D1ECF1", // soft cyan
  no_change: "FFFFFF",
};

const HEADER_COLOR = "1A3C6E";
const HEADER_FONT = "FFFFFF";

// ---------------------------------------------------------------------------
// Column definitions
// ---------------------------------------------------------------------------

const COLUMNS = [
  { header: "Severity", width: 12 },
  { header: "Snapshot Name", width: 40 },
  { header: "Content Type", width: 14 },
  { header: "Location Path", width: 65 }, // Merged Section > Table Name > Row > Column
  { header: "Baseline Value", width: 35 },
  { header: "Actual Value", width: 35 },
  { header: "Change Type", width: 18 },
  { header: "Change Summary", width: 65 },
  { header: "All Changes", width: 80 },
  { header: "AI Confidence", width: 14 },
  { header: "Analysis Source", width: 20 },
  { header: "Run Date", width: 22 },
];

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Build a human-readable location path string from the AI's locationHierarchy.
 * Format: "Section > Table Name > Row N (Label) > Col N (Header)"
 */
function buildLocationPath(loc) {
  if (!loc) return "—";
  const parts = [];

  if (loc.section) parts.push(loc.section);
  if (loc.tableName) parts.push(loc.tableName);

  if (loc.row) {
    const r = loc.row;
    parts.push(r.label ? `Row ${r.index} (${r.label})` : `Row ${r.index}`);
  }

  if (loc.column) {
    const c = loc.column;
    parts.push(c.header ? `Col ${c.index} (${c.header})` : `Col ${c.index}`);
  }

  // Non-table types: element & position
  if (loc.element) parts.push(loc.element);
  if (loc.position) parts.push(loc.position);

  return parts.length > 0 ? parts.join(" > ") : "—";
}

/**
 * Format the allChanges array into a readable multi-line string.
 */
function formatAllChanges(changes) {
  if (!Array.isArray(changes) || changes.length === 0) return "—";
  return changes
    .map((c) => `[${c.changeType}] ${c.path}: "${c.baseline}" → "${c.actual}"`)
    .join("\n");
}

function safeConfidence(val) {
  if (typeof val === "number") return `${(val * 100).toFixed(1)}%`;
  if (typeof val === "string") return val;
  return "—";
}

// ---------------------------------------------------------------------------
// Sheet initialisation
// ---------------------------------------------------------------------------

function initSheet(workbook) {
  let sheet = workbook.sheet("Diff Report");
  if (sheet) return sheet;

  sheet = workbook.addSheet("Diff Report");
  const defaultSheet = workbook.sheet("Sheet1");
  if (defaultSheet && defaultSheet.name() !== "Diff Report") {
    workbook.deleteSheet(defaultSheet.name());
  }

  COLUMNS.forEach((col, idx) => {
    const c = idx + 1;
    sheet.cell(1, c).value(col.header).style({
      bold: true,
      fontColor: HEADER_FONT,
      fill: HEADER_COLOR,
      horizontalAlignment: "center",
      verticalAlignment: "center",
      wrapText: true,
    });
    sheet.column(c).width(col.width);
  });

  return sheet;
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Append AI analysis results for one snapshot to the Excel report.
 */
async function writeAnalysisToExcel(
  snapshotName,
  analysisResults,
  severity,
  excelFile,
  source = "ai",
) {
  ensureDir(excelFile);

  const workbook = fs.existsSync(excelFile)
    ? await XlsxPopulate.fromFileAsync(excelFile)
    : await XlsxPopulate.fromBlankAsync();

  const sheet = initSheet(workbook);

  const usedRange = sheet.usedRange();
  let rowNum = usedRange ? usedRange.endCell().rowNumber() + 1 : 2;
  if (rowNum < 2) rowNum = 2;

  const date = new Date().toLocaleString("en-GB");
  const rowBgColor = SEVERITY_ROW_COLOR[severity] || "FFFFFF";
  const badgeColor = SEVERITY_BADGE_COLOR[severity] || "AAAAAA";

  for (const r of analysisResults) {
    const loc = r.locationHierarchy || {};
    const locationPath = buildLocationPath(loc);

    const values = [
      severity, // 1  Severity
      snapshotName, // 2  Snapshot Name
      r.contentType || "Unknown", // 3  Content Type
      locationPath, // 4  Location Path (Merged: Section > Table Name > Row > Column)
      r.baselineValue || "(none)", // 5  Baseline Value
      r.actualValue || "(none)", // 6  Actual Value
      r.changeType || "—", // 7  Change Type
      r.changeSummary || "—", // 8  Change Summary
      formatAllChanges(r.allChanges), // 9  All Changes
      safeConfidence(r.confidence), // 10 AI Confidence
      source, // 11 Analysis Source
      date, // 12 Run Date
    ];

    // Apply base row style
    values.forEach((value, idx) => {
      sheet
        .cell(rowNum, idx + 1)
        .value(value)
        .style({
          wrapText: true,
          verticalAlignment: "top",
          fill: rowBgColor,
        });
    });

    // Severity badge (col 1)
    sheet.cell(rowNum, 1).style({
      bold: true,
      fill: badgeColor,
      fontColor: "FFFFFF",
      horizontalAlignment: "center",
      verticalAlignment: "center",
    });

    // Change type colour (col 7)
    const ctColor = CHANGE_TYPE_COLOR[r.changeType] || rowBgColor;
    sheet.cell(rowNum, 7).style({ fill: ctColor });

    // Highlight low-confidence rows (cols 5, 6, 10)
    const confNum = typeof r.confidence === "number" ? r.confidence : 1;
    if (confNum < 0.6) {
      [5, 6, 10].forEach((col) =>
        sheet.cell(rowNum, col).style({ fill: "FFF2CC" }),
      );
    }

    rowNum += 1;
  }

  sheet.freezePanes(2, 1);
  await workbook.toFileAsync(excelFile);
  return excelFile;
}

module.exports = { writeAnalysisToExcel, COLUMNS };
