import {
  Suspense,
  useCallback,
  useMemo,
  useRef,
  useState,
  useEffect,
  useLayoutEffect,
  type KeyboardEvent,
  type MutableRefObject,
  type PointerEvent as ReactPointerEvent,
} from "react";
import { Canvas, useFrame, useThree, useLoader } from "@react-three/fiber";
import * as THREE from "three";
import { TextureLoader } from "three";
import { Moon, Sun } from "lucide-react";
import {
  advanceAuto,
  dayOfYear,
  easeHourTowards,
  formatClock,
  latLonToSphere,
  subsolarPoint,
  utcHours,
  type DayNightMode,
  type HourStore,
} from "./landing/sun";
import { browserTimeZone, findHome, localOffsetHours, type Home } from "./landing/home";

/**
 * =========================
 *  HIGH-RES EARTH
 *  Perfect sphere
 *  Real satellite texture
 *  Blue particle ring
 *  Rim glow + halo
 *  Rotating + pulsing
 *  Real day and night
 * =========================
 */

// Earth and cloud textures are bundled with the app (public/textures) so the
// globe never depends on a third-party CDN being reachable. The night lights are
// NASA GIBS VIIRS Black Marble (npm run data:earth).
const EARTH_TEXTURE = `${import.meta.env.BASE_URL}textures/earth_atmos_2048.jpg`;
const CLOUD_TEXTURE = `${import.meta.env.BASE_URL}textures/earth_clouds_1024.png`;
const NIGHT_TEXTURE = `${import.meta.env.BASE_URL}textures/earth_night_2048.jpg`;

const SPIN_SECONDS_PER_TURN = 80;
const STAR_COUNT = 1000;
// Dim, warm city lights on the night side.
const NIGHT_LIGHTS = 0.45;
// A faint warm band where it is sunrise or sunset.
const TWILIGHT = 0.025;
// On arrival the planet turns this far (radians) to bring the visitor's part of the world into view.
const INTRO_TURN = 1.1;
const INTRO_SECONDS = 3.4;
// The planet holds still for a moment, then the spin eases back in.
const HOLD_SECONDS = 2.5;
const SPIN_RETURN_SECONDS = 3.6;
// How far the planet may tip (radians). It tips further towards the viewer so southern places can face them.
const TILT = { min: -0.85, max: 0.62 };
// How far the camera leans towards the mouse (scene units).
const PARALLAX = { x: 0.35, y: 0.2 };

// ── Particle ring shaders (soft blue points, just like the deployed site) ──
const PARTICLE_VERTEX = `
  attribute float aSize;
  attribute vec3 aColor;
  varying vec3 vColor;
  void main() {
    vColor = aColor;
    vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);
    gl_PointSize = aSize * (80.0 / -mvPosition.z);
    gl_Position = projectionMatrix * mvPosition;
  }
`;

const PARTICLE_FRAGMENT = `
  varying vec3 vColor;
  void main() {
    float dist = distance(gl_PointCoord, vec2(0.5));
    if (dist > 0.5) discard;
    float alpha = 1.0 - smoothstep(0.0, 0.5, dist);
    gl_FragColor = vec4(vColor, alpha * 0.85);
  }
`;

// ── Rim glow sphere shaders ──
const GLOW_VERTEX = `
  varying vec3 vNormal;
  varying vec3 vPosition;
  void main() {
    vNormal = normalize(normalMatrix * normal);
    vec4 worldPos = modelMatrix * vec4(position, 1.0);
    vPosition = worldPos.xyz;
    gl_Position = projectionMatrix * viewMatrix * worldPos;
  }
`;

const GLOW_FRAGMENT = `
  uniform vec3 glowColor;
  uniform float time;
  varying vec3 vNormal;
  varying vec3 vPosition;
  void main() {
    vec3 viewDir = normalize(cameraPosition - vPosition);
    float rim = 1.0 - max(0.0, dot(viewDir, vNormal));
    rim = pow(rim, 3.0);
    float pulse = sin(time * 1.5) * 0.3 + 0.7;
    float alpha = rim * (0.3 + 0.5 * pulse);
    gl_FragColor = vec4(glowColor * (1.0 + 0.5 * pulse), alpha * 0.28);
  }
`;

