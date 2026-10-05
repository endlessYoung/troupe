export interface L10n {
  en: string;
  'zh-CN': string;
}

export interface SquadConfig {
  id: string;
  name: L10n;
  color: string;
  lead: string;
  members: string[];
}

export interface MemberConfig {
  id: string;
  role: L10n;
  aliases: string[];
  duty: L10n;
  station: string;
  zone: string;
  squad: string;
  color: string;
  lead: boolean;
  task: L10n;
  progress: number;
  output: L10n[];
}

export interface StationConfig {
  id: string;
  name: L10n;
  zone: string;
  summary: L10n;
}

export interface ZoneConfig {
  id: string;
  name: L10n;
  phase: string;
  squad: string;
}

export interface PhaseConfig {
  id: string;
  name: L10n;
  status: 'done' | 'active' | 'todo';
}

export interface ReviewItem {
  id: string;
  round: number;
  reviewer: string;
  text: L10n;
  resolution: L10n;
}

export interface SpeechLine {
  actor: string;
  line: L10n;
}

export interface DirectMessage {
  from: string;
  to: string;
  text: L10n;
}

export interface ScoreLine {
  from: string;
  to: string;
  score: number;
  axis: 'up' | 'down' | 'peer';
}

export interface DockSnapshot {
  status: 'reviewing' | 'idle';
  progress: number;
  total: number;
}

export interface TeamConfig {
  team: { id: string; name: L10n };
  tagline: L10n;
  chairman: { id: string; name: L10n; note: L10n };
  squads: SquadConfig[];
  members: MemberConfig[];
  stations: StationConfig[];
  zones: ZoneConfig[];
  phases: PhaseConfig[];
  stats: {
    reviewClosed: number;
    reviewTotal: number;
    backlogTotal: number;
    backlogP0: number;
    testCases: number;
    mvpScope: L10n;
    crossPlatform: L10n;
    adr: { id: string; title: L10n }[];
  };
  todos: L10n[];
  assets: { id: string; title: L10n }[];
  reviews: ReviewItem[];
  reviewAgenda: L10n;
  standup: SpeechLine[];
  weekly: SpeechLine;
  dms: DirectMessage[];
  huddle: { attendees: string[]; outcome: L10n };
  signoff: {
    summary: L10n;
    present: L10n;
    approved: L10n;
    rejected: L10n;
  };
  scores: ScoreLine[];
  scoreSummary: L10n;
  escalation: { level: 'P0' | 'P1'; actor: string; action: L10n }[];
  costs: { budget: number; thresholds: number[]; baseline: number };
  docks: Record<string, DockSnapshot>;
  handoffs: { actor: string; title: L10n; fromZone: string; toZone: string }[];
}

export type ConfigResult =
  | { ok: true; config: TeamConfig }
  | { ok: false; errors: string[] };
