"use client";

import { api, login, logout, User } from "@/lib/api";
import { Button, Input } from "@playgrid/ui";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Bell, CalendarCheck, Dumbbell, Gauge, LogIn, LogOut, Menu, ShieldCheck, UserRound, X } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";

const nav = [
  { href: "/", label: "Dashboard", icon: Gauge },
  { href: "/facilities", label: "Facilities", icon: Dumbbell },
  { href: "/bookings", label: "Bookings", icon: CalendarCheck },
  { href: "/waitlist", label: "Waitlist", icon: ShieldCheck },
  { href: "/profile", label: "Profile", icon: UserRound },
  { href: "/manager", label: "Manager", icon: Gauge },
  { href: "/demo/race", label: "Race Demo", icon: ShieldCheck }
];

export function Shell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [signinOpen, setSigninOpen] = useState(false);
  const [email, setEmail] = useState("student@playgrid.demo");
  const [password, setPassword] = useState("PlayGrid123!");
  const me = useQuery({ queryKey: ["me"], queryFn: () => api<User>("/auth/me"), retry: false });
  const notifications = useQuery({ queryKey: ["notifications"], queryFn: () => api<{ unread: number; items: unknown[] }>("/notifications"), enabled: Boolean(me.data) });

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    await login(email, password);
    setSigninOpen(false);
    await qc.invalidateQueries();
  }

  async function signOut() {
    await logout();
    qc.setQueryData(["me"], null);
    qc.clear();
  }

  const links = (
    <nav className="flex flex-col gap-1 lg:flex-row lg:items-center">
      {nav.map((item) => {
        const Icon = item.icon;
        const active = pathname === item.href;
        if (item.href === "/manager" && me.data?.role !== "FACILITY_MANAGER" && me.data?.role !== "ADMIN") return null;
        return (
          <Link
            key={item.href}
            href={item.href}
            className={`flex items-center gap-2 rounded-lg px-3 py-2 text-sm font-semibold transition focus:outline-none focus:ring-2 focus:ring-playorange ${active ? "bg-playorange text-ink shadow-lg shadow-playorange/20" : "text-muted hover:bg-white/8 hover:text-white"}`}
            onClick={() => setOpen(false)}
          >
            <Icon className="h-4 w-4" />
            {item.label}
          </Link>
        );
      })}
    </nav>
  );

  return (
    <div className="min-h-screen">
      <header className="sticky top-0 z-40 border-b border-white/10 bg-ink/88 backdrop-blur-xl">
        <div className="mx-auto flex max-w-7xl items-center justify-between gap-5 px-4 py-3">
          <Link href="/" className="flex items-center gap-3 focus:outline-none focus:ring-2 focus:ring-playorange">
            <span className="grid h-10 w-10 shrink-0 place-items-center rounded-lg bg-purple text-lg font-black shadow-lg shadow-purple/30">PG</span>
            <span>
              <span className="block text-lg font-black tracking-wide">PLAYGRID</span>
              <span className="hidden text-xs text-muted sm:block">ClashProof campus booking</span>
            </span>
          </Link>
          <div className="hidden rounded-xl border border-white/10 bg-white/[0.04] p-1 lg:block">{links}</div>
          <div className="flex shrink-0 items-center gap-2">
            {me.data ? (
              <>
                <button aria-label="Notifications" className="relative rounded-lg p-2 text-muted hover:bg-white/10 hover:text-white">
                  <Bell className="h-5 w-5" />
                  {notifications.data?.unread ? <span className="absolute right-1 top-1 h-4 min-w-4 rounded-full bg-playorange px-1 text-[10px] font-bold text-ink">{notifications.data.unread}</span> : null}
                </button>
                <span className="hidden rounded-lg border border-white/10 bg-white/[0.04] px-3 py-2 text-right text-sm sm:block">
                  <span className="block max-w-36 truncate font-semibold">{me.data.name}</span>
                  <span className="block text-xs text-muted">{me.data.role.replace("_", " ").toLowerCase()}</span>
                </span>
                <Button variant="ghost" size="icon" aria-label="Sign out" onClick={signOut}>
                  <LogOut className="h-4 w-4" />
                </Button>
              </>
            ) : (
              <Button size="sm" onClick={() => setSigninOpen(true)}><LogIn className="h-4 w-4" />Sign in</Button>
            )}
            <Button variant="ghost" size="icon" aria-label="Menu" className="lg:hidden" onClick={() => setOpen((v) => !v)}>
              {open ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
            </Button>
          </div>
        </div>
        {open ? <div className="border-t border-white/10 px-4 py-3 lg:hidden">{links}</div> : null}
      </header>
      {signinOpen ? (
        <div className="fixed inset-0 z-50 grid place-items-center bg-black/70 px-4 backdrop-blur-sm" role="dialog" aria-modal="true" aria-label="Sign in">
          <form onSubmit={submit} className="w-full max-w-md rounded-lg border border-white/10 bg-[#11101A] p-6 shadow-2xl shadow-black/40">
            <div className="mb-5 flex items-start justify-between gap-4">
              <div>
                <h2 className="text-2xl font-black">Sign in</h2>
                <p className="mt-1 text-sm text-muted">Use a demo account to explore student or manager workflows.</p>
              </div>
              <Button type="button" variant="ghost" size="icon" aria-label="Close sign in" onClick={() => setSigninOpen(false)}>
                <X className="h-5 w-5" />
              </Button>
            </div>
            <div className="space-y-3">
              <Input aria-label="Email" value={email} onChange={(e: React.ChangeEvent<HTMLInputElement>) => setEmail(e.target.value)} />
              <Input aria-label="Password" type="password" value={password} onChange={(e: React.ChangeEvent<HTMLInputElement>) => setPassword(e.target.value)} />
              <Button className="w-full">Sign in</Button>
            </div>
            <div className="mt-5 grid gap-2 text-sm">
              {[
                ["Student", "student@playgrid.demo"],
                ["Manager", "manager@playgrid.demo"],
                ["Admin", "admin@playgrid.demo"]
              ].map(([label, demoEmail]) => (
                <button key={demoEmail} type="button" className="flex items-center justify-between rounded-lg bg-white/7 px-3 py-2 text-left hover:bg-white/12" onClick={() => setEmail(demoEmail)}>
                  <span className="font-semibold">{label}</span>
                  <span className="text-muted">{demoEmail}</span>
                </button>
              ))}
            </div>
          </form>
        </div>
      ) : null}
      <main className="mx-auto max-w-7xl px-4 py-8">{children}</main>
    </div>
  );
}
