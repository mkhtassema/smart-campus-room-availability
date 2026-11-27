import { timeStringToMinutes } from '@/lib/time';
import { checkAvailability } from '@/lib/availability';
import type { ReasonCode } from '@/lib/explanation/adapter';
import type { Room, ValidationResult } from '@/types';

/**
 * Pure input validation applied BEFORE the existing engine (checkAvailability).
 * The first failing rule decides; the existing engine then decides
 * ROOM_BLOCKED and OVERLAP. Touching intervals do not overlap.
 */

export type RequestReasonCode =
  | 'OK'
  | 'INVALID_INPUT'
  | 'INVALID_DURATION'
  | 'TOO_LONG'
  | 'START_IN_PAST'
  | 'END_AFTER_MIDNIGHT'
  | 'ROOM_BLOCKED'
  | 'OVERLAP';

export interface RequestDecision {
  available: boolean;
  reasonCode: RequestReasonCode;
  message: string;
}

export interface RequestInput {
  currentTime: string; // HH:MM
  start: string; // HH:MM
  durationMinutes: number | ''; // '' when the field is empty
  blocked: boolean;
}

export interface RoomLike {
  blocked: boolean;
  blockReason?: string;
  bookings: { start: number; end: number; label: string }[];
}

const MAX_DURATION = 120;
const MIDNIGHT = 24 * 60;

function overlappingLabel(bookings: { start: number; end: number; label: string }[], start: number, end: number): string | null {
  const hit = bookings.find((b) => start < b.end && end > b.start);
  return hit ? hit.label : null;
}

/**
 * The whole UI decision: pre-engine validation first; the deterministic
 * engine (checkAvailability) is consulted for the rules it owns
 * (ROOM_BLOCKED and OVERLAP, plus the final OK). The first failing
 * rule decides, so the result carries exactly one reasonCode.
 */
export function decideBookingRequest(
  input: RequestInput,
  room: RoomLike
): RequestDecision {
  // The room's own data flag and the "simulate blocked" checkbox both block it.
  const blocked = input.blocked || room.blocked;
  const pre = validateBookingRequest({ ...input, blocked }, room.bookings);
  if (pre.reasonCode !== 'OK' && pre.reasonCode !== 'ROOM_BLOCKED' && pre.reasonCode !== 'OVERLAP') {
    return pre;
  }
  const s = timeStringToMinutes(input.start)!;
  const c = timeStringToMinutes(input.currentTime)!;
  const end = s + (input.durationMinutes as number);
  const engineResult: ValidationResult = checkAvailability(
    { ...room, blocked } as Room,
    s,
    end,
    c
  );
  const first = engineResult.reasons[0] ?? '';
  const reasonCode: RequestReasonCode = engineResult.available
    ? 'OK'
    : first.startsWith('Overlaps')
      ? 'OVERLAP'
      : 'ROOM_BLOCKED';
  return { available: engineResult.available, reasonCode, message: first };
}

/** The explanation adapter receives exactly the decision's reason code. */
export function explanationReasonCodes(reasonCode: RequestReasonCode): ReasonCode[] {
  return reasonCode === 'OK' ? [] : [reasonCode];
}

export function validateBookingRequest(
  input: RequestInput,
  bookings: { start: number; end: number; label: string }[]
): RequestDecision {  const c = timeStringToMinutes(input.currentTime);
  const s = timeStringToMinutes(input.start);
  if (c === null || s === null || input.durationMinutes === '' || typeof input.durationMinutes !== 'number' || Number.isNaN(input.durationMinutes)) {
    return {
      available: false,
      reasonCode: 'INVALID_INPUT',
      message: 'Enter a valid current campus time, a valid start time (HH:MM) and a duration.',
    };
  }

  if (!Number.isInteger(input.durationMinutes) || input.durationMinutes <= 0) {
    return {
      available: false,
      reasonCode: 'INVALID_DURATION',
      message: 'Duration must be a whole number greater than zero.',
    };
  }

  if (input.durationMinutes > MAX_DURATION) {
    return {
      available: false,
      reasonCode: 'TOO_LONG',
      message: 'Booking duration cannot exceed 120 minutes.',
    };
  }

  if (s <= c) {
    return {
      available: false,
      reasonCode: 'START_IN_PAST',
      message: 'Start time must be after the current campus time.',
    };
  }

  const end = s + input.durationMinutes;
  if (end > MIDNIGHT) {
    return {
      available: false,
      reasonCode: 'END_AFTER_MIDNIGHT',
      message: 'The requested interval ends after 24:00.',
    };
  }

  if (input.blocked) {
    return {
      available: false,
      reasonCode: 'ROOM_BLOCKED',
      message: 'This room is currently blocked.',
    };
  }

  const label = overlappingLabel(bookings, s, end);
  if (label) {
    return {
      available: false,
      reasonCode: 'OVERLAP',
      message: `Overlaps existing booking "${label}".`,
    };
  }

  return {
    available: true,
    reasonCode: 'OK',
    message: 'The requested interval meets all criteria.',
  };
}
