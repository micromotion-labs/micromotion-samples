// Deliberately synthetic geometry. Never used as a fallback for camera inference.
export const SAMPLE_SECONDS = 30;
export function sampleLandmarks(seconds) {
  const p = Array.from({ length: 478 }, () => ({ x: 0.5, y: 0.5, z: 0 }));
  const set = (i, x, y, z = 0) => { p[i] = { x, y, z }; };
  set(234, .28, .5); set(454, .72, .5); set(10, .5, .2); set(152, .5, .82);
  set(1, .5, .53, -.08); set(4, .5, .57, -.07); set(168, .5, .4, -.04);
  const phase = seconds % 3;
  const openness = phase > 1.35 && phase < 1.51 ? .003 : .018;
  const gaze = .015 * Math.sin(seconds * .7);
  for (const [a, b, top, bottom, iris, cx] of [[33, 133, 159, 145, 468, .4], [362, 263, 386, 374, 473, .6]]) {
    set(a, cx - .045, .4); set(b, cx + .045, .4);
    set(top, cx, .4 - openness); set(bottom, cx, .4 + openness); set(iris, cx + gaze, .4);
  }
  const roll = .025 * Math.sin(seconds * 1.2), yaw = .07 * Math.sin(seconds * .8), pitch = .04 * Math.cos(seconds * .6);
  return p.map((v, i) => {
    // Rotate in pixel-proportional coordinates, then normalize again.
    const x = v.x - .5, y = (v.y - .5) * .75;
    const j = .00035 * Math.sin(seconds * 37 + i * 1.7);
    return { x: .5 + x * Math.cos(roll) - y * Math.sin(roll) + .01 * Math.sin(seconds) + j,
      y: .5 + (x * Math.sin(roll) + y * Math.cos(roll)) / .75 + j,
      z: v.z + yaw * x + pitch * y };
  });
}
