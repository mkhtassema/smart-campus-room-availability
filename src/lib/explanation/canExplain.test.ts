import { describe, it, expect } from 'vitest';
import { canExplain, isInputErrorResult } from './canExplain';
import type { ValidationResult } from '@/types';

const available: ValidationResult = { available: true, reasons: [] };
const unavailable: ValidationResult = {
  available: false,
  reasons: ['Overlaps existing booking "CS 201 Lecture" (09:00–10:00).'],
};
const emptyCurrentTime: ValidationResult = {
  available: false,
  reasons: ['Enter a valid current campus time (HH:MM).'],
};
const malformedTimes: ValidationResult = {
  available: false,
  reasons: ['Enter valid times in HH:MM format.'],
};

describe('canExplain', () => {
  it('allows explaining a real rule-check result with a stored request', () => {
    expect(canExplain(available, true)).toBe(true);
    expect(canExplain(unavailable, true)).toBe(true);
  });

  it('forbids explaining when there is no result or no stored request', () => {
    expect(canExplain(null, true)).toBe(false);
    expect(canExplain(available, false)).toBe(false);
    expect(canExplain(null, false)).toBe(false);
  });

  it('forbids explaining an input-error pseudo result even with a stored request', () => {
    expect(canExplain(emptyCurrentTime, true)).toBe(false);
    expect(canExplain(malformedTimes, true)).toBe(false);
  });
});

describe('isInputErrorResult', () => {
  it('marks form-input pseudo results as not confirmed by the booking rules', () => {
    expect(isInputErrorResult(emptyCurrentTime)).toBe(true);
    expect(isInputErrorResult(malformedTimes)).toBe(true);
  });

  it('does not mark real rule-check results as input errors', () => {
    expect(isInputErrorResult(available)).toBe(false);
    expect(isInputErrorResult(unavailable)).toBe(false);
  });
});
