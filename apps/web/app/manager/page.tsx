"use client";

import { api, formatSlot } from "@/lib/api";
import { Button, Card, Input, Select } from "@playgrid/ui";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Activity, CalendarClock, CheckCircle2, Construction, Dumbbell, Users } from "lucide-react";
import { Bar, BarChart, CartesianGrid, Cell, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { useState } from "react";

type Facility = { id: string; name: string; sport: string; status: string };
type Booking = { id: string; status: string; user: { name: string }; slot: { startsAt: string; endsAt: string; facility: Facility } };
type Dashboard = { bookings: number; facilities: number; waitlisted: number; cancellations: number; noShows: number };
type Analytics = { utilization: number; bySport: { sport: string; count: number }[]; byHour: { hour: string; count: number }[]; noShowRate: number; cancellationRate: number };

export default function ManagerPage() {
  const qc = useQueryClient();
  const [facilityId, setFacilityId] = useState("");
  const [reason, setReason] = useState("Surface inspection");
  const dashboard = useQuery({ queryKey: ["manager-dashboard"], queryFn: () => api<Dashboard>("/manager/dashboard"), retry: false });
  const analytics = useQuery({ queryKey: ["manager-analytics"], queryFn: () => api<Analytics>("/manager/analytics"), retry: false });
  const bookings = useQuery({ queryKey: ["manager-bookings"], queryFn: () => api<Booking[]>("/manager/bookings"), retry: false });
  const facilities = useQuery({ queryKey: ["facilities"], queryFn: () => api<Facility[]>("/facilities") });
  const maintenance = useMutation({
    mutationFn: () => {
      const start = new Date();
      start.setHours(start.getHours() + 2, 0, 0, 0);
      const end = new Date(start.getTime() + 60 * 60_000);
      return api("/manager/maintenance", { method: "POST", body: JSON.stringify({ facilityId, startsAt: start.toISOString(), endsAt: end.toISOString(), reason }) });
    },
    onSuccess: () => qc.invalidateQueries()
  });
  const facilityStatus = useMutation({
    mutationFn: ({ id, status }: { id: string; status: string }) => api(`/manager/facilities/${id}`, { method: "PATCH", body: JSON.stringify({ status }) }),
    onSuccess: () => qc.invalidateQueries()
  });
  const bookingStatus = useMutation({
    mutationFn: ({ id, status }: { id: string; status: string }) => api(`/bookings/${id}/status`, { method: "PATCH", body: JSON.stringify({ status }) }),
    onSuccess: () => qc.invalidateQueries()
  });

  const stats = [
    ["Today's bookings", dashboard.data?.bookings ?? 0, CalendarClock],
    ["Active facilities", dashboard.data?.facilities ?? 0, Dumbbell],
    ["Waitlisted students", dashboard.data?.waitlisted ?? 0, Users],
    ["No-shows today", dashboard.data?.noShows ?? 0, Activity]
  ] as const;

  return (
    <div className="space-y-8">
      <div>
        <p className="text-sm font-bold text-playorange">Facility manager</p>
        <h1 className="text-4xl font-black">Operations command center</h1>
      </div>
      <section className="grid gap-4 md:grid-cols-4">
        {stats.map(([label, value, Icon]) => (
          <Card key={label} className="p-5">
            <Icon className="mb-4 h-7 w-7 text-playorange" />
            <p className="text-4xl font-black">{value}</p>
            <p className="text-sm text-muted">{label}</p>
          </Card>
        ))}
      </section>

      <section className="grid gap-5 lg:grid-cols-2">
        <Card className="p-5">
          <h2 className="mb-5 text-2xl font-black">Bookings by sport</h2>
          <div className="h-72">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={analytics.data?.bySport ?? []}>
                <CartesianGrid stroke="rgba(255,255,255,0.08)" />
                <XAxis dataKey="sport" stroke="#A6A3B2" />
                <YAxis stroke="#A6A3B2" />
                <Tooltip contentStyle={{ background: "#11101A", border: "1px solid rgba(255,255,255,.12)", color: "#fff" }} />
                <Bar dataKey="count" radius={[6, 6, 0, 0]}>
                  {(analytics.data?.bySport ?? []).map((_, index) => <Cell key={index} fill={index % 2 ? "#FF7A21" : "#7C5CFF"} />)}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        </Card>
        <Card className="p-5">
          <h2 className="mb-5 text-2xl font-black">Demand by hour</h2>
          <div className="h-72">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={analytics.data?.byHour ?? []}>
                <CartesianGrid stroke="rgba(255,255,255,0.08)" />
                <XAxis dataKey="hour" stroke="#A6A3B2" />
                <YAxis stroke="#A6A3B2" />
                <Tooltip contentStyle={{ background: "#11101A", border: "1px solid rgba(255,255,255,.12)", color: "#fff" }} />
                <Line type="monotone" dataKey="count" stroke="#FF7A21" strokeWidth={3} dot={{ fill: "#7C5CFF" }} />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </Card>
      </section>

      <section className="grid gap-5 lg:grid-cols-[1fr_1fr]">
        <Card className="p-5">
          <h2 className="text-2xl font-black">Facilities</h2>
          <div className="mt-5 space-y-3">
            {facilities.data?.map((facility) => (
              <div key={facility.id} className="flex flex-wrap items-center justify-between gap-3 rounded-lg bg-white/7 p-3">
                <div>
                  <p className="font-bold">{facility.name}</p>
                  <p className="text-sm text-muted">{facility.sport} · {facility.status}</p>
                </div>
                <div className="flex gap-2">
                  <Button size="sm" variant="secondary" onClick={() => facilityStatus.mutate({ id: facility.id, status: facility.status === "OPEN" ? "CLOSED" : "OPEN" })}>{facility.status === "OPEN" ? "Close" : "Open"}</Button>
                </div>
              </div>
            ))}
          </div>
        </Card>
        <Card className="p-5">
          <h2 className="text-2xl font-black">Create maintenance block</h2>
          <div className="mt-5 grid gap-3">
            <Select aria-label="Facility" value={facilityId} onChange={(e: React.ChangeEvent<HTMLSelectElement>) => setFacilityId(e.target.value)}>
              <option value="">Select facility</option>
              {facilities.data?.map((f) => <option value={f.id} key={f.id}>{f.name}</option>)}
            </Select>
            <Input aria-label="Reason" value={reason} onChange={(e: React.ChangeEvent<HTMLInputElement>) => setReason(e.target.value)} />
            <Button disabled={!facilityId || maintenance.isPending} onClick={() => maintenance.mutate()}><Construction className="h-4 w-4" />Block next open hour</Button>
          </div>
          <div className="mt-6 grid grid-cols-3 gap-3 text-center">
            <div className="rounded-lg bg-white/7 p-3"><p className="text-2xl font-black">{analytics.data?.utilization ?? 0}%</p><p className="text-xs text-muted">utilisation</p></div>
            <div className="rounded-lg bg-white/7 p-3"><p className="text-2xl font-black">{analytics.data?.cancellationRate ?? 0}%</p><p className="text-xs text-muted">cancel rate</p></div>
            <div className="rounded-lg bg-white/7 p-3"><p className="text-2xl font-black">{analytics.data?.noShowRate ?? 0}%</p><p className="text-xs text-muted">no-show</p></div>
          </div>
        </Card>
      </section>

      <Card className="p-5">
        <h2 className="text-2xl font-black">Bookings</h2>
        <div className="mt-5 overflow-x-auto">
          <table className="w-full min-w-[760px] text-left text-sm">
            <thead className="text-muted">
              <tr><th className="py-3">Student</th><th>Facility</th><th>Time</th><th>Status</th><th>Action</th></tr>
            </thead>
            <tbody>
              {bookings.data?.map((booking) => (
                <tr key={booking.id} className="border-t border-white/10">
                  <td className="py-3">{booking.user.name}</td>
                  <td>{booking.slot.facility.name}</td>
                  <td>{formatSlot(booking.slot.startsAt, booking.slot.endsAt)}</td>
                  <td>{booking.status}</td>
                  <td className="flex gap-2 py-2">
                    <Button size="sm" variant="secondary" onClick={() => bookingStatus.mutate({ id: booking.id, status: "CHECKED_IN" })}><CheckCircle2 className="h-4 w-4" />Check in</Button>
                    <Button size="sm" variant="secondary" onClick={() => bookingStatus.mutate({ id: booking.id, status: "NO_SHOW" })}>No-show</Button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  );
}
