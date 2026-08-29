import { CanActivate, ExecutionContext, Injectable, SetMetadata, UnauthorizedException, ForbiddenException } from "@nestjs/common";
import { Reflector } from "@nestjs/core";
import { JwtService } from "@nestjs/jwt";
import { UserRole } from "@prisma/client";

export const Roles = (...roles: UserRole[]) => SetMetadata("roles", roles);

@Injectable()
export class AuthGuard implements CanActivate {
  constructor(private readonly jwt: JwtService) {}

  canActivate(context: ExecutionContext): boolean {
    const req = context.switchToHttp().getRequest();
    const header = req.headers.authorization;
    const token = header?.startsWith("Bearer ") ? header.slice(7) : req.cookies?.token;
    if (!token) throw new UnauthorizedException({ code: "SESSION_REQUIRED", message: "Please sign in to continue." });
    try {
      req.user = this.jwt.verify(token);
      return true;
    } catch {
      throw new UnauthorizedException({ code: "SESSION_EXPIRED", message: "Your session expired. Please sign in again." });
    }
  }
}

@Injectable()
export class RolesGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const roles = this.reflector.get<UserRole[]>("roles", context.getHandler());
    if (!roles?.length) return true;
    const req = context.switchToHttp().getRequest();
    if (!roles.includes(req.user?.role)) {
      throw new ForbiddenException({ code: "ROLE_REQUIRED", message: "You do not have access to this workspace." });
    }
    return true;
  }
}

export type RequestUser = { sub: string; email: string; role: UserRole; name: string };
