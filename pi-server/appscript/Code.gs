/**
 * Finance Tracker — automation + Gullak Capture endpoint.
 *
 * Paste this as the project's Code.gs (replaces the old version). Then:
 *   - Menu "Gullak" → "Enable auto-refresh on edit" (installs the debounced
 *     onEdit trigger; authorize once).
 *   - Deploy → New deployment → Web app (Execute as: Me, Access: Anyone) for
 *     the capture endpoint; put the /exec URL + GULLAK_SECRET into the app.
 *
 * Key changes vs the old script:
 *   - onEdit no longer rebuilds the whole year on every keystroke: it's a
 *     debounced installable trigger that repaints only the EDITED month.
 *   - onOpen is lazy (adds a menu; no heavy rebuild on open).
 *   - Empty-tracker guards, `if (!e) return`, dead-code/shadowing removed,
 *     timezone hoisted, column-width over-set fixed, score formatting set once,
 *     future dates not painted green.
 */

const SHEETS = {
  TRACKER: "Daily Expense Tracker",
  SETUP: "Setup",
  CALC: "Calc",
  MONTHLY: "Monthly Analysis",
  WEEKLY: "Weekly Analysis",
  CALENDAR: "Yearly Calendar",
};

// All RGB triples (consistent).
const COLORS = {
  GREEN: [183, 225, 205],
  YELLOW: [255, 242, 204],
  ORANGE: [251, 188, 4],
  RED: [234, 67, 53],
  FUTURE: [243, 243, 243],
};

const DEBOUNCE_MS = 4000;

// ---- Gullak Capture endpoint ----
// The shared secret authenticating inbound pushes from the Gullak sync server.
// NEVER hardcode it. Set it in the Apps Script editor: Project Settings →
// Script properties → add `GULLAK_SECRET`. It must match the server's
// GULLAK_SHEETS_SECRET. If it ever leaks, rotate both together.
const GULLAK_SECRET =
  PropertiesService.getScriptProperties().getProperty("GULLAK_SECRET") || "";
const GULLAK_ID_COL = 8; // hidden gullak_id column (H)

// =====================================================================
// Triggers / menu
// =====================================================================

function onOpen() {
  SpreadsheetApp.getUi()
    .createMenu("Gullak")
    .addItem("Refresh Yearly Calendar", "menuRefreshCalendar")
    .addItem("Refresh Analysis", "menuRefreshAnalysis")
    .addSeparator()
    .addItem("Enable auto-refresh on edit", "installEditTrigger")
    .addToUi();
}

function menuRefreshCalendar() {
  buildYearlyCalendar();
}
function menuRefreshAnalysis() {
  calculateMonthlyScore();
  buildWeeklyAnalysis();
}

/** One-time: install the debounced onEdit trigger (simple onEdit can't be debounced safely). */
function installEditTrigger() {
  const existing = ScriptApp.getProjectTriggers().filter(function (t) {
    return t.getHandlerFunction() === "handleEdit";
  });
  existing.forEach(function (t) {
    ScriptApp.deleteTrigger(t);
  });
  ScriptApp.newTrigger("handleEdit")
    .forSpreadsheet(SpreadsheetApp.getActive())
    .onEdit()
    .create();
  SpreadsheetApp.getActive().toast("Auto-refresh enabled.");
}

function handleEdit(e) {
  if (!e || !e.range) return;
  const name = e.range.getSheet().getName();

  if (name === SHEETS.TRACKER) {
    debounce("cal", function () {
      repaintEditedMonth(e);
    });
    return;
  }
  if (name === SHEETS.SETUP) {
    debounce("cal", function () {
      buildYearlyCalendar();
    });
    return;
  }
  if (name === SHEETS.MONTHLY) {
    const cell = e.range.getA1Notation();
    if (cell === "A2" || cell === "B2") calculateMonthlyScore();
    buildWeeklyAnalysis();
    return;
  }
  if (name === SHEETS.WEEKLY) {
    if (e.range.getA1Notation() === "B1") handleWeeklyModeUI();
    buildWeeklyAnalysis();
  }
}

