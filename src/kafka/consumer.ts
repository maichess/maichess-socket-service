import { Kafka, logLevel } from 'kafkajs';
import { broadcastToMatch, emitToUser } from '../socket/manager';
import { decodeOutboundEvent } from './protobuf-serde';
import { fromProto, NormalizedPush } from './outbound-decode';

const TOPIC = 'socket.outbound.v1';
const GROUP_ID = 'socket-service';

export async function startOutboundConsumer(): Promise<void> {
  const bootstrap = process.env.KAFKA_BOOTSTRAP;

  if (!bootstrap) {
    console.warn('KAFKA_BOOTSTRAP not set; socket.outbound consumer disabled');
    return;
  }

  const kafka = new Kafka({
    clientId: GROUP_ID,
    brokers: bootstrap.split(','),
    logLevel: logLevel.WARN,
  });
  const consumer = kafka.consumer({ groupId: GROUP_ID });

  await consumer.connect();
  await consumer.subscribe({ topic: TOPIC, fromBeginning: false });

  await consumer.run({
    eachMessage: async ({ message }) => {
      if (!message.value) return;
      try {
        const push = fromProto(decodeOutboundEvent(message.value));
        if (push) dispatch(push);
      } catch (err) {
        // Fire-and-forget hop: a decode failure must be visible, not a silent drop
        // (the root cause of the socket caveat task 02 resolves).
        console.warn('Failed to decode socket.outbound message; dropping', err);
      }
    },
  });

  console.log(`Kafka consumer subscribed to ${TOPIC}`);
}

function dispatch(push: NormalizedPush): void {
  if (!push.eventName) return;

  let body: unknown = {};
  if (push.payloadJson) {
    try {
      body = JSON.parse(push.payloadJson);
    } catch {
      console.warn(`Invalid payload_json for ${push.eventName}`);
      return;
    }
  }

  if (push.targetMatchId) {
    broadcastToMatch(push.targetMatchId, push.eventName, body);
  } else if (push.targetUserId) {
    emitToUser(push.targetUserId, push.eventName, body);
  }
}
