/**
 * SPACEBOOKs - أدوات شيت الكتب
 * نسخة 11 سبتمبر 2026 - عمود الترقيم ممكن يكون اسمه "ID" أو "رقم الكتاب"
 *
 * التركيب: Extensions > Apps Script > امسح أي كود موجود > الصق > احفظ > حدّث صفحة الشيت
 * بعدها من قائمة SPACEBOOKs: "تركيب القوائم المنسدلة" (مرة وحدة)
 *
 * هاد الكود: ما بيضيف أعمدة، ما بيحرّك أعمدة، ما بيغيّر تنسيق الشيت،
 * وما بيكتب إلا بالخلايا الفاضية.
 */

var ID_COLS    = ['ID', 'رقم الكتاب'];   // أول اسم موجود بالصف الأول هو المعتمد
var NAME_COL   = 'اسم الكتاب';
var SERIES_COL = 'ينتمي إلى سلسلة';

// القيم الافتراضية لأي كتاب جديد (بس بالخلايا الفاضية)
var DEFAULTS = {
  'الحالة': 'متوفر',
  'النشر': 'متوقف',
  'ينتمي إلى سلسلة': 'لا ينتمي'
};

// لازم تنكتب بهاي الحروف بالضبط - الموقع بيقارنها حرف بحرف
var DROPDOWNS = {
  'الحالة': ['متوفر', 'غير متوفر'],
  'النشر':  ['نشر', 'متوقف']
};

// ------------------------------------------------------------------
// القائمة
// ------------------------------------------------------------------
function onOpen() {
  SpreadsheetApp.getUi()
    .createMenu('SPACEBOOKs')
    .addItem('تركيب القوائم المنسدلة', 'installDropdowns')
    .addItem('إكمال الترقيم والقيم الافتراضية', 'completeRows')
    .addSeparator()
    .addItem('مزامنة السلاسل', 'syncSeries')
    .addItem('فحص السلاسل', 'checkSeries')
    .addToUi();
}

function booksSheet_() { return SpreadsheetApp.getActiveSpreadsheet().getSheets()[0]; }

function headers_(sh) {
  return sh.getRange(1, 1, 1, Math.max(sh.getLastColumn(), 1)).getValues()[0]
           .map(function (h) { return String(h).trim(); });
}

function colIndex_(sh, name) {
  var i = headers_(sh).indexOf(name);
  return i === -1 ? -1 : i + 1;
}

function idCol_(sh) {
  for (var k = 0; k < ID_COLS.length; k++) {
    var c = colIndex_(sh, ID_COLS[k]);
    if (c !== -1) return c;
  }
  return -1;
}

// بيتأكد إنه الأعمدة المطلوبة موجودة بأسمائها الصحيحة قبل أي تعديل
function missingCols_(sh) {
  var need = [NAME_COL, SERIES_COL].concat(Object.keys(DROPDOWNS));
  var h = headers_(sh);
  var miss = need.filter(function (n) { return h.indexOf(n) === -1; });
  if (idCol_(sh) === -1) miss.unshift(ID_COLS.join(' أو '));
  return miss;
}

function stopIfMissing_(sh) {
  var miss = missingCols_(sh);
  if (miss.length) {
    SpreadsheetApp.getUi().alert('ما عملت أي تعديل.\nهاي الأعمدة مش موجودة بالصف الأول بنفس الاسم:\n\n' + miss.join('\n'));
    return true;
  }
  return false;
}

// ------------------------------------------------------------------
// القوائم المنسدلة - مرة وحدة
// ------------------------------------------------------------------
function installDropdowns() {
  var sh = booksSheet_();
  if (stopIfMissing_(sh)) return;
  var rows = Math.max(sh.getMaxRows() - 1, 1);
  Object.keys(DROPDOWNS).forEach(function (col) {
    var rule = SpreadsheetApp.newDataValidation()
      .requireValueInList(DROPDOWNS[col], true)
      .setAllowInvalid(false)
      .build();
    sh.getRange(2, colIndex_(sh, col), rows, 1).setDataValidation(rule);
  });
  SpreadsheetApp.getUi().alert('تم تركيب القوائم المنسدلة على عمودي الحالة والنشر.');
}

// ------------------------------------------------------------------
// ترقيم الكتب الجديدة + القيم الافتراضية (الخلايا الفاضية بس)
// ------------------------------------------------------------------
function fillIds_(sh) {
  var idC = idCol_(sh), nameC = colIndex_(sh, NAME_COL);
  var n = sh.getLastRow() - 1;
  if (idC === -1 || nameC === -1 || n < 1) return 0;

  var ids   = sh.getRange(2, idC,   n, 1).getValues();
  var names = sh.getRange(2, nameC, n, 1).getValues();
  var max = 0;
  ids.forEach(function (r) { var v = parseInt(r[0], 10); if (!isNaN(v) && v > max) max = v; });

  var added = 0;
  for (var i = 0; i < n; i++) {
    if (String(names[i][0]).trim() !== '' && String(ids[i][0]).trim() === '') {
      ids[i][0] = ++max;
      added++;
    }
  }
  if (added) sh.getRange(2, idC, n, 1).setValues(ids);
  return added;
}

