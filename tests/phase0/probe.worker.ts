import { parseProbe, roundTripProbe } from './probe';

self.onmessage = async (event: MessageEvent<unknown>) => {
  const input = event.data;
  if (typeof input !== 'object' || input === null || !('jobId' in input) ||
      !Number.isSafeInteger(input.jobId) || !('bytes' in input) || !(input.bytes instanceof ArrayBuffer)) {
    self.postMessage({ kind: 'ERROR', code: 'INVALID_REQUEST' });
    return;
  }
  try {
    const rows = parseProbe(new Uint8Array(input.bytes));
    const result = await roundTripProbe(rows);
    self.postMessage({ kind: 'READY', jobId: input.jobId, ...result }, { transfer: [result.buffer] });
  } catch {
    self.postMessage({ kind: 'ERROR', jobId: input.jobId, code: 'PROBE_FAILED' });
  }
};
