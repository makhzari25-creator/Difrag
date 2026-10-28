# دیفرگ (Difrag) — انبارگردانی آفلاین

**نسخه ۱.۰.۰ · Build 4821**

نرم‌افزار دسکتاپ ویندوز برای شمارش موجودی انبار (کاملاً آفلاین).

## پیش‌نیازها

- Node.js ≥ 20
- روی ویندوز: Visual Studio Build Tools (برای better-sqlite3)

## توسعه محلی

```bash
npm install
npm run rebuild
npm run dev
```

## آزمون

```bash
npm test
# یا
node tests/location-parse.test.js
```

## ساخت installer و portable (ویندوز)

### GitHub Actions (پیشنهادی)

Push به `main` یا اجرای دستی workflow **Build Windows EXE**:

- `Difrag-Setup-1.0.0-4821.exe`
- `Difrag-Portable-1.0.0-4821.exe`

### محلی روی ویندوز

```bash
npm install --ignore-scripts
npx electron-builder install-app-deps
npm run build:renderer
npx electron-builder --win --config build/electron-builder.yml
```

## اسکنر HID keyboard-wedge

1. حالت keyboard emulation + پسوند Enter/Tab
2. اسکن سراسری بدون وابستگی به focus تصادفی
3. فاصله بین‌کلیدی < ۵ms + Enter → روش `scanner`؛ تایپ آهسته → `manual`
4. buffer ناقص پس از ۱۰۰ms دور انداخته می‌شود

آزمون سخت‌افزاری واقعی فقط با USB روی ویندوز PASS می‌شود.

## واردکردن Excel

- Sheet: `SheetFilter` (وگرنه اولین sheet)
- ستون‌ها: B بارکد، C سایز، D موجودی انبار (مرجع)، F نام، L رنگ، Q جنسیت، R IsActive، U مکان‌ها
- فقط `R == "True"` فعال؛ غیرفعال در DB می‌ماند
- Import دو مرحله‌ای: اعتبارسنجی → تأیید و فعال‌سازی
- نمونه مصنوعی: `sample/` (Synthetic)

### قواعد مکان (U)

| ورودی | رفتار |
|--------|--------|
| `_` / خالی | بدون مکان |
| یک کد ۸ رقمی | مقدار = D |
| دو کد بدون (N) | همه به اول + هشدار بدون تفکیک |
| یک (N) | N برای همان قطعه، بقیه D−N |
| دو (N) با جمع ≠ D | مرجع مؤثر = جمع + هشدار |

## مسیر داده‌ها

`%APPDATA%\\Difrag\\`

- `difrag.db`
- `logs/difrag-<date>.log` — خط اول: `[Difrag Build 4821]`
- `excel/v<N>-<hash>.xlsx`
- `backups/difrag-<date>.db` (۱۴ روز)
- `build.id` = `4821`

### بازیابی backup

کپی `backups/difrag-YYYY-MM-DD.db` روی `difrag.db` (برنامه بسته باشد).

## نقش مدیر

فقط برای نمایش دکمه‌های تأیید/رد و تاریخچه. **مرز امنیتی نیست** و رمز عبور ندارد.

## محدودیت‌های شناخته‌شده

- ساخت `.exe` روی Linux این محیط BLOCKED است؛ از Actions استفاده کنید
- آزمون اسکنر USB واقعی نیازمند سخت‌افزار
- فونت Vazirmatn: نام در CSS؛ برای بسته نهایی فایل‌های محلی `@font-face` اضافه شود

## ساختار

```
electron/  main + preload + db
renderer/  React 18 + Vite + Tailwind + Zustand
shared/    types
build/     electron-builder
sample/    اکسل نمونه
tests/     آزمون واحد
docs/
```
