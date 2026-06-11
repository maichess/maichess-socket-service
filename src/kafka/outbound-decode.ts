import { OutboundEvent } from '@maichess/platform-protos/events/v1/socket_outbound';

// socket.outbound.v1 is raw Protobuf (Kafka task 09 removed the Schema Registry and the
// transitional Avro arm). The decoded envelope is projected onto this normalized push so
// the dispatcher has one shape.
export interface NormalizedPush {
  targetUserId?: string;
  targetMatchId?: string;
  eventName: string;
  payloadJson: string;
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
