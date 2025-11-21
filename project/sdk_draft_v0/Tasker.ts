import type { NetMonitorReturnType } from './NetworkUtils';

const MAX_WORKERS = Math.min(2, navigator.hardwareConcurrency || 1);

export class Tasker {
  private _netMonitor: NetMonitorReturnType;
  private _endpoint: string;
  private _authToken: string;

  private _workers: Worker[];
  private _connected: boolean;
  constructor(netMonitor: NetMonitorReturnType, endpoint: string, authToken: string) {
    this._netMonitor = netMonitor;
    this._connected = this._netMonitor.isOnline();
    this._netMonitor.onChange(online => {
      this._connected = online;
    });

    this._endpoint = endpoint;
    this._authToken = authToken;
    this._workers = new Array(MAX_WORKERS).fill(null);
    this._initWorkers();
  }

  destroy() {
    this._connected = false;
    this._netMonitor.destroy();
  }

  private _initWorkers() {
    for (let i = 0; i < MAX_WORKERS; i++) {
      const worker = new Worker(new URL('./TaskerWorker.ts', import.meta.url), {
        type: 'module',
      });
      worker.onmessage = e => this._handleWorkerMessage(i, e);
      worker.onerror = e => this._handleWorkerError(i, e);
      worker.postMessage({
        type: 'init',
        endpoint: this._endpoint,
        authToken: this._authToken,
      });
      this._workers[i] = worker;
    }
  }

  private _handleWorkerMessage(workerIndex: number, event: MessageEvent) {
    console.log(`Worker ${workerIndex} message:`, event.data, ' connected:', this._connected);
  }

  private _handleWorkerError(workerIndex: number, event: ErrorEvent) {
    console.error(`Worker ${workerIndex} error:`, event);
    this._workers[workerIndex]?.terminate();
    const newWorker = new Worker(new URL('./TaskerWorker.ts', import.meta.url), {
      type: 'module',
    });

    newWorker.onmessage = e => this._handleWorkerMessage(workerIndex, e);
    newWorker.onerror = e => this._handleWorkerError(workerIndex, e);
    this._workers[workerIndex] = newWorker;
    newWorker.postMessage({
      type: 'init',
      endpoint: this._endpoint,
      authToken: this._authToken,
    });
  }
}
