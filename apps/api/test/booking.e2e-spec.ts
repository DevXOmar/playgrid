import { INestApplication } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import * as bcrypt from "bcryptjs";
import request = require("supertest");
import { AppModule } from "../src/app.module";
import { PrismaService } from "../src/services";

describe("booking invariants", () => {
  jest.setTimeout(30_000);
  let app: INestApplication;
  let prisma: PrismaService;
  let token: string;
  let slotId: string;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    await app.init();
    prisma = app.get(PrismaService);
    const email = `race-test-${Date.now()}@playgrid.demo`;
    await prisma.user.create({
      data: {
        email,
        name: "Race Test Student",
        passwordHash: await bcrypt.hash("PlayGrid123!", 12),
        role: "STUDENT"
      }
    });
    const login = await request(app.getHttpServer()).post("/auth/login").send({ email, password: "PlayGrid123!" });
    token = login.body.token;
    const facility = await prisma.facility.findFirstOrThrow({ where: { name: "Badminton Court 1" } });
    const slot = await prisma.facilitySlot.findFirstOrThrow({ where: { facilityId: facility.id, startsAt: { gte: new Date() }, status: "AVAILABLE", activeBooking: null }, orderBy: { startsAt: "asc" } });
    slotId = slot.id;
    await prisma.booking.updateMany({ where: { slotId }, data: { activeSlotId: null, status: "CANCELLED", cancelledAt: new Date() } });
  });

  afterAll(async () => {
    await app.close();
  });

  it("creates one successful booking and rejects a duplicate", async () => {
    const runId = Date.now();
    const first = await request(app.getHttpServer()).post("/bookings").set("Authorization", `Bearer ${token}`).set("Idempotency-Key", `it-success-${runId}`).send({ slotId });
    expect(first.status).toBe(201);
    const second = await request(app.getHttpServer()).post("/bookings").set("Authorization", `Bearer ${token}`).set("Idempotency-Key", `it-conflict-${runId}`).send({ slotId });
    expect(second.status).toBe(409);
    await expect(prisma.booking.count({ where: { activeSlotId: slotId } })).resolves.toBe(1);
  });

  it("replays idempotent requests without creating another booking", async () => {
    const key = `it-idempotent-${Date.now()}`;
    const a = await request(app.getHttpServer()).post("/bookings").set("Authorization", `Bearer ${token}`).set("Idempotency-Key", key).send({ slotId });
    const b = await request(app.getHttpServer()).post("/bookings").set("Authorization", `Bearer ${token}`).set("Idempotency-Key", key).send({ slotId });
    expect(b.status).toBe(a.status);
    await expect(prisma.idempotencyRecord.count({ where: { key } })).resolves.toBe(1);
  });

  it("keeps exactly one active booking for 100 concurrent requests", async () => {
    const facility = await prisma.facility.findFirstOrThrow({ where: { name: "Badminton Court 2" } });
    const slot = await prisma.facilitySlot.findFirstOrThrow({ where: { facilityId: facility.id, startsAt: { gte: new Date() }, status: "AVAILABLE", activeBooking: null }, orderBy: { startsAt: "asc" } });
    await prisma.booking.updateMany({ where: { slotId: slot.id }, data: { activeSlotId: null, status: "CANCELLED", cancelledAt: new Date() } });
    const responses = await Promise.all(
      Array.from({ length: 100 }).map((_, i) =>
        request(app.getHttpServer()).post("/bookings").set("Authorization", `Bearer ${token}`).set("Idempotency-Key", `race-it-${Date.now()}-${i}`).send({ slotId: slot.id })
      )
    );
    expect(responses.filter((r) => r.status === 201)).toHaveLength(1);
    expect(responses.filter((r) => r.status === 409)).toHaveLength(99);
    await expect(prisma.booking.count({ where: { activeSlotId: slot.id } })).resolves.toBe(1);
  });
});
