import { BadRequestException, ConflictException, Injectable, NotFoundException, OnModuleDestroy, OnModuleInit } from "@nestjs/common";
import { JwtService } from "@nestjs/jwt";
import { Prisma, PrismaClient, UserRole } from "@prisma/client";
import * as bcrypt from "bcryptjs";
import { Queue } from "bullmq";
import * as crypto from "crypto";
import { BookingGateway } from "./gateway";

const activeStatuses = ["CONFIRMED", "CHECKED_IN"] as const;
type Tx = Omit<PrismaClient, "$connect" | "$disconnect" | "$on" | "$transaction" | "$use" | "$extends">;

export class ApiConflict extends ConflictException {
  constructor(code: string, message: string, details?: unknown) {
    super({ code, message, details });
  }
}

@Injectable()
export class PrismaService extends PrismaClient implements OnModuleInit, OnModuleDestroy {
  async onModuleInit() {
    await this.$connect();
  }

  async onModuleDestroy() {
    await this.$disconnect();
  }
}

@Injectable()
export class AuthService {
  constructor(private readonly prisma: PrismaService, private readonly jwt: JwtService) {}

  async login(email: string, password: string) {
    const user = await this.prisma.user.findUnique({ where: { email } });
    if (!user || !(await bcrypt.compare(password, user.passwordHash))) {
      throw new BadRequestException({ code: "INVALID_CREDENTIALS", message: "That email or password does not match." });
    }
    const token = await this.jwt.signAsync({ sub: user.id, email: user.email, role: user.role, name: user.name });
    return { token, user: this.publicUser(user) };
  }

  async me(userId: string) {
    const user = await this.prisma.user.findUniqueOrThrow({ where: { id: userId } });
    return this.publicUser(user);
  }

  private publicUser(user: { id: string; email: string; name: string; role: UserRole; priority: number }) {
    return { id: user.id, email: user.email, name: user.name, role: user.role, priority: user.priority };
  }
}

@Injectable()
export class FacilitiesService {
  constructor(private readonly prisma: PrismaService) {}

  async list(query: Record<string, string | undefined>) {
    const where: Prisma.FacilityWhereInput = {};
    if (query.sport && query.sport !== "All") where.sport = query.sport;
    if (query.indoor === "true") where.indoor = true;
    if (query.availableNow === "true") where.status = "OPEN";
    const facilities = await this.prisma.facility.findMany({
      where,
      orderBy: [{ sport: "asc" }, { name: "asc" }],
      include: {
        slots: {
          where: { startsAt: { gte: new Date() } },
          take: 8,
          orderBy: { startsAt: "asc" },
          include: { activeBooking: true, waitlists: { where: { status: "WAITING" } } }
        }
      }
    });
    return facilities.map((facility) => ({
      ...facility,
      currentAvailability: facility.status === "OPEN" && facility.slots.some((slot) => slot.status === "AVAILABLE" && !slot.activeBooking)
    }));
  }

  async detail(id: string) {
    const facility = await this.prisma.facility.findUnique({
      where: { id },
      include: { policies: true, maintenance: { orderBy: { startsAt: "asc" } } }
    });
    if (!facility) throw new NotFoundException({ code: "FACILITY_NOT_FOUND", message: "That facility is not available." });
    return facility;
  }

  async slots(facilityId: string, date?: string) {
    const start = date ? new Date(`${date}T00:00:00.000Z`) : new Date();
    start.setUTCHours(0, 0, 0, 0);
    const end = new Date(start);
    end.setUTCDate(start.getUTCDate() + 1);
    const slots = await this.prisma.facilitySlot.findMany({
      where: { facilityId, startsAt: { gte: start, lt: end } },
      include: { activeBooking: { include: { user: true } }, waitlists: { where: { status: "WAITING" }, orderBy: { createdAt: "asc" } } },
      orderBy: { startsAt: "asc" }
    });
    return slots.map((slot) => ({
      ...slot,
      state: slot.status !== "AVAILABLE" ? slot.status : slot.activeBooking ? "BOOKED" : "AVAILABLE",
      waitlistCount: slot.waitlists.length
    }));
  }
}

@Injectable()
export class PoliciesService {
  constructor(private readonly prisma: PrismaService) {}

