import React, { useEffect, useState } from 'react';
import { useAppStore } from './stores/appStore';
import { toPersianDigits, formatLocation, nowIso, getDeviceId } from './lib/utils';

export function RoleChip({ isManager }: { isManager: boolean }) {
  return <span className={`inline-flex px-2.5 py-0.5 rounded-full text-xs font-bold ${isManager ? 'bg-system/15 text-system' : 'bg-muted/20 text-muted'}`}>{isManager ? 'مدیر' : 'انباردار'}</span>;
}

export function ToastContainer() {
  const toasts = useAppStore(s => s.toasts);
  const remove = useAppStore(s => s.removeToast);
  return (
    <div className="fixed bottom-4 left-4 z-50 flex flex-col gap-2 max-w-sm">
      {toasts.map(t => (
        <div key={t.id} role="status" onClick={() => remove(t.id)}
          className={`px-4 py-3 rounded-btn shadow-card text-sm text-white cursor-pointer ${t.type === 'error' ? 'bg-danger' : t.type === 'success' ? 'bg-success' : 'bg-primary'}`}>{t.message}</div>
      ))}
    </div>
  );
}

export function Nav({ active, onNav }: { active: string; onNav: (s: string) => void }) {
  const items = [{ id: 'home', label: 'خانه' }, { id: 'locations', label: 'شمارش' }, { id: 'reports', label: 'گزارش‌ها' }, { id: 'profile', label: 'پروفایل' }];
  return (
    <nav className="fixed bottom-0 inset-x-0 bg-surface border-t flex justify-around py-2 z-40">
      {items.map(it => (
        <button key={it.id} onClick={() => onNav(it.id)} className={`px-4 py-2 min-h-[48px] ${active === it.id ? 'text-primary font-bold' : 'text-muted'}`}>{it.label}</button>
      ))}
    </nav>
  );
}

export function WelcomeScreen() {
  const { profile, setProfile, setUserId, setScreen, addToast } = useAppStore();
  const [first, setFirst] = useState(profile?.firstName || '');
  const [last, setLast] = useState(profile?.lastName || '');
  const [isManager, setIsManager] = useState(profile?.isManager || false);
  const [errors, setErrors] = useState<{ first?: string; last?: string }>({});
  const submit = async () => {
    const e: any = {};
    if (first.trim().length < 3) e.first = 'حداقل ۳ کاراکتر';
    if (last.trim().length < 3) e.last = 'حداقل ۳ کاراکتر';
    setErrors(e); if (Object.keys(e).length) return;
    const fullName = `${first.trim()} ${last.trim()}`;
    const deviceId = getDeviceId();
    const p = { fullName, firstName: first.trim(), lastName: last.trim(), isManager, deviceId };
    setProfile(p);
    const user = await window.difrag.upsertUser(p);
    setUserId(user.id);
    await window.difrag.logAuthEvent({ userId: user.id, fullName, isManager, type: 'login', timestamp: nowIso(), deviceId, detail: null });
    setScreen('home');
    addToast('success', `خوش آمدی، ${fullName}`);
  };
  return (
    <div className="min-h-full flex items-center justify-center p-6">
      <div className="w-full max-w-md bg-surface rounded-card shadow-card p-8">
        <div className="text-center mb-8">
          <div className="w-16 h-16 mx-auto mb-3 rounded-2xl bg-primary text-white flex items-center justify-center text-2xl font-bold">د</div>
          <h1 className="text-2xl font-bold text-primary">دیفرگ</h1>
          <p className="text-muted text-sm">انبارگردانی آفلاین · Build 4821</p>
        </div>
        <div className="space-y-4">
          <div>
            <label className="block text-sm mb-1">نام</label>
            <input className="w-full border rounded-btn px-4 py-3" value={first} onChange={e => setFirst(e.target.value)} autoFocus />
            {errors.first && <p className="text-danger text-xs">{errors.first}</p>}
          </div>
          <div>
            <label className="block text-sm mb-1">نام خانوادگی</label>
            <input className="w-full border rounded-btn px-4 py-3" value={last} onChange={e => setLast(e.target.value)} />
            {errors.last && <p className="text-danger text-xs">{errors.last}</p>}
          </div>
          <label className="flex items-center gap-3 cursor-pointer">
            <input type="checkbox" checked={isManager} onChange={e => setIsManager(e.target.checked)} className="w-5 h-5" />
            <span>من مدیر هستم</span>
          </label>
          <button onClick={submit} className="w-full bg-primary text-white py-3.5 rounded-btn font-bold min-h-[48px]">ورود به برنامه</button>
        </div>
      </div>
    </div>
  );
}

