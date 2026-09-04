// ==========================================================
// SPACEBOOK - المنطق المشترك بين كل صفحات الموقع
// عدّلي هون رابط الـ Apps Script بعد ما تنشريه (خطوة بخطوة بالـ README)
// ==========================================================

const API_URL = 'https://script.google.com/macros/s/AKfycbxE9ehOATJPf_EZHk5_3ZLfnGUBooJtDBVozrPn5c2X7MyhGkXE1HfkaxjjPtj23f_7/exec';
const FREE_SHIPPING_MIN = 4;

// ---------- أدوات مساعدة عامة ----------
function getCart() {
  try {
    return JSON.parse(localStorage.getItem('spacebook_cart') || '[]');
  } catch (e) {
    return [];
  }
}

function saveCart(cart) {
  localStorage.setItem('spacebook_cart', JSON.stringify(cart));
  updateCartBadge();
}

function updateCartBadge() {
  const cart = getCart();
  const count = cart.reduce((sum, i) => sum + i.qty, 0);
  document.querySelectorAll('.cart-count').forEach(el => { el.textContent = count; });
}

function addToCart(book) {
  const cart = getCart();
  const existing = cart.find(i => i.title === book.title);
  if (existing) {
    existing.qty += 1;
  } else {
    cart.push({ title: book.title, price: Number(book.price) || 0, cover: book.cover, qty: 1 });
  }
  saveCart(cart);
}

function removeFromCart(title) {
  saveCart(getCart().filter(i => i.title !== title));
}

function setQty(title, qty) {
  const cart = getCart();
  const item = cart.find(i => i.title === title);
  if (!item) return;
  item.qty = Math.max(1, qty);
  saveCart(cart);
}

function cartTotals() {
  const cart = getCart();
  const count = cart.reduce((sum, i) => sum + i.qty, 0);
  const total = cart.reduce((sum, i) => sum + i.qty * i.price, 0);
  return { count, total, freeShipping: count >= FREE_SHIPPING_MIN };
}

// ---------- جلب الكتب من الشيت ----------
let BOOKS_CACHE = null;

async function fetchBooks() {
  if (BOOKS_CACHE) return BOOKS_CACHE;
  try {
    const res = await fetch(API_URL + '?action=books');
    const data = await res.json();
    BOOKS_CACHE = (data.books || []).map(normalizeBook);
    return BOOKS_CACHE;
  } catch (e) {
    console.error('تعذر تحميل الكتب', e);
    return [];
  }
}

function normalizeBook(raw) {
  return {
    title: raw['اسم الكتاب'] || '',
    author: raw['المؤلف'] || '',
    edition: raw['رقم الطبعة'] || '',
    price: raw['سعر البيع'] || 0,
    desc: raw['الوصف'] || '',
    cover: raw['رابط الصورة'] || '',
    status: raw['الحالة'] || 'متوفر',
  };
}

// ---------- إرسال بيانات لـ Apps Script ----------
// ملاحظة: نستخدم Content-Type نصي بسيط لتفادي مشاكل CORS مع Apps Script
async function postToSheet(payload) {
  const res = await fetch(API_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'text/plain;charset=utf-8' },
    body: JSON.stringify(payload),
  });
  return res.json();
}

// ---------- بطاقة كتاب (تستخدم بالصفحة الرئيسية) ----------
function bookCardHTML(book) {
  const isAvailable = book.status === 'متوفر';
  const cover = book.cover
    ? `<img src="${escapeHTML(book.cover)}" alt="${escapeHTML(book.title)}">`
    : `<div class="placeholder">📖</div>`;

  const actionBtn = isAvailable
    ? `<button class="btn btn-primary" onclick='handleAddToCart(${JSON.stringify(book)})'>أضف للسلة</button>`
    : `<button class="btn btn-outline" onclick='openNotifyModal(${JSON.stringify(book.title)})'>أبلغني لما يتوفر</button>`;

  return `
    <div class="book-card">
      <div class="book-cover">${cover}</div>
      <div class="book-body">
        ${!isAvailable ? '<span class="out-of-stock">خالص حالياً</span>' : ''}
        <div class="book-title">${escapeHTML(book.title)}</div>
        ${book.author ? `<div class="book-author">${escapeHTML(book.author)}</div>` : ''}
        ${book.desc ? `<div class="book-desc">${escapeHTML(book.desc)}</div>` : ''}
        <div class="book-footer">
          <span class="book-price">${book.price} د.أ</span>
        </div>
        ${actionBtn}
      </div>
    </div>
  `;
}

function handleAddToCart(book) {
  addToCart(book);
  toast('تمت إضافة الكتاب للسلة 🎉'.replace('🎉', '')); // بدون إيموجي افتراضي، أزيليها لو حابة
}

function escapeHTML(str) {
  const div = document.createElement('div');
  div.textContent = str == null ? '' : String(str);
  return div.innerHTML;
}

// ---------- تنبيه بسيط أسفل الشاشة ----------
function toast(msg) {
  let el = document.getElementById('toast');
  if (!el) {
    el = document.createElement('div');
    el.id = 'toast';
    el.style.cssText = `
      position:fixed;bottom:24px;left:50%;transform:translateX(-50%);
      background:#0b3d3a;color:#fff;padding:12px 22px;border-radius:999px;
      font-family:Cairo,sans-serif;font-weight:700;z-index:200;box-shadow:0 8px 20px rgba(0,0,0,.2);
      opacity:0;transition:opacity .25s ease;
    `;
    document.body.appendChild(el);
  }
  el.textContent = msg;
  el.style.opacity = '1';
  clearTimeout(el._t);
  el._t = setTimeout(() => { el.style.opacity = '0'; }, 2200);
}

// ---------- مودال "أبلغني لما يتوفر" ----------
function openNotifyModal(bookTitle) {
  const overlay = document.createElement('div');
  overlay.className = 'modal-overlay';
  overlay.innerHTML = `
    <div class="modal-box">
      <button class="modal-close" onclick="this.closest('.modal-overlay').remove()">×</button>
      <h3>أبلغني لما يتوفر</h3>
      <p class="sub">"${escapeHTML(bookTitle)}" — بنحكيلك أول ما يرجع يتوفر</p>
      <form class="simple-form" id="notifyForm">
        <div class="field">
          <label>اسمك</label>
          <input type="text" name="name" required>
        </div>
        <div class="field">
          <label>رقم التلفون</label>
          <input type="tel" name="phone" required>
        </div>
        <button type="submit" class="btn btn-primary btn-full">إرسال</button>
        <div class="form-msg" id="notifyMsg"></div>
      </form>
    </div>
  `;
  document.body.appendChild(overlay);
  overlay.querySelector('#notifyForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    const fd = new FormData(e.target);
    const msgEl = overlay.querySelector('#notifyMsg');
    msgEl.textContent = 'جاري الإرسال...';
    msgEl.className = 'form-msg';
    try {
      await postToSheet({
        type: 'notify',
        book: bookTitle,
        name: fd.get('name'),
        phone: fd.get('phone'),
      });
      msgEl.textContent = 'تمام! رح نحكيلك أول ما يتوفر 💛'.replace(' 💛', '');
      msgEl.className = 'form-msg ok';
      setTimeout(() => overlay.remove(), 1600);
    } catch (err) {
      msgEl.textContent = 'صار في خطأ، حاولي كمان مرة';
      msgEl.className = 'form-msg err';
    }
  });
}

document.addEventListener('DOMContentLoaded', updateCartBadge);
