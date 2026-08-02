import { Suspense, useEffect, useMemo, useRef, useState } from "react";
import { Canvas, useFrame, useThree } from "@react-three/fiber";
import * as THREE from "three";
import type { MapLayer } from "@/lib/map-layers";
import { COUNTRY_GEOJSON_URL, getSafeDate } from "@/lib/map-layers";

interface LayerGlobeProps {
  layer: MapLayer;
  date: string;
}

type GeoJsonGeometry = {
  type: "Polygon" | "MultiPolygon";
  coordinates: number[][][] | number[][][][];
};

type CountriesGeoJson = {
  features: Array<{ geometry?: GeoJsonGeometry }>;
};

function getGlobeTextureUrl(layer: MapLayer, date: string) {
  const base = "https://gibs.earthdata.nasa.gov/wms/epsg4326/best/wms.cgi";
  const params = new URLSearchParams({
    SERVICE: "WMS",
    REQUEST: "GetMap",
    VERSION: "1.3.0",
    LAYERS: layer.id === "blue-marble" ? "BlueMarble_ShadedRelief_Bathymetry" : layer.id,
    STYLES: "",
    FORMAT: "image/jpeg",
    TRANSPARENT: "FALSE",
    CRS: "EPSG:4326",
    BBOX: "-90,-180,90,180",
    WIDTH: "2048",
    HEIGHT: "1024",
  });

  if (layer.dateDependent) params.set("TIME", getSafeDate(layer, date));
  return `${base}?${params.toString()}`;
}

// Reliable fallback texture URL
const RELIABLE_EARTH_TEXTURE = "https://threejs.org/examples/textures/planets/earth_atmos_2048.jpg";

function latLngToVector3(lat: number, lng: number, radius = 2.178) {
  const phi = THREE.MathUtils.degToRad(90 - lat);
  const theta = THREE.MathUtils.degToRad(lng + 180);
  return new THREE.Vector3(
    -radius * Math.sin(phi) * Math.cos(theta),
    radius * Math.cos(phi),
    radius * Math.sin(phi) * Math.sin(theta),
  );
}

function Graticule() {
  const lines = useMemo(() => {
    const material = new THREE.LineBasicMaterial({
      color: "#7dd3fc",
      transparent: true,
      opacity: 0.2,
      depthWrite: false,
    });
    const result: THREE.Line[] = [];

    for (let lat = -60; lat <= 60; lat += 30) {
      const points = Array.from({ length: 121 }, (_, index) =>
        latLngToVector3(lat, -180 + index * 3, 2.172),
      );
      result.push(new THREE.Line(new THREE.BufferGeometry().setFromPoints(points), material));
    }

    for (let lng = -150; lng <= 180; lng += 30) {
      const points = Array.from({ length: 81 }, (_, index) =>
        latLngToVector3(-80 + index * 2, lng, 2.172),
      );
      result.push(new THREE.Line(new THREE.BufferGeometry().setFromPoints(points), material));
    }

    return result;
  }, []);

  return <group>{lines.map((line, index) => <primitive key={index} object={line} />)}</group>;
}

function CountryBorders() {
  const [countries, setCountries] = useState<CountriesGeoJson | null>(null);

  useEffect(() => {
    const controller = new AbortController();
    fetch(COUNTRY_GEOJSON_URL, { signal: controller.signal })
      .then((response) => (response.ok ? response.json() : Promise.reject(new Error("Borders unavailable"))))
      .then((data) => setCountries(data as CountriesGeoJson))
      .catch((error) => {
        if ((error as DOMException).name !== "AbortError") setCountries(null);
      });
    return () => controller.abort();
  }, []);

  const lines = useMemo(() => {
    if (!countries) return [];
    const material = new THREE.LineBasicMaterial({
      color: "#f8fafc",
      transparent: true,
      opacity: 0.84,
      depthWrite: false,
    });
    const result: THREE.Line[] = [];

    const addRing = (ring: number[][]) => {
      const points = ring
        .filter((coordinate) => coordinate.length >= 2)
        .map(([lng, lat]) => latLngToVector3(lat, lng));
      if (points.length >= 2) {
        result.push(new THREE.Line(new THREE.BufferGeometry().setFromPoints(points), material));
      }
    };

    countries.features.forEach((feature) => {
      if (!feature.geometry) return;
      if (feature.geometry.type === "Polygon") {
        (feature.geometry.coordinates as number[][][]).forEach(addRing);
      } else {
        (feature.geometry.coordinates as number[][][][]).forEach((polygon) => polygon.forEach(addRing));
      }
    });

    return result;
  }, [countries]);

  return <group>{lines.map((line, index) => <primitive key={index} object={line} />)}</group>;
}

