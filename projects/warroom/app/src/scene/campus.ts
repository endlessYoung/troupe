import { pickL10n, resolveMember, type TeamConfig } from '@troupe/team-config';
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { OutlinePass } from 'three/examples/jsm/postprocessing/OutlinePass.js';
import { OutputPass } from 'three/examples/jsm/postprocessing/OutputPass.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js';
import { CSS2DObject, CSS2DRenderer } from 'three/examples/jsm/renderers/CSS2DRenderer.js';
import type { Locale } from '../i18n';
import { actionText, type MemberRuntime, type WarState } from '../state/store';
import { CORRIDOR_D, FLOOR_D, FLOOR_W, memberXZ, ROAD_Z, ROOM_D, zoneBox } from './layout';

export interface PickTarget {
  kind: 'member' | 'station';
  id: string;
}

export interface SceneCopy {
  suspended: string;
  dm: string;
  status: Record<MemberRuntime['status'], string>;
  metrics: Record<string, string>;
  screen: { title: string; lines: string[]; urgent: boolean };
}

interface AvatarRig {
  group: THREE.Group;
  body: THREE.Mesh;
  lamp: THREE.Mesh;
  label: HTMLDivElement;
  status: HTMLElement;
  meter: HTMLElement;
  bubble: HTMLDivElement;
  bubbleUntil: number;
  base: THREE.Color;
  color: string;
  zone: string;
  target: THREE.Vector3;
}

interface ChipRig {
  group: THREE.Group;
  trail: THREE.Line;
  points: Float32Array;
}

interface Ripple {
  mesh: THREE.Mesh;
  born: number;
  life: number;
  grow: number;
}

interface Beam {
  curve: THREE.QuadraticBezierCurve3;
  packet: THREE.Mesh;
  phase: number;
}

interface Flight {
  fromTarget: THREE.Vector3;
  toTarget: THREE.Vector3;
  fromOffset: THREE.Vector3;
  toOffset: THREE.Vector3;
  fromZoom: number;
  toZoom: number;
  start: number;
  duration: number;
}

interface WallScreen {
  canvas: HTMLCanvasElement;
  texture: THREE.CanvasTexture;
  key: string;
}

const WALL = '#ebe4d8';
const PAPER = '#fbfbfa';
const INK = '#1c2430';
const DESK = '#fffdf8';
const METAL = '#a89078';
const CHAIR = '#5c534c';
const VIOLET = '#7c5cbf';
const BLUE = '#2f6fed';
const TEAL = '#1f9d8a';
const ROSE = '#d45d8c';
const AMBER = '#d4893a';
const RED = '#c4493c';
const GREEN = '#3d9a6a';
const WALL_H = 1.75;
const PARTITION_H = 1.15;
const DESK_Z = -ROOM_D / 2 + 0.55;
const WALL_FACE = -ROOM_D / 2 + 0.09;
const TRAIL = 22;

const HOME_TARGET = new THREE.Vector3(-0.3, 0.2, -0.45);
const HOME_OFFSET = new THREE.Vector3(4.5, 15.0, 17.85);
const DAY_BG = new THREE.Color(WALL);
const NIGHT_BG = new THREE.Color('#10151e');
const DAY_SUN = new THREE.Color('#fff3e4');
const NIGHT_SUN = new THREE.Color('#8fa8d8');
const DAY_PANE = new THREE.Color('#e8f2fa');
const NIGHT_PANE = new THREE.Color('#24375c');
const ROOMS = ['inception', 'planning', 'command', 'design', 'build', 'release', 'qc', 'test', 'lounge'];

/** Emissive materials that brighten after dark. Filled while the scene is built. */
const GLOW: { mat: THREE.MeshStandardMaterial; day: number; night: number }[] = [];

export function detectWebGL(): boolean {
  try {
    const canvas = document.createElement('canvas');
    return Boolean(canvas.getContext('webgl2') || canvas.getContext('webgl'));
  } catch {
    return false;
  }
}

export class Campus {
  /** Fires when the viewer grabs the camera, so tours can yield. */
  onUserMove: (() => void) | null = null;

  private renderer: THREE.WebGLRenderer | null = null;
  private composer: EffectComposer | null = null;
  private bloom: UnrealBloomPass | null = null;
  private hoverPass: OutlinePass | null = null;
  private selectPass: OutlinePass | null = null;
  private labels: CSS2DRenderer | null = null;
  private scene: THREE.Scene | null = null;
  private camera: THREE.OrthographicCamera | null = null;
  private controls: OrbitControls | null = null;
  private readonly hemi = new THREE.HemisphereLight('#fff6ea', '#d9cfc0', 0.76);
  private readonly ambient = new THREE.AmbientLight('#fffaf3', 0.24);
  private readonly sun = new THREE.DirectionalLight('#fff3e4', 1.12);
  private readonly background = DAY_BG.clone();
  private roomLights: THREE.PointLight[] = [];
  private panes: THREE.MeshStandardMaterial | null = null;
  private plates = new Map<string, THREE.MeshStandardMaterial>();
  private avatars = new Map<string, AvatarRig>();
  private stations = new Map<string, THREE.Group>();
  private zoneTags = new Map<string, { tag: HTMLElement; name: HTMLElement; metric: HTMLElement }>();
  private chips = new Map<string, ChipRig>();
  private ripples: Ripple[] = [];
  private beams: Beam[] = [];
  private readonly beamGroup = new THREE.Group();
  private beamKey = '';
  private ring: THREE.Mesh | null = null;
  private gate: THREE.Mesh | null = null;
  private gateOpen = false;
  private wall: WallScreen | null = null;
  private frame = 0;
  private running = false;
  private readonly reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  private chipState: WarState['chips'] | null = null;
  private readonly seen = new WeakSet<object>();
  private primed = false;
  private night = -1;
  private nightTarget = 0;
  private inset = 0;
  private insetTarget = 0;
  private width = 1;
  private height = 1;
  private flight: Flight | null = null;
  private focusKey = '';
  private hoverKey = '';
  private hoverZone: string | null = null;
  private pointer: { x: number; y: number } | null = null;
  private press: { x: number; y: number } | null = null;
  private alertZone: string | null = null;
  private liveZones = new Set<string>();
  private selectedZone: string | null = null;
  private readonly raycaster = new THREE.Raycaster();

  constructor(
    private readonly stage: HTMLElement,
    private readonly config: TeamConfig,
    private readonly onPick: (pick: PickTarget | null) => void,
    private readonly webgl: boolean,
  ) {
    if (!webgl) return;
    this.build();
  }

