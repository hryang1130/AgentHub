/*
 * ERC-8004 风格 · 本地智能体注册平台 + 交易市场
 * 零依赖 Node 服务，端口 8800
 * 启动: node server.js
 */
const http = require('http');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const PORT = process.env.PORT || 8800;
const DATA_FILE = path.join(__dirname, 'data', 'state.json');
const PUB = path.join(__dirname, 'public');

/* ---------- 工具 ---------- */
const mockHash = () => '0x' + crypto.randomBytes(20).toString('hex');
const mockAddr = () => '0x' + crypto.randomBytes(20).toString('hex').padStart(40, '0');
const CLIENT = '0xA11cE0000000000000000000000000000000c0dE'; // 演示买家
const LOCAL_REGISTRY = 'eip155:31337:0xL0ca1Reg1stry000000000000000000000000'; // 本地"链"标识

function readBody(req) {
  return new Promise(resolve => {
    let d = '';
    req.on('data', c => (d += c));
    req.on('end', () => { try { resolve(JSON.parse(d || '{}')); } catch (e) { resolve({}); } });
  });
}
function postTo(url, obj) {
  return new Promise((resolve, reject) => {
    const u = new URL(url);
    const r = http.request({ hostname: u.hostname, port: u.port, path: u.pathname, method: 'POST',
      headers: { 'content-type': 'application/json' } }, res => {
      let d = ''; res.on('data', c => (d += c));
      res.on('end', () => { try { resolve(JSON.parse(d)); } catch (e) { resolve({ raw: d }); } });
    });
    r.on('error', reject);
    r.setTimeout(5000, () => r.destroy(new Error('agent 无响应')));
    r.end(JSON.stringify(obj));
  });
}

/* ---------- 状态与账本 ---------- */
function load() { try { return JSON.parse(fs.readFileSync(DATA_FILE, 'utf8')); } catch (e) { return null; } }
function save() {
  fs.mkdirSync(path.dirname(DATA_FILE), { recursive: true });
  fs.writeFileSync(DATA_FILE, JSON.stringify(state, null, 2));
}
let state = load() || {
  block: 0, agents: [], orders: [], ledger: [], instances: {},
  credits: { [CLIENT]: 1000 }
};
if (!state.instances) state.instances = {};
function tx(ev, data) {
  state.block++;
  state.ledger.unshift({ block: state.block, hash: mockHash(), ev, data, ts: Date.now() });
}

/* ---------- 业务 ---------- */
function agentCard(a) {
  const origin = 'http://localhost:' + PORT;
  return {
    type: 'https://eips.ethereum.org/EIPS/eip-8004#registration-v1',
    name: a.name,
    description: a.desc,
    url: a.homepage || origin + '/agent/' + a.id,
    services: a.homepage
      ? [{ name: 'A2A', endpoint: a.homepage.replace(/\/$/, '') + '/.well-known/agent-card.json' },
         { name: 'web', endpoint: a.homepage }]
      : [{ name: 'web', endpoint: origin + '/agent/' + a.id }],
    skills: a.skills.map(s => ({ id: s.id, name: s.name, description: s.desc, price: s.price })),
    registrations: [{ agentRegistry: LOCAL_REGISTRY, agentId: String(a.id) }],
    supportedTrust: ['reputation'],
    x402Support: true
  };
}

function registerAgent(b) {
  // 幂等：同一实例重启不重复注册
  if (b.instanceId && state.instances[b.instanceId]) {
    const a = state.agents.find(x => x.id === state.instances[b.instanceId]);
    if (a) { a.name = b.name || a.name; a.desc = b.desc || a.desc; save(); return { agent: a, existed: true }; }
  }
  const id = state.agents.length + 1;
  const owner = mockAddr();
  const a = {
    id, name: b.name || 'Unnamed Agent',
    desc: b.desc || '（无描述）',
    owner,
    homepage: b.homepage || null,          // 自托管主页 URL（可空 = 平台代管档案页）
    skills: (b.skills || []).map((s, i) => ({
      id: s.id || ('skill-' + (i + 1)), name: s.name, desc: s.desc || '', price: +s.price || 0
    })),
    feedbacks: [], validations: [], createdAt: Date.now()
  };
  state.agents.push(a);
  if (state.credits[owner] === undefined) state.credits[owner] = 200; // 新 Agent 空投启动资金，便于 Agent-to-Agent 交易演示
  if (b.instanceId) state.instances[b.instanceId] = id;
  tx('Register', 'agentId=' + id + ' · ' + a.name);
  a.skills.forEach(s => tx('ServiceListed', 'agentId=' + id + ' · ' + s.name + ' · ' + s.price + ' LGC'));
  save();
  return { agent: a, existed: false };
}

