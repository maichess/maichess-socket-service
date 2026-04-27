import 'dotenv/config';
import http from 'http';
import express from 'express';
import { errorMiddleware } from './middleware/error';
import { createSocketManager } from './socket/manager';
import { startGrpcServer } from './grpc/server';

for (const envVar of ['AUTH_SERVICE_GRPC_ADDR']) {
  if (!process.env[envVar]) {
    throw new Error(`${envVar} environment variable is required`);
  }
}

const app = express();
const httpServer = http.createServer(app);

app.use(errorMiddleware);

const PORT = process.env.PORT ?? '3000';
httpServer.listen(Number(PORT), () => {
  console.log(`HTTP server listening on port ${PORT}`);
});

createSocketManager(httpServer);
startGrpcServer();