  private build(): void {
    GLOW.length = 0;
    const scene = new THREE.Scene();
    scene.background = this.background;
    const camera = new THREE.OrthographicCamera(-10, 10, 10, -10, 0.1, 160);
    camera.position.copy(HOME_TARGET).add(HOME_OFFSET);
    camera.lookAt(HOME_TARGET);

    this.sun.position.set(-9, 18, 8);
    this.sun.castShadow = true;
    this.sun.shadow.mapSize.set(2048, 2048);
    const shadowCam = this.sun.shadow.camera;
    shadowCam.left = -12;
    shadowCam.right = 12;
    shadowCam.top = 9;
    shadowCam.bottom = -9;
    shadowCam.near = 1;
    shadowCam.far = 50;
    this.sun.shadow.bias = -0.0004;
    this.sun.shadow.normalBias = 0.025;
    this.sun.shadow.radius = 3;
    scene.add(this.hemi, this.ambient, this.sun, this.sun.target);

    this.drawOffice(scene);
    for (const id of ROOMS) {
      const box = zoneBox(id);
      const light = new THREE.PointLight('#ffcf8a', 0, 5.2, 1.4);
      light.position.set(box.x, 1.55, box.z + 0.2);
      this.roomLights.push(light);
      scene.add(light);
    }

    for (const station of this.config.stations) {
      const box = zoneBox(station.zone);
      const group = studio(station.id);
      group.position.set(box.x, box.rise, box.z);
      group.userData.zone = station.zone;
      group.traverse((child) => {
        child.userData.pick = { kind: 'station', id: station.id };
      });
      scene.add(group);
      this.stations.set(station.id, group);
      if (group.userData.gate instanceof THREE.Mesh) this.gate = group.userData.gate;
      if (group.userData.wall) this.wall = { ...(group.userData.wall as Omit<WallScreen, 'key'>), key: '' };

      const tag = zoneTag(station.zone, `pick:station:${station.id}`);
      tag.tag.dataset.station = station.id;
      const label = new CSS2DObject(tag.tag);
      label.position.set(0, box.z < 0 ? WALL_H + 0.22 : 1.3, -ROOM_D / 2);
      group.add(label);
      this.zoneTags.set(station.id, tag);
    }

    const archive = zoneBox('inception');
    const done = archiveSet();
    done.position.set(archive.x, 0, archive.z);
    scene.add(done);
    const archiveTag = zoneTag('inception');
    const inception = this.config.zones.find((item) => item.id === 'inception');
    archiveTag.name.textContent = inception ? pickL10n(inception.name, 'en') : 'Inception';
    const archiveLabel = new CSS2DObject(archiveTag.tag);
    archiveLabel.position.set(0, WALL_H + 0.22, -ROOM_D / 2);
    done.add(archiveLabel);
    this.zoneTags.set('inception', archiveTag);

    const lounge = zoneBox('lounge');
    const rest = loungeSet();
    rest.position.set(lounge.x, 0, lounge.z);
    scene.add(rest);

    this.drawAvatars(scene);

    this.ring = new THREE.Mesh(
      new THREE.RingGeometry(0.3, 0.38, 40),
      new THREE.MeshBasicMaterial({ color: BLUE, side: THREE.DoubleSide, transparent: true, opacity: 0.75, depthWrite: false }),
    );
    this.ring.rotation.x = -Math.PI / 2;
    this.ring.visible = false;
    scene.add(this.ring, this.beamGroup);

    scene.traverse((child) => {
      if (!(child instanceof THREE.Mesh)) return;
      const material = child.material as THREE.Material;
      child.castShadow = !material.transparent;
      child.receiveShadow = !material.transparent;
    });

    let renderer: THREE.WebGLRenderer;
    try {
      renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false, powerPreference: 'high-performance' });
    } catch {
      this.renderer = null;
      return;
    }
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.5));
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.08;
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.stage.append(renderer.domElement);

    const target = new THREE.WebGLRenderTarget(1, 1, { type: THREE.HalfFloatType, samples: 4 });
    const composer = new EffectComposer(renderer, target);
    composer.addPass(new RenderPass(scene, camera));
    const hover = new OutlinePass(new THREE.Vector2(1, 1), scene, camera);
    hover.edgeStrength = 2.4;
    hover.edgeGlow = 0.2;
    hover.edgeThickness = 1;
    hover.visibleEdgeColor.set('#f0a040');
    hover.hiddenEdgeColor.set('#b8874a');
    const select = new OutlinePass(new THREE.Vector2(1, 1), scene, camera);
    select.edgeStrength = 4.5;
    select.edgeGlow = 0.6;
    select.edgeThickness = 1.6;
    select.pulsePeriod = 2.6;
    select.visibleEdgeColor.set('#4d8dff');
    select.hiddenEdgeColor.set('#2a4f99');
    const bloom = new UnrealBloomPass(new THREE.Vector2(1, 1), 0.2, 0.55, 0.92);
    composer.addPass(hover);
    composer.addPass(select);
    composer.addPass(bloom);
    composer.addPass(new OutputPass());

    const labels = new CSS2DRenderer();
    labels.domElement.className = 'label-layer';
    labels.domElement.style.position = 'absolute';
    labels.domElement.style.inset = '0';
    labels.domElement.style.pointerEvents = 'none';
    this.stage.append(labels.domElement);

    const controls = new OrbitControls(camera, renderer.domElement);
    controls.target.copy(HOME_TARGET);
    controls.enableDamping = true;
    controls.dampingFactor = 0.08;
    controls.minZoom = 0.8;
    controls.maxZoom = 3.6;
    controls.minPolarAngle = 0.45;
    controls.maxPolarAngle = 1.15;
    const azimuth = Math.atan2(HOME_OFFSET.x, HOME_OFFSET.z);
    controls.minAzimuthAngle = azimuth - 0.8;
    controls.maxAzimuthAngle = azimuth + 0.8;
    controls.screenSpacePanning = true;
    controls.zoomToCursor = true;
    controls.mouseButtons = { LEFT: THREE.MOUSE.ROTATE, MIDDLE: THREE.MOUSE.DOLLY, RIGHT: THREE.MOUSE.PAN };
    controls.addEventListener('start', () => {
      this.flight = null;
      this.onUserMove?.();
    });
    controls.update();

    const canvas = renderer.domElement;
    canvas.addEventListener('pointerdown', (event) => {
      this.press = { x: event.clientX, y: event.clientY };
    });
    canvas.addEventListener('pointerup', (event) => {
      const press = this.press;
      this.press = null;
      if (!press || Math.hypot(event.clientX - press.x, event.clientY - press.y) > 6) return;
      this.onPick(this.pickAt(event.clientX, event.clientY));
    });
    canvas.addEventListener('pointermove', (event) => {
      this.pointer = { x: event.clientX, y: event.clientY };
    });
    canvas.addEventListener('pointerleave', () => {
      this.pointer = null;
    });

    this.renderer = renderer;
    this.composer = composer;
    this.bloom = bloom;
    this.hoverPass = hover;
    this.selectPass = select;
    this.labels = labels;
    this.scene = scene;
    this.camera = camera;
    this.controls = controls;
    this.running = true;
    this.applyNight(0);
    this.resize();
    this.frame = requestAnimationFrame(this.tick);
  }

  private drawOffice(scene: THREE.Scene): void {
    const halfW = FLOOR_W / 2;
    const halfD = FLOOR_D / 2;
    const slab = new THREE.Mesh(new THREE.BoxGeometry(FLOOR_W + 0.5, 0.3, FLOOR_D + 0.5), surface('#c9b89d', 0.86));
    slab.position.y = -0.15;
    const corridor = new THREE.Mesh(new THREE.BoxGeometry(FLOOR_W, 0.04, CORRIDOR_D), surface('#d8c3a2', 0.7));
    corridor.position.set(0, 0.02, ROAD_Z);
    scene.add(slab, corridor);
    for (let x = -halfW + 0.8; x < halfW; x += 0.8) {
      const seam = new THREE.Mesh(new THREE.BoxGeometry(0.015, 0.005, CORRIDOR_D), surface('#c8b08c', 0.7));
      seam.position.set(x, 0.042, ROAD_Z);
      scene.add(seam);
    }

    const tints: Record<string, string> = {
      inception: '#ebe5da',
      planning: '#eee6f5',
      command: '#e6ebf3',
      design: '#e2f0eb',
      build: '#ece6dc',
      release: '#f5e9e3',
      qc: '#f7e8ee',
      test: '#f6eedf',
      lounge: '#f2e9dc',
    };
    for (const [id, color] of Object.entries(tints)) {
      const box = zoneBox(id);
      const material = surface(color, 0.9);
      const plate = new THREE.Mesh(new THREE.BoxGeometry(box.w, 0.04, box.d), material);
      plate.position.set(box.x, 0.02, box.z);
      scene.add(plate);
      this.plates.set(id, material);
    }

    const wall = surface('#f8f4ed', 0.75);
    const wallTop = surface('#d9cdbb', 0.7);
    const block = (w: number, h: number, d: number, x: number, z: number, cap = wallTop) => {
      const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), wall);
      mesh.position.set(x, h / 2, z);
      const top = new THREE.Mesh(new THREE.BoxGeometry(w + 0.01, 0.04, d + 0.01), cap);
      top.position.set(x, h + 0.02, z);
      scene.add(mesh, top);
    };
    const backZ = -halfD;
    block(FLOOR_W + 0.12, WALL_H, 0.12, 0, backZ);
    block(0.12, WALL_H, FLOOR_D, -halfW, 0);
    block(0.12, 0.28, FLOOR_D, halfW, 0);
    block(FLOOR_W + 0.12, 0.28, 0.12, 0, halfD);

    const pane = new THREE.MeshStandardMaterial({
      color: '#cfe2f1',
      emissive: DAY_PANE,
      emissiveIntensity: 0.25,
      roughness: 0.15,
      metalness: 0,
    });
    this.panes = pane;
    for (const id of ['inception', 'planning', 'command', 'design', 'build']) {
      const box = zoneBox(id);
      const glass = new THREE.Mesh(new THREE.BoxGeometry(box.w * 0.62, 0.42, 0.02), pane);
      glass.position.set(box.x + box.w * 0.08, WALL_H - 0.32, backZ + 0.07);
      scene.add(glass);
    }

    const backCaps = ['#9a8f82', VIOLET, BLUE, TEAL];
    [-5.6, -2.2, 2.0, 5.4].forEach((x, index) => {
      block(0.1, PARTITION_H, ROOM_D, x, -(CORRIDOR_D + ROOM_D) / 2, surface(backCaps[index], 0.5));
    });
    const frontCaps = [ROSE, AMBER, '#b59a7a'];
    [-4.4, 0.6, 4.2].forEach((x, index) => {
      block(0.1, 0.42, ROOM_D, x, (CORRIDOR_D + ROOM_D) / 2, surface(frontCaps[index], 0.5));
    });

    const glass = new THREE.MeshStandardMaterial({
      color: '#d5e6f6',
      roughness: 0.08,
      metalness: 0.02,
      transparent: true,
      opacity: 0.32,
      depthWrite: false,
    });
    const frame = surface('#9aabbd', 0.35);
    for (const id of ['release', 'qc', 'test', 'lounge']) {
      const box = zoneBox(id);
      const door = 0.9;
      const side = (box.w - door) / 2;
      for (const sign of [-1, 1]) {
        const x = box.x + sign * (door / 2 + side / 2);
        const sheet = new THREE.Mesh(new THREE.BoxGeometry(side, 0.85, 0.03), glass);
        sheet.position.set(x, 0.46, CORRIDOR_D / 2);
        const rail = new THREE.Mesh(new THREE.BoxGeometry(side, 0.04, 0.05), frame);
        rail.position.set(x, 0.9, CORRIDOR_D / 2);
        scene.add(sheet, rail);
      }
    }
  }

  private drawAvatars(scene: THREE.Scene): void {
    const seats = new Map<string, number>();
    for (const member of this.config.members) seats.set(member.zone, (seats.get(member.zone) ?? 0) + 1);
    const seatIndex = new Map<string, number>();
    for (const member of this.config.members) {
      const index = seatIndex.get(member.zone) ?? 0;
      seatIndex.set(member.zone, index + 1);
      const spot = memberXZ(member.zone, 0, index, seats.get(member.zone) ?? 1);
      const rise = zoneBox(member.zone).rise;
      const group = figure(member.color);
      const body = group.userData.body as THREE.Mesh;
      const lamp = group.userData.lamp as THREE.Mesh;
      group.position.set(spot.x, rise, spot.z);
      group.rotation.y = Math.PI;
      group.traverse((child) => {
        child.userData.pick = { kind: 'member', id: member.id };
      });

      const label = document.createElement('div');
      label.className = 'avatar-label';
      label.dataset.act = `pick:member:${member.id}`;
      label.style.setProperty('--tone', member.color);
      const name = document.createElement('strong');
      name.textContent = pickL10n(member.role, 'en');
      const status = document.createElement('span');
      const meter = document.createElement('i');
      label.append(name, status, meter);
      const object = new CSS2DObject(label);
      object.position.set(0, 1.18, 0);
      group.add(object);

      const bubble = document.createElement('div');
      bubble.className = 'bubble';
      bubble.style.setProperty('--tone', member.color);
      const bubbleObject = new CSS2DObject(bubble);
      bubbleObject.position.set(0, 1.62, 0);
      group.add(bubbleObject);

      scene.add(group);
      this.avatars.set(member.id, {
        group,
        body,
        lamp,
        label,
        status,
        meter,
        bubble,
        bubbleUntil: 0,
        base: new THREE.Color(member.color),
        color: member.color,
        zone: member.zone,
        target: group.position.clone(),
      });
    }
  }

  private pickAt(clientX: number, clientY: number): PickTarget | null {
    if (!this.renderer || !this.camera || !this.scene) return null;
    const rect = this.renderer.domElement.getBoundingClientRect();
    const pointer = new THREE.Vector2(
      ((clientX - rect.left) / rect.width) * 2 - 1,
      -((clientY - rect.top) / rect.height) * 2 + 1,
    );
    this.raycaster.setFromCamera(pointer, this.camera);
    const hits = this.raycaster.intersectObjects(this.scene.children, true);
    for (const hit of hits) {
      const pick = hit.object.userData.pick as PickTarget | undefined;
      if (pick?.id) return pick;
    }
    return null;
  }

  get ready(): boolean {
    return this.renderer !== null;
  }

  resize(): void {
    if (!this.renderer || !this.camera || !this.labels || !this.composer) return;
    const width = this.stage.clientWidth || 1;
    const height = this.stage.clientHeight || 1;
    this.width = width;
    this.height = height;
    const aspect = width / height;
    const view = Math.max(5.15, 9.7 / Math.max(aspect, 0.35));
    this.camera.left = -view * aspect;
    this.camera.right = view * aspect;
    this.camera.top = view;
    this.camera.bottom = -view;
    this.applyView();
    this.renderer.setSize(width, height, false);
    this.renderer.domElement.style.width = '100%';
    this.renderer.domElement.style.height = '100%';
    this.composer.setPixelRatio(this.renderer.getPixelRatio());
    this.composer.setSize(width, height);
    this.labels.setSize(width, height);
  }

  private applyView(): void {
    if (!this.camera) return;
    if (Math.abs(this.inset) < 0.5) this.camera.clearViewOffset();
    else this.camera.setViewOffset(this.width, this.height, this.inset / 2, 0, this.width, this.height);
    this.camera.updateProjectionMatrix();
  }

  /** Reserve pixels on the right (the drawer) so the focused room stays centred in what is left. */
  setInset(pixels: number): void {
    this.insetTarget = pixels;
  }

  setNight(on: boolean): void {
    this.nightTarget = on ? 1 : 0;
  }

  overview(): void {
    this.focusKey = '';
    this.fly(HOME_TARGET, HOME_OFFSET, 1);
  }

  private fly(target: THREE.Vector3, offset: THREE.Vector3, zoom: number): void {
    if (!this.camera || !this.controls) return;
    this.flight = {
      fromTarget: this.controls.target.clone(),
      toTarget: target.clone(),
      fromOffset: this.camera.position.clone().sub(this.controls.target),
      toOffset: offset.clone(),
      fromZoom: this.camera.zoom,
      toZoom: zoom,
      start: performance.now(),
      duration: this.reduced ? 1 : 1050,
    };
  }

  private flyTo(kind: PickTarget['kind'], id: string): void {
    if (kind === 'member') {
      const rig = this.avatars.get(id);
      if (!rig) return;
      this.fly(rig.target.clone().add(new THREE.Vector3(0, 0.45, -0.25)), HOME_OFFSET, 2.2);
      return;
    }
    const group = this.stations.get(id);
    if (!group) return;
    const box = zoneBox(String(group.userData.zone));
    this.fly(group.position.clone().add(new THREE.Vector3(0, 0.4, -0.1)), HOME_OFFSET, clamp(6.2 / box.w, 1.3, 1.85));
  }

  sync(state: WarState, locale: Locale, copy: SceneCopy): void {
    this.chipState = state.chips;
    const seats = new Map<string, number>();
    for (const member of this.config.members) seats.set(member.zone, (seats.get(member.zone) ?? 0) + 1);
    const seatIndex = new Map<string, number>();
    for (const member of this.config.members) {
      const rig = this.avatars.get(member.id);
      const runtime = state.members[member.id];
      if (!rig || !runtime) continue;
      const index = seatIndex.get(member.zone) ?? 0;
      seatIndex.set(member.zone, index + 1);
      const spot = memberXZ(member.zone, runtime.slot, index, seats.get(member.zone) ?? 1);
      rig.target.set(spot.x, zoneBox(member.zone).rise, spot.z);
      const mat = rig.lamp.material as THREE.MeshStandardMaterial;
      if (runtime.suspended) {
        mat.color.set('#b7bec8');
        mat.emissive.set('#9aa3af');
        (rig.body.material as THREE.MeshStandardMaterial).color.set('#d5d8de');
      } else {
        mat.color.copy(rig.base);
        mat.emissive.copy(rig.base);
        (rig.body.material as THREE.MeshStandardMaterial).color.set(PAPER);
      }
      const name = rig.label.querySelector('strong');
      if (name) name.textContent = pickL10n(member.role, locale);
      rig.status.textContent = runtime.suspended ? copy.suspended : copy.status[runtime.status];
      rig.label.dataset.status = runtime.suspended ? 'suspended' : runtime.status;
      rig.meter.style.setProperty('--p', String(runtime.progress));
      rig.label.classList.toggle('is-suspended', runtime.suspended);
      rig.label.dataset.dm = copy.dm;
      rig.label.classList.toggle(
        'is-dm',
        state.dm?.active === true && (state.dm.from === member.id || state.dm.to === member.id),
      );
    }

    for (const station of this.config.stations) {
      const tag = this.zoneTags.get(station.id);
      if (!tag) continue;
      tag.name.textContent = pickL10n(station.name, locale);
      tag.metric.textContent = copy.metrics[station.id] ?? '';
    }
    const inception = this.config.zones.find((item) => item.id === 'inception');
    const archiveTag = this.zoneTags.get('inception');
    if (archiveTag && inception) {
      archiveTag.name.textContent = pickL10n(inception.name, locale);
      archiveTag.metric.textContent = copy.metrics.inception ?? '';
    }

    for (const chip of state.chips) {
      if (this.chips.has(chip.id) || !this.scene) continue;
      const group = dossier();
      const points = new Float32Array(TRAIL * 3);
      const geometry = new THREE.BufferGeometry();
      geometry.setAttribute('position', new THREE.BufferAttribute(points, 3));
      const trail = new THREE.Line(
        geometry,
        new THREE.LineBasicMaterial({ color: '#6f9bff', transparent: true, opacity: 0.55, depthWrite: false }),
      );
      trail.frustumCulled = false;
      trail.visible = false;
      this.scene.add(group, trail);
      this.chips.set(chip.id, { group, trail, points });
    }
    for (const [id, rig] of this.chips) {
      if (!state.chips.some((chip) => chip.id === id)) {
        rig.group.removeFromParent();
        rig.trail.removeFromParent();
        rig.trail.geometry.dispose();
        this.chips.delete(id);
      }
    }

    this.gateOpen = state.gate === 'open';
    if (this.gate) {
      const mat = this.gate.material as THREE.MeshStandardMaterial;
      mat.color.set(this.gateOpen ? GREEN : RED);
      mat.emissive.set(this.gateOpen ? GREEN : RED);
    }

    this.paintWall(copy.screen);
    this.syncBeams(state);
    this.syncEvents(state, locale, copy);

    this.alertZone = state.alert?.active ? (resolveMember(this.config, state.alert.actor)?.zone ?? null) : null;
    this.liveZones.clear();
    if (state.standupLive || state.scoringLive || state.signoff) this.liveZones.add('command');
    if (state.reviewLive) this.liveZones.add('qc');
    if (state.gate === 'open') this.liveZones.add('release');
  }

  private paintWall(screen: SceneCopy['screen']): void {
    if (!this.wall) return;
    const key = JSON.stringify(screen);
    if (key === this.wall.key) return;
    this.wall.key = key;
    const { canvas, texture } = this.wall;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    const font = '"Segoe UI", "PingFang SC", "Microsoft YaHei", sans-serif';
    ctx.fillStyle = '#121a26';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.fillStyle = '#1d2a3c';
    ctx.fillRect(0, 0, canvas.width, 86);
    ctx.fillStyle = '#4ad991';
    ctx.beginPath();
    ctx.arc(46, 43, 10, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#f4efe6';
    ctx.font = `600 40px ${font}`;
    ctx.textBaseline = 'middle';
    ctx.fillText(screen.title, 72, 45);
    screen.lines.forEach((line, index) => {
      const y = 140 + index * 66;
      const first = index === 0;
      ctx.fillStyle = first ? (screen.urgent ? '#ff6b5e' : '#f2a54a') : '#3a4a60';
      ctx.fillRect(40, y - 22, 8, 44);
      ctx.fillStyle = first ? (screen.urgent ? '#ffb4ab' : '#ffd29a') : '#d9e2ee';
      ctx.font = `${first ? 600 : 400} 34px ${font}`;
      ctx.fillText(line, 70, y);
    });
    texture.needsUpdate = true;
  }

  private syncBeams(state: WarState): void {
    const pairs: [string, string, string][] = [];
    if (state.dm?.active) {
      const to = resolveMember(this.config, state.dm.to)?.id ?? state.dm.to;
      pairs.push([state.dm.from, to, '#4d8dff']);
    }
    if (state.huddleLive) {
      const [head, ...rest] = state.huddleAttendees;
      for (const id of rest) if (head) pairs.push([head, id, '#2fc2a8']);
    }
    if (state.standupLive) {
      const host = this.config.standup[0]?.actor;
      for (const member of Object.values(state.members)) {
        if (host && member.id !== host && member.status === 'meeting') pairs.push([member.id, host, '#f2a54a']);
      }
    }
    const key = JSON.stringify(pairs);
    if (key === this.beamKey) return;
    this.beamKey = key;
    for (const child of [...this.beamGroup.children]) {
      child.removeFromParent();
      if (child instanceof THREE.Mesh) child.geometry.dispose();
    }
    this.beams = [];
    pairs.forEach(([from, to, color], index) => {
      const a = this.avatars.get(from)?.target;
      const b = this.avatars.get(to)?.target;
      if (!a || !b) return;
      const start = a.clone().add(new THREE.Vector3(0, 0.95, 0));
      const end = b.clone().add(new THREE.Vector3(0, 0.95, 0));
      const lift = 0.7 + start.distanceTo(end) * 0.16;
      const mid = start.clone().lerp(end, 0.5).add(new THREE.Vector3(0, lift, 0));
      const curve = new THREE.QuadraticBezierCurve3(start, mid, end);
      const tube = new THREE.Mesh(
        new THREE.TubeGeometry(curve, 48, 0.018, 6, false),
        new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.55, depthWrite: false }),
      );
      const packet = new THREE.Mesh(new THREE.SphereGeometry(0.065, 12, 10), new THREE.MeshBasicMaterial({ color }));
      this.beamGroup.add(tube, packet);
      this.beams.push({ curve, packet, phase: index * 0.27 });
    });
  }

  private syncEvents(state: WarState, locale: Locale, copy: SceneCopy): void {
    const fresh = [];
    for (let index = state.log.length - 1; index >= 0; index -= 1) {
      const event = state.log[index];
      if (this.seen.has(event)) break;
      this.seen.add(event);
      fresh.unshift(event);
    }
    if (!this.primed) {
      this.primed = true;
      return;
    }
    const now = performance.now();
    for (const event of fresh) {
      if (event.type === 'member_pose' || event.type === 'scene_cue') continue;
      const member = resolveMember(this.config, event.actor);
      const rig = member ? this.avatars.get(member.id) : undefined;
      if (!rig) continue;
      const urgent = event.type === 'escalation_urgent';
      const text = event.type === 'dm_message' ? copy.dm : pickL10n(actionText(event), locale);
      const limit = locale === 'zh-CN' ? 22 : 42;
      rig.bubble.textContent = text.length > limit ? `${text.slice(0, limit - 1)}…` : text;
      rig.bubble.classList.toggle('is-urgent', urgent);
      rig.bubble.classList.add('is-on');
      rig.bubbleUntil = now + (urgent ? 7000 : 4200);
      this.spawnRipple(rig.target.x, rig.target.z, urgent ? '#ff5a4a' : rig.color, urgent ? 6 : 3.2);
    }
  }

  private spawnRipple(x: number, z: number, color: string, grow: number): void {
    if (!this.scene || this.ripples.length > 24) return;
    const mesh = new THREE.Mesh(
      new THREE.RingGeometry(0.24, 0.31, 48),
      new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.8, side: THREE.DoubleSide, depthWrite: false }),
    );
    mesh.rotation.x = -Math.PI / 2;
    mesh.position.set(x, 0.07, z);
    this.scene.add(mesh);
    this.ripples.push({ mesh, born: performance.now(), life: 1400, grow });
  }

  focus(kind: 'member' | 'station' | null, id: string | null): void {
    const key = kind && id ? `${kind}:${id}` : '';
    const group =
      kind === 'member' && id ? this.avatars.get(id)?.group : kind === 'station' && id ? this.stations.get(id) : undefined;
    if (this.selectPass) this.selectPass.selectedObjects = group ? [group] : [];
    this.selectedZone =
      kind === 'member' && id
        ? (this.avatars.get(id)?.zone ?? null)
        : kind === 'station' && group
          ? String(group.userData.zone)
          : null;
    if (this.ring) {
      const rig = kind === 'member' && id ? this.avatars.get(id) : undefined;
      this.ring.visible = Boolean(rig);
      if (rig) this.ring.position.set(rig.target.x, 0.07, rig.target.z);
    }
    if (key && key !== this.focusKey && kind && id) this.flyTo(kind, id);
    this.focusKey = key;
  }

  private applyNight(value: number): void {
    const n = clamp(value, 0, 1);
    this.hemi.intensity = lerp(0.76, 0.14, n);
    this.ambient.intensity = lerp(0.24, 0.06, n);
    this.sun.intensity = lerp(1.12, 0.24, n);
    this.sun.color.copy(DAY_SUN).lerp(NIGHT_SUN, n);
    this.background.copy(DAY_BG).lerp(NIGHT_BG, n);
    for (const light of this.roomLights) light.intensity = n * 2.4;
    if (this.panes) {
      this.panes.emissive.copy(DAY_PANE).lerp(NIGHT_PANE, n);
      this.panes.emissiveIntensity = lerp(0.25, 0.7, n);
    }
    for (const glow of GLOW) glow.mat.emissiveIntensity = lerp(glow.day, glow.night, n);
    if (this.bloom) {
      this.bloom.strength = lerp(0.18, 0.85, n);
      this.bloom.threshold = lerp(0.92, 0.55, n);
    }
    if (this.renderer) this.renderer.toneMappingExposure = lerp(1.08, 1.02, n);
  }

  private hover(): void {
    if (!this.hoverPass || !this.renderer) return;
    const pick = this.pointer && !this.flight ? this.pickAt(this.pointer.x, this.pointer.y) : null;
    const key = pick ? `${pick.kind}:${pick.id}` : '';
    if (key === this.hoverKey) return;
    this.hoverKey = key;
    for (const node of this.stage.querySelectorAll('.is-hot')) node.classList.remove('is-hot');
    this.renderer.domElement.style.cursor = pick ? 'pointer' : '';
    this.hoverZone = null;
    if (!pick) {
      this.hoverPass.selectedObjects = [];
      return;
    }
    if (pick.kind === 'member') {
      const rig = this.avatars.get(pick.id);
      this.hoverPass.selectedObjects = rig ? [rig.group] : [];
      rig?.label.classList.add('is-hot');
      this.hoverZone = rig?.zone ?? null;
      return;
    }
    const group = this.stations.get(pick.id);
    this.hoverPass.selectedObjects = group ? [group] : [];
    this.zoneTags.get(pick.id)?.tag.classList.add('is-hot');
    this.hoverZone = group ? String(group.userData.zone) : null;
  }

  private tick = (now: number): void => {
    if (!this.running || !this.renderer || !this.scene || !this.camera || !this.controls || !this.composer) return;
    const t = now / 1000;
    const bob = this.reduced ? 0 : 1;

    if (this.flight) {
      const flight = this.flight;
      const raw = clamp((now - flight.start) / flight.duration, 0, 1);
      const k = raw < 0.5 ? 4 * raw * raw * raw : 1 - Math.pow(-2 * raw + 2, 3) / 2;
      this.controls.target.lerpVectors(flight.fromTarget, flight.toTarget, k);
      const offset = flight.fromOffset.clone().lerp(flight.toOffset, k);
      this.camera.position.copy(this.controls.target).add(offset);
      this.camera.zoom = lerp(flight.fromZoom, flight.toZoom, k);
      this.camera.updateProjectionMatrix();
      if (raw >= 1) this.flight = null;
    }
    this.controls.update();
    const target = this.controls.target;
    const clampX = clamp(target.x, -7.5, 7.5) - target.x;
    const clampZ = clamp(target.z, -3.6, 3.6) - target.z;
    if (clampX || clampZ) {
      target.x += clampX;
      target.z += clampZ;
      this.camera.position.x += clampX;
      this.camera.position.z += clampZ;
    }

    if (Math.abs(this.inset - this.insetTarget) > 0.5) {
      this.inset += (this.insetTarget - this.inset) * 0.16;
      this.applyView();
    }
    if (Math.abs(this.night - this.nightTarget) > 0.002) {
      this.night = this.night < 0 ? this.nightTarget : this.night + (this.nightTarget - this.night) * 0.05;
      this.applyNight(this.night);
    }

    for (const rig of this.avatars.values()) {
      rig.group.position.lerp(rig.target, 0.08);
      rig.group.position.y = rig.target.y + Math.sin(t * 2.2 + rig.group.position.x) * 0.02 * bob;
      const lampMat = rig.lamp.material as THREE.MeshStandardMaterial;
      lampMat.emissiveIntensity = 0.2 + this.night * 0.6 + Math.sin(t * 3 + rig.group.position.z) * 0.14;
      if (rig.bubbleUntil && now > rig.bubbleUntil) {
        rig.bubbleUntil = 0;
        rig.bubble.classList.remove('is-on');
      }
    }

    for (const [id, rig] of this.chips) {
      const chip = this.chipState?.find((item) => item.id === id);
      if (!chip) continue;
      const age = Math.min(1, (Date.now() - chip.ts) / 4800);
      const point = carryPoint(zoneBox(chip.fromZone), zoneBox(chip.toZone), age);
      const ahead = carryPoint(zoneBox(chip.fromZone), zoneBox(chip.toZone), Math.min(1, age + 0.04));
      const lift = Math.sin(Math.PI * age);
      const y = 0.8 + lift * 0.45 + Math.sin(t * 5) * 0.03 * bob;
      rig.group.position.set(point.x, y, point.z);
      const dx = ahead.x - point.x;
      const dz = ahead.z - point.z;
      if (dx * dx + dz * dz > 0.00001) rig.group.rotation.y = Math.atan2(dx, dz);
      rig.points.copyWithin(3, 0, (TRAIL - 1) * 3);
      rig.points[0] = point.x;
      rig.points[1] = y;
      rig.points[2] = point.z;
      if (!rig.trail.visible) {
        for (let index = 0; index < TRAIL; index += 1) rig.points.set([point.x, y, point.z], index * 3);
        rig.trail.visible = true;
      }
      rig.trail.geometry.attributes.position.needsUpdate = true;
      rig.group.visible = age < 1;
      rig.trail.visible = age < 1;
    }

    for (let index = this.ripples.length - 1; index >= 0; index -= 1) {
      const ripple = this.ripples[index];
      const age = (now - ripple.born) / ripple.life;
      if (age >= 1) {
        ripple.mesh.removeFromParent();
        ripple.mesh.geometry.dispose();
        this.ripples.splice(index, 1);
        continue;
      }
      ripple.mesh.scale.setScalar(1 + age * ripple.grow);
      (ripple.mesh.material as THREE.MeshBasicMaterial).opacity = 0.8 * (1 - age);
    }

    for (const beam of this.beams) {
      beam.packet.position.copy(beam.curve.getPoint((t * 0.42 + beam.phase) % 1));
    }

    if (this.gate) {
      const goal = this.gateOpen ? 1.35 : 0;
      this.gate.rotation.z += (goal - this.gate.rotation.z) * 0.06;
    }

    const pulse = 0.5 + Math.sin(t * 4) * 0.5;
    for (const [zone, material] of this.plates) {
      if (zone === this.alertZone) {
        material.emissive.set('#ff3b2f');
        material.emissiveIntensity = 0.15 + pulse * 0.35;
      } else if (this.liveZones.has(zone)) {
        material.emissive.set('#f2a54a');
        material.emissiveIntensity = 0.08 + pulse * 0.12;
      } else if (zone === this.selectedZone) {
        material.emissive.set('#4d8dff');
        material.emissiveIntensity = 0.12;
      } else if (zone === this.hoverZone) {
        material.emissive.set('#f0a040');
        material.emissiveIntensity = 0.07;
      } else {
        material.emissiveIntensity = 0;
      }
    }

    this.hover();
    if (this.ring?.visible) this.ring.scale.setScalar(1 + Math.sin(t * 3) * 0.08);
    this.composer.render();
    this.labels?.render(this.scene, this.camera);
    this.frame = requestAnimationFrame(this.tick);
  };

  stop(): void {
    this.running = false;
    cancelAnimationFrame(this.frame);
    this.controls?.dispose();
    this.composer?.dispose();
    this.renderer?.dispose();
  }
}

