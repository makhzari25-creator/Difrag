# دیفرگ (Difrag) — انبارگردانی آفلاین

**نسخه ۱.۰.۰ · Build 4821**

نرم‌افزار دسکتاپ ویندوز برای شمارش موجودی انبار (آفلاین کامل).

## ساخت با GitHub Actions

هر push به `main` یک بیلد ویندوز اجرا می‌کند:
- `Difrag-Setup-1.0.0-4821.exe` (نصب‌کننده NSIS)
- `Difrag-Portable-1.0.0-4821.exe` (پرتابل)

خروجی در تب **Actions** → آخرین workflow → Artifacts قابل دانلود است.

یا دستی: Actions → Build Windows EXE → Run workflow

## توسعه محلی

```bash
npm install
npm run dev
npm run build
```

## ویژگی‌ها

- ورود با نام (بدون رمز) + نقش مدیر/انباردار
- بارگذاری اکسل SheetFilter
- پشتیبانی مکان چندتایی
- اسکنر HID keyboard-wedge
- شمارش با تطابق / انتقال سیستمی / فیزیکی
- تأیید مدیر
- گزارش‌ها + خروجی اکسل
- ذخیره در `%APPDATA%\Difrag\`
