# Sepolia 真实注册指南（课堂加分项）

把演示从"模拟"升级到"真实链上"，只需要 3 步。

## 第 0 步：环境

需要 Node 22（本机已具备）。ethers 已安装在：
`C:\Users\kevin\.workbuddy\binaries\node\workspace\node_modules`

运行脚本时设置（或直接用下面的命令）：

```
set NODE_PATH=C:\Users\kevin\.workbuddy\binaries\node\workspace\node_modules
```

## 第 1 步：生成演示钱包

```
cd D:\Code\TrustLessAgent\agent-platform\sepolia
"C:\Users\kevin\.workbuddy\binaries\node\versions\22.22.2-3\node.exe" create-wallet.cjs
```

输出地址，私钥自动写入 `.env`（**仅测试网演示用**）。

## 第 2 步：领取 Sepolia 测试 ETH（免费）

到任一水龙头，把第 1 步输出的地址填进去：

1. **https://sepolia-faucet.pk910.de** —— PoW 挖矿式，浏览器里"挖"几分钟即可，无需注册账号（推荐）
2. https://cloud.google.com/application/web3/faucet/ethereum/sepolia —— 需 Google 登录
3. https://www.alchemy.com/faucets/ethereum-sepolia —— 需注册

需要量很小：注册一笔约 0.0002 ETH。

## 第 3 步：真实上链注册

```
"C:\Users\kevin\.workbuddy\binaries\node\versions\22.22.2-3\node.exe" register.cjs --name "MyFirstOnchainAgent" --desc "Course demo agent"
```

脚本会自动：检查余额 → 构建符合规范的注册 JSON（data URI 内嵌，无需 IPFS）→
staticCall 预演得到 agentId → 广播交易 → 等待确认。

成功后输出 **Etherscan 交易链接**——课堂上直接打开，就能看到真实的
`Register` 交易和你的链上 agentId。

## 真实合约地址（Sepolia 测试网）

| 合约 | 地址 |
|---|---|
| IdentityRegistry | `0x8004A818BFB912233c491871b3d84c89A494BD9e` |
| ReputationRegistry | `0x8004B663056A597Dffe9eCcC1965A193B7388713` |

以太坊主网的规范地址为
`0x8004A169FB4a3325136EB29fA0ceB6D2e539a432`（注册需真实 gas，约 $5–20，仅查询免费）。

## 课堂讲法建议

1. 先用本地平台（AgentHub）演示完整流程：注册 → 市场 → Agent 互相交易；
2. 然后打开 Etherscan 的真实交易："刚才的一切，就是这笔交易在做的事"；
3. 强调两点一致：注册 JSON 格式完全一致、IdentityRegistry 合约完全一致——只是链从本地换成了公链。
