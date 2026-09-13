// ==========================================================
// مكتبة Space Books - المنطق المشترك
// ==========================================================
const API_BASE = '/api';   // الباك اند على n8n عبر nginx (نفس الأصل)
const FREE_SHIPPING_MIN = 4;
const SHIPPING_FEE = 2;   // دينارين إذا أقل من 4 كتب

/* ---------------- نصوص الموقع: من /api/texts حصراً، بديل عن أي نص ثابت بالكود ---------------- */
let TEXTS={};
const textsReady=(async()=>{
  try{
    const res=await fetch(API_BASE+'/texts');
    if(res.ok){ const d=await res.json(); TEXTS=d.texts||{}; }
  }catch(e){ console.error('تعذر تحميل نصوص الموقع',e); }
})();
window.textsReady=textsReady;
function T(key,fallback){ const v=TEXTS[key]; return (v!=null && v!=='') ? v : fallback; }
function applyTexts(){
  document.querySelectorAll('[data-key]').forEach(el=>{
    const v=TEXTS[el.dataset.key];
    if(v!=null && v!=='') el.textContent=v;
  });
  document.querySelectorAll('[data-key-ph]').forEach(el=>{
    const v=TEXTS[el.dataset.keyPh];
    if(v!=null && v!=='') el.placeholder=v;
  });
}

/* ---------------- السلة ---------------- */
function getCart(){ try{ return JSON.parse(localStorage.getItem('spacebooks_cart')||'[]'); }catch(e){ return []; } }
function saveCart(c){ localStorage.setItem('spacebooks_cart', JSON.stringify(c)); updateBadge(); }
function updateBadge(){
  const n = getCart().reduce((s,i)=>s+i.qty,0);
  document.querySelectorAll('.cart-count').forEach(el=>{ el.textContent = n; });
}
function addToCart(item){
  const cart = getCart();
  const found = cart.find(i=>i.title===item.title);
  if(found) found.qty += 1;
  else cart.push({ title:item.title, price:Number(item.price)||0, cover:item.cover||'', qty:1, kind:item.kind||'book' });
  saveCart(cart);
}
function removeFromCart(t){ saveCart(getCart().filter(i=>i.title!==t)); }
function setQty(t,q){
  const cart=getCart(), it=cart.find(i=>i.title===t);
  if(!it) return;
  it.qty=Math.max(1,q); saveCart(cart);
}
function cartTotals(){
  const cart=getCart();
  const count=cart.reduce((s,i)=>s+i.qty,0);
  const sub=cart.reduce((s,i)=>s+i.qty*i.price,0);
  const freeShipping=count>=FREE_SHIPPING_MIN;
  const shipping=(count===0||freeShipping)?0:SHIPPING_FEE;
  const r=n=>Math.round(n*100)/100;
  return { count, subtotal:r(sub), shipping, total:r(sub+shipping), freeShipping };
}

/* ---------------- أدوات عامة ---------------- */
function esc(s){ const d=document.createElement('div'); d.textContent = s==null?'':String(s); return d.innerHTML; }
function escAttr(s){
  return String(s==null?'':s).replace(/&/g,'&amp;').replace(/</g,'&lt;')
    .replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&#39;');
}
function toast(msg){
  let el=document.getElementById('toast');
  if(!el){
    el=document.createElement('div'); el.id='toast';
    el.style.cssText='position:fixed;bottom:26px;left:50%;transform:translateX(-50%);background:#1d1e4e;color:#fff;padding:13px 24px;border-radius:999px;font-family:Cairo,sans-serif;font-weight:800;font-size:.9rem;z-index:400;box-shadow:0 10px 26px rgba(0,0,0,.25);opacity:0;transition:opacity .25s;pointer-events:none';
    document.body.appendChild(el);
  }
  el.textContent=msg; el.style.opacity='1';
  clearTimeout(el._t); el._t=setTimeout(()=>{ el.style.opacity='0'; },2200);
}
function stars(rating){
  const r=Number(rating)||0;
  if(!r) return '';
  const full=Math.round(r);
  return '★'.repeat(Math.min(full,5)) + '☆'.repeat(Math.max(0,5-full));
}

/* ---------------- جلب الكتب ---------------- */
let BOOKS=null;
let BUNDLE_ONLY_IDS=new Set();

async function fetchBooks(){
  if(BOOKS) return BOOKS;
  try{
    const res=await fetch(API_BASE+'/books');
    if(!res.ok) throw new Error('books '+res.status);
    const data=await res.json();
    BOOKS=(data.books||[]).map(normalize).filter(isPublished);
    return BOOKS;
  }catch(e){
    console.error('تعذر تحميل الكتب',e);
    return [];
  }
}
function normalize(raw){
  const t=v=>String(v==null?'':v).trim();
  return {
    id:t(raw.id), title:t(raw.title), author:t(raw.author), desc:t(raw.desc),
    cover:t(raw.cover), rating:t(raw.rating), ratings:t(raw.ratings),
    goodreads:t(raw.goodreads), aboutAuthor:t(raw.aboutAuthor),
    price:Number(raw.price)||0, status:t(raw.status)||'متوفر',
    language:t(raw.language),
  };
}

/* ---------------- السلاسل: من تبويب "السلاسل" حصراً عبر /api/series ---------------- */
let SERIES=[];
async function fetchSeries(){
  try{
    const res=await fetch(API_BASE+'/series');
    if(!res.ok) throw new Error('series '+res.status);
    const data=await res.json();
    SERIES=(data.series||[]).map(normalizeSeries);
  }catch(e){
    console.error('تعذر تحميل السلاسل',e);
    SERIES=[];
  }
}
function normalizeSeries(raw){
  const t=v=>String(v==null?'':v).trim();
  return {
    id:t(raw.id), name:t(raw.name), desc:t(raw.desc), cover:t(raw.cover),
    price:Number(raw.price)||0, discount:t(raw.discount),
    available: raw.available!==false,
    memberIds: Array.isArray(raw.memberIds) ? raw.memberIds.map(t) : [],
    members: Array.isArray(raw.members) ? raw.members.map(m=>({
      id:t(m.id), title:t(m.title), cover:t(m.cover), price:Number(m.price)||0,
      author:t(m.author), rating:m.rating!=null&&m.rating!=='' ? Number(m.rating) : 0,
      published:m.published!==false,
    })) : [],
    author:t(raw.author), rating: raw.rating!=null && raw.rating!=='' ? Number(raw.rating) : 0,
    sellMode: raw.sellMode==='full' ? 'full' : 'normal',
    language:t(raw.language),
  };
}
function isSeriesAvailable(s){ return s.available!==false; }

