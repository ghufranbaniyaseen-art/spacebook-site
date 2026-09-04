# SPACEBOOK

موقع مكتبة SPACEBOOK — كتالوج كتب، سلة، وإتمام طلب بالدفع عند الاستلام فقط.

البيانات (الكتب والطلبات) متصلة بجداول Google Sheets عن طريق Google Apps Script.

الموقع منشور تلقائياً عبر Vercel، ومربوط مع هالـ repo — أي تحديث يُرفع على main بينشر نفسه بنفس اللحظة.

## الملفات
- `index.html` — الصفحة الرئيسية (الكتالوج)
- `cart.html` — السلة
- `checkout.html` — إتمام الطلب
- `style.css` — التنسيق
- `app.js` — المنطق المشترك (السلة، جلب الكتب، الإرسال للشيت)
- `apps-script/Code.gs` — كود الباك اند (Google Apps Script)
