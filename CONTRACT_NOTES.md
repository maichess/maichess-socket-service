# Contract Notes

## Event-driven migration (Kafka) — planned

Per [event-driven-architecture.md](../../maichess-knowledge-base/event-driven-architecture.md),
this service becomes a **pure Kafka consumer**. Event schemas are Avro in
`maichess-api-contracts/events/v1/`.

**Becomes:**
- Consumes `socket.outbound.v1` `SocketPush{target_user_id?, target_match_id?, event_name,
  payload_json}` and fans out over socket.io: `target_user_id` → all of that user's sockets;
  `target_match_id` → the `match:<id>` room. The existing room subscription handling
  (`subscribe_match`/`unsubscribe_match`) and client-facing event names are unchanged.

**Drops (gRPC server):** `Socket.EmitEvent` and `Socket.BroadcastMatchEvent` — producers now
publish to `socket.outbound.v1` instead of calling this service directly.

**Keeps (synchronous):** the `Auth.ValidateToken` gRPC **client** call on connection handshake
(server-side revocation cannot be done from the JWT signature alone).

Not yet implemented in code — Phase 0 lands the ADR, Avro schemas, and Kafka infra only.

## Protobuf event serde — implemented (Kafka task `01`)

The event schemas are now **Protobuf**, not Avro: `maichess-api-contracts/protos/events/v1/`
(`socket_outbound.proto`, package `maichess.events.v1` — `SocketPush` rides the `OutboundEvent`
envelope). They mirror the `events/v1/*.avsc` field-for-field; the `.avsc` files stay in place until
each topic cuts over (task `02`).

Contracts **v0.6.0** is published; `@maichess/platform-protos` is pinned at `^0.6.0` in
`package.json`. Done:

1. `src/kafka/protobuf-serde.ts` — `decodeOutboundEvent` / `encodeOutboundEvent` over the ts-proto
   `OutboundEvent` type, handling the Confluent Schema-Registry **Protobuf** wire framing
   (magic byte + schema id + message-index header). Serde plumbing only; **the consumer
   (`src/kafka/consumer.ts`) still reads Avro** — switching it to dual-read is task `02`.
2. `src/kafka/protobuf-serde.test.ts` — round-trips both `SocketPush` target variants and asserts
   the framing guard. Run with `npm test` (Node test runner + ts-node loader).

**Local verify pending (auth handoff):** a fresh agent shell has no `GITHUB_TOKEN`, so
`npm install` cannot pull `@maichess/platform-protos@0.6.0` from GitHub Packages (401). Run
`npm install && npm run build && npm test` where the token is available to confirm.

## socket.outbound.v1 migrated to Protobuf (Kafka task `02`)

The consumer now **dual-reads**: `src/kafka/consumer.ts` reads the Confluent schema id
(`readSchemaId`), asks the registry whether it is `PROTOBUF` (cached per id), and decodes via
`decodeOutboundEvent` (proto) or `registry.decode` (Avro). Both arms project onto a normalized push
(`src/kafka/outbound-decode.ts` — `fromProto` / `fromAvro`) that the dispatcher fans out. A decode
failure now WARN-logs instead of dropping silently (the socket caveat's root cause).

`npm install && npm run build && npm test` **succeeded locally** (12 tests; the 401 above did not
recur). The Avro read arm is retained until the registry is removed (task `09`); nothing produces
Avro to this topic any more, and the `.avsc` is retired.

---

## Kafka task 09 — Socket gRPC server removed; `socket.proto` stubbed → PUBLISH HANDOFF

Real-time delivery is now fully event-driven: this service consumes `socket.outbound.v1` and fans
out. The Socket gRPC **server** (`src/grpc/server.ts`, `EmitEvent` + `BroadcastMatchEvent`) is
deleted and its bootstrap removed from `index.ts`; only the `Auth.ValidateToken` gRPC **client**
remains. `socket.proto` is reduced to a version-history stub (like `analysis.proto`) — the `Socket`
service + all four messages are gone. `GRPC_PORT` is now unused (the deploy dropped the 50051 port).
`tsc` clean; 5 tests pass.

**Blocked on a contract publish** (shared with engine/match-manager): user commits, tags `vX.Y.Z`,
pushes. **Post-publish:** bump `@maichess/platform-protos` in `package.json` to the new version,
`npm install && npm run build && npm test`. No code change expected — the server already imports
nothing from the stubbed `socket.proto`.
