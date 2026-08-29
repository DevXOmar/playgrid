export type UserRole = "STUDENT" | "FACILITY_MANAGER" | "ADMIN";
export type SlotState = "AVAILABLE" | "BOOKED" | "WAITLIST_AVAILABLE" | "MAINTENANCE" | "CLOSED";

export type ApiError = {
  code: string;
  message: string;
  details?: unknown;
};

export type RaceResult = {
  requests: number;
  successes: number;
  conflicts: number;
  databaseBookings: number;
  durationMs: number;
  integrity: "PASSED" | "FAILED";
  winner?: unknown;
};
