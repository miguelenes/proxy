/**
 * Trestle local dashboard HTML templates.
 * @packageDocumentation
 */

import { TRESTLE_MARK_SVG } from "./assets.js";
import { DASHBOARD_BASE_CSS, FONT_LINKS } from "./styles.js";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";

export function getDashboardHTML(): string {
  return `<!DOCTYPE html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Trestle Dashboard</title>${FONT_LINKS}
<style>${DASHBOARD_BASE_CSS}</style></head><body>
<div class="header"><div><h1>${TRESTLE_MARK_SVG} Trestle Dashboard</h1></div><div class="meta"><a href="/dashboard/config">Config</a> · <span id="ver"></span><span id="vstat" class="vstat unavailable">Unable to check</span> · up <span id="uptime"></span> · refreshes every 5s</div></div>
<div id="policy-nudge" style="display:none;background:#1a1a2e;border:1px solid #4a9eff;border-radius:6px;padding:12px 16px;margin-bottom:16px;display:flex;align-items:center;justify-content:space-between;font-family:monospace;font-size:13px;color:#e0e0e0"><span>You've routed <strong id="nudge-reqs">0</strong> requests across <strong id="nudge-agents">0</strong> detected agent<span id="nudge-plural">s</span>. Run <code>trestle policy auto</code> to optimize routing. Estimated savings: ~<strong id="nudge-savings">$0</strong>/mo.</span><div style="display:flex;gap:8px;margin-left:16px"><button onclick="fetch('/v1/policy-auto',{method:'POST'}).then(()=>location.reload())" style="background:#4a9eff;color:#000;border:none;padding:4px 12px;border-radius:4px;cursor:pointer;font-size:12px">Run now</button><button onclick="document.getElementById('policy-nudge').style.display='none';localStorage.setItem('nudge-dismissed','1')" style="background:transparent;color:#888;border:1px solid #444;padding:4px 8px;border-radius:4px;cursor:pointer;font-size:12px">Dismiss</button></div></div>
<script>
(async function(){
  if(localStorage.getItem('nudge-dismissed'))return;
  try{
    const n=await fetch('/v1/policy-nudge').then(r=>r.json());
    if(n.show){
      const el=document.getElementById('policy-nudge');
      if(el){
        el.style.display='flex';
        document.getElementById('nudge-reqs').textContent=n.requestCount;
        document.getElementById('nudge-agents').textContent=n.agentCount;
        document.getElementById('nudge-plural').textContent=n.agentCount===1?'':'s';
        document.getElementById('nudge-savings').textContent='$'+n.estimatedMonthlySavings;
      }
    }
  }catch(e){}
})();
</script>
<div class="cards">
  <div class="card"><div class="label">Requests (7d window, max 10k)</div><div class="value" id="totalReq">—</div><div id="totalReqDetail" style="font-size:.75rem;color:#64748b;margin-top:4px">—</div></div>
  <div class="card"><div class="label">Total Cost</div><div class="value" id="totalCost">—</div></div>
  <div class="card"><div class="label">Routing Savings <span class="tooltip-wrap"><span class="info-icon">ⓘ</span><span class="tooltip-box" id="savings-tooltip">Loading...</span></span></div><div class="value accent" id="savings">—</div><div id="savings-detail" style="font-size:.75rem;color:#64748b;margin-top:4px">—</div></div>
  <div class="card"><div class="label">Avg Latency</div><div class="value" id="avgLat">—</div><div id="avgLatDetail" style="font-size:.75rem;color:#64748b;margin-top:4px">—</div></div>
</div>
<div class="section collapsible collapsed"><h2>Model Breakdown <span style="font-size:.75rem;color:#64748b;font-weight:400">(7d window, history-capped)</span></h2>
<table><thead><tr><th>Provider</th><th>Model</th><th>Requests</th><th>Cost</th><th>% of Total Cost</th></tr></thead><tbody id="models"></tbody></table></div>
<div class="section collapsible collapsed"><h2>Agent Cost Breakdown</h2>
<table><thead><tr><th>Agent</th><th>Requests</th><th>Total Cost</th><th>Last Active</th><th></th></tr></thead><tbody id="agents"></tbody></table></div>
<div class="section"><h2>Provider Status</h2><div class="prov" id="providers"></div></div>
<div class="section collapsible collapsed"><h2>Learning</h2><div id="learning-panel" style="display:flex;flex-direction:column;gap:12px"><div id="learning-stats" style="display:flex;gap:12px;flex-wrap:wrap"></div><div id="learning-recent"></div></div></div>
<div class="section collapsible collapsed" id="sessions-section"><h2>Sessions <span id="sessionsLabel" style="font-size:.75rem;color:#64748b;font-weight:400">(last 7d)</span></h2>
<table><thead><tr><th>Session ID</th><th>Source</th><th>Started</th><th>Duration</th><th>Requests</th><th>Tokens In</th><th>Tokens Out</th><th>Cost</th><th>Models</th><th>Status</th></tr></thead><tbody id="sessions"></tbody></table>
</div>
<div class="section collapsible collapsed" id="token-pool-section"><h2>Token Pool</h2><div id="token-pool-panel"></div></div>
<div class="section"><h2>Recent Runs <span id="historyLabel" style="font-size:.75rem;color:#64748b;font-weight:400">(7d window, history-capped)</span></h2>
<table><thead><tr><th>Time</th><th>Agent</th><th>Model</th><th class="col-tt">Task Type</th><th class="col-cx">Complexity</th><th>Tokens In</th><th>Tokens Out</th><th class="col-cache">Cache Create</th><th class="col-cache">Cache Read</th><th>Cost</th><th>Latency</th><th>Status</th></tr></thead><tbody id="runs"></tbody></table></div>
<script>
const $ = id => document.getElementById(id);
function esc(s){if(!s)return'';return s.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;')}
document.querySelectorAll('.section.collapsible h2').forEach(h2=>h2.addEventListener('click',()=>h2.parentElement.classList.toggle('collapsed')));
function fmt(n,d=2){return typeof n==='number'?n.toFixed(d):'-'}
function fmtTime(s){const d=new Date(s);return d.toLocaleTimeString()}
function dur(s){const h=Math.floor(s/3600),m=Math.floor(s%3600/60);return h?h+'h '+m+'m':m+'m'}
async function loadSessions(){
  try{
    const [sessR,activeR]=await Promise.all([
      fetch('/v1/sessions?limit=20&days=7').then(r=>r.json()).catch(()=>({sessions:[]})),
      fetch('/v1/sessions/active').then(r=>r.json()).catch(()=>({sessions:[]}))
    ]);
    const activeIds=new Set((activeR.sessions||[]).map(s=>s.id));
    const sessions=sessR.sessions||[];
    const el=$('sessions');
    if(!el)return;
    el.innerHTML=sessions.length?sessions.map(s=>{
      const isActive=activeIds.has(s.id)||s.active;
      const dur=s.duration_ms>0?Math.round(s.duration_ms/1000)+'s':'—';
      const badge=isActive?'<span class="badge ok" style="font-size:.7rem">LIVE</span>':'<span style="color:#64748b;font-size:.75rem">idle</span>';
      const srcBadge=s.session_source==='claude-code'?'<span style="color:#60a5fa;font-size:.75rem">claude-code</span>':'<span style="color:#94a3b8;font-size:.75rem">proxy</span>';
      const sid=s.id.length>20?s.id.slice(0,20)+'…':s.id;
      const mix=s.model_mix&&Object.keys(s.model_mix).length?Object.entries(s.model_mix).map(([m,c])=>{const short=m.replace('claude-','').replace(/-\d{8}$/,'').replace('sonnet','Sonnet').replace('opus','Opus').replace('haiku','Haiku');return '<span style="font-size:.72rem;color:#94a3b8">'+short+'<span style="color:#475569">×</span>'+c+'</span>';}).join(' '):'<span style="color:#475569;font-size:.72rem">—</span>';
      return '<tr><td style="font-family:monospace;font-size:.8rem" title="'+esc(s.id)+'">'+sid+'</td><td>'+srcBadge+'</td><td>'+fmtTime(new Date(s.started_at).toISOString())+'</td><td>'+dur+'</td><td>'+s.request_count+'</td><td>'+(s.total_tokens_in||0)+'</td><td>'+(s.total_tokens_out||0)+'</td><td>$'+fmt(s.total_cost_usd,4)+'</td><td>'+mix+'</td><td>'+badge+'</td></tr>';
    }).join(''):'<tr><td colspan=10 style="color:#64748b">No sessions recorded yet</td></tr>';
    const totalCost=sessions.reduce((s,r)=>s+(r.total_cost_usd||0),0);
  }catch(e){console.error('sessions load error',e)}
}
async function load(){
  try{
    const [health,stats,runsR,sav,provH,agentsR]=await Promise.all([
      fetch('/health').then(r=>r.json()),
      fetch('/v1/telemetry/stats').then(r=>r.json()),
      fetch('/v1/telemetry/runs?limit=20').then(r=>r.json()),
      fetch('/v1/telemetry/savings').then(r=>r.json()),
      fetch('/v1/telemetry/health').then(r=>r.json()),
      fetch('/api/agents').then(r=>r.json()).catch(()=>({agents:[]}))
    ]);
    $('ver').textContent='v'+health.version;
    $('uptime').textContent=dur(health.uptime);

    const versionStatus = await fetch('/v1/version-status').then(r=>r.json()).catch(()=>({state:'unavailable', current: health.version, latest: null}));
    const vEl = $('vstat');
    if (vEl) {
      vEl.className = 'vstat ' + (versionStatus.state === 'outdated' ? 'outdated' : versionStatus.state === 'up-to-date' ? 'current' : 'unavailable');
      if (versionStatus.state === 'outdated') {
        vEl.textContent = 'Update available · v' + versionStatus.current + ' → v' + versionStatus.latest;
      } else if (versionStatus.state === 'up-to-date') {
        vEl.textContent = 'Up to date · v' + versionStatus.current;
      } else {
        vEl.textContent = 'Unable to check · v' + versionStatus.current;
      }
    }
    const lifetimeTotal=stats.summary?.totalRequests ?? stats.summary?.totalEvents ?? 0;
    const historyTotal=stats.summary?.totalEvents ?? 0;
    const historyLimit=stats.summary?.historyLimit ?? 10000;
    const retentionDays=stats.summary?.retentionDays ?? 7;
    $('totalReq').textContent=historyTotal;
    $('totalReqDetail').textContent='Process lifetime: '+lifetimeTotal.toLocaleString()+' (resets on restart)';
    $('historyLabel').textContent='('+retentionDays+'d window, max '+historyLimit.toLocaleString()+' requests)';
    $('totalCost').textContent='$'+fmt(stats.summary?.totalCostUsd??0,4);
    const savAmt=sav.savedAmount??sav.savings??0;
    const cacheSav=sav.cacheSavings??0;
    const routeSav=sav.routingSavings??0;
    const actual=sav.actualCost??0;
    const hasAnthropic=sav.hasAnthropicCalls!==false;
    const baseline=sav.potentialSavings??sav.total??0;
    // Headline = routing savings % (Trestle's actual contribution)
    const routeBaseline=baseline>0?baseline:1;
    const routePct=hasAnthropic?Math.round((routeSav/routeBaseline)*100):0;
    const totalPct=sav.percentage??0;
    $('savings').textContent='$'+fmt(routeSav,2);
    // Secondary: show total % including cache as context
    if(hasAnthropic){
      $('savings-detail').innerHTML='<span style="color:#60a5fa">routing savings</span> · <span style="color:#64748b" title="Includes Anthropic prompt cache hits which happen regardless of routing">'+totalPct+'% total incl. cache</span>';
    } else {
      $('savings-detail').innerHTML='<span style="color:#a78bfa">$'+fmt(cacheSav,2)+' cache</span> · <span style="color:#64748b">'+totalPct+'% total</span>';
    }
    const tipEl=$('savings-tooltip');
    if(tipEl){
      let tip='<strong>How savings are calculated</strong><br><br>';
      if(hasAnthropic){
        tip+='<span style="color:#60a5fa">🔀 Routing savings: $'+fmt(routeSav,2)+'</span><br><small>Requests routed to cheaper models (e.g. Sonnet) vs always using Opus. Trestle contribution.</small><br><br>';
        tip+='<span style="color:#a78bfa">💾 Cache savings: $'+fmt(cacheSav,2)+'</span><br><small>Anthropic prompt cache hits (10× cheaper reads). This would happen without Trestle too.</small><br><br>';
      } else {
        tip+='<span style="color:#a78bfa">💾 Cache savings: $'+fmt(cacheSav,2)+'</span><br><small>Provider cache hits. Happens automatically, not specific to Trestle.</small><br><br>';
      }
      tip+='💳 Actual cost: <b>$'+fmt(actual,2)+'</b><br>✅ Total saved: <b>$'+fmt(savAmt,2)+'</b>';
      tipEl.innerHTML=tip;
    }
    $('avgLat').textContent=(stats.summary?.avgLatencyMs??0)+'ms';
    $('avgLatDetail').textContent='7d window metric (history-capped)';
    const modelTotalCost=(stats.byModel||[]).reduce((s,m)=>s+(m.costUsd||0),0);
    $('models').innerHTML=(stats.byModel||[]).map(m=>
      '<tr><td style="color:#94a3b8;font-size:.85rem">'+(m.provider||'—')+'</td><td>'+m.model+'</td><td>'+m.count+'</td><td>$'+fmt(m.costUsd,4)+'</td><td>'+fmt(modelTotalCost>0?m.costUsd/modelTotalCost*100:0,1)+'%</td></tr>'
    ).join('')||'<tr><td colspan=5 style="color:#64748b">No data yet</td></tr>';
    function ttCls(t){const m={code_generation:'tt-code',analysis:'tt-analysis',summarization:'tt-summarization',question_answering:'tt-qa'};return m[t]||'tt-general'}
    function cxCls(c){const m={simple:'cx-simple',moderate:'cx-moderate',complex:'cx-complex'};return m[c]||'cx-simple'}
    const agents=(agentsR.agents||[]).sort((a,b)=>(b.totalCost||0)-(a.totalCost||0));
    $('runs').innerHTML=(runsR.runs||[]).map((r,i)=>{
      function errBadge(r){if(r.status==='success')return '<span class="badge ok">success</span>';var cls='err';var label=r.error||'error';if(r.statusCode===401||r.statusCode===403||(r.error&&/auth/i.test(r.error)))cls='err-auth';else if(r.statusCode===429||(r.error&&/rate.?limit/i.test(r.error)))cls='err-rate';else if(r.error&&/timeout/i.test(r.error))cls='err-timeout';return '<span class="badge '+cls+'" title="'+esc(r.error||'')+' (HTTP '+( r.statusCode||'?')+')">'+(r.statusCode?r.statusCode+' ':'')+ (label.length>40?label.slice(0,40)+'…':label)+'</span>';}
      const agentName=agents.find(a=>a.fingerprint===r.agentFingerprint)?.name||(r.agentId||'—');
      const row='<tr style="cursor:pointer" onclick="toggleDetail('+i+')"><td><span id="arrow-'+i+'" style="color:#64748b;font-size:.7rem;margin-right:6px">▶</span>'+fmtTime(r.started_at)+'</td><td style="font-size:.85rem">'+esc(agentName)+'</td><td>'+r.model+'</td><td class="col-tt"><span class="badge '+ttCls(r.taskType)+'">'+(r.taskType||'general').replace(/_/g,' ')+'</span></td><td class="col-cx"><span class="badge '+cxCls(r.complexity)+'">'+(r.complexity||'simple')+'</span></td><td>'+(r.tokensIn||0)+'</td><td>'+(r.tokensOut||0)+'</td><td class="col-cache" style="color:#60a5fa">'+(r.cacheCreationTokens||0)+'</td><td class="col-cache" style="color:#34d399">'+(r.cacheReadTokens||0)+'</td><td>$'+fmt(r.costUsd,4)+'</td><td>'+r.latencyMs+'ms</td><td>'+errBadge(r)+'</td></tr>';
      const c=r.requestContent||{};
      let detail='<tr id="run-detail-'+i+'" style="display:none"><td colspan="12" style="padding:16px;background:#111217;border-bottom:1px solid #1e293b">';
      if(c.systemPrompt||c.userMessage||c.responsePreview){
        if(c.systemPrompt) detail+='<div style="color:#64748b;font-size:.85rem;margin-bottom:10px;font-style:italic"><strong style="color:#94a3b8">System:</strong> '+esc(c.systemPrompt)+'</div>';
        if(c.userMessage) detail+='<div style="background:#1a1c23;border:1px solid #1e293b;border-radius:8px;padding:12px;margin-bottom:10px"><strong style="color:#94a3b8;font-size:.8rem">User Message</strong><div style="margin-top:6px;white-space:pre-wrap">'+esc(c.userMessage)+'</div></div>';
        if(c.responsePreview) detail+='<div style="background:#1a1c23;border:1px solid #1e293b;border-radius:8px;padding:12px;margin-bottom:10px"><strong style="color:#94a3b8;font-size:.8rem">Response Preview</strong><div style="margin-top:6px;white-space:pre-wrap">'+esc(c.responsePreview)+'</div></div>';
        const btnAttrs='id="full-btn-'+i+'" style="background:#1e293b;color:#e2e8f0;border:1px solid #334155;padding:6px 12px;border-radius:6px;font-size:.8rem"';
        detail+=(r.tokensOut>0?'<button onclick="event.stopPropagation();loadFullResponse(&quot;'+r.id+'&quot;,'+i+')" '+btnAttrs+'>Show full response</button>':'<button disabled '+btnAttrs+' style="opacity:.4;cursor:default">Response not available (streaming)</button>')+'<pre id="full-resp-'+i+'" style="display:none;white-space:pre-wrap;margin-top:10px;background:#0d0e11;border:1px solid #1e293b;border-radius:8px;padding:12px;max-height:400px;overflow:auto;font-size:.8rem"></pre>';
      } else {
        detail+='<span style="color:#64748b">No content captured for this request</span>';
      }
      detail+='</td></tr>';
      return row+detail;
    }).join('')||'<tr><td colspan=12 style="color:#64748b">No runs yet</td></tr>';
    restoreExpanded();
    $('agents').innerHTML=agents.length?agents.map(a=>
      '<tr><td><span class="agent-name" data-fp="'+a.fingerprint+'">'+esc(a.name)+'</span> <button class="rename-btn" onclick="renameAgent(&quot;'+a.fingerprint+'&quot;,&quot;'+a.name.replace(/"/g,'')+'&quot;)">✏️</button></td><td>'+a.totalRequests+'</td><td>$'+fmt(a.totalCost,4)+'</td><td>'+fmtTime(a.lastSeen)+'</td><td style="font-size:.7rem;color:#64748b" title="'+esc(a.systemPromptPreview||'')+'">'+a.fingerprint+'</td></tr>'
    ).join(''):'<tr><td colspan=5 style="color:#64748b">No agents detected yet</td></tr>';
    $('providers').innerHTML=(provH.providers||[]).map(p=>{
      const dotClass = p.status==='healthy'?'up':(p.status==='degraded'?'warn':'down');
      const rate = p.successRate!==undefined?(' '+Math.round(p.successRate*100)+'%'):'';
      return '<div class="prov-item"><span class="dot '+dotClass+'"></span>'+p.provider+rate+'</div>';
    }).join('');
  }catch(e){console.error(e)}
}
async function renameAgent(fp,currentName){
  const name=prompt('Rename agent:',currentName);
  if(!name||name===currentName)return;
  await fetch('/api/agents/rename',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({fingerprint:fp,name:name})});
  load();
}
const expandedRows=new Set();
function toggleDetail(i){var d=document.getElementById('run-detail-'+i);var arrow=document.getElementById('arrow-'+i);if(d.style.display==='none'){d.style.display='table-row';expandedRows.add(i);if(arrow)arrow.textContent='▼'}else{d.style.display='none';expandedRows.delete(i);if(arrow)arrow.textContent='▶'}}
function restoreExpanded(){expandedRows.forEach(i=>{var d=document.getElementById('run-detail-'+i);var arrow=document.getElementById('arrow-'+i);if(d)d.style.display='table-row';if(arrow)arrow.textContent='▼'})}
async function loadFullResponse(runId,i){
  const btn=document.getElementById('full-btn-'+i);
  const pre=document.getElementById('full-resp-'+i);
  if(pre.style.display!=='none'){pre.style.display='none';btn.textContent='Show full response';return}
  btn.textContent='Loading...';
  try{
    const data=await fetch('/api/runs/'+runId).then(r=>r.json());
    const full=data.requestContent&&data.requestContent.fullResponse;
    if(full){pre.textContent=full;pre.style.display='block';btn.textContent='Hide full response'}
    else{btn.textContent='No full response available'}
  }catch{btn.textContent='Error loading response'}
}
async function loadLearning(){
  try{
    const k=await fetch('/v1/knowledge/stats').then(r=>r.json()).catch(()=>null);
    if(!k)return;
    const statsEl=$('learning-stats');
    const recentEl=$('learning-recent');
    if(statsEl){
      statsEl.innerHTML='<div class="card" style="flex:1;min-width:140px"><div class="label">Total Learnings</div><div class="value">'+k.totalLearnings+'</div></div>'+
        '<div class="card" style="flex:1;min-width:140px"><div class="label">Recent (7d)</div><div class="value">'+k.recentLearnings.length+'</div></div>'+
        '<div class="card" style="flex:2;min-width:200px"><div class="label">Knowledge Files</div><div class="value" style="font-size:.9rem;line-height:1.6">'+
        (k.fileStats.length?k.fileStats.map(function(f){return '<span style="color:#94a3b8;font-weight:400">'+f.file+'</span> <span style="color:#34d399">'+f.learnings+'</span>'}).join(' &middot; '):'—')+'</div></div>';
    }
    if(recentEl){
      if(k.recentLearnings.length){
        recentEl.innerHTML='<div style="font-size:.8rem;color:#64748b;margin-bottom:8px;text-transform:uppercase;letter-spacing:.04em">Recent Learnings (7d)</div>'+
          k.recentLearnings.map(function(l){return '<div style="padding:8px 12px;background:#111318;border:1px solid #1e293b;border-radius:8px;margin-bottom:6px;font-size:.85rem"><span style="color:#64748b;font-size:.75rem">'+l.date+' · @'+l.agent+'</span><div style="margin-top:4px">'+l.preview+'</div></div>'}).join('');
      }else{
        recentEl.innerHTML='<div style="color:#64748b;font-size:.85rem">No learnings recorded yet. Run <code style="background:#1e293b;padding:2px 6px;border-radius:4px">node packages/proxy/scripts/extract-knowledge.js</code> after agent sessions.</div>';
      }
    }
  }catch(e){console.error('learning load error',e)}
}
async function loadTokenPool(){
  try{
    const data=await fetch('/v1/token-pool/status').then(r=>r.json()).catch(()=>null);
    const el=$('token-pool-panel');
    if(!el)return;
    if(!data||!data.accounts||data.accounts.length===0){
      el.innerHTML='<div style="color:#64748b;font-size:.85rem">No accounts registered. Add accounts under <code style="background:#1e293b;padding:2px 6px;border-radius:4px">providers.anthropic.accounts[]</code> in ~/.trestle/config.json for multi-account pooling.</div>';
      return;
    }
    el.innerHTML='<table><thead><tr><th>Label</th><th>Source</th><th>Priority</th><th>Type</th><th>Req/min</th><th>RPM Limit</th><th>Status</th></tr></thead><tbody>'+
      data.accounts.map(function(a){
        const rl=a.rateLimitedUntil?'<span class="badge err">rate-limited until '+new Date(a.rateLimitedUntil).toLocaleTimeString()+'</span>':
          a.available?'<span class="badge ok">available</span>':'<span class="badge err-rate">throttled</span>';
        const type=a.isOat?'<span style="color:#60a5fa;font-size:.75rem">OAT/Max</span>':'<span style="color:#94a3b8;font-size:.75rem">API key</span>';
        const src=a.source==='config'?'<span style="color:#34d399;font-size:.75rem">config</span>':'<span style="color:#64748b;font-size:.75rem">auto</span>';
        const pct=a.knownRpmLimit>0?Math.round(a.requestsThisMinute/a.knownRpmLimit*100):0;
        const bar='<div style="background:#1e293b;border-radius:4px;height:6px;width:80px;display:inline-block;vertical-align:middle"><div style="background:'+(pct>=90?'#ef4444':pct>=70?'#fbbf24':'#34d399')+';height:100%;border-radius:4px;width:'+Math.min(pct,100)+'%"></div></div>';
        return '<tr><td>'+esc(a.label)+'</td><td>'+src+'</td><td>'+a.priority+'</td><td>'+type+'</td><td>'+a.requestsThisMinute+' '+bar+'</td><td>'+a.knownRpmLimit+' rpm</td><td>'+rl+'</td></tr>';
      }).join('')+'</tbody></table>';
  }catch(e){console.error('token pool load error',e)}
}
load();loadLearning();loadSessions();loadTokenPool();setInterval(load,5000);setInterval(loadLearning,30000);setInterval(loadSessions,10000);setInterval(loadTokenPool,10000);
</script><footer class="footer">Built locally, measured honestly. Request content stays on your machine.</footer></body></html>`;
}

