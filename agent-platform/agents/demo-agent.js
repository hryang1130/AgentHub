/*
 * demo-agent.js — 一个"有自己主页"的可运行 Agent 示例
 *
 * 它会做四件事：
 *   1. 启动自己的 HTTP 服务，托管自己的主页（http://localhost:<port>/）
 *   2. 公开 A2A 风格的 agent-card.json（/.well-known/agent-card.json）
 *   3. 启动时自动注册到本地平台（幂等——重启不会重复注册）
 *   4. 接受平台转发的订单，真实执行技能并返回结果
 *
 * 运行示例：
 *   node demo-agent.js --port 8801 --name "NovaBot 行情助手" --role oracle
 *   node demo-agent.js --port 8802 --name "LyraBot 分析师" --role analyst
 *
 * 改造你自己的 Agent：
 *   - 修改 SKILLS（技能列表）和 handleExecute()（技能逻辑）
 *   - 修改 homePage() 里的 HTML 模板，做出你自己的主页风格
 */
const http = require('http');
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const { pageShell, langSwitch } = require(path.join(__dirname, '..', 'theme'));

/* ---------- 命令行参数 ---------- */
const args = {};
process.argv.slice(2).forEach((v, i, arr) => { if (v.startsWith('--')) args[v.slice(2)] = arr[i + 1] && !arr[i + 1].startsWith('--') ? arr[i + 1] : true; });

const PORT = +(args.port || 8801);
const NAME = args.name || 'MyAgent';
const ROLE = args.role || 'oracle';
const PLATFORM = args.platform || 'http://localhost:8800';
// RepuGate 声誉档案（可选）：honest-service / ungrounded-feedback / receipt-replay / reviewer-concentration / offer-substitution
const SCENARIO = args.scenario || 'honest-service';
const THEME = ROLE === 'analyst'
  ? { c1: '#534AB7', c2: '#185FA5', bg1: '#EEEDFE', bg2: '#E6F1FB', tag: '分析师' }
  : { c1: '#0F6E56', c2: '#185FA5', bg1: '#E1F5EE', bg2: '#E6F1FB', tag: '行情' };

/* ---------- 技能配置（改成你自己的！） ---------- */
const SKILLS = ROLE === 'analyst' ? [
  { id: 'portfolio-analysis', name: '投资组合分析', desc: '输入任意文字描述的持仓，返回模拟的风险分析报告', price: 18 },
  { id: 'market-summary', name: '市场周报', desc: '生成一段模拟的本周市场总结', price: 10 }
] : [
  { id: 'btc-price', name: 'BTC 实时报价', desc: '返回模拟的 BTC/USDT 最新价格', price: 5 },
  { id: 'market-flash', name: '行情快报', desc: '生成一段简短的模拟市场快报', price: 12 }
];
const DESC = ROLE === 'analyst'
  ? '专注投资组合分析与风险评估的自主智能体，托管于本地注册平台。'
  : '提供加密货币实时报价与市场快报的自主智能体，托管于本地注册平台。';

/* ---------- 技能执行逻辑（改成你自己的！） ---------- */
function handleExecute(skillId) {
  const rnd = (min, max, d) => (min + Math.random() * (max - min)).toFixed(d);
  switch (skillId) {
    case 'btc-price':
      return { ok: true, result: 'BTC/USDT = $' + rnd(61000, 73000, 2) + '（24h ' + (Math.random() > 0.5 ? '+' : '-') + rnd(0.2, 5.1, 2) + '%）· 数据来源: ' + NAME + ' 内置模拟行情' };
    case 'market-flash':
      return { ok: true, result: '【' + NAME + ' 快报】BTC 在 $' + rnd(61, 73, 0) + 'k 区间震荡，主流币波动率 ' + rnd(2, 8, 1) + '%，市场情绪' + ['偏多', '中性', '偏空'][Math.floor(Math.random() * 3)] + '。' };
    case 'portfolio-analysis':
      return { ok: true, result: '【' + NAME + ' 分析】模拟结论：建议组合波动率控制在 ' + rnd(10, 25, 1) + '% 以内，加密资产敞口 ' + rnd(5, 30, 0) + '%，并保留 ' + rnd(10, 30, 0) + '% 现金应对回撤风险。' };
    case 'market-summary':
      return { ok: true, result: '【' + NAME + ' 周报】本周市场整体' + ['上行', '盘整', '回调'][Math.floor(Math.random() * 3)] + '，风险事件集中在宏观数据发布窗口。' };
    default:
      return { ok: false, error: '未知技能: ' + skillId };
  }
}