  async assertCanBook(userId: string, slotId: string, tx: Tx = this.prisma) {
    const slot = await tx.facilitySlot.findUnique({ where: { id: slotId }, include: { facility: { include: { policies: true } } } });
    if (!slot) throw new NotFoundException({ code: "SLOT_NOT_FOUND", message: "That time slot no longer exists." });
    if (slot.facility.status !== "OPEN") throw new ApiConflict("FACILITY_CLOSED", "This facility is currently closed.");
    if (slot.status === "MAINTENANCE") throw new ApiConflict("MAINTENANCE", "This slot is reserved for maintenance.");
    if (slot.status === "CLOSED") throw new ApiConflict("SLOT_CLOSED", "This slot is outside operating hours.");

    const policy =
      slot.facility.policies[0] ??
      (await tx.facilityPolicy.findFirst({ where: { OR: [{ sport: slot.facility.sport }, { facilityId: null, sport: null }] } }));
    const rules = policy ?? { maxActiveBookings: 2, maxSportBookingsPerWeek: 3, advanceWindowDays: 7, cancellationCutoffMinutes: 60 };
    const activeCount = await tx.booking.count({ where: { userId, activeSlotId: { not: null }, status: { in: [...activeStatuses] } } });
    if (activeCount >= rules.maxActiveBookings) {
      throw new ApiConflict("MAX_ACTIVE_BOOKINGS", `You have reached the active booking limit of ${rules.maxActiveBookings}.`);
    }

    const weekStart = new Date(slot.startsAt);
    weekStart.setUTCDate(weekStart.getUTCDate() - weekStart.getUTCDay());
    weekStart.setUTCHours(0, 0, 0, 0);
    const weekEnd = new Date(weekStart);
    weekEnd.setUTCDate(weekStart.getUTCDate() + 7);
    const weeklySportCount = await tx.booking.count({
      where: {
        userId,
        status: { in: [...activeStatuses, "CANCELLED", "NO_SHOW"] },
        slot: { startsAt: { gte: weekStart, lt: weekEnd }, facility: { sport: slot.facility.sport } }
      }
    });
    if (weeklySportCount >= rules.maxSportBookingsPerWeek) {
      throw new ApiConflict("WEEKLY_LIMIT", `You have reached the weekly limit of ${rules.maxSportBookingsPerWeek} ${slot.facility.sport.toLowerCase()} bookings.`);
    }

    const latest = new Date();
    latest.setUTCDate(latest.getUTCDate() + rules.advanceWindowDays);
    if (slot.startsAt > latest) {
      throw new ApiConflict("ADVANCE_WINDOW", `Bookings open ${rules.advanceWindowDays} days in advance.`);
    }
    return { slot, policy: rules };
  }

  async canCancel(bookingId: string, userId: string, tx: Tx = this.prisma) {
    const booking = await tx.booking.findUnique({
      where: { id: bookingId },
      include: { slot: { include: { facility: { include: { policies: true } } } } }
    });
    if (!booking || booking.userId !== userId) throw new NotFoundException({ code: "BOOKING_NOT_FOUND", message: "That booking was not found." });
    if (booking.status === "CANCELLED") throw new ApiConflict("BOOKING_ALREADY_CANCELLED", "This booking has already been cancelled.");
    const cutoff = booking.slot.facility.policies[0]?.cancellationCutoffMinutes ?? 60;
    if (booking.slot.startsAt.getTime() - Date.now() < cutoff * 60_000) {
      throw new ApiConflict("CANCELLATION_CUTOFF", `Bookings can be cancelled until ${cutoff} minutes before start time.`);
    }
    return booking;
  }

  async updatePolicy(data: Prisma.FacilityPolicyUpdateInput) {
    const existing = await this.prisma.facilityPolicy.findFirst({ where: { facilityId: null, sport: null } });
    if (!existing) return this.prisma.facilityPolicy.create({ data: data as Prisma.FacilityPolicyCreateInput });
    return this.prisma.facilityPolicy.update({ where: { id: existing.id }, data });
  }
}

@Injectable()
export class AlternativesService {
  constructor(private readonly prisma: PrismaService) {}

