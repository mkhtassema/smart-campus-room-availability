import type { Room, ValidationResult } from '@/types';
import { minutesToTimeString } from '@/lib/time';

/**
 * Validate a candidate booking interval against all acceptance criteria.
 * Does NOT mutate room booking data (AC5).
 */
export function checkAvailability(
  room: Room,
  start: number,
  end: number,
  currentMinutes: number
): ValidationResult {
  const reasons: string[] = [];

  // AC1: valid interval range and ordering, start after current time
  if (start < 0 || end > 1440 || start >= end) {
    reasons.push('Interval must satisfy 0 ≤ start < end ≤ 1440 minutes.');
  }
  if (start <= currentMinutes) {
    reasons.push('Start time must be after the current campus time.');
  }

  // AC2: max 120-minute duration
  if (end - start > 120) {
    reasons.push('Booking duration cannot exceed 120 minutes.');
  }

  // AC3: room blocked
  if (room.blocked) {
    reasons.push(
      room.blockReason
        ? `Room is blocked: ${room.blockReason}`
        : 'This room is currently blocked.'
    );
  }

  // AC4: overlap check — touching endpoints are allowed (strict inequality)
  const overlapping = room.bookings.find(
    (b) => start < b.end && end > b.start
  );
  if (overlapping) {
    reasons.push(
      `Overlaps existing booking "${overlapping.label}" ` +
        `(${minutesToTimeString(overlapping.start)}–${minutesToTimeString(overlapping.end)}).`
    );
  }

  return { available: reasons.length === 0, reasons };
}
