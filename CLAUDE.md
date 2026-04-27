# CLAUDE.md — maichess-socket-service

## Role

WebSocket gateway service. Maintains persistent socket.io connections with clients and exposes a gRPC `EmitEvent` endpoint so other services can push events to connected users without knowing anything about WebSocket internals.

Clients connect over WebSocket (socket.io), authenticate with a JWT, and stay connected for the duration of their session. Other services (e.g. Match Manager) call `Socket.EmitEvent` over gRPC to deliver real-time events to a specific user.

## Contracts

Always read contracts before implementing:

- **gRPC (server):** `maichess-api-contracts/protos/socket-service/v1/socket.proto` — `EmitEvent`
- **gRPC (client):** `maichess-api-contracts/protos/auth-service/v1/auth.proto` — `ValidateToken` (used to authenticate connecting clients)

> **Note:** The `socket-service` proto types must be added to `@maichess/platform-protos` and a new version published before `src/grpc/server.ts` will compile. Follow the same buf generate + publish workflow used by the other service protos.

## Stack

- **Runtime:** Node.js, TypeScript
- **WebSocket:** socket.io 4 (attached to a Node `http.Server`)
- **Framework:** Express.js 5 (underlying HTTP server — used for health checks if needed)
- **gRPC:** server for `Socket.EmitEvent`; client for `Auth.ValidateToken`

## Commands

```bash
npm run dev      # start with nodemon + ts-node (watch mode)
npm run build    # compile TypeScript to dist/
```

## Architecture

```
src/
  socket/        # socket.io server setup and userId→socket registry
  grpc/          # gRPC server (EmitEvent) and auth client (ValidateToken)
  middleware/    # Express error handler
  index.ts       # bootstrap: HTTP server, socket manager, gRPC server
```

The `userSockets` map in `src/socket/manager.ts` is the central registry. It maps `userId → Socket`. `emitToUser` looks up the socket and calls `socket.emit`. If the user is not connected, it returns `delivered: false`.

Only one socket per user is tracked. If a user reconnects, the new socket replaces the old entry.

## Auth Flow (socket connection)

1. Client connects via socket.io with `auth: { token: '<jwt>' }` in the handshake.
2. The socket middleware in `manager.ts` calls `Auth.ValidateToken` over gRPC.
3. On success, `socket.data.userId` and `socket.data.username` are set.
4. On failure or error, the connection is rejected with `unauthorized`.

## Coding Principles

- **No classes for stateless logic.** Use plain functions.
- **One responsibility per module.** `manager.ts` owns socket lifecycle; `server.ts` owns gRPC; `auth-client.ts` owns the auth gRPC call.
- **Explicit over implicit.** No magic, no decorators, no reflection.
- **Fail fast.** Reject unauthenticated connections immediately in the socket middleware.
- **No unused abstractions.** Do not create helpers or utilities for one-off operations.

## Error Handling

Use Express 5's native async error propagation for any HTTP routes. Socket.io errors are handled inline in the middleware (`next(new Error(...))`). The gRPC server logs errors and responds with `delivered: false` rather than throwing.

## Environment Variables

| Variable | Description |
|---|---|
| `PORT` | HTTP/WebSocket port (default `3000`) |
| `GRPC_PORT` | gRPC server port (default `50051`) |
| `AUTH_SERVICE_GRPC_ADDR` | Address of the auth-service gRPC server |
| `CORS_ORIGIN` | Allowed WebSocket origin (default `*`) |