function zoneTag(zone: string, act?: string): { tag: HTMLElement; name: HTMLElement; metric: HTMLElement } {
  const tag = document.createElement('div');
  tag.className = 'zone-label';
  tag.dataset.zone = zone;
  if (act) tag.dataset.act = act;
  const name = document.createElement('strong');
  const metric = document.createElement('span');
  tag.append(name, metric);
  return { tag, name, metric };
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

function carryPoint(from: { x: number; z: number }, to: { x: number; z: number }, t: number): { x: number; z: number } {
  const leave = from.z < 0 ? 1.1 : -1.1;
  const arrive = to.z < 0 ? 1.1 : -1.1;
  const a = { x: from.x, z: from.z + leave };
  const b = { x: from.x, z: ROAD_Z };
  const c = { x: to.x, z: ROAD_Z };
  const d = { x: to.x, z: to.z + arrive };
  if (t < 0.22) return mix(a, b, t / 0.22);
  if (t < 0.78) return mix(b, c, (t - 0.22) / 0.56);
  return mix(c, d, (t - 0.78) / 0.22);
}

function mix(a: { x: number; z: number }, b: { x: number; z: number }, t: number): { x: number; z: number } {
  const eased = t * t * (3 - 2 * t);
  return { x: a.x + (b.x - a.x) * eased, z: a.z + (b.z - a.z) * eased };
}

function studio(id: string): THREE.Group {
  if (id === 'backlog') return backlogSet();
  if (id === 'design') return designSet();
  if (id === 'review') return reviewSet();
  if (id === 'build') return buildSet();
  if (id === 'test') return testSet();
  if (id === 'release') return releaseSet();
  return commandSet();
}

function backlogSet(): THREE.Group {
  const group = new THREE.Group();
  const desk = workstation(1.7);
  desk.position.z = DESK_Z;
  const sheet = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.012, 0.3), surface(PAPER, 0.55));
  sheet.position.set(0.45, 0.756, 0.1);
  const stripe = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.02, 0.06), surface(VIOLET, 0.45));
  stripe.position.set(0.45, 0.768, 0.2);
  const cup = mug();
  cup.position.set(-0.6, 0.745, 0.05);
  const pens = penCup();
  pens.position.set(-0.4, 0.745, 0.15);
  desk.add(sheet, stripe, cup, pens);
  group.add(desk);

  const board = wallBoard(2.4, 1.0);
  board.position.set(0.15, 1.2, WALL_FACE);
  for (let index = 0; index < 12; index += 1) {
    const card = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.18, 0.015), surface(VIOLET, 0.6));
    card.position.set(-0.9 + (index % 4) * 0.38, 0.28 - Math.floor(index / 4) * 0.26, 0.03);
    board.add(card);
  }
  for (let index = 0; index < 3; index += 1) {
    const card = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.18, 0.015), surface('#e6dccb', 0.6));
    card.position.set(0.85, 0.28 - index * 0.26, 0.03);
    board.add(card);
  }
  group.add(board);

  const shelf = bookShelf();
  shelf.rotation.y = Math.PI / 2;
  shelf.position.set(-1.45, 0, -0.55);
  group.add(shelf, plant(1.35, 1.15), printer(1.3, -0.15));
  return group;
}

