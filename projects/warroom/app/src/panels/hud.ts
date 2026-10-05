import { pickL10n, resolveMember, type TeamConfig } from '@troupe/team-config';
import type { I18n } from '../i18n';
import type { SceneCopy } from '../scene/campus';
import { onlineCount, type WarState } from '../state/store';
import { ago, feedLine } from './render';

export interface HudHosts {
  brand: HTMLElement;
  tools: HTMLElement;
  ticker: HTMLElement;
  dock: HTMLElement;
}

export interface HudView {
  night: boolean;
  touring: boolean;
  focus: string | null;
}

/** Rooms in the order the number keys reach them, left to right along each row. */
export const DOCK_ORDER = ['backlog', 'command', 'design', 'build', 'release', 'review', 'test'];

function h<K extends keyof HTMLElementTagNameMap>(tag: K, className?: string, text?: string): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}

function button(className: string, act: string, text?: string): HTMLButtonElement {
  const node = h('button', className, text);
  node.type = 'button';
  node.dataset.act = act;
  return node;
}

export function sceneCopy(config: TeamConfig, state: WarState, i18n: I18n): SceneCopy {
  const t = i18n.t.bind(i18n);
  const active = config.phases.find((phase) => state.phases.find((item) => item.id === phase.id)?.status === 'active');
  const alert = state.alert?.active ? state.alert : null;
  return {
    suspended: t('member.suspended'),
    dm: t('member.dm'),
    status: {
      idle: t('member.idle'),
      working: t('member.working'),
      reviewing: t('member.reviewing'),
      meeting: t('member.meeting'),
      huddle: t('member.huddle'),
      dm: t('member.dm'),
    },
    metrics: {
      backlog: t('metric.backlog', { p0: config.stats.backlogP0, total: config.stats.backlogTotal }),
      design: t('metric.design'),
      review: t('metric.review', { closed: state.reviewClosed, total: state.reviewTotal }),
      build: t('metric.build', { n: state.chips.filter((chip) => chip.toZone === 'build').length }),
      test: t('metric.test', { n: config.stats.testCases }),
      release: t(state.gate === 'open' ? 'metric.release_open' : 'metric.release_shut'),
      command: t('metric.command', { n: Math.round(state.tokenRatio) }),
      inception: t('metric.inception'),
    },
    screen: {
      title: active ? `${active.id.toUpperCase()} ${pickL10n(active.name, i18n.locale)} · ${t('phase.active')}` : 'troupe',
      urgent: Boolean(alert),
      lines: [
        alert ? `${alert.level} · ${pickL10n(alert.text, i18n.locale)}` : t('screen.a3'),
        t('screen.reviews', { closed: state.reviewClosed, total: state.reviewTotal }),
        t('screen.tokens', { n: Math.round(state.tokenRatio) }),
        t('screen.assets', { n: state.assets }),
      ],
    },
  };
}

export function renderHud(hosts: HudHosts, config: TeamConfig, state: WarState, i18n: I18n, view: HudView): void {
  renderBrand(hosts.brand, config, state, i18n);
  renderTools(hosts.tools, i18n, view);
  renderTicker(hosts.ticker, config, state, i18n);
  renderDock(hosts.dock, config, state, i18n, view);
}

function renderBrand(host: HTMLElement, config: TeamConfig, state: WarState, i18n: I18n): void {
  host.replaceChildren();
  const head = h('div', 'brand-head');
  const live = h('span', 'live');
  live.append(h('i', 'live-dot'), h('span', undefined, i18n.t('hud.live')), h('time', 'clock'));
  head.append(h('strong', 'wordmark', 'troupe'), h('span', 'team', pickL10n(config.team.name, i18n.locale)), live);

  const rail = h('ol', 'rail');
  for (const phase of config.phases) {
    const status = state.phases.find((item) => item.id === phase.id)?.status ?? phase.status;
    const step = h('li', `is-${status}`);
    step.append(h('b', undefined, phase.id.toUpperCase()), h('span', undefined, pickL10n(phase.name, i18n.locale)));
    rail.append(step);
  }

  const stats = button('stats', 'board:kpis');
  const ratio = Math.round(state.tokenRatio);
  const band = ratio >= 100 ? 'is-hot' : ratio >= 85 ? 'is-warm' : '';
  const cells: [string, string, string][] = [
    [i18n.t('hud.reviews'), `${state.reviewClosed}/${state.reviewTotal}`, ''],
    [i18n.t('hud.assets'), String(state.assets), ''],
    [i18n.t('hud.tokens'), `${ratio}%`, band],
    [i18n.t('hud.online'), `${onlineCount(state)}/${config.members.length}`, ''],
  ];
  for (const [label, value, tone] of cells) {
    const cell = h('span', `stat ${tone}`);
    cell.append(h('small', undefined, label), h('b', undefined, value));
    stats.append(cell);
  }
  const gauge = h('span', `gauge ${band}`);
  gauge.style.setProperty('--p', String(Math.min(1, ratio / 130)));
  stats.append(gauge);
  host.append(head, rail, stats);
}

