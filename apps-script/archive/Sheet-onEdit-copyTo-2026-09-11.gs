/**
 * SPACEBOOKs - لما تكتب اسم كتاب جديد بالعمود B:
 * 1) بياخد رقم تسلسلي جديد بالعمود A
 * 2) بتنسخ القوائم المنسدلة وتنسيقها للعمودين O و P
 * 3) بتتعبّى القيم الافتراضية (بالخلايا الفاضية بس)
 */

var COL_ID      = 1;   // A - الرقم
var COL_NAME    = 2;   // B - اسم الكتاب
var COL_SERIES  = 14;  // N - ينتمي إلى سلسلة
var COL_STATUS  = 15;  // O - الحالة
var COL_PUBLISH = 16;  // P - النشر
var TEMPLATE_ROW = 2;  // أول كتاب: منه بتنسخ القوائم وتنسيقها

// القيم الافتراضية - احذف أي سطر ما بدك إياه
var DEFAULTS = {};
DEFAULTS[COL_SERIES]  = 'لا ينتمي';
DEFAULTS[COL_STATUS]  = 'متوفر';
DEFAULTS[COL_PUBLISH] = 'متوقف';

function onEdit(e) {
  if (!e || !e.range) return;

  var sheet = e.range.getSheet();
  if (sheet.getIndex() !== 1) return;   // ورقة الكتب (أول ورقة)

  // هل التعديل شمل العمود B؟ (بيشمل لصق عدة خلايا مرة وحدة)
  if (COL_NAME < e.range.getColumn() || COL_NAME > e.range.getLastColumn()) return;

  var firstRow = Math.max(e.range.getRow(), TEMPLATE_ROW + 1);
  var lastRow  = e.range.getLastRow();
  if (firstRow > lastRow) return;

  var n = lastRow - firstRow + 1;
  var names = sheet.getRange(firstRow, COL_NAME, n, 1).getValues();
  var ids   = sheet.getRange(firstRow, COL_ID,   n, 1).getValues();
  var maxId = null;

  for (var i = 0; i < n; i++) {
    var hasName = String(names[i][0]).trim() !== '';
    var hasId   = String(ids[i][0]).trim() !== '';
    if (!hasName || hasId) continue;   // مش كتاب جديد: ما بنلمسه

    var row = firstRow + i;
    if (maxId === null) maxId = currentMaxId_(sheet);
    maxId++;
    sheet.getRange(row, COL_ID).setValue(maxId);

    [COL_STATUS, COL_PUBLISH].forEach(function (c) {
      var source = sheet.getRange(TEMPLATE_ROW, c);
      var target = sheet.getRange(row, c);
      source.copyTo(target, SpreadsheetApp.CopyPasteType.PASTE_DATA_VALIDATION, false);
      source.copyTo(target, SpreadsheetApp.CopyPasteType.PASTE_FORMAT, false);
    });

    Object.keys(DEFAULTS).forEach(function (c) {
      var cell = sheet.getRange(row, Number(c));
      if (String(cell.getValue()).trim() === '') cell.setValue(DEFAULTS[c]);
    });
  }
}

function currentMaxId_(sheet) {
  var last = sheet.getLastRow();
  if (last < TEMPLATE_ROW) return 0;
  var vals = sheet.getRange(TEMPLATE_ROW, COL_ID, last - TEMPLATE_ROW + 1, 1).getValues();
  var max = 0;
  vals.forEach(function (r) {
    var v = parseInt(r[0], 10);
    if (!isNaN(v) && v > max) max = v;
  });
  return max;
}