function designSet(): THREE.Group {
  const group = new THREE.Group();
  const desk = workstation(1.7);
  desk.position.z = DESK_Z;
  const screen = desk.userData.screen as THREE.Mesh;
  [
    { x: -0.16, h: 0.2, color: INK },
    { x: -0.02, h: 0.14, color: BLUE },
    { x: 0.12, h: 0.14, color: AMBER },
  ].forEach((module) => {
    const block = new THREE.Mesh(new THREE.BoxGeometry(0.1, module.h, 0.012), surface(module.color, 0.4));
    block.position.set(module.x, -0.02, 0.02);
    screen.add(block);
  });
  const lamp = deskLamp();
  lamp.position.set(-0.68, 0.745, -0.12);
  const pad = openPad();
  pad.position.set(0.45, 0.75, 0.12);
  const ears = headset();
  ears.position.set(0.7, 0.75, -0.05);
  desk.add(lamp, pad, ears);
  group.add(desk);

  const board = wallBoard(2.2, 1.0);
  board.position.set(0, 1.2, WALL_FACE);
  const modules: [number, number, number, string][] = [
    [-0.62, 0.14, 0.5, INK],
    [0, 0.14, 0.5, BLUE],
    [0.62, 0.14, 0.5, AMBER],
  ];
  for (const [x, y, w, color] of modules) {
    const block = new THREE.Mesh(new THREE.BoxGeometry(w, 0.42, 0.02), surface(color, 0.45));
    block.position.set(x, y, 0.03);
    board.add(block);
  }
  const shell = new THREE.Mesh(new THREE.BoxGeometry(1.74, 0.16, 0.02), surface(TEAL, 0.45));
  shell.position.set(0, -0.3, 0.03);
  board.add(shell);
  group.add(board);

  const stand = new THREE.Mesh(new THREE.BoxGeometry(0.45, 0.62, 0.45), surface('#ede4d6', 0.6));
  stand.position.set(1.2, 0.31, 0.55);
  const model = phone();
  model.position.set(1.2, 0.62, 0.55);
  model.rotation.y = -0.35;
  group.add(stand, model, plant(-1.35, 1.15));
  return group;
}

