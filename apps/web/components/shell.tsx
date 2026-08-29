"use client";

import { api, login, logout, User } from "@/lib/api";
import { Button, Input } from "@playgrid/ui";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Bell, CalendarCheck, Dumbbell, Gauge, LogOut, Menu, ShieldCheck, UserRound, X } from "lucide-react";
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
  const [email, setEmail] = useState("student@playgrid.demo");
  const [password, setPassword] = useState("PlayGrid123!");
  const me = useQuery({ queryKey: ["me"], queryFn: () => api<User>("/auth/me"), retry: false });
  const notifications = useQuery({ queryKey: ["notifications"], queryFn: () => api<{ unread: number; items: unknown[] }>("/notifications"), enabled: Boolean(me.data) });

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    await login(email, password);
    await qc.invalidateQueries();
  }

  function signOut() {
    logout();
    qc.clear();
  }

  const links = (
    <nav className="flex flex-col gap-1 lg:flex-row lg:items-center">
      {nav.map((item) => {
        const Icon = item.icon;
        const active = pathname === item.href;
        if (item.href === "/manager" && me.data?.role === "STUDENT") return null;
        return (
          <Link
            key={item.href}
            href={item.href}
            className={`flex items-center gap-2 rounded-lg px-3 py-2 text-sm transition focus:outline-none focus:ring-2 focus:ring-playorange ${active ? "bg-white/12 text-white" : "text-muted hover:bg-white/8 hover:text-white"}`}
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
      <header className="sticky top-0 z-40 border-b border-white/10 bg-ink/80 backdrop-blur-xl">
        <div className="mx-auto flex max-w-7xl items-center justify-between gap-4 px-4 py-3">
          <Link href="/" className="flex items-center gap-3 focus:outline-none focus:ring-2 focus:ring-playorange">
            <span className="grid h-10 w-10 place-items-center rounded-lg bg-purple text-lg font-black">PG</span>
            <span>
              <span className="block text-base font-black tracking-wide">PLAYGRID</span>
              <span className="block text-xs text-muted">One Court. 100 Requests. One Winner.</span>
            </span>
          </Link>
          <div className="hidden lg:block">{links}</div>
          <div className="flex items-center gap-2">
            {me.data ? (
              <>
                <button aria-label="Notifications" className="relative rounded-lg p-2 text-muted hover:bg-white/10 hover:text-white">
                  <Bell className="h-5 w-5" />
                  {notifications.data?.unread ? <span className="absolute right-1 top-1 h-4 min-w-4 rounded-full bg-playorange px-1 text-[10px] font-bold text-ink">{notifications.data.unread}</span> : null}
                </button>
                <span className="hidden text-right text-sm sm:block">
                  <span className="block font-semibold">{me.data.name}</span>
                  <span className="block text-xs text-muted">{me.data.role.replace("_", " ")}</span>
                </span>
                <Button variant="ghost" size="icon" aria-label="Sign out" onClick={signOut}>
                  <LogOut className="h-4 w-4" />
                </Button>
              </>
            ) : (
              <form onSubmit={submit} className="hidden items-center gap-2 md:flex">
                <Input aria-label="Email" value={email} onChange={(e: React.ChangeEvent<HTMLInputElement>) => setEmail(e.target.value)} className="w-52" />
                <Input aria-label="Password" type="password" value={password} onChange={(e: React.ChangeEvent<HTMLInputElement>) => setPassword(e.target.value)} className="w-36" />
                <Button size="sm">Sign in</Button>
              </form>
            )}
            <Button variant="ghost" size="icon" aria-label="Menu" className="lg:hidden" onClick={() => setOpen((v) => !v)}>
              {open ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
            </Button>
          </div>
        </div>
        {open ? <div className="border-t border-white/10 px-4 py-3 lg:hidden">{links}</div> : null}
        {!me.data ? (
          <form onSubmit={submit} className="grid gap-2 border-t border-white/10 px-4 py-3 md:hidden">
            <Input aria-label="Email" value={email} onChange={(e: React.ChangeEvent<HTMLInputElement>) => setEmail(e.target.value)} />
            <Input aria-label="Password" type="password" value={password} onChange={(e: React.ChangeEvent<HTMLInputElement>) => setPassword(e.target.value)} />
            <Button>Sign in</Button>
          </form>
        ) : null}
      </header>
      <main className="mx-auto max-w-7xl px-4 py-8">{children}</main>
    </div>
  );
}