/* ---------------- البانرات: من /api/banners حصراً ---------------- */
let BANNERS=[];
async function fetchBanners(){
  try{
    const res=await fetch(API_BASE+'/banners');
    if(!res.ok) throw new Error('banners '+res.status);
    const data=await res.json();
    BANNERS=(data.banners||[]).map(b=>({
      id:String(b.id||'').trim(),
      title:String(b.title||'').trim(),
      desc:String(b.body||'').trim(),
      lead:String(b.lead||'').trim(),
      target:String(b.dest||'').trim() || 'books',
      cover:String(b.cover||'').trim(),
      order:Number(b.order)||0,
    })).sort((a,b)=>a.order-b.order);
  }catch(e){
    console.error('تعذر تحميل البانرات',e);
    BANNERS=[];
  }
}
function bannerHTML(b){
  const lead=b.lead?`<p class="lead">${esc(b.lead)}</p>`:'';
  const title=b.title?`<h2>${esc(b.title)}</h2>`:'';
  const desc=b.desc?`<p>${esc(b.desc)}</p>`:'';
  const image=b.cover?` style="background-image:url('${escAttr(b.cover)}')"` : '';
  const go=b.target||'books';
  return `<div class="slide${image?'':' no-bg'}"${image} data-go="${escAttr(go)}">${lead}${title}${desc}</div>`;
}

/* ---------------- روابط تواصل معنا: من /api/contact حصراً ---------------- */
const CONTACT_ICONS={
  facebook:'<svg width="22" height="22" viewBox="0 0 24 24" fill="currentColor"><path d="M22 12a10 10 0 1 0-11.56 9.88v-6.99H7.9V12h2.54V9.8c0-2.5 1.49-3.89 3.77-3.89 1.09 0 2.24.2 2.24.2v2.46h-1.26c-1.24 0-1.63.77-1.63 1.56V12h2.78l-.45 2.89h-2.33v6.99A10 10 0 0 0 22 12z"/></svg>',
  instagram:'<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><rect x="2" y="2" width="20" height="20" rx="5.5"/><circle cx="12" cy="12" r="4"/><circle cx="17.5" cy="6.5" r="1.2" fill="currentColor" stroke="none"/></svg>',
  whatsapp:'<svg width="22" height="22" viewBox="0 0 24 24" fill="currentColor"><path d="M17.5 14.4c-.3-.15-1.77-.87-2.04-.97-.27-.1-.47-.15-.67.15-.2.3-.77.97-.94 1.17-.17.2-.35.22-.65.07-.3-.15-1.26-.46-2.4-1.48-.89-.79-1.49-1.77-1.66-2.07-.17-.3-.02-.46.13-.61.13-.13.3-.35.45-.52.15-.17.2-.3.3-.5.1-.2.05-.37-.02-.52-.08-.15-.67-1.61-.92-2.21-.24-.58-.49-.5-.67-.51h-.57c-.2 0-.52.07-.79.37-.27.3-1.04 1.02-1.04 2.48s1.06 2.88 1.21 3.08c.15.2 2.1 3.2 5.08 4.49.71.3 1.26.49 1.7.63.71.23 1.36.19 1.87.12.57-.09 1.77-.72 2.02-1.42.25-.7.25-1.3.17-1.42-.07-.13-.27-.2-.57-.35z"/><path d="M12 2a10 10 0 0 0-8.6 15.06L2 22l5.05-1.32A10 10 0 1 0 12 2zm0 18.2a8.2 8.2 0 0 1-4.18-1.14l-.3-.18-3 .79.8-2.92-.2-.31A8.2 8.2 0 1 1 12 20.2z"/></svg>',
  other:'<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M10 13a5 5 0 0 0 7 0l3-3a5 5 0 0 0-7-7l-1 1"/><path d="M14 11a5 5 0 0 0-7 0l-3 3a5 5 0 0 0 7 7l1-1"/></svg>',
};
let CONTACT_LINKS=[];
async function fetchContact(){
  try{
    const res=await fetch(API_BASE+'/contact');
    if(!res.ok) throw new Error('contact '+res.status);
    const data=await res.json();
    CONTACT_LINKS=(data.contact||[]);
  }catch(e){ console.error('تعذر تحميل روابط التواصل',e); CONTACT_LINKS=[]; }
}
function renderContactLinks(){
  const box=document.getElementById('contactSocials');
  if(!box || !CONTACT_LINKS.length) return;
  box.innerHTML=CONTACT_LINKS.map(c=>{
    const icon=CONTACT_ICONS[c.type]||CONTACT_ICONS.other;
    return `<a class="social ${esc(c.type||'other')}" href="${escAttr(c.url)}" target="_blank" rel="noopener" aria-label="${escAttr(c.name)}">${icon}</a>`;
  }).join('');
}

function seriesMembers(s){
  if(s.members && s.members.length) return s.members;
  return (s.memberIds||[]).map(findBook).filter(Boolean);
}
function seriesAvgRating(members){
  const nums=members.map(m=>parseFloat(m.rating)).filter(n=>!isNaN(n));
  return nums.length ? nums.reduce((s,n)=>s+n,0)/nums.length : 0;
}
// الباك اند بيرجّع المنشور بس، فهون بنتأكد إنه في اسم وسعر
function isPublished(b){ return b.title && b.price>0; }
function isAvailable(b){ return b.status !== 'غير متوفر'; }

/* ---------------- الإرسال للشيت ---------------- */
async function postToSheet(payload){
  const res=await fetch(API_BASE+'/submit',{
    method:'POST',
    headers:{'Content-Type':'application/json'},
    body:JSON.stringify(payload),
  });
  const data=await res.json().catch(()=>({}));
  // أي رد مش ناجح لازم يوصل للواجهة كخطأ، مش كنجاح
  if(!res.ok || !data.success) throw new Error(data.error||('submit '+res.status));
  return data;
}

