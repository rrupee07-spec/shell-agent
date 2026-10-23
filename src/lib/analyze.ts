import { createServerFn } from "@tanstack/react-start";

type AnalyzeInput = {
  name: string;
  symbol: string;
  mint: string;
  safety: number;
  flags: string[];
  devHoldPct: number;
  liquiditySol: number;
  marketCapSol: number;
  source: string;
  pass: boolean;
};

function clean(input: unknown): AnalyzeInput {
  const raw = (input ?? {}) as Partial<AnalyzeInput>;
  const name = String(raw.name ?? "").slice(0, 40);
  const symbol = String(raw.symbol ?? "").slice(0, 12);
  const mint = String(raw.mint ?? "").slice(0, 64);
  if (!name || !symbol || !mint) throw new Error("Missing token");
  const flags = Array.isArray(raw.flags) ? raw.flags.map((f) => String(f).slice(0, 80)).slice(0, 6) : [];
  return {
    name,
    symbol,
    mint,
    safety: Number(raw.safety) || 0,
    flags,
    devHoldPct: Number(raw.devHoldPct) || 0,
    liquiditySol: Number(raw.liquiditySol) || 0,
    marketCapSol: Number(raw.marketCapSol) || 0,
    source: String(raw.source ?? "sim").slice(0, 12),
    pass: Boolean(raw.pass),
  };
}

export const analyzeToken = createServerFn({ method: "POST" })
  .validator(clean)
  .handler(async ({ data }) => {
    const apiKey = process.env.XAI_API_KEY;
    if (!apiKey) return { ok: false as const, error: "AI is not available in this environment" };

    const res = await fetch("https://api.x.ai/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: "grok-4.5",
        max_tokens: 180,
        temperature: 0.4,
        messages: [
          {
            role: "system",
            content:
              "You are Shell, a blunt copilot on a paper trading desk that watches Pump.fun launches. Never ask for private keys, seed phrases, or wallet connects. Never promise profit. In under 90 words: say pass or stand down, the main risk, and one condition that would change your mind. Plain sentences. No headings.",
          },
          {
            role: "user",
            content: [
              `Token ${data.name} (${data.symbol}), mint ${data.mint}.`,
              `Source ${data.source}. Market cap ${data.marketCapSol} SOL. Curve liquidity ${data.liquiditySol} SOL. Dev hold estimate ${data.devHoldPct}%.`,
              `On-device armor safety ${data.safety}/100. Gate ${data.pass ? "pass" : "fail"}.`,
              `Flags: ${data.flags.join("; ") || "none"}.`,
              "Derived holder and authority fields are estimates when the source is live, not a chain audit.",
            ].join(" "),
          },
        ],
      }),
    });

    if (!res.ok) return { ok: false as const, error: `AI request failed (${res.status})` };
    const body = (await res.json()) as { choices?: { message?: { content?: unknown } }[] };
    const content = body.choices?.[0]?.message?.content;
    const text = typeof content === "string" ? content.trim() : "";
    if (!text) return { ok: false as const, error: "AI returned an empty note" };
    return { ok: true as const, text };
  });
