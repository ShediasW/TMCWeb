import { run } from "./engine";

// Web Worker entry point — receives RunInput, posts RunOutput
self.addEventListener("message", (e: MessageEvent) => {
  const result = run(e.data);
  self.postMessage(result);
});