/* ---------------- بطاقة كتاب ---------------- */
function resizedCover(url, width){
  if(!url) return url;
  return /^https?:\/\/lh3\.googleusercontent\.com\/d\//.test(url) ? `${url}=w${width}` : url;
}
function coverHTML(b, cls, width){
  return b.cover
    ? `<img src="${escAttr(resizedCover(b.cover, width||400))}" alt="${escAttr(b.title)}" loading="lazy">`
    : `<span class="${cls||'ph'}">📖</span>`;
}
function bookCardHTML(b){
  const avail=isAvailable(b);
  const rate=b.rating ? `<div class="rating"><span class="stars">${stars(b.rating)}</span> ${esc(b.rating)}${b.ratings?` <span>(${esc(b.ratings)})</span>`:''}</div>` : '';
  return `
    <article class="book-card js-open" data-id="${escAttr(b.id||b.title)}">
      ${avail?'':`<span class="tag tag-out">${esc(T('common.sold_out_tag','خالص حالياً'))}</span>`}
      <div class="book-cover">${coverHTML(b)}</div>
      <div class="book-body">
        <h3 class="book-title">${esc(b.title)}</h3>
        <div class="book-meta">
          ${b.author?`<a class="book-author js-author" data-author="${escAttr(b.author)}">${esc(b.author)}</a>`:''}
          ${rate}
        </div>
        <div class="book-foot">
          <span class="price">${b.price} <small>د.أ</small></span>
          ${avail
            ? `<button class="btn btn-cyan btn-sm js-add" data-id="${escAttr(b.id||b.title)}">${esc(T('book.add_short','أضف'))}</button>`
            : `<button class="btn btn-outline btn-sm js-notify" data-id="${escAttr(b.id||b.title)}">${esc(T('book.notify_short','خبّرني'))}</button>`}
        </div>
      </div>
    </article>`;
}
function findBook(id){ return (BOOKS||[]).find(b=>(b.id||b.title)===id); }
function findSeries(id){ return (SERIES||[]).find(s=>s.id===id); }

/* ---------------- المودال ---------------- */
function openModal(inner){
  const ov=document.createElement('div');
  ov.className='overlay';
  ov.innerHTML=`<div class="modal"><button class="modal-x" aria-label="إغلاق">×</button><div class="modal-pad">${inner}</div></div>`;
  ov.addEventListener('click',e=>{ if(e.target===ov||e.target.classList.contains('modal-x')) ov.remove(); });
  document.addEventListener('keydown',function esc2(e){ if(e.key==='Escape'){ ov.remove(); document.removeEventListener('keydown',esc2); } });
  document.body.appendChild(ov);
  return ov;
}

function openBook(id){
  const b=findBook(id); if(!b) return;
  const avail=isAvailable(b);
  const rate=b.rating
    ? `<span class="chip"><span class="stars">${stars(b.rating)}</span> ${esc(b.rating)} من 5${b.ratings?` · ${esc(b.ratings)} تقييم`:''}</span>` : '';
  const gr=b.goodreads
    ? `<a class="gr-link" href="${escAttr(b.goodreads)}" target="_blank" rel="noopener">${esc(T('book.goodreads_link','اقرأ أكثر على Goodreads ↗'))}</a>` : '';

  const ov=openModal(`
    <div class="detail">
      <div class="detail-cover">${coverHTML(b,'',700)}</div>
      <div>
        <h2>${esc(b.title)}</h2>
        ${b.author?`<a class="book-author js-author" data-author="${escAttr(b.author)}" style="font-size:.95rem">${esc(b.author)}</a>`:''}
        <div class="meta-row">
          <span class="chip chip-price">${b.price} د.أ</span>
          ${rate}
          <span class="chip" style="${avail?'':'color:#f43f5e'}">${avail?esc(T('book.available_tag','متوفر')):esc(T('common.sold_out_tag','خالص حالياً'))}</span>
        </div>
        ${avail
          ? `<button class="btn btn-cyan js-add" data-id="${escAttr(b.id||b.title)}">${esc(T('book.add_full','أضف للسلة'))}</button>`
          : `<button class="btn btn-outline js-notify" data-id="${escAttr(b.id||b.title)}">${esc(T('book.notify_full','خبّرني بس يتوفر'))}</button>`}
        ${b.desc?`<div class="block-title">${esc(T('book.about_book','عن الكتاب'))}</div><div class="block-body">${esc(b.desc)}</div>`:''}
        ${gr}
        ${b.aboutAuthor?`<div class="block-title">${esc(T('book.about_author','عن المؤلف'))}</div><div class="block-body">${esc(b.aboutAuthor)}</div>`:''}
      </div>
    </div>`);
  return ov;
}

/* ---------------- أعلمني لما يتوفر ---------------- */
function openNotify(id){
  const b=findBook(id); const title=b?b.title:id;
  const ov=openModal(`
    <h3>${esc(T('book.notify_full','خبّرني بس يتوفر'))}</h3>
    <p class="sub">"${esc(title)}" - بنحكيلك أول ما يرجع</p>
    <form id="nForm">
      <div class="field"><label>${esc(T('notify.label_name','اسمك'))}</label><input type="text" name="name" required></div>
      <div class="field"><label>${esc(T('notify.label_phone','رقمك أو وسيلة تواصل'))}</label><input type="text" name="phone" required placeholder="${escAttr(T('notify.phone_ph','رقم، أو حساب انستغرام/تيليجرام، أو رابط فيسبوك'))}"></div>
      <input type="text" name="website" class="hp-field" tabindex="-1" autocomplete="off" aria-hidden="true">
      <button type="submit" class="btn btn-cyan btn-full">${esc(T('common.send_button','إرسال'))}</button>
      <div class="form-msg" id="nMsg"></div>
    </form>`);
  ov.querySelector('#nForm').addEventListener('submit',async e=>{
    e.preventDefault();
    const fd=new FormData(e.target), m=ov.querySelector('#nMsg');
    m.textContent=T('common.sending','جاري الإرسال...'); m.className='form-msg';
    try{
      await postToSheet({ type:'notify', bookId:b?b.id:'', book:title, name:fd.get('name'), phone:fd.get('phone'), hp:fd.get('website')||'' });
      m.textContent=T('notify.success','تمام! رح نحكيلك أول ما يتوفر'); m.className='form-msg ok';
      setTimeout(()=>ov.remove(),1500);
    }catch(err){ m.textContent=T('common.error','صار في خطأ، حاول كمان مرة'); m.className='form-msg err'; }
  });
}

