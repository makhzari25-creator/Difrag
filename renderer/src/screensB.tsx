import React, { useEffect, useState, useCallback, useRef } from 'react';
import { useAppStore } from './stores/appStore';
import { useScanner } from './hooks/useScanner';
import { toPersianDigits, formatLocation, nowIso, getDeviceId, askText } from './lib/utils';
import type { Product } from '@shared/types';
import { RoleChip } from './screensA';

export function ReportsScreen() {
  const profile = useAppStore(s => s.profile);
  const addToast = useAppStore(s => s.addToast);
  const [tab, setTab] = useState(0);
  const [items, setItems] = useState<any[]>([]);
  const [moved, setMoved] = useState<any[]>([]);
  const [users, setUsers] = useState<string[]>([]);
  const [fUser, setFUser] = useState('');
  const [fFrom, setFFrom] = useState('');
  const [fTo, setFTo] = useState('');
  const [fLoc, setFLoc] = useState('');
  const load = async () => {
    const base: any = { userName: fUser || undefined, dateFrom: fFrom || undefined, dateTo: fTo || undefined, locationCode: fLoc.trim() || undefined };
    setItems(await window.difrag.getItemResults(base));
    setMoved(await window.difrag.getMisplaced({ userName: fUser || undefined, dateFrom: fFrom || undefined, dateTo: fTo || undefined }));
    setUsers(await window.difrag.getUsers());
  };
  useEffect(() => { load(); }, [fUser, fFrom, fTo, fLoc]);
  const review = async (item: any, status: 'confirmed' | 'rejected') => {
    const asked = await askText(status === 'rejected' ? 'دلیل رد (حداقل ۱۰ نویسه):' : 'یادداشت (اختیاری):');
    if (asked === null) return;
    const note = asked;
    if (status === 'rejected' && note.trim().length < 10) { addToast('error', 'یادداشت رد باید حداقل ۱۰ نویسه باشد'); return; }
    await window.difrag.updateItemResult({ id: item.id, status, reviewedByName: profile?.fullName, reviewedByRole: 'مدیر', reviewedAt: nowIso(), managerNote: note || null });
    await window.difrag.logAuthEvent({ userId: useAppStore.getState().userId, fullName: profile?.fullName, isManager: true, type: 'manager_review', timestamp: nowIso(), deviceId: getDeviceId(), detail: `${status} ${item.barcode}` });
    addToast('success', status === 'confirmed' ? 'تأیید شد' : 'رد شد'); load();
  };
  const typeFa: any = { match: 'مطابق', system_transfer: 'کسر سیستمی', physical_transfer: 'انتقال فیزیکی' };
  const statusFa: any = { pending: 'در انتظار', confirmed: 'تأیید', rejected: 'رد' };
  const fmt = (iso: string) => { try { return new Date(iso).toLocaleString('fa-IR'); } catch { return iso; } };
  const sys = items.filter(i => i.result_type === 'system_transfer');
  const phys = items.filter(i => i.result_type === 'physical_transfer');
  const match = items.filter(i => i.result_type === 'match');
  const row = (i: any) => ({
    'نام و نام خانوادگی': i.user_full_name, 'نقش': i.user_role, 'تاریخ': fmt(i.recorded_at), 'محل فیزیکی': i.location_code,
    'بارکد': i.barcode, 'عنوان': i.full_name, 'سایز': i.size, 'موجودی اکسل': i.excel_reference_qty, 'شمارش': i.physical_qty,
    'اختلاف': i.diff, 'نتیجه': typeFa[i.result_type], 'وضعیت': statusFa[i.status] || i.status,
    'اسکن‌نشده': i.note === 'not_scanned' || i.note === 'not_scanned_in_group' ? 'بله' : '', 'تأییدکننده': i.reviewed_by_name || '', 'یادداشت مدیر': i.manager_note || ''
  });
  const exportCurrent = async () => {
    const name = ['خلاصه', 'کسر سیستمی', 'انتقال فیزیکی', 'جابه‌جایی'][tab];
    const rows = tab === 0 ? items.map(row) : tab === 1 ? sys.map(row) : tab === 2 ? phys.map(row) :
      moved.map(m => ({ 'نام و نام خانوادگی': m.user_full_name, 'تاریخ': fmt(m.timestamp), 'بارکد': m.barcode, 'عنوان': m.full_name, 'سایز': m.size, 'محل اسکن': m.scanned_location, 'محل درست': m.expected_location }));
    if (!rows.length) { addToast('error', 'داده‌ای برای خروجی نیست'); return; }
    const r = await window.difrag.exportXlsx({ rows, sheetName: name, defaultPath: `difrag-${name}.xlsx` });
    if (r?.success) addToast('success', 'فایل اکسل ذخیره شد');
  };
  const tabs = ['خلاصه', 'کسر سیستمی', 'انتقال فیزیکی', 'جابه‌جایی'];
  const list = tab === 1 ? sys : tab === 2 ? phys : [];
  return (
    <div className="pb-24 max-w-3xl mx-auto">
      <div className="sticky top-0 z-30 bg-surface border-b px-4 py-2 flex items-center gap-2">
        <span className="text-sm">نقش شما: <RoleChip isManager={!!profile?.isManager} /></span>
        <button onClick={exportCurrent} className="mr-auto bg-accent text-white px-4 py-2 rounded-btn text-sm min-h-[44px]">خروجی اکسل</button>
      </div>
      <div className="grid grid-cols-2 md:grid-cols-4 gap-2 p-4">
        <select value={fUser} onChange={e => setFUser(e.target.value)} className="border rounded-btn px-3 py-2 bg-surface">
          <option value="">همهٔ کاربران</option>{users.map(u => <option key={u} value={u}>{u}</option>)}
        </select>
        <input value={fLoc} onChange={e => setFLoc(e.target.value)} dir="ltr" placeholder="کد محل" className="border rounded-btn px-3 py-2" />
        <input type="date" value={fFrom} onChange={e => setFFrom(e.target.value)} className="border rounded-btn px-3 py-2" aria-label="از تاریخ" />
        <input type="date" value={fTo} onChange={e => setFTo(e.target.value)} className="border rounded-btn px-3 py-2" aria-label="تا تاریخ" />
      </div>
      <div className="flex border-b bg-surface overflow-x-auto">
        {tabs.map((t, i) => <button key={t} onClick={() => setTab(i)} className={`px-4 py-3 text-sm min-h-[48px] whitespace-nowrap ${tab === i ? 'border-b-2 border-primary text-primary font-bold' : 'text-muted'}`}>{t}</button>)}
      </div>
      <div className="p-4">
        {tab === 0 && (
          <div className="grid grid-cols-2 gap-3">
            <Stat n={items.length} t="کل ثبت‌ها" />
            <Stat n={match.length} t="مطابق" c="text-success" />
            <Stat n={sys.length} t="کسر سیستمی" c="text-system" />
            <Stat n={phys.length} t="انتقال فیزیکی" c="text-physical" />
            <Stat n={moved.length} t="جابه‌جایی (محل اشتباه)" c="text-danger" />
            <Stat n={items.filter(i => i.status === 'pending').length} t="در انتظار تأیید مدیر" c="text-warning" />
          </div>
        )}
        {(tab === 1 || tab === 2) && list.map(item => (
          <div key={item.id} className="bg-surface rounded-card shadow-card p-4 mb-3 text-sm">
            <div className="flex justify-between gap-2">
              <div className="font-bold">{item.size} <span className="font-normal text-muted text-xs">{item.full_name}</span></div>
              <span className={`text-xs ${item.status === 'pending' ? 'text-warning' : item.status === 'rejected' ? 'text-danger' : 'text-success'}`}>{statusFa[item.status]}</span>
            </div>
            <div className="font-mono text-xs" dir="ltr">{item.barcode}</div>
            <div>اکسل {toPersianDigits(item.excel_reference_qty)} · شمارش {toPersianDigits(item.physical_qty)} · اختلاف {toPersianDigits(item.diff)}</div>
            <div className="text-xs text-muted">{item.user_full_name} · {formatLocation(item.location_code || '')} · {fmt(item.recorded_at)}{item.note === 'not_scanned' ? ' · اسکن‌نشده' : ''}</div>
            {profile?.isManager && item.status === 'pending' && (
              <div className="flex gap-2 mt-2">
                <button onClick={() => review(item, 'confirmed')} className="flex-1 bg-success text-white py-2 rounded-btn min-h-[48px]">✓ تأیید</button>
                <button onClick={() => review(item, 'rejected')} className="flex-1 bg-danger text-white py-2 rounded-btn min-h-[48px]">✗ رد</button>
              </div>
            )}
          </div>
        ))}
        {tab === 3 && moved.map(m => (
          <div key={m.id} className="bg-surface rounded-card shadow-card p-4 mb-3 text-sm">
            <div className="font-bold">{m.size} <span className="font-normal text-muted text-xs">{m.full_name}</span></div>
            <div className="font-mono text-xs" dir="ltr">{m.barcode}</div>
            <div>اسکن‌شده در: {formatLocation(m.scanned_location)}</div>
            <div className="text-primary font-medium">محل درست: {String(m.expected_location || '').split(',').map(formatLocation).join('، ')}</div>
            <div className="text-xs text-muted">{m.user_full_name} · {fmt(m.timestamp)}</div>
          </div>
        ))}
        {tab !== 0 && ((tab === 3 ? moved : list).length === 0) && <p className="text-center text-muted py-8">موردی نیست</p>}
      </div>
    </div>
  );
}

function Stat({ n, t, c = '' }: { n: number; t: string; c?: string }) {
  return <div className="bg-surface rounded-card p-4 shadow-card"><div className={`text-3xl font-bold ${c}`}>{toPersianDigits(n)}</div><div className="text-xs text-muted">{t}</div></div>;
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