function fillDefaults_(sh, startRow, numRows) {
  var nameC = colIndex_(sh, NAME_COL);
  if (nameC === -1 || numRows < 1) return;
  var names = sh.getRange(startRow, nameC, numRows, 1).getValues();

  Object.keys(DEFAULTS).forEach(function (col) {
    var c = colIndex_(sh, col);
    if (c === -1) return;
    var rng = sh.getRange(startRow, c, numRows, 1);
    var vals = rng.getValues();
    var changed = false;
    for (var i = 0; i < numRows; i++) {
      if (String(names[i][0]).trim() !== '' && String(vals[i][0]).trim() === '') {
        vals[i][0] = DEFAULTS[col];
        changed = true;
      }
    }
    if (changed) rng.setValues(vals);
  });
}

function completeRows() {
  var sh = booksSheet_();
  if (stopIfMissing_(sh)) return;
  var added = fillIds_(sh);
  if (sh.getLastRow() > 1) fillDefaults_(sh, 2, sh.getLastRow() - 1);
  SpreadsheetApp.getUi().alert('تم.\nكتب جديدة اترقمت: ' + added);
}

// لما تكتب اسم كتاب جديد (أو تلصق عدة كتب): رقم + قيم افتراضية تلقائياً
function onEdit(e) {
  if (!e || !e.range) return;
  var sh = e.range.getSheet();
  if (sh.getIndex() !== 1) return;

  var nameC = colIndex_(sh, NAME_COL);
  if (nameC === -1 || idCol_(sh) === -1) return;

  var c1 = e.range.getColumn(), c2 = c1 + e.range.getNumColumns() - 1;
  if (nameC < c1 || nameC > c2) return;

  var r1 = Math.max(e.range.getRow(), 2);
  var rows = e.range.getLastRow() - r1 + 1;
  if (rows < 1) return;

  fillIds_(sh);
  fillDefaults_(sh, r1, rows);
}

// ------------------------------------------------------------------
// السلاسل: اكتب "1/4/7" بصف واحد، والمزامنة بتعبّي باقي الأعضاء
// ------------------------------------------------------------------
function readSeries_(sh) {
  var idC = idCol_(sh), sC = colIndex_(sh, SERIES_COL);
  var n = sh.getLastRow() - 1;
  if (idC === -1 || sC === -1 || n < 1) return null;
  return {
    sC: sC, n: n,
    ids: sh.getRange(2, idC, n, 1).getValues().map(function (r) { return String(r[0]).trim(); }),
    ser: sh.getRange(2, sC,  n, 1).getValues().map(function (r) { return String(r[0]).trim(); })
  };
}

function syncSeries() {
  var sh = booksSheet_();
  if (stopIfMissing_(sh)) return;
  var d = readSeries_(sh);
  if (!d) return;

  var parent = {};
  function find(x) { while (parent[x] !== x) x = parent[x]; return x; }
  function union(a, b) { a = find(a); b = find(b); if (a !== b) parent[b] = a; }
  d.ids.forEach(function (id) { if (id) parent[id] = id; });

  for (var i = 0; i < d.n; i++) {
    var me = d.ids[i];
    if (!me || d.ser[i] === '' || d.ser[i] === 'لا ينتمي') continue;
    d.ser[i].split('/').forEach(function (p) {
      p = p.trim();
      if (p && parent[p] !== undefined) union(me, p);
    });
  }

  var groups = {};
  d.ids.forEach(function (id) {
    if (!id) return;
    var root = find(id);
    (groups[root] = groups[root] || []).push(id);
  });

  var out = [], count = 0;
  for (var j = 0; j < d.n; j++) {
    var id = d.ids[j];
    if (!id) { out.push([d.ser[j]]); continue; }
    var g = groups[find(id)] || [];
    if (g.length < 2) { out.push(['لا ينتمي']); continue; }
    out.push([g.filter(function (x) { return x !== id; })
               .sort(function (a, b) { return a - b; }).join('/')]);
    count++;
  }
  sh.getRange(2, d.sC, d.n, 1).setValues(out);
  SpreadsheetApp.getUi().alert('تمت المزامنة.\nكتب ضمن سلاسل: ' + count);
}

function checkSeries() {
  var sh = booksSheet_();
  if (stopIfMissing_(sh)) return;
  var d = readSeries_(sh);
  if (!d) return;

  var known = {};
  d.ids.forEach(function (id) { if (id) known[id] = true; });
  var bad = [];
  for (var i = 0; i < d.n; i++) {
    if (!d.ids[i] || d.ser[i] === '' || d.ser[i] === 'لا ينتمي') continue;
    d.ser[i].split('/').forEach(function (p) {
      p = p.trim();
      if (!p) return;
      if (!known[p]) bad.push('صف ' + (i + 2) + ': الرقم ' + p + ' مش موجود');
      else if (p === d.ids[i]) bad.push('صف ' + (i + 2) + ': الكتاب مربوط بحاله');
    });
  }
  SpreadsheetApp.getUi().alert(bad.length ? 'مشاكل:\n\n' + bad.join('\n') : 'كل السلاسل سليمة');
}
