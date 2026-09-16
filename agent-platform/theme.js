/*
 * theme.js — AgentHub 共享设计系统与双语字典
 * 由 server.js (Agent 档案页) 与 agents/demo-agent.js (自托管主页) 共用，
 * 保证服务端渲染页面与主前端 public/index.html 视觉、语言一致。
 *
 * ══════════════════════════════════════════════════════════════════
 * AgentHub 的设计身份：交易所凭证 / 票据存根（a trading receipt）
 * ══════════════════════════════════════════════════════════════════
 * 刻意区别于 RepuGate（深绿终端 + 荧光绿 + 等宽 + 方角），避免两个系统
 * 视觉撞车、演示时一眼分不出。AgentHub 走完全相反的一套：
 *
 *   · 底色        浅色纸面 #f4f6fb（RepuGate 是深绿黑底），交易主体区
 *                 反相成深靛蓝、以斜切边（clip-path）裁切，像票根被撕下
 *   · 主色        靛蓝 #3d5afe / #2c3ce0（RepuGate 是荧光绿）
 *   · 标题字体    Georgia 衬线（RepuGate 是无衬线 Inter）
 *   · 圆角        8–16px 圆角（RepuGate 全站硬方角）
 *   · 组织方式    带阴影的浮起卡片（RepuGate 靠 1px 发丝线分节）
 *   · 杂项        数据用等宽 + 点状引导线（leader dots），像账簿目录
 *                 勾选态用靛蓝实心块 + 白色对勾（不是 radio 圆点）
 */

