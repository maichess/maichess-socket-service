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
