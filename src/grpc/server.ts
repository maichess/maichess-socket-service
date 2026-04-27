import * as grpc from '@grpc/grpc-js';
import { SocketService, type SocketServer } from '@maichess/platform-protos/socket-service/v1/socket';
import { emitToUser } from '../socket/manager';

const socketImpl: SocketServer = {
  emitEvent(call, callback) {
    const { userId, event, payload } = call.request;
    const delivered = emitToUser(userId, event, payload?.toJson() ?? {});
    callback(null, { delivered });
  },
};

export function startGrpcServer(): void {
  const server = new grpc.Server();
  server.addService(SocketService, socketImpl);

  const port = process.env.GRPC_PORT ?? '50051';
  server.bindAsync(
    `0.0.0.0:${port}`,
    grpc.ServerCredentials.createInsecure(),
    (err, boundPort) => {
      if (err) {
        console.error('Failed to bind gRPC server:', err);
        process.exit(1);
      }
      console.log(`gRPC server listening on port ${boundPort}`);
    }
  );
}
