import { describe, it, expect } from 'vitest';
import {
  deriveReasonCodes,
  validateExplanationInput,
  validateExplanationOutput,
  buildFallbackExplanation,
  requestExplanation,
  REASON_CODES,
  ADAPTER_TIMEOUT_MS,
} from './adapter';
import { checkAvailability } from '@/lib/availability';
import type { Room } from '@/types';
import type { ExplanationInput } from './adapter';

const availableInput: ExplanationInput = {
  roomLabel: 'Engineering 101',
  start: '11:00',
  end: '12:00',
  isAvailable: true,
  reasonCodes: [],
};

const unavailableInput: ExplanationInput = {
  roomLabel: 'Engineering 101',
  start: '09:30',
  end: '10:30',
  isAvailable: false,
  reasonCodes: ['OVERLAP'],
};

describe('deriveReasonCodes', () => {
  it('maps each rule sentence to its stable code', () => {
    expect(
      deriveReasonCodes([
        'Interval must satisfy 0 ≤ start < end ≤ 1440 minutes.',
        'Start time must be after the current campus time.',
        'Booking duration cannot exceed 120 minutes.',
        'This room is currently blocked.',
        'Room is blocked: Maintenance',
        'Overlaps existing booking "CS 201 Lecture" (09:00–10:00).',
      ])
    ).toEqual([
      'INVALID_INTERVAL',
      'START_NOT_AFTER_NOW',
      'TOO_LONG',
      'ROOM_BLOCKED',
      'ROOM_BLOCKED',
      'OVERLAP',
    ]);
  });

  it('returns no codes for a clean result', () => {
    expect(deriveReasonCodes([])).toEqual([]);
  });

  it('only produces known codes', () => {
    for (const code of deriveReasonCodes(['Overlaps existing booking "x" (09:00–10:00).'])) {
      expect(REASON_CODES).toContain(code);
    }
  });
});

describe('validateExplanationInput', () => {
  it('accepts the happy path', () => {
    expect(validateExplanationInput(availableInput)).toEqual([]);
    expect(validateExplanationInput(unavailableInput)).toEqual([]);
  });

  it('rejects an empty, too long, or wrongly formatted room label', () => {
    expect(validateExplanationInput({ ...availableInput, roomLabel: '' }).length).toBeGreaterThan(0);
    expect(
      validateExplanationInput({ ...availableInput, roomLabel: 'a'.repeat(81) }).length
    ).toBeGreaterThan(0);
    expect(
      validateExplanationInput({ ...availableInput, roomLabel: 'Room <script>' }).length
    ).toBeGreaterThan(0);
    expect(
      validateExplanationInput({ ...availableInput, roomLabel: 'Rm. 4B-2 (annex), ok' }).length
    ).toBe(0);
  });

  it('rejects malformed times', () => {
    expect(validateExplanationInput({ ...availableInput, start: '25:00' }).length).toBeGreaterThan(0);
    expect(validateExplanationInput({ ...availableInput, end: '9:00' }).length).toBeGreaterThan(0);
  });

  it('rejects start >= end unless the interval was already rejected by the rules', () => {
    const reversed = { ...availableInput, start: '12:00', end: '11:00' };
    expect(validateExplanationInput(reversed).length).toBeGreaterThan(0);
    expect(
      validateExplanationInput({
        ...reversed,
        isAvailable: false,
        reasonCodes: ['INVALID_INTERVAL'],
      })
    ).toEqual([]);
  });

  it('rejects duplicate reason codes', () => {
    expect(
      validateExplanationInput({ ...unavailableInput, reasonCodes: ['OVERLAP', 'OVERLAP'] }).length
    ).toBeGreaterThan(0);
  });
});

