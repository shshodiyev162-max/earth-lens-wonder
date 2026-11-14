import { Suspense, useCallback, useEffect, useMemo, useRef, useState, type KeyboardEvent, type MutableRefObject, type PointerEvent as ReactPointerEvent, type RefObject } from "react";
import { Canvas, useFrame, useLoader, useThree } from "@react-three/fiber";
import * as THREE from "three";
import { TextureLoader } from "three";
import { browserTimeZone, findHome, formatLocalClock, latLonToSphere, type Home } from "./landing/home";
import { cloudImagePath, dayImagePath, DETAIL_IMAGE, FIRST_IMAGE, pictureBox, sharpCloudImageSize, sharpDayImageSize, wantsDetailImage } from "./landing/earthTextures";
import { AIR_FRAGMENT, AIR_VERTEX, CLOUD_FRAGMENT, PLANET_FRAGMENT, PLANET_VERTEX, STAR_FRAGMENT, STAR_VERTEX } from "./landing/planetShaders";
import { CAMERA_DISTANCE, EDGE_ON_MIDDLE_PLANE, flickSpeed, HORIZON_HEIGHT, lensFor, onScreen, orientationFacing, turnGlobe, type DragSample } from "./landing/globeDrag";
import { fitRadius, poseAt, stopAt, type DataId } from "./landing/story";
import { DATA_MAPS, MARKERS } from "./landing/findings";

// The planet's images are bundled with the app (public/textures) so the globe never depends on a
// third-party CDN being reachable. The surface is NASA's Blue Marble from NASA GIBS
// (npm run data:earth); the clouds are NASA's Blue Marble cloud map.
const EARTH_TEXTURE = `${import.meta.env.BASE_URL}${dayImagePath(FIRST_IMAGE)}`;
const CLOUD_TEXTURE = `${import.meta.env.BASE_URL}${cloudImagePath(FIRST_IMAGE)}`;

/** Towards the sun: up and to the left of the camera, so the planet has shape but no night side. */
const SUN = new THREE.Vector3(-0.46, 0.44, 0.77).normalize();
/** Degrees of longitude a second: slow enough to feel enormous. */
const SPIN_SPEED = 2.2;
const CLOUD_DRIFT = 0.00035;
/** The planet's lean, once it is spinning freely. */
const ROLL = -0.2;
const ARRIVAL_SECONDS = 4.2;
/** The arrival turn, in degrees. */
const ARRIVAL_TURN = 62;
const SPIN_RETURN_SECONDS = 4;
/** After the visitor lets go, the planet rests for a moment before it starts spinning on its own again. */
const REST_SECONDS = 2;
const STAR_COUNT = 4200;
/** How high the clouds float above the ground, in planet radii. Exaggerated: their shift against the ground as it turns helps it read as a solid ball. */
const CLOUD_HEIGHT = 1.01;

interface Controls {
  dragging: boolean;
  /** The place at the middle of the free-spinning planet; the visitor's hand and the spin both act on this. */
  lat: number;
  lon: number;
  /** How fast it is still turning after a flick or an arrow key, in radians a second. */
  velocityX: number;
  velocityY: number;
  /** Where the pointer was last, on screen. */
  lastX: number;
  lastY: number;
  /** The last moments of the drag, to work out a flick. */
  samples: DragSample[];
  /** When the visitor last let go of the planet (seconds, from performance.now). */
  releasedAt: number;
  /** Set while the planet is on the story, when it can't be dragged. */
  free: number;
  /** The planet on screen, kept up to date for the pointer: its size, its scale and its middle within the canvas. */
  radius: number;
  pixelsPerRadian: number;
  centreX: number;
  centreY: number;
}

function prepareTexture(texture: THREE.Texture, colorSpace: THREE.ColorSpace) {
  texture.colorSpace = colorSpace;
  texture.anisotropy = 16;
  texture.minFilter = THREE.LinearMipmapLinearFilter;
  texture.magFilter = THREE.LinearFilter;
  texture.generateMipmaps = true;
  texture.wrapS = THREE.RepeatWrapping;
  texture.needsUpdate = true;
}