/** Skip if the same key ran < DEBOUNCE_MS ago; serialize with a lock. */
function debounce(key, fn) {
  const props = PropertiesService.getDocumentProperties();
  const propKey = "lastRun_" + key;
  const now = Date.now();
  if (now - Number(props.getProperty(propKey) || 0) < DEBOUNCE_MS) return;
  props.setProperty(propKey, String(now));
  const lock = LockService.getDocumentLock();
  if (!lock.tryLock(1500)) return;
  try {
    fn();
  } finally {
    lock.releaseLock();
  }
}

// =====================================================================
// Yearly calendar
// =====================================================================

function monthLayout(year) {
  let col = 2;
  const layout = [];
  for (let m = 0; m < 12; m++) {
    const startDay = (new Date(year, m, 1).getDay() + 6) % 7; // Mon=0
    const days = new Date(year, m + 1, 0).getDate();
    const weeks = Math.ceil((startDay + days) / 7);
    layout.push({
      startCol: col,
      weeks: weeks,
      startDay: startDay,
      days: days,
    });
    col += weeks + 1;
  }
  return { layout: layout, lastCol: col - 1 };
}

function ensureCalendarLayout(year) {
  const ss = SpreadsheetApp.getActive();
  let sheet = ss.getSheetByName(SHEETS.CALENDAR);
  if (!sheet) sheet = ss.insertSheet(SHEETS.CALENDAR);

  if (
    Number(PropertiesService.getDocumentProperties().getProperty("calYear")) ===
    year
  ) {
    return sheet; // layout already built for this year
  }

  sheet.clear();
  sheet.clearNotes();
  sheet
    .getRange("A1")
    .setValue("Year: " + year)
    .setFontSize(14)
    .setFontWeight("bold");
  ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"].forEach(function (d, i) {
    sheet.getRange(5 + i, 1).setValue(d);
  });

  const tz = ss.getSpreadsheetTimeZone();
  const ml = monthLayout(year);
  ml.layout.forEach(function (mo, m) {
    const name = Utilities.formatDate(new Date(year, m, 1), tz, "MMM");
    sheet.getRange(3, mo.startCol).setValue(name);
  });
  sheet.setRowHeights(5, 7, 18);
  sheet.setColumnWidth(1, 50);
  sheet.setColumnWidths(2, ml.lastCol - 1, 18); // actual count, not the next-start
  PropertiesService.getDocumentProperties().setProperty(
    "calYear",
    String(year),
  );
  return sheet;
}

function spendMapAndStats(tracker, tz) {
  const map = {};
  const lastRow = tracker.getLastRow();
  if (lastRow > 1) {
    tracker
      .getRange(2, 1, lastRow - 1, 7)
      .getValues()
      .forEach(function (row) {
        const date = row[0];
        const type = row[5]; // Need / Want / Saving (col F)
        if (!(date instanceof Date)) return;
        if (type !== "Need" && type !== "Want") return;
        const key = Utilities.formatDate(date, tz, "yyyy-MM-dd");
        map[key] = (map[key] || 0) + Number(row[3] || 0);
      });
  }
  const spends = Object.values(map).filter(function (v) {
    return v > 0;
  });
  const avg = spends.length
    ? spends.reduce(function (a, b) {
        return a + b;
      }, 0) / spends.length
    : 0;
  return {
    map: map,
    avg: avg,
    min: spends.length ? Math.min.apply(null, spends) : 0,
    max: spends.length ? Math.max.apply(null, spends) : 0,
  };
}

function dayColor(spend, s) {
  if (spend <= 0) return COLORS.GREEN;
  if (spend <= s.avg) {
    return interpolate(
      COLORS.YELLOW,
      COLORS.ORANGE,
      (spend - s.min) / Math.max(s.avg - s.min, 1),
    );
  }
  return interpolate(
    COLORS.ORANGE,
    COLORS.RED,
    (spend - s.avg) / Math.max(s.max - s.avg, 1),
  );
}

