/**
 * SPACEBOOKs - أتمتة إدخال الكتب الجديدة + أتمتة تبويب "السلاسل"
 *
 * ==== ورقة الكتب (الأولى) ====
 * عند كتابة اسم كتاب جديد:
 * 1) إعطاء رقم تسلسلي تلقائي في عمود الـID.
 * 2) نسخ القوائم المنسدلة بنمط الشرائح وألوانها (نمط السعر، السلسلة، الحالة، النشر).
 * 3) وضع القيم الافتراضية مباشرة.
 * 4) نسخ معادلة حساب الربح التلقائي.
 * 5) تثبيت التنسيق العشري (0.00) لعمود التقييم.
 * 6) توحيد نوع وحجم الخط ومحاذاة النص لكامل الصف مثل الصف 2.
 * وعند تغيير "الحالة" (متوفر/غير متوفر) لكتاب: مزامنة كل سلسلة هو عضو فيها.
 *
 * ==== تبويب "السلاسل" ====
 * التحكم بالسلاسل حصراً من هالتبويب - الموقع ما بيجمّع سلاسل من حقل الكتاب
 * القديم أبداً، فأي سلسلة لازم تنكتب هون عشان تظهر.
 * عند كتابة اسم سلسلة جديدة أو تعديل عمود "أرقام الكتب":
 * 1) إعطاء رقم تسلسلي تلقائي (لو صف جديد).
 * 2) حساب "أسماء الكتب"/"عدد الأجزاء"/التكلفة/سعر البيع/الربح تلقائياً من
 *    أسعار وعناوين الكتب الحية (مطابقة مع منطق n8n).
 * 3) حساب "الحالة" تلقائياً: السلسلة "متوفر" فقط إذا كل أجزاءها متوفرة،
 *    وإلا "غير متوفر" (تشتريها كاملة يعني لازم كل جزء موجود).
 * 4) وضع قيم افتراضية للصف الجديد (خصم/نشر) ونسخ التنسيق من الصف المرجعي.
 *
 * الأعمدة بتنلاقى بالاسم من صف العناوين بكل الحالتين، مش برقم ثابت - عشان لو
 * انضاف عمود جديد أو تغيّر ترتيبهم، الكود يضل يلاقي العمود الصح لحاله.
 */

var SERIES_SHEET_NAME = 'السلاسل';

// ---- ورقة الكتب ----
var NAME_COL       = 'اسم الكتاب';
var ID_COLS        = ['ID', 'رقم الكتاب'];   // أول اسم موجود هو المعتمد
var PROFIT_COL     = 'الربح';
var PRICE_TYPE_COL = 'نمط السعر';
var PAGES_COL      = 'عدد الصفحات';
var RATING_COL     = 'التقييم';
var SERIES_COL     = 'ينتمي إلى سلسلة';
var STATUS_COL     = 'الحالة';
var PUBLISH_COL    = 'النشر';
var COST_COL       = 'سعر الجملة';
var SELL_COL       = 'سعر البيع';
var COVER_COL      = 'رابط الصورة';

var TEMPLATE_ROW = 2;   // الصف المرجعي: منه بننسخ القوائم والتنسيق والمعادلة

var DEFAULT_PRICE_TYPE = 'ثابت';
var DEFAULT_SERIES     = 'لا ينتمي';
var DEFAULT_STATUS     = 'متوفر';
var DEFAULT_PUBLISH    = 'متوقف';
var DEFAULT_PAGES      = '-';

// ---- تبويب السلاسل ----
var SR_ID_COL       = 'رقم السلسلة';
var SR_NAME_COL     = 'اسم السلسلة';
var SR_MEMBERS_COL  = 'أرقام الكتب';
var SR_TITLES_COL   = 'أسماء الكتب';
var SR_PARTS_COL    = 'عدد الأجزاء';
var SR_COST_COL     = 'إجمالي سعر التكلفة';
var SR_PRICE_COL    = 'إجمالي سعر البيع';
var SR_PROFIT_COL   = 'إجمالي الربح';
var SR_DISCOUNT_COL = 'خصم';
var SR_STATUS_COL   = 'الحالة';
var SR_PUBLISH_COL  = 'النشر';
var SR_COVER_COL    = 'رابط الصورة';
var SR_TEMPLATE_ROW = 2;

var SR_DEFAULT_DISCOUNT = 'غير متوفر';
var SR_DEFAULT_PUBLISH  = 'متوقف';

function findColIndex(headerRow, name) {
  var i = headerRow.indexOf(name);
  return i === -1 ? 0 : i + 1;
}

