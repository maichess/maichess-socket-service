import { Server, Socket } from 'socket.io';
import type { Server as HttpServer } from 'http';
import { validateToken } from '../grpc/auth-client';

const userSockets = new Map<string, Socket>();

export function createSocketManager(httpServer: HttpServer): Server {
  const io = new Server(httpServer, {
    cors: { origin: process.env.CORS_ORIGIN ?? '*', credentials: true },
  });

  io.use(async (socket, next) => {
    const token =
      (socket.handshake.auth.token as string | undefined) ??
      parseCookieToken(socket.handshake.headers.cookie);

    if (!token) return next(new Error('missing token'));

    try {
      const result = await validateToken(token);
      if (!result.valid) return next(new Error('unauthorized'));
      socket.data.userId = result.userId;
      socket.data.username = result.username;
      next();
    } catch {
      next(new Error('unauthorized'));
    }
  });

  io.on('connection', (socket) => {
    const userId = socket.data.userId as string;
    userSockets.set(userId, socket);
    console.log(`Client connected: ${userId}`);

    socket.on('disconnect', () => {
      userSockets.delete(userId);
      console.log(`Client disconnected: ${userId}`);
    });
  });

  return io;
}

export function emitToUser(userId: string, event: string, payload: unknown): boolean {
  const socket = userSockets.get(userId);
  if (!socket) return false;
  socket.emit(event, payload);
  return true;
}

function parseCookieToken(cookieHeader: string | undefined): string | undefined {
  if (!cookieHeader) return undefined;
  for (const part of cookieHeader.split(';')) {
    const [key, ...rest] = part.trim().split('=');
    if (key?.trim() === 'access_token') return rest.join('=');
  }
  return undefined;
}
