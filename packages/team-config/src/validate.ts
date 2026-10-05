import type { ConfigResult, L10n, TeamConfig } from './types';

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isL10n(value: unknown): value is L10n {
  return isRecord(value) && typeof value.en === 'string' && typeof value['zh-CN'] === 'string';
}

function needArray(data: Record<string, unknown>, key: string, errors: string[]): unknown[] {
  const value = data[key];
  if (!Array.isArray(value) || value.length === 0) {
    errors.push(`${key} must be a non-empty array`);
    return [];
  }
  return value;
}

export function validateConfig(input: unknown): ConfigResult {
  const errors: string[] = [];
  if (!isRecord(input)) return { ok: false, errors: ['config must be an object'] };

  if (!isRecord(input.team) || typeof input.team.id !== 'string' || !isL10n(input.team.name)) {
    errors.push('team.id and team.name are required');
  }
  if (!isL10n(input.tagline)) errors.push('tagline must be localized');
  if (!isRecord(input.chairman) || !isL10n(input.chairman.name) || !isL10n(input.chairman.note)) {
    errors.push('chairman name and note are required');
  }

  const members = needArray(input, 'members', errors);
  const memberIds = new Set<string>();
  for (const member of members) {
    if (!isRecord(member) || typeof member.id !== 'string' || !isL10n(member.role)) {
      errors.push('each member needs id and role');
      continue;
    }
    memberIds.add(member.id);
    if (!Array.isArray(member.aliases)) errors.push(`member ${member.id} needs aliases`);
    if (typeof member.zone !== 'string' || typeof member.station !== 'string') {
      errors.push(`member ${member.id} needs zone and station`);
    }
  }

  for (const key of ['squads', 'stations', 'zones', 'phases', 'reviews', 'standup', 'assets']) {
    needArray(input, key, errors);
  }

  if (!isRecord(input.stats)) errors.push('stats is required');
  else {
    for (const key of ['reviewClosed', 'reviewTotal', 'backlogTotal', 'backlogP0', 'testCases']) {
      if (typeof input.stats[key] !== 'number') errors.push(`stats.${key} must be a number`);
    }
  }

  if (!isRecord(input.costs) || !Array.isArray(input.costs.thresholds)) {
    errors.push('costs.thresholds is required');
  }
  if (!Array.isArray(input.todos)) errors.push('todos must be an array');
  if (!isL10n(input.reviewAgenda)) errors.push('reviewAgenda must be localized');
  if (!isRecord(input.weekly) || !isL10n(input.weekly.line)) errors.push('weekly line is required');
  if (!Array.isArray(input.dms) || input.dms.length === 0) errors.push('dms must be a non-empty array');
  if (!isRecord(input.huddle) || !Array.isArray(input.huddle.attendees) || !isL10n(input.huddle.outcome)) {
    errors.push('huddle attendees and outcome are required');
  }
  if (!isRecord(input.signoff)) errors.push('signoff script is required');
  if (!Array.isArray(input.scores) || !isL10n(input.scoreSummary)) errors.push('scores are required');
  if (!Array.isArray(input.escalation) || input.escalation.length === 0) {
    errors.push('escalation scripts are required');
  }
  if (!isRecord(input.docks)) errors.push('docks snapshot is required');
  if (!Array.isArray(input.handoffs)) errors.push('handoffs are required');

  if (members.length > 0 && memberIds.size !== members.length) {
    errors.push('member ids must be unique');
  }

  if (errors.length > 0) return { ok: false, errors };
  return { ok: true, config: input as unknown as TeamConfig };
}

export function pickL10n(text: L10n, locale: string): string {
  if (locale === 'zh-CN') return text['zh-CN'] || text.en;
  return text.en || text['zh-CN'];
}

export function resolveMember(config: TeamConfig, actor: string) {
  const needle = actor.trim().toLowerCase();
  return config.members.find((member) => {
    if (member.id.toLowerCase() === needle) return true;
    if (member.role.en.toLowerCase() === needle || member.role['zh-CN'] === actor.trim()) return true;
    return member.aliases.some((alias) => alias.toLowerCase() === needle || alias === actor.trim());
  });
}