function onEdit(e) {
  if (!e || !e.range) return;
  var sheet = e.range.getSheet();
  if (sheet.getIndex() === 1) {
    handleBooksEdit(e, sheet);
  } else if (sheet.getName() === SERIES_SHEET_NAME) {
    handleSeriesEdit(e, sheet);
  }
}

function handleBooksEdit(e, sheet) {
  var headerRow = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0]
    .map(function (h) { return String(h).trim(); });

  function findCol(name) { return findColIndex(headerRow, name); }
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

  var editedFrom = e.range.getColumn();
  var editedTo   = editedFrom + e.range.getNumColumns() - 1;

  // تغيّرت حالة كتاب (متوفر/غير متوفر)؟ زامني كل سلسلة هو عضو فيها
  if (colStatus >= editedFrom && colStatus <= editedTo) {
    var rFrom = Math.max(e.range.getRow(), 2), rTo = e.range.getLastRow();
    for (var rr = rFrom; rr <= rTo; rr++) {
      var bId = String(sheet.getRange(rr, colId).getValue()).trim();
      if (bId) { try { syncSeriesForBookId(bId, sheet.getParent()); } catch (err) {} }
    }
  }

  if (colName < editedFrom || colName > editedTo) return;   // مش تعديل على عمود الاسم - خلص هون

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

// فهرس {رقم الكتاب: {title,cost,price,status,cover}} من ورقة الكتب - يُبنى مرة لكل تشغيلة
function getBooksIndex(booksSheet) {
  var lastRow = booksSheet.getLastRow();
  if (lastRow < 2) return {};
  var headerRow = booksSheet.getRange(1, 1, 1, booksSheet.getLastColumn()).getValues()[0]
    .map(function (h) { return String(h).trim(); });
  function col(name) { return findColIndex(headerRow, name); }

  var colId = col(ID_COLS[0]) || col(ID_COLS[1]);
  var colName = col(NAME_COL), colCost = col(COST_COL), colPrice = col(SELL_COL);
  var colStatus = col(STATUS_COL), colCover = col(COVER_COL);
  if (!colId || !colName) return {};

  var n = lastRow - 1;
  var data = booksSheet.getRange(2, 1, n, booksSheet.getLastColumn()).getValues();
  var idx = {};
  data.forEach(function (r) {
    var id = String(r[colId - 1]).trim();
    if (!id) return;
    idx[id] = {
      title: String(r[colName - 1]).trim(),
      cost: parseFloat(String(colCost ? r[colCost - 1] : 0).replace(',', '.')) || 0,
      price: parseFloat(String(colPrice ? r[colPrice - 1] : 0).replace(',', '.')) || 0,
      status: colStatus ? String(r[colStatus - 1]).trim() : DEFAULT_STATUS,
      cover: colCover ? String(r[colCover - 1]).trim() : '',
    };
  });
  return idx;
}

// بيحسب ويكتب أسماء/عدد أجزاء/تكلفة/سعر بيع/ربح/حالة صف سلسلة واحد، من "أرقام الكتب" الحالية
function computeSeriesRow(seriesSheet, booksIndex, row, cols) {
  var raw = String(seriesSheet.getRange(row, cols.members).getValue()).trim();
  var memberIds = raw.split(/[&\/]/).map(function (x) { return x.trim(); }).filter(Boolean);
  var members = memberIds.map(function (id) { return booksIndex[id]; }).filter(Boolean);

  if (cols.titles) seriesSheet.getRange(row, cols.titles).setValue(members.map(function (m) { return m.title; }).join(' | '));
  if (cols.parts)  seriesSheet.getRange(row, cols.parts).setValue(members.length);

  var cost = members.reduce(function (s, m) { return s + m.cost; }, 0);
  var price = members.reduce(function (s, m) { return s + m.price; }, 0);
  if (cols.cost)   seriesSheet.getRange(row, cols.cost).setValue(Math.round(cost * 100) / 100);
  if (cols.price)  seriesSheet.getRange(row, cols.price).setValue(Math.round(price * 100) / 100);
  if (cols.profit) seriesSheet.getRange(row, cols.profit).setValue(Math.round((price - cost) * 100) / 100);

  if (cols.status) {
    var available = members.length > 0 && members.every(function (m) { return m.status !== 'غير متوفر'; });
    seriesSheet.getRange(row, cols.status).setValue(available ? DEFAULT_STATUS : 'غير متوفر');
  }
  if (cols.cover) {
    var coverCell = seriesSheet.getRange(row, cols.cover);
    if (String(coverCell.getValue()).trim() === '') {
      var withCover = members.filter(function (m) { return m.cover; })[0];
      if (withCover) coverCell.setValue(withCover.cover);
    }
  }
}

