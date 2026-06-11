import { test } from 'node:test';
import assert from 'node:assert/strict';
import { OutboundEvent } from '@maichess/platform-protos/events/v1/socket_outbound';
import { fromProto } from './outbound-decode';

// socket.outbound.v1 is raw Protobuf (Kafka task 09 removed the Schema Registry and the
// transitional Avro arm). These cover the normalizer that projects the decoded envelope
// onto the shape the dispatcher fans out. The kafkajs glue in consumer.ts is I/O and not
// unit-tested.

test('fromProto normalizes a user-targeted push', () => {
  const push = fromProto(
    OutboundEvent.fromPartial({ push: { targetUserId: 'user-1', eventName: 'matched', payloadJson: '{"match_id":"m1"}' } })
  );
  assert.equal(push?.targetUserId, 'user-1');
  assert.equal(push?.targetMatchId, undefined);
  assert.equal(push?.eventName, 'matched');
  assert.equal(push?.payloadJson, '{"match_id":"m1"}');
});

test('fromProto normalizes a match-targeted push', () => {
  const push = fromProto(
    OutboundEvent.fromPartial({ push: { targetMatchId: 'm1', eventName: 'move_made', payloadJson: '{"move":"e2e4"}' } })
  );
  assert.equal(push?.targetMatchId, 'm1');
  assert.equal(push?.targetUserId, undefined);
  assert.equal(push?.eventName, 'move_made');
});

test('fromProto returns undefined when there is no push', () => {
  assert.equal(fromProto(OutboundEvent.fromPartial({})), undefined);
});
