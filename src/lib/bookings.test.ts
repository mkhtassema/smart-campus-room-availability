import { describe, test, expect } from 'vitest';
import {
  checkAvailability,
  SAMPLE_ROOMS,
  timeStringToMinutes,
  minutesToTimeString,
} from './bookings';
import type { Room } from '@/types';

/**
 * Default fixture (from the Practice #07 slides):
 *   now = 540 (09:00), room not blocked, one booking 600–660 (10:00–11:00).
 * A FRESH room object is created for every call so tests never share state.
 * Expected values come from AC1–AC6, NOT from the current output of the code.
 */
const NOW = 540;
const makeRoom = (over: Partial<Room> = {}): Room => ({
  id: 'test',
  name: 'Test Room',
  building: 'Test Hall',
  capacity: 10,
  blocked: false,
  bookings: [{ start: 600, end: 660, label: 'Existing' }],
  ...over,
});
const check = (start: number, end: number, over: Partial<Room> = {}, now = NOW) =>
  checkAvailability(makeRoom(over), start, end, now);

// Recursively freeze so any accidental mutation of room data throws (AC5).
const deepFreeze = <T>(o: T): T => {
  Object.values(o as object).forEach((v) => {
    if (v && typeof v === 'object') deepFreeze(v);
  });
  return Object.freeze(o);
};

describe('AC1 — valid time range, start after current time', () => {
  test('T02: start == now (540–570) is rejected', () => {
    const r = check(540, 570);
    expect(r.available).toBe(false);
    expect(r.reasons).toEqual(['Start time must be after the current campus time.']);
  });
  test('T03: zero duration (720–720) is rejected', () => {
    const r = check(720, 720);
    expect(r.available).toBe(false);
    expect(r.reasons).toEqual(['Interval must satisfy 0 ≤ start < end ≤ 1440 minutes.']);
  });
  test('T04: reversed interval (750–720) is rejected', () => {
    const r = check(750, 720);
    expect(r.available).toBe(false);
    expect(r.reasons).toEqual(['Interval must satisfy 0 ≤ start < end ≤ 1440 minutes.']);
  });
  test('T05: end past day end (1380–1441) is rejected', () => {
    const r = check(1380, 1441);
    expect(r.available).toBe(false);
    expect(r.reasons).toEqual(['Interval must satisfy 0 ≤ start < end ≤ 1440 minutes.']);
  });
  test('T15 (own): end exactly 1440 (1380–1440) is accepted', () => {
    // Boundary partner of T05: 1440 is the last valid minute, 1441 the first invalid one.
    expect(check(1380, 1440)).toEqual({ available: true, reasons: [] });
  });
  test('T16 (own): start one minute after now (541–600) is accepted', () => {
    // Boundary partner of T02. 541–600 touches the booking at 600, so no overlap.
    expect(check(541, 600)).toEqual({ available: true, reasons: [] });
  });
  test('T17 (own): start in the past (500–560) is rejected', () => {
    // T02 only covers start == now; this guards against "start < now" style mistakes.
    const r = check(500, 560);
    expect(r.available).toBe(false);
    expect(r.reasons).toEqual(['Start time must be after the current campus time.']);
  });
  test('T20 (own): negative start (-10–30) is rejected even for a "future" now', () => {
    // 0 ≤ start is part of AC1; use now = -20 so only the range rule can fail.
    const r = check(-10, 30, { bookings: [] }, -20);
    expect(r.available).toBe(false);
    expect(r.reasons).toEqual(['Interval must satisfy 0 ≤ start < end ≤ 1440 minutes.']);
  });
});