/* ---------------- بطاقة السلسلة ---------------- */
function seriesCardHTML(s){
  const avail=isSeriesAvailable(s);
  const count=(s.memberIds||[]).length;
  const rate=s.rating ? `<div class="rating"><span class="stars">${stars(s.rating)}</span> ${esc(s.rating)}</div>` : '';
  return `
    <article class="book-card js-series" data-id="${escAttr(s.id)}">
      ${avail?'':`<span class="tag tag-out">${esc(T('common.sold_out_tag','خالص حالياً'))}</span>`}
      <span class="tag tag-series${avail?'':' tag-alt'}">سلسلة · ${count} أجزاء</span>
      <div class="book-cover">${s.cover?`<img src="${escAttr(resizedCover(s.cover,400))}" alt="" loading="lazy">`:'<span class="ph">📚</span>'}</div>
      <div class="book-body">
        <h3 class="book-title">${esc(s.name)}</h3>
        <div class="book-meta">
          ${s.author?`<span class="book-author">${esc(s.author)}</span>`:''}
          ${rate}
          ${s.discount?`<div class="book-author" style="color:var(--rose)">خصم: ${esc(s.discount)}</div>`:''}
        </div>
        <div class="book-foot">
          <span class="price">${s.price} <small>د.أ</small></span>
          ${avail
            ? `<button class="btn btn-amber btn-sm js-series-add" data-id="${escAttr(s.id)}">${esc(T('series.add_full','خُدها كاملة'))}</button>`
            : `<button class="btn btn-outline btn-sm js-series" data-id="${escAttr(s.id)}">${esc(T('series.details_button','التفاصيل'))}</button>`}
        </div>
      </div>
    </article>`;
}
function openSeries(id){
  const s=findSeries(id); if(!s) return;
  const avail=isSeriesAvailable(s);
  const bundleOnly=s.sellMode==='full';
  const members=seriesMembers(s);
  const list=members.map(m=>`
    <div class="cart-item">
      <div class="thumb">${m.cover?`<img src="${escAttr(m.cover)}" alt="">`:'📖'}</div>
      <div class="info"><b>${esc(m.title)}</b><span style="font-size:.85rem;color:var(--ink-soft)">${m.price} د.أ</span></div>
      ${(bundleOnly||m.published===false)?'':`<button class="btn btn-outline btn-sm js-add" data-id="${escAttr(m.id||m.title)}">${esc(T('book.add_short','أضف'))}</button>`}
    </div>`).join('');
  openModal(`
    <h3>${esc(s.name)}</h3>
    ${s.author?`<a class="book-author" style="font-size:.95rem">${esc(s.author)}</a>`:''}
    ${s.rating?`<div class="chip"><span class="stars">${stars(s.rating)}</span> ${esc(s.rating)} من 5</div>`:''}
    <p class="sub">${bundleOnly ? T('series.bundle_only_note','هاي السلسلة بتنباع كاملة بس، مش أجزاء لحالها') : (members.length+' أجزاء - خُدها كاملة أو أي جزء لحاله')}</p>
    ${s.desc?`<div class="block-body" style="margin-bottom:16px">${esc(s.desc)}</div>`:''}
    <div style="background:#fff;border:1px solid var(--line);border-radius:16px;padding:16px;margin-bottom:18px;display:flex;align-items:center;justify-content:space-between;gap:12px;flex-wrap:wrap">
      <div><b style="color:var(--navy)">${esc(T('series.full_series','السلسلة كاملة'))}</b><div style="font-size:.85rem;color:var(--ink-soft)">${members.length} أجزاء${s.discount?` · خصم: ${esc(s.discount)}`:''}</div></div>
      <div style="display:flex;align-items:center;gap:12px">
        <span class="price">${s.price} د.أ</span>
        ${avail?`<button class="btn btn-amber js-series-add" data-idx="${idx}">${esc(T('series.add_series','أضف السلسلة'))}</button>`:`<span class="tag tag-out" style="position:static">${esc(T('common.sold_out_tag','خالص حالياً'))}</span>`}
      </div>
    </div>
    <div class="block-title">${esc(T('series.parts_title','أجزاء السلسلة'))}</div>
    ${list}`);
}