async function executeOrder(b) {
  // b: { buyerKey: 'client' | 'agent:<id>', agentId, skillId }
  const a = state.agents.find(x => x.id === +b.agentId);
  if (!a) return { ok: false, error: 'agent 不存在' };
  const s = a.skills.find(x => x.id === b.skillId);
  if (!s) return { ok: false, error: '技能不存在' };

  let buyerKey = CLIENT, buyerLabel = '演示买家';
  if (b.buyerKey && b.buyerKey.startsWith('agent:')) {
    const ba = state.agents.find(x => x.id === +b.buyerKey.split(':')[1]);
    if (!ba) return { ok: false, error: '买家 agent 不存在' };
    buyerKey = ba.owner; buyerLabel = ba.name;
  }
  if ((state.credits[buyerKey] || 0) < s.price) return { ok: false, error: '买家积分不足（余额 ' + (state.credits[buyerKey] || 0) + ' LGC）' };

  const steps = [];
  const orderId = state.orders.length + 1;

  // 1. 托管扣款
  state.credits[buyerKey] -= s.price;
  steps.push(['info', '订单 #' + orderId + ' 创建 — 托管 ' + s.price + ' LGC（买家: ' + buyerLabel + '）']);
  tx('OrderCreated', 'orderId=' + orderId + ' · ' + buyerLabel + ' → ' + a.name + ' · ' + s.price + ' LGC');

  // 2. 调用 agent 执行（自托管 agent 走真实 HTTP，平台代管的模拟执行）
  let result, live = false;
  if (a.homepage) {
    try {
      const resp = await postTo(a.homepage.replace(/\/$/, '') + '/api/execute', { skillId: s.id, orderId });
      if (resp && resp.ok) { result = resp.result; live = true; }
      else result = 'agent 返回异常: ' + JSON.stringify(resp).slice(0, 120);
    } catch (e) { result = 'agent 无响应（' + e.message + '）'; }
  } else {
    result = '【模拟执行结果】"' + s.name + '" 已完成。平台代管 agent 不含真实后端，注册真实后端 agent 后将走 HTTP 调用。';
  }
  steps.push([live ? 'ok' : 'warn', '任务执行完成' + (live ? '（真实调用 ' + a.homepage + '）' : '（模拟）')]);
  steps.push(['info', '结果: ' + result]);

  // 3. 放款
  state.credits[a.owner] = (state.credits[a.owner] || 0) + s.price;
  steps.push(['ok', '支付放款 — ' + s.price + ' LGC 已转入 ' + a.name + ' 钱包']);
  tx('PaymentReleased', 'orderId=' + orderId + ' · ' + s.price + ' LGC → agentId=' + a.id);

  state.orders.unshift({ id: orderId, buyerLabel, buyerKey, agentId: a.id, agentName: a.name,
    skill: s.name, price: s.price, result, live, ts: Date.now() });
  save();
  return { ok: true, steps, result, orderId };
}

/* ---------- 页面模板 ---------- */
const CSS = `:root{--bg:#F7F7F4;--card:#FFF;--border:#E3E1D9;--text:#2C2C2A;--muted:#6E6D66;--blue:#185FA5;--blue-bg:#E6F1FB;--purple:#534AB7;--purple-bg:#EEEDFE;--teal:#0F6E56;--teal-bg:#E1F5EE;--amber:#854F0B;--amber-bg:#FAEEDA;--mono:ui-monospace,Consolas,monospace}
*{box-sizing:border-box;margin:0;padding:0}body{font-family:-apple-system,'Segoe UI','Microsoft YaHei',sans-serif;background:var(--bg);color:var(--text);font-size:14px;line-height:1.6}
a{color:var(--blue);text-decoration:none}a:hover{text-decoration:underline}
header{background:var(--card);border-bottom:1px solid var(--border);padding:14px 24px;display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:8px}
.badge{display:inline-block;font-size:11px;padding:2px 8px;border-radius:10px;margin-right:6px}
.b-blue{background:var(--blue-bg);color:var(--blue)}.b-purple{background:var(--purple-bg);color:var(--purple)}
.b-teal{background:var(--teal-bg);color:var(--teal)}.b-amber{background:var(--amber-bg);color:var(--amber)}.b-gray{background:#F1EFE8;color:var(--muted)}
.mono{font-family:var(--mono);font-size:12px}.muted{color:var(--muted);font-size:12.5px}
main{max-width:980px;margin:20px auto;padding:0 20px}
.card{background:var(--card);border:1px solid var(--border);border-radius:12px;padding:18px 20px;margin-bottom:16px}
h2{font-size:15px;font-weight:600;margin-bottom:10px}
table{width:100%;border-collapse:collapse;font-size:12.5px}th{text-align:left;color:var(--muted);font-weight:500;padding:8px 10px;border-bottom:1px solid var(--border)}td{padding:8px 10px;border-bottom:1px solid var(--border)}tr:last-child td{border-bottom:none}
.btn{display:inline-block;border:none;border-radius:8px;padding:7px 14px;font-size:13px;cursor:pointer;font-family:inherit;margin:8px 6px 0 0}
.btn-blue{background:var(--blue);color:#fff}.btn-teal{background:var(--teal);color:#fff}.btn-ghost{background:#fff;border:1px solid var(--border);color:var(--text)}
.skills{display:flex;flex-wrap:wrap;gap:10px;margin-top:10px}
.skill{border:1px solid var(--border);border-radius:10px;padding:12px 14px;min-width:220px;flex:1}
.price{font-family:var(--mono);color:var(--purple);font-weight:600}
.hero{background:linear-gradient(135deg,var(--blue-bg),var(--purple-bg));border-radius:14px;padding:28px;margin-bottom:18px}`;