function handleSeriesEdit(e, sheet) {
  var headerRow = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0]
    .map(function (h) { return String(h).trim(); });
  function col(name) { return findColIndex(headerRow, name); }

  var cols = {
    id: col(SR_ID_COL), name: col(SR_NAME_COL), members: col(SR_MEMBERS_COL),
    titles: col(SR_TITLES_COL), parts: col(SR_PARTS_COL), cost: col(SR_COST_COL),
    price: col(SR_PRICE_COL), profit: col(SR_PROFIT_COL), discount: col(SR_DISCOUNT_COL),
    status: col(SR_STATUS_COL), publish: col(SR_PUBLISH_COL), cover: col(SR_COVER_COL),
  };
  if (!cols.id || !cols.name || !cols.members) return;   // أعمدة أساسية مفقودة - ما منلمس الشيت

  var editedFrom = e.range.getColumn();
  var editedTo   = editedFrom + e.range.getNumColumns() - 1;
  var touchesName    = cols.name    >= editedFrom && cols.name    <= editedTo;
  var touchesMembers = cols.members >= editedFrom && cols.members <= editedTo;
  if (!touchesName && !touchesMembers) return;   // تعديل ما يخصنا (مثلاً وصف أو خصم فقط)

  var firstRow = Math.max(e.range.getRow(), SR_TEMPLATE_ROW);
  var lastRow  = e.range.getLastRow();
  if (firstRow > lastRow) return;

  var booksSheet = sheet.getParent().getSheets()[0];
  var booksIndex = getBooksIndex(booksSheet);

  var totalCols  = headerRow.length;
  var tplFullRow = sheet.getRange(SR_TEMPLATE_ROW, 1, 1, totalCols);

  // أعلى رقم سلسلة موجود حالياً (القيم بصيغة "sb-1")، لتوليد ID تسلسلي للصفوف الجديدة
  var lastDataRow = sheet.getLastRow();
  var maxId = 0;
  if (lastDataRow >= SR_TEMPLATE_ROW) {
    sheet.getRange(SR_TEMPLATE_ROW, cols.id, lastDataRow - SR_TEMPLATE_ROW + 1, 1).getValues()
      .forEach(function (r) {
        var v = parseInt(String(r[0]).trim().replace(/^sb-/i, ''), 10);
        if (!isNaN(v) && v > maxId) maxId = v;
      });
  }

  for (var row = firstRow; row <= lastRow; row++) {
    var nameVal = String(sheet.getRange(row, cols.name).getValue()).trim();
    if (!nameVal) continue;   // صف بدون اسم سلسلة - تجاهل

    var idCell = sheet.getRange(row, cols.id);
    var isNewRow = String(idCell.getValue()).trim() === '';
    if (isNewRow) {
      maxId++;
      idCell.setValue('sb-' + maxId);
      try { tplFullRow.copyTo(sheet.getRange(row, 1, 1, totalCols), { formatOnly: true }); } catch (err) {}

      if (cols.status) {
        try {
          var cS = sheet.getRange(row, cols.status);
          sheet.getRange(SR_TEMPLATE_ROW, cols.status).copyTo(cS, SpreadsheetApp.CopyPasteType.PASTE_DATA_VALIDATION, false);
        } catch (err) {}
      }
      if (cols.publish) {
        try {
          var cP = sheet.getRange(row, cols.publish);
          sheet.getRange(SR_TEMPLATE_ROW, cols.publish).copyTo(cP, SpreadsheetApp.CopyPasteType.PASTE_DATA_VALIDATION, false);
          if (String(cP.getValue()).trim() === '') cP.setValue(SR_DEFAULT_PUBLISH);
        } catch (err) {}
      }
      if (cols.discount) {
        try {
          var cD = sheet.getRange(row, cols.discount);
          if (String(cD.getValue()).trim() === '') cD.setValue(SR_DEFAULT_DISCOUNT);
        } catch (err) {}
      }
    }

    computeSeriesRow(sheet, booksIndex, row, cols);
  }
}

// ==== مطابقة صور السلاسل من مجلد "صور أغلفة الكتب" ====
// أي ملف بالمجلد اسمه يبلش بـ sb- (مثلاً sb-1.png) بيتعتبر غلاف سلسلة رقمها
// اللي بعد sb- ، وبيتحط تلقائياً بعمود "رابط الصورة" بصف السلسلة المطابقة
// برقم السلسلة (رقم الكتاب العادي "167- ..." ما بيتأثر، مش نفس الصيغة).
// ملاحظة: قيمة "رقم السلسلة" بالشيت هي نفسها بصيغة "sb-1" وليس رقم مجرد،
// فالمطابقة هون بترجع الرقم بس من الطرفين (اسم الملف وقيمة الخلية) وتقارنهم.
var COVERS_FOLDER_ID = '1zbEISIQ4viSzxb5o_bmAVxtjDShsFjP4';   // مجلد "صور أغلفة الكتب"
var SB_PATTERN = /^sb-(\d+)/i;

