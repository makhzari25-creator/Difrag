// Everyday wording for count results, shared by the counting screen and the practice mode.
// Reports (manager view) keep the technical names: «کسر سیستمی» / «انتقال فیزیکی».
import { toPersianDigits } from './utils';

export type ResType = 'match' | 'system_transfer' | 'physical_transfer';

export const RES_LABEL: Record<ResType, string> = { match: 'درست است', system_transfer: 'کم است', physical_transfer: 'اضافه است' };
export const RES_ICON: Record<ResType, string> = { match: '✓', system_transfer: '▼', physical_transfer: '▲' };

/** "۲ عدد کم است" / "۳ عدد اضافه است" / "مطابق" */
export function resultPhrase(type: ResType, diff: number): string {
  const n = toPersianDigits(Math.abs(diff));
  if (type === 'match') return 'مطابق';
  return type === 'system_transfer' ? `${n} عدد کم است` : `${n} عدد اضافه است`;
}
/** What the clerk should expect to happen next, in plain words. */
export function resultHint(type: ResType): string {
  if (type === 'system_transfer') return 'از سیستم کم می‌شود';
  if (type === 'physical_transfer') return 'به سالن منتقل شود';
  return '';
}
