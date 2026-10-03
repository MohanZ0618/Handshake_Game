export class FrameMetrics {
  private frames: number[] = [];
  private last = 0;
  private cachedAt = -Infinity;
  private cached = { fps: 0, p95: 0, p99: 0, slow: 0, frames: 0 };
  record(now: number, active = true) {
    if (active && this.last) this.frames.push(now - this.last);
    this.last = active ? now : 0;
    if (this.frames.length > 3600) this.frames.shift();
  }
  reset() {
    this.frames = [];
    this.last = 0;
    this.cachedAt = -Infinity;
  }
  stats(now: number) {
    if (now - this.cachedAt < 1000) return this.cached;
    this.cachedAt = now;
    const sorted = [...this.frames].sort((a, b) => a - b);
    const n = sorted.length;
    this.cached = {
      fps: n ? (n * 1000) / this.frames.reduce((a, b) => a + b, 0) : 0,
      p95: sorted[Math.max(0, Math.ceil(n * 0.95) - 1)] ?? 0,
      p99: sorted[Math.max(0, Math.ceil(n * 0.99) - 1)] ?? 0,
      slow: this.frames.filter((ms) => ms > 50).length,
      frames: n,
    };
    return this.cached;
  }
}
export class NetworkMetrics {
  private last = 0;
  private intervals: number[] = [];
  private errors: number[] = [];
  record(now: number, correction: number) {
    if (this.last) this.intervals.push(now - this.last);
    this.last = now;
    this.errors.push(correction);
    if (this.intervals.length > 600) this.intervals.shift();
    if (this.errors.length > 600) this.errors.shift();
  }
  summary() {
    const times = [...this.intervals].sort((a, b) => a - b);
    const errors = [...this.errors].sort((a, b) => a - b);
    const percentile = (values: number[]) =>
      values[Math.max(0, Math.ceil(values.length * 0.95) - 1)] ?? 0;
    return `Snapshot P95 ${percentile(times).toFixed(1)} ms; correction P95 ${percentile(errors).toFixed(2)} / max ${(errors.at(-1) ?? 0).toFixed(2)} units`;
  }
}
