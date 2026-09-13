/*
 * create-wallet.cjs — 生成一个专用于演示的 Sepolia 钱包
 * 运行: NODE_PATH=<工作区>/node_modules node create-wallet.cjs
 * 结果写入同目录 .env（含私钥，仅用于测试网演示！）
 */
const { Wallet } = require('ethers');
const fs = require('fs');
const path = require('path');

const envPath = path.join(__dirname, '.env');
if (fs.existsSync(envPath)) {
  const cur = fs.readFileSync(envPath, 'utf8');
  const addr = (cur.match(/ADDRESS=(\S+)/) || [])[1];
  console.log('钱包已存在: ' + addr);
  console.log('如需重新生成，请先删除 sepolia/.env');
  process.exit(0);
}
const w = Wallet.createRandom();
fs.writeFileSync(envPath, 'PRIVATE_KEY=' + w.privateKey + '\nADDRESS=' + w.address + '\n');
console.log('✅ 演示钱包已生成');
console.log('   地址: ' + w.address);
console.log('   已写入 sepolia/.env（测试网专用，请勿存入真实资产）');
console.log('');
console.log('下一步：给这个地址领取 Sepolia 测试 ETH（见 README-注册指南.md）');
