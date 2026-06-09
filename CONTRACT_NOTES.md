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

## Protobuf event serde — pending v0.6.0 publish (Kafka task `01`)

The event schemas are now **Protobuf**, not Avro: `maichess-api-contracts/protos/events/v1/`
(`socket_outbound.proto`, package `maichess.events.v1` — `SocketPush` rides the `OutboundEvent`
envelope). They mirror the `events/v1/*.avsc` field-for-field; the `.avsc` files stay in place until
each topic cuts over (task `02`).

**Blocked on the contracts publish** (publish-first — see
[serialization-protobuf-migration.md](../../maichess-knowledge-base/knowledge/architecture/serialization-protobuf-migration.md)):

1. The user tags/pushes contracts **v0.6.0** so the generated `events/v1` ts-proto types ship in
   `@maichess/platform-protos`. A fresh agent shell cannot restore the just-published version.
2. Bump `@maichess/platform-protos` in `package.json` from `^0.3.2` → `^0.6.0`.
3. Add the ts-proto `OutboundEvent` types + the Confluent **Protobuf** deserializer next to the
   existing Avro one in `src/kafka/consumer.ts`. Serde plumbing only; **the consumer is not switched
   to read Protobuf in task `01`** (that is task `02`'s dual-read step).

Cannot build or test until step 1–2 land.