describe('validateExplanationOutput', () => {
  it('accepts exactly { explanation: string } that agrees with the status', () => {
    expect(validateExplanationOutput({ explanation: 'Engineering 101 is free from 11:00 to 12:00.' }, availableInput)).toBeNull();
    expect(
      validateExplanationOutput(
        { explanation: 'Engineering 101 is not available from 09:30 to 10:30: it overlaps an existing booking.' },
        unavailableInput
      )
    ).toBeNull();
  });

  it('rejects wrong shapes', () => {
    expect(validateExplanationOutput(null, availableInput)).not.toBeNull();
    expect(validateExplanationOutput('free!', availableInput)).not.toBeNull();
    expect(validateExplanationOutput({ explanation: 'x', extra: 1 }, availableInput)).not.toBeNull();
    expect(validateExplanationOutput({ text: 'x' }, availableInput)).not.toBeNull();
    expect(validateExplanationOutput({ explanation: '' }, availableInput)).not.toBeNull();
  });

  it('enforces length and sentence limits', () => {
    expect(
      validateExplanationOutput({ explanation: 'a'.repeat(281) }, availableInput)
    ).not.toBeNull();
    expect(
      validateExplanationOutput(
        { explanation: 'One sentence. Two sentences. Three sentences.' },
        availableInput
      )
    ).not.toBeNull();
  });

  it('rejects links, markup and quotes', () => {
    expect(
      validateExplanationOutput({ explanation: 'See http://example.com for details.' }, availableInput)
    ).not.toBeNull();
    expect(
      validateExplanationOutput({ explanation: 'Room *is* [free] today #ok' }, availableInput)
    ).not.toBeNull();
    expect(
      validateExplanationOutput({ explanation: 'The room is "free".' }, availableInput)
    ).not.toBeNull();
  });

  it('rejects times that were not supplied', () => {
    expect(
      validateExplanationOutput(
        { explanation: 'Engineering 101 is free from 08:00 to 12:00.' },
        availableInput
      )
    ).not.toBeNull();
  });

  it('rejects contradicting text', () => {
    expect(
      validateExplanationOutput(
        { explanation: 'Engineering 101 is not available from 11:00 to 12:00.' },
        availableInput
      )
    ).not.toBeNull();
    expect(
      validateExplanationOutput(
        { explanation: 'Engineering 101 is available from 09:30 to 10:30.' },
        unavailableInput
      )
    ).not.toBeNull();
  });

  it('rejects claims that an unavailable room is free or open', () => {
    for (const text of [
      'Engineering 101 is free from 09:30 to 10:30.',
      'Engineering 101 is still free from 09:30 to 10:30.',
      'Engineering 101 is open from 09:30 to 10:30.',
      'Engineering 101 is vacant from 09:30 to 10:30.',
      'Engineering 101 can be used from 09:30 to 10:30.',
    ]) {
      expect(validateExplanationOutput({ explanation: text }, unavailableInput)).not.toBeNull();
    }
    expect(
      validateExplanationOutput(
        { explanation: 'Engineering 101 is free from 11:00 to 12:00.' },
        availableInput
      )
    ).toBeNull();
  });

  it('rejects invented booking claims', () => {
    expect(
      validateExplanationOutput(
        { explanation: 'Your booking is confirmed and reserved successfully.' },
        availableInput
      )
    ).not.toBeNull();
  });
});

describe('buildFallbackExplanation', () => {
  it('builds a deterministic unavailable sentence from the reason codes', () => {
    expect(buildFallbackExplanation(unavailableInput)).toBe(
      'Engineering 101 is not available from 09:30 to 10:30: it overlaps an existing booking.'
    );
  });

  it('builds a deterministic available sentence', () => {
    expect(buildFallbackExplanation(availableInput)).toBe(
      'Engineering 101 is available from 11:00 to 12:00.'
    );
  });

  it('is stable across repeated calls', () => {
    expect(buildFallbackExplanation(unavailableInput)).toBe(buildFallbackExplanation(unavailableInput));
  });
});

