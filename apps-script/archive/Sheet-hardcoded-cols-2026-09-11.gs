/**
 * SPACEBOOKs - لما تكتب اسم كتاب جديد بالعمود B:
 * 1) بياخد رقم تسلسلي جديد بالعمود A
 * 2) بتنسخ القوائم المنسدلة بشكل الشريحة من الصف 2 للعمودين O و P
 * 3) بتتعبّى القيم الافتراضية بـ N و O و P (الفاضي بس)
 */

var COL_ID       = 1;   // A - الرقم
var COL_NAME     = 2;   // B - اسم الكتاب
var COL_SERIES   = 14;  // N - ينتمي إلى سلسلة
var COL_STATUS   = 15;  // O - الحالة
var COL_PUBLISH  = 16;  // P - النشر
var TEMPLATE_ROW = 2;   // صف فيه القوائم بشكل الشريحة: منه بننسخ

var DEFAULT_SERIES  = 'لا ينتمي';
var DEFAULT_STATUS  = 'متوفر';
var DEFAULT_PUBLISH = 'متوقف';

function onEdit(e) {
  if (!e || !e.range) return;

  var sheet = e.range.getSheet();
  if (sheet.getIndex() !== 1) return;
  if (COL_NAME < e.range.getColumn() || COL_NAME > e.range.getLastColumn()) return;

  var firstRow = Math.max(e.range.getRow(), TEMPLATE_ROW + 1);
  var lastRow  = e.range.getLastRow();
  if (firstRow > lastRow) return;
  var n = lastRow - firstRow + 1;

  // قراءة وحدة للعمودين A و B: مين الكتب الجديدة (إلها اسم وما إلها رقم)
  var ab = sheet.getRange(firstRow, COL_ID, n, 2).getValues();
  var newRows = [];
  for (var i = 0; i < n; i++) {
    if (String(ab[i][1]).trim() !== '' && String(ab[i][0]).trim() === '') newRows.push(firstRow + i);
  }
  if (!newRows.length) return;

  // أكبر رقم موجود: قراءة وحدة
  var last = sheet.getLastRow();
  var maxId = 0;
  sheet.getRange(TEMPLATE_ROW, COL_ID, last - TEMPLATE_ROW + 1, 1).getValues()
    .forEach(function (r) { var v = parseInt(r[0], 10); if (!isNaN(v) && v > maxId) maxId = v; });

  var template = sheet.getRange(TEMPLATE_ROW, COL_STATUS, 1, 2);   // O2:P2

  newRows.forEach(function (row) {
    maxId++;
    sheet.getRange(row, COL_ID).setValue(maxId);

    // نسخ القائمة وشكلها (الشريحة) للعمودين O و P مع بعض
    var target = sheet.getRange(row, COL_STATUS, 1, 2);
    template.copyTo(target, SpreadsheetApp.CopyPasteType.PASTE_DATA_VALIDATION, false);
    template.copyTo(target, SpreadsheetApp.CopyPasteType.PASTE_FORMAT, false);

    // احتياط: لو النسخ ما زبط، قائمة عادية بدل ما يضل الصف بلا قائمة
    var got = target.getDataValidations()[0];
    if (!got[0] || !got[1]) {
      target.setDataValidations([[
        got[0] || listRule_(['متوفر', 'غير متوفر']),
        got[1] || listRule_(['نشر', 'متوقف'])
      ]]);
    }

    // القيم الافتراضية بالخلايا الفاضية بس
    var np = sheet.getRange(row, COL_SERIES, 1, 3);          // N:P
    var v = np.getValues()[0];
    np.setValues([[
      String(v[0]).trim() || DEFAULT_SERIES,
      String(v[1]).trim() || DEFAULT_STATUS,
      String(v[2]).trim() || DEFAULT_PUBLISH
    ]]);
  });
}

function listRule_(values) {
  return SpreadsheetApp.newDataValidation()
    .requireValueInList(values, true)
    .setAllowInvalid(false)
    .build();
}
