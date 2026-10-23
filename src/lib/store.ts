import { create } from "zustand";
import {
  DEFAULT_STRATEGY,
  DRILL,
  START_CASH,
  decideReason,
  equityOf,
  makeCode,
  nextMark,
  normalizeStrategy,
  pnlSol,
  round3,
  scoreToken,
  sizeFor,
  type ArmorReport,
  type EquityPoint,
  type FeedMode,
  type LogEntry,
  type Position,
  type Referral,
  type Strategy,
  type TokenLaunch,
} from "@/lib/engine";

export type TabId = "desk" | "tape" | "agent" | "armor" | "crew";

type Saved = {
  cash: number;
  positions: Position[];
  logs: LogEntry[];
  equity: EquityPoint[];
  strategy: Strategy;
  referrals: Referral[];
  code: string;
  aiCache: Record<string, string>;
};

type DeskState = {
  tab: TabId;
  feed: FeedMode;
  simOnly: boolean;
  agentOn: boolean;
  cash: number;
  tokens: TokenLaunch[];
  reports: Record<string, ArmorReport>;
  logs: LogEntry[];
  positions: Position[];
  equity: EquityPoint[];
  strategy: Strategy;
  referrals: Referral[];
  code: string;
  aiCache: Record<string, string>;
  selected: string | null;
  lastLatency: number | null;
  hydrated: boolean;
  setTab: (tab: TabId) => void;
  setFeed: (feed: FeedMode) => void;
  setSimOnly: (simOnly: boolean) => void;
  toggleAgent: () => void;
  arm: () => void;
  updateStrategy: (patch: Partial<Strategy>) => void;
  ingest: (token: TokenLaunch) => void;
  tick: () => void;
  sell: (mint: string, reason: string) => void;
  resetBook: () => void;
  select: (id: string | null) => void;
  addReferral: (handle: string, volumeSol: number) => void;
  toggleReferral: (id: string) => void;
  cacheAi: (mint: string, text: string) => void;
  hydrate: (raw: unknown) => void;
  ensureEquity: () => void;
  runDrill: () => void;
};

const KEY = "shell-desk-v1";

function uid(prefix: string) {
  return `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`;
}

function pushLog(logs: LogEntry[], entry: LogEntry) {
  return [entry, ...logs].slice(0, 80);
}

function pushEquity(equity: EquityPoint[], v: number) {
  return [...equity, { t: Date.now(), v }].slice(-48);
}

export function readSaved(): Saved | null {
  if (typeof localStorage === "undefined") return null;
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return null;
    return JSON.parse(raw) as Saved;
  } catch {
    return null;
  }
}

export function writeSaved(state: DeskState) {
  const payload: Saved = {
    cash: state.cash,
    positions: state.positions,
    logs: state.logs.slice(0, 40),
    equity: state.equity.slice(-48),
    strategy: state.strategy,
    referrals: state.referrals,
    code: state.code,
    aiCache: state.aiCache,
  };
  localStorage.setItem(KEY, JSON.stringify(payload));
}

function asSaved(raw: unknown): Partial<Saved> | null {
  if (!raw || typeof raw !== "object") return null;
  return raw as Partial<Saved>;
}

