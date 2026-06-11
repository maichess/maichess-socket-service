import { test } from 'node:test';
import assert from 'node:assert/strict';
import { OutboundEvent } from '@maichess/platform-protos/events/v1/socket_outbound';
import { decodeOutboundEvent, encodeOutboundEvent } from './protobuf-serde';

// Round-trips the ts-proto OutboundEvent through raw Protobuf bytes (encode -> decode)
// for both SocketPush target variants the socket service fans out: a user-targeted push
// (matched) and a match-targeted push (move_made). Kafka task 09 removed the Confluent
// framing; the wire bytes are now the bare Protobuf payload.

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

  const decoded = decodeOutboundEvent(encodeOutboundEvent(original));

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

  const decoded = decodeOutboundEvent(encodeOutboundEvent(original));

  assert.deepEqual(decoded, original);
  assert.equal(decoded.push?.targetMatchId, 'm1');
  assert.equal(decoded.push?.targetUserId, undefined);
});
