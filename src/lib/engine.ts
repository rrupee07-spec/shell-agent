export type FeedMode = "connecting" | "live" | "sim";
export type TokenSource = "live" | "sim" | "drill";

export type TokenLaunch = {
  id: string;
  mint: string;
  name: string;
  symbol: string;
  createdAt: number;
  marketCapSol: number;
  liquiditySol: number;
  initialBuySol: number;
  devHoldPct: number;
  mintAuthority: boolean;
  freezeAuthority: boolean;
  bundledBuys: number;
  source: TokenSource;
  estimated: boolean;
  drift: number;
};

export type ArmorReport = {
  rug: number;
  honeypot: number;
  scam: number;
  liquidity: number;
  overall: number;
  flags: string[];
  pass: boolean;
};

export type Strategy = {
  minSol: number;
  maxSol: number;
  slippage: number;
  takeProfit: number;
  stopLoss: number;
  maxDevHold: number;
  autoSell: boolean;
  armorRug: boolean;
  armorHoneypot: boolean;
  armorScam: boolean;
  armorLiquidity: boolean;
  minSafety: number;
};

export type Position = {
  mint: string;
  symbol: string;
  name: string;
  entryMcap: number;
  mcap: number;
  sizeSol: number;
  openedAt: number;
  drift: number;
  status: "open" | "closed";
  pnlSol?: number;
  closedAt?: number;
  exitReason?: string;
};

export type LogEntry = {
  id: string;
  ts: number;
  mint: string;
  symbol: string;
  name: string;
  action: "buy" | "skip" | "sell";
  reason: string;
  latencyMs: number;
  sizeSol?: number;
  pnlSol?: number;
};

export type Referral = {
  id: string;
  handle: string;
  active: boolean;
  volumeSol: number;
  joinedAt: number;
};

export type EquityPoint = { t: number; v: number };

export const START_CASH = 5;

export const DEFAULT_STRATEGY: Strategy = {
  minSol: 0.05,
  maxSol: 0.35,
  slippage: 12,
  takeProfit: 40,
  stopLoss: 25,
  maxDevHold: 18,
  autoSell: true,
  armorRug: true,
  armorHoneypot: true,
  armorScam: true,
  armorLiquidity: true,
  minSafety: 62,
};

const SCAM_WORDS = [
  "airdrop",
  "elon",
  "100x",
  "1000x",
  "free",
  "giveaway",
  "official",
  "binance",
  "whitelist",
  "guaranteed",
];

export function clamp(n: number, lo = 0, hi = 100) {
  return Math.max(lo, Math.min(hi, n));
}

export function round3(n: number) {
  return Math.round(n * 1000) / 1000;
}

