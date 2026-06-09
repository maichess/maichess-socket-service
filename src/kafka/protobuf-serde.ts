import { OutboundEvent } from '@maichess/platform-protos/events/v1/socket_outbound';

// Protobuf serde for the socket.outbound.v1 topic, sitting next to the Avro
// path in consumer.ts during the per-topic migration (Kafka task 01). Nothing
// is switched to it yet — task 02 adds the dual-read step that actually decodes
// Protobuf alongside Avro in the consumer.
//
// The wire bytes follow the Confluent Schema-Registry **Protobuf** framing, the
// same envelope the C# ProtobufSerializer / ts-proto producers emit:
//
//   byte 0      magic byte (0)
//   bytes 1..4  schema id (big-endian int32)
//   message-index header (see below)
//   protobuf    the OutboundEvent payload
//
// The message-index header is a zig-zag varint count followed by that many
// zig-zag varint indexes pointing at the message type inside the schema. Our
// event schemas have a single top-level message, so the index is always [0],
// which Confluent special-cases to a single 0x00 byte. We parse the general
// form on decode for safety and emit the [0] short form on encode.

const MAGIC_BYTE = 0;

// Reads an unsigned base-128 varint, returning the value and the next offset.
function readVarint(buf: Buffer, offset: number): { value: number; offset: number } {
  let result = 0;
  let shift = 0;
  let pos = offset;
  for (;;) {
    const byte = buf[pos++];
    result |= (byte & 0x7f) << shift;
    if ((byte & 0x80) === 0) break;
    shift += 7;
  }
  return { value: result, offset: pos };
}

// Zig-zag decode (Confluent encodes the index count/values signed).
function zigzag(n: number): number {
  return (n >>> 1) ^ -(n & 1);
}

// Reads the big-endian schema id (bytes 1..4) from a Confluent-framed message, or
// returns undefined if the buffer is too short or not magic-byte framed. The dual-read
// consumer uses this id to ask the registry whether the record is Avro or Protobuf.
export function readSchemaId(buffer: Buffer): number | undefined {
  if (buffer.length < 5 || buffer[0] !== MAGIC_BYTE) return undefined;
  return buffer.readInt32BE(1);
}

// Strips the Confluent framing and returns the bare protobuf payload bytes.
function unframe(buffer: Buffer): Buffer {
  if (buffer.length < 5 || buffer[0] !== MAGIC_BYTE) {
    throw new Error('socket.outbound message is not Confluent-framed');
  }
  let offset = 5; // skip magic byte + 4-byte schema id
  const count = readVarint(buffer, offset);
  offset = count.offset;
  // count 0 is the [0] short form; otherwise skip `size` index varints.
  const size = zigzag(count.value);
  for (let i = 0; i < size; i++) {
    offset = readVarint(buffer, offset).offset;
  }
  return buffer.subarray(offset);
}

// Decodes a Confluent-framed socket.outbound.v1 message into the ts-proto
// OutboundEvent. Used by the consumer once task 02 switches it to dual-read.
export function decodeOutboundEvent(buffer: Buffer): OutboundEvent {
  return OutboundEvent.decode(unframe(buffer));
}

// Frames an OutboundEvent in the Confluent Protobuf wire format. Only used by
// the round-trip test in task 01 (no producer here yet); kept symmetric with
// decodeOutboundEvent so the test exercises the real framing.
export function encodeOutboundEvent(event: OutboundEvent, schemaId: number): Buffer {
  const header = Buffer.alloc(6);
  header.writeUInt8(MAGIC_BYTE, 0);
  header.writeInt32BE(schemaId, 1);
  header.writeUInt8(0, 5); // [0] message-index short form
  return Buffer.concat([header, Buffer.from(OutboundEvent.encode(event).finish())]);
}
