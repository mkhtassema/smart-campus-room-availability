import { timeStringToMinutes } from '@/lib/time';

/**
 * Mock explanation adapter. The deterministic rule checker
 * (checkAvailability) remains the single source of truth; this module
 * only turns an already-decided result into human-readable text.
 */

export const REASON_CODES = [
  'OVERLAP',
  'ROOM_BLOCKED',
  'INVALID_INTERVAL',
  'START_NOT_AFTER_NOW',
  'START_IN_PAST',
  'TOO_LONG',
  'INVALID_INPUT',
  'INVALID_DURATION',
  'END_AFTER_MIDNIGHT',
] as const;

export type ReasonCode = (typeof REASON_CODES)[number];

export type DemoMode = 'normal' | 'timeout' | 'error' | 'contradict' | 'invented' | 'malformed';

export interface ExplanationInput {
  roomLabel: string;
  start: string; // HH:MM
  end: string; // HH:MM
  isAvailable: boolean;
  reasonCodes: ReasonCode[];
}

export interface ExplanationResult {
  explanation: string;
}

export const MAX_ROOM_LABEL_LENGTH = 80;
export const MAX_EXPLANATION_LENGTH = 280;
export const MAX_SENTENCES = 2;
export const ADAPTER_TIMEOUT_MS = 3000;