function paintMonth(sheet, year, m, mo, s, tz, todayKey) {
  const bg = Array.from({ length: 7 }, function () {
    return Array(mo.weeks).fill(null);
  });
  const notes = Array.from({ length: 7 }, function () {
    return Array(mo.weeks).fill("");
  });
  for (let d = 1; d <= mo.days; d++) {
    const dayIdx = (mo.startDay + d - 1) % 7;
    const weekIdx = Math.floor((mo.startDay + d - 1) / 7);
    const dateObj = new Date(year, m, d);
    const key = Utilities.formatDate(dateObj, tz, "yyyy-MM-dd");
    if (key > todayKey) {
      bg[dayIdx][weekIdx] = rgb(COLORS.FUTURE); // don't paint the future green
      continue;
    }
    const spend = s.map[key] || 0;
    bg[dayIdx][weekIdx] = rgb(dayColor(spend, s));
    notes[dayIdx][weekIdx] =
      Utilities.formatDate(dateObj, tz, "dd MMM yyyy") + "\nSpend: ₹" + spend;
  }
  sheet
    .getRange(5, mo.startCol, 7, mo.weeks)
    .setBackgrounds(bg)
    .setNotes(notes);
}

function buildYearlyCalendar() {
  const ss = SpreadsheetApp.getActive();
  const tracker = ss.getSheetByName(SHEETS.TRACKER);
  if (!tracker) return;
  const tz = ss.getSpreadsheetTimeZone();
  const year = new Date().getFullYear();
  const sheet = ensureCalendarLayout(year);
  const s = spendMapAndStats(tracker, tz);
  const todayKey = Utilities.formatDate(new Date(), tz, "yyyy-MM-dd");
  const ml = monthLayout(year);
  ml.layout.forEach(function (mo, m) {
    paintMonth(sheet, year, m, mo, s, tz, todayKey);
  });
  stampUpdated(sheet, tz);
}

/** Repaint only the month of the edited row's date. */
function repaintEditedMonth(e) {
  const ss = SpreadsheetApp.getActive();
  const tracker = ss.getSheetByName(SHEETS.TRACKER);
  if (!tracker) return;
  const tz = ss.getSpreadsheetTimeZone();
  const year = new Date().getFullYear();

  const editedDate = tracker.getRange(e.range.getRow(), 1).getValue();
  if (!(editedDate instanceof Date) || editedDate.getFullYear() !== year) {
    buildYearlyCalendar(); // can't localize — fall back to full
    return;
  }
  const sheet = ensureCalendarLayout(year);
  const s = spendMapAndStats(tracker, tz);
  const todayKey = Utilities.formatDate(new Date(), tz, "yyyy-MM-dd");
  const mo = monthLayout(year).layout[editedDate.getMonth()];
  paintMonth(sheet, year, editedDate.getMonth(), mo, s, tz, todayKey);
  stampUpdated(sheet, tz);
}

function stampUpdated(sheet, tz) {
  sheet
    .getRange("A2")
    .setValue("Last updated: " + Utilities.formatDate(new Date(), tz, "HH:mm"))
    .setFontSize(8)
    .setFontStyle("normal");
}

function interpolate(c1, c2, f) {
  return [
    Math.round(c1[0] + f * (c2[0] - c1[0])),
    Math.round(c1[1] + f * (c2[1] - c1[1])),
    Math.round(c1[2] + f * (c2[2] - c1[2])),
  ];
}
function rgb(c) {
  return "rgb(" + c[0] + "," + c[1] + "," + c[2] + ")";
}

// =====================================================================
// Monthly score
// =====================================================================

function calculateMonthlyScore() {
  const ss = SpreadsheetApp.getActive();
  const calc = ss.getSheetByName(SHEETS.CALC);
  const analysis = ss.getSheetByName(SHEETS.MONTHLY);
  if (!calc || !analysis) return;

  let need = 0,
    want = 0,
    saving = 0;
  calc
    .getRange("G2:I4")
    .getValues()
    .forEach(function (row) {
      const budget = Number(row[1]);
      const actual = Number(row[2]);
      if (!budget || !actual) return;
      if (row[0] === "Need") need = Math.min(10, (budget / actual) * 10);
      if (row[0] === "Want") want = Math.min(10, (budget / actual) * 10);
      if (row[0] === "Saving") saving = Math.min(10, (actual / budget) * 10);
    });

  const score = need * 0.4 + want * 0.3 + saving * 0.3;
  analysis.getRange("J2").setValue(Math.round(score * 100) / 100);
  ensureScoreFormatting();
}