// Adds the city lights to the Phong earth wherever the sun is down.
const NIGHT_LIGHTS_FRAGMENT = `
  #include <emissivemap_fragment>
  float sunHeight = dot(normal, uSunView);
  {
    float night = 1.0 - smoothstep(-0.18, 0.24, sunHeight);
    vec3 cityLights = pow(texture2D(uNightMap, vMapUv).rgb, vec3(1.4)) * vec3(1.0, 0.52, 0.15) * uNightStrength;
    totalEmissiveRadiance += cityLights * night;
  }
`;

// A soft sunrise/sunset glow along the line between day and night.
const TWILIGHT_FRAGMENT = `
  outgoingLight += vec3(1.0, 0.55, 0.22) * exp(-pow(sunHeight * 8.0, 2.0)) * uTwilight;
  #include <opaque_fragment>
`;

// ── "You are here": a bright point with soft ripples, lying on the surface ──
const HOME_VERTEX = `
  varying vec2 vUv;
  void main() {
    vUv = uv;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;

const HOME_FRAGMENT = `
  uniform float uTime;
  uniform float uOpacity;
  varying vec2 vUv;
  void main() {
    float r = length(vUv * 2.0 - 1.0);
    float core = smoothstep(0.16, 0.0, r);
    float glow = smoothstep(0.5, 0.0, r) * 0.3;
    float ripples = 0.0;
    for (int i = 0; i < 2; i++) {
      float phase = fract(uTime / 3.2 + float(i) * 0.5);
      float ring = 0.14 + phase * 0.82;
      ripples += smoothstep(0.07, 0.0, abs(r - ring)) * (1.0 - phase) * 0.75;
    }
    float alpha = clamp(core + glow + ripples, 0.0, 1.0) * uOpacity;
    gl_FragColor = vec4(vec3(0.62, 0.92, 1.0), alpha);
  }
`;

// ── A rare, faint shooting star ──
const METEOR_FRAGMENT = `
  uniform float uAlpha;
  varying vec2 vUv;
  void main() {
    float along = pow(vUv.x, 2.6);
    float across = 1.0 - pow(abs(vUv.y * 2.0 - 1.0), 2.0);
    gl_FragColor = vec4(vec3(0.86, 0.93, 1.0), along * across * uAlpha);
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
  /** Mouse or trackpad (not touch): the scene may lean towards the pointer. */
  finePointer: boolean;
}

/** The small label that follows the visitor's place on the globe. */
interface HomeLabel {
  root: MutableRefObject<HTMLDivElement | null>;
  time: MutableRefObject<HTMLSpanElement | null>;
  sun: MutableRefObject<HTMLSpanElement | null>;
  moon: MutableRefObject<HTMLSpanElement | null>;
}

interface EarthSceneProps {
  interaction: MutableRefObject<InteractionState>;
  settings: MutableRefObject<SceneSettings>;
  hourStore: HourStore;
  home: Home | null;
  label: HomeLabel;
}

// The original site's framing.
function getGithubTransform(viewport: { width: number; height: number }) {
  const isPortrait = viewport.height > viewport.width * 1.08;
  const radius = isPortrait
    ? Math.max(viewport.height * 0.58, viewport.width * 0.96)
    : Math.max(viewport.height * 0.68, viewport.width * 0.4);
  const position: [number, number, number] = isPortrait
    ? [viewport.width * 0.1, -viewport.height * 0.23, -2.4]
    : [viewport.width * 0.16, -viewport.height * 0.19, -2.4];
  return { isPortrait, radius, position };
}

// The lower height tried in the previews (the planet sits 2.4 units behind the focus plane).
function getLowerY(viewport: { width: number; height: number }, isPortrait: boolean) {
  if (!isPortrait) return -viewport.height * 0.43;
  const aspect = viewport.width / viewport.height;
  const centreY = 0.5 + 0.15 * aspect + (1.2 - 0.5 * aspect) * aspect;
  return ((0.5 - centreY) * viewport.height) / (10 / 12.4);
}

/**
 * The earth's tilt (x) and spin (y) that bring `home` to the point of the planet seen at `ndc`
 * (screen position, -1…1). The original tilt is kept unless another one shows the place much
 * better (southern places need the planet tipped towards the viewer).
 */
