import { test } from 'node:test';
import assert from 'node:assert/strict';
import { OutboundEvent } from '@maichess/platform-protos/events/v1/socket_outbound';
import { encodeOutboundEvent, readSchemaId } from './protobuf-serde';
import { fromAvro, fromProto } from './outbound-decode';

// The socket.outbound.v1 consumer dual-reads during the Avro→Protobuf migration
// (Kafka task 02). These cover the schema-id discriminator and the two normalizers
// that project each wire encoding onto the shape the dispatcher fans out. The
// kafkajs/registry glue in consumer.ts is I/O and not unit-tested.

test('readSchemaId reads the big-endian id from a proto-framed message', () => {
  const framed = encodeOutboundEvent(
    OutboundEvent.fromPartial({ push: { targetUserId: 'u1', eventName: 'matched', payloadJson: '{}' } }),
    300
  );
  assert.equal(readSchemaId(framed), 300);
});

test('readSchemaId reads the id from a bare Avro-style frame', () => {
  // magic byte 0 + schema id 7 (big-endian) + arbitrary Avro body.
  const framed = Buffer.from([0x00, 0x00, 0x00, 0x00, 0x07, 0xde, 0xad]);
  assert.equal(readSchemaId(framed), 7);
});

test('readSchemaId rejects a non-framed / too-short buffer', () => {
  assert.equal(readSchemaId(Buffer.from([0x01, 0x00, 0x00, 0x00, 0x05])), undefined);
  assert.equal(readSchemaId(Buffer.from([0x00, 0x00])), undefined);
});

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

test('fromAvro normalizes a match-targeted push (bare union values)', () => {
  const push = fromAvro({
    payload: { target_user_id: null, target_match_id: 'm9', event_name: 'match_ended', payload_json: '{"status":"white_won"}' },
  });
  assert.equal(push?.targetMatchId, 'm9');
  assert.equal(push?.targetUserId, undefined);
  assert.equal(push?.eventName, 'match_ended');
});

test('fromAvro unwraps a { string: value } union and a user target', () => {
  const push = fromAvro({
    payload: {
      target_user_id: { string: 'user-7' } as unknown as string,
      target_match_id: null,
      event_name: 'matched',
      payload_json: '{}',
    },
  });
  assert.equal(push?.targetUserId, 'user-7');
  assert.equal(push?.targetMatchId, undefined);
});

test('fromAvro returns undefined for an envelope with no payload', () => {
  assert.equal(fromAvro({ payload: undefined as never }), undefined);
});
