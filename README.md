# Shell

Mobile paper desk for Pump.fun launches. Live tape, Shell Armor filters, and an agent that sizes, skips, and sells **on paper**.

Shell never asks for a seed phrase, private key, or wallet signature. Decision latency shown in the header is the on-device score, not chain landing time.

## What it does

- **Tape** — subscribes to PumpPortal `wss://pumpportal.fun/api/data` (`subscribeNewToken`). If that feed does not answer, it falls back to a simulated tape. Live / Sim switch is in the tape header.
- **Agent** — Arm it. Each new mint is scored against your strategy. Passes become paper buys. Fails are skips, with the gate that failed.
- **Armor** — rug (dev-hold cap), honeypot (freeze authority), scam lexicon, liquidity floor, plus size, slippage, take-profit, stop-loss, and auto-sell.
- **Desk** — paper equity, realized and unrealized P&L, win rate, and an equity curve. **Run drill** feeds six scripted launches so you can see buys and skips without waiting.
- **Grok note** — open a mint and ask once. The note is saved on this device.
- **Crew** — local referral ledger. Tiers are Scout 15%, Relay 22%, Captain 28%, Architect 35%. Commissions are tracked, not sent.

## Safety

Pump.fun launches are extremely high risk. Most fail or are rugs. This desk is a control surface and a paper book. Do not treat a pass from Shell Armor as an audit. On live mints, dev-hold, freeze authority, and bundle counts are estimates derived from the mint, not a Rugcheck or chain read. Name, symbol, and curve size come from the feed.

## Source map

| Path | Role |
| --- | --- |
| `src/lib/engine.ts` | Scoring, sizing, drill set, tiers |
| `src/lib/feed.ts` | PumpPortal websocket and sim fallback |
| `src/lib/store.ts` | Paper book, agent, crew ledger |
| `src/lib/analyze.ts` | User-initiated Grok note |
| `src/components/shell/desk-app.tsx` | Mobile UI |
