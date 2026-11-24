# AGENTS.md

## Project
Smart Campus room availability checker (Practice #06 prototype, repaired in Practice #08).
Fictional data only (`SAMPLE_ROOMS`), fixed/supplied current time, availability decision only.

## Structure
- `src/App.tsx` – the page (UI). Change only if the task names it and the human approves the diff; keep the existing UI.
- `src/lib/availability.ts` – PURE rules: `checkAvailability(room, start, end, currentMinutes)` (AC1–AC5)
- `src/lib/time.ts` – `timeStringToMinutes`, `minutesToTimeString`
- `src/data/sampleRooms.ts` – fictional fixtures (data only)
- `src/lib/bookings.ts` – public entry point; re-exports the three modules above (imports from `@/lib/bookings` must keep working)
- `src/types.ts` – `Room`, `Booking`, `ValidationResult`
- `src/lib/bookings.test.ts` – original 35 tests (do not edit or weaken)
- `src/lib/availability.test.ts` – focused regression tests for the module boundary and AC1–AC6
- `src/lib/availability.extra.test.ts` – extra boundary regression tests (do not edit or weaken)

## Constraints (accepted rules)
- AC1: accept only 0 <= start < end <= 1440 and start strictly after the current time.
- AC2: reject a booking longer than 120 minutes.
- AC3: reject a blocked room (with its reason).
- AC4: reject overlaps; bookings touching only at endpoints are allowed (strict `<` / `>`).
- AC5: clear Available/Unavailable decision; never mutate booking data (no in-place `sort`).
- AC6: page stays usable at desktop and narrow/mobile width with understandable feedback; keep the existing UI.
- Forbidden scope changes: no backend, login, database, saved booking creation, new rooms or new features.

## Engineering rules
- Prefer pure functions and minimal changes; use at most 2 justified patterns.
- Do NOT add Singleton, Factory or class hierarchies without a concrete need.
- Strategy only with two genuinely required policies; Adapter only if fixtures truly have inconsistent shapes (they do not: every booking is `{ start, end, label }`).
- Do not mutate booking fixtures. Keep the signature and return shape `{ available, reasons[] }`.

## Commands
- Install: `npm install`
- Test (exact command): `npx vitest run`   (no `npm test` alias is defined)
- Lint: `npm run lint`
- Typecheck: `npm run typecheck`

## Safety
- No secrets, `.env` files or real personal data.
- No new dependencies, publishing, push or merge without human approval.
- Show the diff and wait for approval.
- Run `npx vitest run` before proposing acceptance and state what was not run.

## Verification
- Run existing tests and add focused regression tests; never weaken or delete assertions.
- Report changed files, rationale and test evidence (exact command, output, passing/failing counts).
- Do not claim AGENTS.md was loaded automatically; read it explicitly and summarise its constraints first.