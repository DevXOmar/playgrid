import { WebSocketGateway, WebSocketServer } from "@nestjs/websockets";
import { Server } from "socket.io";

@WebSocketGateway({ cors: { origin: ["http://localhost:3000", "http://127.0.0.1:3000"], credentials: true } })
export class BookingGateway {
  @WebSocketServer()
  server!: Server;

  slotChanged(slotId: string, payload: Record<string, unknown>) {
    this.server.emit("slot:update", { slotId, ...payload });
  }

  userChanged(userId: string, payload: Record<string, unknown>) {
    this.server.emit(`user:${userId}:update`, payload);
  }
}
