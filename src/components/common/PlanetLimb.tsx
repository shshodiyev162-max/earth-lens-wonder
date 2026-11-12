import { useMemo } from "react";

/** Stars at fixed places, so the sky is the same on every visit. */
function starField(count: number) {
  let state = 7;
  const next = () => {
    state = (state * 1664525 + 1013904223) % 4294967296;
    return state / 4294967296;
  };
  return Array.from({ length: count }, (_, i) => ({ id: i, x: next() * 100, y: next() * 100, r: 0.4 + next() * 0.7, o: 0.25 + next() * 0.6 }));
}

/**
 * The edge of the planet rising from the bottom of a dark sky: the home page's first picture, drawn
 * without a 3D scene, for pages that need atmosphere but have nothing to show (not found, an error).
 */
export default function PlanetLimb() {
  const stars = useMemo(() => starField(150), []);
  return (
    <div aria-hidden className="pointer-events-none absolute inset-0 overflow-hidden bg-[#03040a]">
      <svg className="absolute inset-0 h-full w-full" preserveAspectRatio="none" viewBox="0 0 100 100">
        {stars.map((star) => (
          <circle key={star.id} cx={star.x} cy={star.y * 0.8} r={star.r * 0.09} fill="#fff" opacity={star.o} vectorEffect="non-scaling-stroke" />
        ))}
      </svg>
      {/* Thin air, lit from behind. */}
      <div
        className="absolute left-1/2 top-[62%] aspect-square w-[max(180vw,1500px)] -translate-x-1/2 rounded-full"
        style={{ boxShadow: "0 0 90px 8px rgb(88 150 255 / 0.5), 0 0 260px 50px rgb(50 100 220 / 0.22), inset 0 0 0 1px rgb(190 220 255 / 0.5)" }}
      />
      {/* The night side, with the dawn creeping over its rim. */}
      <div
        className="absolute left-1/2 top-[62%] aspect-square w-[max(180vw,1500px)] -translate-x-1/2 rounded-full"
        style={{ background: "radial-gradient(closest-side, #03040a 92%, #070d1f 96%, #16305f 99%, #4b7fd0 100%)" }}
      />
    </div>
  );
}