/** Loads a sharper image in the background and hands it over once ready. If that fails, the first stays. */
function loadSharper(path: string, colorSpace: THREE.ColorSpace, use: (texture: THREE.Texture) => void) {
  let active = true;
  let loaded: THREE.Texture | null = null;
  new TextureLoader().load(`${import.meta.env.BASE_URL}${path}`, (texture) => {
    if (!active) return;
    prepareTexture(texture, colorSpace);
    loaded = texture;
    use(texture);
  });
  return () => {
    active = false;
    loaded?.dispose();
  };
}

interface SceneProps {
  controls: MutableRefObject<Controls>;
  reducedMotion: boolean;
  home: Home | null;
  /** The page's stops, measured from its layout. */
  centres: MutableRefObject<number[]>;
  homeLabel: RefObject<HTMLDivElement>;
  homeTime: RefObject<HTMLSpanElement>;
  markers: RefObject<HTMLDivElement>;
  /** Darkens the side of the screen with the story's words, only while they are there. */
  storyShade: RefObject<HTMLDivElement>;
  /** Reports whether the visitor can drag the planet right now. */
  onFreeChange: (free: boolean) => void;
}

function PlanetScene({ controls, reducedMotion, home, centres, homeLabel, homeTime, markers, storyShade, onFreeChange }: SceneProps) {
  const { size, gl, setDpr, camera } = useThree();
  const planetRef = useRef<THREE.Group>(null!);

  const dayTexture = useLoader(TextureLoader, EARTH_TEXTURE);
  const cloudTexture = useLoader(TextureLoader, CLOUD_TEXTURE);

  useMemo(() => {
    prepareTexture(dayTexture, THREE.SRGBColorSpace);
    prepareTexture(cloudTexture, THREE.NoColorSpace);
  }, [dayTexture, cloudTexture]);

  const blank = useMemo(() => {
    const texture = new THREE.DataTexture(new Uint8Array([127, 0, 0, 255]), 1, 1);
    texture.needsUpdate = true;
    return texture;
  }, []);

  const planetUniforms = useMemo(
    () => ({
      uDay: { value: dayTexture as THREE.Texture },
      uDetail: { value: blank as THREE.Texture },
      uDetailBox: { value: new THREE.Vector4(...pictureBox(DETAIL_IMAGE.bbox)) },
      uDetailAmount: { value: 0 },
      uClouds: { value: cloudTexture as THREE.Texture },
      uData: { value: blank as THREE.Texture },
      uSun: { value: SUN.clone() },
      uSunLocal: { value: SUN.clone() },
      uExposure: { value: reducedMotion ? 1 : 0 },
      uCloudAmount: { value: 1 },
      uCloudSpin: { value: 0 },
      uDataBox: { value: new THREE.Vector4(0, 0, 1, 1) },
      uDataAmount: { value: 0 },
      uDataRise: { value: new THREE.Color("#ffffff") },
      uDataFall: { value: new THREE.Color("#ffffff") },
      uHome: { value: new THREE.Vector3(0, 1, 0) },
      uHomeAmount: { value: 0 },
      uMarkerSize: { value: 0.05 },
      uTime: { value: 0 },
    }),
    [dayTexture, cloudTexture, blank, reducedMotion],
  );
  const airUniforms = useMemo(() => ({ uSun: { value: SUN.clone() }, uBreath: { value: 0 }, uExposure: { value: reducedMotion ? 1 : 0 } }), [reducedMotion]);
  const starUniforms = useMemo(
    () => ({ uPixelRatio: { value: 1 }, uTime: { value: 0 }, uExposure: { value: reducedMotion ? 1 : 0 }, uScale: { value: new THREE.Vector2(1, 1) }, uShift: { value: new THREE.Vector2(0, 0) } }),
    [reducedMotion],
  );

  // The first images are small so the planet appears quickly; sharper ones replace them once loaded.
  useEffect(() => {
    const connection = (navigator as Navigator & { connection?: { saveData?: boolean } }).connection;
    const device = {
      screenWidth: window.innerWidth,
      touch: window.matchMedia?.("(pointer: coarse)").matches === true,
      maxTextureSize: gl.capabilities.maxTextureSize,
      saveData: connection?.saveData === true,
    };
    const daySize = sharpDayImageSize(device);
    const cloudSize = sharpCloudImageSize(device);
    const stopDay =
      daySize === FIRST_IMAGE
        ? undefined
        : loadSharper(dayImagePath(daySize), THREE.SRGBColorSpace, (texture) => {
            planetUniforms.uDay.value = texture;
          });
    const stopClouds =
      cloudSize === FIRST_IMAGE
        ? undefined
        : loadSharper(cloudImagePath(cloudSize), THREE.NoColorSpace, (texture) => {
            planetUniforms.uClouds.value = texture;
          });
    return () => {
      stopDay?.();
      stopClouds?.();
    };
  }, [gl, planetUniforms]);

  // The sharper picture of Central Asia, fetched once the story heads that way, then faded in.
  const detail = useRef({ requested: false, texture: null as THREE.Texture | null, stop: undefined as (() => void) | undefined });
  const saveData = useMemo(() => (navigator as Navigator & { connection?: { saveData?: boolean } }).connection?.saveData === true, []);
  useEffect(() => () => detail.current.stop?.(), []);

  // The measured maps: each pixel holds the rate, whether it is significant, and whether it was measured.
  const dataTextures = useRef<Partial<Record<DataId, THREE.Texture>>>({});
  useEffect(() => {
    const loader = new TextureLoader();
    const loaded = dataTextures.current;
    (Object.keys(DATA_MAPS) as DataId[]).forEach((id) => {
      loader.load(`${import.meta.env.BASE_URL}data/findings/${DATA_MAPS[id].file}`, (texture) => {
        texture.colorSpace = THREE.NoColorSpace;
        // Smaller copies for when the map is seen from further away (the fine Uzbekistan map at the
        // country's stop), so it doesn't shimmer as the planet moves.
        texture.generateMipmaps = true;
        texture.minFilter = THREE.LinearMipmapLinearFilter;
        texture.magFilter = THREE.LinearFilter;
        texture.wrapS = THREE.ClampToEdgeWrapping;
        texture.wrapT = THREE.ClampToEdgeWrapping;
        loaded[id] = texture;
      });
    });
    return () => {
      (Object.keys(loaded) as DataId[]).forEach((id) => loaded[id]?.dispose());
    };
  }, []);

  // A few bright stars among many faint ones, thickest along a band like the Milky Way.
  const stars = useMemo(() => {
    const positions = new Float32Array(STAR_COUNT * 3);
    const colours = new Float32Array(STAR_COUNT * 3);
    const sizes = new Float32Array(STAR_COUNT);
    const phases = new Float32Array(STAR_COUNT);
    const gaussian = () => (Math.random() + Math.random() + Math.random() - 1.5) / 1.5;
    const tints = [
      [1, 0.86, 0.72],
      [1, 0.95, 0.88],
      [1, 1, 1],
      [0.84, 0.91, 1],
      [0.72, 0.83, 1],
    ];
    for (let i = 0; i < STAR_COUNT; i++) {
      let x = Math.random() * 2 - 1;
      let y = Math.random() * 2 - 1;
      if (i % 5 < 3) {
        const along = Math.random() * 2.4 - 1.2;
        const across = gaussian() * 0.34;
        x = along * 0.87 + across * 0.5;
        y = along * 0.5 - across * 0.87 - 0.05;
      }
      positions[i * 3] = x;
      positions[i * 3 + 1] = y;
      const magnitude = Math.pow(Math.random(), 9);
      const brightness = 0.1 + magnitude * 1.3 + Math.random() * 0.22;
      const tint = tints[Math.floor(Math.random() * tints.length)];
      colours[i * 3] = tint[0] * brightness;
      colours[i * 3 + 1] = tint[1] * brightness;
      colours[i * 3 + 2] = tint[2] * brightness;
      sizes[i] = 1.25 + magnitude * 2.1 + Math.random() * 0.75;
      phases[i] = Math.random() * Math.PI * 2;
    }
    return { positions, colours, sizes, phases };
  }, []);

  const scratch = useMemo(
    () => ({ quaternion: new THREE.Quaternion(), inverse: new THREE.Quaternion(), vector: new THREE.Vector3() }),
    [],
  );
  const state = useRef({ place: 0, time: 0, age: 0, free: true, cloudSpin: 0.1, shownData: null as DataId | null, lastClock: "", slowFrames: 0, placed: false, offsetX: 0, offsetY: 0 });

  // Arrival: the planet turns to bring the visitor's part of the world into view.
  const arrival = useRef({ lat: 14, lon: 24, active: false });
  useEffect(() => {
    const c = controls.current;
    const lat = home ? THREE.MathUtils.clamp(home.lat * 0.62, -32, 32) : 14;
    const lon = home ? home.lon : 24;
    if (home) planetUniforms.uHome.value.set(...latLonToSphere(home.lat, home.lon));
    arrival.current = { lat, lon, active: !reducedMotion };
    c.lat = lat;
    c.lon = reducedMotion ? lon : lon + ARRIVAL_TURN;
    // Only on arrival; resizing later must not swing the planet around.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [home]);

  useFrame((_, rawDelta) => {
    const delta = Math.min(rawDelta, 0.05);
    const s = state.current;
    const c = controls.current;
    // The opening runs on real time, so it also completes on a slow device.
    s.age += Math.min(rawDelta, 0.25);
    if (!reducedMotion) s.time += delta;

    // The visitor's scrolling picks the place along the story; smoothing it keeps wheel steps silky.
    const target = stopAt(window.scrollY, centres.current);
    s.place = reducedMotion ? Math.round(target) : THREE.MathUtils.damp(s.place, target, 5.5, Math.min(rawDelta, 0.4));

    // A slow graphics card draws fewer pixels rather than stutter. (A very long gap means the
    // browser was only pausing a hidden page, so it doesn't count.)
    if (rawDelta < 0.25 && s.age > 3) {
      s.slowFrames = rawDelta > 0.03 ? s.slowFrames + 1 : Math.max(0, s.slowFrames - 0.25);
      if (s.slowFrames > 45 && gl.getPixelRatio() > 1) {
        setDpr(Math.max(1, gl.getPixelRatio() - 0.35));
        s.slowFrames = 0;
      }
    }

    // Arrival.
    const introT = reducedMotion ? 1 : Math.min(1, s.age / ARRIVAL_SECONDS);
    if (arrival.current.active) {
      if (c.dragging || introT >= 1) arrival.current.active = false;
      else {
        const left = Math.pow(1 - introT, 3.2);
        c.lon = arrival.current.lon + ARRIVAL_TURN * left;
      }
    }
    const fade = reducedMotion ? 1 : THREE.MathUtils.smoothstep(s.age, 0.1, 2.6);
    planetUniforms.uExposure.value = fade;
    airUniforms.uExposure.value = reducedMotion ? 1 : THREE.MathUtils.smoothstep(s.age, 0.7, 3.2);
    starUniforms.uExposure.value = reducedMotion ? 1 : THREE.MathUtils.smoothstep(s.age, 0, 1.6);

    // Free spin, plus any push from dragging. The spin eases back in after the arrival.
    if (!c.dragging && !arrival.current.active) {
      const afterArrival = THREE.MathUtils.smoothstep(s.age, ARRIVAL_SECONDS, ARRIVAL_SECONDS + SPIN_RETURN_SECONDS);
      const afterRest = THREE.MathUtils.smoothstep(performance.now() / 1000 - c.releasedAt, REST_SECONDS, REST_SECONDS + SPIN_RETURN_SECONDS);
      const spinIn = reducedMotion ? 0 : Math.min(afterArrival, afterRest);
      c.lon -= SPIN_SPEED * spinIn * delta;
      const turned = turnGlobe(c, c.velocityX * delta, c.velocityY * delta);
      c.lat = turned.lat;
      c.lon = turned.lon;
      c.velocityX = THREE.MathUtils.damp(c.velocityX, 0, 2.6, delta);
      c.velocityY = THREE.MathUtils.damp(c.velocityY, 0, 2.6, delta);
    }

    const upright = size.height >= size.width;
    const pose = poseAt(s.place, c, upright);
    const radius = fitRadius(size.width, size.height) * pose.zoom;
    const lens = lensFor(radius);
    c.radius = radius;
    c.pixelsPerRadian = lens.pixelsPerRadian;
    c.free = pose.free;
    if (storyShade.current) storyShade.current.style.opacity = (1 - pose.free).toFixed(3);
    const free = pose.free > 0.6;
    if (free !== s.free) {
      s.free = free;
      onFreeChange(free);
    }

    const offsetX = (pose.x - 0.5) * size.width;
    const offsetY = (0.5 - pose.y) * size.height;
    s.offsetX = s.placed ? THREE.MathUtils.damp(s.offsetX, offsetX, reducedMotion ? 1000 : 9, delta) : offsetX;
    s.offsetY = s.placed ? THREE.MathUtils.damp(s.offsetY, offsetY, reducedMotion ? 1000 : 9, delta) : offsetY;
    s.placed = true;
    c.centreX = size.width / 2 + s.offsetX;
    c.centreY = size.height / 2 - s.offsetY;

    // A real camera, always aimed straight at the planet so it stays perfectly round: a longer lens
    // brings it closer, and shifting the lens places it on the screen, so its shape never changes.
    const lensCamera = camera as THREE.PerspectiveCamera;
    lensCamera.fov = 2 * THREE.MathUtils.radToDeg(Math.atan(size.height / 2 / lens.focal));
    lensCamera.aspect = size.width / size.height;
    lensCamera.updateProjectionMatrix();
    lensCamera.projectionMatrix.elements[8] = (-2 * s.offsetX) / size.width;
    lensCamera.projectionMatrix.elements[9] = (-2 * s.offsetY) / size.height;

    orientationFacing(pose.lat, pose.lon, ROLL * pose.free, scratch.quaternion);
    planetRef.current.quaternion.copy(scratch.quaternion);

    // The sun as the planet's own frame sees it (for cloud shadows).
    scratch.inverse.copy(scratch.quaternion).invert();
    planetUniforms.uSunLocal.value.copy(SUN).applyQuaternion(scratch.inverse).normalize();

    const sharp = detail.current;
    if (!sharp.requested && wantsDetailImage(s.place, saveData)) {
      sharp.requested = true;
      sharp.stop = loadSharper(DETAIL_IMAGE.path, THREE.SRGBColorSpace, (texture) => {
        texture.wrapS = THREE.ClampToEdgeWrapping;
        texture.wrapT = THREE.ClampToEdgeWrapping;
        texture.needsUpdate = true;
        sharp.texture = texture;
      });
    }
    if (sharp.texture) planetUniforms.uDetail.value = sharp.texture;
    planetUniforms.uDetailAmount.value = sharp.texture ? (reducedMotion ? 1 : THREE.MathUtils.damp(planetUniforms.uDetailAmount.value, 1, 3, delta)) : 0;

    // Clouds drift, and thin out so the measured maps can be read.
    if (!reducedMotion) s.cloudSpin += CLOUD_DRIFT * delta;
    planetUniforms.uCloudSpin.value = s.cloudSpin;
    planetUniforms.uCloudAmount.value = pose.clouds;
    planetUniforms.uTime.value = s.time;

    // The measured map for this stop.
    if (pose.data !== s.shownData && pose.data) {
      const texture = dataTextures.current[pose.data];
      if (texture) {
        s.shownData = pose.data;
        const map = DATA_MAPS[pose.data];
        const [west, south, east, north] = map.bbox;
        planetUniforms.uData.value = texture;
        planetUniforms.uDataBox.value.set((west + 180) / 360, (south + 90) / 180, (east + 180) / 360, (north + 90) / 180);
        planetUniforms.uDataRise.value.set(map.rise);
        planetUniforms.uDataFall.value.set(map.fall);
      }
    }
    planetUniforms.uDataAmount.value = s.shownData === pose.data ? pose.dataAmount : 0;

    // The atmosphere's breath: only the air outside the planet moves.
    airUniforms.uBreath.value = Math.sin(s.time * 1.1);

    // Stars fill the screen, and shift a little as the story moves on.
    starUniforms.uPixelRatio.value = gl.getPixelRatio();
    starUniforms.uTime.value = s.time;
    const stretch = Math.max(size.width, size.height) * 0.72;
    starUniforms.uScale.value.set((stretch * 2) / size.width, (stretch * 2) / size.height);
    starUniforms.uShift.value.set((-s.place * 26 * 2) / size.width, (s.place * 11 * 2) / size.height);

    // "You are here": fades away as the story begins.
    const homeShown = home ? fade * THREE.MathUtils.smoothstep(s.age, ARRIVAL_SECONDS * 0.5, ARRIVAL_SECONDS) * Math.max(0, pose.free * 2 - 1) : 0;
    planetUniforms.uMarkerSize.value = 26 / lens.pixelsPerRadian;
    if (home) {
      const place = scratch.vector.set(...latLonToSphere(home.lat, home.lon)).applyQuaternion(scratch.quaternion);
      const facing = THREE.MathUtils.smoothstep(place.z, HORIZON_HEIGHT + 0.03, HORIZON_HEIGHT + 0.26);
      planetUniforms.uHomeAmount.value = homeShown * facing;
      const chip = homeLabel.current;
      if (chip) {
        const shown = onScreen(place, lens.focal);
        const px = c.centreX + shown.x;
        const py = c.centreY - shown.y;
        const width = chip.offsetWidth;
        const left = px + 18 + width > size.width - 10 ? px - 18 - width : px + 18;
        chip.style.transform = `translate(${left.toFixed(1)}px, ${(py - 12).toFixed(1)}px)`;
        chip.style.opacity = (upright ? 0 : homeShown * facing).toFixed(3);
        const clock = formatLocalClock(new Date());
        if (clock !== s.lastClock && homeTime.current) {
          homeTime.current.textContent = clock;
          s.lastClock = clock;
        }
      }
    }

    // Labels on the story's places.
    const labels = markers.current?.children;
    if (labels) {
      for (let i = 0; i < MARKERS.length; i++) {
        const element = labels[i] as HTMLElement | undefined;
        if (!element) continue;
        const marker = MARKERS[i];
        const closeness = 1 - Math.abs(s.place - marker.stop) / 0.3;
        // On upright screens the card over the planet already names the place, and labels wouldn't fit.
        if (closeness <= 0 || upright) {
          element.style.opacity = "0";
          continue;
        }
        const place = scratch.vector.set(...latLonToSphere(marker.lat, marker.lon)).applyQuaternion(scratch.quaternion);
        const shown = onScreen(place, lens.focal);
        const px = c.centreX + shown.x;
        const py = c.centreY - shown.y;
        element.style.transform = `translate(${px.toFixed(1)}px, ${py.toFixed(1)}px)`;
        element.style.opacity = (Math.min(1, closeness * 2) * (place.z > HORIZON_HEIGHT + 0.05 ? 1 : 0)).toFixed(3);
      }
    }
  });

  return (
    <>
      <points frustumCulled={false} renderOrder={0}>
        <bufferGeometry>
          <bufferAttribute attach="attributes-position" count={STAR_COUNT} array={stars.positions} itemSize={3} />
          <bufferAttribute attach="attributes-aColour" count={STAR_COUNT} array={stars.colours} itemSize={3} />
          <bufferAttribute attach="attributes-aSize" count={STAR_COUNT} array={stars.sizes} itemSize={1} />
          <bufferAttribute attach="attributes-aPhase" count={STAR_COUNT} array={stars.phases} itemSize={1} />
        </bufferGeometry>
        <shaderMaterial uniforms={starUniforms} vertexShader={STAR_VERTEX} fragmentShader={STAR_FRAGMENT} transparent depthWrite={false} blending={THREE.AdditiveBlending} toneMapped={false} />
      </points>

      {/* The air: a flat sheet behind the planet, so it only ever shows outside the planet's edge. */}
      <mesh frustumCulled={false} scale={EDGE_ON_MIDDLE_PLANE} renderOrder={1}>
        <planeGeometry args={[3.6, 3.6]} />
        <shaderMaterial uniforms={airUniforms} vertexShader={AIR_VERTEX} fragmentShader={AIR_FRAGMENT} transparent depthWrite={false} blending={THREE.AdditiveBlending} toneMapped={false} />
      </mesh>

      <group ref={planetRef}>
        <mesh frustumCulled={false}>
          <sphereGeometry args={[1, 192, 128]} />
          <shaderMaterial uniforms={planetUniforms} vertexShader={PLANET_VERTEX} fragmentShader={PLANET_FRAGMENT} />
        </mesh>
        <mesh frustumCulled={false} scale={CLOUD_HEIGHT} renderOrder={2}>
          <sphereGeometry args={[1, 128, 96]} />
          <shaderMaterial uniforms={planetUniforms} vertexShader={PLANET_VERTEX} fragmentShader={CLOUD_FRAGMENT} transparent depthWrite={false} />
        </mesh>
      </group>
    </>
  );
}

interface CinematicEarthProps {
  reducedMotion: boolean;
  /** The part of the page whose [data-stop] elements mark where the planet goes. */
  story: RefObject<HTMLElement>;
}

export default function CinematicEarth({ reducedMotion, story }: CinematicEarthProps) {
  const [free, setFree] = useState(true);
  const [onScreen, setOnScreen] = useState(true);
  const container = useRef<HTMLDivElement>(null);
  const homeLabel = useRef<HTMLDivElement>(null);
  const homeTime = useRef<HTMLSpanElement>(null);
  const markers = useRef<HTMLDivElement>(null);
  const storyShade = useRef<HTMLDivElement>(null);
  const centres = useRef<number[]>([]);

  // The visitor's part of the world, from their time zone (nothing is asked or sent).
  const home = useMemo(() => findHome(browserTimeZone()), []);
  const controls = useRef<Controls>({
    dragging: false,
    lat: 14,
    lon: 24,
    velocityX: 0,
    velocityY: 0,
    lastX: 0,
    lastY: 0,
    samples: [],
    releasedAt: -Infinity,
    free: 1,
    radius: 400,
    pixelsPerRadian: 500,
    centreX: 0,
    centreY: 0,
  });

  // Where each stop's text is centred on screen, kept up to date as the layout changes.
  useEffect(() => {
    const root = story.current;
    if (!root) return;
    const measure = () => {
      const stops = [...root.querySelectorAll<HTMLElement>("[data-stop]")];
      const scroll = window.scrollY;
      centres.current = stops.map((element, index) => {
        if (index === 0) return 0;
        const box = element.getBoundingClientRect();
        return box.top + scroll + box.height / 2 - window.innerHeight / 2;
      });
    };
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(root);
    window.addEventListener("resize", measure);
    return () => {
      observer.disconnect();
      window.removeEventListener("resize", measure);
    };
  }, [story]);

  // Stop drawing while the planet is scrolled out of view.
  useEffect(() => {
    const element = container.current;
    if (!element || typeof IntersectionObserver === "undefined") return;
    const observer = new IntersectionObserver(([entry]) => setOnScreen(entry.isIntersecting), { threshold: 0 });
    observer.observe(element);
    return () => observer.disconnect();
  }, []);

  /** Whether the pointer is over the planet (the empty sky around it can't be grabbed). */
  const overPlanet = useCallback((event: ReactPointerEvent<HTMLDivElement>) => {
    const c = controls.current;
    const bounds = event.currentTarget.getBoundingClientRect();
    return c.free >= 0.6 && Math.hypot(event.clientX - bounds.left - c.centreX, event.clientY - bounds.top - c.centreY) <= c.radius;
  }, []);

  const handlePointerMove = useCallback(
    (event: ReactPointerEvent<HTMLDivElement>) => {
      const c = controls.current;
      if (!c.dragging) {
        event.currentTarget.style.cursor = overPlanet(event) ? "grab" : "";
        return;
      }
      const view = turnGlobe(c, event.clientX - c.lastX, c.lastY - event.clientY, c.pixelsPerRadian);
      c.lat = view.lat;
      c.lon = view.lon;
      c.lastX = event.clientX;
      c.lastY = event.clientY;
      c.samples.push({ time: performance.now(), x: event.clientX, y: -event.clientY });
      if (c.samples.length > 8) c.samples.shift();
    },
    [overPlanet],
  );

  const handlePointerDown = useCallback(
    (event: ReactPointerEvent<HTMLDivElement>) => {
      if (!overPlanet(event)) return;
      const c = controls.current;
      try {
        event.currentTarget.setPointerCapture(event.pointerId);
      } catch {
        // The drag still works over the planet without it.
      }
      c.dragging = true;
      c.lastX = event.clientX;
      c.lastY = event.clientY;
      c.samples = [{ time: performance.now(), x: event.clientX, y: -event.clientY }];
      c.velocityX = 0;
      c.velocityY = 0;
      event.currentTarget.style.cursor = "grabbing";
    },
    [overPlanet],
  );

  const finishPointer = useCallback(
    (event: ReactPointerEvent<HTMLDivElement>, cancelled = false) => {
      const c = controls.current;
      if (!c.dragging) return;
      c.dragging = false;
      const now = performance.now();
      const flick = cancelled || reducedMotion ? { x: 0, y: 0 } : flickSpeed(c.samples, now, c.pixelsPerRadian);
      c.velocityX = flick.x;
      c.velocityY = flick.y;
      c.releasedAt = now / 1000;
      c.samples = [];
      if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId);
      event.currentTarget.style.cursor = "grab";
    },
    [reducedMotion],
  );

  const handleKeyDown = useCallback(
    (event: KeyboardEvent<HTMLDivElement>) => {
      const c = controls.current;
      if (c.free < 0.6) return;
      // The surface moves the way the arrow points.
      const turns: Record<string, [number, number]> = { ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, 1], ArrowDown: [0, -1] };
      const turn = turns[event.key];
      if (!turn) return;
      event.preventDefault();
      c.releasedAt = performance.now() / 1000;
      if (reducedMotion) {
        const view = turnGlobe(c, turn[0] * 0.3, turn[1] * 0.3);
        c.lat = view.lat;
        c.lon = view.lon;
      } else {
        c.velocityX += turn[0] * 0.9;
        c.velocityY += turn[1] * 0.9;
      }
    },
    [reducedMotion],
  );

  return (
    <div
      ref={container}
      className={`relative h-full w-full select-none focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-foreground/60 ${free ? "" : "pointer-events-none"}`}
      style={{ touchAction: "pan-y" }}
      role="application"
      aria-label={`Interactive Earth. Drag or use the arrow keys to turn it.${home ? ` Your country, ${home.label}, is marked, from your time zone.` : ""}`}
      tabIndex={free ? 0 : -1}
      onKeyDown={handleKeyDown}
      onPointerMove={handlePointerMove}
      onPointerDown={handlePointerDown}
      onPointerUp={(event) => finishPointer(event)}
      onPointerCancel={(event) => finishPointer(event, true)}
    >
      <Canvas
        camera={{ position: [0, 0, CAMERA_DISTANCE], fov: 30, near: 0.5, far: 20 }}
        dpr={[1, 1.75]}
        frameloop={onScreen ? "always" : "never"}
        gl={{ alpha: true, antialias: true, powerPreference: "high-performance", toneMappingExposure: 1.0 }}
      >
        <Suspense fallback={null}>
          <PlanetScene controls={controls} reducedMotion={reducedMotion} home={home} centres={centres} homeLabel={homeLabel} homeTime={homeTime} markers={markers} storyShade={storyShade} onFreeChange={setFree} />
        </Suspense>
      </Canvas>

      {/* Keeps the words readable where the planet comes near them: lightly at the opening, so its edge shows. */}
      <div aria-hidden="true" className="pointer-events-none absolute inset-y-0 left-0 w-[44%] bg-gradient-to-r from-space from-25% via-space/60 via-60% to-transparent portrait:hidden" />
      <div ref={storyShade} aria-hidden="true" className="pointer-events-none absolute inset-y-0 left-0 w-[58%] bg-gradient-to-r from-space from-45% via-space/85 via-72% to-transparent opacity-0 portrait:hidden" />
      {/* The planet melts into the dark at the bottom edge instead of being cut off. */}
      <div aria-hidden="true" className="pointer-events-none absolute inset-x-0 bottom-0 h-[16%] bg-gradient-to-t from-space to-transparent" />

      {home && (
        <div ref={homeLabel} aria-hidden="true" className="pointer-events-none absolute left-0 top-0 flex items-center gap-2 whitespace-nowrap rounded-sm bg-black/70 px-2 py-1 font-mono text-[11px] uppercase tracking-[0.14em] text-white opacity-0 will-change-transform">
          <span translate="no">{home.label}</span>
          <span ref={homeTime} className="tabular-nums text-white/70" />
        </div>
      )}

      <div ref={markers} aria-hidden="true">
        {MARKERS.map((marker) => (
          <div key={marker.text} className="pointer-events-none absolute left-0 top-0 opacity-0 will-change-transform">
            <span className="absolute -left-1 -top-1 h-2 w-2 rounded-full border border-white bg-white/30" />
            <span className="absolute left-1 top-0 h-px w-7 bg-white/70" />
            <span className="absolute left-8 top-0 -translate-y-1/2 whitespace-nowrap rounded-sm bg-black/70 px-2 py-1 font-mono text-[11px] uppercase tracking-[0.14em] text-white">{marker.text}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
