import {
  Suspense,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type KeyboardEvent,
  type MutableRefObject,
  type PointerEvent as ReactPointerEvent,
} from "react";
import { Canvas, useFrame, useLoader, useThree } from "@react-three/fiber";
import * as THREE from "three";
import { TextureLoader } from "three";
import {
  advanceAuto,
  dayOfYear,
  easeHourTowards,
  latLonToSphere,
  subsolarPoint,
  utcHours,
  type DayNightMode,
  type HourStore,
} from "./landing/sun";

/**
 * The landing page's Earth: real day and night from the sun's position, dim warm city lights,
 * a soft even atmosphere that slowly breathes, the blue particle ring and a quiet starfield.
 * Textures are bundled: the Blue Marble day image (three.js examples), and NASA GIBS night lights
 * (VIIRS Black Marble) and land/water mask from `npm run data:earth`.
 */

const BASE = import.meta.env.BASE_URL;
const TEXTURES = [
  `${BASE}textures/earth_atmos_2048.jpg`,
  `${BASE}textures/earth_night_2048.jpg`,
  `${BASE}textures/earth_water_1024.png`,
];

// The look approved in the live previews.
const LOOK = {
  daylight: 0.6,
  ambient: 0.06,
  highlightSoftening: 0.5,
  oceanGlint: 0.05,
  surfaceHaze: 0.4,
  cityLights: 0.62,
  atmosphereGlow: 0.27,
};

const SPIN_SECONDS_PER_TURN = 80;
const RING_SPIN = 0.04; // radians per second
const BREATH_SECONDS = 7;
const ENTRANCE_SECONDS = 2.5;
const STAR_COUNT = 1000;
const RING_COUNT = 4000;

// Adds light without touching the canvas alpha, so glows blend softly over the page behind.
const ADDITIVE = {
  transparent: true,
  depthWrite: false,
  blending: THREE.CustomBlending,
  blendSrc: THREE.OneFactor,
  blendDst: THREE.OneFactor,
  blendSrcAlpha: THREE.ZeroFactor,
  blendDstAlpha: THREE.OneFactor,
} as const;

const SPHERE_VERTEX = `
  uniform vec3 uSun;
  varying vec2 vUv;
  varying vec3 vNormal;
  varying vec3 vWorld;
  varying vec3 vSun;
  void main() {
    vUv = uv;
    mat3 m = mat3(modelMatrix);
    vNormal = normalize(m * normal);
    vSun = normalize(m * uSun);
    vec4 world = modelMatrix * vec4(position, 1.0);
    vWorld = world.xyz;
    gl_Position = projectionMatrix * viewMatrix * world;
  }
`;

const EARTH_FRAGMENT = `
  uniform sampler2D uDay;
  uniform sampler2D uNight;
  uniform sampler2D uWater;
  uniform float uDaylight;
  uniform float uAmbient;
  uniform float uSoftening;
  uniform float uGlint;
  uniform float uHaze;
  uniform float uCity;
  uniform float uFade;
  varying vec2 vUv;
  varying vec3 vNormal;
  varying vec3 vWorld;
  varying vec3 vSun;
  void main() {
    vec3 N = normalize(vNormal);
    vec3 V = normalize(cameraPosition - vWorld);
    float d = dot(N, vSun);
    float day = smoothstep(-0.18, 0.24, d);
    vec3 dayColor = texture2D(uDay, vUv).rgb;
    vec3 color = dayColor * (uAmbient + uDaylight * pow(max(d, 0.0), 1.25));
    vec3 lights = pow(texture2D(uNight, vUv).rgb, vec3(1.4)) * vec3(1.0, 0.74, 0.42) * uCity;
    color = mix(lights + dayColor * 0.04, color, day);
    float water = smoothstep(0.35, 0.45, texture2D(uWater, vUv).r);
    vec3 H = normalize(vSun + V);
    color += vec3(0.9, 0.92, 0.95) * pow(max(dot(N, H), 0.0), 24.0) * water * uGlint * day;
    color += vec3(1.0, 0.45, 0.18) * exp(-pow(d * 7.0, 2.0)) * 0.05;
    float rim = pow(1.0 - max(dot(N, V), 0.0), 3.0);
    color += vec3(0.3, 0.6, 1.0) * rim * 0.22 * uHaze;
    color = mix(color, color / (1.0 + color), uSoftening);
    gl_FragColor = vec4(color * uFade, uFade);
  }
`;

