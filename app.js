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
    goodreads:t(raw.goodreads), aboutAuthor:t(raw.aboutAuthor), series:t(raw.series),
    price:Number(raw.price)||0, status:t(raw.status)||'متوفر',
  };
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
        ${b.author?`<a class="book-author js-author" data-author="${escAttr(b.author)}">${esc(b.author)}</a>`:''}
        ${rate}
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

/* ---------------- السلاسل ---------------- */
function buildSeries(books){
  const byId={}; books.forEach(b=>{ if(b.id) byId[b.id]=b; });
  const seen={}, groups=[];
  books.forEach(b=>{
    if(!b.id || !b.series || b.series==='لا ينتمي' || seen[b.id]) return;
    const ids=[b.id, ...b.series.split('/').map(s=>s.trim()).filter(Boolean)];
    const members=ids.map(i=>byId[i]).filter(Boolean);
    if(members.length<2) return;
    members.forEach(m=>{ seen[m.id]=1; });
    groups.push(members);
  });
  return groups;
}
function seriesCardHTML(members,idx){
  const total=Math.round(members.reduce((s,m)=>s+m.price,0)*100)/100;
  const cover=members.find(m=>m.cover);
  const name=commonPrefix(members.map(m=>m.title)) || members[0].title;
  return `
    <article class="book-card js-series" data-idx="${idx}">
      <span class="tag tag-series">سلسلة · ${members.length} أجزاء</span>
      <div class="book-cover">${cover?`<img src="${escAttr(cover.cover)}" alt="" loading="lazy">`:'<span class="ph">📚</span>'}</div>
      <div class="book-body">
        <h3 class="book-title">${esc(name)}</h3>
        <div class="rating">${members.length} أجزاء كاملة</div>
        <div class="book-foot">
          <span class="price">${total} <small>د.أ</small></span>
          <button class="btn btn-amber btn-sm js-series-add" data-idx="${idx}">خُدها كاملة</button>
        </div>
      </div>
    </article>`;
}
function commonPrefix(titles){
  if(!titles.length) return '';
  const words=titles.map(t=>t.split(/\s+/));
  const out=[];
  for(let i=0;i<words[0].length;i++){
    const w=words[0][i];
    if(words.every(a=>a[i]===w)) out.push(w); else break;
  }
  return out.join(' ').trim();
}
let SERIES=[];
function openSeries(idx){
  const members=SERIES[idx]; if(!members) return;
  const total=Math.round(members.reduce((s,m)=>s+m.price,0)*100)/100;
  const name=commonPrefix(members.map(m=>m.title))||members[0].title;
  const list=members.map(m=>`
    <div class="cart-item">
      <div class="thumb">${m.cover?`<img src="${escAttr(m.cover)}" alt="">`:'📖'}</div>
      <div class="info"><b>${esc(m.title)}</b><span style="font-size:.85rem;color:var(--ink-soft)">${m.price} د.أ</span></div>
      <button class="btn btn-outline btn-sm js-add" data-id="${escAttr(m.id||m.title)}">أضف</button>
    </div>`).join('');
  openModal(`
    <h3>${esc(name)}</h3>
    <p class="sub">${members.length} أجزاء - خُدها كاملة أو أي جزء لحاله</p>
    <div style="background:#fff;border:1px solid var(--line);border-radius:16px;padding:16px;margin-bottom:18px;display:flex;align-items:center;justify-content:space-between;gap:12px;flex-wrap:wrap">
      <div><b style="color:var(--navy)">السلسلة كاملة</b><div style="font-size:.85rem;color:var(--ink-soft)">${members.length} أجزاء</div></div>
      <div style="display:flex;align-items:center;gap:12px">
        <span class="price">${total} د.أ</span>
        <button class="btn btn-amber js-series-add" data-idx="${idx}">أضف السلسلة</button>
      </div>
    </div>
    <div class="block-title">أجزاء السلسلة</div>
    ${list}`);
}

/* ---------------- عرض الكتب ---------------- */
let AUTHOR_FILTER='';

function renderBooks(){
  const grid=document.getElementById('booksGrid');
  if(!grid) return;
  let list=BOOKS||[];
  if(AUTHOR_FILTER) list=list.filter(b=>b.author===AUTHOR_FILTER);

  // بطاقات السلاسل بتنعرض مع الكتب بنفس الشبكة
  SERIES = AUTHOR_FILTER ? [] : buildSeries(BOOKS||[]);
  const seriesCards = SERIES.map((m,i)=>seriesCardHTML(m,i)).join('');

  const bar=document.getElementById('authorBar');
  if(bar){
    bar.classList.toggle('on',!!AUTHOR_FILTER);
    if(AUTHOR_FILTER) document.getElementById('authorName').textContent=AUTHOR_FILTER;
  }
  const cnt=document.getElementById('booksCount');
  if(cnt) cnt.textContent = list.length ? `${list.length} كتاب متاح` : 'ما في كتب لعرضها حالياً';

  grid.innerHTML = list.length
    ? seriesCards + list.map(bookCardHTML).join('')
    : '<p style="color:var(--ink-soft)">ما في كتب لعرضها حالياً.</p>';
}


/* ---------------- البانر المتحرك ---------------- */
function initBanner(){
  const slides=[...document.querySelectorAll('#slides .slide')];
  const dots=document.getElementById('dots');
  if(slides.length<2||!dots) return;
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
    const m=SERIES[Number(sAdd.dataset.idx)]||[];
    m.forEach(b=>addToCart(b));
    toast(`تمت إضافة ${m.length} أجزاء للسلة`);
    return;
  }
  const nt=e.target.closest('.js-notify');
  if(nt){ e.stopPropagation(); openNotify(nt.dataset.id); return; }

  const au=e.target.closest('.js-author');
  if(au){ e.stopPropagation();
    AUTHOR_FILTER=au.dataset.author;
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

/* ---------------- الإقلاع ---------------- */
document.addEventListener('DOMContentLoaded',async ()=>{
  updateBadge();
  initBanner();
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

  if(document.getElementById('booksGrid')){
    await fetchBooks();
    renderBooks();
  }
});
