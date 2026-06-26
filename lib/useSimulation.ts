"use client";

import { useCallback, useState } from "react";
import type { RunInput, RunOutput } from "./sim/engine";

function spawnWorker(): Worker {
  return new Worker(new URL("./sim/worker.ts", import.meta.url));
}

function runInWorker(input: RunInput): Promise<RunOutput> {
  return new Promise((resolve, reject) => {
    const worker = spawnWorker();
    worker.onmessage = (e: MessageEvent<RunOutput>) => {
      resolve(e.data);
      worker.terminate();
    };
    worker.onerror = (e: ErrorEvent) => {
      reject(new Error(e.message));
      worker.terminate();
    };
    worker.postMessage(input);
  });
}

export function useSimulation() {
  const [running, setRunning] = useState(false);

  // `run` — used for background/batch calls (StrategyCompare). No loading state change.
  const run = useCallback((input: RunInput): Promise<RunOutput> => {
    return runInWorker(input);
  }, []);

  // `runPrimary` — used for the single-strategy run. Sets the loading indicator.
  const runPrimary = useCallback(
    async (input: RunInput): Promise<RunOutput> => {
      setRunning(true);
      try {
        return await runInWorker(input);
      } finally {
        setRunning(false);
      }
    },
    []
  );

  return { run, runPrimary, running };
}