  async forSlot(slotId: string, tx: Tx = this.prisma) {
    const requested = await tx.facilitySlot.findUnique({ where: { id: slotId }, include: { facility: true } });
    if (!requested) return [];
    const hourBefore = new Date(requested.startsAt.getTime() - 60 * 60_000);
    const dayAfter = new Date(requested.startsAt.getTime() + 24 * 60 * 60_000);
    const candidates = await tx.facilitySlot.findMany({
      where: {
        id: { not: slotId },
        status: "AVAILABLE",
        startsAt: { gte: hourBefore, lt: dayAfter },
        activeBooking: null
      },
      include: { facility: true, waitlists: { where: { status: "WAITING" } } },
      take: 80
    });
    return candidates
      .map((slot) => {
        let rank = 5;
        if (slot.facility.sport === requested.facility.sport && slot.startsAt.getTime() === requested.startsAt.getTime()) rank = 1;
        else if (slot.facilityId === requested.facilityId) rank = 2;
        else if (slot.facility.sport === requested.facility.sport && Math.abs(slot.startsAt.getTime() - requested.startsAt.getTime()) <= 60 * 60_000) rank = 3;
        return { rank, slot, reason: this.reason(rank) };
      })
      .filter((item) => item.rank < 5)
      .sort((a, b) => a.rank - b.rank || Math.abs(a.slot.startsAt.getTime() - requested.startsAt.getTime()) - Math.abs(b.slot.startsAt.getTime() - requested.startsAt.getTime()))
      .slice(0, 6);
  }

  private reason(rank: number) {
    if (rank === 1) return "Same sport, same time";
    if (rank === 2) return "Same facility, nearest open slot";
    return "Similar facility within one hour";
  }
}

@Injectable()
export class NotificationsService {
  constructor(private readonly prisma: PrismaService) {}

  async create(userId: string, type: Prisma.NotificationCreateInput["type"], title: string, body: string, tx: Tx = this.prisma, enqueue = true) {
    const notification = await tx.notification.create({ data: { userId, type, title, body } });
    if (enqueue) await this.enqueueSafely("notification.created", { userId, notificationId: notification.id });
    return notification;
  }

  async list(userId: string) {
    return {
      unread: await this.prisma.notification.count({ where: { userId, readAt: null } }),
      items: await this.prisma.notification.findMany({ where: { userId }, orderBy: { createdAt: "desc" }, take: 20 })
    };
  }

  async markRead(userId: string) {
    await this.prisma.notification.updateMany({ where: { userId, readAt: null }, data: { readAt: new Date() } });
    return { ok: true };
  }

  private async enqueueSafely(name: string, payload: unknown) {
    const url = new URL(process.env.REDIS_URL ?? "redis://localhost:6379");
    const queue = new Queue("notifications", {
      connection: {
        host: url.hostname,
        port: Number(url.port || 6379),
        maxRetriesPerRequest: null,
        enableOfflineQueue: false
      }
    });
    try {
      await queue.add(name, payload, { attempts: 2, removeOnComplete: true });
    } catch {
      // Redis accelerates asynchronous delivery only. Booking correctness remains entirely in PostgreSQL.
    } finally {
      await queue.close().catch(() => undefined);
    }
  }
}