/* ---------- 设计令牌（server.js 会在响应时把它们拼进主 SPA） ---------- */
const TOKENS = `
  :root{
    /* 纸面 */
    --paper:#f4f6fb; --surface:#ffffff; --surface-2:#fbfcfe;
    --ink:#13173a; --muted:#5d6488; --muted-2:#8b91b3;

    /* 票根反相区 */
    --ticket:#1a1f4d; --ticket-2:#252b68; --ticket-text:#eaecff; --ticket-muted:#a9b0e8;

    /* 主色与语义色 */
    --brand:#3d5afe; --brand-strong:#2c3ce0; --brand-soft:#eaeeff;
    --pos:#0b8a5c; --pos-soft:#e6f6ef;
    --warn:#b45309; --warn-soft:#fdf3e3;
    --neg:#d92d3f; --neg-soft:#fdecee;

    /* 描边与阴影 */
    --line:#e2e6f4; --line-2:#ccd3ec;
    --shadow:0 1px 2px rgba(23,29,74,.06),0 12px 32px -14px rgba(23,29,74,.22);
    --shadow-sm:0 1px 2px rgba(23,29,74,.07);

    /* 字体 */
    --serif:Georgia,'Times New Roman','Songti SC','SimSun',serif;
    --sans:Inter,-apple-system,BlinkMacSystemFont,'Segoe UI','Microsoft YaHei',sans-serif;
    --mono:ui-monospace,SFMono-Regular,Menlo,Consolas,monospace;

    /* 斜切票根 */
    --notch:11px;
  }

  *{box-sizing:border-box;margin:0;padding:0}
  html{-webkit-text-size-adjust:100%;scroll-behavior:smooth}
  body{
    background:var(--paper);
    color:var(--ink);font-family:var(--sans);
    font-size:14.5px;line-height:1.6;min-height:100vh;-webkit-font-smoothing:antialiased;
  }
  a{color:var(--brand);text-decoration:none}
  a:hover{color:var(--brand-strong);text-decoration:underline;text-underline-offset:2px}
  button,input,select,textarea{font:inherit;color:inherit}

  /* ---------- 页头 ---------- */
  header.site{position:sticky;top:0;z-index:30;background:rgba(255,255,255,.9);
    backdrop-filter:blur(14px);border-bottom:1px solid var(--line)}
  .site-inner{max-width:1360px;margin:0 auto;padding:15px clamp(18px,4vw,44px);
    display:flex;align-items:center;gap:20px}
  .brand{display:flex;align-items:center;gap:10px;font-size:16px;font-weight:750;
    letter-spacing:-.02em;color:var(--ink);flex:none}
  .brand:hover{text-decoration:none;color:var(--ink)}
  .brand-mark{width:30px;height:30px;border-radius:9px;background:linear-gradient(140deg,#5872ff,#2c3ce0);
    color:#fff;display:grid;place-items:center;font-family:var(--serif);font-size:16px;
    font-weight:700;line-height:1;flex:none;box-shadow:0 4px 12px -4px rgba(61,90,254,.65)}
  .version{color:var(--muted-2);font-family:var(--mono);font-size:10px;font-weight:500;
    letter-spacing:.08em;text-transform:uppercase;background:var(--paper);
    border:1px solid var(--line);border-radius:5px;padding:3px 7px}
  .spacer{flex:1}
  .site-actions{display:flex;align-items:center;gap:12px;flex-wrap:wrap;justify-content:flex-end}

  .status{display:inline-flex;align-items:center;gap:8px;color:var(--muted);font-size:12.5px;
    background:var(--surface);border:1px solid var(--line);border-radius:999px;padding:6px 13px 6px 11px}
  .status-dot{width:7px;height:7px;border-radius:50%;background:var(--muted-2);flex:none}
  .status.online .status-dot{background:var(--pos);box-shadow:0 0 0 4px rgba(11,138,92,.13)}
  .status.offline .status-dot{background:var(--neg);box-shadow:0 0 0 4px rgba(217,45,63,.12)}

  .langswitch{display:flex;background:var(--paper);border:1px solid var(--line);
    border-radius:9px;padding:2px;gap:2px}
  .langswitch button{background:transparent;border:0;color:var(--muted);cursor:pointer;
    font-size:11px;font-weight:600;letter-spacing:.03em;border-radius:7px;padding:6px 11px;
    transition:background .16s ease,color .16s ease}
  .langswitch button:hover{color:var(--ink)}
  .langswitch button.active{background:var(--surface);color:var(--brand);box-shadow:var(--shadow-sm)}

  /* ---------- 提示条（票根边上撕下来的小纸条） ---------- */
  .ticker{background:var(--ticket);color:var(--ticket-muted);border-bottom:1px solid rgba(255,255,255,.08)}
  .ticker-inner{max-width:1360px;margin:0 auto;padding:9px clamp(18px,4vw,44px);
    display:flex;align-items:center;gap:12px;flex-wrap:wrap;
    font-family:var(--mono);font-size:10px;letter-spacing:.1em;text-transform:uppercase}
  .ticker b{color:#fff;font-weight:600}
  .ticker em{color:#ffd98a;font-style:normal}
  .ticker-sep{color:rgba(255,255,255,.22)}
  .ticker .spacer{flex:1}

  /* ---------- 按钮 ---------- */
  .btn{display:inline-flex;align-items:center;justify-content:center;gap:8px;
    background:var(--surface);border:1px solid var(--line-2);color:var(--ink);cursor:pointer;
    font-size:12.5px;font-weight:620;border-radius:9px;padding:9px 15px;
    box-shadow:var(--shadow-sm);transition:border-color .16s,background .16s,color .16s,transform .16s}
  .btn:hover:not(:disabled){border-color:var(--brand);color:var(--brand)}
  .btn:active:not(:disabled){transform:translateY(1px)}
  .btn:disabled{cursor:not-allowed;opacity:.45;box-shadow:none}
  .btn-primary{background:var(--brand);border-color:var(--brand);color:#fff;font-weight:680;
    justify-content:space-between;gap:20px;padding:14px 18px;font-size:13px;
    box-shadow:0 10px 24px -12px rgba(61,90,254,.9)}
  .btn-primary:hover:not(:disabled){background:var(--brand-strong);border-color:var(--brand-strong);color:#fff}
  .btn-quiet{background:transparent;border-color:var(--line);color:var(--muted);box-shadow:none}
  .btn-sm{padding:6px 11px;font-size:11.5px;border-radius:7px}

  /* ---------- 表单控件 ---------- */
  .field{display:flex;flex-direction:column;gap:7px}
  .field > label{color:var(--ink);font-size:12.5px;font-weight:640;display:flex;gap:6px;
    align-items:baseline;flex-wrap:wrap}
  .field .help{color:var(--muted-2);font-size:11px;font-weight:500}
  input,select,textarea{width:100%;background:var(--surface);border:1px solid var(--line-2);
    color:var(--ink);font-size:13.5px;border-radius:9px;padding:10px 12px;outline:0;
    transition:border-color .16s,box-shadow .16s}
  input:focus,select:focus,textarea:focus{border-color:var(--brand);
    box-shadow:0 0 0 3.5px rgba(61,90,254,.14)}
  input::placeholder,textarea::placeholder{color:var(--muted-2)}
  select{cursor:pointer;appearance:none;padding-right:34px;
    background-image:url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='11' height='7' viewBox='0 0 11 7'%3E%3Cpath d='M1 1l4.5 4.5L10 1' stroke='%235d6488' stroke-width='1.7' fill='none' stroke-linecap='round' stroke-linejoin='round'/%3E%3C/svg%3E");
    background-repeat:no-repeat;background-position:right 13px center}

  .segmented{display:flex;background:var(--surface);border:1px solid var(--line-2);
    border-radius:10px;padding:3px;gap:3px;box-shadow:var(--shadow-sm)}
  .segmented button{flex:1 1 0;background:transparent;border:0;color:var(--muted);cursor:pointer;
    font-size:12px;font-weight:620;min-width:22px;padding:9px 10px;border-radius:7px;
    white-space:nowrap;transition:background .16s,color .16s}
  .segmented button:hover{color:var(--ink)}
  .segmented button.active{background:var(--brand);color:#fff;box-shadow:0 6px 14px -8px rgba(61,90,254,.9)}

  /* ---------- 门禁模型选择卡 ---------- */
  .model-grid{display:grid;gap:11px;grid-template-columns:repeat(auto-fit,minmax(202px,1fr))}
  .model-card{position:relative;text-align:left;background:var(--surface);cursor:pointer;
    border:1.5px solid var(--line);border-radius:14px;padding:17px 17px 15px;
    display:flex;flex-direction:column;gap:8px;box-shadow:var(--shadow-sm);
    transition:border-color .16s,box-shadow .16s,transform .16s}
  .model-card:hover{transform:translateY(-2px);box-shadow:var(--shadow)}
  .model-card .code{position:absolute;top:15px;right:15px;font-family:var(--mono);font-size:10px;
    font-weight:600;letter-spacing:.06em;color:var(--muted-2)}
  .model-card strong{font-size:14.5px;font-weight:700;letter-spacing:-.015em;padding-right:44px;
    display:block}
  .model-card small{color:var(--muted);font-size:12px;line-height:1.5;display:block}
  .model-card .tag{align-self:flex-start;margin-top:2px}
  .model-card.active{border-color:var(--brand);background:var(--brand-soft);
    box-shadow:0 0 0 3.5px rgba(61,90,254,.13),var(--shadow)}
  .model-card.active strong{color:var(--brand-strong)}
  .model-card .check{position:absolute;bottom:15px;right:15px;width:20px;height:20px;border-radius:6px;
    border:1.5px solid var(--line-2);display:grid;place-items:center;font-size:12px;color:transparent;
    line-height:1}
  .model-card.active .check{background:var(--brand);border-color:var(--brand);color:#fff}

  /* ---------- 页面骨架 ---------- */
  main{width:100%;max-width:1360px;margin:0 auto;padding:0 clamp(18px,4vw,44px) 84px}
  section{padding:42px 0}
  section + section{border-top:1px solid var(--line)}

  /* 深靛蓝票根区：左右斜切 + 虚线撕口，强制浅色文字 */
  .ticket{background:linear-gradient(160deg,#212664,#171c45 62%);
    border-radius:18px;padding:44px 40px;color:var(--ticket-text);position:relative;
    overflow:hidden;box-shadow:0 22px 48px -26px rgba(23,29,74,.72);
    clip-path:polygon(var(--notch) 0,100% 0,calc(100% - var(--notch)) 100%,0 100%)}
  .ticket::before{content:'';position:absolute;inset:9px;border:1px dashed rgba(255,255,255,.17);
    border-radius:12px;pointer-events:none}
  .ticket::after{content:'';position:absolute;right:-70px;top:-70px;width:300px;height:300px;
    border-radius:50%;background:radial-gradient(circle,rgba(122,146,255,.34),transparent 68%);
    pointer-events:none}
  .ticket h1,.ticket h2,.ticket strong,.ticket a,.ticket em{color:#fff}
  .ticket .muted,.ticket p{color:var(--ticket-muted)}
  .hero{padding-top:46px;padding-bottom:50px}
  .hero .eyebrow{color:var(--ticket-muted)}

  .eyebrow{display:flex;align-items:center;gap:10px;color:var(--brand);
    font-size:11.5px;font-weight:700;letter-spacing:.14em;text-transform:uppercase;
    margin-bottom:20px;position:relative;z-index:1}
  .eyebrow > span:first-child{width:26px;height:2px;border-radius:2px;background:currentColor;flex:none}
  h1.hero-title{font-family:var(--serif);font-weight:400;font-size:clamp(36px,5vw,60px);
    line-height:1.06;letter-spacing:-.028em;color:#fff;max-width:900px;position:relative;z-index:1}
  h1.hero-title em{font-style:italic;color:#b9c4ff}
  .hero-lede{color:var(--ticket-muted);font-size:16px;line-height:1.68;margin:24px 0 30px;
    max-width:640px;position:relative;z-index:1}
  .hero-protocol{display:flex;align-items:center;flex-wrap:wrap;gap:13px;position:relative;z-index:1}
  .hero-protocol span{font-family:var(--mono);font-size:10.5px;letter-spacing:.09em;
    text-transform:uppercase;color:#aab3ee}
  .hero-protocol i{width:5px;height:5px;border-radius:50%;background:rgba(255,255,255,.3);flex:none}

  .section-heading{display:flex;align-items:flex-end;justify-content:space-between;gap:24px;
    margin-bottom:22px;flex-wrap:wrap}
  .section-heading h2{font-family:var(--serif);font-size:clamp(22px,2.5vw,31px);font-weight:400;
    letter-spacing:-.02em;margin:6px 0 0;color:var(--ink)}
  .section-heading > p{color:var(--muted);font-size:13px;line-height:1.55;max-width:420px;
    text-align:right;margin:0}
  .section-index{color:var(--brand);font-size:11px;font-weight:700;letter-spacing:.13em;
    text-transform:uppercase}
  .section-index::before{content:'§ ';color:var(--muted-2)}

  /* ---------- 卡片 / 网格 ---------- */
  .panel{background:var(--surface);border:1px solid var(--line);border-radius:14px;
    padding:22px;box-shadow:var(--shadow-sm)}
  .panel + .panel{margin-top:11px}
  .grid{display:grid;gap:11px}
  .grid-2{grid-template-columns:1.45fr 1fr}
  .grid-2-even{grid-template-columns:1fr 1fr}
  .grid-3{grid-template-columns:repeat(3,minmax(0,1fr))}
  @media(max-width:900px){.grid-2,.grid-2-even,.grid-3{grid-template-columns:1fr}}

  /* ---------- 指标条（嵌在深色票根里的一排数字） ---------- */
  .metrics{display:grid;grid-template-columns:repeat(6,minmax(0,1fr));gap:1px;
    background:var(--line);border:1px solid var(--line);border-radius:14px;
    overflow:hidden;box-shadow:var(--shadow-sm)}
  .metric{background:var(--surface);padding:20px;min-height:118px;min-width:0}
  @media(max-width:1100px){.metrics{grid-template-columns:repeat(3,minmax(0,1fr))}}
  .metric-label{display:block;color:var(--muted);font-size:10.5px;font-weight:700;
    letter-spacing:.12em;text-transform:uppercase;margin-bottom:13px}
  .metric strong{display:block;font-family:var(--serif);font-size:clamp(27px,3vw,40px);
    font-weight:400;letter-spacing:-.03em;line-height:1;overflow:hidden;text-overflow:ellipsis;
    white-space:nowrap}
  .metric small{display:block;color:var(--muted-2);font-size:11px;margin-top:11px;
    overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
  .metric.accent strong,.metric.allow strong{color:var(--pos)}
  .metric.block strong{color:var(--neg)}
  .metric.review strong{color:var(--warn)}

  /* ---------- 选择卡片（Agent） ---------- */
  .pick-grid{display:grid;gap:11px;grid-template-columns:repeat(auto-fill,minmax(292px,1fr))}
  .pick-card{display:flex;align-items:flex-start;gap:13px;background:var(--surface);
    border:1px solid var(--line);border-radius:14px;cursor:pointer;padding:17px;
    text-align:left;min-height:88px;box-shadow:var(--shadow-sm);
    transition:border-color .16s,box-shadow .16s,transform .16s}
  .pick-card:hover{transform:translateY(-2px);box-shadow:var(--shadow);border-color:var(--line-2)}
  .pick-card.selected{border-color:var(--brand);box-shadow:0 0 0 3.5px rgba(61,90,254,.13)}
  .pick-num{width:26px;height:26px;border-radius:8px;background:var(--brand-soft);color:var(--brand-strong);
    font-family:var(--mono);font-size:11px;font-weight:600;display:grid;place-items:center;
    flex:none;margin-top:1px}
  .pick-copy{display:flex;flex:1;flex-direction:column;gap:7px;min-width:0}
  .pick-copy strong{font-size:14.5px;font-weight:700;display:flex;align-items:center;gap:8px;
    flex-wrap:wrap;letter-spacing:-.015em}
  .pick-copy small{color:var(--muted-2);font-family:var(--mono);font-size:10.5px;
    overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
  .radio-dot{display:none}

  /* ---------- 标签 ---------- */
  .tag{display:inline-flex;align-items:center;gap:5px;border:1px solid var(--line-2);
    background:var(--surface-2);color:var(--muted);font-size:10.5px;font-weight:620;
    letter-spacing:.02em;border-radius:6px;padding:3px 8px;white-space:nowrap}
  .tag-green{border-color:rgba(11,138,92,.28);background:var(--pos-soft);color:var(--pos)}
  .tag-amber{border-color:rgba(180,83,9,.26);background:var(--warn-soft);color:var(--warn)}
  .tag-red{border-color:rgba(217,45,63,.24);background:var(--neg-soft);color:var(--neg)}
  .tag-plain{border-color:var(--line);background:var(--surface);color:var(--muted-2)}

  /* ---------- 表格（数据等宽 + 点状引导线） ---------- */
  .table-wrap{border:1px solid var(--line);border-radius:14px;overflow:hidden;
    overflow-x:auto;background:var(--surface);box-shadow:var(--shadow-sm)}
  table{border-collapse:collapse;width:100%;min-width:640px}
  th{background:var(--surface-2);color:var(--muted);font-size:10.5px;font-weight:700;
    letter-spacing:.11em;padding:13px 16px;text-align:left;text-transform:uppercase;
    border-bottom:1px solid var(--line);white-space:nowrap}
  td{border-top:1px solid var(--line);color:#3b4166;font-size:12.5px;padding:13px 16px;
    vertical-align:top}
  tbody tr:first-child td{border-top:0}
  tbody tr:hover td{background:var(--surface-2)}
  .table-empty td{color:var(--muted-2);padding:30px;text-align:center}
  .mono{font-family:var(--mono);font-size:11.5px}
  .muted{color:var(--muted);font-size:12.5px}
  .cell-main{color:var(--ink);font-weight:680;display:block}
  .cell-sub{color:var(--muted-2);font-family:var(--mono);font-size:10.5px;display:block;margin-top:4px}
  .price{font-family:var(--mono);color:var(--brand-strong);font-size:12.5px;font-weight:600;
    white-space:nowrap}
  /* 账簿式点状引导线：左标签 ···· 右数值 */
  .lead{display:flex;align-items:baseline;gap:8px;min-width:0}
  .lead > i{flex:1;border-bottom:1px dotted var(--line-2);transform:translateY(-3px);min-width:14px}

  /* ---------- 流程轨迹（票根式时间线） ---------- */
  .flow{position:relative;border:1px solid var(--line);border-radius:14px;background:var(--surface);
    box-shadow:var(--shadow-sm);overflow:hidden}
  .flow-head{background:var(--ticket);color:#c8cffb;font-size:10.5px;font-weight:700;
    letter-spacing:.13em;text-transform:uppercase;padding:12px 16px}
  .flow-row{display:flex;gap:13px;align-items:flex-start;border-top:1px solid var(--line);
    padding:13px 16px;position:relative}
  .flow-row:first-of-type{border-top:0}
  .flow-node{width:26px;height:26px;border:1px solid var(--line-2);border-radius:8px;flex:none;
    display:grid;place-items:center;font-family:var(--mono);font-size:10px;
    color:var(--muted-2);background:var(--surface-2);margin-top:1px}
  .flow-row.ok .flow-node{background:var(--pos);border-color:var(--pos);color:#fff}
  .flow-row.warn .flow-node{background:var(--warn);border-color:var(--warn);color:#fff}
  .flow-row.info .flow-node{background:var(--brand);border-color:var(--brand);color:#fff}
  .flow-body{min-width:0;flex:1}
  .flow-body .txt{font-size:13px;color:#3b4166;line-height:1.55;word-break:break-word}
  .flow-row.warn .flow-body .txt{color:var(--warn);font-weight:600}
  .flow-body .meta{font-family:var(--mono);font-size:10.5px;color:var(--muted-2);margin-top:5px}

  /* ---------- 键值对 ---------- */
  .kv{display:flex;flex-direction:column}
  .kv > div{display:flex;align-items:center;justify-content:space-between;gap:16px;
    border-bottom:1px solid var(--line);padding:11px 0;min-width:0}
  .kv > div:last-child{border-bottom:0}
  .kv dt{color:var(--muted);font-size:12px;flex:none}
  .kv dd{font-family:var(--mono);font-size:11.5px;color:var(--ink);margin:0;min-width:0;
    overflow:hidden;text-overflow:ellipsis;white-space:nowrap}

  /* ---------- 空态 ---------- */
  .empty{border:1px dashed var(--line-2);border-radius:14px;background:var(--surface-2);
    color:var(--muted);display:flex;flex-direction:column;align-items:center;justify-content:center;
    gap:8px;font-size:13px;min-height:180px;padding:30px;text-align:center}
  .empty .ic{font-size:22px;color:var(--brand);opacity:.75}

  /* ---------- 提示块 ---------- */
  .callout{border:1px solid var(--line);border-left:3px solid var(--brand);background:var(--brand-soft);
    color:#333a63;font-size:13px;line-height:1.68;padding:13px 16px;border-radius:10px}
  .callout.warn{border-left-color:var(--warn);background:var(--warn-soft);color:#6b3f08}
  .callout.err{border-left-color:var(--neg);background:var(--neg-soft);color:#8d1f2b}
  .callout code,.note code{color:var(--brand-strong);font-family:var(--mono);font-size:12px;
    background:rgba(61,90,254,.09);border-radius:4px;padding:1px 4px}
  .note{color:var(--muted);font-size:12.5px;line-height:1.65;margin-top:13px}

  pre.code{background:var(--ticket);border-radius:12px;color:#dfe3ff;font-family:var(--mono);
    font-size:12px;line-height:1.8;overflow-x:auto;padding:16px 18px;margin-top:13px;
    box-shadow:0 16px 34px -22px rgba(23,29,74,.7)}
  pre.code .c{color:#8e97d8}
  ol.howto{padding-left:20px;font-size:13.5px;display:flex;flex-direction:column;gap:10px;color:#3b4166}
  ol.howto li::marker{color:var(--brand);font-weight:700}
  ol.howto code{color:var(--brand-strong);font-family:var(--mono);font-size:12px}

  /* ---------- 页脚 ---------- */
  footer.site{border-top:1px solid var(--line);background:var(--surface)}
  .site-footer{max-width:1360px;margin:0 auto;padding:24px clamp(18px,4vw,44px);
    display:flex;justify-content:space-between;gap:14px;flex-wrap:wrap;
    color:var(--muted-2);font-size:11.5px;letter-spacing:.04em}

  /* ---------- 提示条 ---------- */
  .toast{position:fixed;bottom:22px;left:50%;transform:translateX(-50%) translateY(80px);z-index:60;
    background:var(--ticket);color:#fff;border-radius:10px;font-size:13px;font-weight:560;
    padding:13px 20px;opacity:0;transition:opacity .22s,transform .22s;pointer-events:none;
    max-width:90vw;box-shadow:0 20px 44px -20px rgba(23,29,74,.8)}
  .toast.show{opacity:1;transform:translateX(-50%) translateY(0)}
  .toast.err{background:var(--neg)}

  @media(max-width:760px){
    .site-inner{flex-wrap:wrap;gap:12px;padding-top:13px;padding-bottom:13px}
    .ticket{padding:30px 22px;border-radius:14px}
    section{padding:32px 0}
    .section-heading{align-items:flex-start;flex-direction:column;gap:10px}
    .section-heading > p{text-align:left}
    .metrics{grid-template-columns:repeat(2,minmax(0,1fr))}
  }
  @media(prefers-reduced-motion:reduce){
    *,*::before,*::after{scroll-behavior:auto!important;transition:none!important}
  }
`;

