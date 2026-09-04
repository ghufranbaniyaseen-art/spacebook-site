// SPACEBOOK - Backend (Google Apps Script)
const BOOKS_SHEET_ID = '1MjY3zSA6NdpAmPk41gNse2s0AfeeBURJtewkkSJJWDU';
const ORDERS_SHEET_ID = '1Ice4YfNhZ8LTxCOGvXyTMKHKocqNChoUnXOqTu45Jj4';

function doGet(e) {
  const action = (e.parameter && e.parameter.action) || 'books';
  if (action === 'books') {
    return jsonResponse({ books: getBooks() });
  }
  return jsonResponse({ error: 'unknown action' });
}

function doPost(e) {
  try {
    const data = JSON.parse(e.postData.contents);
    if (data.type === 'order') {
      return jsonResponse(addOrder(data));
    } else if (data.type === 'notify') {
      return jsonResponse(addNotify(data));
    } else if (data.type === 'suggest') {
      return jsonResponse(addSuggest(data));
    }
    return jsonResponse({ error: 'unknown type' });
  } catch (err) {
    return jsonResponse({ error: err.message });
  }
}

// Sheets sometimes silently stores a typed decimal like "3.5" as a Date
// (misreads it as month.day). This normalizes any cell back to a plain
// number/string no matter how it's actually stored, so the API never
// leaks a Date object again.
function normalizeCell(value) {
  if (Object.prototype.toString.call(value) === '[object Date]') {
    const month = value.getMonth() + 1; // 1-12
    const day = value.getDate();        // 1-31
    return Number(month + '.' + day);
  }
  return value;
}

function getBooks() {
  const sheet = SpreadsheetApp.openById(BOOKS_SHEET_ID).getSheets()[0];
  const values = sheet.getDataRange().getValues();
  const headers = values[0];
  const rows = values.slice(1);
  return rows
    .filter(function (r) { return r[0]; })
    .map(function (r) {
      const book = {};
      headers.forEach(function (h, i) { book[h] = normalizeCell(r[i]); });
      delete book['سعر الجملة'];
      return book;
    });
}

function addOrder(data) {
  const sheet = SpreadsheetApp.openById(ORDERS_SHEET_ID).getSheetByName('الطلبات');
  const orderNumber = sheet.getLastRow();
  sheet.appendRow([
    orderNumber, data.name || '', data.phone || '', data.governorate || '',
    data.area || '', data.locationDetails || '', data.books || '',
    data.count || '', data.total || '', new Date(), 'جديد'
  ]);
  return { success: true, orderNumber: orderNumber };
}

function addNotify(data) {
  const sheet = SpreadsheetApp.openById(ORDERS_SHEET_ID).getSheetByName('أبلغني لما يتوفر');
  sheet.appendRow([data.book || '', data.name || '', data.phone || '', new Date()]);
  return { success: true };
}

function addSuggest(data) {
  const sheet = SpreadsheetApp.openById(ORDERS_SHEET_ID).getSheetByName('اقترح كتاب');
  sheet.appendRow([data.book || '', data.name || '', data.phone || '', new Date()]);
  return { success: true };
}

function jsonResponse(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
}
