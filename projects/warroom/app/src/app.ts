import type { TeamConfig } from '@troupe/team-config';
import type { I18n, Locale } from './i18n';
import { DOCK_ORDER, renderHud, sceneCopy, type HudHosts } from './panels/hud';
import { refreshAges, renderPanels, type BoardId, type PanelHosts } from './panels/render';
import { renderOverlay, type SceneRequest } from './scenarios/overlay';
import { Campus, detectWebGL, type PickTarget } from './scene/campus';
import type { WarState, WarStore } from './state/store';

interface UiState {
  selection: PickTarget | null;
  board: BoardId | null;
  scene: SceneRequest | null;
  night: boolean;
  touring: boolean;
  tourIndex: number;
}

const DRAWER_GUTTER = 412;
const TOUR_MS = 6500;

function node(className: string, tag = 'div'): HTMLElement {
  const element = document.createElement(tag);
  element.className = className;
  return element;
}

export function mount(root: HTMLElement, deps: { config: TeamConfig; store: WarStore; i18n: I18n }): void {
  const webgl = !new URLSearchParams(location.search).has('nowebgl') && detectWebGL();
  root.replaceChildren();

  const stage = node('stage');
  const banner = node('banner');
  banner.hidden = true;
  const flat = node('flat card');
  flat.hidden = true;
  const drawer = node('drawer');
  drawer.hidden = true;
  const drawerBar = node('drawer-bar');
  const kpis = node('kpis', 'section');
  const squads = node('card squads', 'section');
  const detail = node('card detail', 'aside');
  const timeline = node('card timeline', 'section');
  timeline.dataset.act = 'open:standup';
  const feed = node('card feed', 'section');
  feed.dataset.act = 'open:monitor';
  const docks = node('card docks', 'section');
  docks.dataset.act = 'open:review';
  const overlay = node('overlay');
  overlay.hidden = true;
  const hud: HudHosts = {
    brand: node('hud hud-brand'),
    tools: node('hud hud-tools'),
    ticker: node('hud hud-ticker'),
    dock: node('hud hud-dock', 'nav'),
  };

  drawer.append(drawerBar, detail, kpis, squads, timeline, feed, docks);
  root.append(stage, hud.brand, hud.tools, hud.ticker, hud.dock, banner, drawer, overlay);

  const hosts: PanelHosts = { drawerBar, kpis, detail, squads, timeline, feed, docks, flat, banner };
  stage.append(flat);
  const hour = new Date().getHours();
  const ui: UiState = {
    selection: null,
    board: null,
    scene: null,
    night: hour >= 19 || hour < 7,
    touring: false,
    tourIndex: -1,
  };

  const campus = new Campus(
    stage,
    deps.config,
    (pick) => {
      ui.touring = false;
      ui.selection = pick;
      ui.board = pick ? 'detail' : null;
      if (!pick) ui.scene = null;
      paint(deps.store.get());
    },
    webgl,
  );
  campus.onUserMove = () => {
    if (!ui.touring) return;
    ui.touring = false;
    paint(deps.store.get());
  };
  const showFlat = !campus.ready;
  root.classList.toggle('is-flat', showFlat);
  const observer = new ResizeObserver(() => {
    campus.resize();
    paint(deps.store.get());
  });
  observer.observe(stage);

  const focusTarget = (): PickTarget | null => {
    if (ui.selection) return ui.selection;
    if (ui.touring && ui.tourIndex >= 0) return { kind: 'station', id: DOCK_ORDER[ui.tourIndex % DOCK_ORDER.length] };
    return null;
  };

  const boards: Record<BoardId, HTMLElement> = { detail, kpis, squads, timeline, feed, docks };
  const paint = (state: WarState) => {
    if (ui.scene?.id === 'alert' && !state.alert?.active) ui.scene = null;
    root.classList.toggle('is-alert', Boolean(state.alert?.active));
    root.classList.toggle('is-night', ui.night);
    root.classList.toggle('is-drawer', ui.board != null);
    drawer.hidden = ui.board == null;
    renderPanels(hosts, deps.config, state, deps.i18n, ui.selection, ui.board, showFlat);
    for (const [id, host] of Object.entries(boards) as [BoardId, HTMLElement][]) host.hidden = ui.board !== id;
    const focus = focusTarget();
    renderHud(hud, deps.config, state, deps.i18n, {
      night: ui.night,
      touring: ui.touring,
      focus: focus ? `${focus.kind}:${focus.id}` : null,
    });
    campus.setNight(ui.night);
    campus.setInset(ui.board != null && stage.clientWidth > 840 ? DRAWER_GUTTER : 0);
    campus.sync(state, deps.i18n.locale, sceneCopy(deps.config, state, deps.i18n));
    campus.focus(focus?.kind ?? null, focus?.id ?? null);
    renderOverlay(overlay, deps.config, state, deps.i18n, ui.scene, ui.selection?.kind === 'member' ? ui.selection.id : null);
  };

  const home = () => {
    ui.board = null;
    ui.selection = null;
    ui.scene = null;
    ui.touring = false;
    campus.overview();
    paint(deps.store.get());
  };

  const pickStation = (id: string) => {
    ui.touring = false;
    ui.selection = { kind: 'station', id };
    ui.board = 'detail';
    paint(deps.store.get());
  };

  const toggleTour = () => {
    ui.touring = !ui.touring;
    if (ui.touring) {
      ui.selection = null;
      ui.board = null;
      ui.scene = null;
      ui.tourIndex = 0;
    } else {
      campus.overview();
    }
    paint(deps.store.get());
  };

  root.addEventListener('click', (event) => {
    const target = (event.target as HTMLElement | null)?.closest<HTMLElement>('[data-act]');
    if (!target?.dataset.act) return;
    const act = target.dataset.act;
    if (act.startsWith('lang:')) {
      deps.i18n.setLocale(act.slice(5) as Locale);
      return;
    }
    if (act === 'view:home') return home();
    if (act === 'view:tour') return toggleTour();
    if (act === 'view:night') {
      ui.night = !ui.night;
      paint(deps.store.get());
      return;
    }
    const state = deps.store.get();
    if (act === 'dismiss') {
      ui.board = null;
      ui.selection = null;
      ui.scene = null;
      paint(state);
      return;
    }
    if (act === 'close') {
      ui.scene = null;
      paint(state);
      return;
    }
    if (act.startsWith('board:')) {
      ui.touring = false;
      ui.board = act.slice('board:'.length) as BoardId;
      paint(state);
      return;
    }
    if (act === 'open:standup') ui.scene = { id: 'standup' };
    else if (act === 'open:review') ui.scene = { id: 'review' };
    else if (act === 'open:monitor') ui.scene = { id: 'monitor' };
    else if (act === 'open:roster') ui.scene = { id: 'roster' };
    else if (act === 'open:dm') ui.scene = { id: 'dm' };
    else if (act === 'open:huddle') ui.scene = { id: 'huddle' };
    else if (act.startsWith('open:member:')) ui.scene = { id: 'member', memberId: act.slice('open:member:'.length) };
    else if (act.startsWith('pick:member:')) {
      ui.touring = false;
      ui.selection = { kind: 'member', id: act.slice('pick:member:'.length) };
      ui.board = 'detail';
    } else if (act.startsWith('pick:station:')) return pickStation(act.slice('pick:station:'.length));
    else return;
    paint(deps.store.get());
  });

  window.addEventListener('keydown', (event) => {
    const field = event.target instanceof Element ? event.target.closest('input, textarea, [contenteditable]') : null;
    if (field || event.ctrlKey || event.metaKey || event.altKey) return;
    const key = event.key.toLowerCase();
    if (key === 'escape' || key === '0' || key === 'home') {
      if (ui.scene) {
        ui.scene = null;
        paint(deps.store.get());
      } else home();
      return;
    }
    if (key === 'n') {
      ui.night = !ui.night;
      paint(deps.store.get());
      return;
    }
    if (key === 't') return toggleTour();
    const slot = Number(key);
    if (Number.isInteger(slot) && slot >= 1 && slot <= DOCK_ORDER.length) pickStation(DOCK_ORDER[slot - 1]);
  });

  deps.store.subscribe(paint);
  deps.i18n.subscribe(() => paint(deps.store.get()));

  window.setInterval(() => {
    if (!ui.touring) return;
    ui.tourIndex += 1;
    paint(deps.store.get());
  }, TOUR_MS);

  let lastClock = 0;
  const clock = (now: number) => {
    if (now - lastClock > 1000) {
      lastClock = now;
      refreshAges(root, deps.i18n);
    }
    requestAnimationFrame(clock);
  };
  requestAnimationFrame(clock);
}
