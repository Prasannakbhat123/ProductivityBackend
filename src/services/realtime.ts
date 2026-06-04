import type { Response } from 'express';

type Client = {
  id: number;
  response: Response;
};

let sequence = 0;
const clients = new Map<number, Client>();

export function addRealtimeClient(response: Response): number {
  sequence += 1;
  const id = sequence;
  clients.set(id, { id, response });
  return id;
}

export function removeRealtimeClient(id: number): void {
  clients.delete(id);
}

export function publishRealtimeEvent(event: string, payload: unknown): void {
  const body = `event: ${event}\ndata: ${JSON.stringify(payload)}\n\n`;
  for (const { response } of clients.values()) {
    response.write(body);
  }
}
