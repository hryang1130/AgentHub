/*
 * ERC-8004 风格 · 本地智能体注册平台 + 交易市场
 * 零依赖 Node 服务，端口 8800
 * 启动: node server.js
 */
const http = require('http');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { pageShell, langSwitch, TOKENS } = require('./theme');

const PORT = process.env.PORT || 8800;
const DATA_FILE = path.join(__dirname, 'data', 'state.json');
const PUB = path.join(__dirname, 'public');

/* ---------- RepuGate 声誉门禁（可选） ----------
 * 放款前调用本地 RepuGate Evaluation API (默认 http://127.0.0.1:3001)，
 * 用 B0/B1/B2/B3 模型评估卖家 Agent 声誉并决定 ALLOW 放款 / REVIEW 托管 / BLOCK 退款。
 * RepuGate 未启动时失败关闭（fail-closed）：付款保持托管，不自动放款。
 * 设置 REPUGATE_ENABLED=0 可完全关闭门禁（原始行为）。
 */
const REPUGATE_URL = process.env.REPUGATE_URL || 'http://127.0.0.1:3001';
const REPUGATE_ENABLED = process.env.REPUGATE_ENABLED !== '0';
const REPUGATE_SCENARIOS = ['honest-service', 'ungrounded-feedback', 'receipt-replay', 'reviewer-concentration', 'offer-substitution'];
let _scenarioCache = null, _scenarioCacheAt = 0;

function repuGet(p) {
  return new Promise((resolve, reject) => {
    const u = new URL(p, REPUGATE_URL);
    http.get(u, res => {
      let d = ''; res.on('data', c => (d += c));
      res.on('end', () => { try { resolve(JSON.parse(d)); } catch (e) { reject(new Error('bad json')); } });
    }).on('error', reject);
  });
}
function repuPost(p, obj) {
  return new Promise((resolve, reject) => {
    const u = new URL(p, REPUGATE_URL);
    const body = JSON.stringify(obj);
    const r = http.request({ hostname: u.hostname, port: u.port, path: u.pathname + u.search, method: 'POST',
      headers: { 'content-type': 'application/json', 'content-length': Buffer.byteLength(body) } }, res => {
      let d = ''; res.on('data', c => (d += c));
      res.on('end', () => { try { resolve(JSON.parse(d)); } catch (e) { reject(new Error('bad json: ' + d.slice(0, 100))); } });
    });
    r.on('error', reject);
    r.setTimeout(8000, () => r.destroy(new Error('RepuGate 无响应')));
    r.end(body);
  });
}

async function loadScenarioCatalog() {
  if (_scenarioCache && Date.now() - _scenarioCacheAt < 60000) return _scenarioCache;
  const body = await repuGet('/api/services');
  _scenarioCache = {}; _scenarioCacheAt = Date.now();
  (body.services || []).forEach(s => { _scenarioCache[s.id] = s; });
  return _scenarioCache;
}

// 放款前门禁：返回 { decision: 'ALLOW'|'REVIEW'|'BLOCK'|'UNAVAILABLE', ... } 或抛错
async function repugateGate(agent, orderId, model) {
  const m = model || 'B3_REPUGATE';
  const base = { model: m, scenario: agent.repugateScenario || 'honest-service' };
  try {
    const catalog = await loadScenarioCatalog();
    const svc = catalog[base.scenario];
    if (!svc) return { ...base, decision: 'UNAVAILABLE', error: 'RepuGate 无此场景 ' + base.scenario };
    const r = await repuPost('/api/evaluations', {
      buyer: CLIENT,
      model: m,
      scenarioId: base.scenario,
      offer: svc.offer,
      expectedOfferHash: svc.expectedOfferHash,
      idempotencyKey: 'order-' + orderId + '-' + Date.now(),
      tag2: 'inference'
    });
    const ev = r.evaluation || {};
    return {
      ...base,
      decision: ev.decision || 'UNAVAILABLE',
      decisionId: r.decisionId,
      reasons: ev.decisionReasons || [],
      scoreBps: ev.verifiedScoreBps,
      confidenceBps: ev.confidenceBps,
      distinctReviewerCount: ev.distinctReviewerCount,
      riskFlags: ev.riskFlags || [],
      offerRiskFlags: ev.offerRiskFlags || [],
      grantId: r.grant ? r.grant.id : null
    };
  } catch (e) {
    return { ...base, decision: 'UNAVAILABLE', error: 'RepuGate 不可达（' + e.message + '）' };
  }
}

