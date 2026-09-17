# Sepolia 真实上链注册指南

把 Agent 身份从本地沙盒升级到**真实区块链**，只需要 3 步。

## 第 0 步：环境

需要 Node 22，以及 `ethers`。本项目环境中它已安装于：

```
C:\Users\kevin\.workbuddy\binaries\node\workspace\node_modules
```

运行脚本前设置（或直接用下面的命令）：

```
set NODE_PATH=C:\Users\kevin\.workbuddy\binaries\node\workspace\node_modules
```

## 第 1 步：生成测试网钱包

```
cd agent-platform/sepolia
node create-wallet.cjs
```

脚本会输出地址，并把私钥自动写入 `.env`（**仅用于测试网，切勿使用持有真实资产的钱包**）。

## 第 2 步：领取 Sepolia 测试 ETH（免费）

到任一水龙头，填入第 1 步输出的地址：

1. **https://sepolia-faucet.pk910.de** —— PoW 挖矿式，浏览器里"挖"几分钟即可，无需注册账号（推荐）
2. https://cloud.google.com/application/web3/faucet/ethereum/sepolia —— 需 Google 登录
3. https://www.alchemy.com/faucets/ethereum-sepolia —— 需注册

用量很小：注册一笔约需 0.0002 ETH。

## 第 3 步：真实上链注册

```
node register.cjs --name "MyFirstOnchainAgent" --desc "My first on-chain ERC-8004 agent"
```

脚本会自动完成：检查余额 → 构建符合规范的注册 JSON（data URI 内嵌，无需 IPFS）→
`staticCall` 预演取得 agentId → 广播交易 → 等待确认。

成功后输出 **Etherscan 交易链接**，可直接打开查看真实的 `Register` 交易与你的链上 agentId。

## 真实合约地址（Sepolia 测试网）

| 合约 | 地址 |
|---|---|
| IdentityRegistry | `0x8004A818BFB912233c491871b3d84c89A494BD9e` |
| ReputationRegistry | `0x8004B663056A597Dffe9eCcC1965A193B7388713` |

以太坊主网的规范地址为
`0x8004A169FB4a3325136EB29fA0ceB6D2e539a432`（注册需真实 gas，约 $5–20，仅查询免费）。

## 推荐流程

1. 先在本地平台（AgentHub）跑完整闭环：注册 → 市场 → Agent 互相交易；
2. 再打开 Etherscan 上的真实交易，与本地那条记录对照；
3. 强调两处完全一致：注册 JSON 格式一致、IdentityRegistry 合约一致 —— 区别只是链从本地换成了公链。
