import React, { useEffect, useState } from 'react';
import { useAppStore } from './stores/appStore';
import { toPersianDigits, formatLocation, nowIso, getDeviceId, onDialog, askConfirm } from './lib/utils';
import { IHome, IScan, IChart, IUser, IPlay, IFolder, IUpload, IShield, ISearch, IX, IPin, IBox, IWarehouse, IExcel, ICalendar, IClock, IBox as IBox2, IReset, IRefresh, ICheck } from './icons';
import type { DialogReq } from './lib/utils';

export function RoleChip({ isManager }: { isManager: boolean }) {
  return <span className={`inline-flex items-center gap-1 px-3 py-1 rounded-md text-xs font-bold ${isManager ? 'bg-primary text-white' : 'bg-muted/15 text-muted'}`}>{isManager && <IShield className="w-3.5 h-3.5" />}{isManager ? 'مدیر' : 'انباردار'}</span>;
}

export function DialogHost() {
  const [req, setReq] = React.useState<DialogReq | null>(null);
  const [val, setVal] = React.useState('');
  React.useEffect(() => onDialog(r => { setVal(''); setReq(r); }), []);
  if (!req) return null;
  const close = (v: string | boolean | null) => { req.resolve(v); setReq(null); };
  return (
    <div className="fixed inset-0 z-[60] bg-black/40 flex items-center justify-center p-4" role="dialog" aria-modal="true">
      <div className="bg-surface rounded-card shadow-card p-5 w-full max-w-sm">
        <div className="font-bold text-primary mb-3">{req.title}</div>
        {req.kind === 'text' && (
          <textarea autoFocus value={val} onChange={e => setVal(e.target.value)} rows={3}
            className="w-full border-2 border-primary/30 rounded-btn p-3 mb-3" />
        )}
        <div className="flex gap-2">
          <button onClick={() => close(req.kind === 'text' ? val : true)} className="flex-1 bg-primary text-white py-3 rounded-btn font-bold min-h-[48px]">تأیید</button>
          <button onClick={() => close(req.kind === 'text' ? null : false)} className="flex-1 border py-3 rounded-btn min-h-[48px]">انصراف</button>
        </div>
      </div>
    </div>
  );
}

export function ToastContainer() {
  const toasts = useAppStore(s => s.toasts);
  const remove = useAppStore(s => s.removeToast);
  return (
    <>
    <DialogHost />
    <div className="fixed bottom-20 left-4 z-50 flex flex-col gap-2 max-w-sm">
      {toasts.map(t => (
        <div key={t.id} role="status" onClick={() => remove(t.id)}
          className={`px-4 py-3 rounded-btn shadow-card text-sm text-white cursor-pointer ${t.type === 'error' ? 'bg-danger' : t.type === 'success' ? 'bg-success' : 'bg-primary'}`}>{t.message}</div>
      ))}
    </div>
    </>
  );
}

