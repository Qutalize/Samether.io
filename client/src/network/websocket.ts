import type { ClientMsg, ServerMsg } from "./protocol";

export class NetClient {
  private ws: WebSocket | null = null;
  private handlers: Array<(m: ServerMsg) => void> = [];

  connect(): Promise<void> {
    return new Promise((resolve, reject) => {
      const proto = location.protocol === "https:" ? "wss:" : "ws:";
      const url = `${proto}//${location.host}/ws`;
      const ws = new WebSocket(url);
      ws.onopen = () => {
        this.ws = ws;
        resolve();
      };
      ws.onerror = (e) => reject(e);
      ws.onmessage = (ev) => {
        try {
          const msg = JSON.parse(ev.data) as ServerMsg;
          for (const h of this.handlers) h(msg);
        } catch {
          /* ignore malformed */
        }
      };
      ws.onclose = () => {
        this.ws = null;
      };
    });
  }

  send(msg: ClientMsg): void {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) return;
    this.ws.send(JSON.stringify(msg));
  }

  onMessage(h: (m: ServerMsg) => void): void {
    this.handlers.push(h);
  }

  isOpen(): boolean {
    return this.ws !== null && this.ws.readyState === WebSocket.OPEN;
  }
}

// Singleton — one socket per app.
export const net = new NetClient();
