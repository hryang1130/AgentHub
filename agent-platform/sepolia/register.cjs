/*
 * register.cjs — 把你的 Agent 真实注册到 Sepolia 测试网的 ERC-8004 身份注册表
 *
 * 运行: NODE_PATH=<工作区>/node_modules node register.cjs --name "MyAgent" --desc "..." 
 *
 * 流程：读 .env 私钥 → 检查余额 → 构建注册 JSON（data URI 形式，无需 IPFS）
 *       → 调用 IdentityRegistry.register(agentURI) → 输出交易哈希与 agentId
 */
const { ethers } = require('ethers');
const fs = require('fs');
const path = require('path');

const IDENTITY_REGISTRY = '0x8004A818BFB912233c491871b3d84c89A494BD9e'; // Sepolia 官方部署
const RPCS = [
  'https://ethereum-sepolia-rpc.publicnode.com',
  'https://rpc.sepolia.org',
  'https://1rpc.io/sepolia'
];

const args = {};
process.argv.slice(2).forEach((v, i, arr) => { if (v.startsWith('--')) args[v.slice(2)] = arr[i + 1] && !arr[i + 1].startsWith('--') ? arr[i + 1] : true; });

async function getProvider() {
  for (const rpc of RPCS) {
    try {
      const p = new ethers.JsonRpcProvider(rpc);
      await p.getBlockNumber();
      console.log('已连接 RPC: ' + rpc);
      return p;
    } catch (e) { console.log('RPC 不可用: ' + rpc); }
  }
  throw new Error('所有公共 RPC 均不可用，请检查网络');
}

(async () => {
  const envPath = path.join(__dirname, '.env');
  if (!fs.existsSync(envPath)) { console.log('❌ 尚未生成钱包，请先运行 create-wallet.cjs'); process.exit(1); }
  const env = Object.fromEntries(fs.readFileSync(envPath, 'utf8').trim().split('\n').map(l => l.split('=')));
  const wallet = new ethers.Wallet(env.PRIVATE_KEY);
  console.log('钱包地址: ' + wallet.address);

  const provider = await getProvider();
  const signer = wallet.connect(provider);
  const balance = await provider.getBalance(wallet.address);
  console.log('Sepolia ETH 余额: ' + ethers.formatEther(balance));

  if (balance === 0n) {
    console.log('');
    console.log('❌ 余额为 0。请先到以下任一水龙头领取测试 ETH（选一个即可）：');
    console.log('   1. https://sepolia-faucet.pk910.de  （PoW 挖矿式，浏览器里挖几分钟，无需登录，最推荐）');
    console.log('   2. https://cloud.google.com/application/web3/faucet/ethereum/sepolia （需 Google 登录）');
    console.log('   3. https://www.alchemy.com/faucets/ethereum-sepolia （需注册）');
    console.log('   领取地址填: ' + wallet.address);
    console.log('   到账后重新运行本脚本即可。');
    process.exit(1);
  }

  const name = args.name || 'MyFirstOnchainAgent';
  const desc = args.desc || 'My first ERC-8004 agent, registered live on Sepolia.';
  const registration = {
    type: 'https://eips.ethereum.org/EIPS/eip-8004#registration-v1',
    name, description: desc,
    services: [{ name: 'web', endpoint: 'https://example.com/' }],
    supportedTrust: ['reputation']
  };
  const agentURI = 'data:application/json;base64,' + Buffer.from(JSON.stringify(registration)).toString('base64');

  const abi = ['function register(string agentURI) external returns (uint256)'];
  const registry = new ethers.Contract(IDENTITY_REGISTRY, abi, signer);

  const agentId = await registry.register.staticCall(agentURI);
  console.log('注册 JSON（data URI 形式，内嵌于交易）: ' + JSON.stringify(registration).slice(0, 100) + '…');
  console.log('预计 agentId: ' + agentId.toString());
  console.log('发送交易中…');

  const tx = await registry.register(agentURI);
  console.log('交易已广播: https://sepolia.etherscan.io/tx/' + tx.hash);
  const receipt = await tx.wait();
  console.log('✅ 已确认！区块 #' + receipt.blockNumber + ', gas ' + receipt.gasUsed.toString());
  console.log('');
  console.log('🎉 恭喜 — 你的 Agent 已真实上链！');
  console.log('   链上身份: eip155:11155111:' + IDENTITY_REGISTRY + ':' + agentId.toString());
  console.log('   交易: https://sepolia.etherscan.io/tx/' + tx.hash);
  console.log('   打开上面的链接即可看到真实的 Register 交易');
})().catch(e => { console.log('❌ ' + (e.shortMessage || e.message)); process.exit(1); });
