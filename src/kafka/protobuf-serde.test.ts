import { test } from 'node:test';
import assert from 'node:assert/strict';
import { OutboundEvent } from '@maichess/platform-protos/events/v1/socket_outbound';
import { decodeOutboundEvent, encodeOutboundEvent } from './protobuf-serde';

// Round-trips the ts-proto OutboundEvent through the Confluent Protobuf framing
// (encode -> decode) for both SocketPush target variants the socket service
// fans out: a user-targeted push (matched) and a match-targeted push (move_made).
// Proves the proto schema carries the same fields the socket.outbound.v1 .avsc
// did, before the consumer is switched off Avro (task 02).

const SCHEMA_ID = 42;

function envelope(push: OutboundEvent['push']): OutboundEvent {
  return OutboundEvent.fromPartial({
    eventId: 'e1',
    eventType: 'socket.outbound',
    aggregateId: 'user-1',
    occurredAt: 1_700_000_000_000,
    producer: 'match-manager-service',
    push,
  });
}

test('user-targeted push round-trips and keeps target_user_id', () => {
  const original = envelope({
    targetUserId: 'user-1',
    eventName: 'matched',
    payloadJson: '{"match_id":"m1"}',
  });

  const decoded = decodeOutboundEvent(encodeOutboundEvent(original, SCHEMA_ID));

  assert.deepEqual(decoded, original);
  assert.equal(decoded.push?.targetUserId, 'user-1');
  assert.equal(decoded.push?.targetMatchId, undefined);
});

test('match-targeted push round-trips and keeps target_match_id', () => {
  const original = envelope({
    targetMatchId: 'm1',
    eventName: 'move_made',
    payloadJson: '{"move":"e2e4"}',
  });

  const decoded = decodeOutboundEvent(encodeOutboundEvent(original, SCHEMA_ID));

  assert.deepEqual(decoded, original);
  assert.equal(decoded.push?.targetMatchId, 'm1');
  assert.equal(decoded.push?.targetUserId, undefined);
});

test('rejects a buffer without the Confluent magic byte', () => {
  const unframed = Buffer.from(OutboundEvent.encode(envelope(undefined)).finish());
  assert.throws(() => decodeOutboundEvent(unframed), /not Confluent-framed/);
});
