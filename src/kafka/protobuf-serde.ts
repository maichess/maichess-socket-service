import { OutboundEvent } from '@maichess/platform-protos/events/v1/socket_outbound';

// Raw-Protobuf serde for the socket.outbound.v1 topic. Kafka task 09 removed the
// Confluent Schema Registry: messages are the bare Protobuf wire bytes, with the
// schema owned solely by maichess-api-contracts (the C# producers now emit raw
// OutboundEvent.ToByteArray() too).

// Decodes a raw-Protobuf socket.outbound.v1 message into the ts-proto OutboundEvent.
export function decodeOutboundEvent(buffer: Buffer): OutboundEvent {
  return OutboundEvent.decode(buffer);
}

// Encodes an OutboundEvent to raw Protobuf bytes (used by the round-trip test).
export function encodeOutboundEvent(event: OutboundEvent): Buffer {
  return Buffer.from(OutboundEvent.encode(event).finish());
}