const ROOM_LABEL_PATTERN = /^[A-Za-z0-9 .,'()-]+$/;

/** Map the fixed reason sentences of checkAvailability to stable codes. */
export function deriveReasonCodes(reasons: string[]): ReasonCode[] {
  const codes: ReasonCode[] = [];
  for (const reason of reasons) {
    if (reason.startsWith('Interval must satisfy')) codes.push('INVALID_INTERVAL');
    else if (reason.startsWith('Start time must be')) codes.push('START_NOT_AFTER_NOW');
    else if (reason.startsWith('Booking duration')) codes.push('TOO_LONG');
    else if (reason.startsWith('Room is blocked') || reason === 'This room is currently blocked.')
      codes.push('ROOM_BLOCKED');
    else if (reason.startsWith('Overlaps existing booking')) codes.push('OVERLAP');
  }
  return codes;
}

/** Called by the UI before contacting the adapter; on errors the adapter is not called. */
export function validateExplanationInput(input: ExplanationInput): string[] {
  const errors: string[] = [];

  if (input.roomLabel.length === 0) errors.push('Room label must not be empty.');
  else if (input.roomLabel.length > MAX_ROOM_LABEL_LENGTH)
    errors.push('Room label must be at most 80 characters.');
  else if (!ROOM_LABEL_PATTERN.test(input.roomLabel))
    errors.push('Room label may only contain letters, digits, space and . , \' ( ) -.');

  const start = timeStringToMinutes(input.start);
  const end = timeStringToMinutes(input.end);
  if (start === null) errors.push('Start time must be in HH:MM format.');
  if (end === null) errors.push('End time must be in HH:MM format.');
  const intervalRejections: ReasonCode[] = [
    'INVALID_INTERVAL',
    'INVALID_INPUT',
    'INVALID_DURATION',
    'END_AFTER_MIDNIGHT',
  ];
  if (
    start !== null &&
    end !== null &&
    start >= end &&
    !input.reasonCodes.some((c) => intervalRejections.includes(c))
  ) {
    errors.push('Start must be before end unless the interval was rejected by the rules.');
  }

  const seen = new Set<ReasonCode>();
  for (const code of input.reasonCodes) {
    if (seen.has(code)) errors.push(`Duplicate reason code: ${code}.`);
    else seen.add(code);
  }

  return errors;
}

/** Returns null when the output is acceptable, otherwise a rejection reason. */
export function validateExplanationOutput(
  output: unknown,
  input: ExplanationInput
): string | null {
  if (output === null || typeof output !== 'object' || Array.isArray(output)) {
    return 'the response must be an object';
  }
  const keys = Object.keys(output as Record<string, unknown>);
  if (keys.length !== 1 || keys[0] !== 'explanation') {
    return 'the response must be exactly { explanation: string }';
  }
  const explanation = (output as { explanation?: unknown }).explanation;
  if (typeof explanation !== 'string' || explanation.trim().length === 0) {
    return 'the explanation must be a non-empty string';
  }
  const text = explanation.trim();
  if (text.length > MAX_EXPLANATION_LENGTH) {
    return 'the explanation exceeds 280 characters';
  }
  if (text.split(/(?<=[.!?])\s+/).length > MAX_SENTENCES) {
    return 'the explanation must contain at most 2 sentences';
  }
  if (/[<>`#*_[\]]|https?:\/\/|www\./i.test(text)) {
    return 'the explanation must not contain links or markup';
  }
  if (/["'`’‘“”]/.test(text)) {
    return 'the explanation must not contain quotes';
  }
  const times = text.match(/\b\d{1,2}:\d{2}\b/g) ?? [];
  for (const t of times) {
    if (t !== input.start && t !== input.end) {
      return 'the explanation mentions a time that was not supplied';
    }
  }
  const lower = text.toLowerCase();
  if (
    /\bbooked\b|\bbooking confirmation\b|\breservation\b|\breserv(ed|ing)\b|\bconfirmed\b|\bsuccessfully\b/.test(
      lower
    )
  ) {
    return 'the explanation invents information that was not supplied';
  }
  if (input.isAvailable) {
    if (/\bnot\s+available\b|\bunavailable\b|\bnot\s+free\b|\bblocked\b|\boverlap|\bconflict\b/.test(lower)) {
      return 'the explanation contradicts the availability status';
    }
  } else if (
    /\bis\s+available\b|\bno\s+conflicts\b|\bmeets\s+all\s+criteria\b|\bcan\s+be\s+booked\b|\bis\s+free\b|\bstill\s+free\b|\bis\s+open\b|\bis\s+vacant\b|\bcan\s+be\s+used\b/.test(
      lower
    )
  ) {
    return 'the explanation contradicts the availability status';
  }
  return null;
}

const FALLBACK_CAUSES: Record<ReasonCode, string> = {
  OVERLAP: 'it overlaps an existing booking',
  ROOM_BLOCKED: 'the room is blocked',
  INVALID_INTERVAL: 'the interval is invalid',
  START_NOT_AFTER_NOW: 'the start time is not after the current campus time',
  START_IN_PAST: 'the start time is not after the current campus time',
  TOO_LONG: 'the duration exceeds the maximum allowed length',
  INVALID_INPUT: 'the request input is invalid',
  INVALID_DURATION: 'the duration must be a whole number greater than zero',
  END_AFTER_MIDNIGHT: 'the interval ends after 24:00',
};

/** Deterministic sentence shown whenever the adapter fails or is rejected. */
export function buildFallbackExplanation(input: ExplanationInput): string {
  if (input.isAvailable) {
    return `${input.roomLabel} is available from ${input.start} to ${input.end}.`;
  }
  const causes = [...new Set(input.reasonCodes)].map((code) => FALLBACK_CAUSES[code]);
  const causeText = causes.length > 0 ? causes.join('; ') : 'it does not meet the booking rules';
  return `${input.roomLabel} is not available from ${input.start} to ${input.end}: ${causeText}.`;
}

function generateMockExplanation(input: ExplanationInput): string {
  if (input.isAvailable) {
    return `${input.roomLabel} is free from ${input.start} to ${input.end}. No conflicts were found.`;
  }
  return buildFallbackExplanation(input);
}

function simulateAdapterCall(input: ExplanationInput, mode: DemoMode): Promise<unknown> {
  return new Promise((resolve, reject) => {
    if (mode === 'error') {
      reject(new Error('The adapter reported an internal error.'));
      return;
    }
    if (mode === 'timeout') {
      return; // never settles; the caller's timeout fires
    }
    if (mode === 'malformed') {
      resolve({ text: generateMockExplanation(input), source: 'mock' });
      return;
    }
    if (mode === 'contradict') {
      resolve({
        explanation: input.isAvailable
          ? `${input.roomLabel} is not available from ${input.start} to ${input.end}: it overlaps an existing booking.`
          : `${input.roomLabel} is available from ${input.start} to ${input.end}. No conflicts were found.`,
      });
      return;
    }
    if (mode === 'invented') {
      resolve({
        explanation:
          'Your booking is confirmed. You have successfully reserved the room for tomorrow at 08:00.',
      });
      return;
    }
    setTimeout(() => resolve({ explanation: generateMockExplanation(input) }), 300);
  });
}

function withTimeout(promise: Promise<unknown>, timeoutMs: number): Promise<unknown> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      reject(new Error(`The adapter did not respond within ${Math.round(timeoutMs / 1000)} seconds.`));
    }, timeoutMs);
    promise.then(
      (value) => {
        clearTimeout(timer);
        resolve(value);
      },
      (error) => {
        clearTimeout(timer);
        reject(error instanceof Error ? error : new Error('The adapter call failed.'));
      }
    );
  });
}

/**
 * Ask the mock adapter for an explanation. Throws on invalid input
 * (before any adapter call) and on timeout, adapter error, or output
 * that fails validation — the UI then shows the fallback sentence.
 */
export async function requestExplanation(
  input: ExplanationInput,
  mode: DemoMode = 'normal',
  timeoutMs: number = ADAPTER_TIMEOUT_MS
): Promise<ExplanationResult> {
  const inputErrors = validateExplanationInput(input);
  if (inputErrors.length > 0) {
    throw new Error(inputErrors.join(' '));
  }
  const raw = await withTimeout(simulateAdapterCall(input, mode), timeoutMs);
  const problem = validateExplanationOutput(raw, input);
  if (problem) {
    throw new Error(`The adapter response was rejected: ${problem}.`);
  }
  return raw as ExplanationResult;
}
