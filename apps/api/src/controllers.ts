import { Body, Controller, Delete, Get, Headers, Param, Patch, Post, Query, Req, Res, UseGuards } from "@nestjs/common";
import { Response } from "express";
import { BookingStatus, UserRole } from "@prisma/client";
import { CreateBookingDto, JoinWaitlistDto, LoginDto, MaintenanceDto, RaceDto, UpdateFacilityDto, UpdatePolicyDto } from "./dto";
import { AuthGuard, RequestUser, Roles, RolesGuard } from "./guards";
import { AlternativesService, AnalyticsService, AuthService, BookingService, FacilitiesService, ManagerService, NotificationsService, PoliciesService, RaceService, WaitlistService } from "./services";

@Controller()
export class AppController {
  constructor(
    private readonly auth: AuthService,
    private readonly facilities: FacilitiesService,
    private readonly bookings: BookingService,
    private readonly waitlists: WaitlistService,
    private readonly alternatives: AlternativesService,
    private readonly manager: ManagerService,
    private readonly analytics: AnalyticsService,
    private readonly policies: PoliciesService,
    private readonly notifications: NotificationsService,
    private readonly race: RaceService
  ) {}

  @Get("health")
  health() {
    return { ok: true, service: "playgrid-api" };
  }

  @Post("auth/login")
  async login(@Body() dto: LoginDto, @Res({ passthrough: true }) res: Response) {
    const result = await this.auth.login(dto.email, dto.password);
    res.cookie("token", result.token, { httpOnly: true, sameSite: "lax", secure: false, maxAge: 7 * 24 * 60 * 60 * 1000 });
    return result;
  }

  @Post("auth/logout")
  logout(@Res({ passthrough: true }) res: Response) {
    res.clearCookie("token");
    return { ok: true };
  }

  @UseGuards(AuthGuard)
  @Get("auth/me")
  me(@Req() req: { user: RequestUser }) {
    return this.auth.me(req.user.sub);
  }

  @Get("facilities")
  listFacilities(@Query() query: Record<string, string | undefined>) {
    return this.facilities.list(query);
  }

  @Get("facilities/:id")
  facility(@Param("id") id: string) {
    return this.facilities.detail(id);
  }

  @Get("facilities/:id/slots")
  slots(@Param("id") id: string, @Query("date") date?: string) {
    return this.facilities.slots(id, date);
  }

  @UseGuards(AuthGuard)
  @Post("bookings")
  async createBooking(@Req() req: { user: RequestUser }, @Body() dto: CreateBookingDto, @Headers("idempotency-key") key: string | undefined, @Res({ passthrough: true }) res: Response) {
    const result = await this.bookings.create(req.user.sub, dto.slotId, key);
    res.status(result.statusCode ?? 201);
    return result.body;
  }

  @UseGuards(AuthGuard)
  @Get("bookings/me")
  myBookings(@Req() req: { user: RequestUser }) {
    return this.bookings.mine(req.user.sub);
  }

  @UseGuards(AuthGuard)
  @Delete("bookings/:id")
  cancelBooking(@Req() req: { user: RequestUser }, @Param("id") id: string) {
    return this.bookings.cancel(req.user.sub, id);
  }

  @UseGuards(AuthGuard)
  @Patch("bookings/:id/status")
  @Roles(UserRole.FACILITY_MANAGER, UserRole.ADMIN)
  @UseGuards(RolesGuard)
  bookingStatus(@Req() req: { user: RequestUser }, @Param("id") id: string, @Body("status") status: BookingStatus) {
    return this.bookings.markStatus(req.user.sub, id, status as "CHECKED_IN" | "NO_SHOW");
  }

  @UseGuards(AuthGuard)
  @Post("slots/:id/waitlist")
  waitlist(@Req() req: { user: RequestUser }, @Param("id") slotId: string) {
    return this.waitlists.join(req.user.sub, slotId);
  }

  @UseGuards(AuthGuard)
  @Post("waitlist")
  waitlistBody(@Req() req: { user: RequestUser }, @Body() dto: JoinWaitlistDto) {
    return this.waitlists.join(req.user.sub, dto.slotId);
  }

  @UseGuards(AuthGuard)
  @Get("waitlist/me")
  myWaitlists(@Req() req: { user: RequestUser }) {
    return this.waitlists.mine(req.user.sub);
  }

  @UseGuards(AuthGuard)
  @Delete("waitlist/:id")
  cancelWaitlist(@Req() req: { user: RequestUser }, @Param("id") id: string) {
    return this.waitlists.cancel(req.user.sub, id);
  }

  @Get("alternatives/:slotId")
  getAlternatives(@Param("slotId") slotId: string) {
    return this.alternatives.forSlot(slotId);
  }

  @UseGuards(AuthGuard)
  @Get("notifications")
  getNotifications(@Req() req: { user: RequestUser }) {
    return this.notifications.list(req.user.sub);
  }

  @UseGuards(AuthGuard)
  @Patch("notifications/read")
  readNotifications(@Req() req: { user: RequestUser }) {
    return this.notifications.markRead(req.user.sub);
  }

  @UseGuards(AuthGuard, RolesGuard)
  @Roles(UserRole.FACILITY_MANAGER, UserRole.ADMIN)
  @Get("manager/dashboard")
  managerDashboard() {
    return this.manager.dashboard();
  }

  @UseGuards(AuthGuard, RolesGuard)
  @Roles(UserRole.FACILITY_MANAGER, UserRole.ADMIN)
  @Get("manager/bookings")
  managerBookings(@Query() query: Record<string, string | undefined>) {
    return this.manager.bookings(query);
  }

  @UseGuards(AuthGuard, RolesGuard)
  @Roles(UserRole.FACILITY_MANAGER, UserRole.ADMIN)
  @Get("manager/analytics")
  managerAnalytics() {
    return this.analytics.analytics();
  }

  @UseGuards(AuthGuard, RolesGuard)
  @Roles(UserRole.FACILITY_MANAGER, UserRole.ADMIN)
  @Patch("manager/facilities/:id")
  updateFacility(@Param("id") id: string, @Body() dto: UpdateFacilityDto) {
    return this.manager.updateFacility(id, dto);
  }

  @UseGuards(AuthGuard, RolesGuard)
  @Roles(UserRole.FACILITY_MANAGER, UserRole.ADMIN)
  @Post("manager/maintenance")
  maintenance(@Body() dto: MaintenanceDto) {
    return this.manager.maintenance(dto.facilityId, new Date(dto.startsAt), new Date(dto.endsAt), dto.reason);
  }

  @UseGuards(AuthGuard, RolesGuard)
  @Roles(UserRole.FACILITY_MANAGER, UserRole.ADMIN)
  @Patch("manager/policies")
  updatePolicies(@Body() dto: UpdatePolicyDto) {
    return this.policies.updatePolicy(dto);
  }

  @UseGuards(AuthGuard)
  @Post("demo/race")
  runRace(@Req() req: { user: RequestUser }, @Body() dto: RaceDto) {
    return this.race.run(req.user.sub, dto.slotId, dto.requests);
  }

  @UseGuards(AuthGuard)
  @Post("demo/race/reset")
  resetRace(@Body("slotId") slotId: string) {
    return this.race.reset(slotId);
  }
}
