/**
 * SPACEBOOKs - أتمتة إدخال الكتب الجديدة
 * عند كتابة اسم كتاب جديد في العمود B:
 * 1) إعطاء رقم تسلسلي تلقائي في عمود الـID.
 * 2) نسخ القوائم المنسدلة بنمط الشرائح وألوانها (نمط السعر، السلسلة، الحالة، النشر).
 * 3) وضع القيم الافتراضية مباشرة.
 * 4) نسخ معادلة حساب الربح التلقائي.
 * 5) تثبيت التنسيق العشري (0.00) لعمود التقييم.
 * 6) توحيد نوع وحجم الخط ومحاذاة النص لكامل الصف مثل الصف 2.
 *
 * الأعمدة بتنلاقى بالاسم من صف العناوين، مش برقم ثابت - عشان لو
 * انضاف عمود جديد أو تغيّر ترتيبهم، الكود يضل يلاقي العمود الصح لحاله.
 */

var NAME_COL       = 'اسم الكتاب';
var ID_COLS        = ['ID', 'رقم الكتاب'];   // أول اسم موجود هو المعتمد
var PROFIT_COL     = 'الربح';
var PRICE_TYPE_COL = 'نمط السعر';
var PAGES_COL      = 'عدد الصفحات';
var RATING_COL     = 'التقييم';
var SERIES_COL     = 'ينتمي إلى سلسلة';
var STATUS_COL     = 'الحالة';
var PUBLISH_COL    = 'النشر';

var TEMPLATE_ROW = 2;   // الصف المرجعي: منه بننسخ القوائم والتنسيق والمعادلة

var DEFAULT_PRICE_TYPE = 'ثابت';
var DEFAULT_SERIES     = 'لا ينتمي';
var DEFAULT_STATUS     = 'متوفر';
var DEFAULT_PUBLISH    = 'متوقف';
var DEFAULT_PAGES      = '-';