export function HomeScreen({ onNav }: { onNav: (s: string) => void }) {
  const { profile, excelVersion, setExcelVersion, setScreen } = useAppStore();
  const [stats, setStats] = useState<any>({});
  useEffect(() => {
    window.difrag.getActiveExcel().then((v: any) => setExcelVersion(v));
    window.difrag.getStats().then(setStats);
  }, []);
  const importExcel = async () => {
    const path = await window.difrag.selectExcelFile();
    if (!path) return;
    (window as any).__pendingExcel = path;
    setScreen('import');
  };
  return (
    <div className="pb-20 p-4 max-w-3xl mx-auto">
      <h1 className="text-xl font-bold mb-2">سلام، {profile?.fullName}</h1>
      <RoleChip isManager={!!profile?.isManager} />
      <div className="grid grid-cols-3 gap-3 my-6">
        <div className="bg-surface rounded-card shadow-card p-4 text-center"><div className="text-2xl font-bold text-primary">{toPersianDigits(stats.sessionsToday || 0)}</div><div className="text-xs text-muted">سشن امروز</div></div>
        <div className="bg-surface rounded-card shadow-card p-4 text-center"><div className="text-2xl font-bold text-primary">{toPersianDigits(stats.itemsToday || 0)}</div><div className="text-xs text-muted">قلم شمرده</div></div>
        <div className="bg-surface rounded-card shadow-card p-4 text-center"><div className="text-2xl font-bold text-warning">{toPersianDigits(stats.pending || 0)}</div><div className="text-xs text-muted">در انتظار</div></div>
      </div>
      <div className="bg-surface rounded-card shadow-card p-4 mb-4 flex justify-between items-center">
        <div>
          <div className="text-sm text-muted">اکسل فعال</div>
          {excelVersion ? <div>نسخه {toPersianDigits(excelVersion.id)} · {toPersianDigits(excelVersion.row_count)} ردیف</div> : <div className="text-danger">بارگذاری نشده</div>}
        </div>
        <button onClick={importExcel} className="bg-accent text-white px-4 py-2 rounded-btn min-h-[48px]">بارگذاری اکسل</button>
      </div>
      <button onClick={() => onNav('locations')} className="w-full bg-primary text-white py-4 rounded-btn font-bold text-lg min-h-[48px]">شروع شمارش جدید</button>
    </div>
  );
}