@Injectable()
export class BookingService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly policies: PoliciesService,
    private readonly alternatives: AlternativesService,
    private readonly notifications: NotificationsService,
    private readonly gateway: BookingGateway
  ) {}

  async create(userId: string, slotId: string, idempotencyKey?: string) {
    const requestHash = crypto.createHash("sha256").update(JSON.stringify({ slotId })).digest("hex");
    if (!idempotencyKey) idempotencyKey = crypto.randomUUID();

    return this.prisma.$transaction(async (tx) => {
      const existing = await tx.idempotencyRecord.findUnique({ where: { key_userId: { key: idempotencyKey, userId } } });
      if (existing?.status === "COMPLETED") return { replayed: true, statusCode: existing.responseCode, body: existing.responseBody };
      if (existing && existing.requestHash !== requestHash) throw new ApiConflict("IDEMPOTENCY_KEY_REUSED", "This retry key was already used for a different booking request.");
      if (!existing) {
        await tx.idempotencyRecord.create({ data: { key: idempotencyKey, userId, requestHash, status: "IN_PROGRESS" } });
      }

      let body: unknown;
      let statusCode = 201;
      try {
        await this.policies.assertCanBook(userId, slotId, tx);
        // Invariant 1 and 5: PostgreSQL is the final boundary. Only one row can keep activeSlotId=slotId.
        const rows = await tx.$queryRaw<Array<{ id: string }>>`
          INSERT INTO "Booking" ("id","userId","slotId","activeSlotId","status","qrCode","createdAt","updatedAt")
          VALUES (${crypto.randomUUID()}, ${userId}, ${slotId}, ${slotId}, 'CONFIRMED'::"BookingStatus", ${crypto.randomUUID()}, NOW(), NOW())
          ON CONFLICT ("activeSlotId") DO NOTHING
          RETURNING "id"
        `;
        if (rows.length !== 1) {
          statusCode = 409;
          body = {
            code: "SLOT_ALREADY_BOOKED",
            message: "Someone just secured this slot.",
            alternatives: await this.alternatives.forSlot(slotId, tx)
          };
        } else {
          const booking = await tx.booking.findUniqueOrThrow({
            where: { id: rows[0].id },
            include: { slot: { include: { facility: true } } }
          });
          await tx.waitlistEntry.updateMany({ where: { userId, slotId, status: "WAITING" }, data: { status: "CANCELLED" } });
          await this.notifications.create(userId, "BOOKING_CONFIRMED", "You're in. Court confirmed.", `${booking.slot.facility.name} is yours at ${booking.slot.startsAt.toLocaleString()}.`, tx, false);
          body = { code: "BOOKING_CONFIRMED", message: "You're in. Court confirmed.", booking };
        }
      } catch (error) {
        if (error instanceof ApiConflict) {
          statusCode = 409;
          body = error.getResponse();
        } else {
          throw error;
        }
      }
      await tx.idempotencyRecord.update({ where: { key_userId: { key: idempotencyKey, userId } }, data: { status: "COMPLETED", responseCode: statusCode, responseBody: body as Prisma.InputJsonValue } });
      return { replayed: false, statusCode, body };
    }, { maxWait: 15_000, timeout: 20_000 }).then((result) => {
      this.gateway.slotChanged(slotId, result.body as Record<string, unknown>);
      return result;
    });
  }

  async mine(userId: string) {
    return this.prisma.booking.findMany({
      where: { userId },
      include: { slot: { include: { facility: true } }, checkIn: true },
      orderBy: { createdAt: "desc" }
    });
  }

  async cancel(userId: string, bookingId: string) {
    const result = await this.prisma.$transaction(async (tx) => {
      const booking = await this.policies.canCancel(bookingId, userId, tx);
      await tx.booking.update({ where: { id: booking.id }, data: { status: "CANCELLED", activeSlotId: null, cancelledAt: new Date() } });
      await this.notifications.create(userId, "BOOKING_CANCELLED", "Booking cancelled.", "Your court has been released.", tx, false);
      const promoted = await this.promoteNext(booking.slotId, tx);
      return { booking, promoted };
    });
    this.gateway.slotChanged(result.booking.slotId, { code: "BOOKING_CANCELLED", promoted: result.promoted });
    return { code: "BOOKING_CANCELLED", message: result.promoted ? "Cancelled. The next student has been promoted." : "Cancelled. The slot is open again.", promoted: result.promoted };
  }

  async promoteNext(slotId: string, tx: Tx) {
    // Invariant 4: promotion locks one FIFO waitlist row and still attempts the same unique active booking insert.
    const next = await tx.$queryRaw<Array<{ id: string; userId: string }>>`
      SELECT "id", "userId"
      FROM "WaitlistEntry"
      WHERE "slotId" = ${slotId} AND "status" = 'WAITING'::"WaitlistStatus"
      ORDER BY "createdAt" ASC
      LIMIT 1
      FOR UPDATE SKIP LOCKED
    `;
    if (next.length !== 1) return null;
    const rows = await tx.$queryRaw<Array<{ id: string }>>`
      INSERT INTO "Booking" ("id","userId","slotId","activeSlotId","status","qrCode","createdAt","updatedAt")
      VALUES (${crypto.randomUUID()}, ${next[0].userId}, ${slotId}, ${slotId}, 'CONFIRMED'::"BookingStatus", ${crypto.randomUUID()}, NOW(), NOW())
      ON CONFLICT ("activeSlotId") DO NOTHING
      RETURNING "id"
    `;
    if (rows.length !== 1) return null;
    await tx.waitlistEntry.update({ where: { id: next[0].id }, data: { status: "PROMOTED" } });
    await this.notifications.create(next[0].userId, "WAITLIST_PROMOTED", "You're in. We moved you up automatically.", "A cancellation opened your requested slot.", tx, false);
    return tx.booking.findUnique({ where: { id: rows[0].id }, include: { user: true, slot: { include: { facility: true } } } });
  }

  async markStatus(managerId: string, bookingId: string, status: "CHECKED_IN" | "NO_SHOW") {
    const booking = await this.prisma.booking.update({ where: { id: bookingId }, data: { status } });
    await this.prisma.checkIn.upsert({
      where: { bookingId },
      create: { bookingId, userId: booking.userId, checkedInAt: status === "CHECKED_IN" ? new Date() : null, noShowAt: status === "NO_SHOW" ? new Date() : null },
      update: { checkedInAt: status === "CHECKED_IN" ? new Date() : null, noShowAt: status === "NO_SHOW" ? new Date() : null }
    });
    return { ok: true, managerId };
  }
}