function onEdit(e) {
  if (!e || !e.range) return;

  var sheet = e.range.getSheet();
  if (sheet.getIndex() !== 1) return;   // ورقة الكتب فقط

  var headerRow = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0]
    .map(function (h) { return String(h).trim(); });

  function findCol(name) {
    var i = headerRow.indexOf(name);
    return i === -1 ? 0 : i + 1;
  }
  function findId() {
    for (var k = 0; k < ID_COLS.length; k++) {
      var c = findCol(ID_COLS[k]);
      if (c) return c;
    }
    return 0;
  }

  var colId        = findId();
  var colName       = findCol(NAME_COL);
  var colProfit     = findCol(PROFIT_COL);
  var colPriceType  = findCol(PRICE_TYPE_COL);
  var colPages      = findCol(PAGES_COL);
  var colRating     = findCol(RATING_COL);
  var colSeries     = findCol(SERIES_COL);
  var colStatus     = findCol(STATUS_COL);
  var colPublish    = findCol(PUBLISH_COL);

  // لو أي عمود أساسي مفقود (تغيّر اسمه)، ما منلمس الشيت
  if (!colId || !colName || !colStatus || !colPublish) return;
  if (colName < e.range.getColumn() || colName > e.range.getLastColumn()) return;

  var firstRow = Math.max(e.range.getRow(), TEMPLATE_ROW + 1);
  var lastRow  = e.range.getLastRow();
  if (firstRow > lastRow) return;
  var n = lastRow - firstRow + 1;

  // جلب الصفوف الجديدة التي تحتوي على اسم كتاب وبدون ID
  var names = sheet.getRange(firstRow, colName, n, 1).getValues();
  var ids   = sheet.getRange(firstRow, colId, n, 1).getValues();
  var newRows = [];
  for (var i = 0; i < n; i++) {
    if (String(names[i][0]).trim() !== '' && String(ids[i][0]).trim() === '') newRows.push(firstRow + i);
  }
  if (!newRows.length) return;

  // معرفة أعلى ID موجود حالياً
  var last = sheet.getLastRow();
  var maxId = 0;
  sheet.getRange(TEMPLATE_ROW, colId, Math.max(last - TEMPLATE_ROW + 1, 1), 1).getValues()
    .forEach(function (r) {
      var v = parseInt(r[0], 10);
      if (!isNaN(v) && v > maxId) maxId = v;
    });

  // الخلايا المرجعية من الصف 2
  var tplPriceType = colPriceType ? sheet.getRange(TEMPLATE_ROW, colPriceType) : null;
  var tplSeries    = colSeries    ? sheet.getRange(TEMPLATE_ROW, colSeries)    : null;
  var tplStatus    = sheet.getRange(TEMPLATE_ROW, colStatus);
  var tplPublish   = sheet.getRange(TEMPLATE_ROW, colPublish);
  var tplProfit    = colProfit    ? sheet.getRange(TEMPLATE_ROW, colProfit)    : null;
  var totalCols    = headerRow.length;
  var tplFullRow   = sheet.getRange(TEMPLATE_ROW, 1, 1, totalCols);

  // صيغة الربح بصيغة R1C1 لضمان تعديل أرقام الصفوف تلقائياً
  var profitFormulaR1C1 = tplProfit ? tplProfit.getFormulaR1C1() : '';

  newRows.forEach(function (row) {
    // 1) وضع الـ ID التلقائي
    maxId++;
    sheet.getRange(row, colId).setValue(maxId);

    // 2) توحيد التنسيق العام (الخط، الحجم، التوسيط) لكامل الصف متل الصف 2
    try {
      tplFullRow.copyTo(sheet.getRange(row, 1, 1, totalCols), { formatOnly: true });
    } catch (err) {}

    // 3) نسخ معادلة الربح التلقائي
    if (colProfit && profitFormulaR1C1) {
      try { sheet.getRange(row, colProfit).setFormulaR1C1(profitFormulaR1C1); } catch (err) {}
    }

    // 4) ضبط عمود التقييم كعدد عشري بخانتين (0.00)
    if (colRating) {
      try { sheet.getRange(row, colRating).setNumberFormat('0.00'); } catch (err) {}
    }

    // 5) وضع علامة "-" افتراضياً في عمود عدد الصفحات إذا كان فارغاً
    if (colPages) {
      try {
        var cellPages = sheet.getRange(row, colPages);
        if (String(cellPages.getValue()).trim() === '') cellPages.setValue(DEFAULT_PAGES);
      } catch (err) {}
    }

    // 6) نسخ القوائم المنسدلة بشرائحها وألوانها وقيمها الافتراضية

    // أ- نمط السعر
    if (colPriceType) {
      try {
        var cellPT = sheet.getRange(row, colPriceType);
        tplPriceType.copyTo(cellPT, SpreadsheetApp.CopyPasteType.PASTE_DATA_VALIDATION, false);
        tplPriceType.copyTo(cellPT, SpreadsheetApp.CopyPasteType.PASTE_FORMAT, false);
        if (String(cellPT.getValue()).trim() === '') cellPT.setValue(DEFAULT_PRICE_TYPE);
      } catch (err) {}
    }

    // ب- ينتمي إلى سلسلة
    if (colSeries) {
      try {
        var cellSer = sheet.getRange(row, colSeries);
        tplSeries.copyTo(cellSer, SpreadsheetApp.CopyPasteType.PASTE_DATA_VALIDATION, false);
        tplSeries.copyTo(cellSer, SpreadsheetApp.CopyPasteType.PASTE_FORMAT, false);
        if (String(cellSer.getValue()).trim() === '') cellSer.setValue(DEFAULT_SERIES);
      } catch (err) {}
    }

    // ج- الحالة والنشر
    try {
      var cellStatus  = sheet.getRange(row, colStatus);
      var cellPublish = sheet.getRange(row, colPublish);

      tplStatus.copyTo(cellStatus, SpreadsheetApp.CopyPasteType.PASTE_DATA_VALIDATION, false);
      tplStatus.copyTo(cellStatus, SpreadsheetApp.CopyPasteType.PASTE_FORMAT, false);
      tplPublish.copyTo(cellPublish, SpreadsheetApp.CopyPasteType.PASTE_DATA_VALIDATION, false);
      tplPublish.copyTo(cellPublish, SpreadsheetApp.CopyPasteType.PASTE_FORMAT, false);

      if (String(cellStatus.getValue()).trim() === '')  cellStatus.setValue(DEFAULT_STATUS);
      if (String(cellPublish.getValue()).trim() === '') cellPublish.setValue(DEFAULT_PUBLISH);
    } catch (err) {}
  });
}
