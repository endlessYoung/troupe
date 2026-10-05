import { pickL10n, resolveMember, type TeamConfig } from '@troupe/team-config';
import type { TeamEvent } from '@troupe/team-events';
import type { I18n } from '../i18n';
import { actionText, activeTaskCount, onlineCount, type MemberRuntime, type WarState } from '../state/store';

export type BoardId = 'detail' | 'kpis' | 'squads' | 'timeline' | 'feed' | 'docks';

export interface PanelHosts {
  drawerBar: HTMLElement;
  kpis: HTMLElement;
  detail: HTMLElement;
  squads: HTMLElement;
  timeline: HTMLElement;
  feed: HTMLElement;
  docks: HTMLElement;
  flat: HTMLElement;
  banner: HTMLElement;
}

function h<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  className?: string,
  text?: string,
): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}

export function displayActor(config: TeamConfig, actor: string, locale: string): string {
  const member = resolveMember(config, actor);
  if (!member) return actor;
  return pickL10n(member.role, locale);
}

export function feedLine(event: TeamEvent, config: TeamConfig, i18n: I18n): string {
  if (event.type === 'dm_message') {
    return i18n.t('feed.dm', {
      a: displayActor(config, event.actor, i18n.locale),
      b: displayActor(config, String(event.payload?.to ?? ''), i18n.locale),
    });
  }
  return i18n.t('feed.item', {
    actor: displayActor(config, event.actor, i18n.locale),
    action: pickL10n(actionText(event), i18n.locale),
  });
}

export function ago(ts: number, i18n: I18n, now = Date.now()): string {
  const delta = Math.max(0, now - ts);
  if (delta < 8000) return i18n.t('feed.now');
  if (delta < 60000) return i18n.t('feed.seconds', { n: Math.floor(delta / 1000) });
  return i18n.t('feed.minutes', { n: Math.floor(delta / 60000) });
}

function statusLabel(member: MemberRuntime, i18n: I18n): string {
  if (member.suspended) return i18n.t('member.suspended');
  return i18n.t(`member.${member.status}`);
}

function tokenBand(ratio: number): string {
  if (ratio >= 120) return 'band-120';
  if (ratio >= 100) return 'band-100';
  if (ratio >= 85) return 'band-85';
  if (ratio >= 70) return 'band-70';
  return 'band-ok';
}

function meter(ratio: number, thresholds: number[]): HTMLElement {
  const wrap = h('div', 'meter');
  const fill = h('span', `meter-fill ${tokenBand(ratio)}`);
  const scale = 130;
  fill.style.width = `${Math.min(100, (ratio / scale) * 100)}%`;
  wrap.append(fill);
  for (const mark of thresholds) {
    const tick = h('i');
    tick.style.left = `${(mark / scale) * 100}%`;
    wrap.append(tick);
  }
  return wrap;
}

const BOARDS: BoardId[] = ['detail', 'kpis', 'squads', 'timeline', 'feed', 'docks'];

export function renderPanels(
  hosts: PanelHosts,
  config: TeamConfig,
  state: WarState,
  i18n: I18n,
  selection: { kind: 'member' | 'station'; id: string } | null,
  board: BoardId | null,
  showFlat: boolean,
): void {
  renderDrawerBar(hosts.drawerBar, i18n, board ?? 'detail');
  renderKpis(hosts.kpis, config, state, i18n);
  renderDetail(hosts.detail, config, state, i18n, selection);
  renderSquads(hosts.squads, config, state, i18n);
  renderTimeline(hosts.timeline, config, state, i18n);
  renderFeed(hosts.feed, config, state, i18n);
  renderDocks(hosts.docks, config, state, i18n);
  renderFlat(hosts.flat, hosts.banner, config, state, i18n, showFlat);
}

function renderDrawerBar(host: HTMLElement, i18n: I18n, board: BoardId): void {
  host.replaceChildren();
  const boards = h('div', 'board-switch');
  for (const id of BOARDS) {
    const button = h('button', id === board ? 'is-on' : '', i18n.t(`board.${id}`));
    button.type = 'button';
    button.dataset.act = `board:${id}`;
    boards.append(button);
  }
  const close = h('button', 'drawer-close', '×');
  close.type = 'button';
  close.dataset.act = 'dismiss';
  close.setAttribute('aria-label', i18n.t('scene.close'));
  host.append(boards, close);
}

