// ==========================================================
// مكتبة Space Books - المنطق المشترك
// ==========================================================
const API_BASE = '/api';   // الباك اند على n8n عبر nginx (نفس الأصل)
const FREE_SHIPPING_MIN = 4;
const SHIPPING_FEE = 2;   // دينارين إذا أقل من 4 كتب

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
function seriesMembers(s){ return (s.memberIds||[]).map(findBook).filter(Boolean); }
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
function coverHTML(b, cls){
  return b.cover
    ? `<img src="${escAttr(b.cover)}" alt="${escAttr(b.title)}" loading="lazy">`
    : `<span class="${cls||'ph'}">📖</span>`;
}
function bookCardHTML(b){
  const avail=isAvailable(b);
  const rate=b.rating ? `<div class="rating"><span class="stars">${stars(b.rating)}</span> ${esc(b.rating)}${b.ratings?` <span>(${esc(b.ratings)})</span>`:''}</div>` : '';
  return `
    <article class="book-card js-open" data-id="${escAttr(b.id||b.title)}">
      ${avail?'':'<span class="tag tag-out">خالص حالياً</span>'}
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
            ? `<button class="btn btn-cyan btn-sm js-add" data-id="${escAttr(b.id||b.title)}">أضف</button>`
            : `<button class="btn btn-outline btn-sm js-notify" data-id="${escAttr(b.id||b.title)}">خبّرني</button>`}
        </div>
      </div>
    </article>`;
}
function findBook(id){ return (BOOKS||[]).find(b=>(b.id||b.title)===id); }

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
    ? `<a class="gr-link" href="${escAttr(b.goodreads)}" target="_blank" rel="noopener">اقرأ أكثر على Goodreads ↗</a>` : '';

  const ov=openModal(`
    <div class="detail">
      <div class="detail-cover">${coverHTML(b,'')}</div>
      <div>
        <h2>${esc(b.title)}</h2>
        ${b.author?`<a class="book-author js-author" data-author="${escAttr(b.author)}" style="font-size:.95rem">${esc(b.author)}</a>`:''}
        <div class="meta-row">
          <span class="chip chip-price">${b.price} د.أ</span>
          ${rate}
          <span class="chip" style="${avail?'':'color:#f43f5e'}">${avail?'متوفر':'خالص حالياً'}</span>
        </div>
        ${avail
          ? `<button class="btn btn-cyan js-add" data-id="${escAttr(b.id||b.title)}">أضف للسلة</button>`
          : `<button class="btn btn-outline js-notify" data-id="${escAttr(b.id||b.title)}">خبّرني بس يتوفر</button>`}
        ${b.desc?`<div class="block-title">عن الكتاب</div><div class="block-body">${esc(b.desc)}</div>`:''}
        ${gr}
        ${b.aboutAuthor?`<div class="block-title">عن المؤلف</div><div class="block-body">${esc(b.aboutAuthor)}</div>`:''}
      </div>
    </div>`);
  return ov;
}

/* ---------------- أعلمني لما يتوفر ---------------- */
function openNotify(id){
  const b=findBook(id); const title=b?b.title:id;
  const ov=openModal(`
    <h3>خبّرني بس يتوفر</h3>
    <p class="sub">"${esc(title)}" - بنحكيلك أول ما يرجع</p>
    <form id="nForm">
      <div class="field"><label>اسمك</label><input type="text" name="name" required></div>
      <div class="field"><label>رقم التلفون</label><input type="tel" name="phone" required></div>
      <button type="submit" class="btn btn-cyan btn-full">إرسال</button>
      <div class="form-msg" id="nMsg"></div>
    </form>`);
  ov.querySelector('#nForm').addEventListener('submit',async e=>{
    e.preventDefault();
    const fd=new FormData(e.target), m=ov.querySelector('#nMsg');
    m.textContent='جاري الإرسال...'; m.className='form-msg';
    try{
      await postToSheet({ type:'notify', bookId:b?b.id:'', book:title, name:fd.get('name'), phone:fd.get('phone') });
      m.textContent='تمام! رح نحكيلك أول ما يتوفر'; m.className='form-msg ok';
      setTimeout(()=>ov.remove(),1500);
    }catch(err){ m.textContent='صار في خطأ، حاول كمان مرة'; m.className='form-msg err'; }
  });
}

