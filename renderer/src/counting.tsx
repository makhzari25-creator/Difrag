import React, { useCallback, useEffect, useRef, useState } from 'react';
import { useAppStore } from './stores/appStore';
import { useScanner } from './hooks/useScanner';
import { toPersianDigits, formatLocation, formatRoom, nowIso, getDeviceId, playBeep, vibrate, askText, askConfirm } from './lib/utils';
import type { Product } from '@shared/types';
import { detectShelf, isShelfDone, needsCount, shelvesOfRoom, unfinishedShelves } from '@shared/room';
import { RoleChip } from './screensA';
import { IBack, IShield, IShirt, IPin, ICheck, IBox, IMinus, IPlus, IKeyboard, IWarehouse } from './icons';

type ResType = 'match' | 'system_transfer' | 'physical_transfer';
type Row = { product: Product; qty: number; scanner: number; manual: number };
type Line = { product: Product; physical: number; ref: number; diff: number; type: ResType };
type Modal =
  | { type: 'summary'; lines: Line[]; pending: { code: string; method: 'scanner' | 'manual' } | null; thenFinish: boolean }
  | { type: 'wrong'; product: Product; expected: string[]; shelf?: string; target?: string; streak?: number; barcode?: string; method?: 'scanner' | 'manual' }
  | { type: 'pickShelf'; product: Product; shelves: string[]; barcode: string; method: 'scanner' | 'manual' }
  | { type: 'roomEnd'; left: any[] }
  | { type: 'unscanned'; items: Product[]; selected: Set<number> };

const refOf = (p: Product) => (p.effectiveReferenceQty != null ? p.effectiveReferenceQty : p.excelReferenceQty);
const sizeCode = (b: string) => b.slice(10, 12);
const groupKeyOf = (b: string) => b.slice(0, 10) + b.slice(12);
const typeOf = (d: number): ResType => (d === 0 ? 'match' : d < 0 ? 'system_transfer' : 'physical_transfer');
const label: Record<ResType, string> = { match: 'مطابق', system_transfer: 'کسر سیستمی', physical_transfer: 'انتقال فیزیکی' };
const tone: Record<ResType, string> = {
  match: 'border-success bg-success/10 text-success',
  system_transfer: 'border-system bg-system/10 text-system',
  physical_transfer: 'border-physical bg-physical/10 text-physical'
};
const sentence = (l: Line) => {
  const n = toPersianDigits(Math.abs(l.diff));
  if (l.type === 'match') return `${l.product.size}: مطابق`;
  if (l.type === 'system_transfer') return `${l.product.size}: ${n} عدد از سیستم کم شود (کسر سیستمی)`;
  return `${l.product.size}: ${n} عدد به سالن منتقل شود (انتقال فیزیکی)`;
};

