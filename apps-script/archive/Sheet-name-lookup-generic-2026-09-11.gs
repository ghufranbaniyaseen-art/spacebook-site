/**
 * SPACEBOOKs - لما تكتب اسم كتاب جديد بالعمود B:
 * 1) بياخد رقم تسلسلي جديد بعمود الـID
 * 2) بتنسخ القوائم المنسدلة بشكل الشريحة من الصف 2 لأعمدة الحالة والنشر
 * 3) بتتعبّى القيم الافتراضية (الفاضي بس)
 *
 * الأعمدة بتنلاقى بالاسم مش برقم ثابت، عشان لو ضفتي عمود جديد
 * أو غيّرتي ترتيبهم، الكود بيضل يلاقي العمود الصح.
 */

var NAME_COL     = 'اسم الكتاب';
var ID_COLS      = ['ID', 'رقم الكتاب'];      // أول اسم موجود هو المعتمد
var STATUS_COL   = 'الحالة';
var PUBLISH_COL  = 'النشر';
var TEMPLATE_ROW = 2;   // صف فيه القوائم بشكل الشريحة: منه بننسخ

var DEFAULT_STATUS  = 'متوفر';
var DEFAULT_PUBLISH = 'متوقف';

function onEdit(e) {
  if (!e || !e.range) return;

  var sheet = e.range.getSheet();
  if (sheet.getIndex() !== 1) return;

  var headers = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0]
    .map(function (h) { return String(h).trim(); });

  var nameC = headers.indexOf(NAME_COL) + 1;
  var idC = 0;
  for (var k = 0; k < ID_COLS.length; k++) {
    var c = headers.indexOf(ID_COLS[k]) + 1;
    if (c) { idC = c; break; }
  }
  var statusC  = headers.indexOf(STATUS_COL) + 1;
  var publishC = headers.indexOf(PUBLISH_COL) + 1;

  if (!nameC || !idC || !statusC || !publishC) return;   // بنية الشيت ناقصة، ما منلمس إشي
  if (nameC < e.range.getColumn() || nameC > e.range.getLastColumn()) return;

  var firstRow = Math.max(e.range.getRow(), TEMPLATE_ROW + 1);
  var lastRow  = e.range.getLastRow();
  if (firstRow > lastRow) return;
  var n = lastRow - firstRow + 1;

  var names = sheet.getRange(firstRow, nameC, n, 1).getValues();
  var ids   = sheet.getRange(firstRow, idC, n, 1).getValues();
  var newRows = [];
  for (var i = 0; i < n; i++) {
    if (String(names[i][0]).trim() !== '' && String(ids[i][0]).trim() === '') newRows.push(firstRow + i);
  }
  if (!newRows.length) return;

  var last = sheet.getLastRow();
  var maxId = 0;
  sheet.getRange(TEMPLATE_ROW, idC, last - TEMPLATE_ROW + 1, 1).getValues()
    .forEach(function (r) { var v = parseInt(r[0], 10); if (!isNaN(v) && v > maxId) maxId = v; });

  newRows.forEach(function (row) {
    maxId++;
    sheet.getRange(row, idC).setValue(maxId);

    // نسخ القائمة وشكلها (الشريحة) لعمودي الحالة والنشر، كل واحد لحاله
    // لأنهم ممكن ما يكونوا متجاورين
    var fields = [
      { col: statusC,  def: DEFAULT_STATUS,  fallback: ['متوفر', 'غير متوفر'] },
      { col: publishC, def: DEFAULT_PUBLISH, fallback: ['نشر', 'متوقف'] }
    ];
    fields.forEach(function (f) {
      var template = sheet.getRange(TEMPLATE_ROW, f.col);
      var target = sheet.getRange(row, f.col);
      template.copyTo(target, SpreadsheetApp.CopyPasteType.PASTE_DATA_VALIDATION, false);
      template.copyTo(target, SpreadsheetApp.CopyPasteType.PASTE_FORMAT, false);

      // احتياط: لو الصف 2 نفسه بلا قائمة لأي سبب
      if (!target.getDataValidation()) {
        target.setDataValidation(
          SpreadsheetApp.newDataValidation().requireValueInList(f.fallback, true).setAllowInvalid(false).build()
        );
      }
      if (String(target.getValue()).trim() === '') target.setValue(f.def);
    });
  });
}
