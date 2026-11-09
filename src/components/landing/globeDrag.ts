// Turning the planet by hand, like a globe on a desk, and the lens it is seen through.
// Pure functions, so the feel can be tested.
//
// The hand turns the globe about its own axis and tips it towards the viewer, always at the same
// speed. North therefore stays up: the planet can't end up sideways or upside down.

import * as THREE from "three";
import { faceRotation } from "./story";

export interface View {
  /** The place at the middle of the planet's disc. */
  lat: number;
  lon: number;
}

/** As far as the globe tips: the pole comes well into view, but can't pass the middle and flip the globe over. */
export const TILT_LIMIT = 72;
/** The tilt slows down over this many degrees before the limit, rather than hitting a wall. */
const TILT_EASE = 16;

/**
 * The camera's distance from the planet's middle, in planet radii. A real camera at a real distance:
 * the ground swells gently towards the viewer, which is what makes a turning planet read as a solid
 * ball. (With no perspective at all, it reads as a flat picture sliding under a magnifying lens.)
 */
export const CAMERA_DISTANCE = 4.6;
const HORIZON_TAN = 1 / Math.sqrt(CAMERA_DISTANCE * CAMERA_DISTANCE - 1);
/** Ground further round than this height along the line of sight is hidden behind the planet's edge. */
export const HORIZON_HEIGHT = 1 / CAMERA_DISTANCE;
/** A flat sheet through the planet's middle, this big, lines up exactly with the planet's visible edge. */
export const EDGE_ON_MIDDLE_PLANE = CAMERA_DISTANCE * HORIZON_TAN;

const DEGREES = 180 / Math.PI;

/** The lens that makes the planet's visible edge this many pixels from its middle. */
export function lensFor(radius: number): { focal: number; pixelsPerRadian: number } {
  const focal = radius / HORIZON_TAN;
  return { focal, pixelsPerRadian: focal / (CAMERA_DISTANCE - 1) };
}

/** A point on the planet (camera frame, planet radius 1) in pixels from the middle of the disc. */
export function onScreen(point: { x: number; y: number; z: number }, focal: number): { x: number; y: number } {
  const scale = focal / (CAMERA_DISTANCE - point.z);
  return { x: point.x * scale, y: point.y * scale };
}

/** Tips the globe, slowing down as it nears the limit in either direction. Moving back is never slowed. */
export function tiltBy(lat: number, change: number): number {
  const towardsPole = lat * change > 0;
  const room = TILT_LIMIT - Math.abs(lat);
  const give = towardsPole ? THREE.MathUtils.smoothstep(room, 0, TILT_EASE) : 1;
  return THREE.MathUtils.clamp(lat + change * give, -TILT_LIMIT, TILT_LIMIT);
}

/**
 * The view after the hand moves (dx to the right, dy upwards). The surface goes the way the hand
 * goes, at one speed everywhere; `pixelsPerRadian` makes the ground at the middle keep up with the hand.
 */
export function turnGlobe(view: View, dx: number, dy: number, pixelsPerRadian = 1): View {
  return {
    lat: tiltBy(view.lat, -(dy / pixelsPerRadian) * DEGREES),
    lon: view.lon - (dx / pixelsPerRadian) * DEGREES,
  };
}

const euler = new THREE.Euler();
const lean = new THREE.Quaternion();
const Z_AXIS = new THREE.Vector3(0, 0, 1);

/** How the planet is turned to show a view, with north up (leaning by `roll` radians). */
export function orientationFacing(lat: number, lon: number, roll = 0, out = new THREE.Quaternion()): THREE.Quaternion {
  const { x, y } = faceRotation(lat, lon);
  out.setFromEuler(euler.set(x, y, 0));
  return roll ? out.premultiply(lean.setFromAxisAngle(Z_AXIS, roll)) : out;
}

export interface DragSample {
  /** Milliseconds. */
  time: number;
  /** The pointer on screen, with y upwards. */
  x: number;
  y: number;
}

/** Fastest a flick can spin the planet, in radians a second. */
const MAX_FLICK = 2.6;
/** Only the last moment of a drag counts towards a flick, in milliseconds. */
const FLICK_WINDOW = 100;
/** Pausing this long before letting go means no flick. */
const FLICK_PAUSE = 60;

/**
 * How fast the planet keeps turning when let go, in radians a second. It comes only from the very
 * end of the drag: stop and hold before letting go, and it simply stays where it is.
 */
export function flickSpeed(samples: DragSample[], now: number, pixelsPerRadian: number): { x: number; y: number } {
  const still = { x: 0, y: 0 };
  const recent = samples.filter((sample) => now - sample.time <= FLICK_WINDOW);
  if (recent.length < 2) return still;
  const first = recent[0];
  const last = recent[recent.length - 1];
  const seconds = (last.time - first.time) / 1000;
  if (now - last.time > FLICK_PAUSE || seconds < 0.008) return still;
  const x = (last.x - first.x) / seconds / pixelsPerRadian;
  const y = (last.y - first.y) / seconds / pixelsPerRadian;
  const speed = Math.hypot(x, y);
  const scale = speed > MAX_FLICK ? MAX_FLICK / speed : 1;
  return { x: x * scale, y: y * scale };
}
