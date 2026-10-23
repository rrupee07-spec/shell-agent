import { useServerFn } from "@tanstack/react-start";
import { Bot, Check, Copy, LayoutDashboard, Radio, Shield, Users } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { Area, AreaChart, ResponsiveContainer, YAxis } from "recharts";
import { analyzeToken } from "@/lib/analyze";
import {
  START_CASH,
  TIERS,
  clock,
  equityOf,
  latencyText,
  pnlSol,
  shortMint,
  solText,
  tierFor,
  type LogEntry,
  type TokenLaunch,
} from "@/lib/engine";
import { startFeed } from "@/lib/feed";
import { selectedToken, useDesk, writeSaved, type TabId } from "@/lib/store";

const TABS: { id: TabId; label: string; icon: typeof Radio }[] = [
  { id: "desk", label: "Desk", icon: LayoutDashboard },
  { id: "tape", label: "Tape", icon: Radio },
  { id: "agent", label: "Agent", icon: Bot },
  { id: "armor", label: "Armor", icon: Shield },
  { id: "crew", label: "Crew", icon: Users },
];

export function DeskApp() {
  const tab = useDesk((s) => s.tab);
  const simOnly = useDesk((s) => s.simOnly);
  const ingest = useDesk((s) => s.ingest);
  const setFeed = useDesk((s) => s.setFeed);
  const selected = useDesk((s) => s.selected);

  useEffect(() => {
    return useDesk.subscribe((state) => {
      if (state.hydrated) writeSaved(state);
    });
  }, []);

  useEffect(() => {
    return startFeed({ simOnly, onMode: setFeed, onToken: ingest });
  }, [simOnly, setFeed, ingest]);

  useEffect(() => {
    const id = window.setInterval(() => useDesk.getState().tick(), 900);
    return () => window.clearInterval(id);
  }, []);

  const panel = tab === "tape" ? "desk" : tab;

  return (
    <div className="min-h-dvh overflow-x-hidden bg-bg text-fg">
      <div className="mx-auto min-h-dvh w-full max-w-md pb-36 lg:max-w-5xl lg:px-6">
        <Header />
        <div className="lg:grid lg:grid-cols-2 lg:items-start lg:gap-6">
          <div className={tab === "tape" ? "block" : "hidden lg:block"}>
            <Tape />
          </div>
          <div className={tab === "tape" ? "hidden lg:block" : "block"}>
            {panel === "desk" ? <Desk /> : null}
            {panel === "agent" ? <Agent /> : null}
            {panel === "armor" ? <Armor /> : null}
            {panel === "crew" ? <Crew /> : null}
          </div>
        </div>
      </div>
      <Nav />
      {selected ? <TokenSheet /> : null}
    </div>
  );
}

function Header() {
  const agentOn = useDesk((s) => s.agentOn);
  const toggleAgent = useDesk((s) => s.toggleAgent);
  const feed = useDesk((s) => s.feed);
  const lastLatency = useDesk((s) => s.lastLatency);
  const feedLabel = feed === "live" ? "PumpPortal" : feed === "sim" ? "Sim tape" : "Linking";

  return (
    <header className="safe-top px-4 pb-3 lg:px-0">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h1 className="font-display text-4xl italic leading-none tracking-tight">Shell</h1>
          <p className="mt-2 text-xs text-muted">Paper desk · v2.4 · no keys</p>
        </div>
        <button
          type="button"
          onClick={toggleAgent}
          aria-pressed={agentOn}
          className={`min-h-11 rounded-full px-4 text-sm font-medium ${
            agentOn ? "bg-lime text-lime-ink" : "bg-surface-2 text-fg"
          }`}
        >
          {agentOn ? "Armed" : "Arm"}
        </button>
      </div>
      <div className="mt-3 flex items-center gap-3 text-xs text-muted">
        <span className="inline-flex items-center gap-2">
          <span className={`size-2 rounded-full ${feed === "connecting" ? "bg-muted" : "bg-lime pulse-dot"}`} />
          {feedLabel}
        </span>
        <span className="tabular-nums">
          {lastLatency == null ? "eval —" : `eval ${latencyText(lastLatency)}`}
        </span>
      </div>
    </header>
  );
}

