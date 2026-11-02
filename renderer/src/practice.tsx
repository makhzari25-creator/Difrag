import React, { useState } from 'react';
import { toPersianDigits } from './lib/utils';
import { RES_ICON, resultPhrase, resultHint, type ResType } from './lib/wording';
import { IBack, ICheck, IMinus, IPlus, IShirt } from './icons';

// "Try it" mode: a tiny, fully in-memory rehearsal with made-up goods.
// It never calls window.difrag, so nothing is saved and real data is never touched.
const SIZES = [{ size: 'M', ref: 2 }, { size: 'L', ref: 3 }, { size: 'XL', ref: 1 }];
const tone: Record<ResType, string> = {
  match: 'border-success bg-success/10 text-success',
  system_transfer: 'border-system bg-system/10 text-system',
  physical_transfer: 'border-physical bg-physical/10 text-physical'
};
const typeOf = (d: number): ResType => (d === 0 ? 'match' : d < 0 ? 'system_transfer' : 'physical_transfer');

export function PracticeScreen({ onDone }: { onDone: () => void }) {
  const [qty, setQty] = useState<Record<string, number>>({});
  const [finished, setFinished] = useState(false);
  const opened = Object.keys(qty).length > 0;
  const scan = (size: string) => setQty(q => ({ ...q, [size]: (q[size] || 0) + 1 }));
  const set = (size: string, n: number) => setQty(q => ({ ...q, [size]: Math.max(0, n) }));
  const step = finished ? 3 : opened ? 2 : 1;
  const hints = [
    'مرحلهٔ ۱ — در برنامهٔ واقعی بارکد را با اسکنر می‌خوانید. اینجا روی یکی از دکمه‌های «اسکن» بزنید.',
    'مرحلهٔ ۲ — برای هر سایز تعداد را ببینید. می‌توانید با + و − اصلاح کنید. وقتی تمام شد «این جنس تمام شد» را بزنید.',
    'مرحلهٔ ۳ — نتیجه را ببینید. در کار واقعی، «تأیید» همین را ثبت می‌کند.'
  ];

  return (
    <div className="min-h-full bg-bg pb-10">
      <header className="sticky top-0 z-30 bg-primary text-white px-5 py-3 flex items-center gap-4 border-b-4 border-accent/70">
        <button onClick={onDone} aria-label="بازگشت" className="w-11 h-11 rounded-full border-2 border-white/80 flex items-center justify-center shrink-0"><IBack className="w-6 h-6 rotate-180" /></button>
        <div className="flex-1">
          <div className="font-extrabold text-xl leading-tight">نمونهٔ آزمایشی</div>
          <div className="text-xs text-white/75">فقط تمرین است؛ هیچ‌چیز ذخیره نمی‌شود</div>
        </div>
      </header>
      <div className="p-4 space-y-4 max-w-2xl mx-auto">
        <div className="bg-accent/10 border border-accent/40 text-primary rounded-card p-4 text-sm font-medium" role="status">{hints[step - 1]}</div>

        {!finished && (
          <>
            <div className="bg-surface rounded-card shadow-card p-4 border border-primary/5">
              <div className="flex items-center gap-3 mb-3">
                <div className="w-14 h-14 rounded-card bg-bg border flex items-center justify-center text-primary/70"><IShirt className="w-9 h-9" /></div>
                <div><div className="font-extrabold text-primary">تی‌شرت نمونه</div><div className="text-xs text-muted">در اکسل: M ← ۲ · L ← ۳ · XL ← ۱</div></div>
              </div>
              <div className="grid grid-cols-3 gap-2">
                {SIZES.map(z => <button key={z.size} onClick={() => scan(z.size)} className="bg-primary text-white rounded-btn py-3 font-bold min-h-[56px]">اسکن {z.size}</button>)}
              </div>
            </div>
            {SIZES.filter(z => qty[z.size] != null).map(z => (
              <div key={z.size} className="bg-surface rounded-card shadow-card border border-accent/30 p-4 flex items-center gap-4">
                <div className="text-2xl font-extrabold text-primary w-14">{z.size}</div>
                <div className="flex items-center gap-2 mr-auto">
                  <button aria-label="کم" onClick={() => set(z.size, qty[z.size] - 1)} className="w-12 h-12 rounded-full bg-accent/10 text-accent flex items-center justify-center"><IMinus className="w-6 h-6" /></button>
                  <div className="w-20 text-center text-3xl font-extrabold text-accent">{toPersianDigits(qty[z.size])}</div>
                  <button aria-label="زیاد" onClick={() => set(z.size, qty[z.size] + 1)} className="w-12 h-12 rounded-full bg-success text-white flex items-center justify-center"><IPlus className="w-6 h-6" /></button>
                </div>
              </div>
            ))}
            {opened && <button onClick={() => setFinished(true)} className="w-full bg-primary text-white py-4 rounded-card font-extrabold text-xl min-h-[60px] flex items-center justify-center gap-2"><ICheck className="w-6 h-6" />این جنس تمام شد</button>}
          </>
        )}

        {finished && (
          <div className="bg-surface rounded-card shadow-card p-5">
            <div className="space-y-2 mb-4">
              {SIZES.map(z => {
                const phys = qty[z.size] || 0; const diff = phys - z.ref; const t = typeOf(diff);
                return (
                  <div key={z.size} className={`border-2 rounded-btn p-3 flex items-center gap-3 ${tone[t]}`}>
                    <div className="text-xl font-extrabold w-14 text-center">{z.size}</div>
                    <div className="flex-1">
                      <div className="font-extrabold">{RES_ICON[t]} {resultPhrase(t, diff)}</div>
                      <div className="text-xs text-text/80">شمارش شما {toPersianDigits(phys)} · اکسل {toPersianDigits(z.ref)}{resultHint(t) ? ` · ${resultHint(t)}` : ''}</div>
                    </div>
                  </div>
                );
              })}
            </div>
            <p className="text-sm text-muted mb-4">اگر همهٔ سایزها «مطابق» باشند، برنامهٔ واقعی بدون پرسش ثبت می‌کند و ۶ ثانیه دکمهٔ «برگشت» می‌گذارد.</p>
            <button onClick={() => { setQty({}); setFinished(false); }} className="w-full border py-3 rounded-btn min-h-[48px] mb-2">یک بار دیگر امتحان کنم</button>
            <button onClick={onDone} className="w-full bg-success text-white py-3 rounded-btn font-bold min-h-[48px]">متوجه شدم؛ برگردیم به برنامه</button>
          </div>
        )}
      </div>
    </div>
  );
}