/* ---------------- بحث ذكي: عربي/إنجليزي، متسامح مع الأخطاء الإملائية والهمزات وأل التعريف ---------------- */
function normalizeSearchText(s){
  s=String(s||'').toLowerCase();
  s=s.replace(/[ً-ٰٟۖ-ۭ]/g,'');   // تشكيل
  s=s.replace(/[إأآا]/g,'ا');
  s=s.replace(/ى/g,'ي');
  s=s.replace(/ة/g,'ه');
  s=s.replace(/ؤ/g,'و');
  s=s.replace(/ئ/g,'ي');
  s=s.replace(/ـ/g,'');   // تطويل
  s=s.replace(/[^\p{L}\p{N}\s]/gu,' ');
  return s.replace(/\s+/g,' ').trim();
}
function stripAl(w){ return (w.length>2 && w.slice(0,2)==='ال') ? w.slice(2) : w; }
function tokenizeSearch(s){ return normalizeSearchText(s).split(' ').filter(Boolean).map(stripAl); }
function levenshtein(a,b){
  if(a===b) return 0;
  const al=a.length, bl=b.length;
  if(!al) return bl; if(!bl) return al;
  let prev=[]; for(let j=0;j<=bl;j++) prev[j]=j;
  for(let i=1;i<=al;i++){
    const cur=[i];
    for(let j=1;j<=bl;j++){
      const cost=a[i-1]===b[j-1]?0:1;
      cur[j]=Math.min(prev[j]+1, cur[j-1]+1, prev[j-1]+cost);
    }
    prev=cur;
  }
  return prev[bl];
}
function wordMatchScore(q,w){
  if(!q||!w) return 0;
  if(w===q) return 3;
  if(w.indexOf(q)===0) return 2.5;
  if(w.indexOf(q)!==-1) return 2;
  const tolerance = q.length<=3?1:(q.length<=6?2:3);
  const dist=levenshtein(q,w);
  if(dist<=tolerance) return 1.5-(dist/Math.max(q.length,w.length))*0.5;
  return 0;
}
// كل التوكنز بالسؤال لازم تلاقي مطابقة بإشي (AND) - بيرجع -1 لو أي توكن ما لقى شي
function searchItemScore(queryTokens, weightedFields){
  let total=0;
  for(const qt of queryTokens){
    let best=0;
    for(const [text,weight] of weightedFields){
      if(!text) continue;
      for(const w of tokenizeSearch(text)){
        const sc=wordMatchScore(qt,w)*weight;
        if(sc>best) best=sc;
      }
    }
    if(best<=0) return -1;
    total+=best;
  }
  return total;
}
function searchCatalog(query){
  const qTokens=tokenizeSearch(query);
  if(!qTokens.length) return null;
  const bookResults=(BOOKS||[]).filter(b=>!BUNDLE_ONLY_IDS.has(String(b.id||''))).map(b=>({
    kind:'book', data:b,
    score:searchItemScore(qTokens,[[b.title,3],[b.author,2]]),
  })).filter(r=>r.score>=0);
  const seriesResults=(SERIES||[]).map(s=>{
    const members=seriesMembers(s);
    return {
      kind:'series', data:s,
      score:searchItemScore(qTokens,[
        [s.name,3],
        [members.map(m=>m.author).join(' '),2],
        [members.map(m=>m.title).join(' '),1],
      ]),
    };
  }).filter(r=>r.score>=0);
  return [...bookResults,...seriesResults].sort((a,b)=>b.score-a.score);
}

/* ---------------- عرض الكتب: فلترة وترتيب ---------------- */
let SEARCH_QUERY='';
let AUTHOR_FILTER='';
let VIEW_FILTER='all';   // all | books | series
let LANG_FILTER='';      // '' | عربي | انجليزي | مترجم
let SORT_MODE='default'; // default | title | author | rating | price | newest
const PAGE_SIZE=18;
let VISIBLE_COUNT=PAGE_SIZE;

function paginatedHTML(cards, emptyMsg){
  const shown=cards.slice(0,VISIBLE_COUNT);
  const remaining=cards.length-shown.length;
  const moreBtn=remaining>0
    ? `<button class="btn btn-outline js-load-more" style="grid-column:1/-1;margin:16px auto 0">${esc(T('books.load_more','اعرض المزيد'))}</button>`
    : '';
  return (shown.join('') || emptyMsg) + moreBtn;
}

function bookEntryValue(b,mode){
  switch(mode){
    case 'title': return b.title;
    case 'author': return b.author;
    case 'rating': return parseFloat(b.rating)||0;
    case 'price': return b.price;
    case 'newest': case 'natural': return parseInt(b.id,10)||0;
    default: return 0;
  }
}
function seriesEntryValue(s,mode){
  switch(mode){
    case 'title': return s.name;
    case 'author': { const m=seriesMembers(s); return (m[0]&&m[0].author)||''; }
    case 'rating': return seriesAvgRating(seriesMembers(s));
    case 'price': return s.price;
    case 'newest': case 'natural': return parseInt(String(s.id).replace(/^sb-/i,''),10)||0;
    default: return 0;
  }
}
function compareByMode(A,B,mode){
  if(mode==='rating'||mode==='newest') return (Number(B)||0)-(Number(A)||0);
  if(mode==='price'||mode==='natural') return (Number(A)||0)-(Number(B)||0);
  return String(A).localeCompare(String(B),'ar');
}

function renderBooks(loadMore){
  const grid=document.getElementById('booksGrid');
  if(!grid) return;
  if(!loadMore) VISIBLE_COUNT=PAGE_SIZE;

  const query=SEARCH_QUERY.trim();
  if(query){
    const bar=document.getElementById('authorBar');
    if(bar) bar.classList.remove('on');
    const results=searchCatalog(query)||[];
    const cnt=document.getElementById('booksCount');
    if(cnt) cnt.textContent = results.length ? `${results.length} ${T('books.search_result_for','نتيجة لـ')} "${query}"` : `${T('books.search_no_results','ما في نتائج لـ')} "${query}"`;
    const cards=results.map(r=>r.kind==='book'?bookCardHTML(r.data):seriesCardHTML(r.data,SERIES.indexOf(r.data)));
    grid.innerHTML = paginatedHTML(cards, `<p style="color:var(--ink-soft)">${esc(T('books.search_hint','جرّب كلمة أخرى أو تأكد من الإملاء.'))}</p>`);
    return;
  }

  let list=BOOKS||[];
  if(BUNDLE_ONLY_IDS.size) list=list.filter(b=>!BUNDLE_ONLY_IDS.has(String(b.id||'')));
  if(AUTHOR_FILTER) list=list.filter(b=>b.author===AUTHOR_FILTER);
  if(LANG_FILTER) list=list.filter(b=>b.language===LANG_FILTER);

  const showSeries = !AUTHOR_FILTER && VIEW_FILTER!=='books';
  const showBooksList = AUTHOR_FILTER || VIEW_FILTER!=='series';
  let seriesList = showSeries ? (SERIES||[]) : [];
  if(LANG_FILTER) seriesList=seriesList.filter(s=>s.language===LANG_FILTER);

  const bar=document.getElementById('authorBar');
  if(bar){
    bar.classList.toggle('on',!!AUTHOR_FILTER);
    if(AUTHOR_FILTER) document.getElementById('authorName').textContent=AUTHOR_FILTER;
  }
  const cnt=document.getElementById('booksCount');
  if(cnt){
    cnt.textContent = (VIEW_FILTER==='series' && !AUTHOR_FILTER)
      ? (seriesList.length ? `${seriesList.length} ${T('books.series_available','سلسلة متاحة')}` : T('books.empty_series','ما في سلاسل لعرضها حالياً'))
      : (list.length ? `${list.length} ${T('books.books_available','كتاب متاح')}` : T('books.empty_list','ما في كتب لعرضها حالياً'));
  }

  let cards;
  if(VIEW_FILTER==='all' && !AUTHOR_FILTER){
    // بمزج الكتب والسلاسل بنفس ترتيب الفرز، بدل ما تكون السلاسل دايماً بالأول
    const mergeMode = SORT_MODE==='default' ? 'natural' : SORT_MODE;
    const entries=[
      ...list.map(b=>({v:bookEntryValue(b,mergeMode), node:bookCardHTML(b)})),
      ...seriesList.map((s,i)=>({v:seriesEntryValue(s,mergeMode), node:seriesCardHTML(s,i)})),
    ];
    entries.sort((x,y)=>compareByMode(x.v,y.v,mergeMode));
    cards = entries.map(en=>en.node);
  }else{
    const sortedList = SORT_MODE==='default' ? list
      : [...list].sort((a,b)=>compareByMode(bookEntryValue(a,SORT_MODE),bookEntryValue(b,SORT_MODE),SORT_MODE));
    const seriesPairs = seriesList.map((s,i)=>[s,i]);
    const sortedSeries = SORT_MODE==='default' ? seriesPairs
      : [...seriesPairs].sort((a,b)=>compareByMode(seriesEntryValue(a[0],SORT_MODE),seriesEntryValue(b[0],SORT_MODE),SORT_MODE));
    const seriesCards = showSeries ? sortedSeries.map(([s,i])=>seriesCardHTML(s,i)) : [];
    const bookCards = showBooksList ? sortedList.map(bookCardHTML) : [];
    cards = [...seriesCards, ...bookCards];
  }

  grid.innerHTML = paginatedHTML(cards, `<p style="color:var(--ink-soft)">${esc(T('books.empty_search','ما في كتب لعرضها حالياً.'))}</p>`);
}


