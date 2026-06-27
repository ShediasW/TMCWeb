// Web Worker: runs the Monte Carlo off the main thread so the UI stays
// responsive on a phone while tens of thousands of paths churn. Handles two
// job kinds: the strategy "fragility" evaluation and the "forecast" price
// distribution. They share the same fat-tailed path engine underneath.

import { runSimulation, RunInput, RunOutput } from "./engine";
import { runPriceForecast, ForecastInput, ForecastOutput } from "./forecast";

export type WorkerRequest =
  | { id: number; kind: "fragility"; input: RunInput }
  | { id: number; kind: "forecast"; input: ForecastInput };

export type WorkerResponse =
  | { id: number; kind: "fragility"; output?: RunOutput; error?: string }
  | { id: number; kind: "forecast"; output?: ForecastOutput; error?: string };

self.onmessage = (e: MessageEvent<WorkerRequest>) => {
  const req = e.data;
  try {
    if (req.kind === "forecast") {
      const output = runPriceForecast(req.input);
      const res: WorkerResponse = { id: req.id, kind: "forecast", output };
      (self as unknown as Worker).postMessage(res);
    } else {
      const output = runSimulation(req.input);
      const res: WorkerResponse = { id: req.id, kind: "fragility", output };
      (self as unknown as Worker).postMessage(res);
    }
  } catch (err) {
    const res: WorkerResponse = {
      id: req.id,
      kind: req.kind,
      error: (err as Error).message,
    };
    (self as unknown as Worker).postMessage(res);
  }
};
