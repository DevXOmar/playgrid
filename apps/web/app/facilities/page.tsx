"use client";

import { api } from "@/lib/api";
import { Button, Card, Input, Select } from "@playgrid/ui";
import { useQuery } from "@tanstack/react-query";
import { Filter, MapPin } from "lucide-react";
import Image from "next/image";
import Link from "next/link";
import { useMemo, useState } from "react";

type Facility = { id: string; name: string; sport: string; location: string; imageUrl: string; status: string; currentAvailability: boolean; openHour: number; closeHour: number; indoor: boolean; amenities: string[]; capacity?: number };

export default function FacilitiesPage() {
  const [sport, setSport] = useState("All");
  const [indoor, setIndoor] = useState("any");
  const [availableNow, setAvailableNow] = useState(false);
  const qs = useMemo(() => new URLSearchParams({ ...(sport !== "All" ? { sport } : {}), ...(indoor !== "any" ? { indoor: String(indoor === "indoor") } : {}), ...(availableNow ? { availableNow: "true" } : {}) }).toString(), [sport, indoor, availableNow]);
  const facilities = useQuery({ queryKey: ["facilities", qs], queryFn: () => api<Facility[]>(`/facilities?${qs}`) });

  return (
    <div className="space-y-6">
      <div className="flex flex-col justify-between gap-4 md:flex-row md:items-end">
        <div>
          <p className="text-sm font-bold text-playorange">Facility discovery</p>
          <h1 className="text-4xl font-black">Find your court</h1>
        </div>
        <Card className="grid gap-3 p-3 sm:grid-cols-4">
          <Select aria-label="Sport filter" value={sport} onChange={(e: React.ChangeEvent<HTMLSelectElement>) => setSport(e.target.value)}>
            {["All", "Badminton", "Tennis", "Basketball", "Football", "Cricket", "Gymnasium"].map((s) => <option key={s}>{s}</option>)}
          </Select>
          <Input aria-label="Date" type="date" />
          <Input aria-label="Time" type="time" />
          <Select aria-label="Indoor outdoor filter" value={indoor} onChange={(e: React.ChangeEvent<HTMLSelectElement>) => setIndoor(e.target.value)}>
            <option value="any">Indoor / outdoor</option>
            <option value="indoor">Indoor</option>
            <option value="outdoor">Outdoor</option>
          </Select>
          <Button type="button" variant={availableNow ? "orange" : "secondary"} className="sm:col-span-4" onClick={() => setAvailableNow((v) => !v)}>
            <Filter className="h-4 w-4" /> Available now
          </Button>
        </Card>
      </div>
      <div className="grid gap-5 md:grid-cols-2 xl:grid-cols-3">
        {facilities.data?.map((facility) => (
          <Link key={facility.id} href={`/facilities/${facility.id}`} className="group overflow-hidden rounded-lg border border-white/10 bg-white/[0.06] transition hover:border-purple/60">
            <div className="relative h-56">
              <Image src={facility.imageUrl} alt="" fill sizes="(min-width: 1280px) 33vw, (min-width: 768px) 50vw, 100vw" className="object-cover transition duration-500 group-hover:scale-105" />
              <span className={`absolute left-4 top-4 rounded-full px-3 py-1 text-xs font-black ${facility.currentAvailability ? "bg-green-400 text-ink" : "bg-white/85 text-ink"}`}>
                {facility.currentAvailability ? "Open slots" : facility.status}
              </span>
            </div>
            <div className="p-5">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <p className="text-sm font-bold text-playorange">{facility.sport}</p>
                  <h2 className="text-2xl font-black">{facility.name}</h2>
                </div>
                <span className="rounded-lg bg-white/8 px-3 py-2 text-xs font-bold">{facility.indoor ? "Indoor" : "Outdoor"}</span>
              </div>
              <p className="mt-3 flex items-center gap-2 text-sm text-muted"><MapPin className="h-4 w-4" />{facility.location}</p>
              <p className="mt-2 text-sm text-muted">{facility.openHour}:00 - {facility.closeHour}:00 · Capacity {facility.capacity ?? "flex"}</p>
              <div className="mt-4 flex flex-wrap gap-2">
                {facility.amenities.slice(0, 3).map((a) => <span key={a} className="rounded-full bg-white/8 px-3 py-1 text-xs text-muted">{a}</span>)}
              </div>
            </div>
          </Link>
        ))}
      </div>
    </div>
  );
}