function reviewSet(): THREE.Group {
  const group = new THREE.Group();
  const table = longTable(3.9, 1.0);
  table.position.z = -0.35;
  group.add(table);
  [ROSE, VIOLET, '#3aa0c9'].forEach((color, index) => {
    const x = -1.3 + index * 1.3;
    const stack = new THREE.Mesh(new THREE.BoxGeometry(0.4, 0.07, 0.3), surface(PAPER, 0.55));
    stack.position.set(x, 0.77, -0.05);
    const band = new THREE.Mesh(new THREE.BoxGeometry(0.4, 0.015, 0.06), surface(color, 0.45));
    band.position.set(x, 0.81, -0.15);
    const pen = new THREE.Mesh(new THREE.CylinderGeometry(0.012, 0.012, 0.24, 6), surface(RED, 0.45));
    pen.rotation.z = Math.PI / 2;
    pen.position.set(x + 0.32, 0.75, 0.05);
    const cup = mug();
    cup.position.set(x - 0.34, 0.74, 0.02);
    group.add(stack, band, pen, cup);
  });
  for (let index = 0; index < 39; index += 1) {
    const tick = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.012, 0.06), surface(GREEN, 0.5));
    tick.position.set(-1.56 + (index % 13) * 0.26, 0.746, -0.62 - Math.floor(index / 13) * 0.09);
    group.add(tick);
  }
  group.add(plant(-2.2, 1.2), plant(2.2, 1.2));
  return group;
}