export function hash32(s: string) {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

export function shortMint(mint: string) {
  if (mint.length < 10) return mint;
  return `${mint.slice(0, 4)}…${mint.slice(-4)}`;
}

export function clock(ts: number) {
  const d = new Date(ts);
  const p = (n: number) => String(n).padStart(2, "0");
  return `${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}`;
}

export function solText(n: number, digits = 3) {
  const sign = n < 0 ? "−" : "";
  return `${sign}${Math.abs(n).toFixed(digits)}`;
}

export function normalizeStrategy(s: Strategy): Strategy {
  const minSol = clamp(s.minSol, 0.01, 1);
  let maxSol = clamp(s.maxSol, 0.02, 2);
  if (maxSol < minSol) maxSol = minSol;
  return {
    ...s,
    minSol: round3(minSol),
    maxSol: round3(maxSol),
    slippage: Math.round(clamp(s.slippage, 1, 40)),
    takeProfit: Math.round(clamp(s.takeProfit, 10, 400)),
    stopLoss: Math.round(clamp(s.stopLoss, 5, 90)),
    maxDevHold: Math.round(clamp(s.maxDevHold, 1, 60)),
    minSafety: Math.round(clamp(s.minSafety, 30, 95)),
  };
}

export function scoreToken(t: TokenLaunch, strategy: Strategy): ArmorReport {
  const flags: string[] = [];
  const blob = `${t.name} ${t.symbol}`.toLowerCase();
  const hits = SCAM_WORDS.filter((w) => blob.includes(w));
  let scam = hits.length * 34;
  if (t.symbol.length <= 1) scam += 20;
  if (hits.length) flags.push(`lexicon: ${hits.join(", ")}`);

  let honeypot = 0;
  if (t.freezeAuthority) {
    honeypot += 58;
    flags.push("freeze authority set");
  }
  if (t.mintAuthority) {
    honeypot += 22;
    flags.push("mint authority live");
  }
  if (t.bundledBuys >= 4) {
    honeypot += 18;
    flags.push(`${t.bundledBuys} bundled first buys`);
  }

  let rug = 0;
  if (t.devHoldPct > strategy.maxDevHold) {
    rug += 42 + (t.devHoldPct - strategy.maxDevHold);
    flags.push(`dev ${t.devHoldPct.toFixed(0)}% over ${strategy.maxDevHold}% cap`);
  } else if (t.devHoldPct > 22) {
    rug += 24;
    flags.push(`dev concentration ${t.devHoldPct.toFixed(0)}%`);
  }
  if (t.initialBuySol < 0.08 && t.marketCapSol > 45) {
    rug += 16;
    flags.push("thin creator buy");
  }

  let liquidity = 100;
  if (t.liquiditySol < 8) {
    liquidity = 28;
    flags.push(`curve ${t.liquiditySol.toFixed(1)} SOL`);
  } else if (t.liquiditySol < 18) {
    liquidity = 64;
    flags.push(`curve ${t.liquiditySol.toFixed(1)} SOL`);
  } else {
    flags.push(`curve ${t.liquiditySol.toFixed(1)} SOL`);
  }

  const risk =
    (strategy.armorScam ? clamp(scam) : 0) * 0.3 +
    (strategy.armorHoneypot ? clamp(honeypot) : 0) * 0.3 +
    (strategy.armorRug ? clamp(rug) : 0) * 0.26 +
    (strategy.armorLiquidity ? 100 - liquidity : 0) * 0.14;

  const overall = Math.round(clamp(100 - risk));
  const pass =
    overall >= strategy.minSafety &&
    !(strategy.armorRug && t.devHoldPct > strategy.maxDevHold) &&
    !(strategy.armorHoneypot && t.freezeAuthority) &&
    !(strategy.armorScam && scam >= 50) &&
    !(strategy.armorLiquidity && t.liquiditySol < 8);

  if (pass && flags.length === 1) flags.unshift("armor clear");

  return {
    rug: Math.round(clamp(rug)),
    honeypot: Math.round(clamp(honeypot)),
    scam: Math.round(clamp(scam)),
    liquidity,
    overall,
    flags: flags.slice(0, 5),
    pass,
  };
}

export function sizeFor(strategy: Strategy, safety: number) {
  const span = strategy.maxSol - strategy.minSol;
  return round3(strategy.minSol + span * (safety / 100));
}

export function pnlSol(size: number, entry: number, mark: number) {
  if (entry <= 0) return 0;
  return round3(Math.max(-size, size * (mark / entry - 1)));
}

export function equityOf(cash: number, positions: Position[]) {
  const open = positions
    .filter((p) => p.status === "open")
    .reduce((sum, p) => sum + p.sizeSol + pnlSol(p.sizeSol, p.entryMcap, p.mcap), 0);
  return round3(cash + open);
}

export function decideReason(t: TokenLaunch, report: ArmorReport, strategy: Strategy, cash: number) {
  if (!report.pass) {
    const lead =
      report.flags.find((f) => f.startsWith("dev ")) ||
      report.flags.find((f) => f.includes("freeze")) ||
      report.flags.find((f) => f.startsWith("lexicon")) ||
      report.flags.find((f) => f.includes("bundled")) ||
      report.flags.find((f) => !f.startsWith("curve") && f !== "armor clear");
    return lead ?? `safety ${report.overall} under ${strategy.minSafety}`;
  }
  const size = sizeFor(strategy, report.overall);
  if (cash < size) return "paper SOL below size";
  return `safety ${report.overall} · size ${size.toFixed(3)} SOL · slip ${strategy.slippage}%`;
}

export function latencyText(ms: number) {
  if (ms < 0.05) return "<1 ms";
  return `${ms.toFixed(2)} ms`;
}

const CLEAN: Array<[string, string]> = [
  ["Kelp", "KELP"],
  ["Nightjar", "NJAR"],
  ["Moss Cat", "MOSS"],
  ["River Glass", "RGLS"],
  ["Copper Ant", "CANT"],
  ["Orbit Moth", "MOTH"],
  ["Salt Lamp", "SALT"],
  ["Paper Crane", "CRNE"],
  ["Low Tide", "TIDE"],
  ["Quiet Fox", "QFOX"],
  ["Lemon Rail", "RAIL"],
  ["Brick Oven", "BRCK"],
];

const LOUD: Array<[string, string]> = [
  ["ELON100X", "E100X"],
  ["Free Airdrop", "FREE"],
  ["Official Giveaway", "OFFCL"],
  ["Binance Pump", "BNCE"],
  ["1000x Moon", "1000X"],
  ["Guaranteed Whitelist", "GWL"],
];

function fakeMint() {
  const alphabet = "123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz";
  let s = "";
  for (let i = 0; i < 44; i++) s += alphabet[Math.floor(Math.random() * alphabet.length)];
  return s;
}

function roll(lo: number, hi: number) {
  return lo + Math.random() * (hi - lo);
}

export function makeSimToken(): TokenLaunch {
  const loud = Math.random() < 0.38;
  const pair = (loud ? LOUD : CLEAN)[Math.floor(Math.random() * (loud ? LOUD.length : CLEAN.length))]!;
  const mint = fakeMint();
  const honeypot = loud && Math.random() < 0.55;
  return {
    id: mint,
    mint,
    name: pair[0],
    symbol: pair[1],
    createdAt: Date.now(),
    marketCapSol: round3(roll(loud ? 18 : 22, loud ? 70 : 48)),
    liquiditySol: round3(loud ? roll(2, 12) : roll(16, 42)),
    initialBuySol: round3(loud ? roll(0.01, 0.2) : roll(0.2, 1.4)),
    devHoldPct: Math.round(loud ? roll(22, 68) : roll(4, 16)),
    mintAuthority: loud && Math.random() < 0.4,
    freezeAuthority: honeypot,
    bundledBuys: loud ? Math.floor(roll(2, 7)) : Math.floor(roll(0, 3)),
    source: "sim",
    estimated: false,
    drift: loud ? -0.03 : 0.012,
  };
}

export function mapLive(raw: Record<string, unknown>): TokenLaunch | null {
  if (raw.txType && raw.txType !== "create") return null;
  const mint = typeof raw.mint === "string" ? raw.mint : "";
  if (mint.length < 20) return null;
  const name = String(raw.name ?? "Unnamed").slice(0, 32);
  const symbol = String(raw.symbol ?? "???").replace(/\s/g, "").slice(0, 10) || "???";
  const h = hash32(mint);
  const marketCapSol = numberish(raw.marketCapSol) || 28;
  const liquiditySol = numberish(raw.vSolInBondingCurve) || marketCapSol * 0.8;
  const initialBuySol = numberish(raw.solAmount) || 0;
  return {
    id: `${mint}-${String(raw.signature ?? "create")}`,
    mint,
    name,
    symbol,
    createdAt: Date.now(),
    marketCapSol: round3(marketCapSol),
    liquiditySol: round3(liquiditySol),
    initialBuySol: round3(initialBuySol),
    devHoldPct: 4 + (h % 46),
    mintAuthority: (h & 16) === 0,
    freezeAuthority: h % 11 === 0,
    bundledBuys: h % 6,
    source: "live",
    estimated: true,
    drift: 0,
  };
}

function numberish(v: unknown) {
  const n = typeof v === "number" ? v : typeof v === "string" ? Number(v) : NaN;
  return Number.isFinite(n) ? n : 0;
}

export const DRILL: TokenLaunch[] = [
  {
    id: "drill-kelp",
    mint: "Ke1pDrillMint1111111111111111111111111111111",
    name: "Kelp",
    symbol: "KELP",
    createdAt: 0,
    marketCapSol: 31.4,
    liquiditySol: 26,
    initialBuySol: 0.8,
    devHoldPct: 7,
    mintAuthority: false,
    freezeAuthority: false,
    bundledBuys: 1,
    source: "drill",
    estimated: false,
    drift: 0.1,
  },
  {
    id: "drill-elon",
    mint: "E10nDrillMint1111111111111111111111111111111",
    name: "ELON100X",
    symbol: "E100X",
    createdAt: 0,
    marketCapSol: 54,
    liquiditySol: 6.2,
    initialBuySol: 0.04,
    devHoldPct: 33,
    mintAuthority: true,
    freezeAuthority: false,
    bundledBuys: 5,
    source: "drill",
    estimated: false,
    drift: -0.08,
  },
  {
    id: "drill-fox",
    mint: "Qf0xDrillMint1111111111111111111111111111111",
    name: "Quiet Fox",
    symbol: "QFOX",
    createdAt: 0,
    marketCapSol: 28.2,
    liquiditySol: 22,
    initialBuySol: 0.55,
    devHoldPct: 9,
    mintAuthority: false,
    freezeAuthority: false,
    bundledBuys: 0,
    source: "drill",
    estimated: false,
    drift: 0.045,
  },
  {
    id: "drill-lock",
    mint: "LockDrillMint1111111111111111111111111111111",
    name: "Velvet Lock",
    symbol: "LOCK",
    createdAt: 0,
    marketCapSol: 36,
    liquiditySol: 19,
    initialBuySol: 0.4,
    devHoldPct: 11,
    mintAuthority: false,
    freezeAuthority: true,
    bundledBuys: 2,
    source: "drill",
    estimated: false,
    drift: -0.02,
  },
  {
    id: "drill-dev",
    mint: "DevvDrillMint1111111111111111111111111111111",
    name: "Heavy Dev",
    symbol: "HDEV",
    createdAt: 0,
    marketCapSol: 41,
    liquiditySol: 21,
    initialBuySol: 1.2,
    devHoldPct: 58,
    mintAuthority: true,
    freezeAuthority: false,
    bundledBuys: 3,
    source: "drill",
    estimated: false,
    drift: -0.05,
  },
  {
    id: "drill-rail",
    mint: "Rai1DrillMint1111111111111111111111111111111",
    name: "Lemon Rail",
    symbol: "RAIL",
    createdAt: 0,
    marketCapSol: 24.6,
    liquiditySol: 30,
    initialBuySol: 0.9,
    devHoldPct: 6,
    mintAuthority: false,
    freezeAuthority: false,
    bundledBuys: 1,
    source: "drill",
    estimated: false,
    drift: 0.07,
  },
];

export const TIERS = [
  { name: "Scout", min: 0, cut: 15 },
  { name: "Relay", min: 3, cut: 22 },
  { name: "Captain", min: 8, cut: 28 },
  { name: "Architect", min: 15, cut: 35 },
] as const;

export function tierFor(active: number) {
  let current: (typeof TIERS)[number] = TIERS[0];
  for (const tier of TIERS) {
    if (active >= tier.min) current = tier;
  }
  const next = TIERS.find((tier) => tier.min > active) ?? null;
  return { current, next };
}

export function makeCode() {
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let s = "SHL-";
  for (let i = 0; i < 5; i++) s += alphabet[Math.floor(Math.random() * alphabet.length)];
  return s;
}

export function nextMark(p: Position, rug: number) {
  const shock = (Math.random() - 0.46) * 0.07;
  const cliff = rug > 68 && Math.random() < 0.07;
  const mult = cliff ? 0.42 : 1 + p.drift + shock;
  return round3(Math.max(0.4, p.mcap * mult));
}
