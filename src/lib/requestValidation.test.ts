import { describe, it, expect } from 'vitest';
import { decideBookingRequest, explanationReasonCodes } from './requestValidation';
import type { RequestDecision } from './requestValidation';
import {
  buildFallbackExplanation,
  requestExplanation,
  validateExplanationInput,
} from '@/lib/explanation/adapter';
import type { ExplanationInput } from '@/lib/explanation/adapter';

const bookings = [
  { start: 540, end: 600, label: 'Morning Lecture' }, // 09:00-10:00
  { start: 720, end: 780, label: 'Lunch Session' }, // 12:00-13:00
];

const room = {
  id: 'room-1',
  name: 'Hall A',
  building: 'Main Building',
  capacity: 30,
  blocked: false,
  blockReason: 'Faculty Meeting',
  bookings,
};

describe('decideBookingRequest (the whole UI decision)', () => {
  it('T1: 08:00 now, 10:00 start, 60 min, open room is available', () => {
    const d = decideBookingRequest(
      { currentTime: '08:00', start: '10:00', durationMinutes: 60, blocked: false },
      room
    );
    expect(d.available).toBe(true);
    expect(d.reasonCode).toBe('OK');
  });

  it('T2: 08:00 now, 09:30 start, 60 min is OVERLAP only', () => {
    const d = decideBookingRequest(
      { currentTime: '08:00', start: '09:30', durationMinutes: 60, blocked: false },
      room
    );
    expect(d.available).toBe(false);
    expect(d.reasonCode).toBe('OVERLAP');
    expect(d.message).toContain('Morning Lecture');
  });

  it('T3: 08:00 now, 10:00 start, 60 min, blocked is ROOM_BLOCKED', () => {
    const d = decideBookingRequest(
      { currentTime: '08:00', start: '10:00', durationMinutes: 60, blocked: true },
      room
    );
    expect(d.available).toBe(false);
    expect(d.reasonCode).toBe('ROOM_BLOCKED');
    expect(d.message).toBe('Room is blocked: Faculty Meeting');
  });

  it('T4: duration 0 is INVALID_DURATION with the exact message', () => {
    const d = decideBookingRequest(
      { currentTime: '08:00', start: '10:00', durationMinutes: 0, blocked: false },
      room
    );
    expect(d.available).toBe(false);
    expect(d.reasonCode).toBe('INVALID_DURATION');
    expect(d.message).toBe('Duration must be a whole number greater than zero.');
  });

  it('T5: duration 121 is TOO_LONG only (first failing rule decides)', () => {
    const d = decideBookingRequest(
      { currentTime: '08:00', start: '10:00', durationMinutes: 121, blocked: false },
      room
    );
    expect(d.available).toBe(false);
    expect(d.reasonCode).toBe('TOO_LONG');
    expect(d.message).toBe('Booking duration cannot exceed 120 minutes.');
  });

  it('T6: 11:00 now, 10:30 start is START_IN_PAST only', () => {
    const d = decideBookingRequest(
      { currentTime: '11:00', start: '10:30', durationMinutes: 60, blocked: false },
      room
    );
    expect(d.available).toBe(false);
    expect(d.reasonCode).toBe('START_IN_PAST');
    expect(d.message).toBe('Start time must be after the current campus time.');
  });

  it('T7: 08:00 now, 10:00 start, 120 min touches both bookings and is available', () => {
    const d = decideBookingRequest(
      { currentTime: '08:00', start: '10:00', durationMinutes: 120, blocked: false },
      room
    );
    expect(d.available).toBe(true);
    expect(d.reasonCode).toBe('OK');
  });

  it('invalid input (empty duration) is INVALID_INPUT', () => {
    const d = decideBookingRequest(
      { currentTime: '08:00', start: '10:00', durationMinutes: '', blocked: false },
      room
    );
    expect(d.available).toBe(false);
    expect(d.reasonCode).toBe('INVALID_INPUT');
  });

  it('never mutates the room or booking data', () => {
    const copy = structuredClone(room);
    decideBookingRequest(
      { currentTime: '08:00', start: '09:30', durationMinutes: 60, blocked: true },
      room
    );
    expect(room).toEqual(copy);
  });
});

describe('explanation is built from the single decision', () => {
  function inputFor(d: RequestDecision, start: string, end: string): ExplanationInput {
    return {
      roomLabel: 'Hall A',
      start,
      end,
      isAvailable: d.reasonCode === 'OK',
      reasonCodes: explanationReasonCodes(d.reasonCode),
    };
  }

  it('duration 121 (TOO_LONG) never mentions overlap or any other reason', async () => {
    const d = decideBookingRequest(
      { currentTime: '08:00', start: '10:00', durationMinutes: 121, blocked: false },
      room
    );
    expect(d.reasonCode).toBe('TOO_LONG');
    const input = inputFor(d, '10:00', '12:01');
    expect(validateExplanationInput(input)).toEqual([]);
    const { explanation } = await requestExplanation(input, 'normal');
    expect(explanation).toMatch(/duration/i);
    expect(explanation).not.toMatch(/overlap/i);
    expect(explanation).not.toMatch(/blocked/i);
    expect(explanation).not.toMatch(/interval is invalid/i);
    expect(explanation).not.toMatch(/current campus time/i);
    expect(explanation).toBe(buildFallbackExplanation(input));
  });

  it('duration 0 (INVALID_DURATION) never mentions an invalid interval or overlap', async () => {
    const d = decideBookingRequest(
      { currentTime: '08:00', start: '10:00', durationMinutes: 0, blocked: false },
      room
    );
    expect(d.reasonCode).toBe('INVALID_DURATION');
    const input = inputFor(d, '10:00', '10:00');
    expect(validateExplanationInput(input)).toEqual([]);
    const { explanation } = await requestExplanation(input, 'normal');
    expect(explanation).toMatch(/whole number greater than zero/i);
    expect(explanation).not.toMatch(/overlap/i);
    expect(explanation).not.toMatch(/blocked/i);
    expect(explanation).not.toMatch(/interval is invalid/i);
    expect(explanation).not.toMatch(/current campus time/i);
    expect(explanation).toBe(buildFallbackExplanation(input));
  });

  it('every reasonCode maps to a non-empty reason phrase (no empty cause after the colon)', async () => {
    const codes = [
      'INVALID_INPUT',
      'INVALID_DURATION',
      'TOO_LONG',
      'START_IN_PAST',
      'END_AFTER_MIDNIGHT',
      'ROOM_BLOCKED',
      'OVERLAP',
    ] as const;
    for (const code of codes) {
      const input: ExplanationInput = {
        roomLabel: 'Hall A',
        start: '10:00',
        end: '11:00',
        isAvailable: false,
        reasonCodes: explanationReasonCodes(code),
      };
      expect(validateExplanationInput(input)).toEqual([]);
      const explanation = buildFallbackExplanation(input);
      expect(explanation).not.toContain(': .');
      const cause = explanation.slice(explanation.indexOf(':') + 1).trim();
      expect(cause.length).toBeGreaterThan(0);
      expect(cause).not.toBe('.');
    }
  });
});
