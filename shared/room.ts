// Room-counting helpers (pure functions, no UI / no Electron).
// Location code = 8 digits: انبار(2) اتاق(2) رگال(2) ردیف(2).
// Room = first 4 digits. Shelf (physical location) = full 8-digit code.

export const ROOM_LEN = 4;

export const isShelfCode = (c: string): boolean => /^\d{8}$/.test(c);
export const isRoomCode = (c: string): boolean => /^\d{4}$/.test(c);
export const roomOf = (code: string): string => code.slice(0, ROOM_LEN);

/** Shelves (8-digit codes) of a product that sit inside the given room. */
export function shelvesInRoom(codes: string[], room: string): string[] {
  return codes.filter(c => isShelfCode(c) && c.startsWith(room));
}

export type Detection =
  | { kind: 'no_location' }                  // product has no location in Excel -> cannot decide the shelf
  | { kind: 'other_room' }                   // product belongs to another room
  | { kind: 'single'; shelf: string }        // exactly one shelf in this room -> lock it
  | { kind: 'pick'; shelves: string[] };     // two shelves in this room -> ask the user

/** Decide which shelf a first scan points to when counting a whole room. */
export function detectShelf(codes: string[], room: string): Detection {
  if (!codes.length) return { kind: 'no_location' };
  const inRoom = shelvesInRoom(codes, room);
  if (!inRoom.length) return { kind: 'other_room' };
  if (inRoom.length === 1) return { kind: 'single', shelf: inRoom[0] };
  return { kind: 'pick', shelves: inRoom };
}

/** Row shape returned by the `get-locations` IPC. */
export interface LocRow {
  location_code: string;
  need_count: number;
  counted_count: number;
  expected_units: number;
  open_sessions?: number;
}

/** A shelf needs counting only if the Excel has stock for it. */
export const needsCount = (r: LocRow): boolean => r.need_count > 0;
export const isShelfDone = (r: LocRow): boolean => r.need_count > 0 && r.counted_count >= r.need_count;

export function shelvesOfRoom(rows: LocRow[], room: string): LocRow[] {
  return rows.filter(r => r.location_code.startsWith(room));
}

/** Shelves of the room that still have uncounted stock. */
export function unfinishedShelves(rows: LocRow[], room: string): LocRow[] {
  return shelvesOfRoom(rows, room).filter(r => needsCount(r) && !isShelfDone(r));
}

export interface RoomSummary {
  room: string;
  shelves: number;       // shelves that need counting
  doneShelves: number;   // of those, fully counted
  items: number;         // sum of need_count
  units: number;         // sum of expected units
  started: boolean;      // anything counted or a session still open
}

export function summarizeRooms(rows: LocRow[]): RoomSummary[] {
  const map = new Map<string, RoomSummary>();
  for (const r of rows) {
    if (!isShelfCode(r.location_code)) continue;
    const room = roomOf(r.location_code);
    const s = map.get(room) || { room, shelves: 0, doneShelves: 0, items: 0, units: 0, started: false };
    if (needsCount(r)) { s.shelves += 1; if (isShelfDone(r)) s.doneShelves += 1; }
    s.items += r.need_count || 0;
    s.units += r.expected_units || 0;
    if (r.counted_count > 0 || (r.open_sessions || 0) > 0) s.started = true;
    map.set(room, s);
  }
  return [...map.values()].sort((a, b) => a.room.localeCompare(b.room));
}