// locationCode: 8 digits = one physical location (original flow);
//               4 digits = whole room: the shelf is detected from the first scan, one session per shelf.
export function CountingScreen({ locationCode, sessionId, onFinish, onExit }: { locationCode: string; sessionId: string; onFinish: () => void; onExit: (status?: 'paused' | 'completed' | 'cancelled') => void }) {
  const { profile, userId, excelVersion, addToast } = useAppStore();
  const role = profile?.isManager ? 'مدیر' : 'انباردار';
  const versionId = excelVersion?.id;
  const roomMode = locationCode.length === 4;
  const [shelf, setShelfState] = useState<string | null>(roomMode ? null : locationCode);
  const [shelves, setShelves] = useState<any[]>([]);
  const shelfRef = useRef<string | null>(roomMode ? null : locationCode);
  const shelfSessRef = useRef<string | null>(null);   // session of the shelf being counted (room mode)
  const savedRef = useRef(0);                         // results saved in this whole run
  const shelfSavedRef = useRef(0);                    // results saved on the current shelf
  const streakRef = useRef<{ shelf: string; n: number } | null>(null);
  const lastBarcodeRef = useRef<string | null>(null); // last scanned size: a short number typed in the scan box sets its quantity
  type UndoSnap = { ids: string[]; rows: Row[]; siblings: Product[]; key: string | null; sid: string; shelf: string | null; n: number; until: number };
  const [undo, setUndo] = useState<UndoSnap | null>(null);
  const undoRef = useRef<UndoSnap | null>(null);
  const undoTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const clearUndo = () => { if (undoTimer.current) { clearTimeout(undoTimer.current); undoTimer.current = null; } undoRef.current = null; setUndo(null); };
  useEffect(() => () => { if (undoTimer.current) clearTimeout(undoTimer.current); }, []);
  const setShelf = (c: string | null) => { shelfRef.current = c; setShelfState(c); };
  const curLoc = () => shelfRef.current ?? locationCode;
  const sessId = () => (roomMode ? shelfSessRef.current || sessionId : sessionId);

  const [rows, setRowsState] = useState<Row[]>([]);
  const [siblings, setSiblingsState] = useState<Product[]>([]);
  const [gKey, setGKeyState] = useState<string | null>(null);
  const [modal, setModal] = useState<Modal | null>(null);
  const [done, setDone] = useState<{ title: string; lines: Line[] }[]>([]);
  const rowsRef = useRef<Row[]>([]); const sibRef = useRef<Product[]>([]); const keyRef = useRef<string | null>(null);
  const queue = useRef<Promise<void>>(Promise.resolve());
  const inputRef = useRef<HTMLInputElement>(null);
  const keyTimes = useRef<number[]>([]);
  const setRows = (r: Row[]) => { rowsRef.current = r; setRowsState(r); };
  const setSiblings = (s: Product[]) => { sibRef.current = s; setSiblingsState(s); };
  const setGKey = (k: string | null) => { keyRef.current = k; setGKeyState(k); };

  const logEvent = (action: string, p: { barcode: string; id?: number } | null, qtyDelta: number, extra: any = {}) =>
    window.difrag.addScanEvent({
      sessionId: sessId(), barcode: p?.barcode ?? extra.barcode, productId: p?.id ?? null, action, qtyDelta, userId,
      userFullName: profile?.fullName, userRole: role, timestamp: nowIso(), deviceId: getDeviceId(), ...extra
    });

  useEffect(() => { if (!modal) inputRef.current?.focus(); }, [modal, gKey]);

  // ---- whole-room mode helpers ----
  const refreshShelves = async () => {
    if (!roomMode || !versionId) return;
    const all = await window.difrag.getLocations(versionId);
    setShelves(shelvesOfRoom(all, locationCode));
  };
  useEffect(() => { refreshShelves(); }, [versionId]);
  const lockShelf = async (code: string) => {
    if (!profile || !userId || !versionId) return;
    const sess = await window.difrag.createSession({ locationCode: code, userId, userName: profile.fullName, userRole: role, excelVersionId: versionId });
    shelfSessRef.current = sess.id; shelfSavedRef.current = 0; streakRef.current = null;
    setDone([]); setShelf(code);
    playBeep(1000, 90);
  };

  const buildLines = (): Line[] => {
    const scanned = new Map(rowsRef.current.map(r => [r.product.barcode, r]));
    const lines: Line[] = [];
    for (const r of rowsRef.current) lines.push(mk(r.product, r.qty));
    for (const s of sibRef.current) {
      if (scanned.has(s.barcode) || s.counted) continue;
      // unscanned size of this item that the Excel places only in this location => counted as 0
      if (s.locations.length === 1 && s.locations[0].locationCode === curLoc() && refOf(s) > 0) lines.push(mk(s, 0));
    }
    return lines.sort((a, b) => sizeCode(a.product.barcode).localeCompare(sizeCode(b.product.barcode)));
  };
  const mk = (p: Product, physical: number): Line => {
    const ref = refOf(p); const diff = physical - ref; return { product: p, physical, ref, diff, type: typeOf(diff) };
  };

  const openSummary = async (pending: { code: string; method: 'scanner' | 'manual' } | null, thenFinish = false) => {
    const lines = buildLines();
    if (!lines.length) { clearGroup(); return false; }
    // everything matches the Excel: nothing to decide, save right away (a short "undo" bar stays visible)
    if (lines.every(l => l.type === 'match')) { await commit({ lines, pending, thenFinish }, true); return true; }
    setModal({ type: 'summary', lines, pending, thenFinish });
    return true;
  };
  const clearGroup = () => { setRows([]); setSiblings([]); setGKey(null); lastBarcodeRef.current = null; };

  const process = async (barcode: string, method: 'scanner' | 'manual') => {
    if (!versionId) return;
    const product: Product | null = await window.difrag.getProductByBarcode({ barcode, versionId });
    if (!product) {
      playBeep(300, 200);
      const note = await askText(`بارکد ${barcode} در اکسل نیست. توضیح (اختیاری):`);
      if (note !== null) {
        await logEvent('out_of_list', null, 0, { barcode, note: note || '—', scanMethod: method });
        addToast('success', 'ثبت شد: خارج از فهرست');
      }
      return;
    }
    if (product.counted) { playBeep(300, 200); addToast('error', 'این کد قبلاً شمارش و ثبت شده است'); return; }
    const codes = product.locations.map(l => l.locationCode);
    if (roomMode && !shelfRef.current) {
      // whole-room mode: the first scan decides the physical location (shelf), no confirm needed
      const d = detectShelf(codes, locationCode);
      if (d.kind === 'no_location') {
        playBeep(300, 200);
        addToast('error', 'این کد در اکسل مکان ندارد؛ ابتدا جنسی با مکان مشخص اسکن کنید تا محل فیزیکی تعیین شود');
        return;
      }
      if (d.kind === 'other_room') {
        playBeep(300, 200);
        await logEvent('wrong_location', product, 0, { note: codes.join(','), scanMethod: method });
        setModal({ type: 'wrong', product, expected: codes });
        return;
      }
      if (d.kind === 'pick') { playBeep(600, 120); setModal({ type: 'pickShelf', product, shelves: d.shelves, barcode, method }); return; }
      await lockShelf(d.shelf);
    }
    const here = curLoc();
    if (codes.length && !codes.includes(here)) {
      playBeep(300, 200);
      await logEvent('wrong_location', product, 0, { note: codes.join(','), scanMethod: method });
      let streak = 0; let target: string | undefined;
      if (roomMode) {
        target = codes.find(c => c.startsWith(locationCode));
        if (target) { const s = streakRef.current; streakRef.current = s && s.shelf === target ? { shelf: target, n: s.n + 1 } : { shelf: target, n: 1 }; streak = streakRef.current.n; }
        else streakRef.current = null;
      }
      setModal({ type: 'wrong', product, expected: codes, shelf: roomMode ? here : undefined, target, streak, barcode, method });
      return;
    }
    streakRef.current = null;
    const key = groupKeyOf(barcode);
    if (keyRef.current && keyRef.current !== key) { await openSummary({ code: barcode, method }); return; }
    if (!keyRef.current) {
      clearUndo(); // a new item is open: the previous auto-saved group can no longer be restored
      const g: Product[] = await window.difrag.getGroup({ barcode, versionId });
      setSiblings(g); setGKey(key);
    }
    const idx = rowsRef.current.findIndex(r => r.product.barcode === barcode);
    if (idx < 0) {
      if (product.locations.length > 1) {
        const others = codes.filter(c => c !== curLoc()).map(formatLocation).join('، ');
        const ok = await askConfirm(`این کالا یک محل فیزیکی دیگر هم دارد: ${others}. همهٔ موجودی هر دو محل را خودتان شمارش و همین‌جا ثبت کنید. ادامه؟`);
        if (!ok) { if (!rowsRef.current.length) clearGroup(); return; }
      }
      setRows([...rowsRef.current, { product, qty: 1, scanner: method === 'scanner' ? 1 : 0, manual: method === 'manual' ? 1 : 0 }]);
    } else {
      setRows(rowsRef.current.map((r, i) => i !== idx ? r : { ...r, qty: r.qty + 1, scanner: r.scanner + (method === 'scanner' ? 1 : 0), manual: r.manual + (method === 'manual' ? 1 : 0) }));
    }
    lastBarcodeRef.current = barcode;
    await logEvent(method === 'manual' ? 'manual' : 'scan', product, 1, { scanMethod: method });
    playBeep(800, 60); vibrate(50);
  };
  // A 1–4 digit number typed in the scan box = quantity of the last scanned size (no +/- clicking).
  const quickQty = (n: number) => {
    const bc = lastBarcodeRef.current;
    const row = bc ? rowsRef.current.find(r => r.product.barcode === bc) : null;
    if (!bc || !row) { addToast('error', 'ابتدا بارکد یک سایز را اسکن کنید، بعد تعداد را بنویسید'); return; }
    queue.current = queue.current.then(async () => {
      await setQty(bc, n);
      addToast('info', `سایز ${row.product.size}: تعداد ${toPersianDigits(n)}`);
    }).catch(e => { addToast('error', 'خطا: ' + (e?.message || e)); });
  };
  const handleScan = useCallback((barcode: string, method: 'scanner' | 'manual') => {
    queue.current = queue.current.then(() => process(barcode, method)).catch(e => { addToast('error', 'خطا: ' + (e?.message || e)); });
  }, [versionId, sessionId, userId, profile, locationCode]);
  useScanner({ onScan: handleScan, enabled: !modal });

  const setQty = async (barcode: string, next: number) => {
    const row = rowsRef.current.find(r => r.product.barcode === barcode); if (!row) return;
    const n = Math.max(0, Math.floor(next)); const delta = n - row.qty; if (!delta) return;
    setRows(rowsRef.current.map(r => r.product.barcode === barcode ? { ...r, qty: n, manual: r.manual + Math.max(delta, 0) } : r));
    await logEvent(delta < 0 && Math.abs(delta) === 1 ? 'undo' : 'manual', row.product, delta, { scanMethod: 'manual' });
  };

  const confirmSummary = async () => {
    if (modal?.type !== 'summary') return;
    const m = modal; setModal(null);
    await commit(m, false);
  };
  // Saves one item group. auto = every size matched the Excel, so no dialog was shown.
  const commit = async (m: { lines: Line[]; pending: { code: string; method: 'scanner' | 'manual' } | null; thenFinish: boolean }, auto: boolean) => {
    const sid = sessId();
    const snapRows = rowsRef.current; const snapSib = sibRef.current; const snapKey = keyRef.current; const snapShelf = shelfRef.current;
    const ids: string[] = await window.difrag.saveItemResults(m.lines.map(l => ({
      sessionId: sid, barcode: l.product.barcode, productId: l.product.id, excelReferenceQty: l.ref, physicalQty: l.physical,
      diff: l.diff, resultType: l.type, userId, userFullName: profile?.fullName, userRole: role, recordedAt: nowIso(),
      status: l.type === 'match' ? 'confirmed' : 'pending', note: l.physical === 0 && !snapRows.some(r => r.product.barcode === l.product.barcode) ? 'not_scanned_in_group' : null
    })));
    const first = m.lines[0]?.product;
    setDone(d => [{ title: first ? `${first.fullName}` : '—', lines: m.lines }, ...d]);
    savedRef.current += m.lines.length; shelfSavedRef.current += m.lines.length;
    clearGroup();
    addToast('success', auto ? 'مطابق بود؛ ثبت شد ✓' : 'مغایرت‌های این جنس ثبت شد');
    if (roomMode) await refreshShelves();
    if (m.thenFinish) { await finishLocation(); return; }
    // room mode: the shelf ends by itself once every expected item has been counted
    const shelfEnded = roomMode && !!shelfRef.current && await shelfIsDone();
    if (shelfEnded) await completeShelf();
    if (m.pending) handleScan(m.pending.code, m.pending.method);
    else if (auto && !shelfEnded && Array.isArray(ids) && ids.length) {
      // short undo window; only valid while no other item has been opened
      const snap: UndoSnap = { ids, rows: snapRows, siblings: snapSib, key: snapKey, sid, shelf: snapShelf, n: m.lines.length, until: Date.now() + 6000 };
      clearUndo(); undoRef.current = snap; setUndo(snap);
      undoTimer.current = setTimeout(clearUndo, 6000);
    }
  };
  const undoLast = async () => {
    const u = undoRef.current; clearUndo();
    if (!u) return;
    if (keyRef.current || sessId() !== u.sid) { addToast('error', 'دیگر امکان برگشت نیست'); return; }
    await window.difrag.deleteItemResults(u.ids);
    savedRef.current = Math.max(0, savedRef.current - u.n); shelfSavedRef.current = Math.max(0, shelfSavedRef.current - u.n);
    setDone(d => d.slice(1));
    setRows(u.rows); setSiblings(u.siblings); setGKey(u.key);
    lastBarcodeRef.current = u.rows.length ? u.rows[u.rows.length - 1].product.barcode : null;
    if (u.rows[0]) await logEvent('undo_group', u.rows[0].product, 0, { note: 'auto_match_undone' });
    if (roomMode) await refreshShelves();
    addToast('info', 'برگشت داده شد؛ شمارش را اصلاح کنید');
  };
  const backToCounting = () => {
    if (modal?.type === 'summary' && modal.pending) addToast('info', 'بارکد جدید شمارش نشد؛ پس از اصلاح دوباره اسکن کنید');
    setModal(null);
  };

  const finishLocation = async () => {
    if (roomMode && !shelfRef.current) return;
    if (keyRef.current && rowsRef.current.length) { await openSummary(null, true); return; }
    const items: Product[] = await window.difrag.getUnscanned({ locationCode: curLoc(), versionId });
    if (!items.length) { await complete(); return; }
    setModal({ type: 'unscanned', items, selected: new Set(items.filter(i => i.locations.length === 1).map(i => i.id)) });
  };
  const complete = async () => {
    if (roomMode) { await completeShelf(); return; }
    await window.difrag.updateSession({ id: sessionId, status: 'completed', endedAt: nowIso() });
    onFinish();
  };

  // ---- whole-room mode: shelf lifecycle ----
  const shelfIsDone = async () => {
    const left: Product[] = await window.difrag.getUnscanned({ locationCode: curLoc(), versionId });
    return left.length === 0;
  };
  const completeShelf = async () => {
    const code = shelfRef.current; const sid = shelfSessRef.current;
    if (sid) await window.difrag.updateSession({ id: sid, status: 'completed', endedAt: nowIso() });
    shelfSessRef.current = null; shelfSavedRef.current = 0; streakRef.current = null;
    setShelf(null); setDone([]); clearGroup();
    if (code) addToast('success', `محل ${formatLocation(code)} تمام شد`);
    await refreshShelves();
  };
  // Optional escape hatch: the first scan pointed at the wrong shelf. Never required.
  const changeShelf = async (rescan?: { code: string; method: 'scanner' | 'manual' }) => {
    if (!roomMode || !shelfRef.current) return;
    if (rowsRef.current.length && !(await askConfirm('جنس بازِ ثبت‌نشده پاک می‌شود و محل فیزیکی با اسکن بعدی دوباره تشخیص داده می‌شود. ادامه؟'))) return;
    const sid = shelfSessRef.current; const keep = shelfSavedRef.current > 0;
    if (sid) await window.difrag.updateSession({ id: sid, status: keep ? 'paused' : 'cancelled', endedAt: keep ? null : nowIso() });
    shelfSessRef.current = null; shelfSavedRef.current = 0; streakRef.current = null;
    setShelf(null); setDone([]); clearGroup(); setModal(null);
    addToast('info', 'محل فیزیکی پاک شد؛ با اسکن بعدی محل جدید مشخص می‌شود');
    await refreshShelves();
    if (rescan) handleScan(rescan.code, rescan.method);
  };
  const choosePick = async (code: string) => {
    if (modal?.type !== 'pickShelf') return;
    const m = modal; setModal(null);
    await lockShelf(code);
    handleScan(m.barcode, m.method);
  };
  const requestFinishRoom = async () => {
    if (shelfRef.current) { addToast('error', 'ابتدا محل فیزیکی فعلی را تمام کنید (یا «تغییر قفسه» را بزنید)'); return; }
    const all = versionId ? await window.difrag.getLocations(versionId) : [];
    setModal({ type: 'roomEnd', left: unfinishedShelves(all, locationCode) });
  };
  const finishRoom = async () => {
    await window.difrag.updateSession({ id: sessionId, status: 'completed', endedAt: nowIso() });
    setModal(null); onFinish();
  };
  const registerUnscanned = async () => {
    if (modal?.type !== 'unscanned') return;
    const chosen = modal.items.filter(i => modal.selected.has(i.id));
    setModal(null);
    if (chosen.length) {
      await window.difrag.saveItemResults(chosen.map(p => ({
        sessionId: sessId(), barcode: p.barcode, productId: p.id, excelReferenceQty: refOf(p), physicalQty: 0, diff: -refOf(p),
        resultType: 'system_transfer', userId, userFullName: profile?.fullName, userRole: role, recordedAt: nowIso(),
        status: 'pending', note: 'not_scanned'
      })));
      savedRef.current += chosen.length; shelfSavedRef.current += chosen.length;
      addToast('success', `${toPersianDigits(chosen.length)} مغایرت سیستمی ثبت شد`);
    }
    await complete();
  };

  const totalPieces = rows.reduce((a, r) => a + r.qty, 0);
  const first = rows[0]?.product;
  const allMatch = modal?.type === 'summary' && modal.lines.every(l => l.type === 'match');
  const exit = async () => {
    if (!(await askConfirm('از شمارش این محل خارج می‌شوید؟ شمارش‌های ثبت‌شده حفظ می‌شود و جنس باز (ثبت‌نشده) از دست می‌رود.'))) return;
    if (!roomMode) {
      // a shelf opened by mistake (nothing saved) must not linger as a resumable "unfinished" session
      const saved = await window.difrag.getItemResults({ sessionId });
      onExit(Array.isArray(saved) && saved.length ? 'paused' : 'cancelled');
      return;
    }
    // room run: a paused shelf session carries the resume point; the room session ends unless
    // earlier shelves were saved and no shelf is open (then resume re-enters room mode).
    const sid = shelfSessRef.current;
    if (sid) {
      const keep = shelfSavedRef.current > 0;
      await window.difrag.updateSession({ id: sid, status: keep ? 'paused' : 'cancelled', endedAt: keep ? null : nowIso() });
      shelfSessRef.current = null;
      onExit(keep ? 'completed' : savedRef.current > 0 ? 'paused' : 'cancelled');
      return;
    }
    onExit(savedRef.current > 0 ? 'paused' : 'cancelled');
  };
  return (
    <div className="pb-28 min-h-full bg-bg">
      <header className="sticky top-0 z-30 bg-primary text-white px-5 py-3 flex items-center gap-4 border-b-4 border-accent/70">
        <button onClick={exit} aria-label="خروج از شمارش" className="w-11 h-11 rounded-full border-2 border-white/80 flex items-center justify-center shrink-0"><IBack className="w-6 h-6 rotate-180" /></button>
        <div className="flex-1">
          <div className="font-extrabold text-lg leading-tight">کارت آیتم</div>
          <div className="text-xs text-white/70">{roomMode ? `شمارش کل اتاق · ${formatRoom(locationCode)}` : formatLocation(locationCode)}</div>
        </div>
        <div className="text-left hidden sm:block">
          <div className="text-xs text-white/70">{profile?.fullName}</div>
          <div className="text-xs">{toPersianDigits(done.length)} جنس ثبت‌شده</div>
        </div>
        <div className="flex items-center gap-2"><IShield className="w-9 h-9 text-accent" /><div className="leading-tight"><div className="font-extrabold">شمارش موجودی انبار</div><div className="text-[11px] text-white/70">مرجع اکسل · دقیق · مطمئن</div></div></div>
      </header>

      <div className="p-4 space-y-4 max-w-4xl mx-auto">
        {roomMode && (() => {
          const need = shelves.filter(needsCount); const doneN = need.filter(isShelfDone).length;
          return (
            <div className={`rounded-card shadow-card border p-4 ${shelf ? 'bg-primary/5 border-primary/30' : 'bg-surface border-dashed border-primary/30'}`}>
              {shelf ? (
                <div className="flex items-center gap-3 flex-wrap">
                  <IPin className="w-7 h-7 text-primary shrink-0" />
                  <div className="flex-1 min-w-0">
                    <div className="font-extrabold text-primary text-lg">شما در حال اسکن محل فیزیکی <span dir="ltr">{shelf}</span> هستید</div>
                    <div className="text-sm text-text/80">{formatLocation(shelf)}</div>
                  </div>
                  <button onClick={() => changeShelf()} className="text-sm text-accent underline min-h-[44px] px-2">تغییر قفسه</button>
                </div>
              ) : (
                <div className="text-center">
                  <IWarehouse className="w-9 h-9 text-primary mx-auto mb-1" />
                  <div className="font-bold text-primary">{formatRoom(locationCode)}</div>
                  <div className="text-sm text-muted">اولین جنس را اسکن کنید؛ محل فیزیکی خودکار تشخیص داده می‌شود.</div>
                </div>
              )}
              {need.length > 0 && (
                <div className="mt-3">
                  <div className="h-2 rounded bg-primary/10 overflow-hidden"><div className="h-full bg-success" style={{ width: `${Math.round((doneN / need.length) * 100)}%` }} /></div>
                  <div className="text-xs text-muted mt-1">{toPersianDigits(doneN)} از {toPersianDigits(need.length)} قفسه این اتاق تمام شده</div>
                </div>
              )}
            </div>
          );
        })()}
        <div className="bg-surface rounded-card shadow-card p-4 border border-primary/5">
          <label className="block text-sm text-muted mb-2">بارکد را اسکن کنید. برای تعداد زیاد، بعد از اسکن یک سایز، عدد را همین‌جا بنویسید و Enter بزنید (مثلاً ۱۲)</label>
          <input ref={inputRef} dir="ltr" inputMode="numeric" disabled={!!modal} data-scanner="true"
            className="w-full border-2 border-accent/40 focus:border-accent outline-none rounded-btn px-4 py-4 text-center font-mono text-xl bg-bg"
            placeholder="۱۲۱۹۱۳۲۷۲۱۰۷۱"
            onKeyDown={e => {
              const now = Date.now();
              if (/^\d$/.test(e.key)) keyTimes.current.push(now);
              if (e.key === 'Enter') {
                const el = e.currentTarget; const v = el.value.trim();
                const t = keyTimes.current; keyTimes.current = [];
                const gaps = t.slice(1).map((x, i) => x - t[i]);
                const avg = gaps.length ? gaps.reduce((a, b) => a + b, 0) / gaps.length : 999;
                if (/^\d{8,20}$/.test(v)) { handleScan(v, avg < 25 && v.length >= 8 ? 'scanner' : 'manual'); el.value = ''; }
                else if (/^\d{1,4}$/.test(v)) { quickQty(parseInt(v, 10)); el.value = ''; }
                else { addToast('error', 'بارکد باید ۸ تا ۲۰ رقم باشد (یا یک عدد کوتاه برای تعداد)'); }
              }
            }} />
        </div>

        {gKey && first ? (
          <>
            <div className="bg-surface rounded-card shadow-card border border-primary/5 p-4 flex gap-4 items-center">
              <div className="w-24 h-24 rounded-card bg-bg border flex items-center justify-center text-primary/70 shrink-0"><IShirt className="w-14 h-14" /></div>
              <div className="flex-1 min-w-0">
                <h2 className="text-xl font-extrabold text-primary mb-2">{first.fullName.replace(/\s*س\s*\S+\s*(?=طرح)/, ' ')}</h2>
                <div className="grid grid-cols-3 gap-2 text-sm">
                  <Detail t="رنگ" v={first.color} /><Detail t="جنسیت" v={first.gender} /><Detail t="مجموع شمارش" v={`${toPersianDigits(totalPieces)} عدد`} />
                </div>
              </div>
            </div>
            {[...rows].sort((a, b) => sizeCode(a.product.barcode).localeCompare(sizeCode(b.product.barcode))).map(r => (
              <div key={r.product.barcode} className="bg-surface rounded-card shadow-card border border-accent/30 p-4">
                <div className="flex items-center gap-4 flex-wrap">
                  <div className="min-w-[72px]">
                    <div className="text-xs text-muted">سایز</div>
                    <div className="text-2xl font-extrabold text-primary">{r.product.size}</div>
                    <div className="font-mono text-[11px] text-muted" dir="ltr">{r.product.barcode}</div>
                  </div>
                  <div className="flex items-center gap-2 mr-auto">
                    <button aria-label="کم" onClick={() => setQty(r.product.barcode, r.qty - 1)} className="w-12 h-12 rounded-full bg-accent/10 text-accent flex items-center justify-center"><IMinus className="w-6 h-6" /></button>
                    <div className="text-center">
                      <div className="text-xs text-muted flex items-center justify-center gap-1"><IKeyboard className="w-4 h-4" />شمارش (ثبت دستی)</div>
                      <input key={r.qty} dir="ltr" type="number" min={0} defaultValue={r.qty} aria-label="تعداد (ثبت دستی)"
                        className="w-28 h-14 border-2 border-accent/40 rounded-btn text-center text-3xl font-extrabold text-accent bg-surface"
                        onBlur={e => setQty(r.product.barcode, parseInt(e.target.value || '0', 10))}
                        onKeyDown={e => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur(); }} />
                    </div>
                    <button aria-label="زیاد" onClick={() => setQty(r.product.barcode, r.qty + 1)} className="w-12 h-12 rounded-full bg-success text-white flex items-center justify-center"><IPlus className="w-6 h-6" /></button>
                  </div>
                </div>
                {r.product.locations.length > 1 && (
                  <div className="mt-3 border rounded-btn p-3 text-sm bg-bg">
                    <div className="flex items-center gap-1 font-bold text-accent mb-1"><IPin className="w-4 h-4" />اطلاعات چندمکانی</div>
                    {r.product.locations.map(l => (
                      <div key={l.locationCode} className="flex justify-between py-0.5"><span dir="ltr">{l.locationCode}</span><span>عدد {toPersianDigits(l.expectedQty)}</span></div>
                    ))}
                    <div className="border-t mt-1 pt-1 text-primary font-medium">مجموع مرجع: {toPersianDigits(refOf(r.product))} عدد — لطفاً هر دو مکان را بشمارید.</div>
                  </div>
                )}
              </div>
            ))}
            <p className="text-xs text-muted">برای تعداد زیاد، عدد را مستقیم در کادر شمارش بنویسید (ثبت دستی). اسکن بارکد سایز دیگرِ همین جنس به این فهرست اضافه می‌شود؛ بارکد جنس دیگر، این جنس را می‌بندد.</p>
            <button onClick={() => { openSummary(null); }} className="w-full bg-primary text-white py-4 rounded-card font-extrabold text-xl min-h-[60px] flex items-center justify-center gap-2"><ICheck className="w-6 h-6" />پایان شمارش این کد</button>
          </>
        ) : (
          <div className="text-center text-muted py-12 bg-surface/60 rounded-card border border-dashed">هنوز جنسی در حال شمارش نیست — اولین بارکد را اسکن کنید</div>
        )}

        {done.length > 0 && <div className="text-sm font-bold text-primary pt-2">ثبت‌شده در این محل</div>}
        {done.map((g, i) => (
          <div key={i} className="bg-surface rounded-card p-3 text-sm border border-primary/5">
            <div className="font-medium mb-1">{g.title}</div>
            <div className="flex flex-wrap gap-2">
              {g.lines.map(l => <span key={l.product.barcode} className={`border rounded-full px-3 py-0.5 text-xs ${tone[l.type]}`}>{l.product.size} · {toPersianDigits(l.physical)}/{toPersianDigits(l.ref)}</span>)}
            </div>
          </div>
        ))}
      </div>

      {undo && <UndoBar until={undo.until} onUndo={undoLast} />}
      <div className="fixed bottom-0 inset-x-0 p-4 bg-gradient-to-t from-bg via-bg to-transparent">
        {roomMode ? (
          <div className="max-w-4xl mx-auto flex gap-2">
            <button onClick={finishLocation} disabled={!!modal || !shelf} className="flex-1 bg-accent text-white py-3.5 rounded-card font-extrabold min-h-[52px] shadow-card disabled:opacity-40">اتمام این محل فیزیکی</button>
            <button onClick={requestFinishRoom} disabled={!!modal} className="bg-primary text-white px-5 py-3.5 rounded-card font-bold min-h-[52px] shadow-card disabled:opacity-40">پایان اتاق</button>
          </div>
        ) : (
          <button onClick={finishLocation} disabled={!!modal} className="w-full max-w-4xl mx-auto block bg-accent text-white py-3.5 rounded-card font-extrabold min-h-[52px] shadow-card">اتمام این محل فیزیکی</button>
        )}
      </div>

      {modal?.type === 'summary' && (
        <Overlay>
          <div className="text-center mb-3">
            <div className={`w-16 h-16 rounded-full mx-auto flex items-center justify-center text-white ${allMatch ? 'bg-success' : 'bg-system'}`}>{allMatch ? <ICheck className="w-9 h-9" /> : <IBox className="w-9 h-9" />}</div>
            <h3 className="text-2xl font-extrabold text-primary mt-2">{allMatch ? 'مطابقت کامل' : 'مغایرت شناسایی شد'}</h3>
            <p className="text-sm text-muted">{allMatch ? 'تعداد اقلام فیزیکی با فایل اکسل مطابقت دارد.' : 'نتیجهٔ این جنس به ترتیب سایز'}</p>
          </div>
          <div className="space-y-2 mb-3">
            {modal.lines.map(l => (
              <div key={l.product.barcode} className={`border-2 rounded-btn p-3 flex items-center gap-3 ${tone[l.type]}`}>
                <div className="text-xl font-extrabold w-14 text-center">{l.product.size}</div>
                <div className="text-sm flex-1 text-text">فیزیکی {toPersianDigits(l.physical)} · اکسل {toPersianDigits(l.ref)} · اختلاف {toPersianDigits(l.diff)}</div>
                <div className="font-bold text-sm">{label[l.type]}{l.diff !== 0 && ` ${toPersianDigits(Math.abs(l.diff))}`}</div>
              </div>
            ))}
          </div>
          {!allMatch && <ul className="text-sm list-disc pr-5 mb-4 space-y-0.5">{modal.lines.map(l => <li key={l.product.barcode}>{sentence(l)}</li>)}</ul>}
          <button onClick={confirmSummary} className="w-full bg-success text-white py-3.5 rounded-btn font-extrabold min-h-[52px] flex items-center justify-center gap-2"><ICheck className="w-5 h-5" />تأیید و ادامه</button>
          <button onClick={backToCounting} className="w-full mt-2 border py-3 rounded-btn min-h-[48px]">بازگشت برای شمارش مجدد</button>
        </Overlay>
      )}

      {modal?.type === 'wrong' && (
        <Overlay>
          <div className="text-center">
            <div className="text-4xl mb-2">⚠️</div>
            <h3 className="text-lg font-bold text-danger mb-2">محل فیزیکی اشتباه است</h3>
            <p className="text-sm mb-1">{modal.product.fullName} · {modal.product.size}</p>
            <p className="text-sm mb-3">{modal.shelf
              ? <>این جنس مربوط به محل فیزیکی دیگری است. آن را سر جایش بگذارید تا محل <b dir="ltr">{modal.shelf}</b> به اتمام برسد. جای درست:</>
              : 'این کالا اینجا شمرده نمی‌شود. آن را به محل اصلی (مرجع اکسل) منتقل کنید:'}</p>
            <div className="bg-primary/10 text-primary rounded-btn p-3 font-bold mb-4 space-y-1">
              {modal.expected.map(c => <div key={c}>{formatLocation(c)}</div>)}
            </div>
            <p className="text-xs text-muted mb-4">در همان محل، هنگام شمارش بررسی می‌شود. این رویداد با نام شما ثبت شد.</p>
            {modal.shelf && modal.target && (modal.streak || 0) >= 2 && modal.barcode && modal.method && (
              <button onClick={() => changeShelf({ code: modal.barcode!, method: modal.method! })} className="w-full mb-2 border border-accent text-accent py-3 rounded-btn font-bold min-h-[48px]">
                من در محل <span dir="ltr">{modal.target}</span> هستم (تغییر قفسه)
              </button>
            )}
            <button onClick={() => setModal(null)} className="w-full bg-primary text-white py-3 rounded-btn font-bold min-h-[48px]">متوجه شدم</button>
          </div>
        </Overlay>
      )}

      {modal?.type === 'pickShelf' && (
        <Overlay>
          <div className="text-center">
            <IPin className="w-10 h-10 text-primary mx-auto mb-2" />
            <h3 className="text-lg font-bold text-primary mb-1">این کد دو محل فیزیکی دارد</h3>
            <p className="text-sm text-muted mb-1">{modal.product.fullName} · {modal.product.size}</p>
            <p className="text-sm mb-3">از کدام محل فیزیکی شروع به شمارش می‌کنید؟</p>
            <div className="space-y-2 mb-3">
              {modal.shelves.map(c => (
                <button key={c} onClick={() => choosePick(c)} className="w-full bg-primary text-white py-3 rounded-btn font-bold min-h-[52px]">
                  <span dir="ltr" className="block text-lg">{c}</span>
                  <span className="block text-xs text-white/80">{formatLocation(c)}</span>
                </button>
              ))}
            </div>
            <button onClick={() => setModal(null)} className="w-full border py-3 rounded-btn min-h-[48px]">انصراف (این اسکن نادیده گرفته شود)</button>
          </div>
        </Overlay>
      )}

      {modal?.type === 'roomEnd' && (
        <Overlay>
          <h3 className="text-lg font-bold text-primary mb-1">پایان شمارش اتاق</h3>
          {modal.left.length === 0 ? (
            <p className="text-sm text-success mb-4">همهٔ قفسه‌های این اتاق شمارش شده‌اند.</p>
          ) : (
            <>
              <p className="text-sm text-muted mb-2">{toPersianDigits(modal.left.length)} محل فیزیکی هنوز تمام نشده است:</p>
              <div className="max-h-56 overflow-auto space-y-1 mb-4">
                {modal.left.map(l => (
                  <div key={l.location_code} className="flex justify-between border rounded-btn px-3 py-2 text-sm">
                    <span dir="ltr">{l.location_code}</span>
                    <span className="text-muted">{toPersianDigits(l.counted_count)} از {toPersianDigits(l.need_count)} قلم</span>
                  </div>
                ))}
              </div>
            </>
          )}
          <button onClick={finishRoom} className="w-full bg-success text-white py-3 rounded-btn font-bold min-h-[48px]">پایان اتاق</button>
          <button onClick={() => setModal(null)} className="w-full mt-2 border py-3 rounded-btn min-h-[48px]">بازگشت به شمارش</button>
        </Overlay>
      )}

      {modal?.type === 'unscanned' && (
        <Overlay>
          <h3 className="text-lg font-bold text-danger mb-1">کدهای اسکن‌نشده</h3>
          <p className="text-sm text-muted mb-3">این کدها در اکسل در این محل موجودی دارند ولی اسکن نشده‌اند. اگر در انبار نیستند، مغایرت سیستمی (کسر از سیستم) ثبت کنید.</p>
          <div className="max-h-64 overflow-auto space-y-2 mb-4">
            {modal.items.map(p => (
              <label key={p.id} className="flex items-start gap-3 border rounded-btn p-2 text-sm">
                <input type="checkbox" className="mt-1 w-5 h-5" checked={modal.selected.has(p.id)}
                  onChange={() => { const s = new Set(modal.selected); s.has(p.id) ? s.delete(p.id) : s.add(p.id); setModal({ ...modal, selected: s }); }} />
                <span className="flex-1">
                  <span className="font-bold">{p.size}</span> · موجودی {toPersianDigits(refOf(p))}
                  <span className="block text-xs text-muted">{p.fullName}</span>
                  <span className="block font-mono text-[10px]" dir="ltr">{p.barcode}</span>
                  {p.locations.length > 1 && <span className="block text-xs text-warning">محل دیگر هم دارد: {p.locations.filter(l => l.locationCode !== locationCode).map(l => formatLocation(l.locationCode)).join('، ')} (پیش‌فرض انتخاب نشده)</span>}
                </span>
              </label>
            ))}
          </div>
          <button onClick={() => setModal(null)} className="w-full bg-primary text-white py-3 rounded-btn font-bold min-h-[48px]">ادامه اسکن</button>
          <button onClick={registerUnscanned} className="w-full mt-2 bg-system text-white py-3 rounded-btn font-bold min-h-[48px]">ثبت مغایرت سیستمی (انتخاب‌شده‌ها) و اتمام محل</button>
        </Overlay>
      )}
    </div>
  );
}