/* ---------------- البانر المتحرك: render من BANNERS ثم init التفاعل ---------------- */
function renderBanners(){
  const slidesContainer=document.getElementById('slides');
  if(!slidesContainer) return;
  slidesContainer.innerHTML=BANNERS.map(bannerHTML).join('') || '<div class="slide" data-go="books"><h2>مكتبة SPACEBOOKs</h2><p>كتب مختارة بعناية، بأسعار في متناول الجميع.</p></div>';
}
function initBanner(){
  const slides=[...document.querySelectorAll('#slides .slide')];
  const dots=document.getElementById('dots');
  if(slides.length<1||!dots) return;
  let i=0, timer;
  dots.innerHTML=slides.map((_,n)=>`<button class="dot${n===0?' on':''}" data-n="${n}" aria-label="شريحة ${n+1}"></button>`).join('');
  const show=n=>{
    i=(n+slides.length)%slides.length;
    slides.forEach((s,x)=>s.classList.toggle('on',x===i));
    [...dots.children].forEach((d,x)=>d.classList.toggle('on',x===i));
  };
  const start=()=>{ show(0); clearInterval(timer); timer=setInterval(()=>show(i+1),5000); };

  // الضغط على الشريحة بوديك للمكان المرتبط فيها
  document.getElementById('slides').addEventListener('click',e=>{
    const sl=e.target.closest('.slide[data-go]'); if(!sl) return;
    const go=sl.dataset.go;
    if(go==='books'){ document.getElementById('books')?.scrollIntoView({behavior:'smooth'}); return; }
    if(go.startsWith('tool:')){
      const name=go.slice(5);
      document.getElementById('tools')?.scrollIntoView({behavior:'smooth'});
      setTimeout(()=>document.querySelector(`.tool-ico[data-tool="${name}"]`)?.click(),420);
    }
  });
  dots.addEventListener('click',e=>{
    const b=e.target.closest('.dot'); if(!b) return;
    show(Number(b.dataset.n)); start();
  });
  start();
}

/* ---------------- شريط الأدوات ---------------- */
function initTools(){
  const icons=document.getElementById('toolIcons');
  if(!icons) return;
  icons.addEventListener('click',e=>{
    const btn=e.target.closest('.tool-ico'); if(!btn) return;
    const name=btn.dataset.tool;
    const panel=document.getElementById('panel-'+name);
    const isOn=panel.classList.contains('on');
    document.querySelectorAll('.tool-panel').forEach(p=>p.classList.remove('on'));
    document.querySelectorAll('.tool-ico').forEach(b=>b.classList.remove('on'));
    if(!isOn){ panel.classList.add('on'); btn.classList.add('on'); }
  });
}

/* ---------------- المساعد (مساعدة + قارن) ---------------- */
async function askAI(history){
  const res=await fetch('/api/ask',{
    method:'POST',
    headers:{'Content-Type':'application/json'},
    body:JSON.stringify({ messages:history.slice(-8) }),
  });
  return res.json();
}
function logMsg(logEl,role,text){
  const d=document.createElement('div');
  d.className='msg '+role; d.textContent=text;
  logEl.appendChild(d); logEl.scrollTop=logEl.scrollHeight;
  return d;
}
function makeChat(logId,formId,inputId,btnId,history,seed){
  const log=document.getElementById(logId), form=document.getElementById(formId);
  if(!log||!form) return null;
  const input=document.getElementById(inputId), btn=btnId?document.getElementById(btnId):null;

  async function send(text){
    const q=String(text||'').trim(); if(!q) return;
    if(input) input.value='';
    if(btn) btn.disabled=true;
    logMsg(log,'me',q);

    // 1) الكود بجاوب أول - بدون أي استدعاء خارجي
    if(typeof localAnswer==='function'){
      const local=localAnswer(q);
      if(local){
        logMsg(log,'bot',local);
        history.push({role:'user',content:q});
        history.push({role:'assistant',content:local});
        if(btn) btn.disabled=false;
        if(input) input.focus();
        return;
      }
    }

    // 2) ما عرف؟ وقتها بس بنسأل المساعد الذكي
    history.push({role:'user',content:q});
    const wait=logMsg(log,'wait',T('help.thinking','عم أفكر...'));
    try{
      const data=await askAI(history);
      wait.remove();
      if(data.reply){ logMsg(log,'bot',data.reply); history.push({role:'assistant',content:data.reply}); }
      else logMsg(log,'err',data.error||T('common.error_retry','صار في خطأ، جرّب كمان مرة'));
    }catch(e){ wait.remove(); logMsg(log,'err',T('help.error','ما قدرت أوصل للمساعد، جرّب كمان مرة')); }
    finally{ if(btn) btn.disabled=false; if(input) input.focus(); }
  }
  form.addEventListener('submit',e=>{ e.preventDefault(); send(input.value); });
  if(seed) seed(send);
  return send;
}