/** Conditional rules never change — set once (guarded by a doc property). */
function ensureScoreFormatting() {
  const props = PropertiesService.getDocumentProperties();
  if (props.getProperty("scoreFmtDone") === "1") return;
  const sheet = SpreadsheetApp.getActive().getSheetByName(SHEETS.MONTHLY);
  if (!sheet) return;
  const range = sheet.getRange("J2");
  const kept = sheet.getConditionalFormatRules().filter(function (r) {
    return !r.getRanges().some(function (x) {
      return x.getA1Notation() === "J2";
    });
  });
  const mk = function (build) {
    return build.setRanges([range]).build();
  };
  sheet.setConditionalFormatRules(
    kept.concat([
      mk(
        SpreadsheetApp.newConditionalFormatRule()
          .whenNumberGreaterThan(8)
          .setBackground("#b7e1cd")
          .setFontColor("#000000"),
      ),
      mk(
        SpreadsheetApp.newConditionalFormatRule()
          .whenNumberBetween(7, 7.99)
          .setBackground("#fff2cc")
          .setFontColor("#000000"),
      ),
      mk(
        SpreadsheetApp.newConditionalFormatRule()
          .whenNumberLessThan(7)
          .setBackground("#f4c7c3")
          .setFontColor("#000000"),
      ),
    ]),
  );
  props.setProperty("scoreFmtDone", "1");
}

// =====================================================================
// Weekly analysis
// =====================================================================

function buildWeeklyAnalysis() {
  const ss = SpreadsheetApp.getActive();
  const tracker = ss.getSheetByName(SHEETS.TRACKER);
  const weekly = ss.getSheetByName(SHEETS.WEEKLY);
  const monthly = ss.getSheetByName(SHEETS.MONTHLY);
  const setup = ss.getSheetByName(SHEETS.SETUP);
  if (!tracker || !weekly || !monthly || !setup) return;

  const tz = ss.getSpreadsheetTimeZone(); // hoisted (was called per-row/day)
  const year = Number(monthly.getRange("B2").getValue());
  if (!year) return;
  const weeklyLimit = Number(setup.getRange("A21").getValue());

  const mode = weekly.getRange("B1").getValue();
  const selectedCategory = weekly.getRange("B5").getValue();
  const selectedPayment = weekly.getRange("B6").getValue();
  const months = [
    "Jan",
    "Feb",
    "Mar",
    "Apr",
    "May",
    "Jun",
    "Jul",
    "Aug",
    "Sep",
    "Oct",
    "Nov",
    "Dec",
  ];

  let startMonth, endMonth;
  if (mode === "Quarter") {
    const q = { Q1: [0, 2], Q2: [3, 5], Q3: [6, 8], Q4: [9, 11] };
    const sel = q[weekly.getRange("B2").getValue()] || [0, 2];
    startMonth = sel[0];
    endMonth = sel[1];
  } else {
    let endName = weekly.getRange("B4").getValue();
    const startName = weekly.getRange("B3").getValue();
    if (!endName) {
      endName = startName;
      weekly.getRange("B4").setValue(endName);
    }
    startMonth = months.indexOf(startName);
    endMonth = months.indexOf(endName);
    if (startMonth > endMonth) {
      const t = startMonth;
      startMonth = endMonth;
      endMonth = t;
      weekly.getRange("B3").setValue(months[startMonth]);
      weekly.getRange("B4").setValue(months[endMonth]);
      weekly
        .getRange("A8")
        .setValue("ℹ️ Start & End months auto-corrected")
        .setFontSize(9);
    } else {
      weekly.getRange("A8").clearContent();
    }
  }

  const startDate = new Date(year, startMonth, 1);
  const endDate = new Date(year, endMonth + 1, 0);
  const day = startDate.getDay();
  startDate.setDate(startDate.getDate() + (day === 0 ? -6 : 1 - day)); // back to Monday

  // Spend map (guarded for empty tracker).
  const spendMap = {};
  const lastRow = tracker.getLastRow();
  if (lastRow > 1) {
    tracker
      .getRange(2, 1, lastRow - 1, 7)
      .getValues()
      .forEach(function (row) {
        const date = row[0];
        if (!(date instanceof Date)) return;
        if (selectedCategory !== "All" && row[5] !== selectedCategory) return;
        if (selectedPayment !== "All" && row[4] !== selectedPayment) return;
        const key = Utilities.formatDate(date, tz, "yyyy-MM-dd");
        spendMap[key] = (spendMap[key] || 0) + Number(row[3] || 0);
      });
  }

  const weeks = [];
  const cur = new Date(startDate);
  while (cur <= endDate) {
    const wStart = new Date(cur);
    const wEnd = new Date(cur);
    wEnd.setDate(wEnd.getDate() + 6);
    let total = 0;
    for (let i = 0; i < 7; i++) {
      const d = new Date(wStart);
      d.setDate(d.getDate() + i);
      total += spendMap[Utilities.formatDate(d, tz, "yyyy-MM-dd")] || 0;
    }
    weeks.push([
      Utilities.formatDate(wStart, tz, "dd MMM"),
      Utilities.formatDate(wEnd, tz, "dd MMM"),
      total,
      weeklyLimit,
      weeklyLimit ? Math.round((total / weeklyLimit) * 100) : 0,
    ]);
    cur.setDate(cur.getDate() + 7);
  }

  weekly.getRange("D1:H100").clearContent();
  weekly
    .getRange("D1:H1")
    .setValues([["Week Start", "Week End", "Spend", "Limit", "Ratio"]]);
  if (weeks.length > 0) {
    weekly.getRange(2, 4, weeks.length, 5).setValues(weeks);
    const colors = weeks.map(function (r) {
      const p = r[4];
      return [p <= 70 ? "#b7e1cd" : p <= 100 ? "#fff2cc" : "#f4c7c3"];
    });
    weekly.getRange(2, 8, Math.max(weeks.length, 50), 1).setBackground(null);
    weekly
      .getRange(2, 8, weeks.length, 1)
      .setBackgrounds(colors)
      .setNumberFormat('0"%"');
  }
  weekly.hideColumns(4, 5);
}

