import { INestApplication } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import * as bcrypt from "bcryptjs";
import request = require("supertest");
import { AppModule } from "../src/app.module";
import { PrismaService } from "../src/services";

describe("race demo regression", () => {
  jest.setTimeout(60_000);
  let app: INestApplication;
  let prisma: PrismaService;
  let token: string;
  let slotId: string;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    await app.init();
    prisma = app.get(PrismaService);

    const email = `race-demo-test-${Date.now()}@playgrid.demo`;
    await prisma.user.create({
      data: {
        email,
        name: "Race Demo Test Student",
        passwordHash: await bcrypt.hash("PlayGrid123!", 12),
        role: "STUDENT"
      }
    });
    const login = await request(app.getHttpServer()).post("/auth/login").send({ email, password: "PlayGrid123!" });
    token = login.body.token;

    const facility = await prisma.facility.findFirstOrThrow({ where: { name: "Badminton Court 1" } });
    const startsAt = new Date(Date.now() + 3 * 60 * 60_000);
    startsAt.setUTCMinutes(0, 0, 0);
    const endsAt = new Date(startsAt.getTime() + 60 * 60_000);
    const slot = await prisma.facilitySlot.upsert({
      where: { facilityId_startsAt: { facilityId: facility.id, startsAt } },
      create: { facilityId: facility.id, startsAt, endsAt, status: "AVAILABLE" },
      update: { endsAt, status: "AVAILABLE" }
    });
    slotId = slot.id;
  });

  afterAll(async () => {
    await request(app.getHttpServer()).post("/demo/race/reset").set("Authorization", `Bearer ${token}`).send({ slotId });
    await app.close();
  });

  async function resetAndRace() {
    const reset = await request(app.getHttpServer()).post("/demo/race/reset").set("Authorization", `Bearer ${token}`).send({ slotId });
    expect(reset.status).toBe(201);
    expect(reset.body).toMatchObject({ slotId, activeBookings: 0, ready: true });
    await expect(prisma.booking.count({ where: { activeSlotId: slotId } })).resolves.toBe(0);

    const readiness = await request(app.getHttpServer()).get(`/demo/race/readiness?slotId=${encodeURIComponent(slotId)}`).set("Authorization", `Bearer ${token}`);
    expect(readiness.status).toBe(200);
    expect(readiness.body.ready).toBe(true);

    const race = await request(app.getHttpServer()).post("/demo/race").set("Authorization", `Bearer ${token}`).send({ slotId, requests: 100 });
    expect(race.status).toBe(201);
    expect(race.body.requests).toBe(100);
    expect(race.body.successes).toBe(1);
    expect(race.body.conflicts).toBe(99);
    expect(race.body.policyRejections).toBe(0);
    expect(race.body.validationFailures).toBe(0);
    expect(race.body.serverErrors).toBe(0);
    expect(race.body.databaseBookings).toBe(1);
    expect(race.body.integrity).toBe("PASSED");
    expect(race.body.raceRunId).toMatch(/^RACE-/);
    expect(race.body.winnerBookingId).toBeTruthy();
    await expect(prisma.booking.count({ where: { activeSlotId: slotId } })).resolves.toBe(1);
  }

  it("resets and repeats the 100-request race without collapsing into 0 winners", async () => {
    await resetAndRace();
    await resetAndRace();
  });
});
