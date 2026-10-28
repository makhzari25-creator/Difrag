import React, { useEffect, useState, useCallback, useRef } from 'react';
import { useAppStore } from './stores/appStore';
import { useScanner } from './hooks/useScanner';
import { toPersianDigits, formatLocation, nowIso, getDeviceId, playBeep, vibrate, askText, askConfirm } from './lib/utils';
import type { Product } from '@shared/types';
import { RoleChip } from './screensA';

export function CountingScreen({ locationCode, sessionId, onFinish, onOpenItem }: { locationCode: string; sessionId: string; onFinish: () => void; onOpenItem: (p: Product) => void }) {
  const { profile, userId, excelVersion, currentProduct, addToast } = useAppStore();
  const [results, setResults] = useState<any[]>([]);
  const inputRef = useRef<HTMLInputElement>(null);
  useEffect(() => { window.difrag.getItemResults({ sessionId }).then(setResults); }, [sessionId, currentProduct]);
  const handleScan = useCallback(async (barcode: string, method: 'scanner' | 'manual') => {
    if (currentProduct) { addToast('error', 'ابتدا این کد را پایان دهید'); playBeep(300, 200); return; }
    if (!excelVersion) return;
    const product = await window.difrag.getProductByBarcode({ barcode, versionId: excelVersion.id });
    if (!product) {
      playBeep(300, 200);
      const note = await askText('بارکد در اکسل نیست. توضیح:');
      if (note) {
        await window.difrag.addScanEvent({ sessionId, barcode, productId: null, action: 'out_of_list', qtyDelta: 0, userId, userFullName: profile?.fullName, userRole: profile?.isManager ? 'مدیر' : 'انباردار', timestamp: nowIso(), deviceId: getDeviceId(), note, scanMethod: method });
        addToast('success', 'ثبت خارج از فهرست');
      }
      return;
    }
    playBeep(800, 60); vibrate(50);
    onOpenItem(product);
  }, [currentProduct, excelVersion, sessionId, userId, profile, addToast, onOpenItem]);
  useScanner({ onScan: handleScan, enabled: !currentProduct });
  useEffect(() => { inputRef.current?.focus(); }, []);
  return (
    <div className="pb-24">
      <header className="sticky top-0 bg-surface border-b px-4 py-3 flex gap-3 items-center">
        <span className="text-sm font-medium text-primary">{formatLocation(locationCode)}</span>
        <span className="text-xs">{toPersianDigits(results.length)} قلم</span>
        <RoleChip isManager={!!profile?.isManager} />
      </header>
      <div className="p-4">
        <div className="bg-surface rounded-card shadow-card p-6 text-center mb-4">
          <div className="text-muted text-sm mb-2">بارکد را اسکن کن</div>
          <input ref={inputRef} data-scanner="true" className="w-full border-2 border-primary/30 rounded-btn px-4 py-4 text-center font-mono"
            placeholder="اسکن یا تایپ" onKeyDown={e => {
              if (e.key === 'Enter') {
                const v = (e.target as HTMLInputElement).value.trim();
                if (/^\d{8,20}$/.test(v)) { handleScan(v, 'manual'); (e.target as HTMLInputElement).value = ''; }
              }
            }} />
        </div>
        {results.map(r => (
          <div key={r.id} className="bg-surface rounded-card p-3 mb-2 flex justify-between text-sm">
            <span className="font-mono" dir="ltr">{r.barcode}</span>
            <span>{toPersianDigits(r.physical_qty)}/{toPersianDigits(r.excel_reference_qty)}</span>
          </div>
        ))}
      </div>
      <div className="fixed bottom-16 inset-x-0 p-4">
        <button onClick={onFinish} disabled={!results.length} className="w-full bg-primary text-white py-3 rounded-btn font-bold disabled:opacity-40 min-h-[48px]">اتمام شمارش این مکان</button>
      </div>
    </div>
  );
}

