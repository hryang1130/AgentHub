# AgentHub · ERC-8004 Learning & Demo Project

[简体中文](README.md) | **English**

A course project built around the **ERC-8004 (Trustless Agents)** standard: a miniature "trustless agent economy" made of a protocol demo, a local registration & trading platform, and a real on-chain registration tool — plus an optional [**RepuGate**](https://github.com/fuyuhanCC/RepuGate) reputation gate that acts as the **trust decision layer before any payout**.

> RepuGate is a client-side trust middleware (x402 + ERC-8004 reputation evaluation) built by the same course team. Main repo: [github.com/fuyuhanCC/RepuGate](https://github.com/fuyuhanCC/RepuGate)

---

## Contents

| Directory | What it is |
|---|---|
| [`erc8004-demo/`](#1-erc8004-demo--single-file-protocol-demo) | A pure-frontend, offline ERC-8004 protocol demo (bilingual) |
| [`agent-platform/`](#2-agent-platform--local-registry--marketplace-agenthub) | Registry + marketplace + append-only ledger (zero-dependency Node service, port 8800) |
| [**RepuGate integration**](#3-integration-with-repugate-the-reputation-gate) | **How the two components interact: the single seam, the order lifecycle, the three-branch settlement** |
| [`sepolia/`](#4-sepolia--real-on-chain-registration-tool) | Register an agent for real on the Sepolia testnet ERC-8004 identity registry |

---

## 1. `erc8004-demo/` — single-file protocol demo

A pure-frontend, offline ERC-8004 simulation with a Chinese/English toggle:

- Three registries simulated: IdentityRegistry / ReputationRegistry / ValidationRegistry
- Full flow: register → discover → delegate → feedback → validate (TEE / zkML / re-execution)
- A simulated chain event ledger (Explorer) that makes "work off-chain, trust signals on-chain" visible

Just double-click `index.html`.

## 2. `agent-platform/` — local registry + marketplace (AgentHub)

A zero-dependency Node service — a miniature "trustless agent economy":

```
启动AgentHub.bat        ← one double-click starts everything
server.js               ← registry + marketplace (port 8800)
agents/demo-agent.js    ← runnable agent sample with a self-hosted homepage
public/index.html       ← platform UI (Registry / Marketplace / Ledger / Guide)
sepolia/                ← real on-chain registration tool (see below)
```

- **Registry**: `register()` writes to the simulated chain, `agent-card.json` follows the ERC-8004 registration-file spec, plus reputation feedback
- **Marketplace**: agents list priced skills; **escrow → the platform calls the agent over real HTTP → reputation gate → settle on the verdict** (the local credit unit LGC stands in for the x402 payment layer). Supports **agent-to-agent commerce**
- **Self-hosted agents**: `demo-agent.js` serves its own homepage, publishes `/.well-known/agent-card.json`, idempotently registers itself on startup, and serves marketplace orders for real. Change the `SKILLS` array and `handleExecute()` to turn it into your own agent
- **Append-only ledger**: every state change appends a block, across 8 event types — `Register`, `ServiceListed`, `OrderCreated`, `GateEvaluated`, `PaymentReleased`, `PaymentBlocked`, `PaymentHeld`, `GiveFeedback`

### Platform HTTP API

| Method | Path | Purpose |
|---|---|---|
| `GET` | `/api/state` | Read the whole state (agents / orders / credits / ledger) |
| `GET` | `/api/repugate` | Gate wiring status: `{ enabled, url, scenarios }` |
| `POST` | `/api/register` | Register an agent (optionally with a `repugateScenario` reputation fixture) |
| `POST` | `/api/order` | Place an order: `{ buyerKey, agentId, skillId, model? }` |
| `POST` | `/api/feedback` | Submit reputation feedback |
| `POST` | `/api/reset` | Clear the ledger and orders, back to the initial state |

---

## 3. Integration with RepuGate (the reputation gate)

The platform owns the **order, the escrow and the ledger**, but it cannot answer the more fundamental question: **is this seller worth paying?** That is exactly what [RepuGate](https://github.com/fuyuhanCC/RepuGate) is for.

The two are **separate systems**, each responsible for one thing, meeting at **exactly one seam**.

### 3.1 The single integration point: `repugateGate()`

The integration is one function (`server.js`), called at the moment when **the seller has already done the work but not a single coin has moved**:

```js
// Pre-payout gate: returns { decision: 'ALLOW' | 'REVIEW' | 'BLOCK' | 'UNAVAILABLE', ... }
async function repugateGate(agent, orderId, model) { … }
```

It first pulls the scenario catalog from RepuGate via `GET /api/services`, then submits the evaluation request with `POST /api/evaluations`:

```js
const r = await repuPost('/api/evaluations', {
  buyer: CLIENT,
  model: 'B3_REPUGATE',                      // B0_NO_GATE / B1_RAW / B2_GROUNDED / B3_REPUGATE / B3_DIRICHLET
  scenarioId: agent.repugateScenario,
  offer: svc.offer,                          // the platform's own offer, forwarded verbatim
  expectedOfferHash: svc.expectedOfferHash,  // binds the approval to the exact quoted offer
  idempotencyKey: 'order-' + orderId + '-' + Date.now(),
  tag2: 'inference'
});
// → { decision, decisionId, reasons, scoreBps, confidenceBps,
//     distinctReviewerCount, riskFlags, offerRiskFlags, grantId }
```

**Three properties of this seam are deliberate:**

1. **The platform is itself exposed to offer substitution** — it forwards the pair (offer, offer hash), so catching a mismatch is the gate's job rather than something the platform merely asserts about itself.
2. **Offer binding is independent of reputation** — even with a perfectly healthy reputation (say 74%), a mismatched offer hash is still `BLOCK`ed.
3. **The model is selectable per order** — the five model cards in the UI turn the marketplace into a **live comparison harness** running on the real settlement path.

### 3.2 Order lifecycle: the gate sits at step 3

```
  1 · Order & escrow      2 · Execute            3 · Reputation gate ★    4 · Settle
 ┌──────────────┐      ┌──────────────┐       ┌────────────────┐      ┌──────────────────┐
 │ Buyer          │      │ homepage:      │       │  POST          │      │ ALLOW  → release   │
 │ balance −price │  →   │  real HTTP     │  →    │  /api/evalu.   │  →   │ BLOCK  → refund    │
 │ OrderCreated   │      │ no homepage:   │       │  GateEvaluated │      │ REVIEW → hold      │
 │                │      │  simulated     │       │  ★ the seam    │      │      (fail-closed) │
 └──────────────┘      └──────────────┘       └────────────────┘      └──────────────────┘
```

- **Step 1 · Escrow debit**: the buyer's balance is debited first; `OrderCreated` is written
- **Step 2 · Execute**: `if (a.homepage)` decides between a real `POST /api/execute` call and a platform-hosted simulated execution. **Register without a homepage and execution is simulated — but the reputation fixture still applies**, so all four attacks run through the real settlement path with no extra backend.
- **Step 3 · Reputation gate ★**: call RepuGate; `GateEvaluated` is written
- **Step 4 · Settle**: **escrowed money moves only after the gate has spoken**

### 3.3 Three-branch settlement: how a verdict becomes money

| Gate verdict | Money movement | Ledger event | Order status |
|---|---|---|---|
| `ALLOW` | Release to the seller's wallet | `PaymentReleased` | `RELEASED` |
| `BLOCK` | **Full refund** to the buyer's escrow account | `PaymentBlocked` | `BLOCKED` |
| `REVIEW` / `UNAVAILABLE` | **Funds stay in escrow**, pending human review | `PaymentHeld` | `REVIEW` |

```js
if (gate.decision === 'BLOCK') {
    state.credits[buyerKey] += s.price;        // full refund to the buyer
    tx('PaymentBlocked', …);                   // → BLOCKED
} else if (gate.decision === 'REVIEW' || gate.decision === 'UNAVAILABLE') {
    /* funds stay in escrow, pending human review */   // → REVIEW
    tx('PaymentHeld', …);                      //   fail-closed
} else {
    state.credits[a.owner] += s.price;         // release to the seller
    tx('PaymentReleased', …);                  // → RELEASED
}
```

**`REVIEW` and `UNAVAILABLE` share one branch**, and that is deliberate: **a gate that cannot reach a verdict is treated exactly like a gate that returned a cautious one** — the money stays in escrow. Neither the platform nor the middleware can unilaterally convert uncertainty into payment.

### 3.4 Fail-closed: if the gate is down, money does not flow

| Failure | Returned | Result |
|---|---|---|
| RepuGate unreachable | `UNAVAILABLE` | Funds held |
| RepuGate not responding (8s timeout) | `UNAVAILABLE` | Funds held |
| Scenario absent from the catalog | `UNAVAILABLE` | Funds held |
| Response body is not valid JSON | `UNAVAILABLE` | Funds held |

In other words: **with RepuGate not running, the platform does not degrade into "no gate, pay freely"** — it stops paying. This is honored by the **caller** (the platform), not merely asserted by the library.

### 3.5 The five reputation models

One model per order; the five cards under the Marketplace tab map to this table:

| Model | Evidence required | Aggregation |
|---|---|---|
| `B0_NO_GATE` | None | No reputation computed; payment authorized unconditionally (control) |
| `B1_RAW` | Scope-filtered feedback only | Arithmetic mean of eligible ratings |
| `B2_GROUNDED` | A verified, **unique payment receipt** | Arithmetic mean over payment-grounded records |
| `B3_REPUGATE` | Same as B2 | One vote per reviewer + Beta(1,1) prior; reports *expected quality* |
| `B3_DIRICHLET` | Same as B2 | One vote per reviewer + symmetric 5-category Dirichlet prior; reports *probability the next rating is Good or better* |

The default model is `B3_REPUGATE`. **The thresholds are RepuGate's**, not the platform's (70% allow / 60% confidence, see its report §5.4) — the platform does not score anything, it only consumes the verdict. The platform labels the gate `repugate-policy-v1` in its own agent cards.

> Note: `B3_REPUGATE` is the platform-side model id for the Beta variant that the RepuGate report compares against `B3_DIRICHLET` (recorded there as B3-Beta).

### 3.6 The four attack fixtures

At registration, `repugateScenario` pins *what kind of reputation record* the agent is judged on:

| `repugateScenario` | Attack shape |
|---|---|
| `honest-service` | Control: three genuine reviews with valid payment evidence |
| `ungrounded-feedback` | Five perfect ratings with **no payment** behind any of them |
| `receipt-replay` | **One** valid payment receipt attached to **five** separate ratings |
| `reviewer-concentration` | High ratings produced by a small coordinated cluster of wallets |
| `offer-substitution` | The offer presented does not match the expected offer |

**Registering without a homepage means execution is simulated while the reputation fixture stays live**, so all four attacks reuse the same real settlement path.

### 3.7 Configuration

| Environment variable | Default | Effect |
|---|---|---|
| `REPUGATE_URL` | `http://127.0.0.1:3001` | Points at the RepuGate Evaluation API |
| `REPUGATE_ENABLED` | `1` (on) | Set to `0` to **disable the gate entirely**: every order settles as `ALLOW` with the reason `REPUGATE_DISABLED` — the un-gated control over the identical order flow |

`GET /api/repugate` reports the current wiring at any time.

### 3.8 Running the two together

```bash
# 1) RepuGate's Evaluation API (port 3001)
git clone https://github.com/fuyuhanCC/RepuGate
cd RepuGate
./pnpmw install
./pnpmw dev:api

# 2) The AgentHub platform (port 8800)
cd agent-platform && node server.js
# or just double-click: 启动AgentHub.bat

# 3) Open http://localhost:8800 — register, pick a model, order and read the ledger, all in the browser
```

It also runs without RepuGate: skip step 1 and the gate returns `UNAVAILABLE` and **holds funds** (fail-closed); if you want the original gate-less behaviour, start with `REPUGATE_ENABLED=0`.

The same actions are available over HTTP:

```bash
# Register an adversarial seller with no homepage (simulated execution, live fixture)
curl -X POST localhost:8800/api/register -H 'content-type: application/json' \
  -d '{"name":"SwapMaster","repugateScenario":"offer-substitution",
       "skills":[{"id":"cheap-quote","name":"cheap quote","price":4}]}'

# Place an order; the model is chosen per order
curl -X POST localhost:8800/api/order -H 'content-type: application/json' \
  -d '{"buyerKey":"client","agentId":1,"skillId":"btc-price","model":"B3_REPUGATE"}'

# Read back the ledger, orders, verdicts and balances
curl localhost:8800/api/state
```

### 3.9 How to check the integration really works

- Every `GateEvaluated` is followed by **exactly one** `PaymentReleased` / `PaymentBlocked` / `PaymentHeld`
- The released and blocked counts must **equal** the gate's `ALLOW` and `BLOCK` totals exactly
- The demonstration buyer's balance drop must equal the sum of all settled order prices

One full run as recorded in the repo's `data/state.json`:

| Metric | Value |
|---|---|
| Ledger blocks | 68 |
| Orders | 18 |
| Registered agents | 5 |
| `RELEASED` / `BLOCKED` | 11 / 7 |
| Gate `ALLOW` / `BLOCK` | 11 / 7 (exactly matching the ledger) |
| Demonstration buyer balance | 1,000 → 946 LGC |

---

## 4. `sepolia/` — real on-chain registration tool

Registers an agent for real on the **Sepolia testnet** ERC-8004 identity registry:

- `create-wallet.cjs` generates a demo wallet
- `register.cjs` checks the balance → builds the canonical registration JSON (data URI, no IPFS needed) → calls the real contract `0x8004A818BFB912233c491871b3d84c89A494BD9e` → prints the Etherscan transaction link
- Step-by-step guide in `sepolia/README-注册指南.md` (including faucet instructions)

Mainnet canonical address: `0x8004A169FB4a3325136EB29fA0ceB6D2e539a432` (deterministic cross-chain deployment, same address).

---

## Quick start

```bash
# Node.js only — no dependencies, no build step
cd agent-platform
node server.js            # → http://localhost:8800
# or double-click 启动AgentHub.bat to start the platform plus two sample agents
```

The UI has four tabs — **Registry**, **Marketplace**, **Ledger** and **Guide** — with a Chinese/English toggle.

## Background

- Specification: <https://eips.ethereum.org/EIPS/eip-8004>
- Official site: <https://www.8004.org>
- Related protocols: A2A (communication), MCP (tools), x402 (payment) — ERC-8004 supplies the **discovery and trust layer** they were missing
- Reputation gate: [RepuGate](https://github.com/fuyuhanCC/RepuGate) — a payment-grounded reputation gateway for x402 agent services

## Related repositories

| Repository | Description |
|---|---|
| [fuyuhanCC/RepuGate](https://github.com/fuyuhanCC/RepuGate) | The reputation gate middleware: evidence verification, one-reviewer-one-vote, Bayesian scoring, offer-bound grants. This platform calls it via `POST /api/evaluations` |
| [hryang1130/AgentHub](https://github.com/hryang1130/AgentHub) | This repository: registry + marketplace + append-only ledger + this README |
