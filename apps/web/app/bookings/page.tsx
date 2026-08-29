"use client";

import { api, formatSlot } from "@/lib/api";
import { Button, Card } from "@playgrid/ui";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { CalendarX, CheckCircle2, QrCode } from "lucide-react";
import Link from "next/link";

type Booking = { id: string; status: string; qrCode: string; slot: { startsAt: string; endsAt: string; facility: { id: string; name: string; sport: string; location: string } }; checkIn?: unknown };

export default function BookingsPage() {
  const qc = useQueryClient();
  const bookings = useQuery({ queryKey: ["bookings"], queryFn: () => api<Booking[]>("/bookings/me"), retry: false });
  const cancel = useMutation({
    mutationFn: (id: string) => api(`/bookings/${id}`, { method: "DELETE" }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["bookings"] })
  });

  return (
    <div className="space-y-6">
      <div>
        <p className="text-sm font-bold text-playorange">My bookings</p>
        <h1 className="text-4xl font-black">Confirmed courts and history</h1>
      </div>
      <div className="grid gap-4">
        {bookings.data?.map((booking) => (
          <Card key={booking.id} className="grid gap-4 p-5 md:grid-cols-[1fr_auto] md:items-center">
            <div>
              <div className="mb-2 flex flex-wrap items-center gap-2">
                <span className="rounded-full bg-purple/20 px-3 py-1 text-xs font-black text-lavender">{booking.status.replace("_", " ")}</span>
                <span className="text-sm text-muted">{booking.slot.facility.sport}</span>
              </div>
              <Link href={`/facilities/${booking.slot.facility.id}`} className="text-2xl font-black hover:text-lavender">{booking.slot.facility.name}</Link>
              <p className="mt-1 text-muted">{formatSlot(booking.slot.startsAt, booking.slot.endsAt)} · {booking.slot.facility.location}</p>
              <p className="mt-3 inline-flex items-center gap-2 rounded-lg bg-white/8 px-3 py-2 text-sm"><QrCode className="h-4 w-4" />{booking.qrCode.slice(0, 8).toUpperCase()}</p>
            </div>
            <div className="flex gap-2">
              {booking.status === "CONFIRMED" ? (
                <Button variant="danger" onClick={() => cancel.mutate(booking.id)} disabled={cancel.isPending}>
                  <CalendarX className="h-4 w-4" />Cancel
                </Button>
              ) : (
                <Button variant="secondary" disabled><CheckCircle2 className="h-4 w-4" />Closed</Button>
              )}
            </div>
          </Card>
        ))}
        {!bookings.data?.length ? <Card className="p-8 text-muted">No bookings yet. The next court is one click away.</Card> : null}
      </div>
    </div>
  );
}
