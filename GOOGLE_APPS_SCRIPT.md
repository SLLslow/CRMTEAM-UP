# Google Apps Script для прийому даних

1. Створи Google таблицю.
2. Відкрий `Extensions -> Apps Script`.
3. Встав цей код у `Code.gs`.
4. У `SPREADSHEET_ID` вкажи ID таблиці.
5. За потреби вкажи `WEBHOOK_SECRET`.
6. `Deploy -> New deployment -> Web app`:
   - Execute as: `Me`
   - Who has access: `Anyone with the link`
7. Скопіюй `Web app URL` у поле застосунку `Google Apps Script Web App URL`.

```javascript
const SPREADSHEET_ID = "PUT_YOUR_SPREADSHEET_ID_HERE";
const WEBHOOK_SECRET = ""; // Опційно: той самий секрет, що у застосунку.

function doPost(e) {
  try {
    const payload = JSON.parse(e.postData.contents || "{}");
    if (WEBHOOK_SECRET && payload.secret !== WEBHOOK_SECRET) {
      return jsonResponse({ ok: false, error: "unauthorized" }, 401);
    }

    const ss = SpreadsheetApp.openById(SPREADSHEET_ID);
    writeAnalytics(ss, payload.analytics || [], payload.generatedAt || "", payload.period || {});
    writeAgreements(ss, payload.agreements || []);
    writeClients(ss, payload.clients || []);

    return jsonResponse({ ok: true });
  } catch (error) {
    return jsonResponse({ ok: false, error: String(error) }, 500);
  }
}

function writeAnalytics(ss, rows, generatedAt, period) {
  const sheet = getOrCreateSheet(ss, "Analytics");
  sheet.clearContents();
  sheet.getRange(1, 1, 1, 2).setValues([["Metric", "Value"]]);

  if (rows.length > 0) {
    const values = rows.map(r => [r.metric || "", r.value || ""]);
    sheet.getRange(2, 1, values.length, 2).setValues(values);
  }

  const infoStart = rows.length + 4;
  sheet.getRange(infoStart, 1, 1, 2).setValues([["Generated At", generatedAt]]);
  sheet.getRange(infoStart + 1, 1, 1, 2).setValues([["Period", `${period.from || ""} .. ${period.to || ""}`]]);
  styleHeader(sheet, "A1:B1");
  sheet.autoResizeColumns(1, 2);
}

function writeAgreements(ss, rows) {
  const sheet = getOrCreateSheet(ss, "Agreements");
  sheet.clearContents();
  const headers = [["ID", "Title", "Created At", "Updated At", "Total", "Result", "Manager", "Stage", "Source"]];
  sheet.getRange(1, 1, 1, headers[0].length).setValues(headers);
  styleHeader(sheet, "A1:I1");

  if (rows.length > 0) {
    const values = rows.map(r => [
      r.id || "",
      r.title || "",
      r.createdAt || "",
      r.updatedAt || "",
      r.total || 0,
      r.result || "",
      r.manager || "",
      r.stage || "",
      r.source || ""
    ]);
    sheet.getRange(2, 1, values.length, headers[0].length).setValues(values);
  }
  sheet.autoResizeColumns(1, headers[0].length);
}

function writeClients(ss, rows) {
  const sheet = getOrCreateSheet(ss, "Clients");
  sheet.clearContents();
  const headers = [["ID", "Name", "Company", "Email", "Phone", "Is Lead", "Manager", "Source"]];
  sheet.getRange(1, 1, 1, headers[0].length).setValues(headers);
  styleHeader(sheet, "A1:H1");

  if (rows.length > 0) {
    const values = rows.map(r => [
      r.id || "",
      r.name || "",
      r.company || "",
      r.email || "",
      r.phone || "",
      r.isLead === true ? "TRUE" : "FALSE",
      r.manager || "",
      r.source || ""
    ]);
    sheet.getRange(2, 1, values.length, headers[0].length).setValues(values);
  }
  sheet.autoResizeColumns(1, headers[0].length);
}

function getOrCreateSheet(ss, name) {
  return ss.getSheetByName(name) || ss.insertSheet(name);
}

function styleHeader(sheet, rangeA1) {
  sheet.getRange(rangeA1)
    .setFontWeight("bold")
    .setBackground("#d9ead3");
}

function jsonResponse(body, code) {
  return ContentService
    .createTextOutput(JSON.stringify(body))
    .setMimeType(ContentService.MimeType.JSON);
}
```