const ATMOSPHERE_FRAGMENT = `
  uniform float uGlow;
  uniform float uFade;
  varying vec3 vNormal;
  varying vec3 vWorld;
  void main() {
    vec3 N = normalize(vNormal);
    vec3 V = normalize(cameraPosition - vWorld);
    float r = pow(1.0 - abs(dot(N, V)), 2.2);
    gl_FragColor = vec4(vec3(0.32, 0.62, 1.0) * r * 0.55 * uGlow * uFade, 1.0);
  }
`;

const RING_VERTEX = `
  attribute vec3 aColor;
  varying vec3 vColor;
  void main() {
    vColor = aColor;
    vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);
    gl_PointSize = 0.5 * (80.0 / -mvPosition.z);
    gl_Position = projectionMatrix * mvPosition;
  }
`;

const RING_FRAGMENT = `
  uniform float uFade;
  varying vec3 vColor;
  void main() {
    float dist = distance(gl_PointCoord, vec2(0.5));
    if (dist > 0.5) discard;
    float alpha = (1.0 - smoothstep(0.0, 0.5, dist)) * 0.85;
    gl_FragColor = vec4(vColor * alpha * uFade, 1.0);
  }
`;

const STAR_VERTEX = `
  attribute vec3 aColor;
  attribute float aPhase;
  attribute float aSpeed;
  uniform float uTime;
  uniform float uScale;
  uniform float uTwinkle;
  uniform float uFade;
  varying vec3 vColor;
  void main() {
    vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);
    gl_PointSize = 0.11 * uScale / -mvPosition.z;
    gl_Position = projectionMatrix * mvPosition;
    float twinkle = 1.0 - uTwinkle * (0.5 + 0.5 * sin(uTime * aSpeed + aPhase));
    vColor = aColor * 0.75 * twinkle * uFade;
  }
`;

const STAR_FRAGMENT = `
  varying vec3 vColor;
  void main() {
    gl_FragColor = vec4(vColor, 1.0);
  }
`;

interface InteractionState {
  hovered: boolean;
  dragging: boolean;
  pointerX: number;
  pointerY: number;
  baseRotationX: number;
  baseRotationY: number;
  velocityX: number;
  velocityY: number;
  startX: number;
  startY: number;
  lastX: number;
  lastY: number;
  moved: boolean;
}

interface SceneSettings {
  mode: DayNightMode;
  customHour: number;
  reducedMotion: boolean;
}

// The planet sits 2.4 units behind the focus plane, so it looks this much smaller on screen.
const DEPTH = -2.4;
const PERSPECTIVE = 10 / (10 - DEPTH);

/**
 * Where the planet sits, in scene units at the camera's focus distance. Wide screens use the
 * framing tuned in the previews. Tall screens are sized from the width, with the top of the
 * planet just under the headline so the title stays over dark space.
 */
function getEarthTransform(viewport: { width: number; height: number }) {
  const { width, height } = viewport;
  const aspect = width / height;
  if (aspect >= 1 / 1.08) {
    return { radius: height * 0.76, position: [width * 0.24, -height * 0.43, DEPTH] as [number, number, number] };
  }
  // On-screen targets, as shares of the hero's width and height.
  const radiusOfWidth = 1.2 - 0.5 * aspect;
  const top = 0.5 + 0.15 * aspect;
  const centreX = 0.7;
  const centreY = top + radiusOfWidth * aspect;
  return {
    radius: (radiusOfWidth * width) / PERSPECTIVE,
    position: [((centreX - 0.5) * width) / PERSPECTIVE, ((0.5 - centreY) * height) / PERSPECTIVE, DEPTH] as [number, number, number],
  };
}

