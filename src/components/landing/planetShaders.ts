// The planet is drawn in layers so land, water, clouds and measured data can be lit like a
// photograph, seen through a real camera: the ground, then clouds floating just above it (so they
// shift against the ground as it turns), then the air around the edge.

export const PLANET_VERTEX = /* glsl */ `
  varying vec2 vUv;
  varying vec3 vLocal;
  varying vec3 vWorldNormal;
  varying vec3 vWorldPosition;
  void main() {
    vUv = uv;
    vLocal = normalize(position);
    vWorldNormal = normalize(mat3(modelMatrix) * normal);
    vec4 world = modelMatrix * vec4(position, 1.0);
    vWorldPosition = world.xyz;
    gl_Position = projectionMatrix * viewMatrix * world;
  }
`;

// What both layers need: the light, the air between here and the camera, and which way the sun is.
const SURFACE_SHARED = /* glsl */ `
  uniform vec3 uSun;
  uniform vec3 uSunLocal;
  uniform float uExposure;
  uniform float uCloudAmount;
  uniform float uCloudSpin;
  uniform sampler2D uClouds;
  varying vec2 vUv;
  varying vec3 vLocal;
  varying vec3 vWorldNormal;
  varying vec3 vWorldPosition;

  const float PI = 3.14159265;

  // Which way the sun is across the map at this point, for shadows that fall away from it.
  vec2 towardsSunOnMap(vec3 n) {
    vec3 east = normalize(vec3(n.z, 0.0, -n.x) + vec3(1e-5));
    vec3 north = cross(n, east);
    float latitudeScale = max(length(n.xz), 0.12);
    return vec2(dot(uSunLocal, east) / (latitudeScale * 2.0 * PI), dot(uSunLocal, north) / PI);
  }

  // Sunlight, warming as the sun gets low. No lights on the far side: it simply falls away.
  float sunlight(float sunHeight) {
    return pow(smoothstep(-0.12, 0.88, sunHeight), 1.05);
  }
  vec3 sunColourAt(float sunHeight) {
    return mix(vec3(1.0, 0.70, 0.46), vec3(1.0, 0.965, 0.92), smoothstep(0.02, 0.45, sunHeight));
  }
  vec3 skyColour(float light) {
    return vec3(0.070, 0.190, 0.520) * (0.35 + 0.65 * light);
  }
`;