function turnToFace(
  home: Home,
  camera: THREE.Camera,
  ndc: [number, number],
  centre: THREE.Vector3,
  radius: number,
  tilt: { x: number; z: number },
) {
  const raycaster = new THREE.Raycaster();
  raycaster.setFromCamera(new THREE.Vector2(...ndc), camera);
  const hit = new THREE.Vector3();
  const target = raycaster.ray.intersectSphere(new THREE.Sphere(centre, radius), hit)
    ? hit.sub(centre).normalize()
    : camera.position.clone().sub(centre).normalize();
  const place = new THREE.Vector3(...latLonToSphere(home.lat, home.lon));
  const euler = new THREE.Euler();
  const turned = new THREE.Vector3();
  const best = { x: tilt.x, y: 0, score: -Infinity };
  for (let x = TILT.min; x <= TILT.max; x += 0.02) {
    for (let i = 0; i < 360; i++) {
      const y = (i / 360) * Math.PI * 2;
      euler.set(x, y, tilt.z);
      const score = turned.copy(place).applyEuler(euler).dot(target) - 0.25 * Math.abs(x - tilt.x);
      if (score > best.score) Object.assign(best, { x, y, score });
    }
  }
  return { x: best.x, y: best.y };
}

/** The original framing, with the planet's height halfway between the original and the lower one. */
function getEarthTransform(viewport: { width: number; height: number }) {
  const { isPortrait, radius, position } = getGithubTransform(viewport);
  const y = (position[1] + getLowerY(viewport, isPortrait)) / 2;
  return { radius, position: [position[0], y, position[2]] as [number, number, number] };
}