export function ItemCard({ product, sessionId, onDone, onCancel }: { product: Product; sessionId: string; onDone: () => void; onCancel: () => void }) {
  const { profile, userId, physicalCount, scannerCount, manualCount, incrementCount, resetCount, checkedLocations, toggleCheckedLocation, clearCheckedLocations, addToast } = useAppStore();
  const [showManual, setShowManual] = useState(false);
  const [manualQty, setManualQty] = useState('');
  const [showFeedback, setShowFeedback] = useState(false);
  const [feedback, setFeedback] = useState<{ type: string; diff: number } | null>(null);
  useEffect(() => { resetCount(); clearCheckedLocations(); }, [product.id]);
  const doPlus = async (method: 'scanner' | 'manual' = 'scanner') => {
    incrementCount(method, 1);
    await window.difrag.addScanEvent({ sessionId, barcode: product.barcode, productId: product.id, action: method === 'manual' ? 'manual' : 'scan', qtyDelta: 1, userId, userFullName: profile?.fullName, userRole: profile?.isManager ? 'مدیر' : 'انباردار', timestamp: nowIso(), deviceId: getDeviceId(), scanMethod: method });
    playBeep(800, 60); vibrate(50);
  };
  const doUndo = async () => {
    if (physicalCount <= 0) return;
    incrementCount('scanner', -1);
    await window.difrag.addScanEvent({ sessionId, barcode: product.barcode, productId: product.id, action: 'undo', qtyDelta: -1, userId, userFullName: profile?.fullName, userRole: profile?.isManager ? 'مدیر' : 'انباردار', timestamp: nowIso(), deviceId: getDeviceId() });
  };
  const submitManual = async () => {
    const n = parseInt(manualQty, 10);
    if (!n || n < 1) { addToast('error', 'تعداد نامعتبر'); return; }
    incrementCount('manual', n);
    await window.difrag.addScanEvent({ sessionId, barcode: product.barcode, productId: product.id, action: 'manual', qtyDelta: n, userId, userFullName: profile?.fullName, userRole: profile?.isManager ? 'مدیر' : 'انباردار', timestamp: nowIso(), deviceId: getDeviceId(), scanMethod: 'manual' });
    setShowManual(false); setManualQty(''); playBeep(800, 60);
  };
  const finishItem = async () => {
    if (product.locationCount === 2) {
      const codes = product.locations.map(l => l.locationCode);
      if (!codes.every(c => checkedLocations.has(c)) && !(await askConfirm('هر دو مکان شمرده شد؟'))) return;
    }
    const refQty = product.effectiveReferenceQty != null ? product.effectiveReferenceQty : product.excelReferenceQty;
    const diff = physicalCount - refQty;
    const type = diff === 0 ? 'match' : diff < 0 ? 'system_transfer' : 'physical_transfer';
    setFeedback({ type, diff }); setShowFeedback(true);
  };
  const confirmFeedback = async () => {
    if (!feedback) return;
    await window.difrag.saveItemResult({
      sessionId, barcode: product.barcode, productId: product.id, excelReferenceQty: (product.effectiveReferenceQty != null ? product.effectiveReferenceQty : product.excelReferenceQty),
      physicalQty: physicalCount, diff: feedback.diff, resultType: feedback.type, userId,
      userFullName: profile?.fullName, userRole: profile?.isManager ? 'مدیر' : 'انباردار',
      recordedAt: nowIso(), status: feedback.type === 'match' ? 'confirmed' : 'pending',
      reviewedByName: null, reviewedByRole: null, reviewedAt: null, managerNote: null
    });
    setShowFeedback(false); onDone();
  };
  useScanner({ onScan: code => { if (code === product.barcode) doPlus('scanner'); else addToast('error', 'بارکد متفاوت'); }, enabled: !showFeedback && !showManual });
  return (
    <div className="fixed inset-0 bg-bg z-50 overflow-auto p-4">
      <div className="max-w-lg mx-auto">
        <button onClick={onCancel} className="text-muted text-sm mb-2">← انصراف</button>
        <h2 className="text-lg font-bold mb-1">{product.fullName}</h2>
        <div className="text-sm text-muted mb-1">{product.color} · {product.size}</div>
        <div className="font-mono text-sm mb-3" dir="ltr">{product.barcode}</div>
        <div className="bg-primary/5 rounded-btn px-3 py-2 text-sm mb-4">مرجع مؤثر: <strong>{toPersianDigits(product.effectiveReferenceQty != null ? product.effectiveReferenceQty : product.excelReferenceQty)}</strong></div>
        {product.locationCount === 2 && (
          <div className="border-2 border-accent/40 rounded-card p-3 mb-4 text-sm">
            {product.locations.map(loc => (
              <label key={loc.locationCode} className="flex items-center gap-2 py-1">
                <input type="checkbox" checked={checkedLocations.has(loc.locationCode)} onChange={() => toggleCheckedLocation(loc.locationCode)} />
                <span>{formatLocation(loc.locationCode)} — {toPersianDigits(loc.expectedQty)}</span>
              </label>
            ))}
          </div>
        )}
        <div className="text-center my-6">
          <div className="text-5xl font-bold text-primary">{toPersianDigits(physicalCount)}</div>
          <div className="text-xs text-muted">اسکنر: {toPersianDigits(scannerCount)} · دستی: {toPersianDigits(manualCount)}</div>
        </div>
        <div className="flex gap-3 mb-3">
          <button onClick={() => doPlus('scanner')} className="flex-1 bg-success text-white py-4 rounded-btn font-bold min-h-[48px]">+1</button>
          <button onClick={doUndo} className="px-6 border-2 rounded-btn font-bold min-h-[48px]">-1</button>
        </div>
        <button onClick={() => setShowManual(true)} className="w-full border-2 border-primary text-primary py-3 rounded-btn mb-3 min-h-[48px]">شمارش دستی</button>
        <button onClick={finishItem} className="w-full bg-primary text-white py-4 rounded-btn font-bold min-h-[48px]">پایان شمارش این کد</button>
      </div>
      {showManual && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-[60] p-4">
          <div className="bg-surface rounded-card p-6 w-full max-w-sm">
            <h3 className="font-bold mb-3">چند عدد شمردی؟</h3>
            <input type="number" min={1} className="w-full border rounded-btn px-4 py-3 text-center text-xl mb-4" value={manualQty} onChange={e => setManualQty(e.target.value)} autoFocus />
            <div className="flex gap-2">
              <button onClick={submitManual} className="flex-1 bg-primary text-white py-3 rounded-btn font-bold">ثبت</button>
              <button onClick={() => setShowManual(false)} className="px-4 border rounded-btn">انصراف</button>
            </div>
          </div>
        </div>
      )}
      {showFeedback && feedback && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-[60] p-4">
          <div className={`rounded-card p-6 w-full max-w-sm text-center border-2 ${feedback.type === 'match' ? 'border-success bg-success/10' : feedback.type === 'system_transfer' ? 'border-system bg-system/10' : 'border-physical bg-physical/10'}`}>
            <div className="text-4xl mb-2">{feedback.type === 'match' ? '✓' : feedback.type === 'system_transfer' ? '⇄' : '📦'}</div>
            <h3 className="text-xl font-bold mb-2">{feedback.type === 'match' ? 'مطابقت کامل' : feedback.type === 'system_transfer' ? 'کمبود — انتقال سیستمی' : 'اضافه — انتقال فیزیکی'}</h3>
            <p className="text-sm mb-4">فیزیکی {toPersianDigits(physicalCount)} · اکسل {toPersianDigits(product.excelReferenceQty)} · اختلاف {toPersianDigits(feedback.diff)}</p>
            <button onClick={confirmFeedback} className="w-full bg-primary text-white py-3 rounded-btn font-bold min-h-[48px]">تأیید و ادامه</button>
            <button onClick={() => setShowFeedback(false)} className="mt-2 text-sm text-muted underline">اصلاح شمارش</button>
          </div>
        </div>
      )}
    </div>
  );
}