/* ---------- 子页面专用样式（档案页 / 自托管主页） ---------- */
const PAGE_CSS = `
  .page-hero{padding-top:42px;padding-bottom:46px}
  .page-hero .mark{width:56px;height:56px;border-radius:16px;
    background:linear-gradient(140deg,#5872ff,#2c3ce0);color:#fff;display:grid;place-items:center;
    font-family:var(--serif);font-size:24px;font-weight:700;line-height:1;margin-bottom:20px;
    box-shadow:0 12px 26px -12px rgba(61,90,254,.85)}
  .page-hero h1{font-family:var(--serif);font-weight:400;font-size:clamp(30px,4.4vw,50px);
    line-height:1.06;letter-spacing:-.028em;color:#fff;display:flex;align-items:baseline;
    gap:12px;flex-wrap:wrap;position:relative;z-index:1}
  .page-hero h1 .num{font-family:var(--mono);font-size:12px;font-weight:500;
    color:var(--ticket-muted);letter-spacing:.06em}
  .page-hero .tagline{color:var(--ticket-muted);font-size:14.5px;line-height:1.68;
    margin:16px 0 20px;max-width:62ch;position:relative;z-index:1}
  .page-hero .tags{display:flex;flex-wrap:wrap;gap:7px;margin-bottom:22px;position:relative;z-index:1}
  .page-hero .tags .tag{background:rgba(255,255,255,.08);border-color:rgba(255,255,255,.18);
    color:#cfd5fb}
  .page-hero .tags .tag a{color:#fff}
  .hero-kv{display:flex;flex-direction:column;background:rgba(255,255,255,.06);
    border:1px solid rgba(255,255,255,.14);border-radius:11px;max-width:100%;
    position:relative;z-index:1;overflow:hidden}
  .hero-kv > div{display:flex;align-items:center;gap:16px;justify-content:space-between;
    border-bottom:1px solid rgba(255,255,255,.1);padding:10px 14px;min-width:0}
  .hero-kv > div:last-child{border-bottom:0}
  .hero-kv dt{color:var(--ticket-muted);font-size:11px;flex:none;font-family:var(--mono);
    letter-spacing:.05em}
  .hero-kv dd{font-family:var(--mono);font-size:11px;color:#fff;margin:0;min-width:0;
    overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
  .hero-kv dd a{color:#b9c4ff}
  .skgrid{display:grid;grid-template-columns:repeat(auto-fit,minmax(244px,1fr));gap:11px}
  .skillcard{background:var(--surface);border:1px solid var(--line);border-radius:14px;
    padding:17px;display:flex;flex-direction:column;gap:7px;box-shadow:var(--shadow-sm);
    transition:border-color .16s,box-shadow .16s,transform .16s}
  .skillcard:hover{border-color:var(--line-2);box-shadow:var(--shadow);transform:translateY(-2px)}
  .skillcard h4{font-size:14.5px;font-weight:700;letter-spacing:-.015em}
  .skillcard .sdesc{color:var(--muted);font-size:12.5px;line-height:1.55;flex:1}
  .skillcard .sprice{font-family:var(--mono);font-size:12.5px;color:var(--brand-strong);
    font-weight:600;border-top:1px dashed var(--line-2);padding-top:9px}
  .pagewrap{position:relative;min-height:100vh;display:flex;flex-direction:column}
  .pagewrap > main{flex:1}
  .backlink{color:var(--ticket-muted);font-size:11.5px}
`;

