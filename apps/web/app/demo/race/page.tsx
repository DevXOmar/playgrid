"use client";

import { api } from "@/lib/api";
import { Button, Card, Select } from "@playgrid/ui";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { motion } from "framer-motion";
import { CheckCircle2, ChevronDown, Database, GitCommitHorizontal, RotateCcw, Send, ShieldCheck, TerminalSquare, Trophy, XCircle } from "lucide-react";
import { useEffect, useMemo, useState } from "react";

type Facility = { id: string; name: string; sport: string; slots: Slot[] };
type Slot = { id: string; startsAt: string; endsAt: string; state?: string };
type ReadinessCheck = { label: string; passed: boolean; code?: string; detail?: string };
type RaceReadiness = { slotId: string; facilityName?: string; activeBookings: number; waitlistCount: number; ready: boolean; reason?: string; checks: ReadinessCheck[]; transactionStrategy: string; constraintName: string };
type RequestLog = { request: number; userId: string; idempotencyKey: string; statusCode: number; code: string; bookingId?: string; durationMs: number; message?: string };
type RaceResult = {
  raceRunId: string;
  slotId: string;
  requests: number;
  successes: number;
  conflicts: number;
  policyRejections: number;
  validationFailures: number;
  serverErrors: number;
  other4xx: number;
  databaseBookings: number;
  beforeActiveBookings: number;
  afterActiveBookings: number;
  durationMs: number;
  integrity: "PASSED" | "FAILED";
  winnerBookingId?: string;
  winnerUserId?: string;
  winnerCreatedAt?: string;
  transactionStrategy: string;
  constraintName: string;
  sqlProof: string;
  outcomeBreakdown: { created201: number; slotConflicts409: number; policyRejections409: number; other4xx: number; serverErrors: number };
  requestLog: RequestLog[];
};
type ResetResult = { slotId: string; activeBookings: number; ready: boolean; constraintName: string; transactionStrategy: string };

function isoDateAfter(days: number) {
  const date = new Date();
  date.setDate(date.getDate() + days);
  return date.toISOString().slice(0, 10);
}

const raceDates = Array.from({ length: 7 }, (_, index) => isoDateAfter(index + 1));

