const API_BASE = 'http://127.0.0.1:57375/api';
export const WS_URL = 'ws://127.0.0.1:57375/ws';

async function fetchJSON<T>(path: string, options?: RequestInit): Promise<T> {
  const res = await fetch(`${API_BASE}${path}`, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...options?.headers,
    },
  });
  if (!res.ok) {
    const body = await res.text().catch(() => '');
    throw new Error(`API error ${res.status}: ${res.statusText}${body ? ` - ${body}` : ''}`);
  }
  return res.json();
}

export interface StartSessionRequest {
  prd: string;
  provider: string;
  projectDir?: string;
}

export interface StartSessionResponse {
  started: boolean;
  pid: number;
  projectDir: string;
  provider: string;
}

export const api = {
  // Session management
  startSession: (req: StartSessionRequest) =>
    fetchJSON<StartSessionResponse>('/session/start', {
      method: 'POST',
      body: JSON.stringify(req),
    }),

  stopSession: () =>
    fetchJSON<{ stopped: boolean; message: string }>('/session/stop', {
      method: 'POST',
    }),

  getStatus: () => fetchJSON<import('../types/api').StatusResponse>('/session/status'),
  getAgents: () => fetchJSON<import('../types/api').Agent[]>('/session/agents'),
  getLogs: (lines = 200) => fetchJSON<import('../types/api').LogEntry[]>(`/session/logs?lines=${lines}`),
  getMemorySummary: () => fetchJSON<import('../types/api').MemorySummary>('/session/memory'),
  getChecklist: () => fetchJSON<import('../types/api').ChecklistSummary>('/session/checklist'),
  getFiles: () => fetchJSON<import('../types/api').FileNode[]>('/session/files'),
  getFileContent: (path: string) =>
    fetchJSON<{ content: string }>(`/session/files/content?path=${encodeURIComponent(path)}`),

  // Templates
  getTemplates: () => fetchJSON<{ name: string; filename: string }[]>('/templates'),
  getTemplateContent: (filename: string) =>
    fetchJSON<{ name: string; content: string }>(`/templates/${encodeURIComponent(filename)}`),
};

export class PurpleLabWebSocket {
  private ws: WebSocket | null = null;
  private listeners: Map<string, Set<(data: unknown) => void>> = new Map();
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private url: string;

  constructor(url?: string) {
    this.url = url || WS_URL;
  }

  connect(): void {
    if (this.ws?.readyState === WebSocket.OPEN) return;

    this.ws = new WebSocket(this.url);

    this.ws.onopen = () => {
      this.emit('connected', { message: 'WebSocket connected' });
    };

    this.ws.onmessage = (event) => {
      try {
        const msg = JSON.parse(event.data);
        this.emit(msg.type, msg.data || msg);
      } catch {
        // ignore non-JSON messages
      }
    };

    this.ws.onclose = () => {
      this.emit('disconnected', {});
      this.scheduleReconnect();
    };

    this.ws.onerror = () => {
      this.ws?.close();
    };
  }

  private scheduleReconnect(): void {
    if (this.reconnectTimer) return;
    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null;
      this.connect();
    }, 3000);
  }

  on(type: string, callback: (data: unknown) => void): () => void {
    if (!this.listeners.has(type)) {
      this.listeners.set(type, new Set());
    }
    this.listeners.get(type)!.add(callback);
    return () => this.listeners.get(type)?.delete(callback);
  }

  private emit(type: string, data: unknown): void {
    this.listeners.get(type)?.forEach(cb => cb(data));
    this.listeners.get('*')?.forEach(cb => cb({ type, data }));
  }

  send(data: Record<string, unknown>): void {
    if (this.ws?.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify(data));
    }
  }

  disconnect(): void {
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
    this.ws?.close();
    this.ws = null;
  }
}
