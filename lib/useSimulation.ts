"use client";

// React hook that drives the simulation Web Worker. Falls back to running on
// the main thread if Workers are unavailable (e.g. during SSR / older Safari).
// Supports two job kinds: strategy "fragility" and price "forecast".

import { useCallback, useEffect, useRef, useState } from "react";
import { RunInput, RunOutput, runSimulation } from "./sim/engine";
import { ForecastInput, ForecastOutput, runPriceForecast } from "./sim/forecast";
import type { WorkerRequest, WorkerResponse } from "./sim/worker";

export function useSimulation() {
  const workerRef = useRef<Worker | null>(null);
  const idRef = useRef(0);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const pending = useRef<Map<number, (o: any) => void>>(new Map());
  const rejecters = useRef<Map<number, (e: Error) => void>>(new Map());
  const [running, setRunning] = useState(false);

  useEffect(() => {
    if (typeof window === "undefined") return;
    try {
      const w = new Worker(new URL("./sim/worker.ts", import.meta.url));
      w.onmessage = (e: MessageEvent<WorkerResponse>) => {
        const { id, output, error } = e.data;
        if (error) {
          rejecters.current.get(id)?.(new Error(error));
        } else if (output) {
          pending.current.get(id)?.(output);
        }
        pending.current.delete(id);
        rejecters.current.delete(id);
      };
      workerRef.current = w;
    } catch {
      workerRef.current = null; // will use main-thread fallback
    }
    return () => {
      workerRef.current?.terminate();
      workerRef.current = null;
    };
  }, []);

  const run = useCallback((input: RunInput): Promise<RunOutput> => {
    const id = ++idRef.current;
    if (!workerRef.current) {
      return new Promise((resolve) => {
        setTimeout(() => resolve(runSimulation(input)), 0);
      });
    }
    return new Promise<RunOutput>((resolve, reject) => {
      pending.current.set(id, resolve as (o: unknown) => void);
      rejecters.current.set(id, reject);
      const req: WorkerRequest = { id, kind: "fragility", input };
      workerRef.current!.postMessage(req);
    });
  }, []);

  const runForecast = useCallback((input: ForecastInput): Promise<ForecastOutput> => {
    const id = ++idRef.current;
    if (!workerRef.current) {
      return new Promise((resolve) => {
        setTimeout(() => resolve(runPriceForecast(input)), 0);
      });
    }
    return new Promise<ForecastOutput>((resolve, reject) => {
      pending.current.set(id, resolve as (o: unknown) => void);
      rejecters.current.set(id, reject);
      const req: WorkerRequest = { id, kind: "forecast", input };
      workerRef.current!.postMessage(req);
    });
  }, []);

  // Convenience wrapper that toggles a global running flag for the primary run.
  const runPrimary = useCallback(
    async (input: RunInput): Promise<RunOutput> => {
      setRunning(true);
      try {
        return await run(input);
      } finally {
        setRunning(false);
      }
    },
    [run],
  );

  const runForecastPrimary = useCallback(
    async (input: ForecastInput): Promise<ForecastOutput> => {
      setRunning(true);
      try {
        return await runForecast(input);
      } finally {
        setRunning(false);
      }
    },
    [runForecast],
  );

  return { run, runPrimary, runForecast, runForecastPrimary, running };
}
