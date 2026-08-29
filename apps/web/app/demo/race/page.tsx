"use client";

import { api } from "@/lib/api";
import { Button, Card, Select } from "@playgrid/ui";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { motion } from "framer-motion";
import { Database, RotateCcw, Send, ShieldCheck, Trophy, XCircle } from "lucide-react";
import { useMemo, useState } from "react";

type Facility = { id: string; name: string; sport: string; slots: Slot[] };
type Slot = { id: string; startsAt: string; endsAt: string; state?: string };
type RaceResult = { requests: number; successes: number; conflicts: number; databaseBookings: number; durationMs: number; integrity: "PASSED" | "FAILED" };

export default function RaceDemoPage() {
  const qc = useQueryClient();
  const [facilityId, setFacilityId] = useState("");
  const [slotId, setSlotId] = useState("");
  const [requests, setRequests] = useState(100);
  const facilities = useQuery({ queryKey: ["facilities"], queryFn: () => api<Facility[]>("/facilities") });
  const selectedFacility = useMemo(() => facilities.data?.find((f) => f.id === facilityId) ?? facilities.data?.find((f) => f.name === "Badminton Court 1") ?? facilities.data?.[0], [facilities.data, facilityId]);
  const slots = useQuery({ queryKey: ["race-slots", selectedFacility?.id], queryFn: () => api<Slot[]>(`/facilities/${selectedFacility?.id}/slots`), enabled: Boolean(selectedFacility?.id) });
  const selectedSlot = slotId || slots.data?.find((s) => new Date(s.startsAt).getHours() === 18)?.id || slots.data?.[0]?.id || "";
  const run = useMutation({ mutationFn: () => api<RaceResult>("/demo/race", { method: "POST", body: JSON.stringify({ slotId: selectedSlot, requests }) }), onSuccess: () => qc.invalidateQueries() });
  const reset = useMutation({ mutationFn: () => api("/demo/race/reset", { method: "POST", body: JSON.stringify({ slotId: selectedSlot }) }), onSuccess: () => qc.invalidateQueries() });
  const result = run.data;

  return (
    <div className="space-y-8">
      <section className="grid gap-6 lg:grid-cols-[0.95fr_1.05fr] lg:items-center">
        <div>
          <p className="text-sm font-bold text-playorange">Race demo</p>
          <h1 className="mt-2 text-5xl font-black sm:text-7xl">THE 6:00 PM PROBLEM</h1>
          <p className="mt-5 max-w-2xl text-lg text-muted">Fire real concurrent booking requests at one facility slot. The database must return exactly one winner.</p>
        </div>
        <Card className="p-5">
          <div className="grid gap-3">
            <Select aria-label="Facility" value={selectedFacility?.id ?? ""} onChange={(e: React.ChangeEvent<HTMLSelectElement>) => { setFacilityId(e.target.value); setSlotId(""); }}>
              {facilities.data?.map((f) => <option value={f.id} key={f.id}>{f.name}</option>)}
            </Select>
            <Select aria-label="Slot" value={selectedSlot} onChange={(e: React.ChangeEvent<HTMLSelectElement>) => setSlotId(e.target.value)}>
              {slots.data?.map((slot) => <option value={slot.id} key={slot.id}>{new Date(slot.startsAt).toLocaleString()} · {slot.state}</option>)}
            </Select>
            <Select aria-label="Concurrent requests" value={requests} onChange={(e: React.ChangeEvent<HTMLSelectElement>) => setRequests(Number(e.target.value))}>
              {[10, 25, 50, 100].map((n) => <option value={n} key={n}>{n} concurrent requests</option>)}
            </Select>
            <div className="grid gap-3 sm:grid-cols-2">
              <Button size="lg" disabled={!selectedSlot || run.isPending} onClick={() => run.mutate()}><Send className="h-5 w-5" />Run race</Button>
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
                <motion.span key={i} animate={run.isPending ? { x: [0, 24, 0], opacity: [0.35, 1, 0.35] } : {}} transition={{ repeat: Infinity, duration: 1, delay: i * 0.01 }} className="h-3 rounded-full bg-purple" />
              ))}
            </div>
          </div>
          <Send className="mx-auto h-8 w-8 text-playorange" />
          <div className="rounded-lg border border-purple/40 bg-purple/15 p-6 text-center">
            <ShieldCheck className="mx-auto mb-3 h-10 w-10 text-lavender" />
            <p className="text-2xl font-black">BOOKING ENGINE</p>
            <p className="mt-2 text-sm text-muted">INSERT ON CONFLICT DO NOTHING RETURNING</p>
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
          ["Database bookings", result?.databaseBookings ?? 0],
          ["Execution duration", result ? `${result.durationMs}ms` : "0ms"]
        ].map(([label, value]) => (
          <Card key={label} className="p-5">
            <p className="text-3xl font-black">{value}</p>
            <p className="mt-1 text-sm text-muted">{label}</p>
          </Card>
        ))}
      </section>

      <Card className={`p-6 ${result?.integrity === "PASSED" ? "border-green-400/40" : result ? "border-red-400/40" : ""}`}>
        <div className="flex flex-wrap items-center gap-4">
          <Database className="h-8 w-8 text-playorange" />
          <div>
            <p className="text-2xl font-black">Database integrity {result?.integrity ?? "awaiting race"}</p>
            <p className="text-muted">Database integrity verified by counting active bookings for the selected slot after the concurrent requests complete.</p>
          </div>
        </div>
      </Card>
    </div>
  );
}