describe('AC1/AC6 — lower bound and multiple reasons', () => {
  test('T25 (own): start exactly 0 (00:00–01:00) is accepted (0 ≤ start)', () => {
    // Lower boundary of AC1; partner of T20 (negative start). now = -1 so only the range rule matters.
    expect(check(0, 60, { bookings: [] }, -1)).toEqual({ available: true, reasons: [] });
  });
  test('T26 (own): blocked room AND overlap report both reasons, in AC order', () => {
    // AC6: understandable feedback lists every violated rule, not just the first one.
    const r = check(630, 690, { blocked: true, blockReason: 'Maintenance' });
    expect(r.available).toBe(false);
    expect(r.reasons).toEqual([
      'Room is blocked: Maintenance',
      'Overlaps existing booking "Existing" (10:00–11:00).',
    ]);
  });
  test('T28 (own): blocked room with a start in the past reports both reasons (AC1 first, AC3 second)', () => {
    // Guards against code that stops collecting reasons after the first violated rule.
    const r = check(500, 560, { blocked: true, blockReason: 'Maintenance', bookings: [] });
    expect(r.available).toBe(false);
    expect(r.reasons).toEqual([
      'Start time must be after the current campus time.',
      'Room is blocked: Maintenance',
    ]);
  });
  test('T27 (own): reversed interval in the past reports both AC1 reasons', () => {
    const r = check(500, 400);
    expect(r.available).toBe(false);
    expect(r.reasons).toEqual([
      'Interval must satisfy 0 ≤ start < end ≤ 1440 minutes.',
      'Start time must be after the current campus time.',
    ]);
  });
});

describe('AC2 — maximum duration 120 minutes', () => {
  test('T06: exactly 120 minutes (720–840) is allowed', () => {
    expect(check(720, 840)).toEqual({ available: true, reasons: [] });
  });
  test('T07: 121 minutes (720–841) is rejected with a duration reason', () => {
    const r = check(720, 841);
    expect(r.available).toBe(false);
    expect(r.reasons).toEqual(['Booking duration cannot exceed 120 minutes.']);
  });
});

describe('AC3 — blocked room', () => {
  test('T13: blocked room (660–720) is rejected even though the slot is free', () => {
    const r = check(660, 720, { blocked: true, blockReason: 'Maintenance' });
    expect(r.available).toBe(false);
    expect(r.reasons).toEqual(['Room is blocked: Maintenance']);
  });
  test('T21 (own): blocked room without a reason uses the generic message', () => {
    const r = check(660, 720, { blocked: true });
    expect(r.available).toBe(false);
    expect(r.reasons).toEqual(['This room is currently blocked.']);
  });
});

describe('AC4 — overlap with existing bookings, touching allowed', () => {
  test('T01: touching after (660–720) is available', () => {
    expect(check(660, 720)).toEqual({ available: true, reasons: [] });
  });
  test('T08: touching before (570–600) is available', () => {
    expect(check(570, 600)).toEqual({ available: true, reasons: [] });
  });
  test('T09: partial overlap (630–690) is rejected and names the booking', () => {
    const r = check(630, 690);
    expect(r.available).toBe(false);
    expect(r.reasons).toEqual(['Overlaps existing booking "Existing" (10:00–11:00).']);
  });
  test('T10: candidate contains the booking (570–690) is rejected with the overlap reason', () => {
    // 570–690 is exactly 120 min, so assert the overlap reason is present rather than the whole list
    // (keeps this test about AC4 only and independent of the AC2 boundary).
    const r = check(570, 690);
    expect(r.available).toBe(false);
    expect(r.reasons).toContain('Overlaps existing booking "Existing" (10:00–11:00).');
  });
  test('T11: candidate inside the booking (615–645) is rejected with the overlap reason', () => {
    const r = check(615, 645);
    expect(r.available).toBe(false);
    expect(r.reasons).toEqual(['Overlaps existing booking "Existing" (10:00–11:00).']);
  });
  test('T12: identical interval (600–660) is rejected with the overlap reason', () => {
    const r = check(600, 660);
    expect(r.available).toBe(false);
    expect(r.reasons).toEqual(['Overlaps existing booking "Existing" (10:00–11:00).']);
  });
  test('T14: same 630–690 slot is available when bookings = []', () => {
    expect(check(630, 690, { bookings: [] })).toEqual({ available: true, reasons: [] });
  });
  test('T22 (own): second of several bookings is also checked', () => {
    const r = check(700, 760, {
      bookings: [
        { start: 600, end: 660, label: 'First' },
        { start: 720, end: 780, label: 'Second' },
      ],
    });
    expect(r.available).toBe(false);
    expect(r.reasons).toEqual(['Overlaps existing booking "Second" (12:00–13:00).']);
  });
});

