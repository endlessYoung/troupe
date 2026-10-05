import { RealtimeAdapter, createTeamEvents, installTeamEvents } from '@troupe/team-events';
import { validateConfig } from '@troupe/team-config';
import { SimulationEngine } from '@troupe/simulation';
import rawConfig from '../team.config.json';
import { mount } from './app';
import { I18n } from './i18n';
import { createStore } from './state/store';
import './style.css';

const root = document.querySelector<HTMLElement>('#warroom');
if (!root) throw new Error('Missing #warroom');

const checked = validateConfig(rawConfig);
if (!checked.ok) {
  root.textContent = checked.errors.join('\n');
} else {
  const bus = createTeamEvents();
  installTeamEvents(bus);
  const realtime = new RealtimeAdapter();
  // REAL-SOURCE: bus.setAdapter(realtime) replaces SimulationEngine. Renderers stay subscribed to the bus.
  realtime.stop();
  const i18n = new I18n();
  const store = createStore(checked.config, bus);
  mount(root, { config: checked.config, store, i18n });
  const engine = new SimulationEngine(bus, checked.config);
  engine.start();
}
