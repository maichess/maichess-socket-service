import { Server, Socket } from 'socket.io';
import type { Server as HttpServer } from 'http';
import { validateToken } from '../grpc/auth-client';

const userSockets = new Map<string, Socket>();
let ioInstance: Server | undefined;

export function createSocketManager(httpServer: HttpServer): Server {
  const io = new Server(httpServer, {
    cors: { origin: process.env.CORS_ORIGIN ?? '*', credentials: true },
  });

  ioInstance = io;

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

    socket.on('subscribe_match', (msg: unknown) => {
      const matchId = extractMatchId(msg);
      if (matchId) socket.join(matchRoom(matchId));
    });

    socket.on('unsubscribe_match', (msg: unknown) => {
      const matchId = extractMatchId(msg);
      if (matchId) socket.leave(matchRoom(matchId));
    });

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

export function broadcastToMatch(matchId: string, event: string, payload: unknown): number {
  if (!ioInstance) return 0;
  const room = matchRoom(matchId);
  const sockets = ioInstance.sockets.adapter.rooms.get(room);
  ioInstance.to(room).emit(event, payload);
  return sockets ? sockets.size : 0;
}

function matchRoom(matchId: string): string {
  return `match:${matchId}`;
}

function extractMatchId(msg: unknown): string | undefined {
  if (typeof msg !== 'object' || msg === null) return undefined;
  const { match_id: matchId } = msg as { match_id?: unknown };
  return typeof matchId === 'string' && matchId.length > 0 ? matchId : undefined;
}

function parseCookieToken(cookieHeader: string | undefined): string | undefined {
  if (!cookieHeader) return undefined;
  for (const part of cookieHeader.split(';')) {
    const [key, ...rest] = part.trim().split('=');
    if (key?.trim() === 'access_token') return rest.join('=');
  }
  return undefined;
}
