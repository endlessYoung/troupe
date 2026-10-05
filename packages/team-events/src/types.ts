export const EVENT_TYPES = [
  'task_started',
  'task_progress',
  'task_done',
  'task_handoff',
  'review_comment',
  'meeting_speech',
  'dm_message',
  'member_online',
  'member_offline',
  'member_pose',
  'phase_changed',
  'report_standup',
  'report_weekly',
  'version_signoff',
  'alignment_done',
  'review_score',
  'cost_report',
  'budget_alert',
  'escalation_urgent',
  'alert_cleared',
  'scene_cue',
] as const;

export type EventType = (typeof EVENT_TYPES)[number];

export interface TeamEvent {
  type: string;
  actor: string;
  action: string;
  ts: number;
  payload?: Record<string, unknown>;
}

export type TeamEventInput = {
  type: string;
  actor: string;
  action: string;
  ts?: number;
  payload?: Record<string, unknown>;
};

export type TeamEventListener = (event: TeamEvent) => void;

export interface EventAdapter {
  start(push: (event: TeamEventInput) => TeamEvent | null): void;
  stop(): void;
}

export interface TeamEventsApi {
  push(event: TeamEventInput): TeamEvent | null;
  subscribe(listener: TeamEventListener): () => void;
  getLog(): readonly TeamEvent[];
  setAdapter(adapter: EventAdapter | null): void;
}