// ── Knowledge stats ─────────────────────────────────────────────────────────
interface KnowledgeLearning {
  date: string;
  agent: string;
  preview: string;
}

interface KnowledgeStats {
  totalLearnings: number;
  recentLearnings: KnowledgeLearning[];
  fileStats: { file: string; learnings: number }[];
  knowledgeDir: string;
}

export async function getKnowledgeStats(): Promise<KnowledgeStats> {
  const knowledgeDir = path.join(
    os.homedir(),
    ".openclaw",
    "workspace",
    "knowledge",
  );
  const sevenDaysAgo = new Date();
  sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);

  let totalLearnings = 0;
  const recentLearnings: KnowledgeLearning[] = [];
  const fileStats: { file: string; learnings: number }[] = [];

  let files: string[] = [];
  try {
    files = await fs.promises.readdir(knowledgeDir);
  } catch {
    // directory may not exist yet
    return {
      totalLearnings: 0,
      recentLearnings: [],
      fileStats: [],
      knowledgeDir,
    };
  }

  for (const file of files.filter((f) => f.endsWith(".md"))) {
    const filePath = path.join(knowledgeDir, file);
    let content: string;
    try {
      content = await fs.promises.readFile(filePath, "utf8");
    } catch {
      continue;
    }

    // Count <!-- [YYYY-MM-DD] agent:xxx --> markers as learning entries
    const markerRegex =
      /<!--\s*\[(\d{4}-\d{2}-\d{2})\]\s*agent:(\w+)\s*-->\n([\s\S]*?)(?=<!--|\s*$)/g;
    let match: RegExpExecArray | null;
    let fileCount = 0;

    while ((match = markerRegex.exec(content)) !== null) {
      const dateStr = match[1];
      const agent = match[2];
      const body = match[3].trim();
      fileCount++;
      totalLearnings++;

      const entryDate = new Date(dateStr);
      if (entryDate >= sevenDaysAgo) {
        // Extract first bullet as preview
        const firstLine =
          body.split("\n").find((l) => l.trim().startsWith("-")) ||
          body.split("\n")[0] ||
          "";
        recentLearnings.push({
          date: dateStr,
          agent,
          preview: firstLine.replace(/^-\s*/, "").slice(0, 100),
        });
      }
    }

    fileStats.push({ file, learnings: fileCount });
  }

  recentLearnings.sort((a, b) => b.date.localeCompare(a.date));

  return {
    totalLearnings,
    recentLearnings: recentLearnings.slice(0, 10),
    fileStats,
    knowledgeDir,
  };
}