function buildSet(): THREE.Group {
  const group = new THREE.Group();
  const desk = workstation(1.4, false);
  desk.position.z = DESK_Z;
  const note = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.16, 0.012), surface(AMBER, 0.55));
  note.position.set(0.4, 0.83, -0.2);
  const laptop = new THREE.Mesh(new THREE.BoxGeometry(0.36, 0.03, 0.25), surface(INK, 0.45));
  laptop.position.set(-0.35, 0.76, 0.08);
  desk.add(note, laptop);
  const empty = officeChair('#8a8178');
  empty.rotation.y = Math.PI;
  empty.position.set(0, 0, -0.45);
  group.add(desk, empty, serverRack(-0.85, -1.2));
  const low = crate();
  low.position.set(0.75, 0, 0.85);
  const high = crate();
  high.position.set(0.75, 0.28, 0.85);
  high.rotation.y = 0.3;
  group.add(low, high);
  return group;
}

function testSet(): THREE.Group {
  const group = new THREE.Group();
  const desk = workstation(1.7);
  desk.position.z = DESK_Z;
  const screen = desk.userData.screen as THREE.Mesh;
  for (let index = 0; index < 4; index += 1) {
    const line = new THREE.Mesh(new THREE.BoxGeometry(0.32, 0.012, 0.008), surface(index < 2 ? INK : '#d9d0c4', 0.45));
    line.position.set(-0.02, 0.08 - index * 0.06, 0.02);
    const mark = new THREE.Mesh(new THREE.BoxGeometry(0.025, 0.025, 0.008), surface(index < 2 ? GREEN : '#e6dfd4', 0.45));
    mark.position.set(-0.2, 0.08 - index * 0.06, 0.02);
    screen.add(line, mark);
  }
  const bug = new THREE.Mesh(new THREE.BoxGeometry(0.14, 0.012, 0.14), surface(RED, 0.5));
  bug.position.set(-0.55, 0.755, 0.12);
  const clip = clipboard();
  clip.position.set(0.5, 0.755, 0.12);
  const lamp = deskLamp();
  lamp.position.set(-0.7, 0.745, -0.12);
  desk.add(bug, clip, lamp);
  group.add(desk);

  const cabinet = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.62, 1.1), surface('#ede4d6', 0.6));
  cabinet.position.set(1.45, 0.31, 0.2);
  group.add(cabinet);
  for (let index = 0; index < 3; index += 1) {
    const device = phone();
    device.scale.setScalar(0.55);
    device.rotation.y = -Math.PI / 2;
    device.position.set(1.45, 0.62, -0.2 + index * 0.4);
    group.add(device);
  }
  group.add(plant(-1.5, 1.15));
  return group;
}

function releaseSet(): THREE.Group {
  const group = new THREE.Group();
  const frame = surface('#f7f3ec', 0.58);
  for (const x of [-0.52, 0.52]) {
    const post = new THREE.Mesh(new THREE.BoxGeometry(0.1, 1.3, 0.1), frame);
    post.position.set(x, 0.65, -1.45);
    group.add(post);
  }
  const lintel = new THREE.Mesh(new THREE.BoxGeometry(1.14, 0.1, 0.1), frame);
  lintel.position.set(0, 1.32, -1.45);
  const hinge = new THREE.BoxGeometry(0.95, 0.07, 0.06);
  hinge.translate(0.475, 0, 0);
  const bar = new THREE.Mesh(
    hinge,
    new THREE.MeshStandardMaterial({ color: RED, emissive: RED, emissiveIntensity: 0.45, roughness: 0.4, metalness: 0 }),
  );
  bar.position.set(-0.475, 0.72, -1.38);
  group.add(lintel, bar);

  const counter = longTable(1.3, 0.55);
  counter.position.set(-1.05, 0, -0.2);
  const parcel = new THREE.Mesh(new THREE.BoxGeometry(0.34, 0.24, 0.28), surface(PAPER, 0.55));
  parcel.position.set(-1.15, 0.86, -0.2);
  const ribbon = new THREE.Mesh(new THREE.BoxGeometry(0.36, 0.04, 0.06), surface(RED, 0.45));
  ribbon.position.set(-1.15, 0.99, -0.2);
  const stamp = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.08, 0.12), surface(RED, 0.45));
  stamp.position.set(-0.7, 0.78, -0.15);
  group.add(counter, parcel, ribbon, stamp);
  for (const [x, y, z] of [
    [1.0, 0, 0.7],
    [1.38, 0, 0.7],
    [1.19, 0.28, 0.7],
  ]) {
    const box = crate();
    box.position.set(x, y, z);
    group.add(box);
  }
  group.userData.gate = bar;
  return group;
}

function commandSet(): THREE.Group {
  const group = new THREE.Group();
  const glass = new THREE.MeshStandardMaterial({
    color: '#d5e6f6',
    roughness: 0.08,
    metalness: 0.02,
    transparent: true,
    opacity: 0.3,
    depthWrite: false,
  });
  for (const sign of [-1, 1]) {
    const pane = new THREE.Mesh(new THREE.BoxGeometry(1.6, 1.0, 0.03), glass);
    pane.position.set(sign * 1.3, 0.52, ROOM_D / 2 - 0.05);
    group.add(pane);
  }
  const header = new THREE.Mesh(new THREE.BoxGeometry(4.1, 0.05, 0.05), surface('#9aabbd', 0.35));
  header.position.set(0, 1.04, ROOM_D / 2 - 0.05);
  group.add(header);

  const screen = new THREE.Mesh(new THREE.BoxGeometry(2.4, 1.02, 0.05), surface(INK, 0.4));
  screen.position.set(0, 1.12, WALL_FACE);
  const canvas = document.createElement('canvas');
  canvas.width = 1024;
  canvas.height = 424;
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = 4;
  const face = new THREE.MeshStandardMaterial({
    color: '#ffffff',
    map: texture,
    emissive: '#ffffff',
    emissiveMap: texture,
    emissiveIntensity: 0.55,
    roughness: 0.4,
    metalness: 0,
  });
  GLOW.push({ mat: face, day: 0.55, night: 1.05 });
  const display = new THREE.Mesh(new THREE.PlaneGeometry(2.3, 0.95), face);
  display.position.z = 0.03;
  screen.add(display);
  group.add(screen);
  group.userData.wall = { canvas, texture };

  const table = longTable(2.7, 0.9);
  table.position.z = -0.5;
  const chair = officeChair('#3d342c');
  chair.rotation.y = -Math.PI / 2;
  chair.position.set(1.65, 0, -0.5);
  const cupA = mug();
  cupA.position.set(-0.75, 0.74, -0.3);
  const cupB = mug();
  cupB.position.set(0.45, 0.74, -0.3);
  const tray = new THREE.Mesh(new THREE.BoxGeometry(0.36, 0.03, 0.24), surface('#efe6d4', 0.6));
  tray.position.set(1.05, 0.75, -0.55);
  group.add(table, chair, cupA, cupB, tray, plant(-1.8, -1.2), plant(1.8, -1.2));
  return group;
}