/* ---------------- قارن ---------------- */
function initCompare(){
  const list=document.getElementById('cmpList');
  if(!list) return;
  const addRow=(val)=>{
    const n=list.children.length+1;
    const row=document.createElement('div');
    row.className='cmp-row';
    row.innerHTML=`<input type="text" placeholder="كتاب ${n}" value="${escAttr(val||'')}">
                   <button type="button" class="cmp-del" aria-label="حذف">×</button>`;
    list.appendChild(row);
  };
  addRow(); addRow();
  document.getElementById('cmpAdd').addEventListener('click',()=>addRow());
  list.addEventListener('click',e=>{
    if(e.target.closest('.cmp-del') && list.children.length>2) e.target.closest('.cmp-row').remove();
  });

  const history=[];
  const send=makeChat('cmpLog','cmpForm','cmpInput',null,history);
  document.getElementById('cmpStart').addEventListener('click',()=>{
    const titles=[...list.querySelectorAll('input')].map(i=>i.value.trim()).filter(Boolean);
    if(titles.length<2){ toast(T('compare.min_books','حط كتابين على الأقل')); return; }
    startCompare(titles,send);
  });
}

// الأسئلة بتنسأل محلياً بأزرار - ولا توكن بينصرف هون
function startCompare(titles,sendToAI){
  const log=document.getElementById('cmpLog');
  const form=document.getElementById('cmpForm');
  log.innerHTML=''; form.classList.add('hidden');
  const answers=[];

  const ask=(n)=>{
    if(n>=CMP_QUESTIONS.length){ finish(); return; }
    const Q=CMP_QUESTIONS[n];
    logMsg(log,'bot',Q.q);
    const row=document.createElement('div');
    row.className='chips';
    row.innerHTML=Q.o.map(o=>`<button type="button" class="chip-btn" data-v="${escAttr(o[1])}">${esc(o[0])}</button>`).join('');
    row.addEventListener('click',e=>{
      const b=e.target.closest('.chip-btn'); if(!b) return;
      answers.push(b.dataset.v);
      logMsg(log,'me',b.textContent);
      row.remove();
      ask(n+1);
    });
    log.appendChild(row);
    log.scrollTop=log.scrollHeight;
  };

  const finish=()=>{
    const found=titles.map(t=>(BOOKS||[]).find(b=>b.title.includes(t)||t.includes(b.title)));
    if(found.every(Boolean)){
      const ranked=rankLocally(found,answers);
      const txt=ranked.map((b,i)=>`${i+1}. ${b.title}${b.rating?' [تقييم '+b.rating+']':''} - ${b.price} د.أ`).join('\n');
      logMsg(log,'bot','حسب إجاباتك، هاد الترتيب اللي بنصحك فيه:\n\n'+txt+'\n\nابدأ بالأول وبتلاقيه الأنسب إلك هلق.');
      return;
    }
    form.classList.remove('hidden');
    const map={short:'وقتي قليل',mid:'وقتي متوسط',long:'عندي وقت',
               light:'بدي إشي خفيف ومسلي',deep:'بدي أفكر وأتعلم',boost:'بدي إشي يحمّسني',
               rated:'بفضّل الأعلى تقييماً',cheap:'بفضّل الأرخص'};
    sendToAI('محتار بين: '+titles.join('، ')+'. '+answers.map(a=>map[a]||a).join('، ')+'. رتّبهم إلي باختصار مع سبب سطر لكل واحد.');
  };
  ask(0);
}

/* ---------------- اقترح كتاب ---------------- */
function initSuggest(){
  const form=document.getElementById('suggestForm');
  if(!form) return;
  const chk=document.getElementById('notifyMe'), fields=document.getElementById('notifyFields');
  const btn=document.getElementById('suggestBtn'), msg=document.getElementById('suggestMsg');

  chk.addEventListener('change',()=>{
    fields.classList.toggle('hidden',!chk.checked);
    btn.textContent = chk.checked ? T('suggest.button_notify','أعلمني') : T('suggest.button_submit','إرسال الاقتراح');
    fields.querySelectorAll('input').forEach(i=>{ i.required=chk.checked; if(!chk.checked) i.value=''; });
  });

  form.addEventListener('submit',async e=>{
    e.preventDefault();
    const fd=new FormData(form);
    msg.textContent=T('common.sending','جاري الإرسال...'); msg.className='form-msg';
    btn.disabled=true;
    try{
      await postToSheet({
        type:'suggest',
        book:fd.get('book'),
        info:fd.get('info')||'',
        name:chk.checked?fd.get('name'):'',
        phone:chk.checked?fd.get('phone'):'',
        notify:chk.checked?'نعم':'لا',
        hp:fd.get('website')||'',
      });
      msg.textContent = chk.checked
        ? T('suggest.success_notify','وصلنا اقتراحك، وبنعلمك أول ما يتوفر')
        : T('suggest.success_plain','وصلنا اقتراحك، شكراً إلك');
      msg.className='form-msg ok';
      form.reset();
      chk.checked=false; fields.classList.add('hidden'); btn.textContent=T('suggest.button_submit','إرسال الاقتراح');
      fields.querySelectorAll('input').forEach(i=>i.required=false);
    }catch(err){ msg.textContent=T('common.error','صار في خطأ، حاول كمان مرة'); msg.className='form-msg err'; }
    finally{ btn.disabled=false; }
  });
}