export default function RaceDemoPage() {
  const qc = useQueryClient();
  const [facilityId, setFacilityId] = useState("");
  const [slotId, setSlotId] = useState("");
  const [date, setDate] = useState(() => isoDateAfter(1));
  const [requests, setRequests] = useState(100);
  const [showLog, setShowLog] = useState(false);
  const facilities = useQuery({ queryKey: ["facilities"], queryFn: () => api<Facility[]>("/facilities") });
  const selectedFacility = useMemo(() => facilities.data?.find((f) => f.id === facilityId) ?? facilities.data?.find((f) => f.name === "Badminton Court 1") ?? facilities.data?.[0], [facilities.data, facilityId]);
  const slots = useQuery({ queryKey: ["race-slots", selectedFacility?.id, date], queryFn: () => api<Slot[]>(`/facilities/${selectedFacility?.id}/slots?date=${date}`), enabled: Boolean(selectedFacility?.id) });
  const defaultSlot = useMemo(() => {
    const now = Date.now();
    return (
      slots.data?.find((s) => new Date(s.startsAt).getTime() > now && new Date(s.startsAt).getUTCHours() === 18 && s.state === "AVAILABLE") ??
      slots.data?.find((s) => new Date(s.startsAt).getTime() > now && s.state === "AVAILABLE") ??
      slots.data?.find((s) => s.state === "AVAILABLE") ??
      slots.data?.[0]
    );
  }, [slots.data]);
  useEffect(() => {
    if (!slots.data?.length) return;
    if (!slotId || !slots.data.some((slot) => slot.id === slotId)) setSlotId(defaultSlot?.id ?? "");
  }, [defaultSlot?.id, slotId, slots.data]);
  const selectedSlot = slotId || defaultSlot?.id || "";
  const selectedSlotRecord = slots.data?.find((slot) => slot.id === selectedSlot);
  const selectedSlotIsFuture = selectedSlotRecord ? new Date(selectedSlotRecord.endsAt).getTime() > Date.now() : false;
  const selectedSlotCanRace = Boolean(selectedSlotRecord && selectedSlotIsFuture && selectedSlotRecord.state !== "MAINTENANCE" && selectedSlotRecord.state !== "CLOSED");
  const readiness = useQuery({
    queryKey: ["race-readiness", selectedSlot],
    queryFn: () => api<RaceReadiness>(`/demo/race/readiness?slotId=${encodeURIComponent(selectedSlot)}`),
    enabled: Boolean(selectedSlot)
  });
  const run = useMutation({
    mutationFn: async () => {
      if (selectedSlotRecord?.state === "BOOKED" || readiness.data?.reason === "SLOT_ALREADY_BOOKED") {
        await api<ResetResult>("/demo/race/reset", { method: "POST", body: JSON.stringify({ slotId: selectedSlot }) });
      }
      return api<RaceResult>("/demo/race", { method: "POST", body: JSON.stringify({ slotId: selectedSlot, requests }) });
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["race-readiness", selectedSlot] });
      qc.invalidateQueries({ queryKey: ["race-slots", selectedFacility?.id, date] });
      qc.invalidateQueries({ queryKey: ["facilities"] });
    }
  });
  const reset = useMutation({
    mutationFn: () => api<ResetResult>("/demo/race/reset", { method: "POST", body: JSON.stringify({ slotId: selectedSlot }) }),
    onSuccess: () => {
      run.reset();
      qc.invalidateQueries({ queryKey: ["race-readiness", selectedSlot] });
      qc.invalidateQueries({ queryKey: ["race-slots", selectedFacility?.id, date] });
      qc.invalidateQueries({ queryKey: ["facilities"] });
    }
  });
  const result = run.data?.slotId === selectedSlot && run.data.requests === requests ? run.data : undefined;
  const setupError = (run.error as (Error & { data?: { code?: string; reason?: string; message?: string } }) | null)?.data;
  const ready = Boolean(readiness.data?.ready);
  const canAutoReset = selectedSlotRecord?.state === "BOOKED" || readiness.data?.reason === "SLOT_ALREADY_BOOKED";
  const canRun = Boolean(selectedSlot) && selectedSlotCanRace && (ready || canAutoReset || readiness.isFetching) && !run.isPending && !reset.isPending;
  const visibleLogs = useMemo(() => {
    if (!result?.requestLog) return [];
    const seen = new Set<number>();
    return [...result.requestLog.slice(0, 10), ...result.requestLog.slice(-5)].filter((item) => (seen.has(item.request) ? false : (seen.add(item.request), true)));
  }, [result?.requestLog]);
  const clearRaceState = () => {
    run.reset();
    reset.reset();
    setShowLog(false);
  };

  return (
    <div className="space-y-8">
      <section className="grid gap-6 lg:grid-cols-[0.95fr_1.05fr] lg:items-center">
        <div>
          <p className="text-sm font-bold text-playorange">Race demo</p>
          <h1 className="mt-2 text-5xl font-black sm:text-7xl">THE 6:00 PM PROBLEM</h1>
          <p className="mt-5 max-w-2xl text-lg text-muted">Fire real concurrent booking requests at one facility slot. PostgreSQL must return exactly one winner.</p>
        </div>
        <Card className="p-5">
          <div className="grid gap-3">
            <Select aria-label="Facility" value={selectedFacility?.id ?? ""} onChange={(e: React.ChangeEvent<HTMLSelectElement>) => { clearRaceState(); setFacilityId(e.target.value); setSlotId(""); }}>
              {facilities.data?.map((f) => <option value={f.id} key={f.id}>{f.name}</option>)}
            </Select>
            <Select aria-label="Race date" value={date} onChange={(e: React.ChangeEvent<HTMLSelectElement>) => { clearRaceState(); setDate(e.target.value); setSlotId(""); }}>
              {raceDates.map((value) => (
                <option value={value} key={value}>{new Date(`${value}T00:00:00`).toLocaleDateString([], { weekday: "short", month: "short", day: "numeric" })}</option>
              ))}
            </Select>
            <Select aria-label="Slot" value={selectedSlot} onChange={(e: React.ChangeEvent<HTMLSelectElement>) => { clearRaceState(); setSlotId(e.target.value); }}>
              {slots.data?.map((slot) => {
                const isFuture = new Date(slot.endsAt).getTime() > Date.now();
                const blocked = slot.state === "MAINTENANCE" || slot.state === "CLOSED" || !isFuture;
                return (
                  <option value={slot.id} key={slot.id} disabled={blocked}>
                    {new Date(slot.startsAt).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })} - {new Date(slot.endsAt).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })} - {blocked ? "Not raceable" : slot.state}
                  </option>
                );
              })}
            </Select>
            <Select aria-label="Concurrent requests" value={requests} onChange={(e: React.ChangeEvent<HTMLSelectElement>) => { clearRaceState(); setRequests(Number(e.target.value)); }}>
              {[10, 25, 50, 100].map((n) => <option value={n} key={n}>{n} concurrent requests</option>)}
            </Select>
            <div className="rounded-lg border border-white/10 bg-white/[0.03] p-4">
              <div className="flex items-center justify-between gap-3">
                <p className="text-sm font-black">{ready ? "READY FOR RACE" : "SETUP CHECK"}</p>
                <span className={`rounded-full px-3 py-1 text-xs font-black ${ready || canAutoReset ? "bg-green-400/15 text-green-300" : "bg-playorange/15 text-playorange"}`}>{ready ? "READY" : canAutoReset ? "AUTO-RESET READY" : readiness.data?.reason ?? "CHECKING"}</span>
              </div>
              <div className="mt-3 grid gap-2 sm:grid-cols-2">
                {readiness.data?.checks.map((check) => (
                  <div key={check.label} className="flex items-center gap-2 text-sm text-muted">
                    {check.passed ? <CheckCircle2 className="h-4 w-4 text-green-300" /> : <XCircle className="h-4 w-4 text-playorange" />}
                    <span>{check.label}{check.detail ? ` - ${check.detail}` : ""}</span>
                  </div>
                ))}
              </div>
            </div>
            {setupError ? <p className="rounded-lg border border-playorange/30 bg-playorange/10 p-3 text-sm text-playorange">{setupError.message ?? setupError.reason ?? setupError.code}</p> : null}
            {reset.data?.ready ? <p className="rounded-lg border border-green-400/30 bg-green-400/10 p-3 text-sm text-green-300">Reset complete. Active bookings for this slot: {reset.data.activeBookings}.</p> : null}
            <div className="grid gap-3 sm:grid-cols-2">
              <Button size="lg" disabled={!canRun} onClick={() => run.mutate()}><Send className="h-5 w-5" />{canAutoReset ? "Reset & run race" : "Run race"}</Button>
              <Button size="lg" variant="secondary" disabled={!selectedSlot || reset.isPending} onClick={() => reset.mutate()}><RotateCcw className="h-5 w-5" />Reset demo</Button>
            </div>
          </div>
        </Card>
      </section>

      <Card className="overflow-hidden p-5">
        <div className="grid gap-6 lg:grid-cols-[1fr_auto_1fr_auto_1fr] lg:items-center">
          <div>
            <p className="text-sm font-bold text-muted">{requests} REQUESTS</p>
            <div className="mt-4 grid grid-cols-10 gap-2">
              {Array.from({ length: Math.min(requests, 100) }).map((_, i) => (
                <motion.span key={i} animate={run.isPending ? { scale: [0.85, 1.12, 0.85], opacity: [0.35, 1, 0.35] } : { scale: 1, opacity: 0.75 }} transition={{ repeat: run.isPending ? Infinity : 0, duration: 0.9, delay: i * 0.006 }} className="h-3 rounded-full bg-purple" />
              ))}
            </div>
          </div>
          <Send className="mx-auto h-8 w-8 text-playorange" />
          <div className="rounded-lg border border-purple/40 bg-purple/15 p-6 text-center">
            <ShieldCheck className="mx-auto mb-3 h-10 w-10 text-lavender" />
            <p className="text-2xl font-black">BOOKING SERVICE</p>
            <p className="mt-2 text-sm text-muted">{result?.transactionStrategy ?? readiness.data?.transactionStrategy ?? "Atomic PostgreSQL insert"}</p>
          </div>
          <Send className="mx-auto h-8 w-8 text-playorange" />
          <div className="grid grid-cols-2 gap-3">
            <div className="rounded-lg bg-green-400/15 p-4 text-center"><Trophy className="mx-auto mb-2 h-7 w-7 text-green-300" /><p className="text-3xl font-black">{result?.successes ?? 0}</p><p className="text-xs text-muted">WINNER</p></div>
            <div className="rounded-lg bg-playorange/15 p-4 text-center"><XCircle className="mx-auto mb-2 h-7 w-7 text-playorange" /><p className="text-3xl font-black">{result?.conflicts ?? 0}</p><p className="text-xs text-muted">CONFLICTS</p></div>
          </div>
        </div>
      </Card>

      <section className="grid gap-4 md:grid-cols-5">
        {[
          ["Requests sent", result?.requests ?? 0],
          ["Successful bookings", result?.successes ?? 0],
          ["Rejected conflicts", result?.conflicts ?? 0],
          ["Database bookings", result?.databaseBookings ?? readiness.data?.activeBookings ?? 0],
          ["Execution duration", result ? `${result.durationMs}ms` : "0ms"]
        ].map(([label, value]) => (
          <Card key={label} className="p-5">
            <p className="text-3xl font-black">{value}</p>
            <p className="mt-1 text-sm text-muted">{label}</p>
          </Card>
        ))}
      </section>

      <section className="grid gap-4 lg:grid-cols-[1.2fr_0.8fr]">
        <Card className={`p-6 ${result?.integrity === "PASSED" ? "border-green-400/40" : result ? "border-red-400/40" : ""}`}>
          <div className="flex flex-wrap items-center gap-4">
            <Database className="h-8 w-8 text-playorange" />
            <div>
              <p className="text-2xl font-black">BACKEND VERIFICATION</p>
              <p className="text-muted">Values below are returned by the NestJS race endpoint after querying PostgreSQL.</p>
            </div>
          </div>
          <div className="mt-5 grid gap-3 sm:grid-cols-2">
            {[
              ["Race Run ID", result?.raceRunId ?? "Awaiting race"],
              ["Slot ID", result?.slotId ?? selectedSlot],
              ["Transaction Strategy", result?.transactionStrategy ?? readiness.data?.transactionStrategy ?? "Atomic PostgreSQL insert"],
              ["Database Constraint", result?.constraintName ?? readiness.data?.constraintName ?? "Booking_activeSlotId_key"],
              ["Winner Booking ID", result?.winnerBookingId ?? "None yet"],
              ["Winner User ID", result?.winnerUserId ?? "None yet"],
              ["Database Active Booking Count", String(result?.afterActiveBookings ?? readiness.data?.activeBookings ?? 0)],
              ["Integrity Result", result?.integrity ?? "Awaiting race"]
            ].map(([label, value]) => (
              <div key={label} className="rounded-lg border border-white/10 bg-white/[0.03] p-3">
                <p className="text-xs font-bold uppercase text-muted">{label}</p>
                <p className="mt-1 break-all font-semibold text-white">{value}</p>
              </div>
            ))}
          </div>
        </Card>

        <Card className="p-6">
          <div className="flex items-center gap-3">
            <GitCommitHorizontal className="h-7 w-7 text-playorange" />
            <p className="text-2xl font-black">DATABASE INVARIANT</p>
          </div>
          <p className="mt-3 text-muted">At most one active booking may exist for this slot.</p>
          <div className="mt-5 space-y-3 text-sm">
            <div className="flex justify-between gap-4"><span className="text-muted">Before race</span><b>{result?.beforeActiveBookings ?? readiness.data?.activeBookings ?? 0} active bookings</b></div>
            <div className="flex justify-between gap-4"><span className="text-muted">After race</span><b>{result?.afterActiveBookings ?? 0} active booking{result?.afterActiveBookings === 1 ? "" : "s"}</b></div>
            <div className="flex justify-between gap-4"><span className="text-muted">Invariant</span><b className={result?.integrity === "PASSED" ? "text-green-300" : result ? "text-playorange" : "text-muted"}>{result?.integrity ?? "Awaiting race"}</b></div>
          </div>
        </Card>
      </section>

      <section className="grid gap-4 lg:grid-cols-2">
        <Card className="p-6">
          <p className="text-2xl font-black">REQUEST OUTCOME BREAKDOWN</p>
          <div className="mt-5 grid gap-3 sm:grid-cols-2">
            {[
              ["201 CREATED", result?.outcomeBreakdown.created201 ?? 0, "text-green-300"],
              ["409 SLOT_ALREADY_BOOKED", result?.outcomeBreakdown.slotConflicts409 ?? 0, "text-playorange"],
              ["409 POLICY REJECTION", result?.outcomeBreakdown.policyRejections409 ?? 0, "text-lavender"],
              ["4XX OTHER", result?.outcomeBreakdown.other4xx ?? 0, "text-muted"],
              ["5XX", result?.outcomeBreakdown.serverErrors ?? 0, "text-red-300"]
            ].map(([label, value, color]) => (
              <div key={label} className="rounded-lg border border-white/10 bg-white/[0.03] p-4">
                <p className={`text-3xl font-black ${color}`}>{value}</p>
                <p className="text-xs font-bold text-muted">{label}</p>
              </div>
            ))}
          </div>
          <button className="mt-4 flex items-center gap-2 text-sm font-bold text-lavender" onClick={() => setShowLog((value) => !value)}>
            View request log <ChevronDown className={`h-4 w-4 transition ${showLog ? "rotate-180" : ""}`} />
          </button>
          {showLog ? (
            <div className="mt-4 max-h-80 overflow-auto rounded-lg border border-white/10">
              {visibleLogs.map((item) => (
                <div key={item.request} className="grid grid-cols-[3.5rem_4rem_1fr_4rem] gap-3 border-b border-white/10 px-3 py-2 text-sm last:border-b-0">
                  <span className="text-muted">#{item.request}</span>
                  <span className={item.statusCode === 201 ? "text-green-300" : item.statusCode >= 500 ? "text-red-300" : "text-playorange"}>{item.statusCode}</span>
                  <span className="truncate">{item.code}</span>
                  <span className="text-right text-muted">{item.durationMs}ms</span>
                </div>
              ))}
            </div>
          ) : null}
        </Card>

        <Card className="p-6">
          <p className="text-2xl font-black">INTERNAL FLOW</p>
          <div className="mt-5 space-y-3 text-sm font-semibold">
            {[
              `${result?.requests ?? requests} concurrent requests`,
              "Booking Service",
              "PostgreSQL atomic claim",
              result?.constraintName ?? readiness.data?.constraintName ?? "Unique active booking constraint",
              `${result?.successes ?? 0} INSERT succeeds`,
              `${result?.conflicts ?? 0} INSERTs conflict`,
              `DB count = ${result?.databaseBookings ?? readiness.data?.activeBookings ?? 0}`
            ].map((step, index) => (
              <div key={step} className="flex items-center gap-3">
                <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-purple/25 text-xs text-lavender">{index + 1}</span>
                <span>{step}</span>
              </div>
            ))}
          </div>
        </Card>
      </section>

      <Card className="p-6">
        <details>
          <summary className="flex cursor-pointer items-center gap-3 text-xl font-black"><TerminalSquare className="h-6 w-6 text-playorange" />HOW THE WINNER IS DECIDED</summary>
          <pre className="mt-4 overflow-auto rounded-lg border border-white/10 bg-black/40 p-4 text-sm text-muted">{result?.sqlProof ?? 'INSERT INTO "Booking" (..., "activeSlotId", ...) VALUES (..., slot_id, ...) ON CONFLICT ("activeSlotId") DO NOTHING RETURNING "id";'}</pre>
          <p className="mt-3 text-sm text-muted">PostgreSQL is the source of truth. Redis is not used to decide the winner.</p>
        </details>
      </Card>
    </div>
  );
}
