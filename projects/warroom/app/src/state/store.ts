import { resolveMember, type L10n, type TeamConfig } from '@troupe/team-config';
import type { TeamEvent, TeamEventsApi } from '@troupe/team-events';

export interface MemberRuntime {
  id: string;
  online: boolean;
  suspended: boolean;
  status: 'idle' | 'working' | 'reviewing' | 'meeting' | 'huddle' | 'dm';
  task: L10n | null;
  progress: number;
  output: L10n[];
  slot: number;
}

export interface ChipRuntime {
  id: string;
  title: L10n;
  fromZone: string;
  toZone: string;
  ts: number;
}

export interface ReviewLine {
  id: string;
  reviewer: string;
  text: L10n;
  closed: boolean;
  ts: number;
}

export interface SpeechRuntime {
  actor: string;
  line: L10n;
  ts: number;
}

export interface ScoreRuntime {
  from: string;
  to: string;
  score: number | null;
  axis: string;
  text: L10n;
  ts: number;
}

export interface SignoffRuntime {
  session: string;
  step: string;
  decision: 'approved' | 'rejected' | null;
  lines: { actor: string; text: L10n; step: string }[];
}

export interface DmRuntime {
  from: string;
  to: string;
  text: L10n | null;
  active: boolean;
}

export interface AlertRuntime {
  level: string;
  actor: string;
  text: L10n;
  ts: number;
  active: boolean;
}

export interface DockRuntime {
  status: 'reviewing' | 'idle';
  progress: number;
  total: number;
}

export interface WarState {
  reviewClosed: number;
  reviewTotal: number;
  assets: number;
  tokenRatio: number;
  tokenBudget: number;
  phases: { id: string; status: 'done' | 'active' | 'todo' }[];
  members: Record<string, MemberRuntime>;
  docks: Record<string, DockRuntime>;
  feed: TeamEvent[];
  log: TeamEvent[];
  chips: ChipRuntime[];
  reviewLines: ReviewLine[];
  reviewLive: boolean;
  reviewAttendees: string[];
  speeches: SpeechRuntime[];
  standupLive: boolean;
  huddleLive: boolean;
  huddleAttendees: string[];
  huddleOutcome: L10n | null;
  dm: DmRuntime | null;
  alert: AlertRuntime | null;
  signoff: SignoffRuntime | null;
  scores: ScoreRuntime[];
  scoringLive: boolean;
  gate: 'shut' | 'open';
  pulse: number;
}

export interface WarStore {
  get(): WarState;
  subscribe(listener: (state: WarState) => void): () => void;
}

function isL10n(value: unknown): value is L10n {
  return (
    typeof value === 'object' &&
    value !== null &&
    typeof (value as L10n).en === 'string' &&
    typeof (value as L10n)['zh-CN'] === 'string'
  );
}

export function actionText(event: TeamEvent): L10n {
  const raw = event.payload?.actionL10n;
  if (isL10n(raw)) return raw;
  return { en: event.action, 'zh-CN': event.action };
}

function asStringList(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.filter((item): item is string => typeof item === 'string');
}

function shouldFeed(event: TeamEvent): boolean {
  if (event.type === 'member_pose') return false;
  if (event.payload?.quiet === true) return false;
  return true;
}

function initialState(config: TeamConfig): WarState {
  const members: Record<string, MemberRuntime> = {};
  for (const member of config.members) {
    members[member.id] = {
      id: member.id,
      online: true,
      suspended: false,
      status: member.progress > 0 && member.progress < 1 ? 'working' : 'idle',
      task: member.task,
      progress: member.progress,
      output: [...member.output],
      slot: 0,
    };
  }
  const docks: Record<string, DockRuntime> = {};
  for (const [id, dock] of Object.entries(config.docks)) {
    docks[id] = { ...dock };
  }
  return {
    reviewClosed: config.stats.reviewClosed,
    reviewTotal: config.stats.reviewTotal,
    assets: config.assets.length,
    tokenRatio: config.costs.baseline,
    tokenBudget: config.costs.budget,
    phases: config.phases.map((phase) => ({ id: phase.id, status: phase.status })),
    members,
    docks,
    feed: [],
    log: [],
    chips: [],
    reviewLines: [],
    reviewLive: false,
    reviewAttendees: [],
    speeches: [],
    standupLive: false,
    huddleLive: false,
    huddleAttendees: [],
    huddleOutcome: null,
    dm: null,
    alert: null,
    signoff: null,
    scores: [],
    scoringLive: false,
    gate: 'shut',
    pulse: 0,
  };
}