function archiveSet(): THREE.Group {
  const group = new THREE.Group();
  for (const x of [-0.6, 0.15]) {
    const cabinet = new THREE.Mesh(new THREE.BoxGeometry(0.66, 1.15, 0.45), surface('#d9d3c6', 0.6));
    cabinet.position.set(x, 0.58, -1.25);
    group.add(cabinet);
    for (let index = 0; index < 3; index += 1) {
      const drawer = new THREE.Mesh(new THREE.BoxGeometry(0.54, 0.02, 0.02), surface(METAL, 0.4));
      drawer.position.set(x, 0.95 - index * 0.3, -1.02);
      group.add(drawer);
    }
  }
  const tab = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.08, 0.02), surface(GREEN, 0.5));
  tab.position.set(-0.42, 1.04, -1.01);
  const books = binders(5);
  books.position.set(0.6, 0, -1.25);
  const box = crate();
  box.position.set(0.55, 0, 0.75);
  group.add(tab, books, box, plant(-0.8, 1.15));
  return group;
}

function loungeSet(): THREE.Group {
  const group = new THREE.Group();
  const base = new THREE.Mesh(new THREE.BoxGeometry(2.3, 0.8, 0.55), surface('#e9dfcf', 0.6));
  base.position.set(-0.55, 0.4, -1.25);
  const top = new THREE.Mesh(new THREE.BoxGeometry(2.36, 0.05, 0.6), surface(DESK, 0.45));
  top.position.set(-0.55, 0.82, -1.25);
  const machine = new THREE.Mesh(new THREE.BoxGeometry(0.28, 0.36, 0.26), surface(INK, 0.45));
  machine.position.set(-1.25, 1.02, -1.3);
  const cupA = mug();
  cupA.position.set(-0.85, 0.845, -1.15);
  const cupB = mug();
  cupB.position.set(-0.6, 0.845, -1.2);
  const fridge = new THREE.Mesh(new THREE.BoxGeometry(0.62, 1.4, 0.55), surface('#e7eef2', 0.4));
  fridge.position.set(1.3, 0.7, -1.25);
  group.add(base, top, machine, cupA, cupB, fridge);

  const couch = sofa(2.0);
  couch.position.set(-0.45, 0, 0.35);
  const table = new THREE.Mesh(new THREE.BoxGeometry(1.1, 0.06, 0.55), surface('#f8f1e8', 0.55));
  table.position.set(-0.45, 0.32, 1.15);
  const rack = coatRack();
  rack.position.set(1.4, 0, 0.6);
  group.add(couch, table, rack, plant(1.45, 1.2));
  return group;
}

function wallBoard(width: number, height: number): THREE.Group {
  const group = new THREE.Group();
  const frame = new THREE.Mesh(new THREE.BoxGeometry(width + 0.08, height + 0.08, 0.03), surface('#c8b9a3', 0.6));
  const face = new THREE.Mesh(new THREE.BoxGeometry(width, height, 0.02), surface('#fffdf8', 0.5));
  face.position.z = 0.015;
  group.add(frame, face);
  return group;
}

function longTable(width: number, depth: number): THREE.Group {
  const group = new THREE.Group();
  const top = new THREE.Mesh(new THREE.BoxGeometry(width, 0.06, depth), surface('#f8f1e8', 0.5));
  top.position.y = 0.71;
  group.add(top);
  const leg = new THREE.BoxGeometry(0.05, 0.68, 0.05);
  const metal = surface(METAL, 0.4);
  for (const x of [-width / 2 + 0.1, width / 2 - 0.1]) {
    for (const z of [-depth / 2 + 0.08, depth / 2 - 0.08]) {
      const mesh = new THREE.Mesh(leg, metal);
      mesh.position.set(x, 0.34, z);
      group.add(mesh);
    }
  }
  return group;
}

function printer(x: number, z: number): THREE.Group {
  const group = new THREE.Group();
  const stand = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.55, 0.45), surface('#ede4d6', 0.6));
  stand.position.y = 0.275;
  const body = new THREE.Mesh(new THREE.BoxGeometry(0.44, 0.2, 0.38), surface('#d8d4cc', 0.5));
  body.position.y = 0.65;
  const paper = new THREE.Mesh(new THREE.BoxGeometry(0.24, 0.01, 0.2), surface(PAPER, 0.5));
  paper.position.set(0, 0.76, 0.06);
  group.add(stand, body, paper);
  group.position.set(x, 0, z);
  return group;
}

function serverRack(x: number, z: number): THREE.Group {
  const group = new THREE.Group();
  const body = new THREE.Mesh(new THREE.BoxGeometry(0.5, 1.35, 0.48), surface('#2a2f38', 0.5));
  body.position.y = 0.675;
  group.add(body);
  for (let index = 0; index < 5; index += 1) {
    const led = new THREE.Mesh(
      new THREE.BoxGeometry(0.05, 0.03, 0.01),
      new THREE.MeshStandardMaterial({
        color: index === 2 ? AMBER : '#5c6470',
        emissive: index === 2 ? AMBER : '#000000',
        emissiveIntensity: 0.6,
        roughness: 0.4,
        metalness: 0,
      }),
    );
    led.position.set(-0.15, 1.15 - index * 0.2, 0.245);
    if (index === 2) GLOW.push({ mat: led.material, day: 0.6, night: 2.4 });
    group.add(led);
  }
  group.position.set(x, 0, z);
  return group;
}

function workstation(width: number, lit = true): THREE.Group {
  const group = new THREE.Group();
  const top = new THREE.Mesh(new THREE.BoxGeometry(width, 0.05, 0.62), surface(DESK, 0.48));
  top.position.y = 0.72;
  const leg = new THREE.BoxGeometry(0.04, 0.68, 0.04);
  const metal = surface(METAL, 0.35);
  for (const x of [-width / 2 + 0.06, width / 2 - 0.06]) {
    const mesh = new THREE.Mesh(leg, metal);
    mesh.position.set(x, 0.34, 0);
    group.add(mesh);
  }
  const housing = new THREE.Mesh(new THREE.BoxGeometry(0.62, 0.4, 0.04), surface(INK, 0.4));
  housing.position.set(0, 1.02, -0.22);
  const screen = new THREE.Mesh(
    new THREE.BoxGeometry(0.52, 0.3, 0.015),
    new THREE.MeshStandardMaterial({
      color: lit ? '#f7f4ee' : '#14181e',
      emissive: lit ? '#f3ecdf' : '#10141a',
      emissiveIntensity: lit ? 0.18 : 0.15,
      roughness: 0.35,
      metalness: 0,
    }),
  );
  screen.position.set(0, 1.02, -0.19);
  GLOW.push({ mat: screen.material as THREE.MeshStandardMaterial, day: lit ? 0.18 : 0.15, night: lit ? 1.25 : 0.2 });
  const keys = new THREE.Mesh(new THREE.BoxGeometry(0.28, 0.015, 0.1), surface('#e6dfd4', 0.55));
  keys.position.set(0, 0.755, 0.08);
  group.add(top, housing, screen, keys);
  group.userData.screen = screen;
  return group;
}

function officeChair(tone = CHAIR): THREE.Group {
  const group = new THREE.Group();
  const seat = new THREE.Mesh(new THREE.BoxGeometry(0.32, 0.04, 0.3), surface(tone, 0.55));
  seat.position.y = 0.42;
  const back = new THREE.Mesh(new THREE.BoxGeometry(0.32, 0.34, 0.04), surface(tone, 0.55));
  back.position.set(0, 0.62, -0.14);
  const stem = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.03, 0.28, 8), surface(METAL, 0.3));
  stem.position.y = 0.24;
  group.add(seat, back, stem);
  return group;
}

function phone(): THREE.Group {
  const group = new THREE.Group();
  const body = new THREE.Mesh(new THREE.BoxGeometry(0.28, 0.5, 0.045), surface(INK, 0.4));
  body.position.y = 0.25;
  const screen = new THREE.Mesh(new THREE.BoxGeometry(0.22, 0.38, 0.01), surface(PAPER, 0.35));
  screen.position.set(0, 0.26, 0.024);
  group.add(body, screen);
  for (let index = 0; index < 4; index += 1) {
    const line = new THREE.Mesh(new THREE.BoxGeometry(0.14, 0.012, 0.008), surface('#cfc8bc', 0.5));
    line.position.set(0, 0.36 - index * 0.07, 0.032);
    group.add(line);
  }
  return group;
}

