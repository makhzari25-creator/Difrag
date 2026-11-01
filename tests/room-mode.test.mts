/**
 * Unit tests for room-counting helpers.
 * Run: node --experimental-strip-types tests/room-mode.test.mts   (Node >= 22.6)
 */
import assert from 'node:assert/strict';
import { detectShelf, shelvesInRoom, summarizeRooms, unfinishedShelves, roomOf, isRoomCode } from '../shared/room.ts';

let n = 0;
const t = (name: string, fn: () => void) => { fn(); n++; console.log('PASS:', name); };

t('roomOf takes first 4 digits', () => assert.equal(roomOf('01120405'), '0112'));
t('isRoomCode accepts only 4 digits', () => {
  assert.ok(isRoomCode('0112')); assert.ok(!isRoomCode('011')); assert.ok(!isRoomCode('01120405'));
});
t('shelvesInRoom filters by prefix', () => {
  assert.deepEqual(shelvesInRoom(['01120405', '02010101'], '0112'), ['01120405']);
});
t('detect: single shelf in room', () => assert.deepEqual(detectShelf(['01120405'], '0112'), { kind: 'single', shelf: '01120405' }));
t('detect: single in room + one in another room => single', () =>
  assert.deepEqual(detectShelf(['02010101', '01120405'], '0112'), { kind: 'single', shelf: '01120405' }));
t('detect: two shelves in room => pick', () =>
  assert.deepEqual(detectShelf(['01120405', '01120406'], '0112'), { kind: 'pick', shelves: ['01120405', '01120406'] }));
t('detect: other room only', () => assert.deepEqual(detectShelf(['02010101'], '0112'), { kind: 'other_room' }));
t('detect: no location', () => assert.deepEqual(detectShelf([], '0112'), { kind: 'no_location' }));

const rows = [
  { location_code: '01120101', need_count: 3, counted_count: 3, expected_units: 10, open_sessions: 0 },
  { location_code: '01120102', need_count: 2, counted_count: 1, expected_units: 6, open_sessions: 1 },
  { location_code: '01120103', need_count: 0, counted_count: 0, expected_units: 0, open_sessions: 0 },
  { location_code: '02010101', need_count: 4, counted_count: 0, expected_units: 8, open_sessions: 0 }
];
t('summarizeRooms aggregates per room', () => {
  const s = summarizeRooms(rows);
  assert.equal(s.length, 2);
  assert.deepEqual(s[0], { room: '0112', shelves: 2, doneShelves: 1, items: 5, units: 16, started: true });
  assert.deepEqual(s[1], { room: '0201', shelves: 1, doneShelves: 0, items: 4, units: 8, started: false });
});
t('unfinishedShelves ignores empty and done shelves', () =>
  assert.deepEqual(unfinishedShelves(rows, '0112').map(r => r.location_code), ['01120102']));

console.log(`\nAll ${n} room-mode tests passed.`);
