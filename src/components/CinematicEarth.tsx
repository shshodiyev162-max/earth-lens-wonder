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

/**
 * =========================
 *  HIGH-RES EARTH
 *  Perfect sphere
 *  Real satellite texture
 *  Blue particle ring
 *  Rim glow + halo
 *  Rotating + pulsing
 * =========================
 */

// Reliable high-res Earth texture (three.js examples CDN, 2048px)
const EARTH_TEXTURE =
  "https://threejs.org/examples/textures/planets/earth_atmos_2048.jpg";

const CLOUD_TEXTURE =
  "https://threejs.org/examples/textures/planets/earth_clouds_1024.png";

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

interface EarthSceneProps {
  interaction: MutableRefObject<InteractionState>;
}

function getEarthTransform(viewport: { width: number; height: number }) {
  const isPortrait = viewport.height > viewport.width * 1.08;
  const radius = isPortrait
    ? Math.max(viewport.height * 0.58, viewport.width * 0.96)
    : Math.max(viewport.height * 0.68, viewport.width * 0.4);
  const position: [number, number, number] = isPortrait
    ? [viewport.width * 0.1, -viewport.height * 0.23, -2.4]
    : [viewport.width * 0.16, -viewport.height * 0.19, -2.4];
  return { isPortrait, radius, position };
}

function EarthScene({ interaction }: EarthSceneProps) {
  const groupRef = useRef<THREE.Group>(null!);
  const cloudRef = useRef<THREE.Mesh>(null!);
  const glowRef = useRef<THREE.Mesh>(null!);
  const pointsRef = useRef<THREE.Points>(null!);
  const { viewport } = useThree();
  const timeRef = useRef(0);

  // Load textures
  const earthTexture = useLoader(TextureLoader, EARTH_TEXTURE);
  const cloudTexture = useLoader(TextureLoader, CLOUD_TEXTURE);

  // Configure for crisp rendering
  useEffect(() => {
    [earthTexture, cloudTexture].forEach((t) => {
      t.colorSpace = THREE.SRGBColorSpace;
      t.anisotropy = 16;
      t.minFilter = THREE.LinearMipmapLinearFilter;
      t.magFilter = THREE.LinearFilter;
      t.generateMipmaps = true;
    });
  }, [earthTexture, cloudTexture]);

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

  useFrame((_, delta) => {
    const controls = interaction.current;
    timeRef.current += delta;

    if (!controls.dragging) {
      controls.baseRotationY += delta * 0.15;
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

    if (cloudRef.current) cloudRef.current.rotation.y += delta * 0.006;

    if (glowRef.current) {
      const pulse = Math.sin(timeRef.current * 1.2) * 0.05 + 1;
      glowRef.current.scale.setScalar(pulse * 1.08);
    }

    if (pointsRef.current) pointsRef.current.rotation.y += delta * 0.15;
  });

  useFrame(() => {
    glowUniforms.time.value = timeRef.current;
  });

  return (
    <group position={position} scale={radius}>
      <group ref={groupRef} rotation={[0.08, -1.05, -0.16]}>
        {/* === PERFECT SPHERE EARTH === */}
        <mesh>
          <sphereGeometry args={[1, 84, 64]} />
          <meshPhongMaterial
            map={earthTexture}
            emissive="#0a1a3a"
            emissiveIntensity={0.08}
            shininess={20}
            specular="#335577"
          />
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
  );
}

function LoadingPlanet() {
  const { viewport } = useThree();
  return (
    <mesh position={[viewport.width * 0.14, -viewport.height * 0.2, -2.4]} scale={Math.max(viewport.height * 0.62, viewport.width * 0.38)}>
      <sphereGeometry args={[1, 48, 48]} />
      <meshBasicMaterial color="#2255aa" wireframe transparent opacity={0.3} />
    </mesh>
  );
}

function StarField() {
  const pointsRef = useRef<THREE.Points>(null!);
  const positions = useMemo(() => {
    const values = new Float32Array(2500 * 3);
    const colors = new Float32Array(2500 * 3);
    for (let i = 0; i < 2500; i++) {
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

  useFrame((_, delta) => { pointsRef.current.rotation.y += delta * 0.001; });

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

function Lighting() {
  return (
    <>
      <ambientLight intensity={0.18} color="#224466" />
      <directionalLight position={[6, 3, 8]} intensity={1.2} color="#fff5e8" />
      <directionalLight position={[-5, -1, 2]} intensity={0.15} color="#4488ff" />
    </>
  );
}

export default function CinematicEarth() {
  const [dragging, setDragging] = useState(false);
  const interaction = useRef<InteractionState>({
    hovered: false, dragging: false,
    pointerX: 0, pointerY: 0,
    baseRotationX: 0.08, baseRotationY: -1.05,
    velocityX: 0, velocityY: 0,
    startX: 0, startY: 0, lastX: 0, lastY: 0, moved: false,
  });

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
        gl={{
          alpha: true,
          antialias: true,
          powerPreference: "high-performance",
          toneMapping: THREE.ACESFilmicToneMapping,
          toneMappingExposure: 1.0,
        }}
      >
        <Lighting />
        <StarField />
        <Suspense fallback={<LoadingPlanet />}>
          <EarthScene interaction={interaction} />
        </Suspense>
      </Canvas>
    </div>
  );
}