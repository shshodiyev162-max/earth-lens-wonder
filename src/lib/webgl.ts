let cached: boolean | null = null;

/** Whether this browser can draw the 3D globe (WebGL). Checked once; an old device or one with 3D switched off can't. */
export function canDraw3d(): boolean {
  if (cached !== null) return cached;
  try {
    const canvas = document.createElement("canvas");
    cached = Boolean(canvas.getContext("webgl2") ?? canvas.getContext("webgl"));
  } catch {
    cached = false;
  }
  return cached;
}
