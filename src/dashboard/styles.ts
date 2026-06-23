import { DASHBOARD_TOKENS_CSS } from "./tokens.js";

export const DASHBOARD_BASE_CSS = `
${DASHBOARD_TOKENS_CSS}
*{margin:0;padding:0;box-sizing:border-box}
body{background:var(--brand-bg);color:var(--brand-text);font-family:var(--font-sans);padding:20px;max-width:1600px;margin:0 auto}
a{color:var(--brand-primary)}
h1{font-size:1.5rem;font-weight:600;display:flex;align-items:center;gap:10px}
.header{display:flex;justify-content:space-between;align-items:center;padding:16px 0;border-bottom:1px solid var(--brand-border);margin-bottom:24px}
.header .meta{font-size:.8rem;color:var(--brand-text-muted)}
.cards{display:grid;grid-template-columns:repeat(auto-fit,minmax(200px,1fr));gap:16px;margin-bottom:32px}
.card{background:var(--brand-surface);border:1px solid var(--brand-border);border-radius:var(--radius-md);padding:20px;box-shadow:var(--shadow-card)}
.card .label{font-size:.75rem;color:var(--brand-text-muted);text-transform:uppercase;letter-spacing:.05em;margin-bottom:6px}
.card .value{font-size:1.75rem;font-weight:700;font-family:var(--font-mono)}
.accent{color:var(--brand-primary)}
.green{color:var(--brand-success)}
.tooltip-wrap{position:relative;display:inline-block}
.tooltip-wrap .tooltip-box{visibility:hidden;opacity:0;background:var(--brand-surface-raised);color:var(--brand-text);font-size:.8rem;font-weight:400;text-transform:none;letter-spacing:0;line-height:1.5;border:1px solid var(--brand-border);border-radius:var(--radius-sm);padding:10px 14px;position:absolute;top:calc(100% + 8px);left:50%;transform:translateX(-50%);width:280px;z-index:999;pointer-events:none;transition:opacity .15s;box-shadow:var(--shadow-card)}
.tooltip-wrap .tooltip-box::after{content:'';position:absolute;bottom:100%;left:50%;transform:translateX(-50%);border:6px solid transparent;border-bottom-color:var(--brand-border)}
.tooltip-wrap:hover .tooltip-box{visibility:visible;opacity:1}
.info-icon{cursor:help;color:var(--brand-text-muted);font-size:.75rem;vertical-align:middle;margin-left:4px}
table{width:100%;border-collapse:collapse;font-size:.85rem}
th{text-align:left;color:var(--brand-text-muted);font-weight:500;padding:8px 12px;border-bottom:1px solid var(--brand-border);font-size:.75rem;text-transform:uppercase;letter-spacing:.04em}
td{padding:8px 12px;border-bottom:1px solid var(--brand-surface)}
.section{margin-bottom:32px}.section h2{font-size:1rem;font-weight:600;margin-bottom:12px;color:var(--brand-text-muted)}
.dot{display:inline-block;width:8px;height:8px;border-radius:50%;margin-right:6px}.dot.up{background:var(--brand-success)}.dot.warn{background:var(--brand-warning)}.dot.down{background:var(--brand-error)}
.section.collapsible h2{cursor:pointer;user-select:none;display:flex;align-items:center;gap:8px}.section.collapsible h2::after{content:'▾';font-size:.8rem;color:var(--brand-text-muted);transition:transform .2s}.section.collapsed h2::after{transform:rotate(-90deg)}.section.collapsed>*:not(h2){display:none!important}
.badge{display:inline-block;padding:2px 8px;border-radius:var(--radius-sm);font-size:.75rem;font-weight:500}
.badge.ok{background:#14532d33;color:var(--brand-success)}.badge.err{background:#450a0a;color:var(--brand-error)}.badge.err-auth{background:#450a0a;color:var(--brand-error)}.badge.err-rate{background:#422006;color:var(--brand-warning)}.badge.err-timeout{background:#431407;color:#fb923c}
.badge.tt-code{background:#1e3a5f;color:var(--brand-info)}.badge.tt-analysis{background:#3b1f6e;color:#a78bfa}.badge.tt-summarization{background:#1a3a2a;color:#6ee7b7}.badge.tt-qa{background:#3a2f1e;color:var(--brand-warning)}.badge.tt-general{background:var(--brand-surface-raised);color:var(--brand-text-muted)}
.badge.cx-simple{background:#14532d33;color:var(--brand-success)}.badge.cx-moderate{background:#422006;color:var(--brand-warning)}.badge.cx-complex{background:#450a0a;color:var(--brand-error)}
.vstat{display:inline-flex;align-items:center;gap:6px;margin-left:8px;padding:1px 8px;border-radius:999px;border:1px solid var(--brand-border);font-size:.72rem}
.vstat.current{color:var(--brand-text-muted);border-color:var(--brand-border);background:#0f172a66}
.vstat.outdated{color:var(--brand-warning);border-color:#f59e0b55;background:#3a2f1e66}
.vstat.unavailable{color:#a3a3a3;border-color:#52525b66;background:#18181b66}
@media(max-width:768px){.col-tt,.col-cx{display:none}}
.prov{display:flex;gap:16px;flex-wrap:wrap}.prov-item{display:flex;align-items:center;font-size:.85rem;background:var(--brand-surface);padding:8px 14px;border-radius:var(--radius-sm);border:1px solid var(--brand-border)}
.rename-btn{background:none;border:none;cursor:pointer;font-size:.75rem;opacity:.5;padding:2px}.rename-btn:hover{opacity:1}
.config-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(280px,1fr));gap:16px;margin-bottom:24px}
.config-row{display:flex;justify-content:space-between;align-items:center;padding:10px 0;border-bottom:1px solid var(--brand-border)}
.config-row:last-child{border-bottom:none}
.config-key{color:var(--brand-text-muted);font-size:.85rem}.config-val{font-weight:600;font-size:.9rem}
.model-pill{display:inline-block;background:var(--brand-surface-raised);padding:4px 10px;border-radius:var(--radius-sm);font-size:.8rem;margin:2px}
pre.raw{background:var(--brand-surface);border:1px solid var(--brand-border);border-radius:var(--radius-sm);padding:16px;overflow-x:auto;font-size:.8rem;color:var(--brand-text-muted);max-height:400px;overflow-y:auto;font-family:var(--font-mono)}
.footer{text-align:center;padding:20px 0;color:var(--brand-text-muted);font-size:.75rem;border-top:1px solid var(--brand-border);margin-top:20px}
`;

export const FONT_LINKS = `<link rel="preconnect" href="https://fonts.googleapis.com"><link rel="preconnect" href="https://fonts.gstatic.com" crossorigin><link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&family=JetBrains+Mono:wght@400;500&display=swap" rel="stylesheet">`;