function patch(state: WarState, id: string, partial: Partial<MemberRuntime>): void {
  const current = state.members[id];
  if (!current) return;
  if (current.suspended && partial.suspended !== false) return;
  state.members[id] = { ...current, ...partial };
}

export function createStore(config: TeamConfig, bus: TeamEventsApi): WarStore {
  let state = initialState(config);
  const listeners = new Set<(next: WarState) => void>();

  const reduce = (event: TeamEvent) => {
    const next: WarState = {
      ...state,
      members: { ...state.members },
      docks: { ...state.docks },
      phases: state.phases.map((phase) => ({ ...phase })),
      log: [...state.log, event].slice(-300),
      feed: shouldFeed(event) ? [...state.feed, event].slice(-80) : state.feed,
      pulse: state.pulse + 1,
    };
    const text = actionText(event);
    const member = resolveMember(config, event.actor);

    switch (event.type) {
      case 'task_started':
      case 'task_progress': {
        if (member) {
          const current = next.members[member.id];
          const progress =
            typeof event.payload?.progress === 'number' ? event.payload.progress : current.progress;
          const busy =
            current.status === 'meeting' ||
            current.status === 'reviewing' ||
            current.status === 'huddle' ||
            current.status === 'dm';
          patch(next, member.id, {
            task: text,
            progress: Math.max(0, Math.min(1, progress)),
            ...(busy ? {} : { status: 'working' as const }),
          });
        }
        break;
      }
      case 'task_done': {
        if (member) {
          const current = next.members[member.id];
          const same = current.output[0] && current.output[0].en === text.en && current.output[0]['zh-CN'] === text['zh-CN'];
          const output = same ? current.output : [text, ...current.output].slice(0, 6);
          patch(next, member.id, { task: text, progress: 1, output, status: 'idle' });
        }
        const manual = !isL10n(event.payload?.actionL10n);
        if (event.payload?.asset === true || manual) next.assets += 1;
        break;
      }
      case 'task_handoff': {
        const title = isL10n(event.payload?.title) ? event.payload.title : text;
        const chip: ChipRuntime = {
          id: String(event.payload?.chipId ?? `${event.ts}`),
          title,
          fromZone: String(event.payload?.fromZone ?? ''),
          toZone: String(event.payload?.toZone ?? ''),
          ts: event.ts,
        };
        next.chips = [...state.chips, chip].slice(-6);
        break;
      }
      case 'review_comment': {
        const resolve = event.payload?.resolve === true;
        if (resolve) next.reviewClosed += 1;
        else next.reviewTotal += 1;
        const reviewer = member?.id ?? event.actor;
        next.reviewLines = [
          ...state.reviewLines,
          {
            id: String(event.payload?.reviewId ?? event.ts),
            reviewer,
            text,
            closed: resolve || event.payload?.closed === true,
            ts: event.ts,
          },
        ].slice(-80);
        if (next.docks[reviewer] && !resolve) {
          const dock = next.docks[reviewer];
          next.docks[reviewer] = {
            ...dock,
            status: 'reviewing',
            progress: Math.min(dock.total, dock.progress + 1),
          };
        }
        break;
      }
      case 'meeting_speech': {
        next.speeches = [...state.speeches, { actor: member?.id ?? event.actor, line: text, ts: event.ts }].slice(-40);
        break;
      }
      case 'dm_message': {
        const to = String(event.payload?.to ?? '');
        const secret = isL10n(event.payload?.text) ? event.payload.text : null;
        const end = event.payload?.end === true;
        next.dm = {
          from: member?.id ?? event.actor,
          to,
          text: end ? (state.dm?.text ?? secret) : secret,
          active: !end,
        };
        if (member) patch(next, member.id, { status: end ? 'working' : 'dm' });
        const other = resolveMember(config, to);
        if (other) patch(next, other.id, { status: end ? 'working' : 'dm' });
        break;
      }
      case 'member_online': {
        if (member) {
          patch(next, member.id, {
            online: true,
            suspended: false,
            status: next.members[member.id].progress < 1 ? 'working' : 'idle',
          });
        }
        break;
      }
      case 'member_offline': {
        if (member) {
          const suspended = event.payload?.suspended === true;
          patch(next, member.id, { online: !suspended ? false : false, suspended, status: 'idle' });
        }
        break;
      }
      case 'member_pose': {
        const slots = event.payload?.slots;
        if (slots && typeof slots === 'object') {
          for (const [id, slot] of Object.entries(slots as Record<string, unknown>)) {
            if (typeof slot === 'number' && next.members[id]) {
              next.members[id] = { ...next.members[id], slot };
            }
          }
        }
        break;
      }
      case 'phase_changed': {
        const phaseId = String(event.payload?.phase ?? '');
        next.phases = next.phases.map((phase) => {
          if (phase.id === phaseId) return { ...phase, status: 'active' };
          if (phase.status === 'active') return { ...phase, status: 'done' };
          return phase;
        });
        break;
      }
      case 'scene_cue': {
        const scene = String(event.payload?.scene ?? '');
        const phase = String(event.payload?.phase ?? '');
        const attendees = asStringList(event.payload?.attendees);
        const status = String(event.payload?.status ?? 'working');
        if (phase === 'start') {
          for (const id of attendees) {
            if (next.members[id] && !next.members[id].suspended) {
              next.members[id] = { ...next.members[id], status: status as MemberRuntime['status'] };
            }
          }
        } else {
          for (const id of attendees) {
            const current = next.members[id];
            if (!current || current.suspended) continue;
            next.members[id] = {
              ...current,
              status: current.progress < 1 ? 'working' : 'idle',
            };
          }
        }
        if (scene === 'review') {
          next.reviewLive = phase === 'start';
          next.reviewAttendees = phase === 'start' ? attendees : state.reviewAttendees;
          const dockMap = event.payload?.dock;
          if (phase === 'start' && dockMap && typeof dockMap === 'object') {
            for (const id of Object.keys(next.docks)) {
              const total = (dockMap as Record<string, unknown>)[id];
              if (typeof total === 'number') {
                next.docks[id] = { status: 'reviewing', progress: 0, total };
              } else {
                next.docks[id] = { ...next.docks[id], status: 'idle' };
              }
            }
          }
          if (phase === 'end') {
            for (const id of Object.keys(next.docks)) {
              const dock = next.docks[id];
              next.docks[id] = { ...dock, status: 'idle', progress: dock.total };
            }
          }
        }
        if (scene === 'standup') next.standupLive = phase === 'start';
        if (scene === 'huddle') {
          next.huddleLive = phase === 'start';
          next.huddleAttendees = attendees;
        }
        if (scene === 'scoring') {
          next.scoringLive = phase === 'start';
          if (phase === 'start') next.scores = [];
        }
        break;
      }
      case 'alignment_done': {
        next.huddleOutcome = text;
        next.huddleLive = false;
        break;
      }
      case 'version_signoff': {
        const session = String(event.payload?.session ?? 'signoff');
        const step = String(event.payload?.step ?? 'summary');
        const decision =
          event.payload?.decision === 'approved' || event.payload?.decision === 'rejected'
            ? event.payload.decision
            : null;
        const prior = state.signoff && state.signoff.session === session ? state.signoff : null;
        next.signoff = {
          session,
          step,
          decision: decision ?? prior?.decision ?? null,
          lines: [...(prior?.lines ?? []), { actor: member?.id ?? event.actor, text, step }],
        };
        if (decision === 'approved') next.gate = 'open';
        if (decision === 'rejected') next.gate = 'shut';
        break;
      }
      case 'review_score': {
        const score = typeof event.payload?.score === 'number' ? event.payload.score : null;
        next.scores = [
          ...state.scores,
          {
            from: member?.id ?? event.actor,
            to: String(event.payload?.to ?? ''),
            score,
            axis: String(event.payload?.axis ?? 'summary'),
            text,
            ts: event.ts,
          },
        ].slice(-20);
        break;
      }
      case 'cost_report': {
        if (typeof event.payload?.ratio === 'number') next.tokenRatio = event.payload.ratio;
        break;
      }
      case 'escalation_urgent': {
        next.alert = {
          level: String(event.payload?.level ?? 'P1'),
          actor: member?.id ?? event.actor,
          text,
          ts: event.ts,
          active: true,
        };
        break;
      }
      case 'alert_cleared': {
        if (state.alert) next.alert = { ...state.alert, active: false };
        break;
      }
      default:
        break;
    }

    state = next;
    for (const listener of listeners) listener(state);
  };

  bus.subscribe(reduce);

  return {
    get: () => state,
    subscribe(listener) {
      listeners.add(listener);
      listener(state);
      return () => listeners.delete(listener);
    },
  };
}

export function activeTaskCount(state: WarState): number {
  return Object.values(state.members).filter((member) => member.task && member.progress < 1 && !member.suspended).length;
}

export function onlineCount(state: WarState): number {
  return Object.values(state.members).filter((member) => member.online && !member.suspended).length;
}