export const useDesk = create<DeskState>((set, get) => ({
  tab: "desk",
  feed: "connecting",
  simOnly: false,
  agentOn: false,
  cash: START_CASH,
  tokens: [],
  reports: {},
  logs: [],
  positions: [],
  equity: [],
  strategy: DEFAULT_STRATEGY,
  referrals: [],
  code: "",
  aiCache: {},
  selected: null,
  lastLatency: null,
  hydrated: false,

  setTab: (tab) => set({ tab }),
  setFeed: (feed) => set({ feed }),
  setSimOnly: (simOnly) => set({ simOnly, feed: simOnly ? "sim" : "connecting", tokens: [], reports: {} }),
  toggleAgent: () => set((s) => ({ agentOn: !s.agentOn })),
  arm: () => set({ agentOn: true }),

  updateStrategy: (patch) =>
    set((s) => {
      const strategy = normalizeStrategy({ ...s.strategy, ...patch });
      const reports: Record<string, ArmorReport> = {};
      for (const token of s.tokens) reports[token.id] = scoreToken(token, strategy);
      return { strategy, reports };
    }),

  ingest: (token) => {
    const started = performance.now();
    set((s) => {
      if (s.tokens.some((t) => t.mint === token.mint) || s.positions.some((p) => p.mint === token.mint)) {
        return s;
      }
      const report = scoreToken(token, s.strategy);
      const latencyMs = round3(performance.now() - started);
      const tokens = [{ ...token, createdAt: token.createdAt || Date.now() }, ...s.tokens].slice(0, 40);
      const reports = { ...s.reports, [token.id]: report };
      if (!s.agentOn) {
        return { tokens, reports, lastLatency: latencyMs };
      }
      const reason = decideReason(token, report, s.strategy, s.cash);
      const size = sizeFor(s.strategy, report.overall);
      const canBuy = report.pass && s.cash >= size;
      const log: LogEntry = {
        id: uid("log"),
        ts: Date.now(),
        mint: token.mint,
        symbol: token.symbol,
        name: token.name,
        action: canBuy ? "buy" : "skip",
        reason,
        latencyMs,
        sizeSol: canBuy ? size : undefined,
      };
      if (!canBuy) {
        return { tokens, reports, logs: pushLog(s.logs, log), lastLatency: latencyMs };
      }
      const entryMcap = round3(token.marketCapSol * (1 + s.strategy.slippage / 100));
      const position: Position = {
        mint: token.mint,
        symbol: token.symbol,
        name: token.name,
        entryMcap,
        mcap: token.marketCapSol,
        sizeSol: size,
        openedAt: Date.now(),
        drift: token.drift,
        status: "open",
      };
      const cash = round3(s.cash - size);
      const positions = [position, ...s.positions].slice(0, 60);
      return {
        tokens,
        reports,
        logs: pushLog(s.logs, log),
        lastLatency: latencyMs,
        cash,
        positions,
        equity: pushEquity(s.equity, equityOf(cash, positions)),
      };
    });
  },

  tick: () => {
    const s = get();
    if (!s.positions.some((p) => p.status === "open")) return;
    set((state) => {
      let cash = state.cash;
      let logs = state.logs;
      const positions = state.positions.map((p) => {
        if (p.status !== "open") return p;
        const token = state.tokens.find((t) => t.mint === p.mint);
        const rug = token ? (state.reports[token.id]?.rug ?? 20) : 35;
        const mcap = nextMark(p, rug);
        const tp = p.entryMcap * (1 + state.strategy.takeProfit / 100);
        const sl = p.entryMcap * (1 - state.strategy.stopLoss / 100);
        const hitTp = mcap >= tp;
        const hitSl = mcap <= sl;
        if (state.strategy.autoSell && (hitTp || hitSl)) {
          const pnl = pnlSol(p.sizeSol, p.entryMcap, mcap);
          cash = round3(cash + p.sizeSol + pnl);
          logs = pushLog(logs, {
            id: uid("sell"),
            ts: Date.now(),
            mint: p.mint,
            symbol: p.symbol,
            name: p.name,
            action: "sell",
            reason: hitTp ? `take-profit ${state.strategy.takeProfit}%` : `stop-loss ${state.strategy.stopLoss}%`,
            latencyMs: 0.2,
            sizeSol: p.sizeSol,
            pnlSol: pnl,
          });
          return {
            ...p,
            mcap,
            status: "closed" as const,
            pnlSol: pnl,
            closedAt: Date.now(),
            exitReason: hitTp ? "take-profit" : "stop-loss",
          };
        }
        return { ...p, mcap };
      });
      return {
        cash,
        positions,
        logs,
        equity: pushEquity(state.equity, equityOf(cash, positions)),
      };
    });
  },

  sell: (mint, reason) =>
    set((s) => {
      const position = s.positions.find((p) => p.mint === mint && p.status === "open");
      if (!position) return s;
      const pnl = pnlSol(position.sizeSol, position.entryMcap, position.mcap);
      const cash = round3(s.cash + position.sizeSol + pnl);
      const positions = s.positions.map((p) =>
        p.mint === mint && p.status === "open"
          ? { ...p, status: "closed" as const, pnlSol: pnl, closedAt: Date.now(), exitReason: reason }
          : p,
      );
      return {
        cash,
        positions,
        logs: pushLog(s.logs, {
          id: uid("sell"),
          ts: Date.now(),
          mint,
          symbol: position.symbol,
          name: position.name,
          action: "sell",
          reason,
          latencyMs: 0.2,
          sizeSol: position.sizeSol,
          pnlSol: pnl,
        }),
        equity: pushEquity(s.equity, equityOf(cash, positions)),
      };
    }),

  resetBook: () =>
    set((s) => ({
      cash: START_CASH,
      positions: [],
      logs: [],
      equity: [{ t: Date.now(), v: START_CASH }],
      tokens: [],
      reports: {},
      agentOn: false,
      lastLatency: null,
      selected: null,
      strategy: s.strategy,
    })),

  select: (id) => set({ selected: id }),

  addReferral: (handle, volumeSol) =>
    set((s) => ({
      referrals: [
        {
          id: uid("ref"),
          handle: handle.replace(/^@/, "").slice(0, 24),
          active: true,
          volumeSol: round3(Math.max(0, volumeSol)),
          joinedAt: Date.now(),
        },
        ...s.referrals,
      ].slice(0, 40),
    })),

  toggleReferral: (id) =>
    set((s) => ({
      referrals: s.referrals.map((r) => (r.id === id ? { ...r, active: !r.active } : r)),
    })),

  cacheAi: (mint, text) => set((s) => ({ aiCache: { ...s.aiCache, [mint]: text } })),

  hydrate: (raw) => {
    const saved = asSaved(raw);
    if (!saved) {
      set({ hydrated: true, code: makeCode(), equity: [{ t: Date.now(), v: START_CASH }] });
      return;
    }
    const strategy = saved.strategy ? normalizeStrategy({ ...DEFAULT_STRATEGY, ...saved.strategy }) : DEFAULT_STRATEGY;
    const cash = typeof saved.cash === "number" ? saved.cash : START_CASH;
    const positions = Array.isArray(saved.positions) ? saved.positions : [];
    const equity = Array.isArray(saved.equity) && saved.equity.length ? saved.equity : [{ t: Date.now(), v: cash }];
    set({
      hydrated: true,
      agentOn: false,
      cash,
      positions,
      logs: Array.isArray(saved.logs) ? saved.logs : [],
      equity,
      strategy,
      referrals: Array.isArray(saved.referrals) ? saved.referrals : [],
      code: typeof saved.code === "string" && saved.code ? saved.code : makeCode(),
      aiCache: saved.aiCache && typeof saved.aiCache === "object" ? saved.aiCache : {},
    });
  },

  ensureEquity: () => {
    const s = get();
    if (!s.code) set({ code: makeCode() });
    if (!s.equity.length) set({ equity: [{ t: Date.now(), v: equityOf(s.cash, s.positions) }] });
  },

  runDrill: () => {
    set({ agentOn: true, tab: "agent" });
    const stamp = Math.random().toString(36).slice(2, 8);
    DRILL.forEach((token, index) => {
      window.setTimeout(() => {
        get().ingest({
          ...token,
          mint: `${stamp}${token.symbol}${index}`.padEnd(32, "X").slice(0, 44),
          id: `${token.id}-${stamp}`,
          createdAt: Date.now(),
        });
      }, 320 * index);
    });
  },
}));

export function selectedToken(state: DeskState) {
  if (!state.selected) return null;
  return state.tokens.find((t) => t.id === state.selected) ?? null;
}
