import { useEffect, useRef, useCallback } from 'react';

interface ScannerOptions {
  onScan: (barcode: string, method: 'scanner' | 'manual') => void;
  enabled?: boolean;
}

/**
 * USB HID keyboard-wedge scanner support.
 * - Buffer digits; Enter/Tab flushes as complete barcode
 * - Incomplete buffer discarded after 100ms idle
 * - Method: avg inter-key < 5ms + Enter => scanner; gaps > 30ms => manual
 * - Only 8–20 digit barcodes accepted
 */
export function useScanner({ onScan, enabled = true }: ScannerOptions) {
  const bufferRef = useRef('');
  const lastKeyTimeRef = useRef(0);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const intervalsRef = useRef<number[]>([]);

  const flush = useCallback((method: 'scanner' | 'manual') => {
    const code = bufferRef.current.trim();
    bufferRef.current = '';
    intervalsRef.current = [];
    if (timerRef.current) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
    if (code && /^\d{8,20}$/.test(code)) {
      onScan(code, method);
    }
  }, [onScan]);

  useEffect(() => {
    if (!enabled) return;

    const onKeyDown = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement;
      if (
        target.tagName === 'INPUT' &&
        target.getAttribute('data-scanner') !== 'true' &&
        (target as HTMLInputElement).type !== 'hidden'
      ) {
        return;
      }

      const now = Date.now();
      const delta = lastKeyTimeRef.current ? now - lastKeyTimeRef.current : 0;
      lastKeyTimeRef.current = now;

      if (e.key === 'Enter' || e.key === 'Tab') {
        e.preventDefault();
        const intervals = intervalsRef.current;
        const avg = intervals.length
          ? intervals.reduce((a, b) => a + b, 0) / intervals.length
          : 999;
        const method: 'scanner' | 'manual' =
          avg < 5 && bufferRef.current.length >= 8 ? 'scanner' : 'manual';
        flush(method);
        return;
      }

      if (e.key.length === 1 && /\d/.test(e.key)) {
        if (delta > 0 && delta < 500) intervalsRef.current.push(delta);
        bufferRef.current += e.key;
        if (timerRef.current) clearTimeout(timerRef.current);
        timerRef.current = setTimeout(() => {
          bufferRef.current = '';
          intervalsRef.current = [];
        }, 100);
      } else if (e.key === 'Backspace') {
        bufferRef.current = bufferRef.current.slice(0, -1);
      }
    };

    document.addEventListener('keydown', onKeyDown, true);
    return () => {
      document.removeEventListener('keydown', onKeyDown, true);
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, [enabled, flush]);
}
