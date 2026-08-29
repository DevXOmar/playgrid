import { PrismaClient, SlotStatus } from "@prisma/client";
import * as bcrypt from "bcryptjs";
import * as crypto from "crypto";

const prisma = new PrismaClient();

const facilities = [
  {
    name: "Badminton Court 1",
    sport: "Badminton",
    location: "Indoor Sports Complex",
    description: "Fast indoor court with evening peak demand.",
    imageUrl: "/facilities/badminton.svg",
    indoor: true,
    capacity: 4,
    amenities: ["Wood court", "LED lighting", "Racquet rental"]
  },
  {
    name: "Badminton Court 2",
    sport: "Badminton",
    location: "Indoor Sports Complex",
    description: "Practice court beside the main badminton hall.",
    imageUrl: "/facilities/badminton.svg",
    indoor: true,
    capacity: 4,
    amenities: ["Indoor", "Changing room", "Scoreboard"]
  },
  {
    name: "Tennis Court A",
    sport: "Tennis",
    location: "Riverside Courts",
    description: "Outdoor court for singles and doubles.",
    imageUrl: "/facilities/tennis.svg",
    indoor: false,
    capacity: 4,
    amenities: ["Floodlights", "Practice wall", "Seating"]
  },
  {
    name: "Basketball Court",
    sport: "Basketball",
    location: "Student Activity Zone",
    description: "Full court with late-evening pickup games.",
    imageUrl: "/facilities/basketball.svg",
    indoor: false,
    capacity: 10,
    amenities: ["Full court", "Floodlights", "Benches"]
  },
  {
    name: "Main Football Ground",
    sport: "Football",
    location: "North Campus Ground",
    description: "Large turf ground for team bookings.",
    imageUrl: "/facilities/football.svg",
    indoor: false,
    capacity: 22,
    amenities: ["Full pitch", "Team benches", "Water point"]
  },
  {
    name: "Campus Gymnasium",
    sport: "Gymnasium",
    location: "Wellness Block",
    description: "Strength and conditioning zone with limited hourly capacity.",
    imageUrl: "/facilities/gymnasium.svg",
    indoor: true,
    capacity: 30,
    amenities: ["Weights", "Cardio", "Lockers"]
  },
  {
    name: "Cricket Ground",
    sport: "Cricket",
    location: "South Campus Field",
    description: "Outdoor pitch for nets and match slots.",
    imageUrl: "/facilities/cricket.svg",
    indoor: false,
    capacity: 22,
    amenities: ["Practice nets", "Pitch", "Score hut"]
  }
];

function addHours(date: Date, hours: number) {
  return new Date(date.getTime() + hours * 60 * 60 * 1000);
}