function renderKpis(host: HTMLElement, config: TeamConfig, state: WarState, i18n: I18n): void {
  host.replaceChildren();
  const active = activeTaskCount(state);
  const review =
    state.reviewTotal === 0 ? '0%' : `${state.reviewClosed}/${state.reviewTotal}`;
  const cards: { label: string; value: string; act?: string; extra?: HTMLElement }[] = [
    { label: i18n.t('kpi.tasks_active'), value: String(active) },
    { label: i18n.t('kpi.review_closed'), value: review },
    { label: i18n.t('kpi.assets'), value: String(state.assets) },
    { label: i18n.t('kpi.members_online'), value: String(onlineCount(state)), act: 'open:roster' },
  ];
  for (const card of cards) {
    const node = h('button', 'kpi');
    node.type = 'button';
    if (card.act) node.dataset.act = card.act;
    node.append(h('span', 'kpi-label', card.label), h('strong', 'kpi-value', card.value));
    host.append(node);
  }
  const token = h('div', `kpi token ${tokenBand(state.tokenRatio)}`);
  token.append(
    h('span', 'kpi-label', i18n.t('kpi.tokens')),
    h('strong', 'kpi-value', `${Math.round(state.tokenRatio)}%`),
    meter(state.tokenRatio, config.costs.thresholds),
  );
  const scale = h('div', 'token-scale');
  for (const mark of config.costs.thresholds) scale.append(h('span', undefined, i18n.t('cost.mark', { n: mark })));
  token.append(scale);
  host.append(token);
}

function renderDetail(
  host: HTMLElement,
  config: TeamConfig,
  state: WarState,
  i18n: I18n,
  selection: { kind: 'member' | 'station'; id: string } | null,
): void {
  const scroll = host.scrollTop;
  host.replaceChildren();
  host.append(h('p', 'eyebrow', i18n.t('panel.detail')));
  if (!selection) {
    host.append(h('h2', undefined, pickL10n(config.team.name, i18n.locale)));
    host.append(h('p', 'muted', pickL10n(config.chairman.note, i18n.locale)));
    host.append(h('p', 'eyebrow', i18n.t('detail.todos')));
    const list = h('ul', 'plain');
    for (const todo of config.todos) list.append(h('li', undefined, pickL10n(todo, i18n.locale)));
    host.append(list);
    const roster = h('button', 'text-btn', i18n.t('detail.roster'));
    roster.type = 'button';
    roster.dataset.act = 'open:roster';
    host.append(roster);
    host.append(h('p', 'hint', i18n.t('detail.hint')));
    return;
  }
  if (selection.kind === 'member') {
    const configMember = config.members.find((item) => item.id === selection.id);
    const runtime = state.members[selection.id];
    if (!configMember || !runtime) return;
    host.append(h('h2', undefined, pickL10n(configMember.role, i18n.locale)));
    host.append(h('p', 'muted', statusLabel(runtime, i18n)));
    host.append(h('p', 'eyebrow', i18n.t('detail.duty')));
    host.append(h('p', undefined, pickL10n(configMember.duty, i18n.locale)));
    host.append(h('p', 'eyebrow', i18n.t('detail.task')));
    host.append(h('p', undefined, runtime.task ? pickL10n(runtime.task, i18n.locale) : '—'));
    host.append(h('p', 'eyebrow', i18n.t('detail.progress')));
    const bar = h('div', 'bar');
    const fill = h('span');
    fill.style.width = `${Math.round(runtime.progress * 100)}%`;
    bar.append(fill);
    host.append(bar, h('p', 'muted', `${Math.round(runtime.progress * 100)}%`));
    host.append(h('p', 'eyebrow', i18n.t('detail.output')));
    const list = h('ul', 'plain');
    for (const line of runtime.output) list.append(h('li', undefined, pickL10n(line, i18n.locale)));
    host.append(list);
    const open = h('button', 'text-btn', i18n.t('detail.person'));
    open.type = 'button';
    open.dataset.act = `open:member:${configMember.id}`;
    host.append(open);
  } else {
    const station = config.stations.find((item) => item.id === selection.id);
    if (!station) return;
    const zone = config.zones.find((item) => item.id === station.zone);
    host.append(h('h2', undefined, pickL10n(station.name, i18n.locale)));
    host.append(h('p', undefined, pickL10n(station.summary, i18n.locale)));
    if (zone) host.append(h('p', 'muted', `${i18n.t('detail.zone')} · ${pickL10n(zone.name, i18n.locale)}`));
    host.append(h('p', 'eyebrow', i18n.t('station.crew')));
    const crew = config.members.filter((member) => member.station === station.id);
    if (crew.length === 0) host.append(h('p', 'muted', '—'));
    for (const member of crew) {
      const button = h('button', 'text-btn', pickL10n(member.role, i18n.locale));
      button.type = 'button';
      button.dataset.act = `pick:member:${member.id}`;
      host.append(button);
    }
  }
  host.scrollTop = scroll;
}

function renderSquads(host: HTMLElement, config: TeamConfig, state: WarState, i18n: I18n): void {
  host.replaceChildren();
  host.append(h('p', 'eyebrow', i18n.t('panel.squads')));
  const row = h('div', 'squad-row');
  for (const squad of config.squads) {
    const card = h('article', 'squad');
    card.style.borderTopColor = squad.color;
    const members = squad.members.map((id) => state.members[id]).filter(Boolean);
    const online = members.filter((member) => member.online && !member.suspended).length;
    const tasks = members.filter((member) => member.task && member.progress < 1 && !member.suspended).length;
    card.append(
      h('h3', undefined, pickL10n(squad.name, i18n.locale)),
      h('p', undefined, i18n.t('squad.online', { n: online })),
      h('p', 'muted', i18n.t('squad.tasks', { n: tasks })),
    );
    row.append(card);
  }
  host.append(row);
}