/* ---------------- الأحداث العامة ---------------- */
document.addEventListener('click',e=>{
  const add=e.target.closest('.js-add');
  if(add){ e.stopPropagation();
    const b=findBook(add.dataset.id);
    if(b){ addToCart(b); toast(T('cart.added_toast','تمت إضافة الكتاب للسلة')); }
    return;
  }
  const sAdd=e.target.closest('.js-series-add');
  if(sAdd){ e.stopPropagation();
    const s=SERIES[Number(sAdd.dataset.idx)];
    const m=s?seriesMembers(s):[];
    m.forEach(b=>addToCart(b));
    toast(`تمت إضافة ${m.length} أجزاء للسلة`);
    return;
  }
  const nt=e.target.closest('.js-notify');
  if(nt){ e.stopPropagation(); openNotify(nt.dataset.id); return; }

  const vt=e.target.closest('.js-view');
  if(vt){ e.stopPropagation();
    VIEW_FILTER=vt.dataset.view;
    SEARCH_QUERY='';
    const sInput=document.getElementById('bookSearch'); if(sInput) sInput.value='';
    document.querySelectorAll('.js-view').forEach(x=>x.classList.toggle('on',x===vt));
    renderBooks();
    return;
  }

  const lt=e.target.closest('.js-lang');
  if(lt){ e.stopPropagation();
    LANG_FILTER=lt.dataset.lang||'';
    document.querySelectorAll('.js-lang').forEach(x=>x.classList.toggle('on',x===lt));
    renderBooks();
    return;
  }

  const au=e.target.closest('.js-author');
  if(au){ e.stopPropagation();
    AUTHOR_FILTER=au.dataset.author;
    SEARCH_QUERY='';
    const sInput=document.getElementById('bookSearch'); if(sInput) sInput.value='';
    document.querySelector('.overlay')?.remove();
    renderBooks();
    document.getElementById('books')?.scrollIntoView({behavior:'smooth'});
    return;
  }
  const sr=e.target.closest('.js-series');
  if(sr){ openSeries(Number(sr.dataset.idx)); return; }

  const open=e.target.closest('.js-open');
  if(open){ openBook(open.dataset.id); return; }

  const more=e.target.closest('.js-load-more');
  if(more){ e.stopPropagation(); VISIBLE_COUNT+=PAGE_SIZE; renderBooks(true); }
});

document.addEventListener('change',e=>{
  if(e.target.id==='sortSelect'){ SORT_MODE=e.target.value; renderBooks(); }
});

/* --------------- Deep-linking: query parameters (book, series, banner, tool) --------------- */
function handleDeepLink(){
  const params=new URLSearchParams(window.location.search);

  if(params.has('book')){
    const id=params.get('book');
    setTimeout(()=>openBook(id), 500);
    return;
  }

  if(params.has('series')){
    const id=params.get('series');
    const idx=SERIES.findIndex(s=>s.id===id);
    if(idx>=0) setTimeout(()=>openSeries(idx), 500);
    return;
  }

  if(params.has('banner')){
    const id=params.get('banner');
    const banner=BANNERS.find(b=>b.id===id);
    if(banner){
      const go=banner.target||'books';
      if(go==='books'){
        setTimeout(()=>document.getElementById('books')?.scrollIntoView({behavior:'smooth'}), 500);
      }else if(go.startsWith('tool:')){
        const toolName=go.slice(5);
        setTimeout(()=>{
          document.getElementById('tools')?.scrollIntoView({behavior:'smooth'});
          setTimeout(()=>document.querySelector(`.tool-ico[data-tool="${toolName}"]`)?.click(), 420);
        }, 500);
      }
    }
    return;
  }

  if(params.has('tool')){
    const toolName=params.get('tool');
    setTimeout(()=>{
      document.getElementById('tools')?.scrollIntoView({behavior:'smooth'});
      setTimeout(()=>document.querySelector(`.tool-ico[data-tool="${toolName}"]`)?.click(), 420);
    }, 500);
  }
}

/* ---------------- الإقلاع ---------------- */
document.addEventListener('DOMContentLoaded',async ()=>{
  const hasGrid=!!document.getElementById('booksGrid');
  const pBanners = fetchBanners();
  const pBooks = hasGrid ? fetchBooks() : null;
  const pSeries = hasGrid ? fetchSeries() : null;
  const pContact = fetchContact();
  const pProblemsFAQ = typeof renderProblems==='function' ? Promise.all([fetchProblems(), fetchFAQ()]) : null;

  pBanners.then(()=>{ renderBanners(); initBanner(); });

  await textsReady;
  applyTexts();
  updateBadge();
  initTools();
  initCompare();
  initSuggest();
  pContact.then(renderContactLinks);
  if(pProblemsFAQ) pProblemsFAQ.then(()=>{ renderProblems(); renderFaq(); });
  makeChat('helpLog','helpForm','helpInput','helpSend',[],(send)=>{
    document.querySelectorAll('#panel-help .chip-btn')
      .forEach(c=>c.addEventListener('click',()=>send(c.textContent)));
  });
  document.getElementById('clearAuthor')?.addEventListener('click',()=>{
    AUTHOR_FILTER=''; renderBooks();
  });

  let searchDebounce;
  document.getElementById('bookSearch')?.addEventListener('input',e=>{
    clearTimeout(searchDebounce);
    const val=e.target.value;
    searchDebounce=setTimeout(()=>{ SEARCH_QUERY=val; renderBooks(); },200);
  });

  if(hasGrid){
    // نعرض الكتب فور وصولها بدل انتظار السلاسل (اللي ممكن تتأخر أكتر بكتير) - أول ظهور أسرع، وبيتحدث تلقائياً لما توصل السلاسل
    await pBooks;
    renderBooks();
    pSeries.then(()=>{
      BUNDLE_ONLY_IDS=new Set();
      (SERIES||[]).forEach(s=>{ if(s.sellMode==='full') (s.memberIds||[]).forEach(id=>BUNDLE_ONLY_IDS.add(id)); });
      renderBooks();
    });
    await pSeries;
    await pBanners;
    handleDeepLink();
  }
});
