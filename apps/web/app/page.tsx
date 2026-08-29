"use client";

import { api, formatSlot } from "@/lib/api";
import { Button, Card } from "@playgrid/ui";
import { useQuery } from "@tanstack/react-query";
import { motion } from "framer-motion";
import { ArrowRight, CalendarCheck, Flame, ShieldCheck, Trophy, Users } from "lucide-react";
import Image from "next/image";
import Link from "next/link";

type Facility = { id: string; name: string; sport: string; location: string; imageUrl: string; currentAvailability: boolean; slots: Slot[] };
type Slot = { id: string; startsAt: string; endsAt: string; facility?: Facility };
type Booking = { id: string; status: string; slot: Slot & { facility: Facility } };
type Wait = { id: string; status: string; position: number; slot: Slot & { facility: Facility } };

export default function Dashboard() {
  const facilities = useQuery({ queryKey: ["facilities"], queryFn: () => api<Facility[]>("/facilities") });
  const bookings = useQuery({ queryKey: ["bookings"], queryFn: () => api<Booking[]>("/bookings/me"), retry: false });
  const waitlists = useQuery({ queryKey: ["waitlists"], queryFn: () => api<Wait[]>("/waitlist/me"), retry: false });
  const upcoming = bookings.data?.find((b) => ["CONFIRMED", "CHECKED_IN"].includes(b.status));
  const recommended = facilities.data?.flatMap((f) => f.slots.filter((s) => !("activeBooking" in s)).slice(0, 1).map((s) => ({ ...s, facility: f }))).slice(0, 4) ?? [];

  return (
    <div className="space-y-10">
      <section className="grid min-h-[72vh] items-center gap-8 lg:grid-cols-[1.1fr_0.9fr]">
        <div>
          <motion.p initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} className="mb-4 inline-flex rounded-full border border-playorange/40 bg-playorange/10 px-4 py-2 text-sm font-semibold text-playorange">
            IIT Guwahati PLAYHACK prototype
          </motion.p>
          <motion.h1 initial={{ opacity: 0, y: 18 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.05 }} className="max-w-4xl text-5xl font-black leading-[0.95] sm:text-7xl lg:text-8xl">
            ONE COURT.
            <br />
            100 REQUESTS.
            <br />
            ONE WINNER.
          </motion.h1>
          <p className="mt-6 max-w-2xl text-lg text-muted sm:text-xl">Campus sports booking that stays correct when everyone clicks “Book” at once.</p>
          <div className="mt-8 flex flex-wrap gap-3">
            <Button asChild size="lg">
              <Link href="/facilities"><CalendarCheck className="h-5 w-5" />Book a Facility</Link>
            </Button>
            <Button asChild size="lg" variant="orange">
              <Link href="/demo/race"><ShieldCheck className="h-5 w-5" />Run Race Demo</Link>
            </Button>
          </div>
        </div>
        <Card className="p-5">
          <div className="rounded-lg bg-[#0C0B12] p-5">
            <div className="mb-6 flex items-center justify-between">
              <span className="text-sm font-semibold text-muted">Live contention visual</span>
              <span className="rounded-full bg-green-400/15 px-3 py-1 text-xs font-bold text-green-300">Integrity enforced</span>
            </div>
            <div className="grid gap-4">
              <div className="grid grid-cols-10 gap-2">
                {Array.from({ length: 50 }).map((_, i) => (
                  <motion.span key={i} animate={{ opacity: [0.35, 1, 0.35], y: [0, -4, 0] }} transition={{ duration: 1.4, repeat: Infinity, delay: i * 0.02 }} className="h-3 rounded-full bg-purple" />
                ))}
              </div>
              <div className="flex items-center justify-between gap-3">
                <div className="h-px flex-1 bg-white/12" />
                <div className="rounded-lg border border-purple/40 bg-purple/20 px-5 py-4 text-center">
                  <ShieldCheck className="mx-auto mb-2 h-7 w-7 text-lavender" />
                  <span className="font-black">ClashProof Engine</span>
                </div>
                <ArrowRight className="h-6 w-6 text-playorange" />
                <div className="rounded-lg bg-playorange px-5 py-4 text-center font-black text-ink">1 confirmed</div>
              </div>
              <p className="text-sm text-muted">PostgreSQL unique constraints decide the winner. Redis can disappear and the booking invariant still holds.</p>
            </div>
          </div>
        </Card>
      </section>

      <section className="grid gap-4 md:grid-cols-4">
        {[
          ["Discover", "Find open courts by sport, time, location, and indoor/outdoor status.", Users],
          ["Reserve", "Atomic booking with idempotency and race-aware conflict handling.", ShieldCheck],
          ["Resolve", "Alternatives and FIFO waitlists turn conflicts into next-best options.", Flame],
          ["Manage", "Facility policies, maintenance, analytics, and check-ins from real data.", Trophy]
        ].map(([title, copy, Icon]) => (
          <Card key={title as string} className="p-5">
            <Icon className="mb-5 h-7 w-7 text-playorange" />
            <h2 className="text-xl font-black">{title as string}</h2>
            <p className="mt-2 text-sm leading-6 text-muted">{copy as string}</p>
          </Card>
        ))}
      </section>

      <section className="grid gap-5 lg:grid-cols-3">
        <Card className="p-5 lg:col-span-1">
          <h2 className="text-2xl font-black">Today</h2>
          {upcoming ? (
            <div className="mt-5 rounded-lg bg-white/8 p-4">
              <p className="font-bold">{upcoming.slot.facility.name}</p>
              <p className="mt-1 text-sm text-muted">{formatSlot(upcoming.slot.startsAt, upcoming.slot.endsAt)}</p>
            </div>
          ) : (
            <p className="mt-5 text-muted">No active booking yet. Prime time is still in play.</p>
          )}
          <div className="mt-5 flex items-center gap-3 text-sm text-muted">
            <Flame className="h-5 w-5 text-playorange" />
            Booking streak: {bookings.data?.length ?? 0} campus sessions tracked
          </div>
        </Card>
        <Card className="p-5 lg:col-span-2">
          <div className="mb-5 flex items-center justify-between">
            <h2 className="text-2xl font-black">Recommended open slots</h2>
            <Button asChild variant="secondary" size="sm"><Link href="/facilities">View all</Link></Button>
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            {recommended.map((slot) => (
              <Link key={slot.id} href={`/facilities/${slot.facility.id}`} className="rounded-lg border border-white/10 bg-white/7 p-4 transition hover:border-purple/60">
                <p className="font-bold">{slot.facility.name}</p>
                <p className="text-sm text-muted">{slot.facility.sport} · {formatSlot(slot.startsAt, slot.endsAt)}</p>
              </Link>
            ))}
          </div>
        </Card>
      </section>

      <section>
        <h2 className="mb-5 text-3xl font-black">Featured facilities</h2>
        <div className="grid gap-5 md:grid-cols-3">
          {facilities.data?.slice(0, 3).map((facility) => (
            <Link key={facility.id} href={`/facilities/${facility.id}`} className="group overflow-hidden rounded-lg border border-white/10 bg-white/[0.06]">
              <div className="relative h-48">
                <Image src={facility.imageUrl} alt="" fill sizes="(min-width: 768px) 33vw, 100vw" className="object-cover transition duration-500 group-hover:scale-105" />
              </div>
              <div className="p-5">
                <p className="text-sm font-bold text-playorange">{facility.sport}</p>
                <h3 className="mt-1 text-xl font-black">{facility.name}</h3>
                <p className="mt-1 text-sm text-muted">{facility.location}</p>
              </div>
            </Link>
          ))}
        </div>
      </section>
    </div>
  );
}
