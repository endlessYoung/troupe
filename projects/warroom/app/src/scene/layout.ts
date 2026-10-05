export interface ZoneBox {
  x: number;
  z: number;
  w: number;
  d: number;
  rise: number;
}

/** The floor is 16 x 7.6. Rooms tile it edge to edge: five behind the corridor, four in front. */
export const FLOOR_W = 16;
export const ROOM_D = 3.2;
export const CORRIDOR_D = 1.2;
export const FLOOR_D = ROOM_D * 2 + CORRIDOR_D;
const BACK = -(CORRIDOR_D / 2 + ROOM_D / 2);
const FRONT = CORRIDOR_D / 2 + ROOM_D / 2;

export const ZONE_BOXES: Record<string, ZoneBox> = {
  inception: { x: -6.8, z: BACK, w: 2.4, d: ROOM_D, rise: 0 },
  planning: { x: -3.9, z: BACK, w: 3.4, d: ROOM_D, rise: 0 },
  command: { x: -0.1, z: BACK, w: 4.2, d: ROOM_D, rise: 0 },
  design: { x: 3.7, z: BACK, w: 3.4, d: ROOM_D, rise: 0 },
  build: { x: 6.7, z: BACK, w: 2.6, d: ROOM_D, rise: 0 },
  release: { x: -6.2, z: FRONT, w: 3.6, d: ROOM_D, rise: 0 },
  qc: { x: -1.9, z: FRONT, w: 5.0, d: ROOM_D, rise: 0 },
  test: { x: 2.4, z: FRONT, w: 3.6, d: ROOM_D, rise: 0 },
  lounge: { x: 6.1, z: FRONT, w: 3.8, d: ROOM_D, rise: 0 },
};

export const ROAD_Z = 0;

export function zoneBox(id: string): ZoneBox {
  return ZONE_BOXES[id] ?? { x: 0, z: FRONT, w: 3, d: ROOM_D, rise: 0 };
}

/** Everyone sits facing the far side of their room, where the desk and wall screen are. */
export function memberXZ(zoneId: string, slot: number, seat: number, seats: number): { x: number; z: number } {
  const box = zoneBox(zoneId);
  if (zoneId === 'command') {
    const side = seat === 0 ? -0.75 : 0.45;
    const nudge = slot === 2 ? 0.08 : slot === 0 ? -0.05 : 0;
    return { x: box.x + side + nudge, z: box.z + 0.25 };
  }
  if (zoneId === 'qc') {
    return { x: box.x - 1.3 + seat * 1.3, z: box.z + 0.55 };
  }
  const span = Math.min(box.w * 0.6, seats * 1.1);
  const step = span / Math.max(seats, 1);
  return { x: box.x - span / 2 + step * (seat + 0.5), z: box.z - 0.45 };
}