@Injectable()
export class WaitlistService {
  constructor(private readonly prisma: PrismaService, private readonly notifications: NotificationsService) {}

  async join(userId: string, slotId: string) {
    const slot = await this.prisma.facilitySlot.findUnique({ where: { id: slotId }, include: { activeBooking: true, facility: true } });
    if (!slot) throw new NotFoundException({ code: "SLOT_NOT_FOUND", message: "That slot does not exist." });
    if (!slot.activeBooking) throw new ApiConflict("SLOT_AVAILABLE", "This slot is open. You can book it directly.");
    if (slot.activeBooking.userId === userId) throw new ApiConflict("ALREADY_HOLDER", "You already hold this booking.");
    const existing = await this.prisma.waitlistEntry.findUnique({ where: { userId_slotId: { userId, slotId } } });
    if (existing && existing.status === "WAITING") throw new ApiConflict("WAITLIST_ALREADY_JOINED", `You're already #${existing.position} in line.`);
    const position = (await this.prisma.waitlistEntry.count({ where: { slotId, status: "WAITING" } })) + 1;
    const entry = await this.prisma.waitlistEntry.upsert({
      where: { userId_slotId: { userId, slotId } },
      create: { userId, slotId, position, status: "WAITING" },
      update: { position, status: "WAITING" }
    });
    await this.notifications.create(userId, "WAITLIST_JOINED", `You're #${position} in line.`, "We'll move you in automatically if the slot opens.");
    return { code: "WAITLIST_JOINED", message: `You're #${position} in line. We'll move you in automatically if the slot opens.`, entry };
  }

  async mine(userId: string) {
    return this.prisma.waitlistEntry.findMany({
      where: { userId },
      include: { slot: { include: { facility: true } } },
      orderBy: [{ status: "asc" }, { createdAt: "desc" }]
    });
  }

  async cancel(userId: string, id: string) {
    const entry = await this.prisma.waitlistEntry.findUnique({ where: { id } });
    if (!entry || entry.userId !== userId) throw new NotFoundException({ code: "WAITLIST_NOT_FOUND", message: "That waitlist entry was not found." });
    await this.prisma.waitlistEntry.update({ where: { id }, data: { status: "CANCELLED" } });
    return { ok: true };
  }
}

@Injectable()
export class ManagerService {
  constructor(private readonly prisma: PrismaService, private readonly gateway: BookingGateway) {}

  async dashboard() {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const tomorrow = new Date(today);
    tomorrow.setDate(today.getDate() + 1);
    const [bookings, facilities, waitlisted, cancellations, noShows] = await Promise.all([
      this.prisma.booking.count({ where: { slot: { startsAt: { gte: today, lt: tomorrow } } } }),
      this.prisma.facility.count({ where: { status: "OPEN" } }),
      this.prisma.waitlistEntry.count({ where: { status: "WAITING" } }),
      this.prisma.booking.count({ where: { status: "CANCELLED", updatedAt: { gte: today } } }),
      this.prisma.booking.count({ where: { status: "NO_SHOW", updatedAt: { gte: today } } })
    ]);
    return { bookings, facilities, waitlisted, cancellations, noShows };
  }

  async bookings(query: Record<string, string | undefined>) {
    return this.prisma.booking.findMany({
      where: {
        status: query.status as never,
        slot: { facility: { sport: query.sport || undefined } }
      },
      include: { user: true, slot: { include: { facility: true } } },
      orderBy: { createdAt: "desc" },
      take: 100
    });
  }