/* ---------- 双语字典（服务端渲染页面用） ---------- */
const DICT = {
  'profile.kicker': ['Agent 注册档案', 'Agent registration profile'],
  'profile.title': ['平台档案', 'Registry Profile'],
  'profile.managed': ['平台代管档案页', 'Platform-hosted profile'],
  'profile.selfhosted': ['自托管主页已验证', 'Self-hosted homepage verified'],
  'profile.nohome': ['无自托管主页', 'No self-hosted homepage'],
  'profile.visithome': ['访问 Agent 主页 →', 'Visit agent homepage →'],
  'profile.back': ['← 返回平台', '← Back to platform'],
  'profile.skills': ['上架技能', 'Listed skills'],
  'profile.noskills': ['未上架技能', 'No skills listed'],
  'profile.feedback': ['声誉反馈', 'Reputation feedback'],
  'profile.nofeedback': ['暂无反馈', 'No feedback yet'],
  'profile.colScore': ['分值', 'Score'],
  'profile.colNote': ['备注', 'Note'],
  'profile.offers': ['该 Agent 在市场上架以下技能，可直接下单。', 'This agent lists the following skills on the market.'],
  'profile.kvOwner': ['所有者地址', 'Owner address'],
  'profile.kvUri': ['卡片地址', 'Agent URI'],
  'profile.skillsIndex': ['技能目录', 'skill catalog'],
  'profile.feedbackIndex': ['声誉反馈', 'reputation feedback'],
  'home.kicker': ['Self-hosted agent', 'Self-hosted agent'],
  'home.tagOracle': ['行情', 'Oracle'],
  'home.tagAnalyst': ['分析师', 'Analyst'],
  'home.roleSuffix': ['Agent · ERC-8004 风格注册', 'Agent · ERC-8004-style registration'],
  'home.skills': ['我的技能', 'My skills'],
  'home.marketLink': ['AgentHub 市场', 'AgentHub market'],
  'home.skillsNote': ['在 AgentHub 市场可直接下单', 'Order directly in the AgentHub market'],
  'home.identity': ['身份信息', 'Identity'],
  'home.platformProfile': ['平台档案', 'Platform profile'],
  'home.aboutTitle': ['这是一个真实的自托管 Agent', 'This is a real self-hosted agent'],
  'home.about1': ['你现在看到的页面由', 'The page you are viewing is hosted by the'],
  'home.about2': ['进程自己托管（端口', 'process itself (port'],
  'home.about3': ['）。市场里有人购买它的技能时，平台会直接 POST 调用本进程的', '). When someone buys its skills on the market, the platform POSTs directly to this process\'s'],
  'home.about4': ['，执行结果真实返回，报酬通过本地积分结算——类比真实世界中的 x402 支付。',
    ', returns the real result, and settles the reward in local credits — analogous to x402 payments in the real world.'],
  'home.registered': ['注册中…', 'Registering…'],
  'home.footer': ['自托管 Agent 主页 · 由本地 ERC-8004 风格注册表驱动', 'self-hosted agent homepage · powered by a local ERC-8004-style registry'],
  'home.skillsIndex': ['技能目录', 'skill catalog'],
  'home.identityIndex': ['身份信息', 'identity'],
  'home.aboutIndex': ['自托管', 'self-hosted'],
  'common.loading': ['加载中…', 'Loading…'],
  'common.back': ['← 返回平台', '← Back to platform']
};