export const PLANET_FRAGMENT = /* glsl */ `
  ${SURFACE_SHARED}
  uniform sampler2D uDay;
  uniform sampler2D uData;
  uniform vec4 uDataBox;
  uniform float uDataAmount;
  uniform vec3 uDataRise;
  uniform vec3 uDataFall;

  // Water in the Blue Marble picture is far bluer than anything on land, snow and ice included.
  float waterIn(vec3 picture) {
    float blueness = picture.b / (max(picture.r, picture.g) + 0.002);
    return smoothstep(1.25, 1.75, blueness);
  }

  // The picture's oceans are map-blue. From orbit, deep water is a very dark navy and only the
  // shallow shelves turn teal, so the depth in the picture is kept but its colour is replaced.
  vec3 oceanFrom(vec3 picture) {
    float shallow = smoothstep(0.03, 0.34, picture.b);
    vec3 deep = vec3(0.0030, 0.0115, 0.038);
    vec3 shelf = vec3(0.0065, 0.036, 0.066);
    return mix(deep, shelf, shallow * shallow);
  }

  // Land a little deeper than the picture, so clouds are the brightest thing on Earth. The film-like
  // tone curve at the end pales bright colours, so deserts get a touch more colour to keep their warmth.
  vec3 landFrom(vec3 picture) {
    float grey = dot(picture, vec3(0.2126, 0.7152, 0.0722));
    vec3 richer = mix(vec3(grey), picture, 1.08);
    return pow(max(richer, vec3(0.0)), vec3(1.1)) * 0.82;
  }

  void main() {
    vec3 N = normalize(vWorldNormal);
    vec3 V = normalize(cameraPosition - vWorldPosition);
    float facing = clamp(dot(N, V), 0.0, 1.0);
    float sunHeight = dot(N, uSun);

    vec3 picture = texture2D(uDay, vUv).rgb;
    float water = waterIn(picture);
    vec3 surface = mix(landFrom(picture), oceanFrom(picture), water);

    // The shadows clouds drop on the ground, just away from the sun.
    vec2 cloudUv = vec2(vUv.x + uCloudSpin, vUv.y);
    vec2 towardsSun = towardsSunOnMap(normalize(vLocal));
    float overhead = texture2D(uClouds, cloudUv).g * uCloudAmount;
    float shadowCaster = texture2D(uClouds, cloudUv + towardsSun * 0.009).g * uCloudAmount;
    surface *= 1.0 - 0.52 * shadowCaster * (1.0 - overhead);

    float light = sunlight(sunHeight);
    vec3 colour = surface * sunColourAt(sunHeight) * light * 1.92;

    // The sun's glitter on water, never on land or through cloud.
    float mirror = max(dot(N, normalize(uSun + V)), 0.0);
    float glint = pow(mirror, 240.0) * 0.07 + pow(mirror, 50.0) * 0.022 + pow(mirror, 12.0) * 0.011;
    colour += vec3(1.0, 0.93, 0.82) * glint * water * (1.0 - overhead) * smoothstep(0.0, 0.2, sunHeight);

    // Measured data lies on the ground: strong where the trend is significant, faint where it isn't.
    if (uDataAmount > 0.001) {
      vec2 dataUv = (vUv - uDataBox.xy) / (uDataBox.zw - uDataBox.xy);
      if (dataUv.x > 0.0 && dataUv.x < 1.0 && dataUv.y > 0.0 && dataUv.y < 1.0) {
        vec3 reading = texture2D(uData, dataUv).rgb;
        float measured = smoothstep(0.35, 0.75, reading.b);
        float rate = reading.r * 2.0 - 1.0;
        float size = pow(clamp(abs(rate), 0.0, 1.0), 0.7);
        vec3 tint = rate >= 0.0 ? uDataRise : uDataFall;
        // Stronger rates burn hotter. The ground's own light and shade stay visible through the colour.
        float ground = dot(colour, vec3(0.2126, 0.7152, 0.0722));
        vec3 shown = mix(tint * 0.26, tint * 1.12, smoothstep(0.3, 0.92, size));
        shown = mix(shown, tint * vec3(1.15, 1.6, 1.1) + vec3(0.02), smoothstep(0.82, 1.0, size) * 0.7);
        shown *= 0.8 + 0.42 * min(ground, 1.0);
        colour = mix(colour, shown, measured * uDataAmount * (0.1 + 0.8 * reading.g) * (0.62 + 0.38 * size));
      }
    }

    // Looking through more and more air towards the edge: the ground fades into blue haze.
    colour += vec3(0.0035, 0.0085, 0.021) * light;
    colour = mix(colour, skyColour(light), pow(1.0 - facing, 3.1) * 0.86);

    gl_FragColor = vec4(colour * uExposure, 1.0);
    #include <tonemapping_fragment>
    #include <colorspace_fragment>
  }
`;

