# Quick Cash Plus — Web

نسخة الويب من Quick Cash Plus (خطة التحويل من تطبيق سطح مكتب Electron لبرنامج يعمل من على سيرفر). منفصلة تمامًا عن مجلد الأوفلاين الأصلي.

- [`backend/`](backend) — سيرفر Node.js/Express مستقل (Express + WebSocket + JWT auth)، متصل بقاعدة بيانات Turso. تفاصيل التشغيل والمعمارية في [backend/README.md](backend/README.md).
- [`frontend/`](frontend) — واجهة الويب (Vite + React)، نفس شاشات البرنامج الأصلية بدون تعديل تقريبًا، متصلة بالباك إند عبر `/api/rpc/*`. تفاصيل في [frontend/README.md](frontend/README.md).

## التشغيل محليًا

```bash
# طرفية 1
cd backend
npm install
npm run dev      # http://localhost:4000

# طرفية 2
cd frontend
npm install
npm run dev      # http://localhost:5173
```

تسجيل الدخول الافتراضي: **admin / admin123**.
