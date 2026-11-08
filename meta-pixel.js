/* Meta Pixel (SPACEBOOKs Pixel) — مربوط بكتالوج SPACEBOOKs بميتا.
   الـ content_ids هي نفس أرقام الكتب بالشيت وبملف meta-feed.csv، عشان ميتا تربط الأحداث بالمنتجات.
   ما بنبعت أي بيانات شخصية (اسم، رقم، عنوان) — بس الكتب والأسعار.
   إذا البكسل ما تحمّل (مانع إعلانات مثلاً) كل الدوال هون بتسكت وما بتخرب الموقع. */
!function(f,b,e,v,n,t,s){if(f.fbq)return;n=f.fbq=function(){n.callMethod?
n.callMethod.apply(n,arguments):n.queue.push(arguments)};if(!f._fbq)f._fbq=n;
n.push=n;n.loaded=!0;n.version='2.0';n.queue=[];t=b.createElement(e);t.async=!0;
t.src=v;s=b.getElementsByTagName(e)[0];s.parentNode.insertBefore(t,s)}(window,
document,'script','https://connect.facebook.net/en_US/fbevents.js');
fbq('init', '1158651326696262');
fbq('track', 'PageView');

(function(){
  // البكسل ما بيقبل JOD كعملة (بيعتبرها invalid بحدث Purchase)، فبنبعت القيمة بالدولار.
  // الدينار مربوط بالدولار: 1 دينار = 1.41 دولار تقريباً (0.709 دينار للدولار). المبلغ بالدينار بينبعت كمان بـ value_jod.
  const CUR = 'USD', JOD_TO_USD = 1.41;
  const r2 = n => Math.round((Number(n) || 0) * 100) / 100;
  const money = jod => ({ value: r2((Number(jod) || 0) * JOD_TO_USD), currency: CUR, value_jod: r2(jod) });
  function track(ev, params){ try{ window.fbq && window.fbq('track', ev, params); }catch(e){} }
  // عناصر السلة محفوظة بالاسم، فبنرجعها لأرقام الكتب. السلسلة الكاملة = أرقام أجزائها.
  function idsOf(item){
    try{
      if(item.kind === 'series'){
        const s = (typeof SERIES !== 'undefined' && SERIES || []).find(x => item.title === x.name || item.title.startsWith(x.name + ' ('));
        return s ? (s.memberIds || []).map(String) : [];
      }
      const b = (typeof BOOKS !== 'undefined' && BOOKS || []).find(x => x.title === item.title);
      return b && b.id ? [String(b.id)] : [];
    }catch(e){ return []; }
  }
  function cartParams(cart, value){
    const ids = [], contents = [];
    (cart || []).forEach(i => idsOf(i).forEach(id => { ids.push(id); contents.push({ id, quantity: i.qty || 1 }); }));
    return Object.assign({ content_ids: ids, contents, content_type: 'product',
             num_items: (cart || []).reduce((s, i) => s + (i.qty || 1), 0) }, money(value));
  }
  window.sbPixel = {
    view(b){ if(b && b.id) track('ViewContent', { content_ids: [String(b.id)], content_type: 'product', content_name: b.title, ...money(b.price) }); },
    add(item){
      const ids = idsOf(item); if(!ids.length) return;
      track('AddToCart', { content_ids: ids, content_type: 'product', content_name: item.title, ...money(item.price) });
    },
    checkout(cart, total){ if(cart && cart.length) track('InitiateCheckout', cartParams(cart, total)); },
    purchase(cart, total, orderNumber){
      const p = cartParams(cart, total); if(orderNumber) p.order_id = String(orderNumber);
      track('Purchase', p);
    },
  };
})();