export function getConfigDashboardHTML(): string {
  return `<!DOCTYPE html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Trestle Config</title>${FONT_LINKS}
<style>${DASHBOARD_BASE_CSS}</style></head><body>
<div class="header"><div><h1>${TRESTLE_MARK_SVG} Trestle Config</h1></div><div class="meta"><a href="/dashboard">← Dashboard</a> · read-only view of ~/.trestle/config.json</div></div>
<div id="content"><p style="color:#64748b">Loading config...</p></div>
<script>
async function load(){
  try{
    const cfg=await fetch('/v1/config').then(r=>r.json());
    const r=cfg.routing||{};const c=r.cascade||{};const rel=cfg.reliability||{};const mesh=cfg.mesh||{};
    const mode=r.mode||'auto';
    const modeColor=mode==='auto'?'green':mode==='cascade'?'yellow':'';
    const cx=r.complexity||{};
    const cascadeEnabled=c.enabled!==false&&(c.models||[]).length>0;
    const meshEnabled=mesh.enabled===true;

    let html='<div class="config-grid">';
    html+='<div class="card"><div class="label">Routing Mode</div><div class="value '+modeColor+'">'+mode+'</div></div>';
    html+='<div class="card"><div class="label">Cascade</div><div class="value">'+(cascadeEnabled?'<span class="green">Enabled</span>':'<span style="color:#64748b">Disabled</span>')+'</div></div>';
    html+='<div class="card"><div class="label">Mesh</div><div class="value">'+(meshEnabled?'<span class="green">Enabled</span>':'<span style="color:#64748b">Disabled</span>')+'</div></div>';
    html+='</div>';

    // Complexity model mapping
    html+='<div class="section"><h2>Complexity Model Mapping</h2><div class="card">';
    if(cx.simple||cx.moderate||cx.complex){
      html+='<div class="config-row"><span class="config-key">Simple →</span><span class="config-val"><span class="model-pill">'+(cx.simple||'default')+'</span></span></div>';
      html+='<div class="config-row"><span class="config-key">Moderate →</span><span class="config-val"><span class="model-pill">'+(cx.moderate||'default')+'</span></span></div>';
      html+='<div class="config-row"><span class="config-key">Complex →</span><span class="config-val"><span class="model-pill">'+(cx.complex||'default')+'</span></span></div>';
      html+='<div class="config-row"><span class="config-key">Enabled</span><span class="config-val">'+(cx.enabled!==false?'<span class="badge ok">Yes</span>':'<span class="badge off">No</span>')+'</span></div>';
    }else{html+='<p style="color:#64748b">No complexity mapping configured</p>';}
    html+='</div></div>';

    // Cascade settings
    html+='<div class="section"><h2>Cascade Settings</h2><div class="card">';
    if(cascadeEnabled){
      html+='<div class="config-row"><span class="config-key">Models</span><span class="config-val">'+(c.models||[]).map(function(m){return '<span class="model-pill">'+m+'</span>'}).join(' → ')+'</span></div>';
      html+='<div class="config-row"><span class="config-key">Escalate On</span><span class="config-val">'+(c.escalateOn||'uncertainty')+'</span></div>';
      if(c.maxEscalations)html+='<div class="config-row"><span class="config-key">Max Escalations</span><span class="config-val">'+c.maxEscalations+'</span></div>';
    }else{html+='<p style="color:#64748b">Cascade not configured</p>';}
    html+='</div></div>';

    // Reliability
    html+='<div class="section"><h2>Reliability Settings</h2><div class="card">';
    const cool=rel.cooldown||{};
    html+='<div class="config-row"><span class="config-key">Cooldown Duration</span><span class="config-val">'+(cool.durationMs||(cool.duration??'default'))+'</span></div>';
    html+='<div class="config-row"><span class="config-key">Max Failures</span><span class="config-val">'+(cool.maxFailures||'default')+'</span></div>';
    html+='</div></div>';

    // Mesh
    html+='<div class="section"><h2>Mesh Settings</h2><div class="card">';
    html+='<div class="config-row"><span class="config-key">Enabled</span><span class="config-val">'+(meshEnabled?'<span class="badge ok">Yes</span>':'<span class="badge off">No</span>')+'</span></div>';
    if(mesh.peers)html+='<div class="config-row"><span class="config-key">Peers</span><span class="config-val">'+(mesh.peers||[]).map(function(p){return '<span class="model-pill">'+p+'</span>'}).join(' ')+'</span></div>';
    html+='</div></div>';

    // Raw JSON
    html+='<div class="section"><h2>Raw Config</h2><pre class="raw">'+JSON.stringify(cfg,null,2)+'</pre></div>';

    document.getElementById('content').innerHTML=html;
  }catch(e){document.getElementById('content').innerHTML='<p style="color:#ef4444">Error loading config: '+e.message+'</p>';}
}
load();
</script></body></html>`;
}
