// Blank technical harness; no product UI or real-file selection.
let nextJob = 0;
// Keep the loaded worker alive so offline processing does not require a new
// script request. This harness runs sequential jobs only.
const worker = new Worker(new URL('./probe.worker.ts', import.meta.url), { type: 'module' });

export function runProbe(bytes: Uint8Array): Promise<unknown> {
  const jobId = ++nextJob;
  const buffer = new ArrayBuffer(bytes.byteLength);
  new Uint8Array(buffer).set(bytes);
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => { worker.terminate(); reject(new Error('PROBE_TIMEOUT')); }, 120_000);
    worker.onmessage = (event: MessageEvent<unknown>) => {
      clearTimeout(timer);
      resolve(event.data);
    };
    worker.onerror = () => {
      clearTimeout(timer);
      worker.terminate();
      reject(new Error('WORKER_FAILED'));
    };
    worker.postMessage({ jobId, bytes: buffer }, [buffer]);
    if (buffer.byteLength !== 0) reject(new Error('TRANSFER_FAILED'));
  });
}

Object.assign(window, { runProbe });
