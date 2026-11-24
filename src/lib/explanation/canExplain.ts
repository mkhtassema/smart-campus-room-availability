import type { ValidationResult } from '@/types';

const INPUT_ERROR_REASON_PATTERN = /^(Enter a valid current campus time|Enter valid times)/;

/** True when the stored result is a form-input error, not a real rule check. */
export function isInputErrorResult(result: ValidationResult): boolean {
  return result.reasons.some((r) => INPUT_ERROR_REASON_PATTERN.test(r));
}

/** True only when a real, confirmed rule-check result can be explained. */
export function canExplain(
  result: ValidationResult | null,
  hasStoredRequest: boolean
): boolean {
  return result !== null && hasStoredRequest && !isInputErrorResult(result);
}
