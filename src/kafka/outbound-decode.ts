import { OutboundEvent } from '@maichess/platform-protos/events/v1/socket_outbound';

// The socket.outbound.v1 topic is mid-migration from Avro to Protobuf (Kafka task 02).
// Both decode arms project onto this normalized push so the dispatcher has one shape.
export interface NormalizedPush {
  targetUserId?: string;
  targetMatchId?: string;
  eventName: string;
  payloadJson: string;
}

// Avro-decoded SocketPush (snake_case; nullable unions may decode either to the bare
// value or wrapped as { string: value } depending on the codec).
export interface AvroSocketPush {
  target_user_id: string | null;
  target_match_id: string | null;
  event_name: string;
  payload_json: string;
}

export interface AvroOutboundEnvelope {
  payload: AvroSocketPush;
}

// Normalizes an Avro-decoded envelope. Returns undefined for a malformed envelope
// (no payload) so the consumer can drop it with a warning rather than throw.
export function fromAvro(envelope: AvroOutboundEnvelope): NormalizedPush | undefined {
  const push = envelope?.payload;
  if (!push) return undefined;
  return {
    targetUserId: unwrap(push.target_user_id),
    targetMatchId: unwrap(push.target_match_id),
    eventName: push.event_name,
    payloadJson: push.payload_json,
  };
}

// Normalizes a Protobuf OutboundEvent. The oneof target means at most one of
// targetUserId / targetMatchId is populated; empty strings normalize to undefined.
export function fromProto(event: OutboundEvent): NormalizedPush | undefined {
  const push = event?.push;
  if (!push) return undefined;
  return {
    targetUserId: emptyToUndefined(push.targetUserId),
    targetMatchId: emptyToUndefined(push.targetMatchId),
    eventName: push.eventName,
    payloadJson: push.payloadJson,
  };
}

function emptyToUndefined(value: string | undefined): string | undefined {
  return value !== undefined && value.length > 0 ? value : undefined;
}

// Avro nullable unions (["null","string"]) may decode either to the bare value or
// wrapped as { string: value } depending on the codec. Normalize both to a string.
function unwrap(value: unknown): string | undefined {
  if (value === null || value === undefined) return undefined;
  if (typeof value === 'string') return value.length > 0 ? value : undefined;
  if (typeof value === 'object') {
    const inner = Object.values(value as Record<string, unknown>)[0];
    return typeof inner === 'string' && inner.length > 0 ? inner : undefined;
  }
  return undefined;
}