const decisionLabel = d => d === 'ALLOW' ? '✅ ALLOW' : d === 'BLOCK' ? '⛔ BLOCK' : d === 'REVIEW' ? '⚠️ REVIEW' : '🔌 门禁不可用';
function scoreLabel(g) {
  const parts = [];
  if (g.scoreBps !== null && g.scoreBps !== undefined) parts.push('score=' + (g.scoreBps / 100).toFixed(1) + '%');
  if (g.confidenceBps !== null && g.confidenceBps !== undefined) parts.push('conf=' + (g.confidenceBps / 100).toFixed(1) + '%');
  if (g.distinctReviewerCount !== undefined) parts.push('reviewers=' + g.distinctReviewerCount);
  return parts.join(' · ');
}

/* ---------- 工具 ---------- */
const mockHash = () => '0x' + crypto.randomBytes(20).toString('hex');
const mockAddr = () => '0x' + crypto.randomBytes(20).toString('hex').padStart(40, '0');
const CLIENT = '0xA11cE0000000000000000000000000000000c0dE'; // 测试买家
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
    repugate: { scenario: a.repugateScenario, gate: 'repugate-policy-v1' },
    supportedTrust: ['reputation'],
    x402Support: true
  };
}

function registerAgent(b) {
  // 幂等：同一实例重启不重复注册
  if (b.instanceId && state.instances[b.instanceId]) {
    const a = state.agents.find(x => x.id === state.instances[b.instanceId]);
    if (a) { a.name = b.name || a.name; a.desc = b.desc || a.desc;
      if (b.repugateScenario && REPUGATE_SCENARIOS.includes(b.repugateScenario)) a.repugateScenario = b.repugateScenario;
      save(); return { agent: a, existed: true }; }
  }
  const id = state.agents.length + 1;
  const owner = mockAddr();
  const a = {
    id, name: b.name || 'Unnamed Agent',
    desc: b.desc || '（无描述）',
    owner,
    homepage: b.homepage || null,          // 自托管主页 URL（可空 = 平台代管档案页）
    repugateScenario: REPUGATE_SCENARIOS.includes(b.repugateScenario) ? b.repugateScenario : 'honest-service',
    skills: (b.skills || []).map((s, i) => ({
      id: s.id || ('skill-' + (i + 1)), name: s.name, desc: s.desc || '', price: +s.price || 0
    })),
    feedbacks: [], validations: [], createdAt: Date.now()
  };
  state.agents.push(a);
  if (state.credits[owner] === undefined) state.credits[owner] = 200; // 新 Agent 空投启动资金，便于 Agent-to-Agent 交易
  if (b.instanceId) state.instances[b.instanceId] = id;
  tx('Register', 'agentId=' + id + ' · ' + a.name);
  a.skills.forEach(s => tx('ServiceListed', 'agentId=' + id + ' · ' + s.name + ' · ' + s.price + ' LGC'));
  save();
  return { agent: a, existed: false };
}

