# TrustlessAgent · ERC-8004 学习与演示项目

围绕 **ERC-8004（Trustless Agents）** 标准构建的课程展示与实操项目，包含三个部分：

## 1. `erc8004-demo/` — 单文件协议演示

纯前端、离线可用的 ERC-8004 模拟演示（中英双语切换）：

- 三大注册表模拟：IdentityRegistry / ReputationRegistry / ValidationRegistry
- 完整流程：注册 → 发现 → 委托 → 反馈 → 验证（TEE / zkML / 重执行）
- 模拟链事件账本（Explorer），直观展示"任务链下执行、信任信号上链"的设计

直接双击 `index.html` 即可运行。

## 2. `agent-platform/` — 本地注册平台 + 交易市场（AgentHub）

零依赖 Node 服务，一个微缩的"无信任 Agent 经济"生态：

```
启动AgentHub.bat        ← 双击一键启动全部服务
server.js               ← 注册平台 + 交易市场（端口 8800）
agents/demo-agent.js    ← 自托管主页的可运行 Agent 示例
public/index.html       ← 平台前端（注册中心/交易市场/账本/教学说明）
sepolia/                ← 真实链上注册工具（见下）
```

- **注册中心**：register() 上链（模拟链）、agent-card.json（符合 ERC-8004 注册文件规范）、声誉反馈
- **交易市场**：Agent 技能标价上架，订单托管 → 平台真实 HTTP 调用 Agent 执行 → 放款（本地积分 LGC 模拟 x402 支付层），支持 **Agent-to-Agent 自动交易**
- **自托管 Agent**：`demo-agent.js` 启动自己的 HTTP 服务和主页，公开 `/.well-known/agent-card.json`，启动时自动幂等注册到平台，接受市场订单并真实执行。改 `SKILLS` 数组 + `handleExecute()` 即可变成你自己的 Agent

## 3. `sepolia/` — 真实区块链注册工具

把 Agent 真实注册到 **Sepolia 测试网** 的 ERC-8004 身份注册表：

- `create-wallet.cjs` 生成演示钱包
- `register.cjs` 检查余额 → 构建规范注册 JSON（data URI 免 IPFS）→ 调用真实合约 `0x8004A818BFB912233c491871b3d84c89A494BD9e` → 输出 Etherscan 交易链接
- 详细步骤见 `sepolia/README-注册指南.md`（含水龙头领取测试币指引）

主网规范地址：`0x8004A169FB4a3325136EB29fA0ceB6D2e539a432`（跨链确定性部署，同址）。

## 背景

- 规范原文：https://eips.ethereum.org/EIPS/eip-8004
- 官方站点：https://www.8004.org
- 相关协议：A2A（通信）、MCP（工具）、x402（支付）——ERC-8004 补齐的是它们缺失的**发现与信任层**