function profilePage(a) {
  const skills = a.skills.length
    ? '<div class="skills">' + a.skills.map(s => '<div class="skill"><b>' + s.name + '</b><div class="muted">' + s.desc + '</div><div class="price">' + s.price + ' LGC</div></div>').join('') + '</div>'
    : '<p class="muted">未上架技能</p>';
  const fb = a.feedbacks.length
    ? a.feedbacks.map(f => '<tr><td>' + f.value + '</td><td class="muted">' + (f.note || '') + '</td></tr>').join('')
    : '<tr><td colspan="2" class="muted">暂无反馈</td></tr>';
  return '<!DOCTYPE html><html lang="zh-CN"><head><meta charset="UTF-8"><title>' + a.name + ' · 平台档案</title><style>' + CSS + '</style></head><body>' +
    '<header><div><h2 style="margin:0">' + a.name + ' <span class="mono muted">#' + a.id + '</span></h2>' +
    '<div class="muted">' + a.desc + '</div></div><a href="/">← 返回平台</a></header><main>' +
    '<div class="hero"><span class="badge b-blue">平台代管档案页</span>' +
    (a.homepage ? ' <span class="badge b-teal">自托管主页已验证</span> <a href="' + a.homepage + '">访问 Agent 主页 →</a>' : ' <span class="badge b-gray">无自托管主页</span>') +
    '<div class="mono muted" style="margin-top:10px">owner: ' + a.owner + '</div>' +
    '<div class="mono muted">agentURI: ' + 'http://localhost:' + PORT + '/api/agents/' + a.id + '/card</div></div>' +
    '<div class="card"><h2>上架技能</h2>' + skills + '</div>' +
    '<div class="card"><h2>声誉反馈</h2><table><tr><th>分值</th><th>备注</th></tr>' + fb + '</table></div>' +
    '</main></body></html>';
}

/* ---------- HTTP 服务 ---------- */
const server = http.createServer(async (req, res) => {
  const u = new URL(req.url, 'http://localhost:' + PORT);
  const p = u.pathname;
  const json = obj => { res.writeHead(200, { 'content-type': 'application/json; charset=utf-8' }); res.end(JSON.stringify(obj)); };
  const html = str => { res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' }); res.end(str); };

  try {
    /* API */
    if (p === '/api/state' && req.method === 'GET') return json(state);
    if (p === '/api/register' && req.method === 'POST') {
      const b = await readBody(req);
      const r = registerAgent(b);
      return json({ ok: true, agentId: r.agent.id, existed: r.existed, card: agentCard(r.agent) });
    }
    let m;
    if ((m = p.match(/^\/api\/agents\/(\d+)\/card$/))) {
      const a = state.agents.find(x => x.id === +m[1]);
      return a ? json(agentCard(a)) : (res.writeHead(404), res.end('not found'));
    }
    if (p === '/api/order' && req.method === 'POST') {
      const b = await readBody(req);
      return json(await executeOrder(b));
    }
    if (p === '/api/feedback' && req.method === 'POST') {
      const b = await readBody(req);
      const a = state.agents.find(x => x.id === +b.agentId);
      if (!a) return json({ ok: false, error: 'agent 不存在' });
      const v = Math.max(-100, Math.min(100, +b.value || 0));
      a.feedbacks.push({ client: b.client || CLIENT, value: v, note: b.note || '', ts: Date.now() });
      tx('GiveFeedback', 'agentId=' + a.id + ' · value=' + v);
      save();
      return json({ ok: true });
    }
    if (p === '/api/reset' && req.method === 'POST') {
      state = { block: 0, agents: [], orders: [], ledger: [], instances: {}, credits: { [CLIENT]: 1000 } };
      save(); return json({ ok: true });
    }

    /* Agent 档案页 */
    if ((m = p.match(/^\/agent\/(\d+)$/))) {
      const a = state.agents.find(x => x.id === +m[1]);
      return a ? html(profilePage(a)) : (res.writeHead(404), res.end('not found'));
    }

    /* 静态文件 */
    if (p === '/' || p === '/index.html') {
      return html(fs.readFileSync(path.join(PUB, 'index.html'), 'utf8'));
    }

    res.writeHead(404); res.end('not found');
  } catch (e) {
    json({ ok: false, error: e.message });
  }
});

server.listen(PORT, () => {
  console.log('✅ 注册平台 + 交易市场已启动: http://localhost:' + PORT);
  console.log('   演示买家地址: ' + CLIENT + ' (1000 LGC)');
});
