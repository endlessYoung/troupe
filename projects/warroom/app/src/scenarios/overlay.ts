import { pickL10n, type TeamConfig } from '@troupe/team-config';
import type { I18n } from '../i18n';
import { displayActor } from '../panels/render';
import type { WarState } from '../state/store';

export interface SceneRequest {
  id:
    | 'review'
    | 'standup'
    | 'roster'
    | 'member'
    | 'monitor'
    | 'signoff'
    | 'scoring'
    | 'huddle'
    | 'dm'
    | 'alert';
  memberId?: string;
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

function nameOf(config: TeamConfig, id: string, locale: string): string {
  return displayActor(config, id, locale);
}

export function renderOverlay(
  host: HTMLElement,
  config: TeamConfig,
  state: WarState,
  i18n: I18n,
  scene: SceneRequest | null,
  selectionId: string | null,
): void {
  const body = host.querySelector('.sheet-body');
  const scroll = body?.scrollTop ?? 0;
  host.replaceChildren();
  if (!scene) {
    host.hidden = true;
    return;
  }
  host.hidden = false;
  const backdrop = h('button', 'backdrop');
  backdrop.type = 'button';
  backdrop.dataset.act = 'close';
  backdrop.setAttribute('aria-label', i18n.t('scene.close'));
  const sheet = h('section', 'sheet');
  const head = h('header', 'sheet-head');
  head.append(h('h2', undefined, i18n.t(`scene.${scene.id}`)));
  const close = h('button', 'text-btn', i18n.t('scene.close'));
  close.type = 'button';
  close.dataset.act = 'close';
  head.append(close);
  const content = h('div', 'sheet-body');
  fill(content, config, state, i18n, scene, selectionId);
  sheet.append(head, content);
  host.append(backdrop, sheet);
  content.scrollTop = scroll;
}

function fill(
  host: HTMLElement,
  config: TeamConfig,
  state: WarState,
  i18n: I18n,
  scene: SceneRequest,
  selectionId: string | null,
): void {
  if (scene.id === 'review') {
    host.append(h('p', 'eyebrow', i18n.t('review.agenda')));
    host.append(h('p', undefined, pickL10n(config.reviewAgenda, i18n.locale)));
    host.append(h('p', 'eyebrow', i18n.t('review.attendees')));
    const who = (state.reviewAttendees.length ? state.reviewAttendees : config.members.filter((m) => m.station === 'review').map((m) => m.id))
      .map((id) => nameOf(config, id, i18n.locale))
      .join(' · ');
    host.append(h('p', undefined, who));
    if (state.reviewLines.length === 0) host.append(h('p', 'muted', i18n.t('scene.waiting')));
    const list = h('ol', 'script');
    state.reviewLines.forEach((line, index) => {
      const item = h('li', index === state.reviewLines.length - 1 ? 'line-enter' : '');
      item.append(h('strong', undefined, nameOf(config, line.reviewer, i18n.locale)));
      item.append(h('p', undefined, pickL10n(line.text, i18n.locale)));
      item.append(h('small', undefined, line.closed ? i18n.t('review.closed') : i18n.t('review.open')));
      list.append(item);
    });
    host.append(list);
    return;
  }
  if (scene.id === 'standup') {
    host.append(h('p', 'muted', i18n.t('standup.caption')));
    if (state.speeches.length === 0) host.append(h('p', 'muted', i18n.t('scene.waiting')));
    const list = h('ol', 'script');
    for (const [index, line] of state.speeches.entries()) {
      const item = h('li', index === state.speeches.length - 1 ? 'line-enter' : '');
      item.append(h('strong', undefined, nameOf(config, line.actor, i18n.locale)));
      item.append(h('p', undefined, pickL10n(line.line, i18n.locale)));
      list.append(item);
    }
    host.append(list);
    return;
  }
  if (scene.id === 'roster') {
    const list = h('div', 'roster');
    for (const member of config.members) {
      const runtime = state.members[member.id];
      const button = h('button', 'roster-card');
      button.type = 'button';
      button.dataset.act = `open:member:${member.id}`;
      button.append(h('strong', undefined, pickL10n(member.role, i18n.locale)));
      button.append(h('span', undefined, runtime ? statusText(runtime.suspended, runtime.status, i18n) : ''));
      button.append(h('small', undefined, runtime?.task ? pickL10n(runtime.task, i18n.locale) : ''));
      list.append(button);
    }
    host.append(list);
    return;
  }
  if (scene.id === 'member') {
    const member = config.members.find((item) => item.id === scene.memberId);
    const runtime = scene.memberId ? state.members[scene.memberId] : undefined;
    if (!member || !runtime) return;
    host.append(h('h3', undefined, pickL10n(member.role, i18n.locale)));
    host.append(h('p', 'muted', pickL10n(member.duty, i18n.locale)));
    host.append(h('p', 'eyebrow', i18n.t('detail.task')));
    host.append(h('p', undefined, runtime.task ? pickL10n(runtime.task, i18n.locale) : '—'));
    const bar = h('div', 'bar');
    const fill = h('span');
    fill.style.width = `${Math.round(runtime.progress * 100)}%`;
    bar.append(fill);
    host.append(bar);
    host.append(h('p', 'eyebrow', i18n.t('detail.output')));
    const list = h('ul', 'plain');
    for (const line of runtime.output) list.append(h('li', undefined, pickL10n(line, i18n.locale)));
    host.append(list);
    return;
  }
  if (scene.id === 'monitor') {
    if (state.log.length === 0) {
      host.append(h('p', 'muted', i18n.t('monitor.empty')));
      return;
    }
    const pre = h('pre', 'monitor');
    pre.textContent = state.log
      .slice(-80)
      .map((event) =>
        JSON.stringify({
          type: event.type,
          actor: event.actor,
          action: event.action,
          ts: event.ts,
          payload: event.payload ?? {},
        }),
      )
      .join('\n');
    host.append(pre);
    return;
  }
  if (scene.id === 'signoff') {
    const gate = state.gate === 'open' ? i18n.t('signoff.gate_open') : i18n.t('signoff.gate_shut');
    host.append(h('p', state.gate === 'open' ? 'pill is-hot' : 'pill', gate));
    const list = h('ol', 'script');
    for (const line of state.signoff?.lines ?? []) {
      const item = h('li', 'line-enter');
      item.append(h('strong', undefined, nameOf(config, line.actor, i18n.locale)));
      item.append(h('p', undefined, pickL10n(line.text, i18n.locale)));
      list.append(item);
    }
    if (!state.signoff) host.append(h('p', 'muted', i18n.t('scene.waiting')));
    host.append(list);
    return;
  }
  if (scene.id === 'scoring') {
    const list = h('ol', 'script');
    for (const score of state.scores) {
      const item = h('li');
      const axis =
        score.axis === 'up'
          ? i18n.t('scoring.up')
          : score.axis === 'down'
            ? i18n.t('scoring.down')
            : score.axis === 'peer'
              ? i18n.t('scoring.peer')
              : i18n.t('scoring.summary');
      item.append(h('small', undefined, axis));
      item.append(h('p', undefined, pickL10n(score.text, i18n.locale)));
      if (score.score != null) item.append(h('strong', undefined, `${score.score}/5`));
      list.append(item);
    }
    host.append(list);
    return;
  }
  if (scene.id === 'huddle') {
    host.append(h('p', 'muted', i18n.t('huddle.only')));
    const names = (state.huddleAttendees.length ? state.huddleAttendees : config.huddle.attendees)
      .map((id) => nameOf(config, id, i18n.locale))
      .join(' · ');
    host.append(h('p', undefined, names));
    if (state.huddleOutcome) host.append(h('p', 'line-enter', pickL10n(state.huddleOutcome, i18n.locale)));
    else host.append(h('p', 'muted', i18n.t('scene.waiting')));
    return;
  }
  if (scene.id === 'dm') {
    const dm = state.dm;
    const party = dm && selectionId && (selectionId === dm.from || selectionId === dm.to);
    if (!dm) {
      host.append(h('p', 'muted', i18n.t('scene.waiting')));
      return;
    }
    host.append(
      h(
        'p',
        undefined,
        `${nameOf(config, dm.from, i18n.locale)} ↔ ${nameOf(config, dm.to, i18n.locale)}`,
      ),
    );
    if (!party || !dm.text) {
      host.append(h('p', 'muted', i18n.t('dm.locked')));
      return;
    }
    host.append(h('p', 'muted', i18n.t('dm.transcript')));
    host.append(h('p', 'line-enter', pickL10n(dm.text, i18n.locale)));
    return;
  }
  if (scene.id === 'alert') {
    if (!state.alert) return;
    host.append(h('p', 'pill is-urgent', state.alert.level));
    host.append(h('p', undefined, nameOf(config, state.alert.actor, i18n.locale)));
    host.append(h('p', 'line-enter', pickL10n(state.alert.text, i18n.locale)));
    if (!state.alert.active) host.append(h('p', 'muted', i18n.t('alert.cleared')));
  }
}

function statusText(suspended: boolean, status: string, i18n: I18n): string {
  if (suspended) return i18n.t('member.suspended');
  return i18n.t(`member.${status}`);
}
