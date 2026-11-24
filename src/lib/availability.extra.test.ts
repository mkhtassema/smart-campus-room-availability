import { describe, test, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { checkAvailability as ruleFn } from './availability';
import * as barrel from './bookings';
import { SAMPLE_ROOMS } from '@/data/sampleRooms';
import type { Room } from '@/types';

/**
 * EXTRA regression tests for Practice #09 (boundary cases beyond Bolt's own tests).
 * Expected values come from AC1–AC6, not from the current output of the code.
 * Fixture: now = 540 (09:00), free room, one booking 600–660 (10:00–11:00).
 */
const NOW = 540;
const makeRoom = (over: Partial<Room> = {}): Room => ({
  id: 'test', name: 'Test Room', building: 'Test Hall', capacity: 10, blocked: false,
  bookings: [{ start: 600, end: 660, label: 'Existing' }],
  ...over,
});
const check = (start: number, end: number, over: Partial<Room> = {}) =>
  ruleFn(makeRoom(over), start, end, NOW);
const deepFreeze = <T>(o: T): T => {
  Object.values(o as object).forEach((v) => v && typeof v === 'object' && deepFreeze(v));
  return Object.freeze(o);
};

describe('Module boundary (the refactoring itself)', () => {
  test('the page/test entry point re-exports the very same rule function', () => {
    expect(barrel.checkAvailability).toBe(ruleFn);
  });
  test('the public API of "@/lib/bookings" is unchanged', () => {
    expect(Object.keys(barrel).sort()).toEqual(
      ['SAMPLE_ROOMS', 'checkAvailability', 'minutesToTimeString', 'timeStringToMinutes']);
  });
  test('the rules module has no dependency on fixtures, DOM, React or the clock', () => {
    const src = readFileSync(new URL('./availability.ts', import.meta.url), 'utf-8');
    expect(src).not.toMatch(/sampleRooms|SAMPLE_ROOMS|document\.|window\.|Date\.now|new Date|from 'react'/);
  });
});

describe('AC1 – range, ordering, past time', () => {
  test('past time: start 08:30 with now 09:00 → Unavailable (start not after now)', () => {
    const r = check(510, 540);
    expect(r.available).toBe(false);
    expect(r.reasons).toEqual(['Start time must be after the current campus time.']);
  });
  test('reversed interval: 11:00–10:30 → Unavailable (start >= end)', () => {
    const r = check(660, 630);
    expect(r.available).toBe(false);
    expect(r.reasons).toContain('Interval must satisfy 0 ≤ start < end ≤ 1440 minutes.');
  });
  test('zero-length interval 12:00–12:00 → Unavailable (start >= end)', () => {
    expect(check(720, 720).available).toBe(false);
  });
});

describe('AC2 – 120-minute limit', () => {
  test('exactly 120 minutes (12:00–14:00) → Available', () => {
    expect(check(720, 840)).toEqual({ available: true, reasons: [] });
  });
  test('121 minutes (12:00–14:01) → Unavailable with the duration reason', () => {
    const r = check(720, 841);
    expect(r.available).toBe(false);
    expect(r.reasons).toEqual(['Booking duration cannot exceed 120 minutes.']);
  });
});

describe('AC3 – blocked room', () => {
  test('blocked room with a free slot → Unavailable with the block reason', () => {
    const r = check(720, 780, { blocked: true, blockReason: 'Repair' });
    expect(r).toEqual({ available: false, reasons: ['Room is blocked: Repair'] });
  });
  test('blocked room without a reason uses the default message', () => {
    expect(check(720, 780, { blocked: true }).reasons).toEqual(['This room is currently blocked.']);
  });
});

describe('AC4 – overlap yes, touching endpoints no', () => {
  test('partial overlap at the start 09:30–10:30 → Unavailable', () => {
    expect(check(570, 630).reasons).toEqual(['Overlaps existing booking "Existing" (10:00–11:00).']);
  });
  test('partial overlap at the end 10:30–11:30 → Unavailable', () => {
    expect(check(630, 690).available).toBe(false);
  });
  test('request fully containing the booking 09:30–11:30 → Unavailable', () => {
    expect(check(570, 690).available).toBe(false);
  });
  test('request inside the booking 10:15–10:45 → Unavailable', () => {
    expect(check(615, 645).available).toBe(false);
  });
  test('touching the START of a booking (09:30–10:00) → Available', () => {
    expect(check(570, 600)).toEqual({ available: true, reasons: [] });
  });
  test('touching the END of a booking (11:00–12:00) → Available', () => {
    expect(check(660, 720)).toEqual({ available: true, reasons: [] });
  });
});

describe('AC5 – unchanged fixtures (frozen data must not throw or change)', () => {
  test('rules never reorder or modify the bookings of a deep-frozen room', () => {
    const room = deepFreeze(makeRoom({
      bookings: [{ start: 720, end: 780, label: 'Later' }, { start: 600, end: 660, label: 'Earlier' }],
    }));
    const before = JSON.stringify(room);
    expect(() => ruleFn(room, 660, 720, NOW)).not.toThrow();
    expect(JSON.stringify(room)).toBe(before);
  });
  test('checking every sample room many times leaves SAMPLE_ROOMS identical', () => {
    const before = JSON.stringify(SAMPLE_ROOMS);
    for (const room of SAMPLE_ROOMS) {
      for (let start = 0; start < 1440; start += 45) ruleFn(room, start, start + 60, 480);
    }
    expect(JSON.stringify(SAMPLE_ROOMS)).toBe(before);
  });
});

describe('AC6 – every failure has a clear, non-empty reason; the decision is deterministic', () => {
  test('unavailable results always carry readable reasons; available has none', () => {
    const cases = [check(510, 540), check(660, 630), check(720, 841), check(570, 630),
      check(720, 780, { blocked: true })];
    cases.forEach((r) => {
      expect(r.available).toBe(false);
      expect(r.reasons.length).toBeGreaterThan(0);
      r.reasons.forEach((m) => expect(m.length).toBeGreaterThan(10));
    });
    expect(check(720, 780).reasons).toEqual([]);
  });
  test('same input gives the same output (pure function)', () => {
    expect(check(570, 630)).toEqual(check(570, 630));
  });
});