async function executeOrder(b) {
  // b: { buyerKey: 'client' | 'agent:<id>', agentId, skillId, model? }
  const a = state.agents.find(x => x.id === +b.agentId);
  if (!a) return { ok: false, error: 'agent 不存在' };
  const s = a.skills.find(x => x.id === b.skillId);
  if (!s) return { ok: false, error: '技能不存在' };

  let buyerKey = CLIENT, buyerLabel = '测试买家';
  if (b.buyerKey && b.buyerKey.startsWith('agent:')) {
    const ba = state.agents.find(x => x.id === +b.buyerKey.split(':')[1]);
    if (!ba) return { ok: false, error: '买家 agent 不存在' };
    buyerKey = ba.owner; buyerLabel = ba.name;
  }
  if ((state.credits[buyerKey] || 0) < s.price) return { ok: false, error: '买家积分不足（余额 ' + (state.credits[buyerKey] || 0) + ' LGC）' };

  const steps = [];
  const orderId = state.orders.length + 1;
  const model = typeof b.model === 'string' && b.model ? b.model : 'B3_REPUGATE';

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

  // 3. RepuGate 声誉门禁（放款前）
  const gate = REPUGATE_ENABLED
    ? await repugateGate(a, orderId, model)
    : { model, scenario: a.repugateScenario || 'honest-service', decision: 'ALLOW', reasons: ['REPUGATE_DISABLED'] };
  const scoreTxt = scoreLabel(gate);
  steps.push([gate.decision === 'ALLOW' ? 'ok' : gate.decision === 'BLOCK' ? 'warn' : 'info',
    'RepuGate 门禁（' + gate.model + ' · 档案 ' + gate.scenario + '）: ' + decisionLabel(gate.decision) +
    (scoreTxt ? ' — ' + scoreTxt : '') + (gate.reasons && gate.reasons.length ? ' — ' + gate.reasons.join('|') : '')]);
  tx('GateEvaluated', 'orderId=' + orderId + ' · ' + gate.model + ' · ' + gate.decision +
    (scoreTxt ? ' · ' + scoreTxt : ''));

  let status;
  if (gate.decision === 'BLOCK') {
    // 拦截：托管退款
    state.credits[buyerKey] = (state.credits[buyerKey] || 0) + s.price;
    steps.push(['warn', '⛔ 放款被拦截 — ' + s.price + ' LGC 已退回买家托管账户']);
    tx('PaymentBlocked', 'orderId=' + orderId + ' · ' + s.price + ' LGC 退款 · ' + (gate.reasons || []).join('|'));
    status = 'BLOCKED';
  } else if (gate.decision === 'REVIEW' || gate.decision === 'UNAVAILABLE') {
    // 人工复核 / 门禁不可用（fail-closed）：资金保持托管
    steps.push(['info', '⚠️ 付款保持托管，等待人工复核（fail-closed）']);
    tx('PaymentHeld', 'orderId=' + orderId + ' · ' + (gate.error || (gate.reasons || []).join('|')));
    status = 'REVIEW';
  } else {
    // 4. 放款
    state.credits[a.owner] = (state.credits[a.owner] || 0) + s.price;
    steps.push(['ok', '支付放款 — ' + s.price + ' LGC 已转入 ' + a.name + ' 钱包']);
    tx('PaymentReleased', 'orderId=' + orderId + ' · ' + s.price + ' LGC → agentId=' + a.id);
    status = 'RELEASED';
  }

  state.orders.unshift({ id: orderId, buyerLabel, buyerKey, agentId: a.id, agentName: a.name,
    skill: s.name, price: s.price, result, live, status,
    gate: { model: gate.model, scenario: gate.scenario, decision: gate.decision,
      scoreBps: gate.scoreBps ?? null, confidenceBps: gate.confidenceBps ?? null,
      reasons: gate.reasons || [], decisionId: gate.decisionId || null }, ts: Date.now() });
  save();
  return { ok: true, steps, result, orderId, status, gate };
}

/* ---------- 页面模板 ----------
 * 视觉与双语统一由 ./theme.js 提供（与 public/index.html 同一套设计令牌），
 * 文案通过 data-i18n 在浏览器端切换中/英。
 */