// Simple glowing background star field (drei-free)
function StarField() {
  const pointsRef = useRef<THREE.Points>(null!);
  const positions = useMemo(() => {
    const count = 1800;
    const values = new Float32Array(count * 3);
    const colors = new Float32Array(count * 3);
    for (let i = 0; i < count; i++) {
      // Shell distribution around origin
      const theta = Math.random() * Math.PI * 2;
      const phi = Math.acos(2 * Math.random() - 1);
      const r = 30 + Math.random() * 25;
      values[i * 3] = r * Math.sin(phi) * Math.cos(theta);
      values[i * 3 + 1] = r * Math.sin(phi) * Math.sin(theta);
      values[i * 3 + 2] = r * Math.cos(phi);
      const b = 0.5 + Math.random() * 0.5;
      const tint = Math.random();
      if (tint > 0.8) {
        colors[i * 3] = b; colors[i * 3 + 1] = b * 0.75; colors[i * 3 + 2] = b * 0.65;
      } else if (tint > 0.6) {
        colors[i * 3] = b * 0.7; colors[i * 3 + 1] = b * 0.85; colors[i * 3 + 2] = b;
      } else {
        colors[i * 3] = b; colors[i * 3 + 1] = b; colors[i * 3 + 2] = b;
      }
    }
    return {
      positions: new THREE.BufferAttribute(values, 3),
      colors: new THREE.BufferAttribute(colors, 3),
    };
  }, []);

  useFrame((_, delta) => { pointsRef.current.rotation.y += delta * 0.002; });

  return (
    <points ref={pointsRef}>
      <bufferGeometry>
        <bufferAttribute attach="attributes-position" count={positions.positions.count} array={positions.positions.array} itemSize={3} />
        <bufferAttribute attach="attributes-color" count={positions.colors.count} array={positions.colors.array} itemSize={3} />
      </bufferGeometry>
      <pointsMaterial size={0.22} vertexColors transparent opacity={0.85} sizeAttenuation depthWrite={false} />
    </points>
  );
}

// Manual orbit controls (drei-free) - drag to rotate, wheel to zoom
function OrbitControls() {
  const { camera, gl } = useThree();
  const sphere = useMemo(() => new THREE.Spherical(6.5, Math.PI / 2.15, 0.4), []);

  const stateRef = useRef({
    dragging: false,
    lastX: 0,
    lastY: 0,
    velocityX: 0,
    velocityY: 0,
  });

  useEffect(() => {
    const canvas = gl.domElement;
    canvas.style.cursor = "grab";
    canvas.style.touchAction = "none";

    const pointerDown = (e: PointerEvent) => {
      stateRef.current.dragging = true;
      stateRef.current.lastX = e.clientX;
      stateRef.current.lastY = e.clientY;
      stateRef.current.velocityX = 0;
      stateRef.current.velocityY = 0;
      canvas.setPointerCapture(e.pointerId);
      canvas.style.cursor = "grabbing";
    };

    const pointerMove = (e: PointerEvent) => {
      const s = stateRef.current;
      if (!s.dragging) return;
      const dx = e.clientX - s.lastX;
      const dy = e.clientY - s.lastY;
      s.lastX = e.clientX;
      s.lastY = e.clientY;
      sphere.theta -= dx * 0.005;
      sphere.phi = THREE.MathUtils.clamp(sphere.phi - dy * 0.005, 0.15, Math.PI - 0.15);
      s.velocityX = dx * 0.3;
      s.velocityY = dy * 0.3;
    };

    const pointerUp = (e: PointerEvent) => {
      stateRef.current.dragging = false;
      if (canvas.hasPointerCapture(e.pointerId)) canvas.releasePointerCapture(e.pointerId);
      canvas.style.cursor = "grab";
    };

    const wheel = (e: WheelEvent) => {
      e.preventDefault();
      sphere.radius = THREE.MathUtils.clamp(sphere.radius * (1 + e.deltaY * 0.0012), 2.55, 9);
    };

    canvas.addEventListener("pointerdown", pointerDown);
    canvas.addEventListener("pointermove", pointerMove);
    canvas.addEventListener("pointerup", pointerUp);
    canvas.addEventListener("pointercancel", pointerUp);
    canvas.addEventListener("wheel", wheel, { passive: false });
    return () => {
      canvas.removeEventListener("pointerdown", pointerDown);
      canvas.removeEventListener("pointermove", pointerMove);
      canvas.removeEventListener("pointerup", pointerUp);
      canvas.removeEventListener("pointercancel", pointerUp);
      canvas.removeEventListener("wheel", wheel);
    };
  }, [gl, sphere]);

  useFrame(() => {
    const s = stateRef.current;
    if (!s.dragging) {
      sphere.theta += s.velocityX * 0.01;
      sphere.phi = THREE.MathUtils.clamp(sphere.phi - s.velocityY * 0.01, 0.15, Math.PI - 0.15);
      s.velocityX = THREE.MathUtils.damp(s.velocityX, 0, 4, 0.016);
      s.velocityY = THREE.MathUtils.damp(s.velocityY, 0, 4, 0.016);
    }

    // Wait - the globe itself already auto-rotates. Keep the camera fixed relative to it.
    // The rotation is handled on the GlobeMesh so only position the camera on the sphere.
    camera.position.setFromSpherical(sphere);
    camera.lookAt(0, 0, 0);
  });

  return null;
}