export function ImportScreen({ onDone }: { onDone: () => void }) {
  const { profile, setExcelVersion, addToast } = useAppStore();
  const [loading, setLoading] = useState(true);
  const [activating, setActivating] = useState(false);
  const [summary, setSummary] = useState<any>(null);
  const [error, setError] = useState<string | null>(null);
  const [filePath, setFilePath] = useState<string | null>(null);

  useEffect(() => {
    const path = (window as any).__pendingExcel;
    if (!path) { setError('فایلی انتخاب نشده'); setLoading(false); return; }
    setFilePath(path);
    window.difrag.importExcel({ filePath: path, uploadedBy: profile?.fullName || '', confirm: false }).then((res: any) => {
      setLoading(false);
      if (!res.success) { setError((res.errors || []).join('\n')); setSummary(res.summary); }
      else setSummary(res.summary);
    }).catch((e: any) => { setLoading(false); setError(String(e)); });
  }, []);

  const activate = async () => {
    if (!filePath) return;
    setActivating(true);
    try {
      const res: any = await window.difrag.importExcel({ filePath, uploadedBy: profile?.fullName || '', confirm: true });
      if (!res.success) { setError((res.errors || []).join('\n')); setActivating(false); return; }
      const v = await window.difrag.getActiveExcel();
      setExcelVersion(v);
      addToast('success', `نسخه ${v?.id ?? ''} فعال شد`);
      onDone();
    } catch (e: any) { setError(String(e)); setActivating(false); }
  };

  if (loading) return <div className="p-8 text-center text-primary">در حال اعتبارسنجی اکسل…</div>;
  return (
    <div className="p-4 max-w-2xl mx-auto pb-20">
      <h2 className="text-xl font-bold mb-4">نتیجه اعتبارسنجی اکسل</h2>
      {error && <div className="bg-danger/10 text-danger p-4 rounded-card mb-4 whitespace-pre-wrap" role="status">{error}</div>}
      {summary && (
        <div className="bg-surface rounded-card shadow-card p-4 space-y-2 mb-4 text-sm">
          <div>کل ردیف‌ها: {toPersianDigits(summary.totalRows)}</div>
          <div>فعال: {toPersianDigits(summary.activeRows)} · غیرفعال: {toPersianDigits(summary.inactiveRows ?? 0)}</div>
          <div>SKU یکتا: {toPersianDigits(summary.uniqueSkus)} · مکان‌ها: {toPersianDigits(summary.locationCount)}</div>
          <div>کالاهای چندمکانه: {toPersianDigits(summary.multiLocationRows)}</div>
          {(summary.warnings || []).length > 0 && (
            <div className="mt-2 text-warning">
              <div className="font-bold">هشدارها ({toPersianDigits(summary.warnings.length)}):</div>
              <ul className="list-disc pr-5 max-h-40 overflow-auto">
                {summary.warnings.slice(0, 30).map((w: any, i: number) => (
                  <li key={i}>{w.message}{w.barcode ? ` (${w.barcode})` : ''}</li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}
      <div className="flex gap-3">
        {!error && summary && (
          <button onClick={activate} disabled={activating} className="bg-primary text-white px-6 py-3 rounded-btn font-bold min-h-[48px]">
            {activating ? 'در حال فعال‌سازی…' : 'تأیید و فعال‌سازی نسخه'}
          </button>
        )}
        <button onClick={onDone} className="border px-6 py-3 rounded-btn min-h-[48px]">انصراف</button>
      </div>
    </div>
  );
}

export function LocationsScreen({ onSelect }: { onSelect: (c: string) => void }) {
  const excelVersion = useAppStore(s => s.excelVersion);
  const [locations, setLocations] = useState<any[]>([]);
  const [search, setSearch] = useState('');
  useEffect(() => { if (excelVersion?.id) window.difrag.getLocations(excelVersion.id).then(setLocations); }, [excelVersion]);
  const filtered = locations.filter(l => !search || l.location_code.includes(search));
  return (
    <div className="p-4 max-w-3xl mx-auto pb-20">
      <h2 className="text-xl font-bold mb-4">انتخاب مکان</h2>
      <input className="w-full border rounded-btn px-4 py-3 mb-4" placeholder="جستجو…" value={search} onChange={e => setSearch(e.target.value)} />
      <div className="space-y-2">
        {filtered.map(loc => (
          <button key={loc.location_code} onClick={() => onSelect(loc.location_code)}
            className="w-full bg-surface rounded-card shadow-card p-4 text-right flex justify-between min-h-[48px]">
            <div>
              <div className="font-medium">{formatLocation(loc.location_code)}</div>
              <div className="text-xs text-muted">{toPersianDigits(loc.product_count)} کالا · {toPersianDigits(loc.expected_units)} عدد</div>
            </div>
          </button>
        ))}
        {!filtered.length && <p className="text-center text-muted py-8">مکانی نیست — ابتدا اکسل بارگذاری کنید</p>}
      </div>
    </div>
  );
}
