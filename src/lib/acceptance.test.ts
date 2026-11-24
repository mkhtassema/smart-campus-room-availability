import { describe, it, expect } from 'vitest';
import { validateBookingRequest } from './requestValidation';
import type { Room } from '@/types';

const bookings = [
  { start: 540, end: 600, label: 'Morning Lecture' }, // 09:00-10:00
  { start: 720, end: 780, label: 'Lunch Session' }, // 12:00-13:00
];

const openRoom: Room = {
  id: 'room-1',
  name: 'Hall A',
  building: 'Main Building',
  capacity: 30,
  blocked: false,
  bookings,
};

function roomCopy(): Room {
  return structuredClone(openRoom);
}

describe('acceptance criteria (Practice 12)', () => {
  it('T1: 08:00 now, 10:00 start, 60 min, open room is available', () => {
    const decision = validateBookingRequest(
      { currentTime: '08:00', start: '10:00', durationMinutes: 60, blocked: false },
      openRoom.bookings
    );
    expect(decision.available).toBe(true);
    expect(decision.reasonCode).toBe('OK');
  });

  it('T2: 08:00 now, 09:30 start, 60 min overlaps the 09:00-10:00 booking', () => {
    const decision = validateBookingRequest(
      { currentTime: '08:00', start: '09:30', durationMinutes: 60, blocked: false },
      openRoom.bookings
    );
    expect(decision.available).toBe(false);
    expect(decision.reasonCode).toBe('OVERLAP');
  });

  it('T3: 08:00 now, 10:00 start, 60 min, blocked room is ROOM_BLOCKED', () => {
    const decision = validateBookingRequest(
      { currentTime: '08:00', start: '10:00', durationMinutes: 60, blocked: true },
      openRoom.bookings
    );
    expect(decision.available).toBe(false);
    expect(decision.reasonCode).toBe('ROOM_BLOCKED');
  });

  it('T4: duration 0 is INVALID_DURATION', () => {
    const decision = validateBookingRequest(
      { currentTime: '08:00', start: '10:00', durationMinutes: 0, blocked: false },
      openRoom.bookings
    );
    expect(decision.available).toBe(false);
    expect(decision.reasonCode).toBe('INVALID_DURATION');
    expect(decision.message).toBe('Duration must be a whole number greater than zero.');
  });

  it('T5: duration 121 is TOO_LONG', () => {
    const decision = validateBookingRequest(
      { currentTime: '08:00', start: '10:00', durationMinutes: 121, blocked: false },
      openRoom.bookings
    );
    expect(decision.available).toBe(false);
    expect(decision.reasonCode).toBe('TOO_LONG');
  });

  it('T6: 11:00 now, 10:30 start is START_IN_PAST', () => {
    const decision = validateBookingRequest(
      { currentTime: '11:00', start: '10:30', durationMinutes: 60, blocked: false },
      openRoom.bookings
    );
    expect(decision.available).toBe(false);
    expect(decision.reasonCode).toBe('START_IN_PAST');
  });

  it('T7: 08:00 now, 10:00 start, 120 min touches both bookings and is available', () => {
    const decision = validateBookingRequest(
      { currentTime: '08:00', start: '10:00', durationMinutes: 120, blocked: false },
      openRoom.bookings
    );
    expect(decision.available).toBe(true);
    expect(decision.reasonCode).toBe('OK');
  });

  it('T8: running T1-T7 never mutates the bookings data', () => {
    const before = roomCopy();
    const cases: Parameters<typeof validateBookingRequest>[0][] = [
      { currentTime: '08:00', start: '10:00', durationMinutes: 60, blocked: false },
      { currentTime: '08:00', start: '09:30', durationMinutes: 60, blocked: false },
      { currentTime: '08:00', start: '10:00', durationMinutes: 60, blocked: true },
      { currentTime: '08:00', start: '10:00', durationMinutes: 0, blocked: false },
      { currentTime: '08:00', start: '10:00', durationMinutes: 121, blocked: false },
      { currentTime: '11:00', start: '10:30', durationMinutes: 60, blocked: false },
      { currentTime: '08:00', start: '10:00', durationMinutes: 120, blocked: false },
    ];
    for (const c of cases) {
      validateBookingRequest(c, before.bookings);
    }
    expect(before).toEqual(roomCopy());
    expect(before.bookings).toEqual(bookings);
  });
});