/* ---------------- بطاقة السلسلة ---------------- */
function seriesCardHTML(s,idx){
  const avail=isSeriesAvailable(s);
  const count=(s.memberIds||[]).length;
  return `
    <article class="book-card js-series" data-idx="${idx}">
      ${avail?'':'<span class="tag tag-out">خالص حالياً</span>'}
      <span class="tag tag-series${avail?'':' tag-alt'}">سلسلة · ${count} أجزاء</span>
      <div class="book-cover">${s.cover?`<img src="${escAttr(s.cover)}" alt="" loading="lazy">`:'<span class="ph">📚</span>'}</div>
      <div class="book-body">
        <h3 class="book-title">${esc(s.name)}</h3>
        <div class="book-meta">
          <div class="rating">${count} أجزاء كاملة</div>
          ${s.discount?`<div class="book-author" style="color:var(--rose)">خصم: ${esc(s.discount)}</div>`:''}
        </div>
        <div class="book-foot">
          <span class="price">${s.price} <small>د.أ</small></span>
          ${avail
            ? `<button class="btn btn-amber btn-sm js-series-add" data-idx="${idx}">خُدها كاملة</button>`
            : `<button class="btn btn-outline btn-sm js-series" data-idx="${idx}">التفاصيل</button>`}
        </div>
      </div>
    </article>`;
}
function openSeries(idx){
  const s=SERIES[idx]; if(!s) return;
  const avail=isSeriesAvailable(s);
  const members=seriesMembers(s);
  const list=members.map(m=>`
    <div class="cart-item">
      <div class="thumb">${m.cover?`<img src="${escAttr(m.cover)}" alt="">`:'📖'}</div>
      <div class="info"><b>${esc(m.title)}</b><span style="font-size:.85rem;color:var(--ink-soft)">${m.price} د.أ</span></div>
      <button class="btn btn-outline btn-sm js-add" data-id="${escAttr(m.id||m.title)}">أضف</button>
    </div>`).join('');
  openModal(`
    <h3>${esc(s.name)}</h3>
    <p class="sub">${members.length} أجزاء - خُدها كاملة أو أي جزء لحاله</p>
    ${s.desc?`<div class="block-body" style="margin-bottom:16px">${esc(s.desc)}</div>`:''}
    <div style="background:#fff;border:1px solid var(--line);border-radius:16px;padding:16px;margin-bottom:18px;display:flex;align-items:center;justify-content:space-between;gap:12px;flex-wrap:wrap">
      <div><b style="color:var(--navy)">السلسلة كاملة</b><div style="font-size:.85rem;color:var(--ink-soft)">${members.length} أجزاء${s.discount?` · خصم: ${esc(s.discount)}`:''}</div></div>
      <div style="display:flex;align-items:center;gap:12px">
        <span class="price">${s.price} د.أ</span>
        ${avail?`<button class="btn btn-amber js-series-add" data-idx="${idx}">أضف السلسلة</button>`:'<span class="tag tag-out" style="position:static">خالص حالياً</span>'}
      </div>
    </div>
    <div class="block-title">أجزاء السلسلة</div>
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
  const bookResults=(BOOKS||[]).map(b=>({
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
let SORT_MODE='default'; // default | title | author | rating | price | newest

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

function renderBooks(){
  const grid=document.getElementById('booksGrid');
  if(!grid) return;

  const query=SEARCH_QUERY.trim();
  if(query){
    const bar=document.getElementById('authorBar');
    if(bar) bar.classList.remove('on');
    const results=searchCatalog(query)||[];
    const cnt=document.getElementById('booksCount');
    if(cnt) cnt.textContent = results.length ? `${results.length} نتيجة لـ "${query}"` : `ما في نتائج لـ "${query}"`;
    grid.innerHTML = results.length
      ? results.map(r=>r.kind==='book'?bookCardHTML(r.data):seriesCardHTML(r.data,SERIES.indexOf(r.data))).join('')
      : '<p style="color:var(--ink-soft)">جرّب كلمة أخرى أو تأكد من الإملاء.</p>';
    return;
  }

  let list=BOOKS||[];
  if(AUTHOR_FILTER) list=list.filter(b=>b.author===AUTHOR_FILTER);

  const showSeries = !AUTHOR_FILTER && VIEW_FILTER!=='books';
  const showBooksList = AUTHOR_FILTER || VIEW_FILTER!=='series';
  const seriesList = showSeries ? (SERIES||[]) : [];

  const bar=document.getElementById('authorBar');
  if(bar){
    bar.classList.toggle('on',!!AUTHOR_FILTER);
    if(AUTHOR_FILTER) document.getElementById('authorName').textContent=AUTHOR_FILTER;
  }
  const cnt=document.getElementById('booksCount');
  if(cnt){
    cnt.textContent = (VIEW_FILTER==='series' && !AUTHOR_FILTER)
      ? (seriesList.length ? `${seriesList.length} سلسلة متاحة` : 'ما في سلاسل لعرضها حالياً')
      : (list.length ? `${list.length} كتاب متاح` : 'ما في كتب لعرضها حالياً');
  }

  let bodyHTML;
  if(VIEW_FILTER==='all' && !AUTHOR_FILTER){
    // بمزج الكتب والسلاسل بنفس ترتيب الفرز، بدل ما تكون السلاسل دايماً بالأول
    const mergeMode = SORT_MODE==='default' ? 'natural' : SORT_MODE;
    const entries=[
      ...list.map(b=>({v:bookEntryValue(b,mergeMode), node:bookCardHTML(b)})),
      ...seriesList.map((s,i)=>({v:seriesEntryValue(s,mergeMode), node:seriesCardHTML(s,i)})),
    ];
    entries.sort((x,y)=>compareByMode(x.v,y.v,mergeMode));
    bodyHTML = entries.map(en=>en.node).join('');
  }else{
    const sortedList = SORT_MODE==='default' ? list
      : [...list].sort((a,b)=>compareByMode(bookEntryValue(a,SORT_MODE),bookEntryValue(b,SORT_MODE),SORT_MODE));
    const seriesPairs = seriesList.map((s,i)=>[s,i]);
    const sortedSeries = SORT_MODE==='default' ? seriesPairs
      : [...seriesPairs].sort((a,b)=>compareByMode(seriesEntryValue(a[0],SORT_MODE),seriesEntryValue(b[0],SORT_MODE),SORT_MODE));
    const seriesCards = showSeries ? sortedSeries.map(([s,i])=>seriesCardHTML(s,i)).join('') : '';
    bodyHTML = (showSeries?seriesCards:'') + (showBooksList?sortedList.map(bookCardHTML).join(''):'');
  }

  grid.innerHTML = bodyHTML || '<p style="color:var(--ink-soft)">ما في كتب لعرضها حالياً.</p>';
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
  const start=()=>{ clearInterval(timer); timer=setInterval(()=>show(i+1),5000); };

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
    const wait=logMsg(log,'wait','عم أفكر...');
    try{
      const data=await askAI(history);
      wait.remove();
      if(data.reply){ logMsg(log,'bot',data.reply); history.push({role:'assistant',content:data.reply}); }
      else logMsg(log,'err',data.error||'صار في خطأ، جرّب كمان مرة');
    }catch(e){ wait.remove(); logMsg(log,'err','ما قدرت أوصل للمساعد، جرّب كمان مرة'); }
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
    if(titles.length<2){ toast('حط كتابين على الأقل'); return; }
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
    btn.textContent = chk.checked ? 'أعلمني' : 'إرسال الاقتراح';
    fields.querySelectorAll('input').forEach(i=>{ i.required=chk.checked; if(!chk.checked) i.value=''; });
  });

  form.addEventListener('submit',async e=>{
    e.preventDefault();
    const fd=new FormData(form);
    msg.textContent='جاري الإرسال...'; msg.className='form-msg';
    btn.disabled=true;
    try{
      await postToSheet({
        type:'suggest',
        book:fd.get('book'),
        info:fd.get('info')||'',
        name:chk.checked?fd.get('name'):'',
        phone:chk.checked?fd.get('phone'):'',
        notify:chk.checked?'نعم':'لا',
      });
      msg.textContent = chk.checked
        ? 'وصلنا اقتراحك، وبنعلمك أول ما يتوفر'
        : 'وصلنا اقتراحك، شكراً إلك';
      msg.className='form-msg ok';
      form.reset();
      chk.checked=false; fields.classList.add('hidden'); btn.textContent='إرسال الاقتراح';
      fields.querySelectorAll('input').forEach(i=>i.required=false);
    }catch(err){ msg.textContent='صار في خطأ، حاول كمان مرة'; msg.className='form-msg err'; }
    finally{ btn.disabled=false; }
  });
}

/* ---------------- الأحداث العامة ---------------- */
document.addEventListener('click',e=>{
  const add=e.target.closest('.js-add');
  if(add){ e.stopPropagation();
    const b=findBook(add.dataset.id);
    if(b){ addToCart(b); toast('تمت إضافة الكتاب للسلة'); }
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
  if(open){ openBook(open.dataset.id); }
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
  updateBadge();
  initTools();
  initCompare();
  initSuggest();
  if(typeof renderProblems==='function'){ renderProblems(); renderFaq(); }
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

  if(document.getElementById('booksGrid')){
    await Promise.all([fetchBooks(), fetchSeries(), fetchBanners()]);
    renderBanners();
    initBanner();
    renderBooks();
    handleDeepLink();
  }else{
    await Promise.all([fetchBanners()]);
    renderBanners();
    initBanner();
  }
});