function EarthScene({ interaction, settings, hourStore, home, label }: EarthSceneProps) {
  const groupRef = useRef<THREE.Group>(null!);
  const homeRef = useRef<THREE.Mesh>(null!);
  const earthRef = useRef<THREE.Mesh>(null!);
  const cloudRef = useRef<THREE.Mesh>(null!);
  const glowRef = useRef<THREE.Mesh>(null!);
  const ringLiftRef = useRef<THREE.Group>(null!);
  const pointsRef = useRef<THREE.Points>(null!);
  const sunLightRef = useRef<THREE.DirectionalLight>(null!);
  const { viewport, camera, size } = useThree();
  const timeRef = useRef(0);
  const sceneTime = useRef(0);
  const lastPublished = useRef(-1);
  const clock = useRef({ shown: hourStore.get(), auto: hourStore.get() });

  // Load textures
  const earthTexture = useLoader(TextureLoader, EARTH_TEXTURE);
  const cloudTexture = useLoader(TextureLoader, CLOUD_TEXTURE);
  const nightTexture = useLoader(TextureLoader, NIGHT_TEXTURE);

  // Configure for crisp rendering
  useMemo(() => {
    [earthTexture, cloudTexture, nightTexture].forEach((t) => {
      t.colorSpace = THREE.SRGBColorSpace;
      t.anisotropy = 16;
      t.minFilter = THREE.LinearMipmapLinearFilter;
      t.magFilter = THREE.LinearFilter;
      t.generateMipmaps = true;
    });
  }, [earthTexture, cloudTexture, nightTexture]);

  // Where the sun is: in the earth's own frame, in the world, and as the camera sees it.
  const sun = useMemo(
    () => ({ local: new THREE.Vector3(1, 0, 0), world: new THREE.Vector3(1, 0, 0), view: new THREE.Vector3(1, 0, 0) }),
    [],
  );

  // The original Phong earth, with city lights added on the night side.
  const earthMaterial = useMemo(() => {
    const material = new THREE.MeshPhongMaterial({
      map: earthTexture,
      emissive: new THREE.Color("#0a1a3a"),
      emissiveIntensity: 0.08,
      shininess: 20,
      specular: new THREE.Color("#335577"),
    });
    material.onBeforeCompile = (shader) => {
      shader.uniforms.uNightMap = { value: nightTexture };
      shader.uniforms.uSunView = { value: sun.view };
      shader.uniforms.uNightStrength = { value: NIGHT_LIGHTS };
      shader.uniforms.uTwilight = { value: TWILIGHT };
      shader.fragmentShader = shader.fragmentShader
        .replace(
          "#include <common>",
          "#include <common>\nuniform sampler2D uNightMap;\nuniform vec3 uSunView;\nuniform float uNightStrength;\nuniform float uTwilight;",
        )
        .replace("#include <emissivemap_fragment>", NIGHT_LIGHTS_FRAGMENT)
        .replace("#include <opaque_fragment>", TWILIGHT_FRAGMENT);
    };
    material.customProgramCacheKey = () => "terravision-earth-night-lights";
    return material;
  }, [earthTexture, nightTexture, sun]);

  useEffect(() => () => earthMaterial.dispose(), [earthMaterial]);

  // ── Particle ring: 4000 soft blue points orbiting the planet ──
  const [particlePositions, particleColors] = useMemo(() => {
    const COUNT = 4000;
    const positions = new Float32Array(COUNT * 3);
    const colors = new Float32Array(COUNT * 3);

    for (let i = 0; i < COUNT; i++) {
      const angle = Math.random() * Math.PI * 2;
      const radius = 1.25 + Math.random() * 0.8;
      const spread = (Math.random() - 0.5) * 0.4;

      positions[i * 3] = Math.cos(angle) * radius;
      positions[i * 3 + 1] = spread;
      positions[i * 3 + 2] = Math.sin(angle) * radius;

      const t = Math.random();
      colors[i * 3] = 0.3 + t * 0.7;
      colors[i * 3 + 1] = 0.4 + (1 - t) * 0.4;
      colors[i * 3 + 2] = 0.6 + t * 0.4;
    }

    return [
      new THREE.BufferAttribute(positions, 3),
      new THREE.BufferAttribute(colors, 3),
    ];
  }, []);

  const smallSizes = useMemo(
    () => new THREE.BufferAttribute(new Float32Array(4000).fill(0.5), 1),
    [],
  );

  const { radius, position } = getEarthTransform(viewport);

  const glowUniforms = useMemo(
    () => ({ glowColor: { value: new THREE.Color("#4488ff") }, time: { value: 0 } }),
    [],
  );

  // The visitor's place: where it sits on the sphere and how the marker lies flat on the surface.
  const homeSpot = useMemo(() => {
    if (!home) return null;
    const normal = new THREE.Vector3(...latLonToSphere(home.lat, home.lon));
    const quaternion = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 0, 1), normal);
    return { normal, position: normal.clone().multiplyScalar(1.008), quaternion };
  }, [home]);
  const homeUniforms = useMemo(() => ({ uTime: { value: 0 }, uOpacity: { value: 0 } }), []);
  const homeWorld = useMemo(
    () => ({ position: new THREE.Vector3(), normal: new THREE.Vector3(), toCamera: new THREE.Vector3(), screen: new THREE.Vector3() }),
    [],
  );
  const lastLabelTime = useRef("");
  const lastLabelDay = useRef<boolean | null>(null);

  // Arrival: the planet turns to bring the visitor's part of the world into view, then spins on.
  const intro = useRef({ active: false, previousOffset: 0, fromTilt: 0, toTilt: 0 });
  useLayoutEffect(() => {
    const controls = interaction.current;
    if (!home) return;
    const portrait = size.height > size.width * 1.08;
    // Aim at a clear part of the planet: upper right, or lower right for southern places.
    const ndc: [number, number] = portrait ? [0.55, -0.2] : home.lat < 0 ? [0.62, -0.1] : [0.5, 0.25];
    const centre = new THREE.Vector3(...position);
    const facing = turnToFace(home, camera, ndc, centre, radius, { x: controls.baseRotationX, z: -0.16 });
    let spin = facing.y;
    // Stay close to the original starting angle so the arrival turn is short and natural.
    while (spin - controls.baseRotationY > Math.PI) spin -= Math.PI * 2;
    while (spin - controls.baseRotationY < -Math.PI) spin += Math.PI * 2;
    const reduced = settings.current.reducedMotion;
    const start = reduced ? spin : spin - INTRO_TURN;
    const fromTilt = controls.baseRotationX;
    controls.baseRotationY = start;
    groupRef.current.rotation.y = start;
    if (reduced) {
      controls.baseRotationX = facing.x;
      groupRef.current.rotation.x = facing.x;
    }
    intro.current = { active: !reduced, previousOffset: -INTRO_TURN, fromTilt, toTilt: facing.x };
    // Only on arrival; resizing later must not swing the planet around.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [home]);

  useFrame((_, rawDelta) => {
    // A long pause (tab hidden, scrolled away) must not make everything jump.
    const delta = Math.min(rawDelta, 0.05);
    const { mode, customHour, reducedMotion, finePointer } = settings.current;
    const controls = interaction.current;
    if (!reducedMotion) timeRef.current += delta;
    sceneTime.current += delta;
    const t = sceneTime.current;

    // Arrival turn and tilt (ends early if the visitor grabs the planet).
    if (intro.current.active) {
      const arriving = intro.current;
      if (controls.dragging || t >= INTRO_SECONDS) {
        controls.baseRotationY -= arriving.previousOffset;
        if (!controls.dragging) controls.baseRotationX = arriving.toTilt;
        arriving.active = false;
      } else {
        const remaining = Math.pow(1 - t / INTRO_SECONDS, 3);
        const offset = -INTRO_TURN * remaining;
        controls.baseRotationY += offset - arriving.previousOffset;
        controls.baseRotationX = arriving.toTilt + (arriving.fromTilt - arriving.toTilt) * remaining;
        arriving.previousOffset = offset;
      }
    }
    // After facing the visitor the spin returns gently.
    const spinScale = !home
      ? 1
      : intro.current.active
        ? 0
        : THREE.MathUtils.smoothstep(t, INTRO_SECONDS + HOLD_SECONDS, INTRO_SECONDS + HOLD_SECONDS + SPIN_RETURN_SECONDS);

    if (!controls.dragging) {
      if (!reducedMotion) controls.baseRotationY += (spinScale * delta * 2 * Math.PI) / SPIN_SECONDS_PER_TURN;
      controls.baseRotationX = THREE.MathUtils.clamp(
        controls.baseRotationX + controls.velocityX * delta, TILT.min, TILT.max
      );
      controls.baseRotationY += controls.velocityY * delta;
      controls.velocityX = THREE.MathUtils.damp(controls.velocityX, 0, 5.2, delta);
      controls.velocityY = THREE.MathUtils.damp(controls.velocityY, 0, 5.2, delta);
    }

    const targetX = THREE.MathUtils.clamp(controls.baseRotationX, TILT.min - 0.06, TILT.max + 0.06);
    const targetY = controls.baseRotationY;

    groupRef.current.rotation.x = THREE.MathUtils.damp(groupRef.current.rotation.x, targetX, 6.5, delta);
    groupRef.current.rotation.y = THREE.MathUtils.damp(groupRef.current.rotation.y, targetY, 6.5, delta);

    if (cloudRef.current && !reducedMotion) cloudRef.current.rotation.y += delta * 0.006;

    // The atmosphere's breath; the particle ring rises a little with it.
    const breath = Math.sin(timeRef.current * 1.2);
    if (glowRef.current) glowRef.current.scale.setScalar((breath * 0.05 + 1) * 1.08);
    const lift = (breath + 1) / 2;
    ringLiftRef.current.position.y = 0.03 * lift;
    ringLiftRef.current.scale.setScalar(1 + 0.008 * lift);

    if (pointsRef.current && !reducedMotion) pointsRef.current.rotation.y += delta * 0.15;

    // Day and night: the sun sits over the place where it is noon at the time shown.
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
    if (now.getTime() - lastPublished.current >= 100) {
      lastPublished.current = now.getTime();
      hourStore.set(c.shown);
    }
    const { lat, lon } = subsolarPoint(dayOfYear(now), c.shown);
    sun.local.set(...latLonToSphere(lat, lon));

    // The camera leans gently towards the mouse: stars, planet and ring move at different depths.
    const lean = finePointer && !reducedMotion && controls.hovered;
    camera.position.x = THREE.MathUtils.damp(camera.position.x, lean ? controls.pointerX * PARALLAX.x : 0, 1.8, delta);
    camera.position.y = THREE.MathUtils.damp(camera.position.y, lean ? controls.pointerY * PARALLAX.y : 0, 1.8, delta);
    camera.lookAt(0, 0, 0);
    camera.updateMatrixWorld();

    earthRef.current.updateWorldMatrix(true, false);
    sun.world.copy(sun.local).transformDirection(earthRef.current.matrixWorld);
    sun.view.copy(sun.world).transformDirection(camera.matrixWorldInverse);
    sunLightRef.current.position.copy(sun.world).multiplyScalar(10);

    // "You are here": the marker fades in as the planet arrives, and fades on the far side.
    if (homeSpot && homeRef.current) {
      homeWorld.position.copy(homeSpot.position).applyMatrix4(earthRef.current.matrixWorld);
      homeWorld.normal.copy(homeSpot.normal).transformDirection(earthRef.current.matrixWorld);
      const facing = homeWorld.normal.dot(homeWorld.toCamera.copy(camera.position).sub(homeWorld.position).normalize());
      const arrival = THREE.MathUtils.smoothstep(t, INTRO_SECONDS * 0.45, INTRO_SECONDS);
      const visible = THREE.MathUtils.smoothstep(facing, 0.05, 0.3) * arrival;
      homeUniforms.uOpacity.value = visible;
      homeUniforms.uTime.value = reducedMotion ? 0.9 : t;

      const chip = label.root.current;
      if (chip) {
        // Upright screens have no clear spot for the label; the marker speaks for itself there.
        const upright = size.height > size.width * 1.08;
        const chipVisible = upright ? 0 : visible * THREE.MathUtils.smoothstep(t, INTRO_SECONDS * 0.8, INTRO_SECONDS + 0.8);
        homeWorld.screen.copy(homeWorld.position).project(camera);
        const x = ((homeWorld.screen.x + 1) / 2) * size.width;
        const y = ((1 - homeWorld.screen.y) / 2) * size.height;
        // Sits to the right of the marker, or to the left when it would run off the screen.
        const width = chip.offsetWidth;
        const left = x + 16 + width > size.width - 8 ? x - 16 - width : x + 16;
        chip.style.transform = `translate(${left.toFixed(1)}px, ${(y - 13).toFixed(1)}px)`;
        chip.style.opacity = chipVisible.toFixed(3);
        const clockText = formatClock(c.shown + localOffsetHours(now));
        if (clockText !== lastLabelTime.current && label.time.current) {
          label.time.current.textContent = clockText;
          lastLabelTime.current = clockText;
        }
        const day = homeSpot.normal.dot(sun.local) > 0;
        if (day !== lastLabelDay.current && label.sun.current && label.moon.current) {
          label.sun.current.style.display = day ? "inline-flex" : "none";
          label.moon.current.style.display = day ? "none" : "inline-flex";
          lastLabelDay.current = day;
        }
      }
    }
  });

  useFrame(() => {
    glowUniforms.time.value = timeRef.current;
  });

  return (
    <>
      {/* The sun: the original key light, placed where the real sun is. */}
      <directionalLight ref={sunLightRef} position={[6, 3, 8]} intensity={1.2} color="#fff5e8" />

      <group position={position} scale={radius}>
        <group ref={groupRef} rotation={[0.08, -1.05, -0.16]}>
          {/* === PERFECT SPHERE EARTH === */}
          <mesh ref={earthRef} material={earthMaterial}>
            <sphereGeometry args={[1, 84, 64]} />
          </mesh>

          {/* === CLOUDS === */}
          <mesh ref={cloudRef} scale={1.006}>
            <sphereGeometry args={[1, 48, 48]} />
            <meshPhongMaterial
              map={cloudTexture}
              transparent
              opacity={0.35}
              depthWrite={false}
              side={THREE.DoubleSide}
            />
          </mesh>

          {/* === PULSING RIM GLOW === */}
          <mesh ref={glowRef} scale={1.08}>
            <sphereGeometry args={[1, 48, 48]} />
            <shaderMaterial
              uniforms={glowUniforms}
              vertexShader={GLOW_VERTEX}
              fragmentShader={GLOW_FRAGMENT}
              transparent
              depthWrite={false}
              blending={THREE.AdditiveBlending}
              side={THREE.DoubleSide}
            />
          </mesh>

          {/* === FAINT HALO === */}
          <mesh scale={1.15}>
            <sphereGeometry args={[1, 32, 32]} />
            <meshBasicMaterial
              color="#2255cc"
              transparent
              opacity={0.06}
              side={THREE.BackSide}
              depthWrite={false}
            />
          </mesh>

          {/* === YOU ARE HERE === */}
          {homeSpot && (
            <mesh ref={homeRef} position={homeSpot.position} quaternion={homeSpot.quaternion} scale={0.1}>
              <planeGeometry args={[1, 1]} />
              <shaderMaterial
                uniforms={homeUniforms}
                vertexShader={HOME_VERTEX}
                fragmentShader={HOME_FRAGMENT}
                transparent
                depthWrite={false}
                blending={THREE.AdditiveBlending}
              />
            </mesh>
          )}

        </group>

        {/* === BLUE PARTICLE RING (4000 soft points) === */}
        <group ref={ringLiftRef}>
          <points ref={pointsRef} rotation={[0, 0, 0.3]}>
            <bufferGeometry>
              <bufferAttribute
                attach="attributes-position"
                count={particlePositions.count}
                array={particlePositions.array}
                itemSize={3}
              />
              <bufferAttribute
                attach="attributes-aColor"
                count={particleColors.count}
                array={particleColors.array}
                itemSize={3}
              />
              <bufferAttribute
                attach="attributes-aSize"
                count={smallSizes.count}
                array={smallSizes.array}
                itemSize={1}
              />
            </bufferGeometry>
            <shaderMaterial
              uniforms={{}}
              vertexShader={PARTICLE_VERTEX}
              fragmentShader={PARTICLE_FRAGMENT}
              transparent
              depthWrite={false}
              blending={THREE.AdditiveBlending}
            />
          </points>
        </group>
      </group>
    </>
  );
}

/** Every half a minute or so, a faint shooting star crosses the sky behind the planet. */
function ShootingStar({ settings }: { settings: MutableRefObject<SceneSettings> }) {
  const meshRef = useRef<THREE.Mesh>(null!);
  const uniforms = useMemo(() => ({ uAlpha: { value: 0 } }), []);
  const flight = useRef({ wait: 9 + Math.random() * 6, age: -1, from: new THREE.Vector3(), direction: new THREE.Vector3() });

  useFrame((_, rawDelta) => {
    const delta = Math.min(rawDelta, 0.05);
    const mesh = meshRef.current;
    const f = flight.current;
    if (settings.current.reducedMotion) {
      mesh.visible = false;
      return;
    }
    if (f.age < 0) {
      f.wait -= delta;
      if (f.wait > 0) return;
      // Start in the open sky on the left, away from the planet, and fall gently.
      const leftwards = Math.random() < 0.6;
      const angle = (leftwards ? Math.PI + 0.32 : -0.32) + (Math.random() - 0.5) * 0.3;
      f.from.set(leftwards ? -6 + Math.random() * 6 : -14 + Math.random() * 5, 3 + Math.random() * 4, -14);
      f.direction.set(Math.cos(angle), Math.sin(angle), 0);
      f.age = 0;
      f.wait = 22 + Math.random() * 30;
      mesh.rotation.z = angle;
    }
    f.age += delta;
    const p = f.age / 0.95;
    if (p >= 1) {
      f.age = -1;
      mesh.visible = false;
      return;
    }
    mesh.visible = true;
    mesh.position.copy(f.from).addScaledVector(f.direction, p * 7);
    uniforms.uAlpha.value = Math.sin(p * Math.PI) * 0.75;
  });

  return (
    <mesh ref={meshRef} visible={false}>
      <planeGeometry args={[1.8, 0.05]} />
      <shaderMaterial
        uniforms={uniforms}
        vertexShader={HOME_VERTEX}
        fragmentShader={METEOR_FRAGMENT}
        transparent
        depthWrite={false}
        blending={THREE.AdditiveBlending}
      />
    </mesh>
  );
}

function LoadingPlanet() {
  const { viewport } = useThree();
  const { radius, position } = getEarthTransform(viewport);
  return (
    <mesh position={position} scale={radius}>
      <sphereGeometry args={[1, 48, 48]} />
      <meshBasicMaterial color="#2255aa" wireframe transparent opacity={0.3} />
    </mesh>
  );
}

function StarField({ reducedMotion }: { reducedMotion: boolean }) {
  const pointsRef = useRef<THREE.Points>(null!);
  const positions = useMemo(() => {
    const values = new Float32Array(STAR_COUNT * 3);
    const colors = new Float32Array(STAR_COUNT * 3);
    for (let i = 0; i < STAR_COUNT; i++) {
      values[i * 3] = (Math.random() - 0.5) * 50;
      values[i * 3 + 1] = (Math.random() - 0.5) * 30;
      values[i * 3 + 2] = -3 - Math.random() * 18;
      const b = 0.4 + Math.random() * 0.6;
      if (Math.random() > 0.7) {
        colors[i * 3] = b; colors[i * 3 + 1] = b * 0.8; colors[i * 3 + 2] = b;
      } else {
        colors[i * 3] = b; colors[i * 3 + 1] = b * 0.9; colors[i * 3 + 2] = b * 0.7;
      }
    }
    return {
      positions: new THREE.BufferAttribute(values, 3),
      colors: new THREE.BufferAttribute(colors, 3),
    };
  }, []);

  useFrame((_, delta) => {
    if (!reducedMotion) pointsRef.current.rotation.y += Math.min(delta, 0.05) * 0.001;
  });

  return (
    <points ref={pointsRef}>
      <bufferGeometry>
        <bufferAttribute attach="attributes-position" count={positions.positions.count} array={positions.positions.array} itemSize={3} />
        <bufferAttribute attach="attributes-color" count={positions.colors.count} array={positions.colors.array} itemSize={3} />
      </bufferGeometry>
      <pointsMaterial size={0.035} vertexColors transparent opacity={0.8} sizeAttenuation depthWrite={false} />
    </points>
  );
}

// The original fill lights; the key light is the sun inside EarthScene.
function Lighting() {
  return (
    <>
      <ambientLight intensity={0.18} color="#224466" />
      <directionalLight position={[-5, -1, 2]} intensity={0.15} color="#4488ff" />
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
  const finePointer = useMemo(() => typeof window !== "undefined" && window.matchMedia?.("(pointer: fine)").matches === true, []);
  const settings = useRef<SceneSettings>({ mode, customHour, reducedMotion, finePointer });
  useEffect(() => {
    settings.current = { mode, customHour, reducedMotion, finePointer };
  }, [mode, customHour, reducedMotion, finePointer]);

  // The visitor's part of the world, from their time zone (nothing is asked or sent).
  const home = useMemo(() => findHome(browserTimeZone()), []);
  const labelRoot = useRef<HTMLDivElement | null>(null);
  const labelTime = useRef<HTMLSpanElement | null>(null);
  const labelSun = useRef<HTMLSpanElement | null>(null);
  const labelMoon = useRef<HTMLSpanElement | null>(null);
  const label = useMemo<HomeLabel>(() => ({ root: labelRoot, time: labelTime, sun: labelSun, moon: labelMoon }), []);
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
    c.baseRotationX = THREE.MathUtils.clamp(c.baseRotationX + dy * 0.0045, TILT.min, TILT.max);
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
      c.baseRotationX = THREE.MathUtils.clamp(c.baseRotationX + c.pointerY * 0.055, TILT.min, TILT.max);
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
    if (event.key === "ArrowUp") c.baseRotationX = Math.max(TILT.min, c.baseRotationX - 0.12);
    if (event.key === "ArrowDown") c.baseRotationX = Math.min(TILT.max, c.baseRotationX + 0.12);
    if (["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown", "Enter", " "].includes(event.key)) event.preventDefault();
  }, []);

  return (
    <div
      ref={container}
      className="relative h-full w-full touch-none select-none focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-primary/60"
      role="application"
      aria-label={`Interactive Earth. Drag to explore.${home ? ` Your time zone, ${home.city}, is marked.` : ""}`}
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
        camera={{ position: [0, 0, 10], fov: 42, near: 0.1, far: 80 }}
        dpr={[1, 1.75]}
        frameloop={onScreen ? "always" : "never"}
        gl={{
          alpha: true,
          antialias: true,
          powerPreference: "high-performance",
          toneMapping: THREE.ACESFilmicToneMapping,
          toneMappingExposure: 1.0,
        }}
      >
        <Lighting />
        <StarField reducedMotion={reducedMotion} />
        <ShootingStar settings={settings} />
        <Suspense fallback={<LoadingPlanet />}>
          <EarthScene interaction={interaction} settings={settings} hourStore={hourStore} home={home} label={label} />
        </Suspense>
      </Canvas>

      {home && (
        <div
          ref={labelRoot}
          aria-hidden="true"
          className="pointer-events-none absolute left-0 top-0 hidden items-center gap-1.5 whitespace-nowrap rounded-full border border-white/10 bg-black/45 px-2.5 py-1 text-[11px] font-medium text-white/90 opacity-0 shadow-lg backdrop-blur-md will-change-transform sm:flex"
        >
          <span ref={labelSun} className="hidden text-amber-300">
            <Sun className="h-3 w-3" />
          </span>
          <span ref={labelMoon} className="inline-flex text-sky-200">
            <Moon className="h-3 w-3" />
          </span>
          <span translate="no">{home.city}</span>
          <span ref={labelTime} className="tabular-nums text-white/60" />
        </div>
      )}
    </div>
  );
}