function UndoBar({ until, onUndo }: { until: number; onUndo: () => void }) {
  const [left, setLeft] = useState(Math.max(0, Math.ceil((until - Date.now()) / 1000)));
  useEffect(() => {
    const t = setInterval(() => setLeft(Math.max(0, Math.ceil((until - Date.now()) / 1000))), 250);
    return () => clearInterval(t);
  }, [until]);
  return (
    <div className="fixed bottom-24 inset-x-0 z-40 flex justify-center px-4 pointer-events-none">
      <div role="status" className="pointer-events-auto bg-success text-white rounded-card shadow-card px-4 py-2 flex items-center gap-3 max-w-md w-full">
        <ICheck className="w-6 h-6 shrink-0" />
        <span className="flex-1 font-bold">مطابق بود؛ ثبت شد</span>
        <button onClick={onUndo} className="bg-white/20 hover:bg-white/30 rounded-btn px-4 py-2 font-bold min-h-[44px]">برگشت ({toPersianDigits(left)})</button>
      </div>
    </div>
  );
}

function Overlay({ children }: { children: React.ReactNode }) {
  return (
    <div className="fixed inset-0 z-[55] bg-black/45 flex items-center justify-center p-4" role="dialog" aria-modal="true">
      <div className="bg-surface rounded-card shadow-card p-5 w-full max-w-md max-h-[90vh] overflow-auto">{children}</div>
    </div>
  );
}

function Detail({ t, v }: { t: string; v: string }) {
  return <div><div className="text-xs text-muted">{t}</div><div className="font-medium">{v || '—'}</div></div>;
}
