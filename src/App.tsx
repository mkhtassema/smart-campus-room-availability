import { useMemo, useRef, useState } from 'react';
import { Building2, Clock, CheckCircle2, XCircle, Calendar, Sparkles, AlertTriangle, Loader2 } from 'lucide-react';
import { SAMPLE_ROOMS, timeStringToMinutes, minutesToTimeString } from '@/lib/bookings';
import {
  requestExplanation,
  buildFallbackExplanation,
  validateExplanationInput,
  ADAPTER_TIMEOUT_MS,
} from '@/lib/explanation/adapter';
import type { DemoMode } from '@/lib/explanation/adapter';
import { decideBookingRequest, explanationReasonCodes } from '@/lib/requestValidation';
import type { RequestDecision } from '@/lib/requestValidation';

const DEFAULT_CURRENT = 600; // 10:00
const DEFAULT_DURATION = 60;

interface ExplanationState {
  status: 'idle' | 'loading' | 'ok' | 'fallback' | 'invalid';
  text?: string;
  message?: string;
}

export default function App() {
  const [roomId, setRoomId] = useState(SAMPLE_ROOMS[0].id);
  const [startTime, setStartTime] = useState('11:00');
  const [duration, setDuration] = useState<number | ''>(DEFAULT_DURATION);
  const [simulateBlocked, setSimulateBlocked] = useState(false);
  const [currentTime, setCurrentTime] = useState(minutesToTimeString(DEFAULT_CURRENT));
  const [decision, setDecision] = useState<RequestDecision | null>(null);
  const [demoMode, setDemoMode] = useState<DemoMode>('normal');
  const [explanation, setExplanation] = useState<ExplanationState>({ status: 'idle' });
  const lastRequest = useRef<{ roomLabel: string; start: string; end: string; fallback: string } | null>(null);

  const selectedRoom = useMemo(
    () => SAMPLE_ROOMS.find((r) => r.id === roomId)!,
    [roomId]
  );

  const handleCheck = () => {
    const d = decideBookingRequest(
      { currentTime, start: startTime, durationMinutes: duration, blocked: simulateBlocked },
      selectedRoom
    );
    setDecision(d);
    setExplanation({ status: 'idle' });
    if (d.reasonCode === 'INVALID_INPUT') {
      lastRequest.current = null;
      return;
    }
    const end = timeStringToMinutes(startTime)! + (duration as number);
    lastRequest.current = {
      roomLabel: selectedRoom.name,
      start: startTime,
      end: minutesToTimeString(end),
      fallback: '',
    };
  };

  const handleExplain = async () => {
    if (!decision || !lastRequest.current || decision.reasonCode === 'INVALID_INPUT') return;
    // The explanation is built from the SAME single decision the card shows,
    // never from the raw engine result.
    const input = {
      roomLabel: lastRequest.current.roomLabel,
      start: lastRequest.current.start,
      end: lastRequest.current.end,
      isAvailable: decision.reasonCode === 'OK',
      reasonCodes: explanationReasonCodes(decision.reasonCode),
    };
    const inputErrors = validateExplanationInput(input);
    if (inputErrors.length > 0) {
      setExplanation({ status: 'invalid', message: inputErrors.join(' ') });
      return;
    }
    const fallback = buildFallbackExplanation(input);
    lastRequest.current.fallback = fallback;
    setExplanation({ status: 'loading' });
    try {
      const { explanation } = await requestExplanation(input, demoMode, ADAPTER_TIMEOUT_MS);
      setExplanation({ status: 'ok', text: explanation });
    } catch {
      setExplanation({ status: 'fallback', text: fallback });
    }
  };

  const clearDecision = () => {
    setDecision(null);
    setExplanation({ status: 'idle' });
    lastRequest.current = null;
  };

  const handleReset = () => {
    setStartTime('11:00');
    setDuration(DEFAULT_DURATION);
    setSimulateBlocked(false);
    setCurrentTime(minutesToTimeString(DEFAULT_CURRENT));
    clearDecision();
  };

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900">
      {/* Header */}
      <header className="bg-gradient-to-r from-sky-700 to-teal-600 text-white shadow-lg">
        <div className="max-w-4xl mx-auto px-4 sm:px-6 py-8 sm:py-10">
          <div className="flex items-center gap-3">
            <Building2 className="w-8 h-8 sm:w-10 sm:h-10 shrink-0" />
            <div>
              <h1 className="text-xl sm:text-3xl font-bold tracking-tight">
                Smart Campus Room Availability Checker
              </h1>
              <p className="text-sky-100 text-sm sm:text-base mt-1">
                Check whether a campus room is free for your requested time slot.
              </p>
            </div>
          </div>
        </div>
      </header>

      <main className="max-w-4xl mx-auto px-4 sm:px-6 py-6 sm:py-10 space-y-6">
        {/* Controls */}
        <section className="bg-white rounded-2xl shadow-sm border border-slate-200 p-5 sm:p-7">
          <h2 className="text-lg font-semibold mb-4 flex items-center gap-2">
            <Calendar className="w-5 h-5 text-sky-600" />
            Check a Room
          </h2>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {/* Room selection */}
            <div className="sm:col-span-2">
              <label className="block text-sm font-medium text-slate-700 mb-1">
                Select Room
              </label>
              <select
                value={roomId}
                onChange={(e) => { setRoomId(e.target.value); clearDecision(); }}
                className="w-full rounded-lg border border-slate-300 px-3 py-2.5 text-sm focus:ring-2 focus:ring-sky-500 focus:border-sky-500 outline-none transition"
              >
                {SAMPLE_ROOMS.map((r) => (
                  <option key={r.id} value={r.id}>
                    {r.name} — {r.building} (cap {r.capacity})
                    {r.blocked ? ' [BLOCKED]' : ''}
                  </option>
                ))}
              </select>
            </div>

            {/* Current time */}
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1 flex items-center gap-1.5">
                <Clock className="w-4 h-4 text-slate-400" />
                Current Campus Time
              </label>
              <input
                type="time"
                value={currentTime}
                onChange={(e) => { setCurrentTime(e.target.value); clearDecision(); }}
                className="w-full rounded-lg border border-slate-300 px-3 py-2.5 text-sm focus:ring-2 focus:ring-sky-500 focus:border-sky-500 outline-none transition"
              />
            </div>

            {/* Start time */}
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">
                Requested Start
              </label>
              <input
                type="time"
                value={startTime}
                onChange={(e) => { setStartTime(e.target.value); clearDecision(); }}
                className="w-full rounded-lg border border-slate-300 px-3 py-2.5 text-sm focus:ring-2 focus:ring-sky-500 focus:border-sky-500 outline-none transition"
              />
            </div>

            {/* Duration (minutes) */}
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">
                Duration (minutes)
              </label>
              <input
                type="number"
                min={1}
                max={120}
                step={1}
                value={duration}
                onChange={(e) => {
                  const v = e.target.value;
                  setDuration(v === '' ? '' : Number(v));
                  clearDecision();
                }}
                className="w-full rounded-lg border border-slate-300 px-3 py-2.5 text-sm focus:ring-2 focus:ring-sky-500 focus:border-sky-500 outline-none transition"
              />
              <span className="block text-xs text-slate-400 mt-1">Max allowed: 120 min</span>
            </div>

            {/* Simulated maintenance block */}
            <label className="flex items-center gap-2 text-sm font-medium text-slate-700 sm:col-span-2 select-none">
              <input
                type="checkbox"
                checked={simulateBlocked}
                onChange={(e) => { setSimulateBlocked(e.target.checked); clearDecision(); }}
                className="w-4 h-4 rounded border-slate-300 text-sky-600 focus:ring-2 focus:ring-sky-500"
              />
              Room blocked (maintenance)
            </label>
          </div>

          {/* Demo adapter mode */}
          <div className="mt-4">
            <label className="block text-sm font-medium text-slate-700 mb-1">
              Demo adapter mode
            </label>
            <select
              value={demoMode}
              onChange={(e) => setDemoMode(e.target.value as DemoMode)}
              className="w-full sm:w-64 rounded-lg border border-slate-300 px-3 py-2.5 text-sm focus:ring-2 focus:ring-sky-500 focus:border-sky-500 outline-none transition"
            >
              <option value="normal">normal</option>
              <option value="timeout">timeout</option>
              <option value="error">error</option>
              <option value="contradict">contradict</option>
              <option value="invented">invented</option>
              <option value="malformed">malformed</option>
            </select>
          </div>

          {/* Action buttons */}
          <div className="flex flex-col sm:flex-row gap-3 mt-6">
            <button
              onClick={handleCheck}
              className="flex-1 bg-sky-600 hover:bg-sky-700 active:bg-sky-800 text-white font-semibold py-2.5 px-4 rounded-lg transition shadow-sm"
            >
              Check Availability
            </button>
            <button
              onClick={handleReset}
              className="sm:w-auto bg-slate-100 hover:bg-slate-200 text-slate-700 font-medium py-2.5 px-4 rounded-lg transition border border-slate-200"
            >
              Reset
            </button>
          </div>
        </section>

        {/* Decision (pre-engine validation) */}
        {decision && decision.reasonCode === 'INVALID_INPUT' && (
          <section className="rounded-2xl border border-amber-200 bg-amber-50 p-5 sm:p-6 shadow-sm">
            <div className="flex items-start gap-3">
              <AlertTriangle className="w-7 h-7 text-amber-600 shrink-0 mt-0.5" />
              <div>
                <h3 className="text-lg font-bold text-amber-800">Invalid input</h3>
                <p className="text-sm text-amber-700 mt-1">{decision.message}</p>
              </div>
            </div>
          </section>
        )}

        {/* Result */}
        {decision && decision.reasonCode !== 'INVALID_INPUT' && (
          <section
            className={`rounded-2xl border p-5 sm:p-6 shadow-sm transition ${
              decision.reasonCode === 'OK'
                ? 'bg-emerald-50 border-emerald-200'
                : 'bg-rose-50 border-rose-200'
            }`}
          >
            <div className="flex items-start gap-3">
              {decision.reasonCode === 'OK' ? (
                <CheckCircle2 className="w-7 h-7 text-emerald-600 shrink-0 mt-0.5" />
              ) : (
                <XCircle className="w-7 h-7 text-rose-600 shrink-0 mt-0.5" />
              )}
              <div>
                <h3
                  className={`text-lg font-bold ${
                    decision.reasonCode === 'OK' ? 'text-emerald-800' : 'text-rose-800'
                  }`}
                >
                  {decision.reasonCode === 'OK' ? 'Available' : 'Unavailable'}
                </h3>
                {decision.reasonCode === 'OK' ? (
                  <p className="text-sm text-emerald-700 mt-1">
                    {selectedRoom.name} is free from {startTime} to{' '}
                    {minutesToTimeString(timeStringToMinutes(startTime)! + (duration as number))}. No
                    conflicts detected — your request meets all criteria.
                  </p>
                ) : (
                  <p className="text-sm text-rose-700 mt-1">{decision.message}</p>
                )}
              </div>
            </div>
          </section>
        )}

        {/* Explanation (mock adapter) */}
        {decision && decision.reasonCode !== 'INVALID_INPUT' && (
          <section className="bg-white rounded-2xl shadow-sm border border-slate-200 p-5 sm:p-6">
            <div className="flex flex-col sm:flex-row sm:items-center gap-3">
              <button
                onClick={handleExplain}
                disabled={explanation.status === 'loading'}
                className="inline-flex items-center justify-center gap-2 bg-slate-800 hover:bg-slate-900 disabled:bg-slate-300 disabled:cursor-not-allowed text-white font-medium py-2.5 px-4 rounded-lg transition shadow-sm"
              >
                {explanation.status === 'loading' ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  <Sparkles className="w-4 h-4" />
                )}
                {explanation.status === 'loading' ? 'Generating…' : 'Explain availability'}
              </button>
              <p className="text-xs text-slate-500 flex items-center gap-1.5">
                <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
                Confirmed by booking rules — {decision.reasonCode === 'OK' ? 'Available' : 'Unavailable'}
              </p>
            </div>

            {explanation.status === 'invalid' && (
              <div className="mt-4 flex items-start gap-2 rounded-lg bg-amber-50 border border-amber-200 px-3 py-2.5 text-sm text-amber-800">
                <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
                <span>{explanation.message}</span>
              </div>
            )}

            {(explanation.status === 'ok' || explanation.status === 'fallback') && (
              <div
                className={`mt-4 rounded-lg border-2 border-dashed px-4 py-3 ${
                  explanation.status === 'ok'
                    ? 'border-sky-300 bg-sky-50'
                    : 'border-slate-300 bg-slate-50'
                }`}
              >
                <p
                  className={`text-xs font-semibold mb-1 ${
                    explanation.status === 'ok' ? 'text-sky-700' : 'text-slate-600'
                  }`}
                >
                  {explanation.status === 'ok'
                    ? 'Generated explanation (mock adapter, demo — no real AI)'
                    : 'Standard explanation (automatic text)'}
                </p>
                <p className="text-sm text-slate-700">{explanation.text}</p>
                <p className="text-xs text-slate-400 mt-2">
                  This text is not a booking confirmation.
                </p>
              </div>
            )}
          </section>
        )}

        {/* Room schedule */}
        <section className="bg-white rounded-2xl shadow-sm border border-slate-200 p-5 sm:p-7">
          <h2 className="text-lg font-semibold mb-1">
            {selectedRoom.name}
          </h2>
          <p className="text-sm text-slate-500 mb-4">
            {selectedRoom.building} · Capacity {selectedRoom.capacity}
            {selectedRoom.blocked && (
              <span className="ml-2 inline-flex items-center gap-1 text-rose-600 font-medium">
                <XCircle className="w-4 h-4" />
                Blocked
              </span>
            )}
          </p>

          {selectedRoom.bookings.length === 0 ? (
            <p className="text-sm text-slate-400 italic">No existing bookings today.</p>
          ) : (
            <div className="space-y-2">
              {selectedRoom.bookings.map((b, i) => (
                <div
                  key={i}
                  className="flex items-center justify-between rounded-lg bg-slate-50 border border-slate-100 px-3 py-2"
                >
                  <span className="text-sm font-medium text-slate-700">{b.label}</span>
                  <span className="text-sm text-slate-500 tabular-nums">
                    {minutesToTimeString(b.start)} – {minutesToTimeString(b.end)}
                  </span>
                </div>
              ))}
            </div>
          )}

          {selectedRoom.blocked && selectedRoom.blockReason && (
            <div className="mt-4 rounded-lg bg-rose-50 border border-rose-200 px-3 py-2.5 text-sm text-rose-700">
              {selectedRoom.blockReason}
            </div>
          )}
        </section>

        {/* Footer note */}
        <p className="text-xs text-slate-400 text-center pb-4">
          Fictional sample data · Hours represented in minutes from midnight (0–1440) ·
          No booking data is modified by checking availability.
        </p>
      </main>
    </div>
  );
}
