"use client";

import { api } from "@/lib/api";
import { Card } from "@playgrid/ui";
import { useQuery } from "@tanstack/react-query";
import { Activity, CalendarCheck, ShieldAlert, UserRound } from "lucide-react";

type User = { name: string; email: string; role: string; priority: number };
type Booking = { status: string; slot: { facility: { sport: string } } };

export default function ProfilePage() {
  const me = useQuery({ queryKey: ["me"], queryFn: () => api<User>("/auth/me"), retry: false });
  const bookings = useQuery({ queryKey: ["bookings"], queryFn: () => api<Booking[]>("/bookings/me"), retry: false });
  const noShows = bookings.data?.filter((b) => b.status === "NO_SHOW").length ?? 0;
  const sports = Array.from(new Set(bookings.data?.map((b) => b.slot.facility.sport) ?? []));

  return (
    <div className="space-y-6">
      <div>
        <p className="text-sm font-bold text-playorange">Profile</p>
        <h1 className="text-4xl font-black">{me.data?.name ?? "Campus athlete"}</h1>
      </div>
      <div className="grid gap-5 md:grid-cols-4">
        <Card className="p-5 md:col-span-2">
          <UserRound className="mb-4 h-8 w-8 text-playorange" />
          <p className="text-2xl font-black">{me.data?.email}</p>
          <p className="mt-2 text-muted">{me.data?.role?.replace("_", " ")} · Priority score {me.data?.priority ?? 0}</p>
        </Card>
        <Card className="p-5">
          <CalendarCheck className="mb-4 h-8 w-8 text-playorange" />
          <p className="text-4xl font-black">{bookings.data?.length ?? 0}</p>
          <p className="text-muted">Bookings tracked</p>
        </Card>
        <Card className="p-5">
          <ShieldAlert className="mb-4 h-8 w-8 text-playorange" />
          <p className="text-4xl font-black">{noShows}</p>
          <p className="text-muted">No-shows in history</p>
        </Card>
      </div>
      <Card className="p-5">
        <div className="flex items-center gap-3">
          <Activity className="h-6 w-6 text-playorange" />
          <h2 className="text-2xl font-black">Recently used sports</h2>
        </div>
        <div className="mt-5 flex flex-wrap gap-2">
          {sports.map((sport) => <span key={sport} className="rounded-full bg-white/8 px-4 py-2 text-sm font-bold">{sport}</span>)}
          {!sports.length ? <p className="text-muted">No sports booked yet.</p> : null}
        </div>
        <p className="mt-5 text-sm text-muted">Transparency rule: 3 no-shows in 30 days creates a warning and reduced priority, never a hidden penalty.</p>
      </Card>
    </div>
  );
}