// Clouds on their own shell just above the ground, plus the "you are here" point on top of them.
export const CLOUD_FRAGMENT = /* glsl */ `
  ${SURFACE_SHARED}
  uniform vec3 uHome;
  uniform float uHomeAmount;
  uniform float uMarkerSize;
  uniform float uTime;

  void main() {
    vec3 N = normalize(vWorldNormal);
    vec3 V = normalize(cameraPosition - vWorldPosition);
    float facing = clamp(dot(N, V), 0.0, 1.0);
    float sunHeight = dot(N, uSun);
    vec3 n = normalize(vLocal);

    vec2 cloudUv = vec2(vUv.x + uCloudSpin, vUv.y);
    vec2 towardsSun = towardsSunOnMap(n);
    float cloud = texture2D(uClouds, cloudUv).g * uCloudAmount;

    // Cloud tops: brightest where thick, a touch darker on the side facing away from the sun.
    float light = sunlight(sunHeight);
    float selfShade = texture2D(uClouds, cloudUv + towardsSun * 0.004).g * uCloudAmount;
    float tops = 1.0 - 0.30 * clamp(selfShade - cloud, 0.0, 1.0) - 0.14 * (1.0 - cloud);
    vec3 colour = vec3(0.97, 0.985, 1.0) * sunColourAt(sunHeight) * light * tops * 1.28;
    colour += vec3(0.0035, 0.0085, 0.021) * light;
    colour = mix(colour, skyColour(light), pow(1.0 - facing, 3.1) * 0.86);
    float alpha = pow(clamp(cloud, 0.0, 1.0), 0.86) * 0.9 * smoothstep(0.0, 0.1, facing);

    // "You are here": a small point with soft ripples, the same size on screen at any zoom.
    float marked = 0.0;
    if (uHomeAmount > 0.001) {
      float d = distance(n, uHome) / uMarkerSize;
      float mark = smoothstep(0.11, 0.05, d);
      float ripples = 0.0;
      for (int i = 0; i < 2; i++) {
        float phase = fract(uTime / 3.4 + float(i) * 0.5);
        ripples += smoothstep(0.045, 0.0, abs(d - (0.14 + phase * 0.86))) * (1.0 - phase) * 0.55;
      }
      marked = clamp(mark + ripples, 0.0, 1.0) * uHomeAmount;
    }
    float covered = 1.0 - (1.0 - alpha) * (1.0 - marked);
    colour = covered > 0.001 ? (colour * alpha * (1.0 - marked) + vec3(1.4, 1.36, 1.28) * marked) / covered : colour;

    gl_FragColor = vec4(colour * uExposure, 1.0);
    #include <tonemapping_fragment>
    #include <colorspace_fragment>
    gl_FragColor.a = covered;
  }
`;

// The atmosphere seen from outside, drawn on a flat sheet behind the planet: a thin bright line
// hugging the edge that fades smoothly to nothing. Only this part breathes.
export const AIR_VERTEX = /* glsl */ `
  varying vec2 vOffset;
  void main() {
    vOffset = position.xy;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;

export const AIR_FRAGMENT = /* glsl */ `
  uniform vec3 uSun;
  uniform float uBreath;
  uniform float uExposure;
  varying vec2 vOffset;
  void main() {
    float r = length(vOffset);
    float height = r - 1.0;
    if (height < 0.0) discard;
    vec2 outward = vOffset / r;
    float sunward = dot(outward, uSun.xy) + uSun.z * 0.55;
    float lit = smoothstep(-0.55, 0.85, sunward);

    float reach = 0.030 * (1.0 + 0.2 * uBreath);
    float thin = exp(-height / 0.0065);
    float soft = exp(-height / reach);
    float wide = exp(-height / (reach * 3.6));

    vec3 colour = vec3(0.62, 0.80, 1.0) * thin * 0.42
                + vec3(0.11, 0.33, 1.0) * soft * (0.40 + 0.07 * uBreath)
                + vec3(0.04, 0.12, 0.46) * wide * 0.11;
    float fadeOut = 1.0 - smoothstep(0.30, 0.62, height);
    gl_FragColor = vec4(colour * (0.16 + 0.84 * lit) * fadeOut * uExposure, 1.0);
    #include <colorspace_fragment>
  }
`;

// Stars: each one a soft point with its own size and brightness. They sit on the screen itself,
// so the lens zooming in on the planet doesn't sweep them about.
export const STAR_VERTEX = /* glsl */ `
  attribute float aSize;
  attribute vec3 aColour;
  attribute float aPhase;
  uniform float uPixelRatio;
  uniform float uTime;
  uniform vec2 uScale;
  uniform vec2 uShift;
  varying vec3 vColour;
  void main() {
    float shimmer = 0.9 + 0.1 * sin(uTime * 0.7 + aPhase);
    vColour = aColour * shimmer;
    gl_PointSize = aSize * uPixelRatio;
    gl_Position = vec4(position.xy * uScale + uShift, 0.9999, 1.0);
  }
`;

export const STAR_FRAGMENT = /* glsl */ `
  uniform float uExposure;
  varying vec3 vColour;
  void main() {
    float d = length(gl_PointCoord - 0.5) * 2.0;
    float a = exp(-d * d * 4.5) * (1.0 - smoothstep(0.8, 1.0, d));
    gl_FragColor = vec4(vColour * a * uExposure, 1.0);
    #include <colorspace_fragment>
  }
`;
