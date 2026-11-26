// Original demo geometry only. No SDK algorithms, calibration or emotion inference.
export const METRICS = {
  head_stability: { label: 'Head pose stability', unit: '° spread', description: '5-second RMS spread of geometric yaw, pitch and roll proxies. Lower means less movement.' },
  blink_rate: { label: 'Blink frequency', unit: 'blinks/min', description: 'Completed eyelid closures per minute of valid tracking. Available after 5 seconds; short sessions are noisy.' },
  gaze_proxy: { label: 'Gaze direction proxy', unit: 'eye widths', description: 'Mean horizontal iris offset from eye center. Image coordinates: negative left, positive right. Not calibrated eye tracking.' },
  landmark_jitter: { label: 'Landmark micro-jitter', unit: '% face width/s', description: 'RMS frame-to-frame speed of six points after translation, scale and roll alignment. Includes tracker noise and expression changes.' },
};
export const POINTS = [1, 4, 10, 33, 133, 159, 145, 152, 168, 234, 263, 362, 386, 374, 454, 468, 473];
const TRACKED = [1, 4, 10, 152, 234, 454];
const mean = a => a.reduce((s, v) => s + v, 0) / a.length;
const variance = a => { const m = mean(a); return mean(a.map(v => (v - m) ** 2)); };
const distance = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);
const midpoint = (a, b) => ({ x: (a.x + b.x) / 2, y: (a.y + b.y) / 2, z: (a.z + b.z) / 2 });
const dot = (a, b) => a.x * b.x + a.y * b.y;
const sub = (a, b) => ({ x: a.x - b.x, y: a.y - b.y });
const rounded = n => Number.isFinite(n) ? Number(n.toFixed(5)) : null;

function geometry(landmarks, width, height) {
  if (!landmarks || !Number.isFinite(width) || !Number.isFinite(height) || width <= 0 || height <= 0) return null;
  if (!POINTS.every(i => landmarks[i] && ['x', 'y', 'z'].every(k => Number.isFinite(landmarks[i][k])))) return null;
  const p = landmarks.map(v => ({ x: v.x * width, y: v.y * height, z: v.z * width }));
  const faceWidth = distance(p[234], p[454]);
  const left = midpoint(p[33], p[133]), right = midpoint(p[362], p[263]);
  const eyeWidth = distance(left, right);
  if (faceWidth < 1 || eyeWidth < 1 || distance(p[10], p[152]) < 1) return null;
  const origin = midpoint(left, right);
  const axis = { x: (right.x - left.x) / eyeWidth, y: (right.y - left.y) / eyeWidth };
  const aligned = TRACKED.map(i => {
    const d = sub(p[i], origin);
    return { x: dot(d, axis) / faceWidth, y: (-d.x * axis.y + d.y * axis.x) / faceWidth };
  });
  const eye = (a, b, top, bottom, iris) => {
    const span = distance(p[a], p[b]);
    if (span < 1) return null;
    const v = sub(p[b], p[a]), center = midpoint(p[a], p[b]);
    return { ear: distance(p[top], p[bottom]) / span, gaze: dot(sub(p[iris], center), v) / (span * span) };
  };
  const e1 = eye(33, 133, 159, 145, 468), e2 = eye(362, 263, 386, 374, 473);
  if (!e1 || !e2) return null;
  const degrees = 180 / Math.PI;
  return {
    pose: [
      Math.atan2(p[454].z - p[234].z, faceWidth) * degrees,
      Math.atan2(p[152].z - p[10].z, distance(p[10], p[152])) * degrees,
      Math.atan2(axis.y, axis.x) * degrees,
    ],
    ear: (e1.ear + e2.ear) / 2,
    gaze: (e1.gaze + e2.gaze) / 2,
    aligned,
  };
}

class Stats {
  count = 0; mean = 0; m2 = 0; min = Infinity; max = -Infinity;
  add(x) {
    if (!Number.isFinite(x)) return;
    this.count++;
    const delta = x - this.mean;
    this.mean += delta / this.count;
    this.m2 += delta * (x - this.mean);
    this.min = Math.min(this.min, x); this.max = Math.max(this.max, x);
  }
  summary() {
    return this.count ? { count: this.count, mean: rounded(this.mean), std: rounded(Math.sqrt(this.m2 / this.count)), min: rounded(this.min), max: rounded(this.max) }
      : { count: 0, mean: null, std: null, min: null, max: null };
  }
}