describe('AC5 — clear decision, existing booking data unchanged', () => {
  test('T18: room data is identical after accepted and rejected checks', () => {
    const room = makeRoom();
    const before = JSON.stringify(room);
    expect(checkAvailability(room, 660, 720, NOW).available).toBe(true);
    expect(JSON.stringify(room)).toBe(before);
    expect(checkAvailability(room, 630, 690, NOW).available).toBe(false);
    expect(JSON.stringify(room)).toBe(before);
  });
  test('T19: repeated checks give the same decision (idempotent) and keep data intact', () => {
    const room = makeRoom();
    const before = JSON.stringify(room);
    const results = [1, 2, 3].map(() => checkAvailability(room, 660, 720, NOW));
    expect(results).toEqual([
      { available: true, reasons: [] },
      { available: true, reasons: [] },
      { available: true, reasons: [] },
    ]);
    expect(JSON.stringify(room)).toBe(before);
  });
  test('T23 (own): a deep-frozen room with 2 bookings can be checked (code never writes to it)', () => {
    // Two bookings, so even a harmless-looking reorder (sort/reverse) would throw on the frozen array.
    const room = deepFreeze(
      makeRoom({
        bookings: [
          { start: 600, end: 660, label: 'First' },
          { start: 720, end: 780, label: 'Second' },
        ],
      })
    );
    expect(() => checkAvailability(room, 660, 720, NOW)).not.toThrow();
    expect(() => checkAvailability(room, 630, 690, NOW)).not.toThrow();
  });
  test('T24: every result has a boolean decision and reasons that match it', () => {
    const ok = check(660, 720);
    const bad = check(630, 690);
    expect(ok.available).toBe(true);
    expect(ok.reasons).toHaveLength(0);
    expect(bad.available).toBe(false);
    expect(bad.reasons.length).toBeGreaterThan(0);
  });
});

describe('Integration with the real SAMPLE_ROOMS used by the page (Practice #06 manual cases)', () => {
  const room = (id: string) => deepFreeze(structuredClone(SAMPLE_ROOMS.find((r) => r.id === id)!));

  test('P6-T1: Engineering 101, now 08:00, 10:00–11:00 (touches 09:00–10:00) → Available', () => {
    expect(checkAvailability(room('r1'), 600, 660, 480).available).toBe(true);
  });
  test('P6-T2: Engineering 101, now 08:00, 11:00–12:00 (touches 12:00–13:00) → Available', () => {
    expect(checkAvailability(room('r1'), 660, 720, 480).available).toBe(true);
  });
  test('P6-T3: Engineering 101, now 08:00, 09:30–10:30 overlaps CS 201 → Unavailable', () => {
    const r = checkAvailability(room('r1'), 570, 630, 480);
    expect(r.available).toBe(false);
    expect(r.reasons).toEqual(['Overlaps existing booking "CS 201 Lecture" (09:00–10:00).']);
  });
  test('P6-T4: Science Lab 3B is blocked → Unavailable with the block reason', () => {
    const r = checkAvailability(room('r2'), 780, 840, 480);
    expect(r.available).toBe(false);
    expect(r.reasons).toEqual(['Room is blocked: Maintenance — HVAC repair scheduled']);
  });
  test('P6-T7: now 14:00, start 14:00 → Unavailable (start not after now)', () => {
    const r = checkAvailability(room('r1'), 840, 870, 840);
    expect(r.available).toBe(false);
    expect(r.reasons).toEqual(['Start time must be after the current campus time.']);
  });
});

describe('Helpers used by the page', () => {
  test('timeStringToMinutes parses valid HH:MM and rejects invalid input', () => {
    expect(timeStringToMinutes('00:00')).toBe(0);
    expect(timeStringToMinutes('09:00')).toBe(540);
    expect(timeStringToMinutes('23:59')).toBe(1439);
    expect(timeStringToMinutes('24:00')).toBeNull();
    expect(timeStringToMinutes('12:60')).toBeNull();
    expect(timeStringToMinutes('9:00')).toBeNull();
    expect(timeStringToMinutes('')).toBeNull();
  });
  test('minutesToTimeString formats with zero padding', () => {
    expect(minutesToTimeString(0)).toBe('00:00');
    expect(minutesToTimeString(545)).toBe('09:05');
    expect(minutesToTimeString(1440)).toBe('24:00');
  });
});