describe('requestExplanation', () => {
  it('resolves with the adapter explanation in normal mode', async () => {
    const result = await requestExplanation(unavailableInput, 'normal');
    expect(Object.keys(result)).toEqual(['explanation']);
    expect(result.explanation).toBe(
      'Engineering 101 is not available from 09:30 to 10:30: it overlaps an existing booking.'
    );
  });

  it('rejects before any adapter call when the input is invalid', async () => {
    await expect(
      requestExplanation({ ...availableInput, roomLabel: 'Room <x>' }, 'normal')
    ).rejects.toThrow(/Room label may only contain/);
  });

  it('falls back on timeout mode', async () => {
    await expect(requestExplanation(availableInput, 'timeout', 50)).rejects.toThrow(
      /did not respond within/
    );
  }, ADAPTER_TIMEOUT_MS + 2000);

  it('falls back on error mode', async () => {
    await expect(requestExplanation(availableInput, 'error')).rejects.toThrow(/internal error/);
  });

  it('rejects malformed, contradicting and invented output', async () => {
    await expect(requestExplanation(availableInput, 'malformed')).rejects.toThrow(/rejected/);
    await expect(requestExplanation(availableInput, 'contradict')).rejects.toThrow(/rejected/);
    await expect(requestExplanation(unavailableInput, 'contradict')).rejects.toThrow(/rejected/);
    await expect(requestExplanation(availableInput, 'invented')).rejects.toThrow(/rejected/);
  });

  it('never exposes booking labels in generated text', async () => {
    const result = await requestExplanation(unavailableInput, 'normal');
    expect(result.explanation).not.toContain('CS 201 Lecture');
  });

  it('never changes the availability decision or the booking data', async () => {
    const room: Room = {
      id: 'test-room',
      name: 'Test Room 9',
      building: 'Test Hall',
      capacity: 10,
      blocked: false,
      bookings: [
        { start: 600, end: 660, label: 'Existing Lecture' },
        { start: 800, end: 840, label: 'Existing Seminar' },
      ],
    };
    const roomCopy = structuredClone(room);
    const result = checkAvailability(room, 630, 690, 300);
    const resultCopy = structuredClone(result);

    await requestExplanation(
      {
        roomLabel: room.name,
        start: '10:30',
        end: '11:30',
        isAvailable: result.available,
        reasonCodes: deriveReasonCodes(result.reasons),
      },
      'normal'
    );
    await requestExplanation(
      {
        roomLabel: room.name,
        start: '10:30',
        end: '11:30',
        isAvailable: result.available,
        reasonCodes: deriveReasonCodes(result.reasons),
      },
      'error'
    ).catch(() => undefined);
    await requestExplanation(
      {
        roomLabel: room.name,
        start: '10:30',
        end: '11:30',
        isAvailable: result.available,
        reasonCodes: deriveReasonCodes(result.reasons),
      },
      'timeout',
      50
    ).catch(() => undefined);
    await requestExplanation(
      {
        roomLabel: room.name,
        start: '10:30',
        end: '11:30',
        isAvailable: result.available,
        reasonCodes: deriveReasonCodes(result.reasons),
      },
      'contradict'
    ).catch(() => undefined);

    expect(result).toEqual(resultCopy);
    expect(room).toEqual(roomCopy);
  });

  it('explains a blocked room end-to-end and falls back on adapter error', async () => {
    const input: ExplanationInput = {
      roomLabel: 'Science Lab 3B',
      start: '11:00',
      end: '12:00',
      isAvailable: false,
      reasonCodes: ['ROOM_BLOCKED'],
    };
    const normal = await requestExplanation(input, 'normal');
    expect(Object.keys(normal)).toEqual(['explanation']);
    expect(normal.explanation).toBe(
      'Science Lab 3B is not available from 11:00 to 12:00: the room is blocked.'
    );
    await expect(requestExplanation(input, 'error')).rejects.toThrow(/internal error/);
    expect(buildFallbackExplanation(input)).toBe(
      'Science Lab 3B is not available from 11:00 to 12:00: the room is blocked.'
    );
  });

  it('explains a past-time case end-to-end and falls back on adapter error', async () => {
    const input: ExplanationInput = {
      roomLabel: 'Engineering 101',
      start: '09:30',
      end: '10:30',
      isAvailable: false,
      reasonCodes: ['START_NOT_AFTER_NOW'],
    };
    const normal = await requestExplanation(input, 'normal');
    expect(Object.keys(normal)).toEqual(['explanation']);
    expect(normal.explanation).toBe(
      'Engineering 101 is not available from 09:30 to 10:30: the start time is not after the current campus time.'
    );
    await expect(requestExplanation(input, 'error')).rejects.toThrow(/internal error/);
    expect(buildFallbackExplanation(input)).toBe(
      'Engineering 101 is not available from 09:30 to 10:30: the start time is not after the current campus time.'
    );
  });
});