/* ---------- 服务端渲染 helper ---------- */
// 取词：t('profile.title', 'en')
function t(key, lang) {
  const pair = DICT[key];
  if (!pair) return key;
  return lang === 'en' ? pair[1] : pair[0];
}

// 语言切换控件（纯 CSS/JS，无依赖；置于页头动作区内联排列）
function langSwitch() {
  return `<div class="langswitch" id="langSwitch">
    <button type="button" data-lang="zh" class="active">中文</button>
    <button type="button" data-lang="en">EN</button>
  </div>`;
}

/**
 * 生成页面通用的 <head> 内联样式 + 语言引导脚本。
 * @param {string} title 页面标题（保留签名，样式与脚本由此注入）
 * @param {object} vars  注入到 i18n 的运行时变量（供前端覆盖词条用）
 */
function pageShell(title, vars) {
  const payload = JSON.stringify(vars || {});
  return `<link rel="icon" href="data:,"><style>${TOKENS}${PAGE_CSS}</style>
<script>
(function(){
  var DICT = ${JSON.stringify(DICT)};
  var VARS = ${payload};
  function t(key){
    var v = VARS[key] !== undefined ? VARS[key] : null;
    if (v !== null) return v;
    var pair = DICT[key];
    if (!pair) return key;
    return (window.__lang === 'en') ? pair[1] : pair[0];
  }
  window.__t = t;
  window.__applyLang = function(lang){
    window.__lang = lang;
    document.documentElement.lang = (lang === 'en') ? 'en' : 'zh-CN';
    document.querySelectorAll('[data-i18n]').forEach(function(el){
      el.textContent = t(el.getAttribute('data-i18n'));
    });
    document.querySelectorAll('#langSwitch button').forEach(function(b){
      b.classList.toggle('active', b.getAttribute('data-lang') === lang);
    });
    try { localStorage.setItem('agenthub-lang', lang); } catch(e){}
  };
  var saved = null;
  try { saved = localStorage.getItem('agenthub-lang'); } catch(e){}
  var initial = saved || ((navigator.language || '').toLowerCase().indexOf('zh') === 0 ? 'zh' : 'en');
  document.addEventListener('DOMContentLoaded', function(){
    window.__applyLang(initial);
    var sw = document.getElementById('langSwitch');
    if (sw) sw.addEventListener('click', function(e){
      var b = e.target.closest('button[data-lang]');
      if (b) window.__applyLang(b.getAttribute('data-lang'));
    });
  });
})();
</script>`;
}

module.exports = { TOKENS, PAGE_CSS, DICT, t, langSwitch, pageShell };
