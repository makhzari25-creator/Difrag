import { useEffect, useRef, useCallback } from 'react';
interface ScannerOptions { onScan: (barcode: string, method: 'scanner' | 'manual') => void; enabled?: boolean; }
export function useScanner({ onScan, enabled = true }: ScannerOptions) {
  const bufferRef = useRef(''); const lastKeyTimeRef = useRef(0);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const intervalsRef = useRef<number[]>([]);
  const flush = useCallback((method: 'scanner' | 'manual') => {
    const code = bufferRef.current.trim();
    bufferRef.current = ''; intervalsRef.current = [];
    if (timerRef.current) { clearTimeout(timerRef.current); timerRef.current = null; }
    if (code && /^\d{8,20}$/.test(code)) onScan(code, method);
  }, [onScan]);
  useEffect(() => {
    if (!enabled) return;
    const onKeyDown = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement;
      if (target.tagName === 'INPUT' && target.getAttribute('data-scanner') !== 'true' && (target as HTMLInputElement).type !== 'hidden') return;
      const now = Date.now(); const delta = now - lastKeyTimeRef.current; lastKeyTimeRef.current = now;
      if (e.key === 'Enter' || e.key === 'Tab') {
        e.preventDefault();
        const avg = intervalsRef.current.length ? intervalsRef.current.reduce((a,b)=>a+b,0)/intervalsRef.current.length : 999;
        flush(avg < 30 && bufferRef.current.length >= 8 ? 'scanner' : 'manual');
        return;
      }
      if (e.key.length === 1 && /[\d]/.test(e.key)) {
        if (delta > 0 && delta < 500) intervalsRef.current.push(delta);
        bufferRef.current += e.key;
        if (timerRef.current) clearTimeout(timerRef.current);
        timerRef.current = setTimeout(() => { bufferRef.current = ''; intervalsRef.current = []; }, 100);
      } else if (e.key === 'Backspace') bufferRef.current = bufferRef.current.slice(0, -1);
    };
    document.addEventListener('keydown', onKeyDown, true);
    return () => { document.removeEventListener('keydown', onKeyDown, true); if (timerRef.current) clearTimeout(timerRef.current); };
  }, [enabled, flush]);
}