const esc = s => String(s == null ? '' : s)
  .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
  .replace(/"/g, '&quot;').replace(/'/g, '&#39;');

/* 主 SPA：index.html 内嵌了设计令牌快照，这里用 theme.js 的最新 TOKENS 覆盖。
 * 每个 <style> 块里从开头到 "/* 主 SPA 专用" 之前都是 TOKENS 部分。 */
const INDEX_MARKER = '  /* 主 SPA 专用';
let _indexCache = null;
function renderIndex() {
  if (_indexCache) return _indexCache;
  let out = fs.readFileSync(path.join(PUB, 'index.html'), 'utf8');
  const s = out.indexOf('<style>');
  const e = out.indexOf('</style>');
  if (s >= 0 && e > s) {
    const inner = out.slice(s + 7, e);
    const marker = inner.indexOf(INDEX_MARKER);
    if (marker >= 0) {
      out = out.slice(0, s + 7) + TOKENS + inner.slice(marker) + out.slice(e);
    }
  }
  _indexCache = out;
  return out;
}

function profilePage(a) {
  const skills = a.skills.length
    ? '<div class="skgrid">' + a.skills.map(s =>
        '<div class="skillcard"><h4>' + esc(s.name) + '</h4>' +
        (s.desc ? '<div class="sdesc">' + esc(s.desc) + '</div>' : '') +
        '<div class="sprice">' + s.price + ' LGC</div></div>').join('') + '</div>'
    : '<div class="empty"><p data-i18n="profile.noskills">未上架技能</p></div>';

  const fb = a.feedbacks.length
    ? a.feedbacks.map(f =>
        '<tr><td class="mono">' + f.value + '</td><td>' + esc(f.note || '—') + '</td></tr>').join('')
    : '<tr class="table-empty"><td colspan="2" data-i18n="profile.nofeedback">暂无反馈</td></tr>';

  const origin = 'http://localhost:' + PORT;
  const cardUrl = origin + '/api/agents/' + a.id + '/card';

  const homeTag = a.homepage
    ? '<span class="tag tag-green" data-i18n="profile.selfhosted">自托管主页已验证</span>'
    : '<span class="tag" data-i18n="profile.nohome">无自托管主页</span>';
  const homeLink = a.homepage
    ? '<span class="tag"><a href="' + esc(a.homepage) + '" data-i18n="profile.visithome">访问 Agent 主页 →</a></span>'
    : '';

  return '<!DOCTYPE html><html lang="zh-CN"><head><meta charset="UTF-8">' +
    '<meta name="viewport" content="width=device-width, initial-scale=1.0">' +
    '<title>' + esc(a.name) + ' · agentId #' + a.id + ' | AgentHub</title>' +
    pageShell('', {}) +
    '</head><body><div class="pagewrap">' +
    '<header class="site">' +
      '<div class="site-inner">' +
        '<a class="brand" href="/"><span class="brand-mark">A</span><span>AgentHub</span></a>' +
        '<div class="spacer"></div>' +
        '<div class="site-actions">' +
          '<span class="status online"><span class="status-dot"></span>agentId #' + a.id + '</span>' +
          langSwitch() +
          '<a class="btn btn-quiet btn-sm" href="/" data-i18n="profile.back">← 返回平台</a>' +
        '</div>' +
      '</div>' +
    '</header>' +
    '<main style="padding-top:0">' +
      '<section class="ticket page-hero">' +
        '<div class="eyebrow" style="margin-bottom:18px"><span></span><span data-i18n="profile.kicker">Agent 注册档案</span></div>' +
        '<div class="mark">' + esc((a.name || '?').slice(0, 1).toUpperCase()) + '</div>' +
        '<h1>' + esc(a.name) + ' <span class="num">agentId #' + a.id + '</span></h1>' +
        '<div class="tagline">' + esc(a.desc) + '</div>' +
        '<div class="tags">' +
          '<span class="tag" data-i18n="profile.managed">平台代管档案页</span>' + homeTag + homeLink +
        '</div>' +
        '<div class="hero-kv">' +
          '<div><dt data-i18n="profile.kvOwner">所有者地址</dt><dd>' + esc(a.owner) + '</dd></div>' +
          '<div><dt data-i18n="profile.kvUri">卡片地址</dt><dd>' + esc(cardUrl) + '</dd></div>' +
        '</div>' +
      '</section>' +
      '<section>' +
        '<div class="section-heading">' +
          '<div><span class="section-index" data-i18n="profile.skillsIndex">技能目录</span>' +
          '<h2 data-i18n="profile.skills">上架技能</h2></div>' +
          '<p data-i18n="profile.offers">该 Agent 在市场上架以下技能，可直接下单。</p>' +
        '</div>' + skills +
      '</section>' +
      '<section>' +
        '<div class="section-heading">' +
          '<div><span class="section-index" data-i18n="profile.feedbackIndex">声誉反馈</span>' +
          '<h2 data-i18n="profile.feedback">声誉反馈</h2></div>' +
        '</div>' +
        '<div class="table-wrap"><table><thead><tr>' +
          '<th data-i18n="profile.colScore">分值</th>' +
          '<th data-i18n="profile.colNote">备注</th>' +
        '</tr></thead><tbody>' + fb + '</tbody></table></div>' +
      '</section>' +
    '</main>' +
    '<footer class="site"><div class="site-footer">' +
      '<span>' + esc(a.name) + ' · AgentHub</span>' +
      '<span class="mono">eip155:31337 · repugate-policy-v1</span>' +
    '</div></footer>' +
    '</div></body></html>';
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
    if (p === '/api/repugate' && req.method === 'GET') {
      return json({ enabled: REPUGATE_ENABLED, url: REPUGATE_URL, scenarios: REPUGATE_SCENARIOS });
    }
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

    /* 静态文件
     * index.html 内嵌了一份设计令牌快照（避免 FOUC）；这里在响应时用 theme.js
     * 的最新 TOKENS 覆盖它，保证 theme.js 始终是样式的唯一事实来源。 */
    if (p === '/' || p === '/index.html') {
      return html(renderIndex());
    }

    res.writeHead(404); res.end('not found');
  } catch (e) {
    json({ ok: false, error: e.message });
  }
});

server.listen(PORT, () => {
  console.log('✅ 注册平台 + 交易市场已启动: http://localhost:' + PORT);
  console.log('   测试买家地址: ' + CLIENT + ' (1000 LGC)');
});
