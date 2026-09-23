(function(){
"use strict";

/* ======================================================================
   THEME
====================================================================== */
const THEME_KEY='pulse_theme';
function applyTheme(t){
  document.documentElement.setAttribute('data-theme', t);
  localStorage.setItem(THEME_KEY, t);
  const icon=document.getElementById('themeIcon');
  icon.innerHTML = t==='dark'
    ? '<circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/>'
    : '<path d="M21 12.8A9 9 0 1 1 11.2 3 7 7 0 0 0 21 12.8Z"/>';
  refreshCharts();
}
applyTheme(localStorage.getItem(THEME_KEY) || 'dark');
document.getElementById('themeToggle').addEventListener('click', ()=>{
  applyTheme(document.documentElement.getAttribute('data-theme')==='dark' ? 'light' : 'dark');
});

/* ======================================================================
   NAVIGATION
====================================================================== */
const views={test:document.getElementById('view-test'), history:document.getElementById('view-history'), network:document.getElementById('view-network')};
document.querySelectorAll('nav.primary button').forEach(btn=>{
  btn.addEventListener('click', ()=>{
    document.querySelectorAll('nav.primary button').forEach(b=>{b.classList.remove('active'); b.setAttribute('aria-selected','false');});
    btn.classList.add('active'); btn.setAttribute('aria-selected','true');
    Object.values(views).forEach(v=>v.classList.remove('active'));
    views[btn.dataset.view].classList.add('active');
    if(btn.dataset.view==='history') renderHistory();
    if(btn.dataset.view==='network') loadNetworkInfo();
  });
});

/* ======================================================================
   UTILITIES
====================================================================== */
const $ = id=>document.getElementById(id);
const clamp=(v,a,b)=>Math.max(a,Math.min(b,v));
const round1=v=>Math.round(v*10)/10;
function median(arr){const s=[...arr].sort((a,b)=>a-b); const m=Math.floor(s.length/2); return s.length%2? s[m] : (s[m-1]+s[m])/2;}
function mean(arr){return arr.reduce((a,b)=>a+b,0)/(arr.length||1);}
function fmtTime(ts){return new Date(ts).toLocaleTimeString([], {hour:'numeric', minute:'2-digit'});}
function fmtDate(ts){return new Date(ts).toLocaleDateString([], {month:'short', day:'numeric'});}
function withTimeout(promise, ms){
  return new Promise((resolve,reject)=>{
    const t=setTimeout(()=>reject(new Error('timeout')), ms);
    promise.then(v=>{clearTimeout(t); resolve(v);}, e=>{clearTimeout(t); reject(e);});
  });
}

/* ======================================================================
   RATING HELPERS
====================================================================== */
function ratingFromScore(s){
  if(s>=90) return {label:'Excellent', cls:'good'};
  if(s>=75) return {label:'Very Good', cls:'good'};
  if(s>=60) return {label:'Good', cls:'warn'};
  if(s>=40) return {label:'Fair', cls:'warn'};
  return {label:'Poor', cls:'bad'};
}
function scoreFromDownload(m){ if(m>=200)return 100; if(m>=100)return 96; if(m>=50)return 88; if(m>=25)return 76; if(m>=10)return 58; if(m>=5)return 38; if(m>=1)return 18; return 6; }
function scoreFromUpload(m){ if(m>=100)return 100; if(m>=50)return 96; if(m>=25)return 88; if(m>=10)return 76; if(m>=5)return 58; if(m>=2)return 38; if(m>=0.5)return 18; return 6; }
function scoreFromPing(p){ if(p<=10)return 100; if(p<=20)return 92; if(p<=40)return 80; if(p<=60)return 65; if(p<=100)return 46; if(p<=150)return 26; return 10; }
function scoreFromJitter(j){ if(j<=2)return 100; if(j<=5)return 90; if(j<=10)return 75; if(j<=20)return 55; if(j<=40)return 30; return 10; }
function scoreFromLoss(l){ if(l<=0)return 100; if(l<=0.5)return 90; if(l<=1)return 75; if(l<=2)return 55; if(l<=5)return 30; return 10; }

function computeHealth(r){
  const dS=scoreFromDownload(r.download), uS=scoreFromUpload(r.upload), pS=scoreFromPing(r.ping),
        jS=scoreFromJitter(r.jitter), lS=scoreFromLoss(r.packetLoss), sS=r.stability;
  const overall = dS*0.30 + uS*0.15 + pS*0.20 + jS*0.10 + lS*0.15 + sS*0.10;
  return {overall:Math.round(clamp(overall,0,100)), dS,uS,pS,jS,lS,sS};
}
function healthDescription(score){
  if(score>=90) return "Your connection is fast and stable and should handle streaming, video calls, gaming, cloud applications, and large downloads comfortably.";
  if(score>=75) return "Your connection performs well for almost everything, with only occasional dips that most people won't notice.";
  if(score>=60) return "Your connection handles everyday browsing and streaming fine, but may struggle with high-demand tasks like competitive gaming or 4K video calls.";
  if(score>=40) return "Your connection is inconsistent. Everyday tasks should work, but you may notice buffering, lag, or dropped calls at times.";
  return "Your connection is struggling. Streaming, calls, and downloads are likely to be slow or unreliable — see the suggestions below.";
}

/* ======================================================================
   METRIC CARD RENDERING (idle dashboard)
====================================================================== */
const METRIC_DEFS=[
  {key:'download', name:'Download Speed', unit:'Mbps', icon:'M12 3v14M6 11l6 6 6-6M4 21h16'},
  {key:'upload', name:'Upload Speed', unit:'Mbps', icon:'M12 21V7M6 13l6-6 6 6M4 3h16'},
  {key:'ping', name:'Ping / Latency', unit:'ms', icon:'M3 12h4l2-7 4 14 2-7h6'},
  {key:'jitter', name:'Jitter', unit:'ms', icon:'M2 12h3l2-5 4 10 3-8 2 3h6'},
  {key:'packetLoss', name:'Packet Loss', unit:'%', icon:'M12 2 2 21h20L12 2zM12 9v5M12 17h.01'},
  {key:'stability', name:'Stability', unit:'%', icon:'M3 17l5-5 4 4 8-8M14 8h5v5'},
];
function tagFor(scoreVal){
  const r=ratingFromScore(scoreVal);
  const bg = r.cls==='good' ? 'var(--good-dim)' : r.cls==='warn' ? 'var(--warn-dim)' : 'var(--bad-dim)';
  const fg = r.cls==='good' ? 'var(--good)' : r.cls==='warn' ? 'var(--warn)' : 'var(--bad)';
  return {label:r.label, bg, fg};
}
function renderMetricGrid(result){
  const grid=$('metricGrid'); grid.innerHTML='';
  METRIC_DEFS.forEach(def=>{
    const val = result ? result[def.key] : null;
    let scoreVal=50;
    if(result){
      if(def.key==='download') scoreVal=scoreFromDownload(val);
      else if(def.key==='upload') scoreVal=scoreFromUpload(val);
      else if(def.key==='ping') scoreVal=scoreFromPing(val);
      else if(def.key==='jitter') scoreVal=scoreFromJitter(val);
      else if(def.key==='packetLoss') scoreVal=scoreFromLoss(val);
      else if(def.key==='stability') scoreVal=val;
    }
    const tag=tagFor(scoreVal);
    const div=document.createElement('div');
    div.className='metric-card';
    div.innerHTML = `
      <div class="metric-top">
        <span class="metric-name">${def.name}</span>
        <svg class="metric-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="${def.icon}"/></svg>
      </div>
      <div class="metric-value">${val!=null? val : '—'}<span class="metric-unit">${val!=null? def.unit : ''}</span></div>
      <span class="metric-tag" style="background:${tag.bg}; color:${tag.fg};">${result? tag.label : 'Not tested'}</span>
    `;
    grid.appendChild(div);
  });
}
renderMetricGrid(null);

function setHeroScore(score){
  const circumference = 2*Math.PI*86;
  const ring=$('heroRing');
  const offset = circumference - (score/100)*circumference;
  ring.style.strokeDasharray = circumference;
  ring.style.strokeDashoffset = offset;
  const r=ratingFromScore(score);
  const color = r.cls==='good' ? 'var(--good)' : r.cls==='warn' ? 'var(--warn)' : 'var(--bad)';
  ring.style.stroke = color;
  $('heroScore').textContent = score;
  $('heroLabel').textContent = r.label + ' Connection';
  $('heroDesc').textContent = healthDescription(score);
  const badge=$('heroBadge');
  badge.style.display='inline-flex';
  badge.className='badge '+r.cls;
  $('heroBadgeText').textContent = r.label + ' Connection';
}

/* ======================================================================
   LOCAL STORAGE HISTORY
====================================================================== */
const HISTORY_KEY='pulse_history_v1';
function loadHistory(){ try{ return JSON.parse(localStorage.getItem(HISTORY_KEY))||[]; }catch(e){ return []; } }
function saveHistory(list){ localStorage.setItem(HISTORY_KEY, JSON.stringify(list.slice(-50))); }
function addToHistory(entry){ const h=loadHistory(); h.push(entry); saveHistory(h); }

function refreshLastRunLabel(){
  const h=loadHistory();
  if(!h.length){ $('lastRun').textContent='No tests run yet on this device'; return; }
  const last=h[h.length-1];
  $('lastRun').textContent = `Last test: ${fmtTime(last.ts)} · ${last.download} Mbps down · Health ${last.health}/100`;
}
(function initDashboardFromHistory(){
  const h=loadHistory();
  if(h.length){
    const last=h[h.length-1];
    renderMetricGrid(last);
    setHeroScore(last.health);
  }
  refreshLastRunLabel();
})();

/* ======================================================================
   NETWORK ENGINE — real measurement via Cloudflare speed-test edge + ipify
====================================================================== */
const EP = {
  down: 'https://speed.cloudflare.com/__down?bytes=',
  up: 'https://speed.cloudflare.com/__up',
  trace: 'https://speed.cloudflare.com/cdn-cgi/trace',
  ipv4: 'https://api.ipify.org?format=json',
  ipv6: 'https://api64.ipify.org?format=json',
  geo: 'https://ipapi.co/json/'
};

// Runs `count` parallel timed transfers for up to maxDurationMs, sampling combined throughput.
function runParallelTransfer({count, maxDurationMs, makeRequest, onSample}){
  return new Promise((resolve)=>{
    const perStreamLoaded = new Array(count).fill(0);
    const xhrs = [];
    let settled = 0;
    let finished = false;
    const startedAt = performance.now();
    let lastSampleBytes = 0, lastSampleTime = startedAt;

    const sampleTimer = setInterval(()=>{
      const now = performance.now();
      const total = perStreamLoaded.reduce((a,b)=>a+b,0);
      const dt = (now - lastSampleTime)/1000;
      const dBytes = total - lastSampleBytes;
      if(dt>0 && onSample){
        const mbps = (dBytes*8)/1e6/dt;
        onSample(mbps, total, now-startedAt);
      }
      lastSampleBytes = total; lastSampleTime = now;
    }, 200);

    function wrapUp(){
      if(finished) return; finished = true;
      clearInterval(sampleTimer);
      xhrs.forEach(x=>{ try{ x.abort(); }catch(e){} });
      const total = perStreamLoaded.reduce((a,b)=>a+b,0);
      const elapsed = (performance.now() - startedAt)/1000;
      resolve({totalBytes: total, seconds: Math.max(elapsed, 0.05)});
    }

    const hardStop = setTimeout(wrapUp, maxDurationMs);

    for(let i=0;i<count;i++){
      const xhr = makeRequest(i, (loaded)=>{ perStreamLoaded[i]=loaded; });
      xhrs.push(xhr);
      xhr._onDone = ()=>{ settled++; if(settled>=count){ clearTimeout(hardStop); wrapUp(); } };
    }
  });
}

function makeDownloadXhr(bytes, onProgress){
  const xhr = new XMLHttpRequest();
  xhr.open('GET', EP.down + bytes + '&cb=' + Math.random(), true);
  xhr.responseType = 'arraybuffer';
  xhr.onprogress = (e)=> onProgress(e.loaded);
  xhr.onloadend = ()=> { if(xhr._onDone) xhr._onDone(); };
  xhr.send();
  return xhr;
}
function makeUploadXhr(blob, onProgress){
  const xhr = new XMLHttpRequest();
  xhr.open('POST', EP.up, true);
  xhr.upload.onprogress = (e)=> onProgress(e.loaded);
  xhr.onloadend = ()=> { if(xhr._onDone) xhr._onDone(); };
  xhr.setRequestHeader('Content-Type','application/octet-stream');
  xhr.send(blob);
  return xhr;
}
function randomBlob(bytes){
  const buf = new Uint8Array(bytes);
  crypto.getRandomValues(buf.subarray(0, Math.min(bytes, 65536)));
  // repeat pattern to fill (avoids costly full crypto fill for large sizes)
  for(let off=65536; off<bytes; off+=65536){ buf.set(buf.subarray(0, Math.min(65536, bytes-off)), off); }
  return new Blob([buf]);
}

async function measureConnectivity(){
  if(!navigator.onLine) throw new Error('offline');
  await withTimeout(fetch(EP.trace+'?cb='+Math.random(), {cache:'no-store'}), 6000);
}

async function measureLatency(onTick){
  const pings=[]; let lost=0; const N=8;
  for(let i=0;i<N;i++){
    const t0=performance.now();
    try{
      await withTimeout(fetch(EP.down+'0&cb='+Math.random(), {cache:'no-store'}), 2500);
      const t=performance.now()-t0;
      pings.push(t);
      onTick && onTick(t, i, N);
    }catch(e){ lost++; onTick && onTick(null, i, N); }
    await new Promise(r=>setTimeout(r, 60));
  }
  if(pings.length===0) throw new Error('latency_failed');
  const ping = median(pings);
  let jitterSum=0;
  for(let i=1;i<pings.length;i++) jitterSum += Math.abs(pings[i]-pings[i-1]);
  const jitter = pings.length>1 ? jitterSum/(pings.length-1) : 0;
  const packetLoss = (lost/N)*100;
  return {ping: round1(ping), jitter: round1(jitter), packetLoss: round1(packetLoss)};
}

async function measureDownload(onSample){
  const sizesMB=[4,8,16,25];
  let idx=0, totalBytes=0, totalTime=0;
  const samples=[];
  while(idx<sizesMB.length && totalTime<7){
    const bytes = sizesMB[idx]*1024*1024;
    const {totalBytes:tb, seconds} = await runParallelTransfer({
      count:4, maxDurationMs: 2600,
      makeRequest:(i,cb)=>makeDownloadXhr(bytes,cb),
      onSample:(mbps)=>{ samples.push(mbps); onSample && onSample(mbps); }
    });
    totalBytes += tb; totalTime += seconds; idx++;
  }
  const mbps = totalTime>0 ? (totalBytes*8)/1e6/totalTime : 0;
  const avgSample = samples.length ? mean(samples) : mbps;
  const variance = samples.length>1 ? mean(samples.map(s=>Math.pow(s-avgSample,2))) : 0;
  const stdDev = Math.sqrt(variance);
  const stability = clamp(100 - (avgSample>0 ? (stdDev/avgSample)*100 : 0), 0, 100);
  return {mbps: round1(mbps), stability: Math.round(stability), samples};
}

async function measureUpload(onSample){
  const sizesMB=[2,4,8];
  let idx=0, totalBytes=0, totalTime=0;
  while(idx<sizesMB.length && totalTime<6){
    const bytes = sizesMB[idx]*1024*1024;
    const blob = randomBlob(bytes);
    const {totalBytes:tb, seconds} = await runParallelTransfer({
      count:3, maxDurationMs: 2600,
      makeRequest:(i,cb)=>makeUploadXhr(blob,cb),
      onSample:(mbps)=>{ onSample && onSample(mbps); }
    });
    totalBytes += tb; totalTime += seconds; idx++;
  }
  const mbps = totalTime>0 ? (totalBytes*8)/1e6/totalTime : 0;
  return {mbps: round1(mbps)};
}

/* ======================================================================
   GAUGE (non-linear scale, 270° arc)
====================================================================== */
const GAUGE_BREAKPOINTS=[0,1,5,10,25,50,100,250,500,1000];
function polar(cx,cy,r,angleDeg){
  const a=(angleDeg-90)*Math.PI/180;
  return {x:cx+r*Math.cos(a), y:cy+r*Math.sin(a)};
}
function arcPath(cx,cy,r,startDeg,endDeg){
  const s=polar(cx,cy,r,startDeg), e=polar(cx,cy,r,endDeg);
  const large = (endDeg-startDeg)<=180 ? 0 : 1;
  return `M ${s.x} ${s.y} A ${r} ${r} 0 ${large} 1 ${e.x} ${e.y}`;
}
const GAUGE_START=-135, GAUGE_END=135;
function valueToAngle(v){
  v=clamp(v,0,GAUGE_BREAKPOINTS[GAUGE_BREAKPOINTS.length-1]);
  const segCount=GAUGE_BREAKPOINTS.length-1;
  for(let i=0;i<segCount;i++){
    if(v<=GAUGE_BREAKPOINTS[i+1]){
      const segFrac=(v-GAUGE_BREAKPOINTS[i])/(GAUGE_BREAKPOINTS[i+1]-GAUGE_BREAKPOINTS[i]||1);
      const overallFrac=(i+segFrac)/segCount;
      return GAUGE_START + overallFrac*(GAUGE_END-GAUGE_START);
    }
  }
  return GAUGE_END;
}
function initGauge(){
  $('gaugeTrack').setAttribute('d', arcPath(160,120,84,GAUGE_START,GAUGE_END));
  $('gaugeTrack').style.stroke='var(--track)';
  $('gaugeFill').style.stroke='url(#gaugeGrad)';
}
// inject gradient def
(function addGaugeGrad(){
  const svg=$('gaugeSvg');
  const defs=document.createElementNS('http://www.w3.org/2000/svg','defs');
  defs.innerHTML=`<linearGradient id="gaugeGrad" x1="0%" y1="0%" x2="100%" y2="0%">
    <stop offset="0%" stop-color="#8b7bff"/><stop offset="100%" stop-color="#5b8dff"/>
  </linearGradient>`;
  svg.insertBefore(defs, svg.firstChild);
})();
initGauge();
function setGauge(value){
  const angle=valueToAngle(value);
  $('gaugeFill').setAttribute('d', arcPath(160,120,84,GAUGE_START,angle));
  const needle=$('gaugeNeedle');
  const tip=polar(160,120,58,angle);
  needle.setAttribute('x2', tip.x); needle.setAttribute('y2', tip.y);
  needle.style.stroke='var(--text)';
  $('gaugeSvg').querySelector('circle').setAttribute('fill','var(--text)');
  $('gaugeValue').textContent = value>=100 ? Math.round(value) : round1(value).toFixed(1);
}
setGauge(0);

/* Live sparkline graph */
let graphSamples=[];
function drawLiveGraph(){
  const canvas=$('liveGraph');
  const ctx=canvas.getContext('2d');
  const dpr=window.devicePixelRatio||1;
  const rect=canvas.getBoundingClientRect();
  canvas.width=rect.width*dpr; canvas.height=rect.height*dpr;
  ctx.scale(dpr,dpr);
  ctx.clearRect(0,0,rect.width,rect.height);
  if(graphSamples.length<2) return;
  const max=Math.max(...graphSamples, 5)*1.15;
  const w=rect.width, h=rect.height, pad=6;
  const stepX = (w-pad*2)/(Math.max(graphSamples.length-1,1));
  ctx.beginPath();
  graphSamples.forEach((v,i)=>{
    const x=pad+i*stepX;
    const y=h-pad-((v/max)*(h-pad*2));
    if(i===0) ctx.moveTo(x,y); else ctx.lineTo(x,y);
  });
  const styles=getComputedStyle(document.documentElement);
  ctx.strokeStyle=styles.getPropertyValue('--accent-2').trim();
  ctx.lineWidth=2.2; ctx.lineJoin='round'; ctx.stroke();
  ctx.lineTo(pad+(graphSamples.length-1)*stepX, h-pad); ctx.lineTo(pad,h-pad); ctx.closePath();
  const grad=ctx.createLinearGradient(0,0,0,h);
  grad.addColorStop(0, styles.getPropertyValue('--accent-glow').trim());
  grad.addColorStop(1, 'transparent');
  ctx.fillStyle=grad; ctx.fill();
}

/* ======================================================================
   TEST FLOW ORCHESTRATION
====================================================================== */
const PHASES=[
  {key:'connect', label:'Checking Connection'},
  {key:'latency', label:'Testing Latency'},
  {key:'download', label:'Testing Download'},
  {key:'upload', label:'Testing Upload'},
  {key:'analyze', label:'Analyzing Network'},
  {key:'score', label:'Generating Health Score'},
];
function renderPhaseList(activeIdx, doneUpTo){
  const list=$('phaseList'); list.innerHTML='';
  PHASES.forEach((p,i)=>{
    const item=document.createElement('div');
    const isDone = i<doneUpTo, isCurrent = i===activeIdx;
    item.className='phase-item'+(isDone?' done':'')+(isCurrent?' current':'');
    item.innerHTML=`<span class="dot"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><path d="M20 6 9 17l-5-5"/></svg></span><span>${p.label}</span>`;
    list.appendChild(item);
    if(i<PHASES.length-1){ const c=document.createElement('div'); c.className='phase-connector'; list.appendChild(c); }
  });
}
function setProgress(pct){ $('progressFill').style.width=clamp(pct,0,100)+'%'; }
function setPhaseLabel(text){ $('gaugePhase').textContent=text; }
function setDirection(dir){
  $('dirDown').classList.toggle('on', dir==='down');
  $('dirUp').classList.toggle('on', dir==='up');
}

function showPanel(name){
  ['dashboard','testPanel','errorPanel','resultsPanel'].forEach(id=>{
    const el=$(id);
    if(id==='dashboard'){ el.style.display = name==='dashboard' ? '' : 'none'; return; }
    el.classList.toggle('active', name===id.replace('Panel',''));
  });
}

let graphInterval=null;
async function runFullTest(){
  const startBtn=$('startBtn');
  startBtn.disabled=true;
  showPanel('testPanel');
  graphSamples=[];
  renderPhaseList(0,0);
  setProgress(2); setGauge(0); setDirection(null); setPhaseLabel('Checking Connection');

  try{
    // Phase 0: connectivity
    await measureConnectivity();
    renderPhaseList(1,1); setProgress(8);

    // Phase 1: latency
    setPhaseLabel('Testing Latency'); setDirection(null);
    const latencyResult = await measureLatency((t,i,n)=>{
      setProgress(8 + (i/n)*15);
      if(t!=null){ setGauge(t); $('gaugeValue').textContent=Math.round(t); }
    });
    renderPhaseList(2,2); setProgress(24);

    // Phase 2: download
    setPhaseLabel('Testing Download'); setDirection('down'); setGauge(0);
    const downloadResult = await measureDownload((mbps)=>{
      graphSamples.push(mbps); if(graphSamples.length>60) graphSamples.shift();
      drawLiveGraph(); setGauge(mbps);
      setProgress(24 + Math.min(graphSamples.length*1.6, 34));
    });
    renderPhaseList(3,3); setProgress(60);

    // Phase 3: upload
    setPhaseLabel('Testing Upload'); setDirection('up'); setGauge(0); graphSamples=[];
    const uploadResult = await measureUpload((mbps)=>{
      graphSamples.push(mbps); if(graphSamples.length>60) graphSamples.shift();
      drawLiveGraph(); setGauge(mbps);
      setProgress(60 + Math.min(graphSamples.length*1.8, 26));
    });
    renderPhaseList(4,4); setProgress(88);

    // Phase 4: analyze
    setPhaseLabel('Analyzing Network'); setDirection(null);
    await new Promise(r=>setTimeout(r, 500));
    renderPhaseList(5,5); setProgress(95);

    // Phase 5: score
    setPhaseLabel('Generating Health Score');
    const partial = {
      download: downloadResult.mbps, upload: uploadResult.mbps,
      ping: latencyResult.ping, jitter: latencyResult.jitter,
      packetLoss: latencyResult.packetLoss, stability: downloadResult.stability
    };
    const health = computeHealth(partial);
    await new Promise(r=>setTimeout(r, 450));
    renderPhaseList(6,6); setProgress(100);

    const result = {
      ts: Date.now(), download: partial.download, upload: partial.upload,
      ping: partial.ping, jitter: partial.jitter, packetLoss: partial.packetLoss,
      stability: partial.stability, health: health.overall,
      sub: {dS:health.dS,uS:health.uS,pS:health.pS,jS:health.jS,lS:health.lS,sS:health.sS}
    };

    addToHistory(result);
    renderMetricGrid(result);
    setHeroScore(result.health);
    refreshLastRunLabel();
    await new Promise(r=>setTimeout(r, 300));
    displayResults(result);

  }catch(err){
    console.error('Speed test failed:', err);
    showError(err);
  }finally{
    startBtn.disabled=false;
  }
}

function showError(err){
  let msg="We couldn't complete the speed test. Please check your connection and try again.";
  if(err && err.message==='offline') msg="It looks like you're offline. Reconnect to the internet and try again.";
  showPanel('error');
}
$('retryBtn').addEventListener('click', ()=>{ showPanel('dashboard'); });

$('startBtn').addEventListener('click', runFullTest);
$('testAgainBtn').addEventListener('click', ()=>{ showPanel('dashboard'); setTimeout(runFullTest, 50); });

/* ======================================================================
   RESULTS DISPLAY
====================================================================== */
const ANALYSIS_DEFS=[
  {key:'speed', label:'Speed', scoreKey:'dS'},
  {key:'latency', label:'Latency', scoreKey:'pS'},
  {key:'stability', label:'Stability', scoreKey:'sS'},
  {key:'loss', label:'Packet Loss', scoreKey:'lS'},
];
const USE_CASES=[
  {name:'4K Streaming', test:r=>r.download>=25 && r.ping<120},
  {name:'Video Conferencing', test:r=>r.upload>=3 && r.ping<150 && r.packetLoss<3},
  {name:'Online Gaming', test:r=>r.ping<60 && r.jitter<20 && r.packetLoss<1},
  {name:'Cloud Applications', test:r=>r.upload>=5 && r.download>=10},
  {name:'Large File Downloads', test:r=>r.download>=20},
];

function buildTips(r){
  const tips=[];
  if(r.ping>=60) tips.push("Your latency is higher than normal. Try moving closer to your Wi-Fi router, switching to a 5 GHz network, or connecting via ethernet.");
  if(r.jitter>=15) tips.push("Your jitter is elevated, which can cause choppy calls or lag spikes. Wired connections and reducing other devices on the network usually help.");
  if(r.packetLoss>=1) tips.push("Some packet loss was detected. This is often caused by Wi-Fi interference, an overloaded router, or an ISP issue — try restarting your router.");
  if(r.download<25) tips.push("Your download speed may limit HD/4K streaming and large downloads. Consider upgrading your plan or checking for other devices using the network.");
  if(r.upload<5) tips.push("Your upload speed is limited, which can affect video calls and cloud backups. Close upload-heavy background apps and retest.");
  if(r.stability<70) tips.push("Your connection speed fluctuated noticeably during the test. This can point to Wi-Fi congestion or an unstable ISP link.");
  return tips;
}

function displayResults(r){
  showPanel('results');
  $('resultsTimestamp').textContent = `Tested at ${fmtTime(r.ts)} on ${fmtDate(r.ts)}`;

  const grid=$('analysisGrid'); grid.innerHTML='';
  ANALYSIS_DEFS.forEach(def=>{
    const sc=r.sub[def.scoreKey];
    const rate=ratingFromScore(sc);
    const color = rate.cls==='good'? 'var(--good)' : rate.cls==='warn' ? 'var(--warn)' : 'var(--bad)';
    const div=document.createElement('div');
    div.className='analysis-item';
    div.innerHTML=`<div class="k">${def.label}</div><div class="v" style="color:${color}">${rate.label}</div>`;
    grid.appendChild(div);
  });

  const uGrid=$('usecaseGrid'); uGrid.innerHTML='';
  USE_CASES.forEach(uc=>{
    const ok=uc.test(r);
    const div=document.createElement('div');
    div.className='usecase '+(ok?'yes':'no');
    div.innerHTML=`<span class="mark">${ok? '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><path d="M20 6 9 17l-5-5"/></svg>' : '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><path d="M18 6 6 18M6 6l12 12"/></svg>'}</span><span>${uc.name}</span>`;
    uGrid.appendChild(div);
  });

  const tips=buildTips(r);
  const tipsBox=$('tipsBox');
  if(tips.length){
    tipsBox.style.display='block';
    $('tipsList').innerHTML = tips.map(t=>`<p>${t}</p>`).join('');
  } else {
    tipsBox.style.display='none';
  }

  window._lastResult = r;
}

/* copy / share / download-card / */
function resultText(r){
  return `INTERNET HEALTH\n${r.health} / 100\n\nDownload — ${r.download} Mbps\nUpload — ${r.upload} Mbps\nPing — ${r.ping} ms\nJitter — ${r.jitter} ms\nPacket Loss — ${r.packetLoss}%\n\nTested with Pulse`;
}
$('copyBtn').addEventListener('click', async ()=>{
  const r=window._lastResult; if(!r) return;
  try{ await navigator.clipboard.writeText(resultText(r)); flashChip('copyBtn','Copied!'); }
  catch(e){ flashChip('copyBtn','Copy failed'); }
});
$('shareBtn').addEventListener('click', async ()=>{
  const r=window._lastResult; if(!r) return;
  const text=resultText(r);
  if(navigator.share){ try{ await navigator.share({title:'My Internet Health', text}); }catch(e){} }
  else { try{ await navigator.clipboard.writeText(text); flashChip('shareBtn','Copied to share'); }catch(e){} }
});
function flashChip(id,text){
  const btn=$(id); const original=btn.innerHTML;
  const svg=btn.querySelector('svg')?.outerHTML||'';
  btn.innerHTML = svg+text;
  setTimeout(()=>{ btn.innerHTML=original; }, 1600);
}
$('downloadCardBtn').addEventListener('click', ()=>{
  const r=window._lastResult; if(!r) return;
  const canvas=document.createElement('canvas');
  canvas.width=900; canvas.height=560;
  const ctx=canvas.getContext('2d');
  const dark = document.documentElement.getAttribute('data-theme')==='dark';
  const bg = dark? '#0a0b12':'#f3f4fa', card= dark? '#12131e':'#ffffff', text= dark? '#f1f2f8':'#12131c', dim= dark?'#9298b0':'#565b73';
  ctx.fillStyle=bg; ctx.fillRect(0,0,900,560);
  const grad=ctx.createLinearGradient(0,0,900,0); grad.addColorStop(0,'#8b7bff'); grad.addColorStop(1,'#5b8dff');
  ctx.fillStyle=grad; ctx.fillRect(0,0,900,10);
  ctx.fillStyle=dim; ctx.font='600 20px Arial'; ctx.fillText('INTERNET HEALTH', 60, 90);
  ctx.fillStyle=grad; ctx.font='800 120px Arial'; ctx.fillText(r.health, 60, 220);
  ctx.fillStyle=dim; ctx.font='600 28px Arial'; ctx.fillText('/ 100', 60+ctx.measureText(String(r.health)).width+16, 220);
  ctx.fillStyle=text; ctx.font='700 30px Arial'; ctx.fillText(ratingFromScore(r.health).label+' Connection', 60, 270);
  const metrics=[['Download', r.download+' Mbps'],['Upload', r.upload+' Mbps'],['Ping', r.ping+' ms'],['Jitter', r.jitter+' ms']];
  metrics.forEach((m,i)=>{
    const x=60+ (i%2)*420, y=340+Math.floor(i/2)*100;
    ctx.fillStyle=card; ctx.fillRect(x,y-40,380,80);
    ctx.fillStyle=dim; ctx.font='600 16px Arial'; ctx.fillText(m[0].toUpperCase(), x+20, y-10);
    ctx.fillStyle=text; ctx.font='700 30px Arial'; ctx.fillText(m[1], x+20, y+25);
  });
  ctx.fillStyle=dim; ctx.font='500 16px Arial'; ctx.fillText('Tested with Pulse · '+new Date(r.ts).toLocaleString(), 60, 540);
  const a=document.createElement('a');
  a.download='pulse-speed-result.png';
  a.href=canvas.toDataURL('image/png');
  a.click();
});

/* ======================================================================
   HISTORY VIEW
====================================================================== */
let charts={};
function destroyCharts(){ Object.values(charts).forEach(c=>c && c.destroy()); charts={}; }
function chartTheme(){
  const styles=getComputedStyle(document.documentElement);
  return {
    grid: styles.getPropertyValue('--border').trim(),
    text: styles.getPropertyValue('--text-dim').trim(),
    accent: styles.getPropertyValue('--accent').trim(),
    accent2: styles.getPropertyValue('--accent-2').trim(),
  };
}
function makeLineChart(ctxId, labels, data, color){
  const t=chartTheme();
  const ctx=document.getElementById(ctxId).getContext('2d');
  return new Chart(ctx, {
    type:'line',
    data:{ labels, datasets:[{ data, borderColor:color, backgroundColor:color+'22', fill:true, tension:0.35, pointRadius:0, borderWidth:2.5 }]},
    options:{
      responsive:true, maintainAspectRatio:true,
      plugins:{legend:{display:false}, tooltip:{mode:'index', intersect:false}},
      scales:{
        x:{grid:{color:t.grid, display:false}, ticks:{color:t.text, maxRotation:0, autoSkip:true, maxTicksLimit:6}},
        y:{grid:{color:t.grid}, ticks:{color:t.text}, beginAtZero:true}
      }
    }
  });
}
function refreshCharts(){
  if(!views.history.classList.contains('active')) return;
  renderHistory();
}
function renderHistory(){
  const h=loadHistory();
  if(!h.length){ $('historyEmpty').style.display=''; $('historyContent').style.display='none'; return; }
  $('historyEmpty').style.display='none'; $('historyContent').style.display='block';

  const downloads=h.map(x=>x.download), uploads=h.map(x=>x.upload), pings=h.map(x=>x.ping), healths=h.map(x=>x.health);
  const stats=[
    {k:'Average Download', v: round1(mean(downloads))+' Mbps'},
    {k:'Best Download', v: round1(Math.max(...downloads))+' Mbps'},
    {k:'Average Ping', v: round1(mean(pings))+' ms'},
    {k:'Average Health Score', v: Math.round(mean(healths))+' / 100'},
  ];
  $('statStrip').innerHTML = stats.map(s=>`<div class="stat-box"><div class="k">${s.k}</div><div class="v">${s.v}</div></div>`).join('');

  const labels=h.map(x=>fmtTime(x.ts));
  const t=chartTheme();
  destroyCharts();
  charts.down=makeLineChart('chartDown', labels, downloads, t.accent);
  charts.up=makeLineChart('chartUp', labels, uploads, t.accent2);
  charts.ping=makeLineChart('chartPing', labels, pings, '#f5b545');
  charts.health=makeLineChart('chartHealth', labels, healths, '#3ddc97');

  const body=$('historyBody');
  body.innerHTML = [...h].reverse().map(r=>{
    const rate=ratingFromScore(r.health);
    const color = rate.cls==='good'?'var(--good)':rate.cls==='warn'?'var(--warn)':'var(--bad)';
    const bg = rate.cls==='good'?'var(--good-dim)':rate.cls==='warn'?'var(--warn-dim)':'var(--bad-dim)';
    return `<tr>
      <td>${fmtTime(r.ts)}</td>
      <td class="hnum">${r.download} Mbps</td>
      <td class="hnum">${r.upload} Mbps</td>
      <td class="hnum">${r.ping} ms</td>
      <td class="hnum">${r.jitter} ms</td>
      <td class="hnum">${r.packetLoss}%</td>
      <td><span class="health-pill" style="color:${color}; background:${bg};">${r.health}</span></td>
    </tr>`;
  }).join('');
}
$('clearHistoryBtn').addEventListener('click', ()=>{
  if(confirm('Clear all saved test history from this device? This cannot be undone.')){
    localStorage.removeItem(HISTORY_KEY);
    renderHistory();
    renderMetricGrid(null);
    setHeroScore(0); $('heroScore').textContent='—'; $('heroLabel').textContent='Run your first test';
    $('heroDesc').textContent="Get a full picture of your connection's speed, latency and stability in under 30 seconds — no sign-up needed.";
    $('heroBadge').style.display='none';
    refreshLastRunLabel();
  }
});

/* ======================================================================
   NETWORK INFO VIEW
====================================================================== */
function labelSrc(el, type){
  const tag=document.createElement('span');
  tag.className='src-tag '+type;
  tag.textContent = type==='measured' ? 'Detected' : 'External API';
  el.appendChild(document.createTextNode(''));
  return tag;
}
function setNet(id, value, srcType){
  const el=$(id);
  el.innerHTML='';
  el.append(document.createTextNode(value));
  if(srcType) el.appendChild(labelSrc(el, srcType));
}
function parseUA(){
  const ua=navigator.userAgent;
  let browser='Unknown browser';
  if(/Edg\//.test(ua)) browser='Microsoft Edge';
  else if(/Chrome\//.test(ua) && !/Chromium/.test(ua)) browser='Google Chrome';
  else if(/Firefox\//.test(ua)) browser='Mozilla Firefox';
  else if(/Safari\//.test(ua) && !/Chrome/.test(ua)) browser='Safari';
  else if(/OPR\//.test(ua)) browser='Opera';
  let os='Unknown OS';
  if(/Windows NT/.test(ua)) os='Windows';
  else if(/Mac OS X/.test(ua)) os='macOS';
  else if(/Android/.test(ua)) os='Android';
  else if(/iPhone|iPad|iPod/.test(ua)) os='iOS';
  else if(/Linux/.test(ua)) os='Linux';
  return {browser, os};
}
async function loadNetworkInfo(){
  const {browser, os}=parseUA();
  setNet('netBrowser', browser, 'measured');
  setNet('netOS', os, 'measured');
  setNet('netOnline', navigator.onLine ? 'Online' : 'Offline', 'measured');

  const conn = navigator.connection || navigator.mozConnection || navigator.webkitConnection;
  if(conn){
    setNet('netConnType', conn.effectiveType ? conn.effectiveType.toUpperCase() : 'Unknown', 'measured');
    setNet('netDownlink', conn.downlink ? conn.downlink+' Mbps (browser estimate)' : 'Not available', 'measured');
  } else {
    setNet('netConnType', 'Not exposed by this browser', 'measured');
    setNet('netDownlink', 'Not available', 'measured');
  }

  setNet('netIPv4','Looking up…'); setNet('netIPv6','Looking up…');
  setNet('netISP','Looking up…'); setNet('netLoc','Looking up…'); setNet('netServer','Looking up…');

  try{
    const res = await withTimeout(fetch(EP.trace+'?cb='+Math.random(), {cache:'no-store'}), 6000);
    const text = await res.text();
    const data={}; text.trim().split('\n').forEach(line=>{ const [k,v]=line.split('='); data[k]=v; });
    setNet('netServer', 'Cloudflare edge · ' + (data.colo||'unknown') , 'measured');
    if(data.loc) setNet('netLoc', data.loc, 'measured');
  }catch(e){ setNet('netServer','Unavailable', 'measured'); }

  try{
    const res = await withTimeout(fetch(EP.ipv4, {cache:'no-store'}), 6000);
    const j = await res.json();
    setNet('netIPv4', j.ip || 'Not available', 'external');
  }catch(e){ setNet('netIPv4','Not available', 'external'); }

  try{
    const res = await withTimeout(fetch(EP.ipv6, {cache:'no-store'}), 6000);
    const j = await res.json();
    const isV6 = j.ip && j.ip.includes(':');
    setNet('netIPv6', isV6 ? j.ip : 'Not available on this network', 'external');
  }catch(e){ setNet('netIPv6','Not available', 'external'); }

  try{
    const res = await withTimeout(fetch(EP.geo, {cache:'no-store'}), 6000);
    const j = await res.json();
    setNet('netISP', j.org || j.asn || 'Not available', 'external');
    if(j.city || j.country_name) setNet('netLoc', [j.city, j.region, j.country_name].filter(Boolean).join(', '), 'external');
  }catch(e){ setNet('netISP','Not available (lookup blocked or rate-limited)', 'external'); }
}
$('refreshNetBtn').addEventListener('click', loadNetworkInfo);

/* Update charts on theme change if visible */
window.addEventListener('online', ()=>{});
window.addEventListener('offline', ()=>{});


})();
