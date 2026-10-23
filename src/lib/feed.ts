import { makeSimToken, mapLive, type FeedMode, type TokenLaunch } from "@/lib/engine";

export function startFeed(opts: {
  simOnly: boolean;
  onMode: (mode: FeedMode) => void;
  onToken: (token: TokenLaunch) => void;
}) {
  let stopped = false;
  let simTimer = 0;
  let simOn = false;
  let burstWindow = 0;
  let burst = 0;
  let ws: WebSocket | null = null;

  const emit = (token: TokenLaunch) => {
    const now = Date.now();
    if (now - burstWindow > 1000) {
      burstWindow = now;
      burst = 0;
    }
    burst += 1;
    if (burst > 6) return;
    opts.onToken(token);
  };

  const armSim = () => {
    if (stopped || simOn) return;
    simOn = true;
    opts.onMode("sim");
    const loop = () => {
      if (stopped) return;
      emit(makeSimToken());
      simTimer = window.setTimeout(loop, 1600 + Math.random() * 2400);
    };
    emit(makeSimToken());
    simTimer = window.setTimeout(loop, 1200);
  };

  const stop = () => {
    stopped = true;
    window.clearTimeout(simTimer);
    try {
      ws?.close();
    } catch {
      /* ignore */
    }
  };

  if (opts.simOnly) {
    armSim();
    return stop;
  }

  opts.onMode("connecting");
  const giveUp = window.setTimeout(() => {
    try {
      ws?.close();
    } catch {
      /* ignore */
    }
    armSim();
  }, 2500);

  try {
    ws = new WebSocket("wss://pumpportal.fun/api/data");
  } catch {
    window.clearTimeout(giveUp);
    armSim();
    return stop;
  }

  ws.onopen = () => {
    ws?.send(JSON.stringify({ method: "subscribeNewToken" }));
  };

  ws.onmessage = (ev) => {
    if (stopped || typeof ev.data !== "string") return;
    let raw: unknown;
    try {
      raw = JSON.parse(ev.data);
    } catch {
      return;
    }
    if (!raw || typeof raw !== "object") return;
    const token = mapLive(raw as Record<string, unknown>);
    if (!token) return;
    if (!simOn) {
      window.clearTimeout(giveUp);
      opts.onMode("live");
    }
    emit(token);
  };

  ws.onerror = () => {
    window.clearTimeout(giveUp);
    try {
      ws?.close();
    } catch {
      /* ignore */
    }
    armSim();
  };

  ws.onclose = () => {
    window.clearTimeout(giveUp);
    if (!stopped) armSim();
  };

  return stop;
}