export class MetricSession {
  constructor(source) {
    this.source = source; this.startedAt = new Date().toISOString();
    this.frames = 0; this.missingFrames = 0; this.validSeconds = 0; this.blinks = 0;
    this.previous = null; this.closedAt = null; this.openSeen = false; this.lastBlink = -Infinity;
    this.poses = []; this.history = []; this.latest = null; this.firstTimestamp = null; this.lastTimestamp = null;
    this.stats = Object.fromEntries(Object.keys(METRICS).map(k => [k, new Stats()]));
  }
  add(landmarks, timestamp, width = 640, height = 480) {
    if (!Number.isFinite(timestamp) || (this.lastTimestamp !== null && timestamp <= this.lastTimestamp)) return null;
    this.firstTimestamp ??= timestamp; this.lastTimestamp = timestamp;
    const g = geometry(landmarks, width, height);
    if (!g) {
      this.missingFrames++; this.previous = null; this.poses = []; this.closedAt = null; this.openSeen = false; this.latest = null;
      this.history.push(null); if (this.history.length > 120) this.history.shift();
      return null;
    }
    const dt = this.previous ? (timestamp - this.previous.timestamp) / 1000 : 0;
    const continuous = dt > 0 && dt <= 0.25;
    if (!continuous) { this.closedAt = null; this.openSeen = false; this.poses = []; }
    if (continuous) this.validSeconds += dt;
    this.frames++;
    // Hysteresis, 60–500 ms closures, and a refractory interval. Heuristics, not SDK calibration.
    if (g.ear < 0.16 && this.openSeen && this.closedAt === null) this.closedAt = timestamp;
    if (g.ear > 0.22) {
      if (this.closedAt !== null) {
        const closedMs = timestamp - this.closedAt;
        if (closedMs >= 60 && closedMs <= 500 && timestamp - this.lastBlink >= 250) {
          this.blinks++; this.lastBlink = timestamp;
        }
      }
      this.closedAt = null; this.openSeen = true;
    }
    // Unwrap angles to avoid artificial jumps at -180/180 degrees.
    if (continuous) g.pose = g.pose.map((v, i) => {
      const previous = this.previous.pose[i];
      return previous + ((v - previous + 540) % 360) - 180;
    });
    this.poses.push({ timestamp, pose: g.pose });
    this.poses = this.poses.filter(p => timestamp - p.timestamp <= 5000);
    const head = this.poses.length > 1 ? Math.sqrt(mean([0, 1, 2].map(i => variance(this.poses.map(p => p.pose[i]))))) : null;
    const jitter = continuous ? 100 * Math.sqrt(mean(g.aligned.map((p, i) => distance(p, this.previous.aligned[i]) ** 2))) / dt : null;
    const values = { head_stability: head, blink_rate: this.validSeconds >= 5 ? 60 * this.blinks / this.validSeconds : null, gaze_proxy: g.ear > 0.22 ? g.gaze : null, landmark_jitter: jitter };
    this.latest = values;
    for (const [k, v] of Object.entries(values)) this.stats[k].add(v);
    this.history.push(values); if (this.history.length > 120) this.history.shift();
    this.previous = { ...g, timestamp };
    return values;
  }
  snapshot() {
    return {
      source: this.source, started_at: this.startedAt, valid_frames: this.frames, missing_frames: this.missingFrames,
      elapsed_seconds: rounded((this.lastTimestamp - this.firstTimestamp) / 1000),
      valid_tracking_seconds: rounded(this.validSeconds), blink_count: this.blinks,
      metrics: Object.fromEntries(Object.entries(METRICS).map(([key, info]) => [key, {
        ...info, value: rounded(this.latest?.[key]), ...this.stats[key].summary(),
        reason: Number.isFinite(this.latest?.[key]) ? null : 'Insufficient valid tracking, closed eyes, or no current face',
      }])),
    };
  }
}