function handleWeeklyModeUI() {
  const ss = SpreadsheetApp.getActive();
  const sheet = ss.getSheetByName(SHEETS.WEEKLY);
  if (!sheet) return;
  const mode = sheet.getRange("B1").getValue();
  const quarterCell = sheet.getRange("B2");
  const startCell = sheet.getRange("B3");
  const endCell = sheet.getRange("B4");
  const months = [
    "Jan",
    "Feb",
    "Mar",
    "Apr",
    "May",
    "Jun",
    "Jul",
    "Aug",
    "Sep",
    "Oct",
    "Nov",
    "Dec",
  ];
  const now = new Date();
  const monthIdx = now.getMonth();

  if (mode === "Quarter") {
    quarterCell.setDataValidation(
      SpreadsheetApp.newDataValidation()
        .requireValueInList(["Q1", "Q2", "Q3", "Q4"])
        .build(),
    );
    quarterCell
      .setBackground("#ffffff")
      .setValue("Q" + (Math.floor(monthIdx / 3) + 1));
    [startCell, endCell].forEach(function (c) {
      c.clearContent();
      c.clearDataValidations();
      c.setBackground("#eeeeee");
    });
  } else if (mode === "Custom") {
    const rule = SpreadsheetApp.newDataValidation()
      .requireValueInList(months)
      .build();
    startCell
      .setDataValidation(rule)
      .setBackground("#ffffff")
      .setValue(months[monthIdx]);
    endCell
      .setDataValidation(rule)
      .setBackground("#ffffff")
      .setValue(months[monthIdx]);
    quarterCell.clearContent();
    quarterCell.clearDataValidations();
    quarterCell.setBackground("#eeeeee");
  }

  const setup = ss.getSheetByName(SHEETS.SETUP);
  const payments = ["All"].concat(
    setup.getRange("D11:D20").getValues().flat().filter(Boolean),
  );
  const paymentCell = sheet.getRange("B6");
  paymentCell.setDataValidation(
    SpreadsheetApp.newDataValidation().requireValueInList(payments).build(),
  );
  if (!paymentCell.getValue()) paymentCell.setValue("All");
}

// =====================================================================
// Gullak Capture web-app endpoint
// =====================================================================

// Columns whose in-sheet value must NOT be clobbered by a blank incoming
// value (0-indexed): Category(2), Type(5), Notes(6), Tags(8). This lets the
// user fill an uncategorised row's Category (or add Tags/Notes) directly in the
// sheet without the next Gullak upsert blanking it back out.
const PRESERVE_COLS = [2, 5, 6, 8];

