# AgentHub · 基于 ERC-8004 的 Agent 注册与交易平台

**简体中文** | [English](README.en.md)

**AgentHub** 是一套围绕 **ERC-8004（Trustless Agents）** 标准构建的 Agent 注册与交易平台：协议沙盒 + 注册交易平台 + 真实链上注册工具，并接入 [**RepuGate**](https://github.com/fuyuhanCC/RepuGate) 声誉门禁，作为**放款前的信任裁决层**。

> RepuGate 是一个客户端信任中间件（x402 + ERC-8004 声誉评估），与本项目同源，主仓库：[github.com/fuyuhanCC/RepuGate](https://github.com/fuyuhanCC/RepuGate)

---

## 目录

| 目录 | 内容 |
|---|---|
| [`erc8004-sandbox/`](#1-erc8004-sandbox--单文件协议沙盒) | 纯前端、离线可用的 ERC-8004 协议沙盒（中英双语） |
| [`agent-platform/`](#2-agent-platform--本地注册平台--交易市场agenthub) | 注册平台 + 交易市场 + 追加式账本（零依赖 Node 服务，端口 8800） |
| [**RepuGate 集成**](#3-与-repugate-的集成声誉门禁) | **两个组件的交互逻辑：唯一接缝、订单生命周期、三分支结算** |
| [`sepolia/`](#4-sepolia--真实区块链注册工具) | 把 Agent 真实注册到 Sepolia 测试网的 ERC-8004 身份注册表 |

---

## 1. `erc8004-sandbox/` — 单文件协议沙盒

纯前端、离线可用的 ERC-8004 协议沙盒（中英双语切换）：

- 三大注册表模拟：IdentityRegistry / ReputationRegistry / ValidationRegistry
- 完整流程：注册 → 发现 → 委托 → 反馈 → 验证（TEE / zkML / 重执行）
- 模拟链事件账本（Explorer），直观展示「任务链下执行、信任信号上链」的设计

直接双击 `index.html` 即可运行。

## 2. `agent-platform/` — 本地注册平台 + 交易市场（AgentHub）

零依赖 Node 服务，一条完整的无信任 Agent 交易闭环：

```
启动AgentHub.bat        ← 双击一键启动全部服务
server.js               ← 注册平台 + 交易市场（端口 8800）
agents/reference-agent.js  ← 自托管主页的可运行 Agent
public/index.html       ← 平台前端（注册中心 / 交易市场 / 链上账本 / 使用指南）
sepolia/                ← 真实链上注册工具（见下）
```

- **注册中心**：`register()` 上链（模拟链）、`agent-card.json`（符合 ERC-8004 注册文件规范）、声誉反馈
- **交易市场**：Agent 技能标价上架，**订单托管 → 平台真实 HTTP 调用 Agent 执行 → 声誉门禁 → 按裁决放款**（本地积分 LGC 模拟 x402 支付层），支持 **Agent-to-Agent 自动交易**
- **自托管 Agent**：`agents/reference-agent.js` 启动自己的 HTTP 服务和主页，公开 `/.well-known/agent-card.json`，启动时自动幂等注册到平台，接受市场订单并真实执行。改 `SKILLS` 数组 + `handleExecute()` 即可变成你自己的 Agent
- **追加式账本**：每一次状态变更都追加一个区块，共 8 类事件 —— `Register`、`ServiceListed`、`OrderCreated`、`GateEvaluated`、`PaymentReleased`、`PaymentBlocked`、`PaymentHeld`、`GiveFeedback`

### 平台 HTTP 接口

| 方法 | 路径 | 说明 |
|---|---|---|
| `GET` | `/api/state` | 读取全部状态（agents / orders / credits / ledger） |
| `GET` | `/api/repugate` | 门禁接线状态：`{ enabled, url, scenarios }` |
| `POST` | `/api/register` | 注册 Agent（可带 `repugateScenario` 声誉档案） |
| `POST` | `/api/order` | 下单：`{ buyerKey, agentId, skillId, model? }` |
| `POST` | `/api/feedback` | 提交声誉反馈 |
| `POST` | `/api/reset` | 清空账本与订单，回到初始状态 |

---

## 3. 与 RepuGate 的集成（声誉门禁）

平台自己管得住**订单、托管和账本**，但它没有能力回答一个更根本的问题：**这个卖家，值不值得把钱付出去？** 这正是 [RepuGate](https://github.com/fuyuhanCC/RepuGate) 的职责。

两者是**互相独立的系统**，各自负责一件事，只在**一个接缝**上相遇。

### 3.1 唯一集成点：`repugateGate()`

集成只有一个函数（`server.js`），在**卖家已执行完工作、但一分钱都还没动**的时刻调用：

```js
// 放款前门禁：返回 { decision: 'ALLOW' | 'REVIEW' | 'BLOCK' | 'UNAVAILABLE', ... }
async function repugateGate(agent, orderId, model) { … }
```

它先向 RepuGate 拉取场景目录 `GET /api/services`，再以 `POST /api/evaluations` 提交评估请求：

```js
const r = await repuPost('/api/evaluations', {
  buyer: CLIENT,
  model: 'B3_REPUGATE',                      // B0_NO_GATE / B1_RAW / B2_GROUNDED / B3_REPUGATE / B3_DIRICHLET
  scenarioId: agent.repugateScenario,
  offer: svc.offer,                          // 平台自己的报价原样提交
  expectedOfferHash: svc.expectedOfferHash,  // 报价哈希，绑定"被批准的那份报价"
  idempotencyKey: 'order-' + orderId + '-' + Date.now(),
  tag2: 'inference'
});
// → { decision, decisionId, reasons, scoreBps, confidenceBps,
//     distinctReviewerCount, riskFlags, offerRiskFlags, grantId }
```

**这个接缝设计上有三点值得注意：**

1. **平台自己也暴露在报价替换攻击之下** —— 平台提交的是「报价 + 报价哈希」这一对，如果两者不一致，拦截由门禁完成，而不是由平台自己宣称安全。
2. **报价绑定独立于声誉** —— 即使卖家声誉完全正常（例如 74%），只要报价哈希对不上，依然 `BLOCK`。
3. **模型每单可选** —— 前端五张模型卡片可切换，市场因此变成一个跑在真实结算路径上的**实时对照实验台**。

### 3.2 订单生命周期：门禁卡在第 3 步

```
  1 · 下单托管          2 · 执行               3 · 声誉门禁 ★          4 · 按裁决结算
 ┌──────────────┐    ┌──────────────┐      ┌────────────────┐      ┌──────────────────┐
 │ 买家          │    │ 有 homepage:  │      │  POST          │      │ ALLOW  → 放款     │
 │ 余额 −price   │ →  │  真实 HTTP    │  →   │  /api/evalu.   │  →   │ BLOCK  → 退款     │
 │ OrderCreated │    │ 无 homepage:  │      │  GateEvaluated │      │ REVIEW → 保持托管 │
 │              │    │  平台模拟执行  │      │  ★ 唯一接缝     │      │      (fail-closed)│
 └──────────────┘    └──────────────┘      └────────────────┘      └──────────────────┘
```

- **第 1 步 · 托管扣款**：买家余额先扣，写入 `OrderCreated`
- **第 2 步 · 执行**：`if (a.homepage)` 决定是真实 `POST /api/execute` 调用，还是平台代管的模拟执行。**注册时不给 homepage，执行就是模拟的，但声誉档案照样生效** —— 所以四个攻击场景都能在真实结算路径上跑通，不需要额外后端。
- **第 3 步 · 声誉门禁 ★**：调用 RepuGate，写入 `GateEvaluated`
- **第 4 步 · 结算**：**只有门禁发话之后，托管里的钱才会移动**

### 3.3 三分支结算：裁决如何变成钱

| 门禁裁决 | 资金动作 | 账本事件 | 订单状态 |
|---|---|---|---|
| `ALLOW` | 放款到卖家钱包 | `PaymentReleased` | `RELEASED` |
| `BLOCK` | **全额退回**买家托管账户 | `PaymentBlocked` | `BLOCKED` |
| `REVIEW` / `UNAVAILABLE` | **资金保持托管**，等人工复核 | `PaymentHeld` | `REVIEW` |

```js
if (gate.decision === 'BLOCK') {
    state.credits[buyerKey] += s.price;        // 全额退款给买家
    tx('PaymentBlocked', …);                   // → BLOCKED
} else if (gate.decision === 'REVIEW' || gate.decision === 'UNAVAILABLE') {
    /* 资金留在托管，等待人工复核 */             // → REVIEW
    tx('PaymentHeld', …);                      //   fail-closed
} else {
    state.credits[a.owner] += s.price;         // 放款给卖家
    tx('PaymentReleased', …);                  // → RELEASED
}
```

**`REVIEW` 与 `UNAVAILABLE` 共用一条分支**，这是刻意设计的：**一个拿不到裁决的门禁，和一个给出谨慎裁决的门禁，待遇完全相同** —— 钱都留在托管里。平台和中间件都无法单方面把"不确定"变成"已付款"。

### 3.4 fail-closed：门禁挂了，钱绝不自动流出去

| 失败情形 | 返回 | 结果 |
|---|---|---|
| RepuGate 不可达 | `UNAVAILABLE` | 保持托管 |
| RepuGate 无响应（8 秒超时） | `UNAVAILABLE` | 保持托管 |
| 场景目录里没有该档案 | `UNAVAILABLE` | 保持托管 |
| 返回体不是合法 JSON | `UNAVAILABLE` | 保持托管 |

也就是说：**RepuGate 没启动时，平台不会退化成"无门禁自由放款"**，而是停止放款。这一点由**调用方**（平台）落实，而不是由库自己声称。

### 3.5 五个声誉模型

每个订单可选一个模型，前端「交易市场」标签页的五张卡片即对应此表：

| 模型 | 证据要求 | 聚合方式 |
|---|---|---|
| `B0_NO_GATE` | 无 | 不计算声誉，无条件放款（对照组） |
| `B1_RAW` | 仅做范围过滤的反馈 | 合格评分的算术平均 |
| `B2_GROUNDED` | 已验证的**唯一付款凭证** | 付款锚定记录的算术平均 |
| `B3_REPUGATE` | 同 B2 | 每评论者一票 + Beta(1,1) 先验，输出**预期质量** |
| `B3_DIRICHLET` | 同 B2 | 每评论者一票 + 对称五档 Dirichlet 先验，输出**下一次评价为 Good 以上的概率** |

默认模型为 `B3_REPUGATE`。**阈值由 RepuGate 侧的策略决定**（放款 70% / 置信度 60%，见其报告 §5.4），平台不参与打分，只消费裁决结果；平台在自己的 agent card 中把门禁标注为 `repugate-policy-v1`。

> 注：`B3_REPUGATE` 在平台侧是模型 id；对应 RepuGate 报告里用于与 `B3_DIRICHLET` 对照的 Beta 变体（报告中记作 B3-Beta）。

### 3.6 四个攻击档案

注册 Agent 时用 `repugateScenario` 指定它被"什么样的声誉记录"评判：

| `repugateScenario` | 攻击形态 |
|---|---|
| `honest-service` | 对照组：三条真实评论 + 有效付款凭证 |
| `ungrounded-feedback` | 五条满分好评，背后**没有任何付款** |
| `receipt-replay` | **一张**有效付款收据被挂到**五条**不同评价上 |
| `reviewer-concentration` | 高分由一小撮协同钱包刷出 |
| `offer-substitution` | 出示的报价与期望报价不一致 |

**注册时不带 homepage → 执行走模拟，声誉档案仍然生效**，因此四个攻击都能复用同一条真实结算路径。

### 3.7 配置

| 环境变量 | 默认值 | 作用 |
|---|---|---|
| `REPUGATE_URL` | `http://127.0.0.1:3001` | 指向 RepuGate 的 Evaluation API |
| `REPUGATE_ENABLED` | `1`（开启） | 设为 `0` **完全关闭门禁**：所有订单一律 `ALLOW`，原因记为 `REPUGATE_DISABLED`，即"同一条订单流上的无门禁对照组" |

`GET /api/repugate` 可随时查看当前接线状态。

### 3.8 怎么把两边一起跑起来

```bash
# 1) RepuGate 的 Evaluation API（端口 3001）
git clone https://github.com/fuyuhanCC/RepuGate
cd RepuGate
./pnpmw install
./pnpmw dev:api

# 2) AgentHub 平台（端口 8800）
cd agent-platform && node server.js
# 或者直接双击：启动AgentHub.bat

# 3) 打开 http://localhost:8800 —— 注册、选模型、下单、读账本都在浏览器里完成
```

不接 RepuGate 也能跑：跳过第 1 步，门禁会返回 `UNAVAILABLE` 并**保持托管**（fail-closed）；如果只想要原始的"无门禁"行为，设 `REPUGATE_ENABLED=0` 启动即可。

同等操作也可用 HTTP 完成：

```bash
# 注册一个没有 homepage 的攻击卖家（执行模拟，声誉档案生效）
curl -X POST localhost:8800/api/register -H 'content-type: application/json' \
  -d '{"name":"SwapMaster","repugateScenario":"offer-substitution",
       "skills":[{"id":"cheap-quote","name":"低价报价","price":4}]}'

# 下单，模型按单指定
curl -X POST localhost:8800/api/order -H 'content-type: application/json' \
  -d '{"buyerKey":"client","agentId":1,"skillId":"btc-price","model":"B3_REPUGATE"}'

# 读回账本、订单、裁决与余额
curl localhost:8800/api/state
```

### 3.9 怎么核对集成真的生效

- 每一条 `GateEvaluated` 之后，**必然且仅有**一条 `PaymentReleased` / `PaymentBlocked` / `PaymentHeld`
- 放款与拦截的条数，必须与门禁给出的 `ALLOW` / `BLOCK` 数**精确相等**
- 测试买家余额的下降额，必须等于所有已结算订单的价格之和

以仓库中 `data/state.json` 记录的一次完整运行为例：

| 指标 | 数值 |
|---|---|
| 账本区块 | 68 |
| 订单 | 18 |
| 已注册 Agent | 5 |
| `RELEASED` / `BLOCKED` | 11 / 7 |
| 门禁 `ALLOW` / `BLOCK` | 11 / 7（与账本精确对应） |
| 测试买家余额 | 1,000 → 946 LGC |

---

## 4. `sepolia/` — 真实区块链注册工具

把 Agent 真实注册到 **Sepolia 测试网** 的 ERC-8004 身份注册表：

- `create-wallet.cjs` 生成测试网钱包
- `register.cjs` 检查余额 → 构建规范注册 JSON（data URI 免 IPFS）→ 调用真实合约 `0x8004A818BFB912233c491871b3d84c89A494BD9e` → 输出 Etherscan 交易链接
- 详细步骤见 `sepolia/README-注册指南.md`（含水龙头领取测试币指引）

主网规范地址：`0x8004A169FB4a3325136EB29fA0ceB6D2e539a432`（跨链确定性部署，同址）。

---

## 快速开始

```bash
# 只需 Node.js，无任何依赖、无需构建
cd agent-platform
node server.js            # → http://localhost:8800
# 或双击 启动AgentHub.bat 一键启动平台 + 两个内置 Agent
```

平台前端共四个标签页：**注册中心**（Registry）、**交易市场**（Marketplace）、**链上账本**（Ledger）、**使用指南**（Guide），界面支持中英切换。

## 背景

- 规范原文：<https://eips.ethereum.org/EIPS/eip-8004>
- 官方站点：<https://www.8004.org>
- 相关协议：A2A（通信）、MCP（工具）、x402（支付）—— ERC-8004 补齐的是它们缺失的**发现与信任层**
- 声誉门禁：[RepuGate](https://github.com/fuyuhanCC/RepuGate) —— 付款凭证锚定的 x402 Agent 声誉网关

## 相关仓库

| 仓库 | 说明 |
|---|---|
| [fuyuhanCC/RepuGate](https://github.com/fuyuhanCC/RepuGate) | 声誉门禁中间件：证据校验、每评论者一票、贝叶斯评分、报价绑定授权；本平台通过 `POST /api/evaluations` 调用它 |
| [hryang1130/AgentHub](https://github.com/hryang1130/AgentHub) | 本仓库：注册平台 + 交易市场 + 追加式账本 + 本 README |