function syncSeriesCoversFromDrive() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var seriesSheet = ss.getSheetByName(SERIES_SHEET_NAME);
  if (!seriesSheet) return;

  var headerRow = seriesSheet.getRange(1, 1, 1, seriesSheet.getLastColumn()).getValues()[0]
    .map(function (h) { return String(h).trim(); });
  var colId = findColIndex(headerRow, SR_ID_COL);
  var colCover = findColIndex(headerRow, SR_COVER_COL);
  if (!colId || !colCover) return;

  // أحدث ملف لكل رقم سلسلة (sb-1, sb-2, ...) بالمجلد - لو انرفع أكتر من مرة، الأحدث بيفوز
  var folder = DriveApp.getFolderById(COVERS_FOLDER_ID);
  var files = folder.getFiles();
  var latestBySeriesId = {};
  while (files.hasNext()) {
    var f = files.next();
    var m = f.getName().match(SB_PATTERN);
    if (!m) continue;
    var sid = m[1];
    var t = f.getLastUpdated().getTime();
    if (!latestBySeriesId[sid] || t > latestBySeriesId[sid].time) {
      latestBySeriesId[sid] = { file: f, time: t };
    }
  }
  var ids = Object.keys(latestBySeriesId);
  if (!ids.length) return;

  var lastRow = seriesSheet.getLastRow();
  if (lastRow < 2) return;
  var idVals = seriesSheet.getRange(2, colId, lastRow - 1, 1).getValues();
  ids.forEach(function (sid) {
    var link = 'https://drive.google.com/file/d/' + latestBySeriesId[sid].file.getId() + '/view';
    for (var i = 0; i < idVals.length; i++) {
      var cellIdDigits = String(idVals[i][0]).trim().replace(/^sb-/i, '');
      if (cellIdDigits === sid) {
        var cell = seriesSheet.getRange(2 + i, colCover);
        if (String(cell.getValue()).trim() !== link) cell.setValue(link);
        break;
      }
    }
  });
}

// شغّليها مرة وحدة بس، يدوياً من محرر Apps Script (▶ Run) عشان تركّب المؤقت
// اللي بيفحص المجلد كل 10 دقايق - المؤقتات ما بتنركّب لحالها بالكود
function installCoverSyncTrigger() {
  ScriptApp.getProjectTriggers().forEach(function (t) {
    if (t.getHandlerFunction() === 'syncSeriesCoversFromDrive') ScriptApp.deleteTrigger(t);
  });
  ScriptApp.newTrigger('syncSeriesCoversFromDrive').timeBased().everyMinutes(10).create();
}

// بتشتغل من ورقة الكتب لما تتغيّر حالة كتاب: بتحدّث كل سلسلة هو عضو فيها
function syncSeriesForBookId(bookId, ss) {
  var spreadsheet = ss || SpreadsheetApp.getActiveSpreadsheet();
  var seriesSheet = spreadsheet.getSheetByName(SERIES_SHEET_NAME);
  if (!seriesSheet) return;
  var lastRow = seriesSheet.getLastRow();
  if (lastRow < SR_TEMPLATE_ROW) return;

  var headerRow = seriesSheet.getRange(1, 1, 1, seriesSheet.getLastColumn()).getValues()[0]
    .map(function (h) { return String(h).trim(); });
  function col(name) { return findColIndex(headerRow, name); }
  var cols = {
    id: col(SR_ID_COL), name: col(SR_NAME_COL), members: col(SR_MEMBERS_COL),
    titles: col(SR_TITLES_COL), parts: col(SR_PARTS_COL), cost: col(SR_COST_COL),
    price: col(SR_PRICE_COL), profit: col(SR_PROFIT_COL), status: col(SR_STATUS_COL),
    cover: col(SR_COVER_COL),
  };
  if (!cols.members || !cols.status) return;

  var booksSheet = seriesSheet.getParent().getSheets()[0];
  var booksIndex = getBooksIndex(booksSheet);

  var n = lastRow - SR_TEMPLATE_ROW + 1;
  var memberVals = seriesSheet.getRange(SR_TEMPLATE_ROW, cols.members, n, 1).getValues();
  for (var i = 0; i < n; i++) {
    var ids = String(memberVals[i][0]).trim().split(/[&\/]/).map(function (x) { return x.trim(); }).filter(Boolean);
    if (ids.indexOf(String(bookId)) !== -1) {
      computeSeriesRow(seriesSheet, booksIndex, SR_TEMPLATE_ROW + i, cols);
    }
  }
}
