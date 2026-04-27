import * as grpc from '@grpc/grpc-js';
import { AuthClient } from '@maichess/platform-protos/auth-service/v1/auth';

const client = new AuthClient(
  process.env.AUTH_SERVICE_GRPC_ADDR!,
  grpc.credentials.createInsecure()
);

export function validateToken(accessToken: string): Promise<{ valid: boolean; userId: string; username: string }> {
  return new Promise((resolve, reject) => {
    client.validateToken({ accessToken }, (err, response) => {
      if (err) return reject(err);
      resolve(response!);
    });
  });
}
