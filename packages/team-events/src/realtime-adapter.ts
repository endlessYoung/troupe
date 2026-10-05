import type { EventAdapter, TeamEventInput } from './types';

/**
 * REAL-SOURCE: drop-in producer for live agent events.
 * Replace `start` with a WebSocket or SSE client that calls `push`
 * for each server frame. Renderers subscribe to TeamEvents and do not change.
 */
export class RealtimeAdapter implements EventAdapter {
  start(_push: (event: TeamEventInput) => void): void {
    // REAL-SOURCE: connect WebSocket or SSE here and forward frames to push().
  }

  stop(): void {
    // REAL-SOURCE: close the socket or stream here.
  }
}