function GlobeMesh({ layer, date }: LayerGlobeProps) {
  const group = useRef<THREE.Group>(null!);
  const [texture, setTexture] = useState<THREE.Texture | null>(null);
  const textureUrl = useMemo(() => getGlobeTextureUrl(layer, date), [layer, date]);
  const [reliableTexture, setReliableTexture] = useState<THREE.Texture | null>(null);

  // Load reliable fallback texture
  useEffect(() => {
    let active = true;
    const loader = new THREE.TextureLoader();
    loader.setCrossOrigin("anonymous");
    loader.load(
      RELIABLE_EARTH_TEXTURE,
      (next) => {
        if (!active) { next.dispose(); return; }
        next.colorSpace = THREE.SRGBColorSpace;
        next.anisotropy = 8;
        setReliableTexture(next);
      },
      undefined,
      () => { if (active) setReliableTexture(null); },
    );
    return () => { active = false; };
  }, []);

  // Load WMS texture
  useEffect(() => {
    let active = true;
    const loader = new THREE.TextureLoader();
    loader.setCrossOrigin("anonymous");
    loader.load(
      textureUrl,
      (next) => {
        if (!active) {
          next.dispose();
          return;
        }
        next.colorSpace = THREE.SRGBColorSpace;
        next.anisotropy = 8;
        setTexture((previous) => {
          if (previous && previous !== next) previous.dispose();
          return next;
        });
      },
      undefined,
      () => {
        if (active) setTexture(null);
      },
    );
    return () => {
      active = false;
    };
  }, [textureUrl]);

  useFrame((_, delta) => {
    if (group.current) group.current.rotation.y += delta * 0.012;
  });

  // Use WMS texture if loaded, otherwise fall back to reliable earth texture
  const activeTexture = texture || reliableTexture;

  return (
    <group ref={group} rotation={[0.06, -0.45, -0.14]}>
      <mesh>
        <sphereGeometry args={[2.15, 128, 128]} />
        <meshPhongMaterial
          map={activeTexture ?? undefined}
          color={activeTexture ? "white" : "#075985"}
          shininess={18}
        />
      </mesh>
      <Graticule />
      <CountryBorders />
      <mesh scale={1.035}>
        <sphereGeometry args={[2.15, 96, 96]} />
        <meshBasicMaterial color="#4fd1ff" transparent opacity={0.1} side={THREE.BackSide} />
      </mesh>
    </group>
  );
}

export default function LayerGlobe(props: LayerGlobeProps) {
  return (
    <div className="h-full w-full bg-[radial-gradient(circle_at_center,#0c3150_0%,#061421_42%,#02070d_100%)]">
      <div className="relative h-full w-full">
        <Canvas
          camera={{ position: [0, 0, 6.5], fov: 43 }}
          dpr={[1, 1.6]}
          gl={{ antialias: true, alpha: true }}
          style={{ background: "transparent" }}
        >
          <ambientLight intensity={0.32} color="#bde7ff" />
          <directionalLight position={[5, 3, 6]} intensity={2.2} color="#fff5dc" />
          <directionalLight position={[-5, -1, 2]} intensity={0.28} color="#168fd1" />
          <StarField />
          <Suspense fallback={null}>
            <GlobeMesh {...props} />
          </Suspense>
          <OrbitControls />
        </Canvas>
        <div className="pointer-events-none absolute bottom-4 left-4 rounded-2xl border border-white/15 bg-slate-950/65 px-3 py-2 text-[11px] font-medium text-white/75 shadow-xl backdrop-blur-md">
          Drag to rotate <span className="mx-1 text-white/35">•</span> Scroll or pinch to zoom
        </div>
      </div>
    </div>
  );
}