function Nav() {
  const tab = useDesk((s) => s.tab);
  const setTab = useDesk((s) => s.setTab);
  return (
    <nav className="nav-pad fixed inset-x-0 bottom-0 z-30 border-t border-line bg-bg/95">
      <div className="mx-auto flex max-w-md lg:max-w-5xl">
        {TABS.map((item) => {
          const Icon = item.icon;
          const on = tab === item.id;
          return (
            <button
              key={item.id}
              type="button"
              onClick={() => {
                setTab(item.id);
                window.scrollTo({ top: 0 });
              }}
              className={`flex min-h-14 flex-1 flex-col items-center justify-center gap-1 text-xs ${
                on ? "text-lime" : "text-muted"
              }`}
            >
              <Icon size={18} strokeWidth={1.75} aria-hidden />
              {item.label}
            </button>
          );
        })}
      </div>
    </nav>
  );
}

function Desk() {
  const cash = useDesk((s) => s.cash);
  const positions = useDesk((s) => s.positions);
  const equitySeries = useDesk((s) => s.equity);
  const logs = useDesk((s) => s.logs);
  const runDrill = useDesk((s) => s.runDrill);
  const resetBook = useDesk((s) => s.resetBook);
  const [confirm, setConfirm] = useState(false);

  const equity = equityOf(cash, positions);
  const closed = positions.filter((p) => p.status === "closed");
  const realized = closed.reduce((sum, p) => sum + (p.pnlSol ?? 0), 0);
  const unrealized = positions
    .filter((p) => p.status === "open")
    .reduce((sum, p) => sum + pnlSol(p.sizeSol, p.entryMcap, p.mcap), 0);
  const wins = closed.filter((p) => (p.pnlSol ?? 0) > 0).length;
  const open = positions.filter((p) => p.status === "open").length;
  const delta = equity - (equitySeries[0]?.v ?? START_CASH);

  return (
    <section className="px-4 lg:px-0">
      <p className="text-xs uppercase tracking-widest text-muted">Paper equity</p>
      <p className="font-display mt-1 text-5xl italic leading-none tabular-nums">{solText(equity)}</p>
      <p className={`mt-2 text-sm tabular-nums ${delta >= 0 ? "text-lime" : "text-heat"}`}>
        {delta >= 0 ? "+" : "−"}
        {Math.abs(delta).toFixed(3)} SOL from session start
      </p>
      <div className="mt-4 grid grid-cols-2 gap-2">
        <Stat label="Realized" value={`${solText(realized)} SOL`} tone={realized >= 0 ? "lime" : "heat"} />
        <Stat label="Unrealized" value={`${solText(unrealized)} SOL`} tone={unrealized >= 0 ? "lime" : "heat"} />
        <Stat label="Win rate" value={closed.length ? `${Math.round((wins / closed.length) * 100)}%` : "—"} />
        <Stat label="Open" value={String(open)} />
      </div>
      <EquityChart />
      <div className="mt-4 flex gap-2">
        <button
          type="button"
          onClick={runDrill}
          className="min-h-11 flex-1 rounded-full bg-lime px-4 text-sm font-medium text-lime-ink"
        >
          Run drill
        </button>
        <button
          type="button"
          onClick={() => {
            if (!confirm) {
              setConfirm(true);
              return;
            }
            resetBook();
            setConfirm(false);
          }}
          className="min-h-11 rounded-full bg-surface-2 px-4 text-sm text-fg"
        >
          {confirm ? "Confirm reset" : "Reset book"}
        </button>
      </div>
      <p className="mt-3 text-xs text-muted">
        Drill arms the agent and feeds six launches through Shell Armor. Nothing is signed.
      </p>
      <h2 className="mt-6 text-xs uppercase tracking-widest text-muted">Latest decisions</h2>
      <LogList logs={logs.slice(0, 4)} empty="Arm the agent or run a drill. Buys and skips land here." />
    </section>
  );
}

function Stat({ label, value, tone }: { label: string; value: string; tone?: "lime" | "heat" }) {
  return (
    <div className="card px-3 py-3">
      <p className="text-xs text-muted">{label}</p>
      <p className={`mt-1 text-sm tabular-nums ${tone === "lime" ? "text-lime" : tone === "heat" ? "text-heat" : "text-fg"}`}>
        {value}
      </p>
    </div>
  );
}

