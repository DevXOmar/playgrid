export type CandidateSlot = {
  id: string;
  facilityId: string;
  sport: string;
  startsAt: Date;
};

export function rankAlternatives(requested: CandidateSlot, candidates: CandidateSlot[]) {
  return candidates
    .map((slot) => {
      let rank = 99;
      if (slot.sport === requested.sport && slot.startsAt.getTime() === requested.startsAt.getTime()) rank = 1;
      else if (slot.facilityId === requested.facilityId) rank = 2;
      else if (slot.sport === requested.sport && Math.abs(slot.startsAt.getTime() - requested.startsAt.getTime()) <= 60 * 60_000) rank = 3;
      return { slot, rank };
    })
    .filter((x) => x.rank < 99)
    .sort((a, b) => a.rank - b.rank || Math.abs(a.slot.startsAt.getTime() - requested.startsAt.getTime()) - Math.abs(b.slot.startsAt.getTime() - requested.startsAt.getTime()));
}

export function assertPolicy(input: { active: number; weeklySport: number; maxActive: number; maxWeekly: number }) {
  if (input.active >= input.maxActive) return { ok: false, code: "MAX_ACTIVE_BOOKINGS" };
  if (input.weeklySport >= input.maxWeekly) return { ok: false, code: "WEEKLY_LIMIT" };
  return { ok: true, code: "OK" };
}

export function rankWaitlist<T extends { createdAt: Date; priority?: number }>(entries: T[]) {
  return [...entries].sort((a, b) => (b.priority ?? 0) - (a.priority ?? 0) || a.createdAt.getTime() - b.createdAt.getTime());
}