function plant(x: number, z: number): THREE.Group {
  const group = new THREE.Group();
  const pot = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.1, 0.16, 10), surface('#d5dbe3', 0.6));
  pot.position.y = 0.1;
  const leaf = new THREE.Mesh(new THREE.SphereGeometry(0.2, 12, 10), surface('#7ea37a', 0.75));
  leaf.position.y = 0.34;
  group.add(pot, leaf);
  group.position.set(x, 0, z);
  return group;
}

function figure(color: string): THREE.Group {
  const group = new THREE.Group();
  group.add(officeChair());
  const cloth = surface(PAPER, 0.65);
  const skin = surface('#f0e2d4', 0.6);
  const thigh = new THREE.BoxGeometry(0.07, 0.06, 0.16);
  const left = new THREE.Mesh(thigh, cloth);
  left.position.set(-0.06, 0.46, 0.1);
  const right = new THREE.Mesh(thigh, cloth);
  right.position.set(0.06, 0.46, 0.1);
  const torso = new THREE.Mesh(new THREE.BoxGeometry(0.22, 0.24, 0.12), cloth);
  torso.position.set(0, 0.64, 0.02);
  const head = new THREE.Mesh(new THREE.SphereGeometry(0.08, 14, 12), skin);
  head.position.set(0, 0.86, 0.03);
  const lamp = new THREE.Mesh(
    new THREE.BoxGeometry(0.24, 0.07, 0.13),
    new THREE.MeshStandardMaterial({ color, emissive: color, emissiveIntensity: 0.28, roughness: 0.45, metalness: 0 }),
  );
  lamp.position.set(0, 0.7, 0.04);
  group.add(left, right, torso, head, lamp);
  group.userData.body = torso;
  group.userData.lamp = lamp;
  return group;
}

function dossier(): THREE.Group {
  const group = new THREE.Group();
  const pages = new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.045, 0.3), surface(PAPER, 0.65));
  pages.position.y = 0.08;
  const cover = new THREE.Mesh(
    new THREE.BoxGeometry(0.44, 0.015, 0.32),
    new THREE.MeshStandardMaterial({ color: BLUE, emissive: BLUE, emissiveIntensity: 0.9, roughness: 0.45, metalness: 0 }),
  );
  cover.position.y = 0.11;
  const spine = new THREE.Mesh(new THREE.BoxGeometry(0.04, 0.06, 0.32), surface(CHAIR, 0.55));
  spine.position.set(-0.2, 0.08, 0);
  group.add(pages, cover, spine);
  return group;
}

function mug(): THREE.Group {
  const group = new THREE.Group();
  const cup = new THREE.Mesh(new THREE.CylinderGeometry(0.045, 0.038, 0.09, 8), surface('#f7f1e6', 0.5));
  cup.position.y = 0.045;
  const coffee = new THREE.Mesh(new THREE.CylinderGeometry(0.034, 0.034, 0.012, 8), surface('#6b432c', 0.4));
  coffee.position.y = 0.08;
  group.add(cup, coffee);
  return group;
}

function deskLamp(): THREE.Group {
  const group = new THREE.Group();
  const base = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.08, 0.02, 8), surface(METAL, 0.4));
  const stem = new THREE.Mesh(new THREE.CylinderGeometry(0.012, 0.012, 0.26, 6), surface(METAL, 0.35));
  stem.position.y = 0.15;
  const shade = new THREE.Mesh(new THREE.ConeGeometry(0.09, 0.08, 8), surface('#f0d7a2', 0.5));
  shade.position.y = 0.3;
  const glow = new THREE.Mesh(
    new THREE.SphereGeometry(0.028, 8, 6),
    new THREE.MeshStandardMaterial({ color: '#ffe3ad', emissive: '#ffcc73', emissiveIntensity: 0.7, roughness: 0.35, metalness: 0 }),
  );
  glow.position.y = 0.26;
  GLOW.push({ mat: glow.material, day: 0.7, night: 2 });
  group.add(base, stem, shade, glow);
  return group;
}

function penCup(): THREE.Group {
  const group = new THREE.Group();
  const cup = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.036, 0.1, 8), surface('#efe6d6', 0.6));
  cup.position.y = 0.05;
  [BLUE, RED, INK].forEach((color, index) => {
    const pen = new THREE.Mesh(new THREE.CylinderGeometry(0.006, 0.006, 0.16, 5), surface(color, 0.4));
    pen.position.set((index - 1) * 0.014, 0.12, 0);
    group.add(pen);
  });
  group.add(cup);
  return group;
}

function openPad(): THREE.Group {
  const group = new THREE.Group();
  const page = new THREE.Mesh(new THREE.BoxGeometry(0.28, 0.012, 0.2), surface(PAPER, 0.5));
  page.position.y = 0.006;
  for (let index = 0; index < 3; index += 1) {
    const line = new THREE.Mesh(new THREE.BoxGeometry(0.18, 0.006, 0.008), surface('#cfc6b8', 0.5));
    line.position.set(0, 0.014, -0.05 + index * 0.04);
    group.add(line);
  }
  group.add(page);
  return group;
}

function headset(): THREE.Group {
  const group = new THREE.Group();
  const band = new THREE.Mesh(new THREE.TorusGeometry(0.06, 0.008, 6, 10, Math.PI), surface(INK, 0.45));
  band.rotation.z = Math.PI;
  band.position.y = 0.06;
  const pad = new THREE.Mesh(new THREE.BoxGeometry(0.03, 0.05, 0.02), surface(TEAL, 0.45));
  pad.position.set(0.06, 0.02, 0);
  group.add(band, pad);
  return group;
}

function clipboard(): THREE.Group {
  const group = new THREE.Group();
  const board = new THREE.Mesh(new THREE.BoxGeometry(0.18, 0.012, 0.24), surface('#efe8dc', 0.55));
  const clip = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.015, 0.03), surface(METAL, 0.35));
  clip.position.set(0, 0.012, -0.09);
  group.add(board, clip);
  return group;
}

function binders(count: number): THREE.Group {
  const group = new THREE.Group();
  const colors = [VIOLET, BLUE, TEAL, AMBER, ROSE, GREEN];
  for (let index = 0; index < count; index += 1) {
    const book = new THREE.Mesh(new THREE.BoxGeometry(0.07, 0.32, 0.22), surface(colors[index % colors.length], 0.55));
    book.position.set(index * 0.08, 0.16, 0);
    group.add(book);
  }
  return group;
}

function crate(): THREE.Group {
  const group = new THREE.Group();
  const box = new THREE.Mesh(new THREE.BoxGeometry(0.34, 0.26, 0.28), surface('#c4a574', 0.72));
  box.position.y = 0.13;
  const lid = new THREE.Mesh(new THREE.BoxGeometry(0.36, 0.03, 0.3), surface('#b08a58', 0.65));
  lid.position.y = 0.27;
  group.add(box, lid);
  return group;
}

function bookShelf(): THREE.Group {
  const group = new THREE.Group();
  const frame = surface('#c4b49a', 0.7);
  const side = new THREE.BoxGeometry(0.04, 0.9, 0.28);
  for (const x of [-0.28, 0.28]) {
    const panel = new THREE.Mesh(side, frame);
    panel.position.set(x, 0.45, 0);
    group.add(panel);
  }
  for (const y of [0.08, 0.42, 0.78]) {
    const plank = new THREE.Mesh(new THREE.BoxGeometry(0.56, 0.03, 0.28), frame);
    plank.position.y = y;
    group.add(plank);
  }
  const row = binders(5);
  row.position.set(-0.18, 0.44, 0);
  group.add(row);
  return group;
}

function coatRack(): THREE.Group {
  const group = new THREE.Group();
  const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.028, 1.05, 6), surface(METAL, 0.4));
  pole.position.y = 0.52;
  const coat = new THREE.Mesh(new THREE.BoxGeometry(0.28, 0.42, 0.05), surface(INK, 0.62));
  coat.position.set(0, 0.72, 0);
  group.add(pole, coat);
  return group;
}

function sofa(width: number): THREE.Group {
  const group = new THREE.Group();
  const seat = new THREE.Mesh(new THREE.BoxGeometry(width, 0.16, 0.62), surface('#6d5c74', 0.65));
  seat.position.y = 0.28;
  const back = new THREE.Mesh(new THREE.BoxGeometry(width, 0.36, 0.1), surface('#5c4d64', 0.6));
  back.position.set(0, 0.5, -0.26);
  const arm = new THREE.BoxGeometry(0.1, 0.22, 0.62);
  const cloth = surface('#5c4d64', 0.6);
  for (const x of [-width / 2 + 0.05, width / 2 - 0.05]) {
    const mesh = new THREE.Mesh(arm, cloth);
    mesh.position.set(x, 0.4, 0);
    group.add(mesh);
  }
  group.add(seat, back);
  return group;
}

function surface(color: string, roughness: number): THREE.MeshStandardMaterial {
  return new THREE.MeshStandardMaterial({ color, roughness, metalness: 0 });
}

