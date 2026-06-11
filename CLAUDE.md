# CLAUDE.md — maichess-socket-service

## Role

WebSocket gateway service. Maintains persistent socket.io connections with clients and consumes the
`socket.outbound.v1` Kafka topic, fanning each event out to the target user (single-user push) or
match room (broadcast) without other services knowing anything about WebSocket internals.

Clients connect over WebSocket (socket.io), authenticate with a JWT, and stay connected for the
duration of their session. Producers (Match Manager, Match Maker, Analysis) publish an `OutboundEvent`
to `socket.outbound.v1`; this service decodes it and delivers it. The former `Socket.EmitEvent` /
`Socket.BroadcastMatchEvent` gRPC **server** was removed in Kafka task 09.

## Contracts

Always read contracts before implementing:

- **Kafka (consumer):** `maichess-api-contracts/protos/events/v1/socket_outbound.proto` — `OutboundEvent` / `SocketPush` on `socket.outbound.v1` (raw Protobuf bytes; no Schema Registry).
- **gRPC (client):** `maichess-api-contracts/protos/auth-service/v1/auth.proto` — `ValidateToken` (used to authenticate connecting clients)

> The `socket.proto` Socket service is now a version-history stub — this service no longer serves any
> gRPC endpoint.

## Stack

- **Runtime:** Node.js, TypeScript
- **WebSocket:** socket.io 4 (attached to a Node `http.Server`)
- **Framework:** Express.js 5 (underlying HTTP server — used for health checks if needed)
- **Kafka:** consumer for `socket.outbound.v1` (kafkajs, raw Protobuf via ts-proto)
- **gRPC:** client only, for `Auth.ValidateToken`

## Commands

```bash
npm run dev      # start with nodemon + ts-node (watch mode)
npm run build    # compile TypeScript to dist/
```

## Architecture

```
src/
  socket/        # socket.io server setup and userId→socket registry
  kafka/         # socket.outbound.v1 consumer + raw-Protobuf decode + dispatch
  grpc/          # auth client (Auth.ValidateToken) — client only
  middleware/    # Express error handler
  index.ts       # bootstrap: HTTP server, socket manager, outbound consumer
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
- **One responsibility per module.** `manager.ts` owns socket lifecycle; `kafka/consumer.ts` owns the outbound consumer + dispatch; `auth-client.ts` owns the auth gRPC call.
- **Explicit over implicit.** No magic, no decorators, no reflection.
- **Fail fast.** Reject unauthenticated connections immediately in the socket middleware.
- **No unused abstractions.** Do not create helpers or utilities for one-off operations.

## Error Handling

Use Express 5's native async error propagation for any HTTP routes. Socket.io errors are handled inline in the middleware (`next(new Error(...))`). The outbound consumer WARN-logs a decode/dispatch failure rather than crashing.

## Environment Variables

| Variable | Description |
|---|---|
| `PORT` | HTTP/WebSocket port (default `3000`) |
| `AUTH_SERVICE_GRPC_ADDR` | Address of the auth-service gRPC server |
| `CORS_ORIGIN` | Allowed WebSocket origin (default `*`) |
| `KAFKA_BOOTSTRAP` | Kafka bootstrap servers (default `kafka:9092`) for the `socket.outbound.v1` consumer |

> `GRPC_PORT` was removed in Kafka task 09 — the service no longer serves a gRPC endpoint.