function renderTools(host: HTMLElement, i18n: I18n, view: HudView): void {
  host.replaceChildren();
  host.append(
    button('tool', 'view:home', i18n.t('hud.overview')),
    button(view.touring ? 'tool is-on' : 'tool', 'view:tour', i18n.t('hud.tour')),
    button(view.night ? 'tool is-on' : 'tool', 'view:night', view.night ? i18n.t('hud.day') : i18n.t('hud.night')),
    button('tool', 'board:kpis', i18n.t('hud.boards')),
  );
  const langs = h('span', 'langs');
  langs.append(
    button(i18n.locale === 'en' ? 'is-on' : '', 'lang:en', i18n.t('lang.en')),
    button(i18n.locale === 'zh-CN' ? 'is-on' : '', 'lang:zh-CN', i18n.t('lang.zh')),
  );
  host.append(langs);
}

function renderTicker(host: HTMLElement, config: TeamConfig, state: WarState, i18n: I18n): void {
  const events = state.feed.slice(-4);
  const keys = events.map((event) => `${event.ts}:${event.type}:${event.actor}`);
  for (const row of [...host.querySelectorAll<HTMLElement>('.tick')]) {
    if (!keys.includes(row.dataset.key ?? '')) row.remove();
  }
  const locale = host.dataset.locale;
  if (locale !== i18n.locale) {
    host.replaceChildren();
    host.dataset.locale = i18n.locale;
  }
  events.forEach((event, index) => {
    const key = keys[index];
    if (host.querySelector(`[data-key="${CSS.escape(key)}"]`)) return;
    const member = resolveMember(config, event.actor);
    const row = button(event.type === 'escalation_urgent' ? 'tick is-urgent' : 'tick', member ? `pick:member:${member.id}` : 'board:feed');
    row.dataset.key = key;
    row.style.setProperty('--tone', member?.color ?? '#8a93a3');
    const time = h('time');
    time.dataset.ts = String(event.ts);
    time.textContent = ago(event.ts, i18n);
    row.append(h('i'), h('span', undefined, feedLine(event, config, i18n)), time);
    host.append(row);
  });
}

function renderDock(host: HTMLElement, config: TeamConfig, state: WarState, i18n: I18n, view: HudView): void {
  host.replaceChildren();
  const alertZone = state.alert?.active ? resolveMember(config, state.alert.actor)?.zone : undefined;
  DOCK_ORDER.forEach((id, index) => {
    const station = config.stations.find((item) => item.id === id);
    if (!station) return;
    const live =
      (id === 'review' && state.reviewLive) ||
      (id === 'command' && (state.standupLive || state.scoringLive)) ||
      (id === 'release' && state.gate === 'open') ||
      state.chips.some((chip) => chip.toZone === station.zone);
    const classes = ['room'];
    if (view.focus === `station:${id}`) classes.push('is-on');
    if (live) classes.push('is-live');
    if (alertZone === station.zone) classes.push('is-alert');
    const item = button(classes.join(' '), `pick:station:${id}`);
    item.append(h('kbd', undefined, String(index + 1)), h('span', undefined, pickL10n(station.name, i18n.locale)));
    host.append(item);
  });
  host.append(h('p', 'keys', i18n.t('hud.keys')));
}