  async updateFacility(id: string, data: Prisma.FacilityUpdateInput) {
    const facility = await this.prisma.facility.update({ where: { id }, data });
    this.gateway.slotChanged("facility", { facility });
    return facility;
  }

  async maintenance(facilityId: string, startsAt: Date, endsAt: Date, reason: string) {
    const result = await this.prisma.$transaction(async (tx) => {
      const window = await tx.maintenanceWindow.create({ data: { facilityId, startsAt, endsAt, reason } });
      await tx.facilitySlot.updateMany({ where: { facilityId, startsAt: { gte: startsAt, lt: endsAt } }, data: { status: "MAINTENANCE" } });
      return window;
    });
    this.gateway.slotChanged("maintenance", { facilityId });
    return result;
  }
}

@Injectable()
export class AnalyticsService {
  constructor(private readonly prisma: PrismaService) {}

  async analytics() {
    const [bySportRaw, byHourRaw, slots, booked, noShows, cancellations, waitlists] = await Promise.all([
      this.prisma.$queryRaw<Array<{ sport: string; count: bigint }>>`SELECT f."sport", COUNT(*)::bigint FROM "Booking" b JOIN "FacilitySlot" s ON s.id=b."slotId" JOIN "Facility" f ON f.id=s."facilityId" GROUP BY f."sport" ORDER BY count DESC`,
      this.prisma.$queryRaw<Array<{ hour: number; count: bigint }>>`SELECT EXTRACT(HOUR FROM s."startsAt")::int as hour, COUNT(*)::bigint FROM "Booking" b JOIN "FacilitySlot" s ON s.id=b."slotId" GROUP BY hour ORDER BY hour ASC`,
      this.prisma.facilitySlot.count(),
      this.prisma.booking.count({ where: { activeSlotId: { not: null } } }),
      this.prisma.booking.count({ where: { status: "NO_SHOW" } }),
      this.prisma.booking.count({ where: { status: "CANCELLED" } }),
      this.prisma.waitlistEntry.groupBy({ by: ["slotId"], _count: true, where: { status: "WAITING" }, orderBy: { _count: { slotId: "desc" } }, take: 8 })
    ]);
    return {
      utilization: slots ? Math.round((booked / slots) * 100) : 0,
      bySport: bySportRaw.map((x) => ({ sport: x.sport, count: Number(x.count) })),
      byHour: byHourRaw.map((x) => ({ hour: `${x.hour}:00`, count: Number(x.count) })),
      noShowRate: booked + noShows ? Math.round((noShows / (booked + noShows)) * 100) : 0,
      cancellationRate: booked + cancellations ? Math.round((cancellations / (booked + cancellations)) * 100) : 0,
      waitlists
    };
  }
}

@Injectable()
export class RaceService {
  constructor(private readonly booking: BookingService, private readonly prisma: PrismaService) {}

  async run(userId: string, slotId: string, requests: number) {
    await this.prisma.booking.updateMany({ where: { slotId, activeSlotId: slotId }, data: { activeSlotId: null, status: "CANCELLED", cancelledAt: new Date() } });
    const start = Date.now();
    const results = await Promise.all(
      Array.from({ length: requests }).map((_, index) => this.booking.create(userId, slotId, `race-${slotId}-${Date.now()}-${index}`).catch((error) => ({ statusCode: error.status ?? 500, body: error.response })))
    );
    const successes = results.filter((x) => x.statusCode === 201).length;
    const conflicts = results.filter((x) => x.statusCode === 409).length;
    const databaseBookings = await this.prisma.booking.count({ where: { activeSlotId: slotId, status: { in: [...activeStatuses] } } });
    return {
      requests,
      successes,
      conflicts,
      databaseBookings,
      durationMs: Date.now() - start,
      integrity: successes === 1 && databaseBookings === 1 ? "PASSED" : "FAILED",
      winner: results.find((x) => x.statusCode === 201)?.body
    };
  }

  async reset(slotId: string) {
    await this.prisma.booking.updateMany({ where: { slotId, activeSlotId: slotId }, data: { activeSlotId: null, status: "CANCELLED", cancelledAt: new Date() } });
    return { ok: true };
  }
}
