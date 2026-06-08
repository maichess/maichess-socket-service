import { Kafka, logLevel } from 'kafkajs';
import { SchemaRegistry } from '@kafkajs/confluent-schema-registry';
import { broadcastToMatch, emitToUser } from '../socket/manager';

const TOPIC = 'socket.outbound.v1';
const GROUP_ID = 'socket-service';

// Mirrors the SocketPush record in
// maichess-api-contracts/events/v1/socket.outbound.v1.avsc
interface SocketPush {
  target_user_id: string | null;
  target_match_id: string | null;
  event_name: string;
  payload_json: string;
}

interface OutboundEnvelope {
  payload: SocketPush;
}

export async function startOutboundConsumer(): Promise<void> {
  const bootstrap = process.env.KAFKA_BOOTSTRAP;
  const registryUrl = process.env.SCHEMA_REGISTRY_URL;

  if (!bootstrap || !registryUrl) {
    console.warn(
      'KAFKA_BOOTSTRAP / SCHEMA_REGISTRY_URL not set; socket.outbound consumer disabled'
    );
    return;
  }

  const kafka = new Kafka({
    clientId: GROUP_ID,
    brokers: bootstrap.split(','),
    logLevel: logLevel.WARN,
  });
  const registry = new SchemaRegistry({ host: registryUrl });
  const consumer = kafka.consumer({ groupId: GROUP_ID });

  await consumer.connect();
  await consumer.subscribe({ topic: TOPIC, fromBeginning: false });

  await consumer.run({
    eachMessage: async ({ message }) => {
      if (!message.value) return;
      try {
        const envelope = (await registry.decode(message.value)) as OutboundEnvelope;
        dispatch(envelope.payload);
      } catch (err) {
        console.error('Failed to handle socket.outbound message', err);
      }
    },
  });

  console.log(`Kafka consumer subscribed to ${TOPIC}`);
}

function dispatch(push: SocketPush): void {
  if (!push?.event_name) return;

  let body: unknown = {};
  if (push.payload_json) {
    try {
      body = JSON.parse(push.payload_json);
    } catch {
      console.error(`Invalid payload_json for ${push.event_name}`);
      return;
    }
  }

  const matchId = unwrap(push.target_match_id);
  const userId = unwrap(push.target_user_id);

  if (matchId) {
    broadcastToMatch(matchId, push.event_name, body);
  } else if (userId) {
    emitToUser(userId, push.event_name, body);
  }
}

// Avro nullable unions (["null","string"]) may decode either to the bare value
// or wrapped as { string: value } depending on the codec. Normalize both.
function unwrap(value: unknown): string | undefined {
  if (value === null || value === undefined) return undefined;
  if (typeof value === 'string') return value.length > 0 ? value : undefined;
  if (typeof value === 'object') {
    const inner = Object.values(value as Record<string, unknown>)[0];
    return typeof inner === 'string' && inner.length > 0 ? inner : undefined;
  }
  return undefined;
}
