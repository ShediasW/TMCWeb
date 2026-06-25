// Web Worker: runs the Monte Carlo off the main thread so the UI stays
// responsive on a phone while tens of thousands of paths churn.

import { runSimulation, RunInput, RunOutput } from "./engine";

export interface WorkerRequest {
  id: number;
  input: RunInput;
}
export interface WorkerResponse {
  id: number;
  output?: RunOutput;
  error?: string;
}

self.onmessage = (e: MessageEvent<WorkerRequest>) => {
  const { id, input } = e.data;
  try {
    const output = runSimulation(input);
    const res: WorkerResponse = { id, output };
    (self as unknown as Worker).postMessage(res);
  } catch (err) {
    const res: WorkerResponse = { id, error: (err as Error).message };
    (self as unknown as Worker).postMessage(res);
  }
};
