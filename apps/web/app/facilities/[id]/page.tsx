"use client";

import { api, formatSlot, todayIso } from "@/lib/api";
import { getSocket } from "@/lib/socket";
import { Button, Card, Input } from "@playgrid/ui";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { AlertTriangle, Calendar, CheckCircle2, Clock, Loader2, Plus, ShieldCheck, Sparkles, Users } from "lucide-react";
import Image from "next/image";
import { useParams } from "next/navigation";
import { useEffect, useState } from "react";

type Facility = { id: string; name: string; sport: string; location: string; description: string; imageUrl: string; amenities: string[]; openHour: number; closeHour: number; status: string; policies: { maxActiveBookings: number; maxSportBookingsPerWeek: number; cancellationCutoffMinutes: number }[] };
type Slot = { id: string; startsAt: string; endsAt: string; status: string; state: string; waitlistCount: number };
type Alternative = { reason: string; slot: Slot & { facility: Facility } };

export default function FacilityDetailPage() {
  const params = useParams<{ id: string }>();
  const id = params.id;
  const qc = useQueryClient();
  const [date, setDate] = useState(todayIso());
  const [selected, setSelected] = useState<Slot | null>(null);
  const [conflict, setConflict] = useState<{ message: string; alternatives?: Alternative[] } | null>(null);
  const facility = useQuery({ queryKey: ["facility", id], queryFn: () => api<Facility>(`/facilities/${id}`) });
  const slots = useQuery({ queryKey: ["slots", id, date], queryFn: () => api<Slot[]>(`/facilities/${id}/slots?date=${date}`), staleTime: 3_000 });

  useEffect(() => {
    const socket = getSocket();
    const onSlotUpdate = () => qc.invalidateQueries({ queryKey: ["slots", id, date] });
    socket.on("slot:update", onSlotUpdate);
    return () => {
      socket.off("slot:update", onSlotUpdate);
    };
  }, [qc, id, date]);

  const book = useMutation({
    mutationFn: (slotId: string) =>
      api<{ message: string; alternatives?: Alternative[] }>("/bookings", {
        method: "POST",
        headers: { "Idempotency-Key": crypto.randomUUID() },
        body: JSON.stringify({ slotId })
      }),
    onSuccess: async () => {
      setConflict(null);
      setSelected(null);
      await Promise.all([qc.invalidateQueries({ queryKey: ["slots", id, date] }), qc.invalidateQueries({ queryKey: ["bookings"] })]);
    },
    onError: (error: Error & { data?: { message?: string; alternatives?: Alternative[] } }) => {
      setConflict({ message: error.data?.message ?? "Someone just secured this slot.", alternatives: error.data?.alternatives });
      qc.invalidateQueries({ queryKey: ["slots", id, date] });
    }
  });

  const joinWaitlist = useMutation({
    mutationFn: (slotId: string) => api("/waitlist", { method: "POST", body: JSON.stringify({ slotId }) }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["waitlists"] })
  });

  const stateStyle: Record<string, string> = {
    AVAILABLE: "border-green-400/50 bg-green-400/10 text-green-100",
    BOOKED: "border-playorange/40 bg-playorange/10 text-orange-100",
    WAITLIST_AVAILABLE: "border-playorange/40 bg-playorange/10 text-orange-100",
    MAINTENANCE: "border-white/10 bg-white/8 text-muted",
    CLOSED: "border-white/10 bg-black/20 text-muted",
    SELECTED: "border-purple bg-purple/25 text-white"
  };

  return (
    <div className="space-y-6">
      {facility.data ? (
        <section className="grid gap-6 lg:grid-cols-[0.9fr_1.1fr]">
          <div className="relative min-h-80 overflow-hidden rounded-lg border border-white/10">
            <Image src={facility.data.imageUrl} alt="" fill sizes="(min-width: 1024px) 45vw, 100vw" className="object-cover" priority />
          </div>
          <div className="flex flex-col justify-center">
            <p className="text-sm font-bold text-playorange">{facility.data.sport}</p>
            <h1 className="mt-2 text-5xl font-black">{facility.data.name}</h1>
            <p className="mt-4 max-w-2xl text-lg text-muted">{facility.data.description}</p>
            <div className="mt-6 flex flex-wrap gap-2">
              {facility.data.amenities.map((a) => <span key={a} className="rounded-full bg-white/8 px-3 py-1 text-sm text-muted">{a}</span>)}
            </div>
            <div className="mt-6 grid gap-3 sm:grid-cols-3">
              <Card className="p-4"><Clock className="mb-2 h-5 w-5 text-playorange" />{facility.data.openHour}:00 - {facility.data.closeHour}:00</Card>
              <Card className="p-4"><ShieldCheck className="mb-2 h-5 w-5 text-playorange" />{facility.data.status}</Card>
              <Card className="p-4"><Users className="mb-2 h-5 w-5 text-playorange" />FIFO waitlist</Card>
            </div>
          </div>
        </section>
      ) : null}

      <section className="grid gap-6 lg:grid-cols-[1fr_22rem]">
        <Card className="p-5">
          <div className="mb-5 flex flex-col justify-between gap-3 sm:flex-row sm:items-center">
            <div>
              <h2 className="text-2xl font-black">Slots</h2>
              <p className="text-sm text-muted">Every visible slot is backed by the database booking invariant.</p>
            </div>
            <Input aria-label="Slot date" type="date" value={date} onChange={(e: React.ChangeEvent<HTMLInputElement>) => setDate(e.target.value)} className="w-full sm:w-44" />
          </div>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            {slots.data?.map((slot) => {
              const state = selected?.id === slot.id ? "SELECTED" : slot.state;
              const canBook = slot.state === "AVAILABLE";
              return (
                <button
                  key={slot.id}
                  className={`slot rounded-lg border p-4 text-left transition focus:outline-none focus:ring-2 focus:ring-playorange ${stateStyle[state]}`}
                  onClick={() => (canBook ? setSelected(slot) : setSelected(slot))}
                  aria-label={`${formatSlot(slot.startsAt, slot.endsAt)} ${slot.state}`}
                >
                  <span className="block text-lg font-black">{new Date(slot.startsAt).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })}</span>
                  <span className="mt-1 block text-xs font-bold">{slot.state.replace("_", " ")}</span>
                  {slot.waitlistCount ? <span className="mt-2 block text-xs">{slot.waitlistCount} waiting</span> : null}
                </button>
              );
            })}
          </div>
        </Card>

        <aside className="space-y-4">
          <Card className="p-5">
            <h2 className="text-xl font-black">Booking rules</h2>
            <ul className="mt-4 space-y-3 text-sm text-muted">
              <li>Max active bookings: {facility.data?.policies[0]?.maxActiveBookings ?? 3}</li>
              <li>Weekly sport limit: {facility.data?.policies[0]?.maxSportBookingsPerWeek ?? 3}</li>
              <li>Cancellation cutoff: {facility.data?.policies[0]?.cancellationCutoffMinutes ?? 30} minutes</li>
            </ul>
          </Card>
          {selected ? (
            <Card className="p-5">
              <p className="text-sm font-bold text-playorange">Confirm slot</p>
              <h3 className="mt-2 text-xl font-black">{formatSlot(selected.startsAt, selected.endsAt)}</h3>
              {selected.state === "AVAILABLE" ? (
                <Button className="mt-5 w-full" disabled={book.isPending} onClick={() => book.mutate(selected.id)}>
                  {book.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle2 className="h-4 w-4" />}
                  Confirm booking
                </Button>
              ) : (
                <Button className="mt-5 w-full" variant="orange" disabled={joinWaitlist.isPending} onClick={() => joinWaitlist.mutate(selected.id)}>
                  <Plus className="h-4 w-4" /> Join waitlist
                </Button>
              )}
            </Card>
          ) : null}
          {book.isSuccess ? (
            <Card className="border-green-400/40 p-5">
              <CheckCircle2 className="mb-3 h-8 w-8 text-green-300" />
              <p className="font-black">You're in. Court confirmed.</p>
            </Card>
          ) : null}
          {conflict ? (
            <Card className="border-playorange/40 p-5">
              <AlertTriangle className="mb-3 h-8 w-8 text-playorange" />
              <p className="font-black">{conflict.message}</p>
              <p className="mt-2 text-sm text-muted">This hour is packed. Here are the closest available options.</p>
              <div className="mt-4 space-y-2">
                {conflict.alternatives?.map((alt) => (
                  <a key={alt.slot.id} href={`/facilities/${alt.slot.facility.id}`} className="block rounded-lg bg-white/8 p-3 text-sm hover:bg-white/12">
                    <span className="block font-bold">{alt.slot.facility.name}</span>
                    <span className="text-muted">{alt.reason} · {formatSlot(alt.slot.startsAt, alt.slot.endsAt)}</span>
                  </a>
                ))}
              </div>
              {selected ? <Button className="mt-4 w-full" variant="orange" onClick={() => joinWaitlist.mutate(selected.id)}><Sparkles className="h-4 w-4" />Join waitlist</Button> : null}
            </Card>
          ) : null}
        </aside>
      </section>
    </div>
  );
}
