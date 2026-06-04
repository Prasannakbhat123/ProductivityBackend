import { Router } from 'express';
import { addRealtimeClient, removeRealtimeClient } from '../services/realtime';

export const realtimeRoutes = Router();

realtimeRoutes.get('/stream', (request, response) => {
  response.setHeader('Content-Type', 'text/event-stream');
  response.setHeader('Cache-Control', 'no-cache');
  response.setHeader('Connection', 'keep-alive');
  response.flushHeaders();

  response.write('event: connected\ndata: {"ok":true}\n\n');

  const clientId = addRealtimeClient(response);

  const keepAlive = setInterval(() => {
    response.write('event: ping\ndata: {}\n\n');
  }, 25000);

  request.on('close', () => {
    clearInterval(keepAlive);
    removeRealtimeClient(clientId);
    response.end();
  });
});
