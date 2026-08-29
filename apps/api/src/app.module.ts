import { Module } from "@nestjs/common";
import { ConfigModule } from "@nestjs/config";
import { JwtModule } from "@nestjs/jwt";
import { AppController } from "./controllers";
import { BookingGateway } from "./gateway";
import { AuthGuard, RolesGuard } from "./guards";
import {
  AlternativesService,
  AnalyticsService,
  AuthService,
  BookingService,
  FacilitiesService,
  ManagerService,
  NotificationsService,
  PoliciesService,
  PrismaService,
  RaceService,
  WaitlistService
} from "./services";

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    JwtModule.register({
      global: true,
      secret: process.env.JWT_SECRET ?? "playgrid-local-secret-change-me",
      signOptions: { expiresIn: "7d" }
    })
  ],
  controllers: [AppController],
  providers: [
    PrismaService,
    AuthService,
    AuthGuard,
    RolesGuard,
    BookingGateway,
    FacilitiesService,
    PoliciesService,
    AlternativesService,
    NotificationsService,
    BookingService,
    WaitlistService,
    ManagerService,
    AnalyticsService,
    RaceService
  ]
})
export class AppModule {}