export function ReportsScreen() {
  const profile = useAppStore(s => s.profile);
  const [tab, setTab] = useState(0);
  const [items, setItems] = useState<any[]>([]);
  const [stats, setStats] = useState<any>({});
  const addToast = useAppStore(s => s.addToast);
  const load = () => {
    const type = tab === 1 ? 'system_transfer' : tab === 2 ? 'physical_transfer' : null;
    if (type) window.difrag.getItemResults({ resultType: type }).then(setItems);
    window.difrag.getStats().then(setStats);
  };
  useEffect(() => { load(); }, [tab]);
  const review = async (item: any, status: 'confirmed' | 'rejected') => {
    const asked = await askText(status === 'rejected' ? 'دلیل رد (حداقل ۱۰ نویسه):' : 'یادداشت (اختیاری):');
    if (asked === null) return;
    const note = asked;
    if (status === 'rejected' && note.trim().length < 10) { addToast('error', 'یادداشت رد باید حداقل ۱۰ نویسه باشد'); return; }
    await window.difrag.updateItemResult({ id: item.id, status, reviewedByName: profile?.fullName, reviewedByRole: 'مدیر', reviewedAt: nowIso(), managerNote: note || null });
    await window.difrag.logAuthEvent({ userId: useAppStore.getState().userId, fullName: profile?.fullName, isManager: true, type: 'manager_review', timestamp: nowIso(), deviceId: getDeviceId(), detail: `${status} ${item.barcode}` });
    addToast('success', status === 'confirmed' ? 'تأیید شد' : 'رد شد'); load();
  };
  const tabs = ['خلاصه', 'سیستمی', 'فیزیکی'];
  return (
    <div className="pb-20">
      <div className="sticky top-0 bg-surface border-b px-4 py-2"><span className="text-sm">نقش شما: <RoleChip isManager={!!profile?.isManager} /></span></div>
      <div className="flex border-b bg-surface">
        {tabs.map((t, i) => <button key={t} onClick={() => setTab(i)} className={`px-4 py-3 text-sm min-h-[48px] ${tab === i ? 'border-b-2 border-primary text-primary font-bold' : 'text-muted'}`}>{t}</button>)}
      </div>
      <div className="p-4">
        {tab === 0 && (
          <div className="grid grid-cols-2 gap-3">
            <div className="bg-surface rounded-card p-3 shadow-card"><div className="text-2xl font-bold">{toPersianDigits(stats.itemsToday || 0)}</div><div className="text-xs text-muted">قلم امروز</div></div>
            <div className="bg-surface rounded-card p-3 shadow-card"><div className="text-2xl font-bold text-warning">{toPersianDigits(stats.pending || 0)}</div><div className="text-xs text-muted">در انتظار</div></div>
          </div>
        )}
        {(tab === 1 || tab === 2) && items.map(item => (
          <div key={item.id} className="bg-surface rounded-card shadow-card p-4 mb-3 text-sm">
            <div className="font-mono text-xs" dir="ltr">{item.barcode}</div>
            <div>اکسل {toPersianDigits(item.excel_reference_qty)} · فیزیکی {toPersianDigits(item.physical_qty)} · {toPersianDigits(item.diff)}</div>
            <div className="text-xs text-muted">{item.user_full_name} · {item.status}</div>
            {profile?.isManager && item.status === 'pending' && (
              <div className="flex gap-2 mt-2">
                <button onClick={() => review(item, 'confirmed')} className="flex-1 bg-success text-white py-2 rounded-btn min-h-[48px]">✓ تأیید</button>
                <button onClick={() => review(item, 'rejected')} className="flex-1 bg-danger text-white py-2 rounded-btn min-h-[48px]">✗ رد</button>
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

export function ProfileScreen({ onChange, onQuit }: { onChange: () => void; onQuit: () => void }) {
  const profile = useAppStore(s => s.profile);
  return (
    <div className="p-4 max-w-md mx-auto pb-20 text-center">
      <div className="bg-surface rounded-card shadow-card p-6 mb-4">
        <div className="w-16 h-16 mx-auto rounded-full bg-primary text-white flex items-center justify-center text-2xl font-bold mb-3">{profile?.firstName?.[0] || '?'}</div>
        <div className="text-lg font-bold">{profile?.fullName}</div>
        <RoleChip isManager={!!profile?.isManager} />
      </div>
      <button onClick={onChange} className="w-full border py-3 rounded-btn mb-3 min-h-[48px]">تغییر نام / نقش</button>
      <div className="text-xs text-muted my-6">دیفرگ · نسخه 1.0.0 · Build 4821</div>
      <button onClick={onQuit} className="w-full bg-danger/10 text-danger py-3 rounded-btn min-h-[48px]">خروج</button>
    </div>
  );
}
