import { useEffect, useRef, useState } from "react";

type PerfOverlayProps = {
  nodeCount: number;
  edgeCount: number;
};

type PerfSample = {
  fps: number;
  frameMs: number;
  heapMb: number | null;
};

const BYTES_PER_MB = 1024 * 1024;

type PerformanceWithMemory = Performance & {
  memory?: { usedJSHeapSize: number };
};

const readHeapMb = (): number | null => {
  const memory = (performance as PerformanceWithMemory).memory;

  return memory ? memory.usedJSHeapSize / BYTES_PER_MB : null;
};

export const PerfOverlay = ({ nodeCount, edgeCount }: PerfOverlayProps) => {
  const [sample, setSample] = useState<PerfSample>({
    fps: 0,
    frameMs: 0,
    heapMb: readHeapMb(),
  });
  const frameCountRef = useRef(0);
  const lastFlushRef = useRef(performance.now());
  const lastFrameRef = useRef(performance.now());
  const maxFrameMsRef = useRef(0);

  useEffect(() => {
    let rafId = 0;

    const tick = () => {
      const now = performance.now();
      const delta = now - lastFrameRef.current;
      lastFrameRef.current = now;
      frameCountRef.current += 1;
      maxFrameMsRef.current = Math.max(maxFrameMsRef.current, delta);

      const elapsed = now - lastFlushRef.current;

      if (elapsed >= 500) {
        setSample({
          fps: Math.round((frameCountRef.current * 1000) / elapsed),
          frameMs: Math.round(maxFrameMsRef.current * 10) / 10,
          heapMb: readHeapMb(),
        });
        frameCountRef.current = 0;
        maxFrameMsRef.current = 0;
        lastFlushRef.current = now;
      }

      rafId = requestAnimationFrame(tick);
    };

    rafId = requestAnimationFrame(tick);

    return () => cancelAnimationFrame(rafId);
  }, []);

  const fpsTone =
    sample.fps >= 55 ? "good" : sample.fps >= 30 ? "warn" : "bad";

  return (
    <div className="perf-overlay" role="status" aria-label="Performance metrics">
      <div className="perf-overlay__row">
        <span className="perf-overlay__label">FPS</span>
        <span className={`perf-overlay__value perf-overlay__value--${fpsTone}`}>
          {sample.fps}
        </span>
      </div>
      <div className="perf-overlay__row">
        <span className="perf-overlay__label">Frame</span>
        <span className="perf-overlay__value">{sample.frameMs.toFixed(1)}ms</span>
      </div>
      {sample.heapMb !== null ? (
        <div className="perf-overlay__row">
          <span className="perf-overlay__label">Heap</span>
          <span className="perf-overlay__value">
            {sample.heapMb.toFixed(1)}MB
          </span>
        </div>
      ) : null}
      <div className="perf-overlay__row">
        <span className="perf-overlay__label">Nodes</span>
        <span className="perf-overlay__value">{nodeCount}</span>
      </div>
      <div className="perf-overlay__row">
        <span className="perf-overlay__label">Edges</span>
        <span className="perf-overlay__value">{edgeCount}</span>
      </div>
    </div>
  );
};

export const isPerfOverlayEnabled = () => {
  if (typeof window === "undefined") {
    return false;
  }

  return new URLSearchParams(window.location.search).get("perf") === "1";
};
