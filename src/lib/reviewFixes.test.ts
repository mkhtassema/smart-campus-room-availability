import { describe, it, expect } from 'vitest';
import { renderToString } from 'react-dom/server';
import { createElement } from 'react';
import App from '@/App';
import { SAMPLE_ROOMS } from '@/lib/bookings';
import { decideBookingRequest } from '@/lib/requestValidation';
import { validateExplanationOutput } from '@/lib/explanation/adapter';
import type { ExplanationInput } from '@/lib/explanation/adapter';

const room = (id: string) => SAMPLE_ROOMS.find((r) => r.id === id)!;
const base = { currentTime: '08:00', start: '12:00', durationMinutes: 60 as number };

describe('F1: a room blocked in its data is unavailable even when the checkbox is off', () => {
  it('Science Lab 3B (blocked in the data) is ROOM_BLOCKED with its reason', () => {
    const d = decideBookingRequest({ ...base, blocked: false }, room('r2'));
    expect(d.available).toBe(false);
    expect(d.reasonCode).toBe('ROOM_BLOCKED');
    expect(d.message).toBe('Room is blocked: Maintenance — HVAC repair scheduled');
  });
  it('the checkbox still blocks an open room', () => {
    const d = decideBookingRequest({ ...base, blocked: true }, room('r1'));
    expect(d.reasonCode).toBe('ROOM_BLOCKED');
  });
  it('an open room with the checkbox off stays available (no regression)', () => {
    const d = decideBookingRequest({ ...base, start: '10:00', blocked: false }, room('r1'));
    expect(d.available).toBe(true);
    expect(d.reasonCode).toBe('OK');
  });
  it('input validation still comes before the blocked rule', () => {
    const d = decideBookingRequest({ ...base, durationMinutes: 121, blocked: false }, room('r2'));
    expect(d.reasonCode).toBe('TOO_LONG');
  });
  it('does not change booking data', () => {
    const before = JSON.stringify(SAMPLE_ROOMS);
    decideBookingRequest({ ...base, blocked: false }, room('r2'));
    expect(JSON.stringify(SAMPLE_ROOMS)).toBe(before);
  });
});

describe('F7: the explanation must state the decision it explains', () => {
  const unavailable: ExplanationInput = { roomLabel: 'Engineering 101', start: '10:00', end: '11:00', isAvailable: false, reasonCodes: ['OVERLAP'] };
  const available: ExplanationInput = { ...unavailable, isAvailable: true, reasonCodes: [] };
  it('rejects paraphrases that hide an unavailable decision', () => {
    for (const t of ['Go ahead and use the room between 10:00 and 11:00.', 'You may use Engineering 101 from 10:00 to 11:00 as planned.']) {
      expect(validateExplanationOutput({ explanation: t }, unavailable)).not.toBeNull();
    }
  });
  it('rejects an available explanation that does not say available or free', () => {
    expect(validateExplanationOutput({ explanation: 'Engineering 101 looks fine from 10:00 to 11:00.' }, available)).not.toBeNull();
  });
  it('accepts the normal wording for both decisions', () => {
    expect(validateExplanationOutput({ explanation: 'Engineering 101 is not available from 10:00 to 11:00: it overlaps an existing booking.' }, unavailable)).toBeNull();
    expect(validateExplanationOutput({ explanation: 'Engineering 101 is free from 10:00 to 11:00. No conflicts were found.' }, available)).toBeNull();
  });
});

describe('F9: every form control has an associated label', () => {
  it('each id used by a control is the htmlFor of a label', () => {
    const html = renderToString(createElement(App));
    for (const id of ['room-select', 'current-time', 'start-time', 'duration', 'demo-mode']) {
      expect(html).toContain(`for="${id}"`);
      expect(html).toContain(`id="${id}"`);
    }
  });
});
