"use client";

import { socketBaseUrl } from "@playgrid/config";
import { io, Socket } from "socket.io-client";

let socket: Socket | null = null;

export function getSocket() {
  if (!socket) {
    socket = io(socketBaseUrl, {
      transports: ["websocket", "polling"],
      reconnectionDelay: 500,
      reconnectionDelayMax: 5000
    });
  }
  return socket;
}
