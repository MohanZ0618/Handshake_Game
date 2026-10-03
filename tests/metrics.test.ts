import { it, expect } from "vitest";
import { FrameMetrics, NetworkMetrics } from "../src/metrics";
it("reports tail frame times and excludes hidden gaps", () => {
  const metrics = new FrameMetrics();
  metrics.record(100);
  for (let n = 1; n <= 98; n++) metrics.record(100 + n * 16);
  metrics.record(1800);
  metrics.record(1900);
  const stats = metrics.stats(2000);
  expect(stats.frames).toBe(100);
  expect(stats.p95).toBe(16);
  expect(stats.p99).toBe(100);
  expect(stats.slow).toBe(2);
  metrics.record(2100, false);
  metrics.record(5000);
  expect(metrics.stats(5100).frames).toBe(100);
  metrics.reset();
  expect(metrics.stats(6000).frames).toBe(0);
});
it("records snapshot timing and correction magnitudes without external reporting", () => {
  const metrics = new NetworkMetrics();
  metrics.record(100, 0);
  metrics.record(150, 4);
  metrics.record(225, 10);
  expect(metrics.summary()).toContain("Snapshot P95 75.0 ms");
  expect(metrics.summary()).toContain("max 10.00 units");
});