/** 0 → 1 → 0 every BREATH_SECONDS, eased at both ends. */
function breath(seconds: number) {
  return 0.5 - 0.5 * Math.cos((seconds * 2 * Math.PI) / BREATH_SECONDS);
}

function useEarthTextures() {
  const textures = useLoader(TextureLoader, TEXTURES);
  const maxAnisotropy = useThree((state) => state.gl.capabilities.getMaxAnisotropy());
  useEffect(() => {
    // Colours are used as stored (no colour-space conversion), exactly like the previews.
    for (const texture of textures) {
      texture.anisotropy = Math.min(8, maxAnisotropy);
      texture.needsUpdate = true;
    }
  }, [textures, maxAnisotropy]);
  return textures;
}

function Stars({ uniforms }: { uniforms: Record<string, THREE.IUniform> }) {
  const attributes = useMemo(() => {
    const positions = new Float32Array(STAR_COUNT * 3);
    const colors = new Float32Array(STAR_COUNT * 3);
    const phases = new Float32Array(STAR_COUNT);
    const speeds = new Float32Array(STAR_COUNT);
    for (let i = 0; i < STAR_COUNT; i++) {
      positions[i * 3] = (Math.random() - 0.5) * 90;
      positions[i * 3 + 1] = (Math.random() - 0.5) * 55;
      positions[i * 3 + 2] = -20 - Math.random() * 40;
      const b = Math.pow(Math.random(), 2.2) * 0.85 + 0.15;
      const warm = Math.random() > 0.7;
      colors.set(warm ? [b, b * 0.9, b * 0.75] : [b * 0.9, b * 0.95, b], i * 3);
      phases[i] = Math.random() * Math.PI * 2;
      speeds[i] = 0.15 + Math.random() * 0.3;
    }
    return { positions, colors, phases, speeds };
  }, []);

  return (
    <points renderOrder={0}>
      <bufferGeometry>
        <bufferAttribute attach="attributes-position" count={STAR_COUNT} array={attributes.positions} itemSize={3} />
        <bufferAttribute attach="attributes-aColor" count={STAR_COUNT} array={attributes.colors} itemSize={3} />
        <bufferAttribute attach="attributes-aPhase" count={STAR_COUNT} array={attributes.phases} itemSize={1} />
        <bufferAttribute attach="attributes-aSpeed" count={STAR_COUNT} array={attributes.speeds} itemSize={1} />
      </bufferGeometry>
      <shaderMaterial uniforms={uniforms} vertexShader={STAR_VERTEX} fragmentShader={STAR_FRAGMENT} {...ADDITIVE} />
    </points>
  );
}

