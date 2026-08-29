import { IsDateString, IsEmail, IsEnum, IsInt, IsOptional, IsString, Min } from "class-validator";

export class LoginDto {
  @IsEmail()
  email!: string;

  @IsString()
  password!: string;
}

export class CreateBookingDto {
  @IsString()
  slotId!: string;
}

export class JoinWaitlistDto {
  @IsString()
  slotId!: string;
}

export class RaceDto {
  @IsString()
  slotId!: string;

  @IsInt()
  @Min(1)
  requests!: number;
}

export class MaintenanceDto {
  @IsString()
  facilityId!: string;

  @IsDateString()
  startsAt!: string;

  @IsDateString()
  endsAt!: string;

  @IsString()
  reason!: string;
}

export class UpdateFacilityDto {
  @IsOptional()
  @IsEnum(["OPEN", "CLOSED", "MAINTENANCE"])
  status?: "OPEN" | "CLOSED" | "MAINTENANCE";

  @IsOptional()
  @IsInt()
  openHour?: number;

  @IsOptional()
  @IsInt()
  closeHour?: number;
}

export class UpdatePolicyDto {
  @IsOptional()
  @IsInt()
  maxActiveBookings?: number;

  @IsOptional()
  @IsInt()
  maxSportBookingsPerWeek?: number;

  @IsOptional()
  @IsInt()
  advanceWindowDays?: number;

  @IsOptional()
  @IsInt()
  cancellationCutoffMinutes?: number;
}
