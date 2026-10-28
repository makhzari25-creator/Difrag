export type Role = 'مدیر' | 'انباردار';
export const BUILD_ID = '4821';
export const APP_VERSION = '1.0.0';
export const APP_NAME = 'دیفرگ';
export interface UserProfile { fullName: string; firstName: string; lastName: string; isManager: boolean; deviceId: string; }
export interface Product {
  id: number; excelVersionId: number; barcode: string; size: string; fullName: string;
  color: string; gender: string; isActive: boolean; excelReferenceQty: number;
  effectiveReferenceQty: number; locationCount: number; rawLocations: string;
  locations: { id: number; productId: number; locationCode: string; expectedQty: number }[];
}
export interface Session {
  id: string; locationCode: string; startedByUserId: number; startedByName: string;
  startedByRole: Role; startedAt: string; endedAt: string | null; status: string; excelVersionId: number;
}
