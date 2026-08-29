"use client";

import { api, formatSlot } from "@/lib/api";
import { Button, Card } from "@playgrid/ui";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ListOrdered, X } from "lucide-react";
import Link from "next/link";

type Wait = { id: string; status: string; position: number; slot: { startsAt: string; endsAt: string; facility: { id: string; name: string; sport: string } } };

export default function WaitlistPage() {
  const qc = useQueryClient();
  const waitlists = useQuery({ queryKey: ["waitlists"], queryFn: () => api<Wait[]>("/waitlist/me"), retry: false });
  const cancel = useMutation({ mutationFn: (id: string) => api(`/waitlist/${id}`, { method: "DELETE" }), onSuccess: () => qc.invalidateQueries({ queryKey: ["waitlists"] }) });

  return (
    <div className="space-y-6">
      <div>
        <p className="text-sm font-bold text-playorange">My waitlists</p>
        <h1 className="text-4xl font-black">Fair queue, automatic promotion</h1>
      </div>
      <div className="grid gap-4">
        {waitlists.data?.map((entry) => (
          <Card key={entry.id} className="grid gap-4 p-5 md:grid-cols-[1fr_auto] md:items-center">
            <div>
              <span className="mb-3 inline-flex items-center gap-2 rounded-full bg-white/8 px-3 py-1 text-xs font-black"><ListOrdered className="h-4 w-4" />#{entry.position} · {entry.status}</span>
              <Link href={`/facilities/${entry.slot.facility.id}`} className="block text-2xl font-black hover:text-lavender">{entry.slot.facility.name}</Link>
              <p className="mt-1 text-muted">{entry.slot.facility.sport} · {formatSlot(entry.slot.startsAt, entry.slot.endsAt)}</p>
            </div>
            {entry.status === "WAITING" ? <Button variant="secondary" onClick={() => cancel.mutate(entry.id)}><X className="h-4 w-4" />Leave queue</Button> : null}
          </Card>
        ))}
        {!waitlists.data?.length ? <Card className="p-8 text-muted">No waitlist entries. When a slot is taken, you can still stay in line.</Card> : null}
      </div>
    </div>
  );
}
