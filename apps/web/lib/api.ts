import { apiBaseUrl } from "@playgrid/config";

export type User = { id: string; email: string; name: string; role: "STUDENT" | "FACILITY_MANAGER" | "ADMIN"; priority: number };

export function token() {
  if (typeof window === "undefined") return "";
  return localStorage.getItem("playgrid_token") ?? "";
}

export async function api<T>(path: string, options: RequestInit = {}): Promise<T> {
  const headers = new Headers(options.headers);
  headers.set("Content-Type", "application/json");
  const auth = token();
  if (auth) headers.set("Authorization", `Bearer ${auth}`);
  const res = await fetch(`${apiBaseUrl}${path}`, { ...options, headers, credentials: "include" });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const error = new Error(data.message ?? "Request failed") as Error & { status?: number; data?: unknown };
    error.status = res.status;
    error.data = data;
    throw error;
  }
  return data as T;
}

export async function login(email: string, password: string) {
  const data = await api<{ token: string; user: User }>("/auth/login", {
    method: "POST",
    body: JSON.stringify({ email, password })
  });
  localStorage.setItem("playgrid_token", data.token);
  return data;
}

export function logout() {
  localStorage.removeItem("playgrid_token");
}

export function formatSlot(start: string, end?: string) {
  const s = new Date(start);
  const e = end ? new Date(end) : new Date(s.getTime() + 60 * 60_000);
  return `${s.toLocaleDateString([], { weekday: "short", month: "short", day: "numeric" })} · ${s.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })} - ${e.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })}`;
}

export function todayIso() {
  return new Date().toISOString().slice(0, 10);
}
