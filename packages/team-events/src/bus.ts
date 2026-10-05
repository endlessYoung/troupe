import type { EventAdapter, TeamEvent, TeamEventInput, TeamEventListener, TeamEventsApi } from './types';

const LOG_LIMIT = 400;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

export function createTeamEvents(): TeamEventsApi {
  const listeners = new Set<TeamEventListener>();
  const log: TeamEvent[] = [];
  let adapter: EventAdapter | null = null;

  const api: TeamEventsApi = {
    push(input: TeamEventInput): TeamEvent | null {
      if (!input || typeof input.type !== 'string' || typeof input.actor !== 'string') {
        return null;
      }
      if (typeof input.action !== 'string') return null;
      const event: TeamEvent = {
        type: input.type,
        actor: input.actor,
        action: input.action,
        ts: typeof input.ts === 'number' ? input.ts : Date.now(),
        payload: isRecord(input.payload) ? input.payload : undefined,
      };
      log.push(event);
      if (log.length > LOG_LIMIT) log.splice(0, log.length - LOG_LIMIT);
      for (const listener of listeners) listener(event);
      return event;
    },
    subscribe(listener: TeamEventListener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    getLog() {
      return log;
    },
    setAdapter(next: EventAdapter | null) {
      adapter?.stop();
      adapter = next;
      if (adapter) adapter.start((event) => api.push(event));
    },
  };

  return api;
}

declare global {
  interface Window {
    TeamEvents: TeamEventsApi;
  }
}

export function installTeamEvents(api: TeamEventsApi): void {
  window.TeamEvents = api;
}