export function Nav({ active, onNav }: { active: string; onNav: (s: string) => void }) {
  const items = [
    { id: 'home', label: 'خانه', Icon: IHome }, { id: 'locations', label: 'شمارش', Icon: IScan },
    { id: 'reports', label: 'گزارش‌ها', Icon: IChart }, { id: 'profile', label: 'پروفایل', Icon: IUser }
  ];
  return (
    <nav className="fixed bottom-0 inset-x-0 bg-primary text-white flex z-40" aria-label="ناوبری">
      {items.map(({ id, label, Icon }) => (
        <button key={id} onClick={() => onNav(id)} className={`flex-1 flex flex-col items-center gap-0.5 py-2.5 min-h-[56px] relative ${active === id ? 'text-white font-bold' : 'text-white/60'}`}>
          <Icon className="w-6 h-6" /><span className="text-xs">{label}</span>
          {active === id && <span className="absolute bottom-0 h-1 w-14 rounded-t bg-accent" />}
        </button>
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
    <div className="min-h-full flex items-center justify-center p-6 bg-bg">
      <form onSubmit={ev => { ev.preventDefault(); submit(); }} className="w-full max-w-md bg-surface rounded-card shadow-card px-8 py-9">
        <div className="text-center mb-7 text-primary">
          <IWarehouse className="w-16 h-16 mx-auto mb-1" />
          <h1 className="text-4xl font-extrabold">دیفرگ</h1>
          <div className="mx-auto mt-3 h-px w-28 bg-primary/25" />
        </div>
        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium mb-1.5">نام <span className="text-danger">*</span></label>
            <input className="w-full border border-primary/15 rounded-btn px-4 py-3 bg-surface" placeholder="نام خود را وارد کنید" value={first} onChange={e => setFirst(e.target.value)} autoFocus />
            {errors.first && <p className="text-danger text-xs mt-1">{errors.first}</p>}
          </div>
          <div>
            <label className="block text-sm font-medium mb-1.5">نام خانوادگی <span className="text-danger">*</span></label>
            <input className="w-full border border-primary/15 rounded-btn px-4 py-3 bg-surface" placeholder="نام خانوادگی خود را وارد کنید" value={last} onChange={e => setLast(e.target.value)} />
            {errors.last && <p className="text-danger text-xs mt-1">{errors.last}</p>}
          </div>
          <label className="flex items-center gap-3 cursor-pointer">
            <input type="checkbox" checked={isManager} onChange={e => setIsManager(e.target.checked)} className="w-5 h-5 accent-primary" />
            <span>من مدیر هستم</span>
          </label>
          <button type="submit" className="w-full bg-primary text-white py-3.5 rounded-btn font-bold text-lg min-h-[52px]">ورود به برنامه</button>
        </div>
        <p className="text-center text-muted text-xs mt-5">همه اقدامات شما با نام و نقش شما در گزارش‌ها ثبت می‌شود.</p>
      </form>
    </div>
  );
}

export function HomeScreen({ onNav, onResume }: { onNav: (s: string) => void; onResume: (s: any) => void }) {
  const { profile, userId, excelVersion, setExcelVersion, setScreen, addToast } = useAppStore();
  const [stats, setStats] = useState<any>({});
  const [resumable, setResumable] = useState<any>(null);
  const load = () => {
    window.difrag.getActiveExcel().then((v: any) => setExcelVersion(v));
    window.difrag.getStats().then(setStats);
    if (userId) window.difrag.getActiveSessionForUser(userId).then((s: any) => setResumable(s || null));
  };
  useEffect(load, [userId]);
  const pickExcel = async (mode: 'new' | 'update') => {
    const path = await window.difrag.selectExcelFile();
    if (!path) return;
    (window as any).__pendingExcel = path; (window as any).__importMode = mode;
    setScreen('import');
  };
  const reset = async () => {
    if (!(await askConfirm('ریست شمارش: همه اقلام دوباره «شمارش‌نشده» می‌شوند ولی گزارش‌ها پاک نمی‌شوند. ادامه می‌دهید؟'))) return;
    if (!(await askConfirm('مطمئن هستید؟ این کار قابل بازگشت نیست.'))) return;
    await window.difrag.resetCount({ userName: profile?.fullName });
    await window.difrag.logAuthEvent({ userId, fullName: profile?.fullName, isManager: !!profile?.isManager, type: 'reset_count', timestamp: nowIso(), deviceId: getDeviceId(), detail: null });
    addToast('success', 'شمارش صفر شد؛ گزارش‌ها حفظ شد'); load();
  };
  const hasExcel = !!excelVersion;
  return (
    <div className="pb-24 p-5 max-w-4xl mx-auto">
      <div className="flex items-start justify-between mb-5">
        <div>
          <div className="flex items-center gap-3"><IUser className="w-7 h-7 text-primary" /><h1 className="text-2xl font-extrabold text-primary">سلام، {profile?.fullName}</h1></div>
          <div className="mt-2 mr-10"><RoleChip isManager={!!profile?.isManager} /></div>
        </div>
      </div>
      <button onClick={() => hasExcel ? onNav('locations') : addToast('error', 'ابتدا اکسل را بارگذاری کنید')}
        className="relative w-full bg-accent text-white py-5 rounded-card font-extrabold text-2xl shadow-card min-h-[72px] flex items-center justify-center">
        <span className="absolute left-5 w-12 h-12 rounded-full bg-black/15 flex items-center justify-center"><IPlay className="w-6 h-6" /></span>
        شروع شمارش جدید
      </button>
      <button onClick={() => resumable ? onResume(resumable) : addToast('info', 'شمارش نیمه‌کاره‌ای وجود ندارد')}
        className="relative w-full mt-3 bg-surface border border-primary/10 text-primary py-4 rounded-card font-bold text-xl shadow-card min-h-[64px] flex items-center justify-center">
        <span className="absolute left-5 text-primary"><IFolder className="w-8 h-8" /></span>
        ادامه شمارش{resumable && <span className="mr-3 text-sm font-normal text-muted">{formatLocation(resumable.location_code)}</span>}
      </button>
      <div className="grid grid-cols-3 gap-3 my-4">
        <StatCard Icon={ICalendar} label="سشن‌های امروز" value={stats.sessionsToday || 0} cls="text-primary" />
        <StatCard Icon={IBox2} label="قلم‌های شمارش‌شده امروز" value={stats.itemsToday || 0} cls="text-accent" />
        <StatCard Icon={IClock} label="در انتظار تأیید مدیر" value={stats.pending || 0} cls="text-system" />
      </div>
      <div className="bg-surface rounded-card shadow-card p-5">
        <div className="flex items-center gap-4">
          <IExcel />
          <div className="flex-1">
            <div className="font-extrabold text-lg text-primary">اکسل فعال:</div>
            {hasExcel
              ? <div className="text-sm text-muted">{excelVersion.filename || 'inventory.xlsx'} · نسخه {toPersianDigits(excelVersion.id)} · {toPersianDigits(excelVersion.row_count)} ردیف</div>
              : <div className="text-danger text-sm">هنوز اکسلی بارگذاری نشده است</div>}
          </div>
          <div className="text-center text-xs text-success"><IShield className="w-8 h-8 mx-auto" />{hasExcel ? 'آماده' : '—'}</div>
        </div>
        <div className="border-t mt-4 pt-4 flex flex-wrap gap-3">
          {hasExcel ? (
            <button onClick={() => pickExcel('update')} className="flex items-center gap-2 border border-accent text-accent px-5 py-2.5 rounded-btn font-medium min-h-[48px]"><IRefresh className="w-5 h-5" />آپدیت اکسل</button>
          ) : (
            <button onClick={() => pickExcel('new')} className="flex items-center gap-2 border border-primary/20 px-5 py-2.5 rounded-btn font-medium min-h-[48px]"><IUpload className="w-5 h-5" />بارگذاری اکسل جدید</button>
          )}
          <button onClick={reset} className="flex items-center gap-2 text-danger border border-danger/30 px-5 py-2.5 rounded-btn font-medium min-h-[48px]"><IReset className="w-5 h-5" />ریست شمارش</button>
        </div>
        {hasExcel && <p className="text-xs text-muted mt-3">«آپدیت اکسل» وقتی موجودی سیستم تغییر کرده استفاده می‌شود؛ اکسل جدید مبنا می‌شود و شمارش از همان‌جا ادامه می‌یابد.</p>}
      </div>
    </div>
  );
}

function StatCard({ Icon, label, value, cls }: { Icon: any; label: string; value: number; cls: string }) {
  return (
    <div className="bg-surface rounded-card shadow-card p-4 flex items-center gap-3 border border-primary/5">
      <span className={`w-12 h-12 rounded-full bg-primary/5 flex items-center justify-center ${cls}`}><Icon className="w-6 h-6" /></span>
      <div><div className="text-xs text-muted">{label}</div><div className={`text-3xl font-extrabold ${cls}`}>{toPersianDigits(value)}</div></div>
    </div>
  );
}

export function ImportScreen({ onDone }: { onDone: () => void }) {
  const { profile, setExcelVersion, addToast } = useAppStore();
  const mode: 'new' | 'update' = (window as any).__importMode || 'new';
  const [loading, setLoading] = useState(true);
  const [activating, setActivating] = useState(false);
  const [summary, setSummary] = useState<any>(null);
  const [diff, setDiff] = useState<any>(null);
  const [error, setError] = useState<string | null>(null);
  const [filePath, setFilePath] = useState<string | null>(null);
  const call = (confirm: boolean, p: string) => (mode === 'update' ? window.difrag.updateExcel : window.difrag.importExcel)({ filePath: p, uploadedBy: profile?.fullName || '', confirm });

  useEffect(() => {
    const path = (window as any).__pendingExcel;
    if (!path) { setError('فایلی انتخاب نشده'); setLoading(false); return; }
    setFilePath(path);
    call(false, path).then((res: any) => {
      setLoading(false);
      setSummary(res.summary); setDiff(res.diff || null);
      if (!res.success) setError((res.errors || []).join('\n'));
    }).catch((e: any) => { setLoading(false); setError(String(e)); });
  }, []);

  const activate = async () => {
    if (!filePath) return;
    setActivating(true);
    try {
      const res: any = await call(true, filePath);
      if (!res.success) { setError((res.errors || []).join('\n')); setActivating(false); return; }
      setExcelVersion(await window.difrag.getActiveExcel());
      addToast('success', mode === 'update' ? 'اکسل آپدیت شد؛ شمارش با اکسل جدید ادامه می‌یابد' : 'اکسل فعال شد');
      onDone();
    } catch (e: any) { setError(String(e)); setActivating(false); }
  };

  if (loading) return <div className="p-10 text-center text-primary font-medium">در حال اعتبارسنجی اکسل…</div>;
  return (
    <div className="p-5 max-w-2xl mx-auto pb-20">
      <h2 className="text-2xl font-extrabold text-primary mb-4">{mode === 'update' ? 'آپدیت اکسل' : 'نتیجه اعتبارسنجی اکسل'}</h2>
      {error && <div className="bg-danger/10 border border-danger/30 text-danger p-4 rounded-card mb-4 whitespace-pre-wrap max-h-48 overflow-auto" role="alert">{error}</div>}
      {summary && !error && (
        <div className="bg-surface rounded-card shadow-card p-5 space-y-2 mb-4 text-sm">
          <div className="grid grid-cols-2 gap-2">
            <Info t="کل ردیف‌ها" v={summary.totalRows} /><Info t="فعال" v={summary.activeRows} />
            <Info t="غیرفعال" v={summary.inactiveRows ?? 0} /><Info t="مکان‌ها" v={summary.locationCount} />
            <Info t="کالاهای دومکانه" v={summary.multiLocationRows} /><Info t="SKU یکتا" v={summary.uniqueSkus} />
          </div>
          {diff?.hasActive && (
            <div className="mt-3 border-t pt-3">
              <div className="font-bold text-primary mb-1">تغییرات نسبت به اکسل فعلی</div>
              <div>ردیف جدید: {toPersianDigits(diff.added)} · حذف‌شده: {toPersianDigits(diff.removed)} · تغییر موجودی: {toPersianDigits(diff.changedCount)}</div>
              {diff.affectedCount > 0 && (
                <div className="mt-2 bg-warning/10 text-warning rounded-btn p-3">
                  موجودی {toPersianDigits(diff.affectedCount)} کالای شمارش‌شده در اکسل جدید تغییر کرده است. این اقلام «نیاز به شمارش مجدد» می‌شوند (نتیجهٔ قبلی‌شان در گزارش‌ها می‌ماند).
                </div>
              )}
            </div>
          )}
          {(summary.warnings || []).length > 0 && (
            <div className="mt-2 text-warning">
              <div className="font-bold">هشدارها ({toPersianDigits(summary.warnings.length)}):</div>
              <ul className="list-disc pr-5 max-h-40 overflow-auto">
                {summary.warnings.slice(0, 30).map((w: any, i: number) => <li key={i}>{w.message}{w.barcode ? ` (${w.barcode})` : ''}</li>)}
              </ul>
            </div>
          )}
        </div>
      )}
      <div className="flex gap-3">
        {!error && summary && (
          <button onClick={activate} disabled={activating} className="bg-success text-white px-6 py-3 rounded-btn font-bold min-h-[48px] flex items-center gap-2">
            <ICheck className="w-5 h-5" />{activating ? 'در حال اعمال…' : mode === 'update' ? 'تأیید و ادامه با اکسل جدید' : 'تأیید و فعال‌سازی'}
          </button>
        )}
        <button onClick={onDone} className="border px-6 py-3 rounded-btn min-h-[48px] bg-surface">انصراف</button>
      </div>
    </div>
  );
}
function Info({ t, v }: { t: string; v: number }) {
  return <div className="bg-bg rounded-btn px-3 py-2 flex justify-between"><span className="text-muted">{t}</span><b>{toPersianDigits(v)}</b></div>;
}

export function LocationsScreen({ onSelect }: { onSelect: (c: string) => void }) {
  const { excelVersion, userId } = useAppStore();
  const [locations, setLocations] = useState<any[]>([]);
  const [search, setSearch] = useState('');
  useEffect(() => { if (excelVersion?.id) window.difrag.getLocations(excelVersion.id).then(setLocations); }, [excelVersion]);
  const q = search.trim();
  const filtered = locations.filter(l => !q || l.location_code.includes(q) || formatLocation(l.location_code).includes(q));
  const status = (l: any) => {
    if (l.need_count > 0 && l.counted_count >= l.need_count) return { t: 'تکمیل‌شده', c: 'bg-success/15 text-success' };
    if (l.counted_count > 0 || l.open_sessions > 0) return { t: l.open_sessions > 0 ? 'نیمه‌کاره (شما)' : 'نیمه‌کاره', c: 'bg-accent/15 text-accent' };
    return { t: 'شمارش‌نشده', c: 'bg-muted/15 text-muted' };
  };
  return (
    <div className="p-5 max-w-5xl mx-auto pb-24">
      <div className="flex flex-wrap items-end justify-between gap-4 mb-5">
        <div>
          <h2 className="text-3xl font-extrabold text-primary relative inline-block">انتخاب مکان<span className="absolute -bottom-1.5 right-0 h-1 w-12 rounded bg-accent" /></h2>
          <p className="text-muted mt-3">مکان مورد نظر را جستجو یا از لیست انتخاب کنید.</p>
        </div>
        <div className="relative w-full md:w-96">
          <ISearch className="absolute right-4 top-1/2 -translate-y-1/2 w-5 h-5 text-muted" />
          <input className="w-full border border-primary/15 rounded-card pr-12 pl-10 py-3 bg-surface shadow-card" placeholder="جستجو در مکان‌ها… یا تایپ کد ۸ رقمی و Enter" value={search} onChange={e => setSearch(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter' && /^\d{8}$/.test(q)) onSelect(q); }} />
          {search && <button aria-label="پاک کردن" onClick={() => setSearch('')} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted"><IX className="w-5 h-5" /></button>}
        </div>
      </div>
      <div className="grid md:grid-cols-2 gap-4">
        {filtered.map(loc => {
          const st = status(loc); const code: string = loc.location_code;
          return (
            <button key={code} onClick={() => onSelect(code)} className="bg-surface rounded-card shadow-card border border-primary/5 p-4 text-right hover:border-accent transition-colors">
              <div className="flex items-center gap-3 pb-3 border-b">
                <IPin className="w-6 h-6 text-primary shrink-0" />
                <span className="bg-accent text-white rounded-full px-3 py-0.5 text-sm font-bold" dir="ltr">{toPersianDigits(code.slice(4))}</span>
                <span className="text-sm text-text/80 mr-auto">{formatLocation(code)}</span>
              </div>
              <div className="flex gap-6 py-3">
                <div className="flex items-center gap-2"><IBox className="w-6 h-6 text-accent" /><div><div className="font-extrabold text-primary text-lg">{toPersianDigits(loc.need_count)} قلم</div><div className="text-xs text-muted">اقلام دارای موجودی</div></div></div>
                <div className="flex items-center gap-2"><IBox className="w-6 h-6 text-accent" /><div><div className="font-extrabold text-primary text-lg">{toPersianDigits(loc.expected_units)} عدد</div><div className="text-xs text-muted">موجودی اکسل</div></div></div>
              </div>
              <span className={`inline-flex items-center gap-1.5 text-xs px-3 py-1 rounded-full ${st.c}`}><span className="w-2 h-2 rounded-full bg-current" />{st.t}</span>
            </button>
          );
        })}
      </div>
      {!filtered.length && <p className="text-center text-muted py-10">مکانی نیست — ابتدا اکسل را بارگذاری کنید</p>}
    </div>
  );
}