function EarthScene({
  interaction,
  settings,
  hourStore,
}: {
  interaction: MutableRefObject<InteractionState>;
  settings: MutableRefObject<SceneSettings>;
  hourStore: HourStore;
}) {
  const earthGroup = useRef<THREE.Group>(null!);
  const atmosphere = useRef<THREE.Mesh>(null!);
  const ringLift = useRef<THREE.Group>(null!);
  const ring = useRef<THREE.Points>(null!);
  const starField = useRef<THREE.Group>(null!);
  const elapsed = useRef(0);
  const lastPublished = useRef(-1);
  const clock = useRef({ shown: hourStore.get(), auto: hourStore.get() });

  const viewport = useThree((state) => state.viewport);
  const size = useThree((state) => state.size);
  const [dayTexture, nightTexture, waterTexture] = useEarthTextures();
  const { radius, position } = getEarthTransform(viewport);

  const sun = useMemo(() => new THREE.Vector3(1, 0, 0), []);
  const fade = useMemo(() => ({ value: 0 }), []);
  const earthUniforms = useMemo(
    () => ({
      uSun: { value: sun },
      uDay: { value: dayTexture },
      uNight: { value: nightTexture },
      uWater: { value: waterTexture },
      uDaylight: { value: LOOK.daylight },
      uAmbient: { value: LOOK.ambient },
      uSoftening: { value: LOOK.highlightSoftening },
      uGlint: { value: LOOK.oceanGlint },
      uHaze: { value: LOOK.surfaceHaze },
      uCity: { value: LOOK.cityLights },
      uFade: fade,
    }),
    [sun, dayTexture, nightTexture, waterTexture, fade],
  );
  const atmosphereUniforms = useMemo(() => ({ uSun: { value: sun }, uGlow: { value: LOOK.atmosphereGlow }, uFade: fade }), [sun, fade]);
  const ringUniforms = useMemo(() => ({ uFade: fade }), [fade]);
  const starUniforms = useMemo(
    () => ({ uTime: { value: 0 }, uScale: { value: 1 }, uTwinkle: { value: 0.18 }, uFade: fade }),
    [fade],
  );

  // Soft blue points orbiting the planet, as on the original site.
  const ringAttributes = useMemo(() => {
    const positions = new Float32Array(RING_COUNT * 3);
    const colors = new Float32Array(RING_COUNT * 3);
    for (let i = 0; i < RING_COUNT; i++) {
      const angle = Math.random() * Math.PI * 2;
      const r = 1.25 + Math.random() * 0.8;
      positions.set([Math.cos(angle) * r, (Math.random() - 0.5) * 0.4, Math.sin(angle) * r], i * 3);
      const t = Math.random();
      colors.set([0.3 + t * 0.7, 0.4 + (1 - t) * 0.4, 0.6 + t * 0.4], i * 3);
    }
    return { positions, colors };
  }, []);

  useFrame((_, rawDelta) => {
    // A long pause (tab hidden, scrolled away) must not make everything jump.
    const delta = Math.min(rawDelta, 0.05);
    const { mode, customHour, reducedMotion } = settings.current;
    elapsed.current += delta;
    const t = elapsed.current;

    // Soft entrance.
    const entrance = Math.min(1, t / ENTRANCE_SECONDS);
    fade.value = 1 - Math.pow(1 - entrance, 3);

    // Day and night.
    const now = new Date();
    const c = clock.current;
    if (mode === "auto") {
      c.auto = advanceAuto(c.auto, delta);
      c.shown = c.auto;
    } else {
      c.shown = easeHourTowards(c.shown, mode === "now" ? utcHours(now) : customHour, delta);
      c.auto = c.shown;
    }
    // The clock label only needs a few updates a second.
    if (t - lastPublished.current >= 0.1) {
      lastPublished.current = t;
      hourStore.set(c.shown);
    }
    const { lat, lon } = subsolarPoint(dayOfYear(now), c.shown);
    sun.set(...latLonToSphere(lat, lon));

    // Spin, drag and inertia.
    const controls = interaction.current;
    if (!controls.dragging) {
      if (!reducedMotion) controls.baseRotationY += (delta * 2 * Math.PI) / SPIN_SECONDS_PER_TURN;
      controls.baseRotationX = THREE.MathUtils.clamp(controls.baseRotationX + controls.velocityX * delta, -0.62, 0.62);
      controls.baseRotationY += controls.velocityY * delta;
      controls.velocityX = THREE.MathUtils.damp(controls.velocityX, 0, 5.2, delta);
      controls.velocityY = THREE.MathUtils.damp(controls.velocityY, 0, 5.2, delta);
    }
    const group = earthGroup.current;
    group.rotation.x = THREE.MathUtils.damp(group.rotation.x, THREE.MathUtils.clamp(controls.baseRotationX, -0.68, 0.68), 6.5, delta);
    group.rotation.y = THREE.MathUtils.damp(group.rotation.y, controls.baseRotationY, 6.5, delta);

    // One shared breath: the atmosphere swells and brightens, the ring rises a touch.
    const b = reducedMotion ? 0.5 : breath(t);
    atmosphere.current.scale.setScalar(1.12 * (1 + 0.025 * b));
    atmosphereUniforms.uGlow.value = LOOK.atmosphereGlow * (0.86 + 0.14 * b);
    ringLift.current.position.y = 0.03 * b;
    ringLift.current.scale.setScalar(1 + 0.008 * b);
    if (!reducedMotion) ring.current.rotation.y += delta * RING_SPIN;

    // Quiet stars.
    starUniforms.uTime.value = t;
    starUniforms.uTwinkle.value = reducedMotion ? 0 : 0.18;
    starUniforms.uScale.value = size.height * viewport.dpr * 0.5;
    if (!reducedMotion) starField.current.rotation.y = Math.sin(t / 60) * 0.03;
  });

  return (
    <>
      <group ref={starField}>
        <Stars uniforms={starUniforms} />
      </group>
      <group position={position} scale={radius}>
        <group ref={earthGroup} rotation={[0.08, -1.05, -0.16]}>
          <mesh renderOrder={1}>
            <sphereGeometry args={[1, 96, 96]} />
            <shaderMaterial uniforms={earthUniforms} vertexShader={SPHERE_VERTEX} fragmentShader={EARTH_FRAGMENT} />
          </mesh>
          <mesh ref={atmosphere} scale={1.12} renderOrder={2}>
            <sphereGeometry args={[1, 64, 64]} />
            <shaderMaterial
              uniforms={atmosphereUniforms}
              vertexShader={SPHERE_VERTEX}
              fragmentShader={ATMOSPHERE_FRAGMENT}
              side={THREE.BackSide}
              {...ADDITIVE}
            />
          </mesh>
        </group>

        <group ref={ringLift}>
          <points ref={ring} rotation={[0, 0, 0.3]} renderOrder={3}>
            <bufferGeometry>
              <bufferAttribute attach="attributes-position" count={RING_COUNT} array={ringAttributes.positions} itemSize={3} />
              <bufferAttribute attach="attributes-aColor" count={RING_COUNT} array={ringAttributes.colors} itemSize={3} />
            </bufferGeometry>
            <shaderMaterial uniforms={ringUniforms} vertexShader={RING_VERTEX} fragmentShader={RING_FRAGMENT} {...ADDITIVE} />
          </points>
        </group>
      </group>
    </>
  );
}