function EquityChart() {
  const equity = useDesk((s) => s.equity);
  const [ready, setReady] = useState(false);
  useEffect(() => setReady(true), []);
  const points = (equity.length ? equity : [{ t: 0, v: START_CASH }]).map((point, index) => ({
    i: index,
    v: point.v,
  }));
  const up = points[points.length - 1]!.v >= points[0]!.v;
  const color = up ? "var(--color-lime)" : "var(--color-heat)";

  return (
    <div className="card mt-2 px-3 py-3">
      <p className="text-xs text-muted">Equity</p>
      <div className="mt-2 h-24 w-full">
        {ready ? (
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={points} margin={{ top: 8, right: 0, left: 0, bottom: 0 }}>
              <YAxis hide domain={["auto", "auto"]} />
              <Area type="monotone" dataKey="v" stroke={color} fill={color} fillOpacity={0.16} strokeWidth={2} dot={false} />
            </AreaChart>
          </ResponsiveContainer>
        ) : null}
      </div>
    </div>
  );
}

function Tape() {
  const tokens = useDesk((s) => s.tokens);
  const reports = useDesk((s) => s.reports);
  const simOnly = useDesk((s) => s.simOnly);
  const setSimOnly = useDesk((s) => s.setSimOnly);
  const select = useDesk((s) => s.select);
  const feed = useDesk((s) => s.feed);

  return (
    <section className="px-4 lg:px-0">
      <div className="mb-2 flex items-center justify-between gap-3">
        <h2 className="text-xs uppercase tracking-widest text-muted">Launches</h2>
        <div className="flex rounded-full bg-surface-2 p-1">
          <ModeButton on={!simOnly} label="Live" onClick={() => setSimOnly(false)} />
          <ModeButton on={simOnly} label="Sim" onClick={() => setSimOnly(true)} />
        </div>
      </div>
      {tokens.length === 0 ? (
        <p className="card px-4 py-6 text-sm text-muted">
          {feed === "connecting" ? "Linking to PumpPortal for new mints." : "Waiting for the next launch."}
        </p>
      ) : (
        <ul>
          {tokens.map((token) => {
            const report = reports[token.id];
            const pass = report?.pass ?? false;
            return (
              <li key={token.id}>
                <button
                  type="button"
                  onClick={() => select(token.id)}
                  className="tape-in flex w-full items-center gap-3 border-b border-line py-3 text-left"
                >
                  <span
                    className={`grid size-11 shrink-0 place-items-center rounded-xl text-xs font-medium ${
                      pass ? "bg-lime text-lime-ink" : "bg-surface-2 text-muted"
                    }`}
                  >
                    {token.symbol.slice(0, 4)}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="flex items-baseline justify-between gap-2">
                      <span className="truncate text-sm">{token.name}</span>
                      <span className="shrink-0 text-sm tabular-nums">{token.marketCapSol.toFixed(1)}</span>
                    </span>
                    <span className="mt-1 flex items-center gap-2 text-xs text-muted">
                      <span className="w-12 shrink-0 truncate">{token.symbol}</span>
                      <span className="h-1.5 flex-1 rounded-full bg-surface-2">
                        <span
                          className={`block h-full rounded-full ${pass ? "bg-lime" : "bg-heat"}`}
                          style={{ width: `${report?.overall ?? 0}%` }}
                        />
                      </span>
                      <span className={`w-8 shrink-0 text-right tabular-nums ${pass ? "text-lime" : "text-heat"}`}>
                        {report?.overall ?? "—"}
                      </span>
                    </span>
                  </span>
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}

function ModeButton({ on, label, onClick }: { on: boolean; label: string; onClick: () => void }) {
  return (
    <button
      type="button"
      aria-pressed={on}
      onClick={onClick}
      className={`min-h-11 rounded-full px-3 text-xs ${on ? "bg-lime text-lime-ink" : "text-muted"}`}
    >
      {label}
    </button>
  );
}

function Agent() {
  const logs = useDesk((s) => s.logs);
  const positions = useDesk((s) => s.positions);
  const agentOn = useDesk((s) => s.agentOn);
  const toggleAgent = useDesk((s) => s.toggleAgent);
  const sell = useDesk((s) => s.sell);
  const select = useDesk((s) => s.select);
  const tokens = useDesk((s) => s.tokens);
  const open = positions.filter((p) => p.status === "open");

  return (
    <section className="px-4 lg:px-0">
      <button
        type="button"
        onClick={toggleAgent}
        className={`flex min-h-14 w-full items-center justify-between rounded-2xl px-4 text-left ${
          agentOn ? "bg-lime text-lime-ink" : "bg-surface-2 text-fg"
        }`}
      >
        <span>
          <span className="block text-sm font-medium">{agentOn ? "Agent armed" : "Agent standing down"}</span>
          <span className={`mt-1 block text-xs ${agentOn ? "text-lime-ink" : "text-muted"}`}>
            {agentOn ? "New launches are scored, then bought or skipped." : "Tape still runs. Arm to take paper trades."}
          </span>
        </span>
        <Bot size={20} aria-hidden />
      </button>
      <h2 className="mt-6 text-xs uppercase tracking-widest text-muted">Open paper</h2>
      {open.length === 0 ? (
        <p className="mt-2 text-sm text-muted">No open positions.</p>
      ) : (
        <ul className="mt-2">
          {open.map((position) => {
            const pnl = pnlSol(position.sizeSol, position.entryMcap, position.mcap);
            const token = tokens.find((t) => t.mint === position.mint);
            return (
              <li key={position.mint} className="flex items-center gap-3 border-b border-line py-3">
                <button type="button" onClick={() => token && select(token.id)} className="min-w-0 flex-1 text-left">
                  <span className="block text-sm">{position.symbol}</span>
                  <span className={`block text-xs tabular-nums ${pnl >= 0 ? "text-lime" : "text-heat"}`}>
                    {solText(pnl)} SOL · {position.sizeSol.toFixed(3)} in
                  </span>
                </button>
                <button
                  type="button"
                  onClick={() => sell(position.mint, "manual sell")}
                  className="min-h-11 rounded-full bg-heat px-4 text-sm font-medium text-heat-ink"
                >
                  Sell
                </button>
              </li>
            );
          })}
        </ul>
      )}
      <h2 className="mt-6 text-xs uppercase tracking-widest text-muted">Decision log</h2>
      <LogList logs={logs} empty="No decisions yet." />
    </section>
  );
}

function LogList({ logs, empty }: { logs: LogEntry[]; empty: string }) {
  if (!logs.length) return <p className="mt-2 text-sm text-muted">{empty}</p>;
  return (
    <ul className="mt-2">
      {logs.map((log) => (
        <li key={log.id} className="flex gap-3 border-b border-line py-2">
          <span className="w-16 shrink-0 text-xs tabular-nums text-muted">{clock(log.ts)}</span>
          <span
            className={`w-12 shrink-0 text-xs uppercase ${
              log.action === "buy" ? "text-lime" : log.action === "sell" ? "text-heat" : "text-muted"
            }`}
          >
            {log.action}
          </span>
          <span className="min-w-0 flex-1">
            <span className="block truncate text-sm">{log.symbol}</span>
            <span className="block text-xs text-muted">
              {log.reason}
              {log.action !== "sell" ? ` · ${latencyText(log.latencyMs)}` : ""}
              {log.pnlSol != null ? ` · ${solText(log.pnlSol)} SOL` : ""}
            </span>
          </span>
        </li>
      ))}
    </ul>
  );
}

function Armor() {
  const strategy = useDesk((s) => s.strategy);
  const update = useDesk((s) => s.updateStrategy);

  return (
    <section className="px-4 lg:px-0">
      <h2 className="text-xs uppercase tracking-widest text-muted">Shell Armor</h2>
      <p className="mt-2 text-sm text-muted">
        On-device gates. Live dev-hold and authority fields are estimates, not a Rugcheck audit.
      </p>
      <div className="mt-3">
        <Toggle
          title="Rug filter"
          hint="Blocks creator holdings above your cap."
          on={strategy.armorRug}
          onClick={() => update({ armorRug: !strategy.armorRug })}
        />
        <Toggle
          title="Honeypot filter"
          hint="Stands down when a freeze authority is set."
          on={strategy.armorHoneypot}
          onClick={() => update({ armorHoneypot: !strategy.armorHoneypot })}
        />
        <Toggle
          title="Scam lexicon"
          hint="Flags airdrop, giveaway, 100x, and impersonation names."
          on={strategy.armorScam}
          onClick={() => update({ armorScam: !strategy.armorScam })}
        />
        <Toggle
          title="Liquidity floor"
          hint="Skips curves under 8 SOL."
          on={strategy.armorLiquidity}
          onClick={() => update({ armorLiquidity: !strategy.armorLiquidity })}
        />
        <Toggle
          title="Auto-sell"
          hint="Closes paper when take-profit or stop-loss prints."
          on={strategy.autoSell}
          onClick={() => update({ autoSell: !strategy.autoSell })}
        />
      </div>
      <div className="mt-4">
        <Slider label="Min size" value={strategy.minSol} min={0.02} max={0.5} step={0.01} suffix=" SOL" onChange={(minSol) => update({ minSol })} />
        <Slider label="Max size" value={strategy.maxSol} min={0.05} max={1.5} step={0.01} suffix=" SOL" onChange={(maxSol) => update({ maxSol })} />
        <Slider label="Slippage" value={strategy.slippage} min={1} max={30} step={1} suffix="%" onChange={(slippage) => update({ slippage })} />
        <Slider label="Take-profit" value={strategy.takeProfit} min={10} max={200} step={5} suffix="%" onChange={(takeProfit) => update({ takeProfit })} />
        <Slider label="Stop-loss" value={strategy.stopLoss} min={5} max={80} step={5} suffix="%" onChange={(stopLoss) => update({ stopLoss })} />
        <Slider label="Max dev hold" value={strategy.maxDevHold} min={2} max={50} step={1} suffix="%" onChange={(maxDevHold) => update({ maxDevHold })} />
        <Slider label="Min safety" value={strategy.minSafety} min={40} max={90} step={1} suffix="" onChange={(minSafety) => update({ minSafety })} />
      </div>
    </section>
  );
}

function Toggle({ title, hint, on, onClick }: { title: string; hint: string; on: boolean; onClick: () => void }) {
  return (
    <button
      type="button"
      aria-pressed={on}
      onClick={onClick}
      className="flex min-h-14 w-full items-center justify-between gap-3 border-b border-line py-3 text-left"
    >
      <span>
        <span className="block text-sm">{title}</span>
        <span className="mt-1 block text-xs text-muted">{hint}</span>
      </span>
      <span className={`rounded-full px-3 py-1 text-xs ${on ? "bg-lime text-lime-ink" : "bg-surface-2 text-muted"}`}>
        {on ? "On" : "Off"}
      </span>
    </button>
  );
}

function Slider({
  label,
  value,
  min,
  max,
  step,
  suffix,
  onChange,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  step: number;
  suffix: string;
  onChange: (value: number) => void;
}) {
  const shown = step < 1 ? value.toFixed(2) : String(value);
  return (
    <label className="block border-b border-line py-3">
      <span className="flex items-baseline justify-between gap-3">
        <span className="text-sm">{label}</span>
        <span className="text-sm tabular-nums text-lime">
          {shown}
          {suffix}
        </span>
      </span>
      <input
        className="mt-2"
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(event) => onChange(Number(event.target.value))}
      />
    </label>
  );
}

function Crew() {
  const referrals = useDesk((s) => s.referrals);
  const code = useDesk((s) => s.code);
  const addReferral = useDesk((s) => s.addReferral);
  const toggleReferral = useDesk((s) => s.toggleReferral);
  const [handle, setHandle] = useState("");
  const [volume, setVolume] = useState("1");
  const [copied, setCopied] = useState(false);

  const active = referrals.filter((r) => r.active).length;
  const { current, next } = tierFor(active);
  const volumeSol = referrals.filter((r) => r.active).reduce((sum, r) => sum + r.volumeSol, 0);
  const commission = (volumeSol * current.cut) / 100;
  const progress = next ? Math.min(100, (active / next.min) * 100) : 100;

  return (
    <section className="px-4 lg:px-0">
      <h2 className="text-xs uppercase tracking-widest text-muted">Crew ledger</h2>
      <p className="mt-2 text-sm text-muted">
        Commissions are tracked here. Shell does not send SOL.
      </p>
      <div className="card mt-4 p-4">
        <p className="text-xs text-muted">Your tier</p>
        <p className="font-display mt-1 text-3xl italic">
          {current.name}
          <span className="ml-2 text-lime">{current.cut}%</span>
        </p>
        <p className="mt-2 text-xs text-muted">
          {next ? `${active} active · ${next.min - active} to ${next.name}` : `${active} active · top tier`}
        </p>
        <div className="mt-3 h-1.5 rounded-full bg-surface-2">
          <div className="h-full rounded-full bg-lime" style={{ width: `${progress}%` }} />
        </div>
        <p className="mt-3 text-sm tabular-nums">
          Tracked commission <span className="text-lime">{solText(commission)} SOL</span>
        </p>
      </div>
      <button
        type="button"
        onClick={async () => {
          try {
            await navigator.clipboard.writeText(code);
            setCopied(true);
            window.setTimeout(() => setCopied(false), 1400);
          } catch {
            setCopied(false);
          }
        }}
        className="mt-3 flex min-h-14 w-full items-center justify-between rounded-2xl bg-surface-2 px-4 text-left"
      >
        <span>
          <span className="block text-xs text-muted">Crew code</span>
          <span className="mt-1 block text-sm tabular-nums">{code}</span>
        </span>
        {copied ? <Check size={18} className="text-lime" /> : <Copy size={18} className="text-muted" />}
      </button>
      <ol className="mt-4">
        {TIERS.map((tier) => (
          <li
            key={tier.name}
            className={`flex items-center justify-between border-b border-line py-3 text-sm ${
              tier.name === current.name ? "text-fg" : "text-muted"
            }`}
          >
            <span>
              {tier.name}
              <span className="ml-2 text-xs">{tier.min}+ active</span>
            </span>
            <span className="tabular-nums text-lime">{tier.cut}%</span>
          </li>
        ))}
      </ol>
      <form
        className="mt-4"
        onSubmit={(event) => {
          event.preventDefault();
          const name = handle.trim();
          if (!name) return;
          addReferral(name, Number(volume) || 0);
          setHandle("");
        }}
      >
        <label className="block text-xs text-muted" htmlFor="crew-handle">
          Add a referral
        </label>
        <input
          id="crew-handle"
          value={handle}
          onChange={(event) => setHandle(event.target.value)}
          placeholder="handle"
          className="mt-2 min-h-11 w-full rounded-xl bg-surface-2 px-3 text-sm text-fg placeholder:text-muted"
        />
        <label className="mt-3 block text-xs text-muted" htmlFor="crew-volume">
          Their volume, SOL
        </label>
        <input
          id="crew-volume"
          inputMode="decimal"
          value={volume}
          onChange={(event) => setVolume(event.target.value)}
          className="mt-2 min-h-11 w-full rounded-xl bg-surface-2 px-3 text-sm tabular-nums text-fg"
        />
        <button type="submit" className="mt-3 min-h-11 w-full rounded-full bg-lime text-sm font-medium text-lime-ink">
          Add to ledger
        </button>
      </form>
      <ul className="mt-4">
        {referrals.map((ref) => (
          <li key={ref.id} className="flex items-center justify-between gap-3 border-b border-line py-3">
            <span className="min-w-0">
              <span className="block truncate text-sm">@{ref.handle}</span>
              <span className="block text-xs tabular-nums text-muted">{ref.volumeSol.toFixed(2)} SOL volume</span>
            </span>
            <button
              type="button"
              aria-pressed={ref.active}
              onClick={() => toggleReferral(ref.id)}
              className={`min-h-11 rounded-full px-3 text-xs ${ref.active ? "bg-lime text-lime-ink" : "bg-surface-2 text-muted"}`}
            >
              {ref.active ? "Active" : "Idle"}
            </button>
          </li>
        ))}
      </ul>
    </section>
  );
}

function TokenSheet() {
  const token = useDesk(selectedToken);
  const reports = useDesk((s) => s.reports);
  const strategy = useDesk((s) => s.strategy);
  const positions = useDesk((s) => s.positions);
  const aiCache = useDesk((s) => s.aiCache);
  const select = useDesk((s) => s.select);
  const sell = useDesk((s) => s.sell);
  const cacheAi = useDesk((s) => s.cacheAi);
  const ask = useServerFn(analyzeToken);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const report = token ? reports[token.id] : undefined;
  const open = token ? positions.find((p) => p.mint === token.mint && p.status === "open") : undefined;
  const note = token ? aiCache[token.mint] : undefined;

  const trace = useMemo(() => (token && report ? buildTrace(token, report, strategy, Boolean(open)) : []), [token, report, strategy, open]);

  if (!token || !report) return null;

  return (
    <div className="fixed inset-0 z-40 flex items-end justify-center lg:items-center">
      <button type="button" aria-label="Close token" className="absolute inset-0 bg-bg/80" onClick={() => select(null)} />
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="token-title"
        className="relative max-h-dvh w-full max-w-md overflow-y-auto rounded-t-3xl border border-line bg-surface p-4 lg:rounded-3xl"
      >
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="text-xs uppercase tracking-widest text-muted">{token.source}</p>
            <h2 id="token-title" className="font-display mt-1 text-3xl italic">
              {token.name}
            </h2>
            <p className="mt-1 text-sm text-muted">
              {token.symbol} · {shortMint(token.mint)}
            </p>
          </div>
          <button type="button" onClick={() => select(null)} className="min-h-11 rounded-full bg-surface-2 px-4 text-sm">
            Close
          </button>
        </div>
        <p className="mt-4 font-display text-4xl italic tabular-nums text-lime">{report.overall}</p>
        <p className="text-xs text-muted">{report.pass ? "Clears your gates" : "Stands down"}</p>
        <dl className="mt-4 grid grid-cols-2 gap-2 text-sm">
          <Fact label="Mcap" value={`${token.marketCapSol.toFixed(1)} SOL`} />
          <Fact label="Curve" value={`${token.liquiditySol.toFixed(1)} SOL`} />
          <Fact label="Dev hold" value={`${token.devHoldPct.toFixed(0)}%`} />
          <Fact label="Bundles" value={String(token.bundledBuys)} />
          <Fact label="Rug risk" value={String(report.rug)} />
          <Fact label="Honeypot" value={String(report.honeypot)} />
          <Fact label="Scam" value={String(report.scam)} />
          <Fact label="Liquidity" value={String(report.liquidity)} />
        </dl>
        {token.estimated ? (
          <p className="mt-3 text-xs text-muted">
            Name, symbol, and curve size are from the feed. Dev hold, authorities, and bundles are mint estimates.
          </p>
        ) : null}
        <h3 className="mt-5 text-xs uppercase tracking-widest text-muted">Rule trace</h3>
        <ol className="mt-2 list-decimal space-y-1 pl-4 text-sm text-fg">
          {trace.map((line) => (
            <li key={line}>{line}</li>
          ))}
        </ol>
        {open ? (
          <button
            type="button"
            onClick={() => sell(open.mint, "manual sell")}
            className="mt-4 min-h-11 w-full rounded-full bg-heat text-sm font-medium text-heat-ink"
          >
            Sell paper · {solText(pnlSol(open.sizeSol, open.entryMcap, open.mcap))} SOL
          </button>
        ) : null}
        <h3 className="mt-5 text-xs uppercase tracking-widest text-muted">Grok note</h3>
        {note ? <p className="mt-2 text-sm">{note}</p> : <p className="mt-2 text-sm text-muted">No note yet. Ask once — it is saved on this device.</p>}
        {error ? <p className="mt-2 text-sm text-heat">{error}</p> : null}
        <button
          type="button"
          disabled={pending}
          onClick={async () => {
            setPending(true);
            setError(null);
            try {
              const res = await ask({
                data: {
                  name: token.name,
                  symbol: token.symbol,
                  mint: token.mint,
                  safety: report.overall,
                  flags: report.flags,
                  devHoldPct: token.devHoldPct,
                  liquiditySol: token.liquiditySol,
                  marketCapSol: token.marketCapSol,
                  source: token.source,
                  pass: report.pass,
                },
              });
              if (!res.ok) setError(res.error);
              else cacheAi(token.mint, res.text);
            } catch (err) {
              setError(err instanceof Error ? err.message : "AI failed");
            } finally {
              setPending(false);
            }
          }}
          className="mt-3 min-h-11 w-full rounded-full bg-lime text-sm font-medium text-lime-ink disabled:opacity-60"
        >
          {pending ? "Asking…" : note ? "Ask Grok again" : "Ask Grok"}
        </button>
      </div>
    </div>
  );
}

function Fact({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl bg-surface-2 px-3 py-2">
      <dt className="text-xs text-muted">{label}</dt>
      <dd className="mt-1 tabular-nums">{value}</dd>
    </div>
  );
}

function buildTrace(
  token: TokenLaunch,
  report: { flags: string[]; overall: number; pass: boolean },
  strategy: { minSafety: number; maxDevHold: number },
  held: boolean,
) {
  const lines = [
    `Safety ${report.overall} against a floor of ${strategy.minSafety}.`,
    `Dev hold ${token.devHoldPct.toFixed(0)}% versus cap ${strategy.maxDevHold}%.`,
    token.freezeAuthority ? "Freeze authority is set, so the honeypot gate fails." : "No freeze authority on this read.",
    ...report.flags.map((flag) => flag),
    report.pass ? "Gates pass. The agent may size a paper buy." : "At least one gate fails. The agent skips.",
  ];
  if (held) lines.push("A paper position is already open.");
  return lines.slice(0, 7);
}
