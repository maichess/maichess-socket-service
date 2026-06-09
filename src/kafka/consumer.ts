import { Kafka, logLevel } from 'kafkajs';
import { SchemaRegistry } from '@kafkajs/confluent-schema-registry';
import { broadcastToMatch, emitToUser } from '../socket/manager';
import { decodeOutboundEvent, readSchemaId } from './protobuf-serde';
import {
  AvroOutboundEnvelope,
  fromAvro,
  fromProto,
  NormalizedPush,
} from './outbound-decode';

const TOPIC = 'socket.outbound.v1';
const GROUP_ID = 'socket-service';

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

  // schema id -> isProtobuf. The topic carries both Avro and Protobuf during the
  // migration; the two encodings share the Confluent framing and differ only in the
  // schema id's registry type, so we resolve each id once and route accordingly.
  const isProtobuf = new Map<number, boolean>();

  await consumer.connect();
  await consumer.subscribe({ topic: TOPIC, fromBeginning: false });

  await consumer.run({
    eachMessage: async ({ message }) => {
      if (!message.value) return;
      try {
        const push = await decode(message.value, registry, registryUrl, isProtobuf);
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

async function decode(
  value: Buffer,
  registry: SchemaRegistry,
  registryUrl: string,
  cache: Map<number, boolean>
): Promise<NormalizedPush | undefined> {
  const schemaId = readSchemaId(value);
  if (schemaId === undefined) {
    console.warn('Dropping non-Confluent-framed socket.outbound message');
    return undefined;
  }

  if (await schemaIsProtobuf(schemaId, registryUrl, cache)) {
    return fromProto(decodeOutboundEvent(value));
  }

  return fromAvro((await registry.decode(value)) as AvroOutboundEnvelope);
}

async function schemaIsProtobuf(
  schemaId: number,
  registryUrl: string,
  cache: Map<number, boolean>
): Promise<boolean> {
  const cached = cache.get(schemaId);
  if (cached !== undefined) return cached;

  // Confluent registry: GET /schemas/ids/{id} returns { schemaType } — absent means AVRO.
  const res = await fetch(`${registryUrl}/schemas/ids/${schemaId}`);
  const body = (await res.json()) as { schemaType?: string };
  const proto = body.schemaType === 'PROTOBUF';
  cache.set(schemaId, proto);
  return proto;
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
