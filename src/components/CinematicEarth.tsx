import {
  Suspense,
  useCallback,
  useMemo,
  useRef,
  useState,
  useEffect,
  type KeyboardEvent,
  type MutableRefObject,
  type PointerEvent as ReactPointerEvent,
} from "react";
import { Canvas, useFrame, useThree, useLoader } from "@react-three/fiber";
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
  {
    float sunHeight = dot(normal, uSunView);
    float night = 1.0 - smoothstep(-0.18, 0.24, sunHeight);
    vec3 cityLights = pow(texture2D(uNightMap, vMapUv).rgb, vec3(1.4)) * vec3(1.0, 0.52, 0.15) * uNightStrength;
    totalEmissiveRadiance += cityLights * night;
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

interface EarthSceneProps {
  interaction: MutableRefObject<InteractionState>;
  settings: MutableRefObject<SceneSettings>;
  hourStore: HourStore;
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

/** The original framing, with the planet's height halfway between the original and the lower one. */
function getEarthTransform(viewport: { width: number; height: number }) {
  const { isPortrait, radius, position } = getGithubTransform(viewport);
  const y = (position[1] + getLowerY(viewport, isPortrait)) / 2;
  return { radius, position: [position[0], y, position[2]] as [number, number, number] };
}

function EarthScene({ interaction, settings, hourStore }: EarthSceneProps) {
  const groupRef = useRef<THREE.Group>(null!);
  const earthRef = useRef<THREE.Mesh>(null!);
  const cloudRef = useRef<THREE.Mesh>(null!);
  const glowRef = useRef<THREE.Mesh>(null!);
  const ringLiftRef = useRef<THREE.Group>(null!);
  const pointsRef = useRef<THREE.Points>(null!);
  const sunLightRef = useRef<THREE.DirectionalLight>(null!);
  const { viewport, camera } = useThree();
  const timeRef = useRef(0);
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
      shader.fragmentShader = shader.fragmentShader
        .replace("#include <common>", "#include <common>\nuniform sampler2D uNightMap;\nuniform vec3 uSunView;\nuniform float uNightStrength;")
        .replace("#include <emissivemap_fragment>", NIGHT_LIGHTS_FRAGMENT);
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

  useFrame((_, rawDelta) => {
    // A long pause (tab hidden, scrolled away) must not make everything jump.
    const delta = Math.min(rawDelta, 0.05);
    const { mode, customHour, reducedMotion } = settings.current;
    const controls = interaction.current;
    if (!reducedMotion) timeRef.current += delta;

    if (!controls.dragging) {
      if (!reducedMotion) controls.baseRotationY += (delta * 2 * Math.PI) / SPIN_SECONDS_PER_TURN;
      controls.baseRotationX = THREE.MathUtils.clamp(
        controls.baseRotationX + controls.velocityX * delta, -0.62, 0.62
      );
      controls.baseRotationY += controls.velocityY * delta;
      controls.velocityX = THREE.MathUtils.damp(controls.velocityX, 0, 5.2, delta);
      controls.velocityY = THREE.MathUtils.damp(controls.velocityY, 0, 5.2, delta);
    }

    const targetX = THREE.MathUtils.clamp(controls.baseRotationX, -0.68, 0.68);
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
    earthRef.current.updateWorldMatrix(true, false);
    sun.world.copy(sun.local).transformDirection(earthRef.current.matrixWorld);
    sun.view.copy(sun.world).transformDirection(camera.matrixWorldInverse);
    sunLightRef.current.position.copy(sun.world).multiplyScalar(10);
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
        <Suspense fallback={<LoadingPlanet />}>
          <EarthScene interaction={interaction} settings={settings} hourStore={hourStore} />
        </Suspense>
      </Canvas>
    </div>
  );
}
