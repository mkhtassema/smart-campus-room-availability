import { describe, expect, test } from 'vitest';
import { checkAvailability } from '@/lib/availability';
import { SAMPLE_ROOMS } from '@/data/sampleRooms';
import type { Room } from '@/types';

const makeRoom = (overrides: Partial<Room> = {}): Room => ({
  id: 'test',
  name: 'Test Room',
  building: 'Test Hall',
  capacity: 10,
  blocked: false,
  bookings: [{ start: 600, end: 660, label: 'Existing' }],
  ...overrides,
});

describe('checkAvailability regressions', () => {
  test('rejects a start time in the past under AC1', () => {
    const result = checkAvailability(makeRoom(), 539, 600, 540);

    // AC1 requires the requested start to be strictly after current campus time.
    expect(result).toEqual({
      available: false,
      reasons: ['Start time must be after the current campus time.'],
    });
  });

  test('rejects a reversed interval under AC1', () => {
    const result = checkAvailability(makeRoom({ bookings: [] }), 750, 720, 600);

    // AC1 requires start < end, so an interval with reversed endpoints is invalid.
    expect(result).toEqual({
      available: false,
      reasons: ['Interval must satisfy 0 ≤ start < end ≤ 1440 minutes.'],
    });
  });

  test('rejects a 121-minute interval under AC2', () => {
    const result = checkAvailability(makeRoom(), 700, 821, 600);

    // AC2 allows at most 120 minutes; 121 minutes must be unavailable.
    expect(result).toEqual({
      available: false,
      reasons: ['Booking duration cannot exceed 120 minutes.'],
    });
  });

  test('rejects a blocked room and reports every applicable reason under AC3 and AC6', () => {
    const result = checkAvailability(
      makeRoom({ blocked: true, blockReason: 'Maintenance' }),
      630,
      690,
      540
    );

    // AC3 rejects blocked rooms; AC4 also finds this overlap, and AC6 keeps both explanations.
    expect(result).toEqual({
      available: false,
      reasons: [
        'Room is blocked: Maintenance',
        'Overlaps existing booking "Existing" (10:00–11:00).',
      ],
    });
  });

  test('rejects an overlapping booking under AC4', () => {
    const result = checkAvailability(makeRoom(), 630, 690, 540);

    // AC4 rejects any strict interval overlap with an existing booking.
    expect(result).toEqual({
      available: false,
      reasons: ['Overlaps existing booking "Existing" (10:00–11:00).'],
    });
  });

  test('accepts intervals touching an existing booking endpoint under AC4', () => {
    const result = checkAvailability(makeRoom(), 660, 720, 540);

    // AC4 uses strict overlap boundaries, so ending or starting exactly at 660 is allowed.
    expect(result).toEqual({ available: true, reasons: [] });
  });

  test('does not mutate room fixtures under AC5', () => {
    const room = structuredClone(SAMPLE_ROOMS[0]);
    const before = JSON.stringify(room);

    checkAvailability(room, 660, 720, 480);
    checkAvailability(room, 570, 630, 480);

    // AC5 requires a clear decision without changing existing booking data.
    expect(JSON.stringify(room)).toBe(before);
  });
});
