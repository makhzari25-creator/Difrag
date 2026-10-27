const persianDigits = ['۰','۱','۲','۳','۴','۵','۶','۷','۸','۹'];
export function toPersianDigits(n: number | string): string {
  return String(n).replace(/\d/g, d => persianDigits[parseInt(d, 10)]);
}
export function formatLocation(code: string): string {
  if (!code || code.length !== 8) return code || '—';
  return `انبار ${toPersianDigits(code.slice(0,2))} · اتاق ${toPersianDigits(code.slice(2,4))} · رگال ${toPersianDigits(code.slice(4,6))} · ردیف ${toPersianDigits(code.slice(6,8))}`;
}
export function nowIso(): string { return new Date().toISOString(); }
export function formatDateTimeFa(iso: string): string {
  try {
    const d = new Date(iso);
    const h = String(d.getHours()).padStart(2,'0');
    const m = String(d.getMinutes()).padStart(2,'0');
    return toPersianDigits(`${d.getDate()}/${d.getMonth()+1}/${d.getFullYear()} — ${h}:${m}`);
  } catch { return iso; }
}
export function getDeviceId(): string {
  let id = localStorage.getItem('difrag_device_id');
  if (!id) { id = 'dev-' + Math.random().toString(36).slice(2) + Date.now().toString(36); localStorage.setItem('difrag_device_id', id); }
  return id;
}
export function playBeep(freq = 800, duration = 60) {
  try {
    const ctx = new (window.AudioContext || (window as any).webkitAudioContext)();
    const osc = ctx.createOscillator(); const gain = ctx.createGain();
    osc.connect(gain); gain.connect(ctx.destination);
    osc.frequency.value = freq; osc.type = 'sine'; gain.gain.value = 0.15;
    osc.start(); setTimeout(() => { osc.stop(); ctx.close(); }, duration);
  } catch {}
}
export function vibrate(ms = 50) { try { if (navigator.vibrate) navigator.vibrate(ms); } catch {} }
declare global { interface Window { difrag: any; } }