function doPost(e) {
  const lock = LockService.getDocumentLock();
  // Serialise concurrent posts so two overlapping syncs can't both miss an id
  // and append the same row twice.
  lock.waitLock(30000);
  try {
    const body = JSON.parse(e.postData.contents);
    if (body.secret !== GULLAK_SECRET)
      return gullakJson({ error: "unauthorized" });

    const ss = SpreadsheetApp.getActive();
    const sheet = ss.getSheetByName(SHEETS.TRACKER);
    if (!sheet) return gullakJson({ error: "tab not found" });
    const lastCol = sheet.getLastColumn();

    // replace = "replace the Gullak-owned rows", NOT "wipe the tracker". Rows
    // with a blank gullak_id are hand-entered (e.g. cash trips) and are
    // preserved: keep them, clear the rest, rewrite the manual ones at the top.
    if (body.replace === true) {
      const lr = sheet.getLastRow();
      if (lr > 1) {
        const all = sheet.getRange(2, 1, lr - 1, lastCol).getValues();
        const manual = all.filter(function (row) {
          return !row[GULLAK_ID_COL - 1];
        });
        sheet.getRange(2, 1, lr - 1, lastCol).clearContent();
        if (manual.length > 0)
          sheet.getRange(2, 1, manual.length, lastCol).setValues(manual);
      }
    }

    // Map existing gullak_id -> sheet row (and keep the existing row values so
    // we can preserve in-sheet edits on update).
    const lastRow = sheet.getLastRow();
    const idToRow = {};
    const existingById = {};
    if (lastRow > 1) {
      const data = sheet.getRange(2, 1, lastRow - 1, lastCol).getValues();
      for (let i = 0; i < data.length; i++) {
        const id = data[i][GULLAK_ID_COL - 1];
        if (id) {
          idToRow[id] = i + 2;
          existingById[id] = data[i];
        }
      }
    }

    const typeMap = {};
    const setup = ss.getSheetByName(SHEETS.SETUP);
    if (setup) {
      setup
        .getRange("A11:B20")
        .getValues()
        .forEach(function (r) {
          if (r[0]) typeMap[String(r[0]).trim()] = r[1];
        });
    }

    const toAppend = [];
    let updated = 0;
    (body.rows || []).forEach(function (r) {
      r[3] = Number(r[3]) || r[3];
      if (!r[5]) r[5] = typeMap[String(r[2]).trim()] || "";
      const id = r[GULLAK_ID_COL - 1];
      const rowNum = id ? idToRow[id] : null;
      if (rowNum && rowNum > 0) {
        const prev = existingById[id] || [];
        // Don't let a blank incoming Category/Type/Notes/Tags overwrite an
        // edit the user made in the sheet.
        for (let k = 0; k < PRESERVE_COLS.length; k++) {
          const c = PRESERVE_COLS[k];
          if ((r[c] === "" || r[c] == null) && prev[c]) r[c] = prev[c];
        }
        sheet.getRange(rowNum, 1, 1, r.length).setValues([r]); // update in place
        updated += 1;
      } else if (rowNum !== -1) {
        toAppend.push(r);
        if (id) idToRow[id] = -1; // guard against a dup id within this batch
      }
    });

    if (toAppend.length > 0) {
      sheet
        .getRange(
          sheet.getLastRow() + 1,
          1,
          toAppend.length,
          toAppend[0].length,
        )
        .setValues(toAppend);
    }
    if (toAppend.length > 0 || updated > 0) {
      // Keep the tracker chronological: sort all data rows by Date (col A) so
      // newly-appended rows don't pile up out of order at the bottom.
      const sortRows = sheet.getLastRow() - 1;
      if (sortRows > 1)
        sheet
          .getRange(2, 1, sortRows, sheet.getLastColumn())
          .sort({ column: 1, ascending: true });
      // onEdit doesn't fire on programmatic writes — refresh views directly.
      try {
        buildYearlyCalendar();
      } catch (_) {}
      try {
        calculateMonthlyScore();
      } catch (_) {}
      try {
        buildWeeklyAnalysis();
      } catch (_) {}
    }
    return gullakJson({ appended: toAppend.length, updated: updated });
  } catch (err) {
    return gullakJson({ error: String(err) });
  } finally {
    lock.releaseLock();
  }
}

function gullakJson(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(
    ContentService.MimeType.JSON,
  );
}