interface CinematicEarthProps {
  mode: DayNightMode;
  customHour: number;
  hourStore: HourStore;
  reducedMotion: boolean;
}

export default function CinematicEarth({ mode, customHour, hourStore, reducedMotion }: CinematicEarthProps) {
  const [dragging, setDragging] = useState(false);
  const [onScreen, setOnScreen] = useState(true);
  const container = useRef<HTMLDivElement>(null);
  const settings = useRef<SceneSettings>({ mode, customHour, reducedMotion });
  useEffect(() => {
    settings.current = { mode, customHour, reducedMotion };
  }, [mode, customHour, reducedMotion]);
  const interaction = useRef<InteractionState>({
    hovered: false, dragging: false,
    pointerX: 0, pointerY: 0,
    baseRotationX: 0.08, baseRotationY: -1.05,
    velocityX: 0, velocityY: 0,
    startX: 0, startY: 0, lastX: 0, lastY: 0, moved: false,
  });

  // Stop drawing while the hero is scrolled out of view.
  useEffect(() => {
    const element = container.current;
    if (!element || typeof IntersectionObserver === "undefined") return;
    const observer = new IntersectionObserver(([entry]) => setOnScreen(entry.isIntersecting), { threshold: 0 });
    observer.observe(element);
    return () => observer.disconnect();
  }, []);

  const coarsePointer = useMemo(() => typeof window !== "undefined" && window.matchMedia?.("(pointer: coarse)").matches, []);

  const updatePointer = useCallback((event: ReactPointerEvent<HTMLDivElement>) => {
    const bounds = event.currentTarget.getBoundingClientRect();
    interaction.current.pointerX = ((event.clientX - bounds.left) / bounds.width) * 2 - 1;
    interaction.current.pointerY = -(((event.clientY - bounds.top) / bounds.height) * 2 - 1);
  }, []);

  const handlePointerMove = useCallback((event: ReactPointerEvent<HTMLDivElement>) => {
    updatePointer(event);
    const c = interaction.current;
    if (!c.dragging) return;
    const dx = event.clientX - c.lastX, dy = event.clientY - c.lastY;
    c.moved ||= Math.hypot(event.clientX - c.startX, event.clientY - c.startY) > 4;
    c.baseRotationY += dx * 0.0065;
    c.baseRotationX = THREE.MathUtils.clamp(c.baseRotationX + dy * 0.0045, -0.62, 0.62);
    c.velocityY = dx * 0.16;
    c.velocityX = dy * 0.1;
    c.lastX = event.clientX;
    c.lastY = event.clientY;
  }, [updatePointer]);

  const handlePointerDown = useCallback((event: ReactPointerEvent<HTMLDivElement>) => {
    updatePointer(event);
    const c = interaction.current;
    event.currentTarget.setPointerCapture(event.pointerId);
    c.dragging = true; c.moved = false;
    c.startX = event.clientX; c.startY = event.clientY;
    c.lastX = event.clientX; c.lastY = event.clientY;
    c.velocityX = 0; c.velocityY = 0;
    setDragging(true);
  }, [updatePointer]);

  const finishPointer = useCallback((event: ReactPointerEvent<HTMLDivElement>, cancelled = false) => {
    const c = interaction.current;
    if (!cancelled && !c.moved) {
      c.baseRotationY += (c.pointerX < 0 ? -1 : 1) * (Math.PI / 2);
      c.baseRotationX = THREE.MathUtils.clamp(c.baseRotationX + c.pointerY * 0.055, -0.62, 0.62);
      c.velocityX = 0; c.velocityY = 0;
    }
    c.dragging = false;
    if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId);
    setDragging(false);
  }, []);

  const handleKeyDown = useCallback((event: KeyboardEvent<HTMLDivElement>) => {
    const c = interaction.current;
    if (event.key === "ArrowLeft") c.baseRotationY -= Math.PI / 4;
    if (event.key === "ArrowRight" || event.key === "Enter" || event.key === " ") c.baseRotationY += Math.PI / 4;
    if (event.key === "ArrowUp") c.baseRotationX = Math.max(-0.62, c.baseRotationX - 0.12);
    if (event.key === "ArrowDown") c.baseRotationX = Math.min(0.62, c.baseRotationX + 0.12);
    if (["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown", "Enter", " "].includes(event.key)) event.preventDefault();
  }, []);

  return (
    <div
      ref={container}
      className="h-full w-full touch-none select-none focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-primary/60"
      role="application"
      aria-label="Interactive Earth. Drag to explore."
      tabIndex={0}
      onKeyDown={handleKeyDown}
      onPointerEnter={(event) => { interaction.current.hovered = true; updatePointer(event); }}
      onPointerLeave={() => { interaction.current.hovered = false; interaction.current.pointerX = 0; interaction.current.pointerY = 0; }}
      onPointerMove={handlePointerMove}
      onPointerDown={handlePointerDown}
      onPointerUp={(event) => finishPointer(event)}
      onPointerCancel={(event) => finishPointer(event, true)}
      style={{ cursor: dragging ? "grabbing" : "grab" }}
    >
      <Canvas
        camera={{ position: [0, 0, 10], fov: 42, near: 0.1, far: 120 }}
        dpr={[1, coarsePointer ? 1.25 : 1.5]}
        frameloop={onScreen ? "always" : "never"}
        gl={{ alpha: true, antialias: true, powerPreference: "high-performance" }}
      >
        <Suspense fallback={null}>
          <EarthScene interaction={interaction} settings={settings} hourStore={hourStore} />
        </Suspense>
      </Canvas>
    </div>
  );
}