async function main() {
  await prisma.checkIn.deleteMany();
  await prisma.notification.deleteMany();
  await prisma.idempotencyRecord.deleteMany();
  await prisma.waitlistEntry.deleteMany();
  await prisma.booking.deleteMany();
  await prisma.maintenanceWindow.deleteMany();
  await prisma.facilityPolicy.deleteMany();
  await prisma.facilitySlot.deleteMany();
  await prisma.facility.deleteMany();
  await prisma.user.deleteMany();

  const passwordHash = await bcrypt.hash("PlayGrid123!", 12);
  const demoStudent = await prisma.user.create({ data: { email: "student@playgrid.demo", name: "Aarav Student", passwordHash, role: "STUDENT" } });
  await prisma.user.create({ data: { email: "manager@playgrid.demo", name: "Mira Manager", passwordHash, role: "FACILITY_MANAGER" } });
  await prisma.user.create({ data: { email: "admin@playgrid.demo", name: "Anika Admin", passwordHash, role: "ADMIN" } });
  const students = [demoStudent];
  for (let i = 1; i <= 30; i++) {
    students.push(
      await prisma.user.create({
        data: {
          email: `student${i}@playgrid.demo`,
          name: `Student ${i}`,
          passwordHash,
          role: "STUDENT",
          priority: i % 11 === 0 ? 1 : 0
        }
      })
    );
  }

  const createdFacilities = [];
  for (const facility of facilities) {
    createdFacilities.push(await prisma.facility.create({ data: facility }));
  }

  await prisma.facilityPolicy.create({
    data: {
      maxActiveBookings: 3,
      maxSportBookingsPerWeek: 3,
      advanceWindowDays: 7,
      cancellationCutoffMinutes: 30,
      priorityEnabled: true
    }
  });
  for (const facility of createdFacilities) {
    await prisma.facilityPolicy.create({
      data: { facilityId: facility.id, sport: facility.sport, maxActiveBookings: 3, maxSportBookingsPerWeek: facility.sport === "Badminton" ? 3 : 2, advanceWindowDays: 7, cancellationCutoffMinutes: 30 }
    });
  }

  const today = new Date();
  today.setUTCMinutes(0, 0, 0);
  today.setUTCHours(6, 0, 0, 0);
  const allSlots = [];
  for (const facility of createdFacilities) {
    for (let day = 0; day < 7; day++) {
      for (let hour = 6; hour < 22; hour++) {
        const startsAt = new Date(today);
        startsAt.setUTCDate(today.getUTCDate() + day);
        startsAt.setUTCHours(hour, 0, 0, 0);
        const status: SlotStatus = day === 2 && hour === 13 && facility.name.includes("Tennis") ? "MAINTENANCE" : hour >= facility.closeHour ? "CLOSED" : "AVAILABLE";
        allSlots.push(
          await prisma.facilitySlot.create({
            data: { facilityId: facility.id, startsAt, endsAt: addHours(startsAt, 1), status }
          })
        );
      }
    }
  }

  const badmintonOne = createdFacilities.find((f) => f.name === "Badminton Court 1")!;
  const sixPm = allSlots.find((s) => s.facilityId === badmintonOne.id && s.startsAt.getUTCHours() === 18 && s.startsAt.getUTCDate() === today.getUTCDate())!;
  await prisma.notification.create({ data: { userId: demoStudent.id, type: "BOOKING_REMINDER", title: "Tonight is busy.", body: "Badminton slots around 6 PM are filling fast." } });

  let idx = 1;
  for (const slot of allSlots.filter((s) => s.status === "AVAILABLE")) {
    if (slot.id === sixPm.id) continue;
    if (idx % 9 === 0) {
      const user = students[(idx % (students.length - 1)) + 1];
      await prisma.booking.create({
        data: { userId: user.id, slotId: slot.id, activeSlotId: slot.id, status: idx % 27 === 0 ? "NO_SHOW" : "CONFIRMED", qrCode: crypto.randomUUID() }
      });
    }
    idx++;
  }

  const bookedSlot = allSlots.find((s) => s.facilityId === badmintonOne.id && s.startsAt.getUTCHours() === 19)!;
  const holder = students[5];
  await prisma.booking.upsert({
    where: { activeSlotId: bookedSlot.id },
    update: {},
    create: { userId: holder.id, slotId: bookedSlot.id, activeSlotId: bookedSlot.id, status: "CONFIRMED", qrCode: crypto.randomUUID() }
  });
  for (let i = 0; i < 3; i++) {
    await prisma.waitlistEntry.create({ data: { userId: students[10 + i].id, slotId: bookedSlot.id, position: i + 1, status: "WAITING" } });
  }

  const oldSlot = allSlots.find((s) => s.startsAt < new Date() && s.status === "AVAILABLE");
  if (oldSlot) {
    const oldBooking = await prisma.booking.create({ data: { userId: students[6].id, slotId: oldSlot.id, activeSlotId: null, status: "CHECKED_IN", qrCode: crypto.randomUUID() } });
    await prisma.checkIn.create({ data: { bookingId: oldBooking.id, userId: students[6].id, checkedInAt: new Date(oldSlot.startsAt.getTime() + 10 * 60_000) } });
  }

  const maintenanceFacility = createdFacilities.find((f) => f.name === "Tennis Court A")!;
  const maintenanceStart = allSlots.find((s) => s.facilityId === maintenanceFacility.id && s.status === "MAINTENANCE")?.startsAt ?? addHours(today, 31);
  await prisma.maintenanceWindow.create({ data: { facilityId: maintenanceFacility.id, startsAt: maintenanceStart, endsAt: addHours(maintenanceStart, 1), reason: "Surface inspection" } });

  console.log("Seed complete");
  console.log("Demo accounts: student@playgrid.demo, manager@playgrid.demo, admin@playgrid.demo / PlayGrid123!");
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(async () => prisma.$disconnect());
