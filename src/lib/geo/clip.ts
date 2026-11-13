// Cuts a polygon by another one: the land of a country that lies inside a given outline, such as
// Russia west of the Urals. Greiner and Hormann's method (1998): both outlines become linked rings,
// every crossing is put into both, and the part inside is traced by switching rings at each
// crossing. Exact along both outlines: the result keeps every point of the country's border and
// every point of the cutting line.

import { closeRing, type Position } from "./geometry";

interface Node {
  x: number;
  y: number;
  next: Node;
  prev: Node;
  /** A crossing of the two outlines (in both rings, linked to its twin by `twin`). */
  crossing: boolean;
  twin: Node | null;
  /** Where along its edge the crossing is (0 to 1), to keep crossings on one edge in order. */
  along: number;
  /** Following this ring from here goes into the other polygon. */
  entry: boolean;
  visited: boolean;
}

function node(x: number, y: number): Node {
  const n = { x, y, crossing: false, twin: null, along: 0, entry: false, visited: false } as unknown as Node;
  n.next = n;
  n.prev = n;
  return n;
}

/** The ring's corners as a linked ring (a closing point equal to the first is dropped). */
function linkRing(ring: Position[]): Node[] {
  const points = ring.length > 1 && ring[0][0] === ring[ring.length - 1][0] && ring[0][1] === ring[ring.length - 1][1] ? ring.slice(0, -1) : ring;
  const nodes = points.map(([x, y]) => node(x, y));
  nodes.forEach((n, i) => {
    n.next = nodes[(i + 1) % nodes.length];
    n.prev = nodes[(i - 1 + nodes.length) % nodes.length];
  });
  return nodes;
}

/** Puts a crossing between two corners of a ring, after any crossing that comes before it. */
function insertBetween(crossing: Node, from: Node, to: Node) {
  let after = from;
  while (after.next !== to && after.next.along < crossing.along) after = after.next;
  crossing.next = after.next;
  crossing.prev = after;
  after.next.prev = crossing;
  after.next = crossing;
}

function insideRing(x: number, y: number, ring: Node[]): boolean {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const a = ring[i];
    const b = ring[j];
    if (a.y > y !== b.y > y && x < ((b.x - a.x) * (y - a.y)) / (b.y - a.y) + a.x) inside = !inside;
  }
  return inside;
}

const NEAR_END = 1e-9;

/** A corner of one outline lying exactly on the other: the cutting line is nudged and the cut tried again. */
class Touching extends Error {}

function cutRing(subject: Position[], clip: Position[]): Position[][] {
  const s = linkRing(subject);
  const c = linkRing(clip);
  if (s.length < 3 || c.length < 3) return [];

  // 1. Every crossing, put into both rings.
  let crossings = 0;
  for (let i = 0; i < s.length; i++) {
    const a1 = s[i];
    const a2 = s[(i + 1) % s.length];
    const minX = Math.min(a1.x, a2.x);
    const maxX = Math.max(a1.x, a2.x);
    const minY = Math.min(a1.y, a2.y);
    const maxY = Math.max(a1.y, a2.y);
    for (let j = 0; j < c.length; j++) {
      const b1 = c[j];
      const b2 = c[(j + 1) % c.length];
      if (Math.max(b1.x, b2.x) < minX || Math.min(b1.x, b2.x) > maxX || Math.max(b1.y, b2.y) < minY || Math.min(b1.y, b2.y) > maxY) continue;
      const dax = a2.x - a1.x;
      const day = a2.y - a1.y;
      const dbx = b2.x - b1.x;
      const dby = b2.y - b1.y;
      const det = dax * dby - day * dbx;
      if (det === 0) continue;
      const ex = b1.x - a1.x;
      const ey = b1.y - a1.y;
      const t = (ex * dby - ey * dbx) / det;
      const u = (ex * day - ey * dax) / det;
      if (t < -NEAR_END || t > 1 + NEAR_END || u < -NEAR_END || u > 1 + NEAR_END) continue;
      if (t < NEAR_END || t > 1 - NEAR_END || u < NEAR_END || u > 1 - NEAR_END) throw new Touching();
      const x = a1.x + t * dax;
      const y = a1.y + t * day;
      const onSubject = node(x, y);
      const onClip = node(x, y);
      onSubject.crossing = onClip.crossing = true;
      onSubject.twin = onClip;
      onClip.twin = onSubject;
      onSubject.along = t;
      onClip.along = u;
      insertBetween(onSubject, a1, a2);
      insertBetween(onClip, b1, b2);
      crossings++;
    }
  }

  if (!crossings) {
    if (insideRing(s[0].x, s[0].y, c)) return [subject];
    if (insideRing(c[0].x, c[0].y, s)) return [closeRing(clip)];
    return [];
  }

  // 2. Which crossings lead into the other polygon.
  const mark = (start: Node, other: Node[]) => {
    let inside = insideRing(start.x, start.y, other);
    let n = start;
    do {
      if (n.crossing) {
        n.entry = !inside;
        inside = !inside;
      }
      n = n.next;
    } while (n !== start);
  };
  mark(s[0], c);
  mark(c[0], s);

  // 3. Trace the parts inside both, switching rings at each crossing.
  const parts: Position[][] = [];
  let start: Node | null = s[0];
  for (;;) {
    let n: Node = start;
    while (!(n.crossing && !n.visited)) {
      n = n.next;
      if (n === start) break;
    }
    if (!(n.crossing && !n.visited)) break;
    start = n;
    const ring: Position[] = [[n.x, n.y]];
    let current: Node = n;
    do {
      current.visited = true;
      (current.twin as Node).visited = true;
      const forward = current.entry;
      do {
        current = forward ? current.next : current.prev;
        ring.push([current.x, current.y]);
      } while (!current.crossing);
      current = current.twin as Node;
    } while (!current.visited);
    if (ring.length >= 4) parts.push(closeRing(ring));
  }
  return parts;
}

/** The parts of a ring inside the clip ring (each closed). */
export function clipRing(subject: Position[], clip: Position[]): Position[][] {
  let outline = clip;
  for (let attempt = 0; attempt < 6; attempt++) {
    try {
      return cutRing(subject, outline);
    } catch (error) {
      if (!(error instanceof Touching)) throw error;
      // About a centimetre: nothing on a map moves, but the line no longer runs exactly through a corner.
      const nudge = 1e-7 * (attempt + 1);
      outline = clip.map(([x, y]) => [x + nudge, y + nudge * 0.7]);
    }
  }
  return cutRing(subject, outline);
}

function insideClosed(point: Position, ring: Position[]): boolean {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [xi, yi] = ring[i];
    const [xj, yj] = ring[j];
    if (yi > point[1] !== yj > point[1] && point[0] < ((xj - xi) * (point[1] - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}

/**
 * The parts of a polygon (outer ring, then holes) inside the clip ring. A hole is cut the same way
 * and stays a hole of the part around it, so the land taken away is exactly the hole's land inside.
 */
export function clipPolygon(polygon: Position[][], clip: Position[]): Position[][][] {
  const [outer, ...holes] = polygon;
  if (!outer) return [];
  const parts: Position[][][] = clipRing(outer, clip).map((ring) => [ring]);
  for (const hole of holes) {
    for (const piece of clipRing(hole, clip)) {
      const home = parts.find(([ring]) => insideClosed(piece[0], ring) || insideClosed(piece[Math.floor(piece.length / 2)], ring));
      home?.push(piece);
    }
  }
  return parts;
}