function renderTimeline(host: HTMLElement, config: TeamConfig, state: WarState, i18n: I18n): void {
  host.replaceChildren();
  host.append(h('p', 'eyebrow', i18n.t('panel.timeline')));
  const list = h('ol', 'phases');
  for (const phase of config.phases) {
    const runtime = state.phases.find((item) => item.id === phase.id);
    const status = runtime?.status ?? phase.status;
    const item = h('li', `phase is-${status}`);
    item.append(h('span', 'phase-id', phase.id.toUpperCase()), h('span', 'phase-name', pickL10n(phase.name, i18n.locale)));
    item.append(h('small', undefined, i18n.t(`phase.${status}`)));
    if (status === 'active') item.append(h('em', undefined, i18n.t('timeline.now')));
    list.append(item);
  }
  host.append(list);
}

function renderFeed(host: HTMLElement, config: TeamConfig, state: WarState, i18n: I18n): void {
  const scroller = host.querySelector('.feed-list');
  const nearBottom = scroller
    ? scroller.scrollHeight - scroller.scrollTop - scroller.clientHeight < 48
    : true;
  host.replaceChildren();
  host.append(h('p', 'eyebrow', i18n.t('panel.feed')));
  const list = h('div', 'feed-list');
  const pinned = state.alert?.active ? state.feed.filter((event) => event.type === 'escalation_urgent').slice(-1) : [];
  const rest = state.feed.filter((event) => !pinned.includes(event)).slice(-12);
  for (const event of [...pinned, ...rest]) {
    const row = h('p', event.type === 'escalation_urgent' ? 'feed-row is-urgent' : 'feed-row');
    row.append(h('span', 'feed-text', feedLine(event, config, i18n)));
    const time = h('time');
    time.dateTime = new Date(event.ts).toISOString();
    time.dataset.ts = String(event.ts);
    time.textContent = ago(event.ts, i18n);
    row.append(time);
    list.append(row);
  }
  host.append(list);
  if (nearBottom) list.scrollTop = list.scrollHeight;
}

function renderDocks(host: HTMLElement, config: TeamConfig, state: WarState, i18n: I18n): void {
  host.replaceChildren();
  host.append(h('p', 'eyebrow', i18n.t('panel.docks')));
  const table = h('div', 'dock-list');
  for (const member of config.members.filter((item) => item.station === 'review')) {
    const dock = state.docks[member.id] ?? { status: 'idle' as const, progress: 0, total: 5 };
    const row = h('div', 'dock-row');
    row.append(h('strong', undefined, pickL10n(member.role, i18n.locale)));
    row.append(h('span', dock.status === 'reviewing' ? 'pill is-hot' : 'pill', i18n.t(`dock.${dock.status}`)));
    row.append(h('span', 'dock-count', `${dock.progress}/${dock.total}`));
    table.append(row);
  }
  host.append(table);
}

function renderFlat(
  flat: HTMLElement,
  banner: HTMLElement,
  config: TeamConfig,
  state: WarState,
  i18n: I18n,
  showFlat: boolean,
): void {
  banner.hidden = !showFlat;
  flat.hidden = !showFlat;
  if (!showFlat) return;
  banner.textContent = i18n.t('fallback.webgl');
  flat.replaceChildren();
  flat.append(h('p', 'eyebrow', i18n.t('fallback.title')));
  const board = h('div', 'flat-board');
  for (const zone of config.zones) {
    const card = h('article', 'flat-zone');
    card.append(h('h3', undefined, pickL10n(zone.name, i18n.locale)));
    const people = config.members.filter((member) => member.zone === zone.id);
    for (const member of people) {
      const runtime = state.members[member.id];
      const pill = h('button', runtime?.suspended ? 'pill is-asleep' : 'pill');
      pill.type = 'button';
      pill.dataset.act = `pick:member:${member.id}`;
      pill.textContent = runtime?.suspended
        ? `${pickL10n(member.role, i18n.locale)} · ${i18n.t('member.suspended')}`
        : pickL10n(member.role, i18n.locale);
      card.append(pill);
    }
    board.append(card);
  }
  flat.append(board);
}

export function refreshAges(root: ParentNode, i18n: I18n): void {
  for (const node of root.querySelectorAll<HTMLTimeElement>('time[data-ts]')) {
    const ts = Number(node.dataset.ts);
    if (!Number.isNaN(ts)) node.textContent = ago(ts, i18n);
  }
  const clock = root.querySelector('.clock');
  if (clock) {
    clock.textContent = new Date().toLocaleTimeString(i18n.locale, {
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
    });
  }
}