/* ---------- 幂等实例 ID（重启不重复注册） ---------- */
const idFile = path.join(__dirname, 'data', 'instance-' + PORT + '.txt');
let instanceId;
try { instanceId = fs.readFileSync(idFile, 'utf8').trim(); } catch (e) { instanceId = crypto.randomUUID(); }
try { fs.mkdirSync(path.dirname(idFile), { recursive: true }); fs.writeFileSync(idFile, instanceId); } catch (e) {}

let myAgentId = null;

/* ---------- 页面 ---------- */
const esc = s => String(s == null ? '' : s)
  .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
  .replace(/"/g, '&quot;').replace(/'/g, '&#39;');

function homePage() {
  const skillHtml = SKILLS.map(s =>
    '<div class="skillcard"><h4>' + esc(s.name) + '</h4>' +
    '<div class="sdesc">' + esc(s.desc) + '</div>' +
    '<div class="sprice">' + s.price + ' LGC</div></div>').join('');

  const platformUrl = PLATFORM;
  const profileUrl = platformUrl + (myAgentId ? '/agent/' + myAgentId : '');
  const roleKey = ROLE === 'analyst' ? 'home.tagAnalyst' : 'home.tagOracle';

  // 传给前端 i18n 的运行时变量（含 Agent 自身信息，双语各一份）
  const vars = {
    'home.name': NAME,
    'home.role': ROLE === 'analyst' ? '分析师' : '行情',
    'home.roleEn': ROLE === 'analyst' ? 'Analyst' : 'Oracle',
    'home.desc': DESC,
    'home.descEn': ROLE === 'analyst'
      ? 'An autonomous agent focused on portfolio analysis and risk assessment, hosted on a local registry.'
      : 'An autonomous agent providing live crypto quotes and market briefs, hosted on a local registry.',
    'home.port': String(PORT)
  };

  return `<!DOCTYPE html><html lang="zh-CN"><head><meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>${esc(NAME)} · ${esc(ROLE === 'analyst' ? 'Analyst Agent' : 'Oracle Agent')}</title>
${pageShell('', vars)}
</head><body><div class="pagewrap">
<header class="site">
  <div class="site-inner">
    <a class="brand" href="/"><span class="brand-mark">A</span><span>AgentHub</span></a>
    <div class="spacer"></div>
    <div class="site-actions">
      <span class="status online"><span class="status-dot"></span>localhost:${PORT}</span>
      ${langSwitch()}
      <a class="btn btn-quiet btn-sm" href="${esc(platformUrl)}" data-i18n="common.back">← 返回平台</a>
    </div>
  </div>
</header>
<main style="padding-top:0">
  <section class="ticket page-hero">
    <div class="eyebrow" style="margin-bottom:18px"><span></span><span data-i18n="home.kicker">Self-hosted agent</span></div>
    <div class="mark">${esc(NAME.slice(0, 1).toUpperCase())}</div>
    <h1>${esc(NAME)}</h1>
    <div class="tagline">${esc(DESC)}</div>
    <div class="tags">
      <span class="tag">${esc(THEME.tag)} Agent</span>
      <span class="tag">ERC-8004</span>
      <span class="tag">port ${PORT}</span>
    </div>
  </section>

  <section>
    <div class="section-heading">
      <div>
        <span class="section-index" data-i18n="home.skillsIndex">技能目录</span>
        <h2 data-i18n="home.skills">我的技能</h2>
      </div>
      <p><a href="${esc(platformUrl)}" data-i18n="home.skillsNote">在 AgentHub 市场可直接下单</a></p>
    </div>
    <div class="skgrid">${skillHtml}</div>
  </section>

  <section>
    <div class="section-heading">
      <div>
        <span class="section-index" data-i18n="home.identityIndex">身份信息</span>
        <h2 data-i18n="home.identity">身份信息</h2>
      </div>
    </div>
    <div class="table-wrap" style="max-width:640px"><table style="min-width:0">
      <tbody>
        <tr><td class="muted" style="width:132px">agentId</td><td class="mono">${myAgentId ? '#' + myAgentId : '<span data-i18n="home.registered">注册中…</span>'}</td></tr>
        <tr><td class="muted">registry</td><td class="mono">eip155:31337 · 0xL0ca1Reg1stry000000000000000000000000</td></tr>
        <tr><td class="muted">agent-card</td><td class="mono"><a href="/.well-known/agent-card.json">/.well-known/agent-card.json</a></td></tr>
        <tr><td class="muted">profile</td><td class="mono"><a href="${esc(profileUrl)}" data-i18n="home.platformProfile">平台档案</a></td></tr>
      </tbody>
    </table></div>
  </section>

  <section>
    <div class="section-heading">
      <div>
        <span class="section-index" data-i18n="home.aboutIndex">自托管</span>
        <h2 data-i18n="home.aboutTitle">这是一个真实的自托管 Agent</h2>
      </div>
    </div>
    <div class="callout">
      <span data-i18n="home.about1">你现在看到的页面由</span>
      <span class="mono">${esc(NAME)}</span>
      <span data-i18n="home.about2">进程自己托管（端口</span>
      <span class="mono">${PORT}</span><span>）</span><span data-i18n="home.about3">。市场里有人购买它的技能时，平台会直接 POST 调用本进程的</span>
      <span class="mono">/api/execute</span><span data-i18n="home.about4">，执行结果真实返回，报酬通过本地积分结算——类比真实世界中的 x402 支付。</span>
    </div>
  </section>
</main>
<footer class="site"><div class="site-footer">
  <span>${esc(NAME)} · localhost:${PORT}</span>
  <span data-i18n="home.footer">自托管 Agent 主页 · 由本地 ERC-8004 风格注册表驱动</span>
</div></footer>
</div></body></html>`;
}

/* ---------- HTTP 服务 ---------- */
const server = http.createServer((req, res) => {
  const u = new URL(req.url, 'http://localhost:' + PORT);
  if (u.pathname === '/' || u.pathname === '/index.html') {
    res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' });
    return res.end(homePage());
  }
  if (u.pathname === '/.well-known/agent-card.json') {
    res.writeHead(200, { 'content-type': 'application/json; charset=utf-8' });
    return res.end(JSON.stringify({
      name: NAME, description: DESC, url: 'http://localhost:' + PORT + '/', version: '1.0.0',
      skills: SKILLS.map(s => ({ id: s.id, name: s.name, description: s.desc })),
      registrations: myAgentId ? [{ agentRegistry: 'eip155:31337:0xL0ca1Reg1stry000000000000000000000000', agentId: String(myAgentId) }] : [],
      supportedTrust: ['reputation'], x402Support: true
    }, null, 2));
  }
  if (u.pathname === '/api/execute' && req.method === 'POST') {
    let d = '';
    req.on('data', c => (d += c));
    req.on('end', () => {
      try {
        const body = JSON.parse(d || '{}');
        console.log('  📥 收到订单执行请求: ' + body.skillId + (body.orderId ? ' (订单#' + body.orderId + ')' : ''));
        const out = handleExecute(body.skillId);
        res.writeHead(200, { 'content-type': 'application/json; charset=utf-8' });
        res.end(JSON.stringify(out));
      } catch (e) { res.writeHead(500); res.end(JSON.stringify({ ok: false, error: e.message })); }
    });
    return;
  }
  res.writeHead(404); res.end('not found');
});

/* ---------- 启动 & 自动注册 ---------- */
server.listen(PORT, () => {
  console.log('✅ ' + NAME + ' 已启动');
  console.log('   主页: http://localhost:' + PORT + '/');
  console.log('   Agent Card: http://localhost:' + PORT + '/.well-known/agent-card.json');

  const register = (attempt) => {
    const body = JSON.stringify({ instanceId, name: NAME, desc: DESC, homepage: 'http://localhost:' + PORT,
      repugateScenario: SCENARIO,
      skills: SKILLS.map(s => ({ id: s.id, name: s.name, desc: s.desc, price: s.price })) });
    const req = http.request(PLATFORM + '/api/register', { method: 'POST', headers: { 'content-type': 'application/json' } }, res => {
      let d = ''; res.on('data', c => (d += c));
      res.on('end', () => {
        try {
          const r = JSON.parse(d);
          if (r.ok && r.agentId !== myAgentId) {
            myAgentId = r.agentId;
            console.log((r.existed ? '   ♻️  已在注册表中（幂等注册）: agentId=' : '   📝 自动注册成功: agentId=') + r.agentId);
          }
        } catch (e) { retry(attempt); }
      });
    });
    req.on('error', () => retry(attempt));
    req.end(body);
  };
  const retry = (attempt) => {
    if (attempt < 10) { console.log('   ⏳ 平台未就绪，' + attempt * 2 + 's 后重试注册…'); setTimeout(() => register(attempt + 1), 2000); }
    else console.log('   ❌ 无法连接平台（' + PLATFORM + '），仅以独立模式运行');
  };
  register(1);
  setInterval(() => register(1), 15000); // 心跳重注册：平台数据被重置后自动回到注册表（服务端幂等）
});
