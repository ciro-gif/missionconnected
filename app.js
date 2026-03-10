/* =======================================================
   MISSION: CONNECTED v6 — APP.JS
   Screener · Roadmap · Chat · Dashboard · Tracker
   Records · Regulations · Utilities
======================================================= */

// ── CONFIG ──
const API_KEY = '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';

// ── STATE ──
let ans = {
  goal:'', branch:[], component:'', startYear:'', endYear:'', discharge:'',
  mos:'', deployments:[], exposures:[], vaStatus:'',
  ratedConditions:[], symptoms:[], diagnoses:[], events:[],
  evidence:[], impact:[], followupQs:[], followupAs:{},
  otherRated:'', otherDiag:''
};

let claims = JSON.parse(localStorage.getItem('mc6_claims') || '[]');

function saveClaims() {
  localStorage.setItem('mc6_claims', JSON.stringify(claims));
}

(function migrateLegacy() {
  const old = localStorage.getItem('mc6_conds') || localStorage.getItem('mc6_dash');
  if (old && !claims.length) {
    try {
      const parsed = JSON.parse(old);
      if (Array.isArray(parsed) && parsed.length) {
        claims = parsed.map(c => ({
          id: c.id || Date.now() + Math.random(),
          name: c.name || '',
          rating: c.rating || 0,
          status: c.status || c.col || 'todo',
          type: c.type || inferCondType(c.name || ''),
          col: c.col || statusToCol(c.status),
          checks: c.checks || buildChecksFor(c.name || ''),
          expanded: false,
          code: c.code || '',
          secondary: c.secondary || '',
          notes: c.notes || ''
        }));
        saveClaims();
      }
    } catch(e) {}
  }
})();

function statusToCol(status) {
  if (status === 'connected') return 'won';
  if (status === 'pending') return 'filed';
  if (status === 'denied') return 'todo';
  return 'todo';
}

let chatHistory = [];
let screenHistory = [];
let currentScreen = 1;
const TOTAL_SCREENS = 15;
let dlDocs = [], medDocs = [];
let roadmapText = '';
let currentReg = null;

// =======================================================
// VIEW MANAGEMENT
// =======================================================
function showView(id) {
  document.querySelectorAll('.view').forEach(v => v.classList.remove('active'));
  document.getElementById(id).classList.add('active');
  window.scrollTo(0, 0);
}

function startScreener() {
  ans = {goal:'',branch:[],component:'',startYear:'',endYear:'',discharge:'',mos:'',deployments:[],exposures:[],vaStatus:'',ratedConditions:[],symptoms:[],diagnoses:[],events:[],evidence:[],impact:[],followupQs:[],followupAs:{},otherRated:'',otherDiag:''};
  screenHistory = []; currentScreen = 1;
  showView('vScreener');
  buildSymptomGrids();
  populateYearSelects();
  renderScreen(1);
}

// FIX: retakeScreener and resetApiKey are now separate top-level functions
function retakeScreener() {
  if (confirm('Update your screening? Your roadmap will be rebuilt.')) startScreener();
}

function resetApiKey() {
  localStorage.removeItem('mc6_apikey');
  location.reload();
}

// =======================================================
// SCREENER — SCREEN STACK NAVIGATION
// =======================================================
function getNextScreen(from) {
  let next = from + 1;
  if (next === 9 && ['never_filed','healthcare','understand'].includes(ans.vaStatus)) next = 10;
  return next;
}

function nextScreen() {
  if (currentScreen === 9)  ans.otherRated = document.getElementById('otherRatedInput')?.value || '';
  if (currentScreen === 11) ans.otherDiag  = document.getElementById('otherDiagInput')?.value  || '';
  if (currentScreen >= TOTAL_SCREENS) { launchLoading(); return; }
  screenHistory.push(currentScreen);
  currentScreen = getNextScreen(currentScreen);
  renderScreen(currentScreen);
  if (currentScreen === TOTAL_SCREENS) generateFollowupQuestions();
}

function skipScreen() {
  screenHistory.push(currentScreen);
  currentScreen = getNextScreen(currentScreen);
  renderScreen(currentScreen);
  if (currentScreen === TOTAL_SCREENS) generateFollowupQuestions();
}

function prevScreen() {
  if (!screenHistory.length) return;
  currentScreen = screenHistory.pop();
  renderScreen(currentScreen);
}

function renderScreen(n) {
  document.querySelectorAll('.s-screen').forEach(s => s.classList.remove('active'));
  document.getElementById('ss' + n)?.classList.add('active');
  const pct = ((n - 1) / (TOTAL_SCREENS - 1)) * 100;
  document.getElementById('sProgFill').style.width = pct + '%';
  document.getElementById('sStepText').textContent = `Step ${n} of ${TOTAL_SCREENS}`;
  document.getElementById('btnBack').disabled = screenHistory.length === 0;
  document.getElementById('btnNext').textContent = n >= TOTAL_SCREENS ? 'Build My Roadmap →' : 'Continue →';
  document.getElementById('btnSkip').style.display = [1, 2].includes(n) ? 'none' : 'inline';
  if (n === 3) toggleReserveNotice();
  if (n === 5) populateMOSList();
}

function toggleReserveNotice() {
  const notice = document.getElementById('reserveNotice');
  if (!notice) return;
  notice.style.display = ['Reserve','National Guard'].includes(ans.component) ? 'block' : 'none';
}

// =======================================================
// SELECTION HELPERS
// =======================================================
function pick(el, field) {
  el.closest('.choice-grid').querySelectorAll('.choice-card').forEach(c => c.classList.remove('selected'));
  el.classList.add('selected');
  ans[field] = el.dataset.val;
}

function pickMulti(el, field) {
  if (!Array.isArray(ans[field])) ans[field] = [];
  el.classList.toggle('selected');
  const val = el.dataset.val;
  if (el.classList.contains('selected')) { if (!ans[field].includes(val)) ans[field].push(val); }
  else { ans[field] = ans[field].filter(v => v !== val); }
}

function pickTile(el, field) {
  if (!Array.isArray(ans[field])) ans[field] = [];
  el.classList.toggle('selected');
  const val = el.dataset.val;
  if (el.classList.contains('selected')) { if (!ans[field].includes(val)) ans[field].push(val); }
  else { ans[field] = ans[field].filter(v => v !== val); }
}

function updateBranchDisplay() {}

// =======================================================
// MOS
// =======================================================
function populateMOSList() {
  const branches = ans.branch.length ? ans.branch : ['Army'];
  let allMOS = [];
  branches.forEach(b => { (MOS_BY_BRANCH[b] || []).forEach(m => allMOS.push({...m, branch: b})); });
  allMOS.sort((a, b) => a.code.localeCompare(b.code));
  renderMOSList(allMOS);
}

function renderMOSList(list) {
  const c = document.getElementById('mosBranchList');
  c.innerHTML = '';
  list.forEach(m => {
    const div = document.createElement('div');
    div.className = 'mos-item' + (ans.mos === m.code ? ' selected' : '');
    div.dataset.code = m.code;
    const multiBranch = ans.branch.length > 1;
    div.innerHTML = `
      <div class="mos-code">${m.code}</div>
      <div class="mos-label">${m.label}${multiBranch ? ` <span style="font-size:10px;color:var(--text-hint);">(${m.branch})</span>` : ''}</div>
      <div class="mos-tags">
        ${m.tera ? '<span class="mos-tag tag-amber">TERA</span>' : ''}
        ${['High','Very High'].includes(m.noise) ? '<span class="mos-tag tag-red">High Noise</span>' : ''}
      </div>
      <div class="mos-check">✓</div>`;
    div.onclick = () => selectMOS(m);
    c.appendChild(div);
  });
}

function filterMOSList(q) {
  q = q.toLowerCase();
  const branches = ans.branch.length ? ans.branch : ['Army'];
  let all = [];
  branches.forEach(b => { (MOS_BY_BRANCH[b] || []).forEach(m => all.push({...m, branch: b})); });
  all.sort((a, b) => a.code.localeCompare(b.code));
  renderMOSList(q ? all.filter(m => m.code.toLowerCase().includes(q) || m.label.toLowerCase().includes(q)) : all);
}

function selectMOS(m) {
  ans.mos = m.code;
  document.querySelectorAll('.mos-item').forEach(el => el.classList.toggle('selected', el.dataset.code === m.code));
  const box = document.getElementById('mosIntel');
  box.innerHTML = `
    <div class="mos-intel-title">🎯 MOS Intelligence: ${m.code} — ${m.label}</div>
    <div style="margin-bottom:8px;">
      ${m.tera ? '<span class="intel-tag intel-amber">⚠️ TERA RECOGNIZED</span>' : ''}
      <span class="intel-tag intel-blue">🔊 Noise: ${m.noise}</span>
    </div>
    <div class="mos-intel-body">${m.notes}</div>`;
  box.classList.add('show');
}

// =======================================================
// SYMPTOM GRIDS
// =======================================================
function buildSymptomGrids() {
  const sg = document.getElementById('symptomGrid');
  if (sg) sg.innerHTML = SYMPTOMS.map(s => `
    <div class="sym-tile" data-val="${s.label}" onclick="pickTile(this,'symptoms')">
      <div class="sym-icon">${s.icon}</div>
      <div class="sym-lbl">${s.label}</div>
      ${s.note ? `<div class="sym-note">${s.note}</div>` : ''}
    </div>`).join('');
  const dg = document.getElementById('diagnosisGrid');
  if (dg) dg.innerHTML = DIAGNOSES.map(d => `
    <div class="sym-tile" data-val="${d.label}" onclick="pickTile(this,'diagnoses')">
      <div class="sym-icon">${d.icon}</div><div class="sym-lbl">${d.label}</div>
    </div>`).join('');
  const rg = document.getElementById('ratedCondGrid');
  if (rg) rg.innerHTML = RATED_CONDS.map(r => `
    <div class="sym-tile" data-val="${r.label}" onclick="pickTile(this,'ratedConditions')">
      <div class="sym-icon">${r.icon}</div><div class="sym-lbl">${r.label}</div>
    </div>`).join('');
}

function populateYearSelects() {
  const sy = document.getElementById('profStartYear');
  const ey = document.getElementById('profEndYear');
  if (!sy || !ey) return;
  for (let y = 2025; y >= 1960; y--) {
    sy.innerHTML += `<option value="${y}">${y}</option>`;
    ey.innerHTML += `<option value="${y}">${y}</option>`;
  }
}

// =======================================================
// AI FOLLOW-UP QUESTIONS
// =======================================================
async function generateFollowupQuestions() {
  const c = document.getElementById('followupContainer');
  try {
    const prompt = `A veteran completed a VA disability screener. Generate EXACTLY 3 targeted follow-up questions to fill critical gaps.

VETERAN DATA:\n${buildAnswerContext()}

Rules:
- 3-5 short clickable options per question
- Focus on most important missing information for THEIR situation
- Return ONLY valid JSON, no markdown:
{"questions":[{"id":"q1","text":"Question?","options":["A","B","C"]},{"id":"q2","text":"Question?","options":["A","B"]},{"id":"q3","text":"Question?","options":["A","B","C"]}]}`;

    const resp = await callClaude([{role:'user',content:prompt}], 'Return ONLY valid JSON. No markdown. No extra text.', 600);
    let parsed;
    try { parsed = JSON.parse(resp.replace(/```json|```/g, '').trim()); }
    catch(e) {
      parsed = {questions:[
        {id:'q1',text:'Do you have a doctor you currently see for any of your symptoms?',options:['Yes — VA doctor','Yes — private doctor','No treatment yet','Have records already']},
        {id:'q2',text:'Do you have your DD-214?',options:['Yes, I have it','No, need to request it','Not sure where it is']},
        {id:'q3',text:'How soon are you looking to file?',options:['As soon as possible','After gathering evidence','Just exploring']}
      ]};
    }
    ans.followupQs = parsed.questions;
    c.innerHTML = parsed.questions.map(q => `
      <div style="margin-bottom:20px;">
        <div style="font-size:15px;font-weight:600;color:var(--text);margin-bottom:10px;">${q.text}</div>
        <div class="choice-grid cols-2">
          ${q.options.map(opt => `
            <div class="choice-card" data-qid="${q.id}" data-val="${opt}" onclick="pickFollowup(this,'${q.id}')">
              <div style="flex:1;font-size:14px;font-weight:500;">${opt}</div>
              <div class="choice-check">✓</div>
            </div>`).join('')}
        </div>
      </div>`).join('');
  } catch(e) {
    c.innerHTML = `<div class="alert alert-amber"><span>⚠️</span><span>Follow-up questions unavailable. Continue to build your roadmap.</span></div>`;
  }
}

function pickFollowup(el, qid) {
  el.closest('.choice-grid').querySelectorAll('.choice-card').forEach(c => c.classList.remove('selected'));
  el.classList.add('selected');
  ans.followupAs[qid] = el.dataset.val;
}

// =======================================================
// LOADING → ROADMAP
// =======================================================
function launchLoading() {
  currentScreen = 16;
  document.querySelectorAll('.s-screen').forEach(s => s.classList.remove('active'));
  document.getElementById('ss16').classList.add('active');
  document.getElementById('sNav').style.display = 'none';
  document.getElementById('sProgFill').style.width = '100%';
  document.getElementById('sStepText').textContent = 'Analyzing your case...';
  const steps = document.querySelectorAll('.loading-step');
  let i = 0;
  const iv = setInterval(() => {
    if (i > 0) steps[i-1].classList.replace('active', 'done');
    if (i < steps.length) { steps[i].classList.add('active'); i++; }
    else clearInterval(iv);
  }, 700);
  setTimeout(buildRoadmap, 4500);
}

// =======================================================
// BUILD ROADMAP
// =======================================================
async function buildRoadmap() {
  try {
    const isReserve = ['Reserve','National Guard'].includes(ans.component);
    const ctx = buildAnswerContext();
    const mosData = getMOSData();
    const reserveNote = isReserve
      ? `RESERVIST/GUARD: STRs are sparse by design. Lead with civilian medical records + personal statements. LOD determinations required for drill injuries. Activation/deployment periods = same rules as active duty.`
      : '';

    const p1 = `VA disability claim strategist. Build a tight, scannable roadmap.
${reserveNote}

VETERAN: ${ctx}
MOS INTEL: ${JSON.stringify(mosData)}

For each claimable condition, output EXACTLY:

**[CONDITION]** | [DIRECT/SECONDARY/PRESUMPTIVE/LAY TESTIMONY]
- 🟢 Have: [what's working for them — 1 line]
- 🔴 Need: [the one thing missing — 1 line]
- 📋 Next action: [specific next step with form number]
- ⚖️ Rating key: [10%: X] | [30%: X] | [50%+: X]

Start with ## CLAIM OVERVIEW (2 sentences: overall strength + core strategy).
Then ## CONDITIONS TO CLAIM — list every qualifying condition.
End with ## YOU MAY NOT KNOW YOU CAN CLAIM — 2-3 overlooked conditions.

Be direct. No filler. Each card should take 10 seconds to read.`;

    const p2 = `Complete this veteran's roadmap. Be their advocate.
${reserveNote}
VETERAN: ${ctx}

## YOUR NEXT 5 STEPS
Number 1-5. Specific. Form numbers. No fluff.

## ESTIMATED COMBINED RATING
One line. Show the math.

## YOUR STRONGEST LEGAL ADVANTAGE
One paragraph. The single regulation or principle that helps them most.`;

    const [resp1, resp2] = await Promise.all([
      callClaude([{role:'user',content:p1}], buildSystemPrompt(), 2800),
      callClaude([{role:'user',content:p2}], buildSystemPrompt(), 1600)
    ]);

    roadmapText = resp1 + '\n\n' + resp2;
    autoPopulateConditions();
    autoBuildDashboard();
    showView('vApp');
    updateSidebar();
    showPage('roadmap');
    renderRoadmap(roadmapText);
    initChat();

  } catch(e) {
    showView('vApp');
    updateSidebar();
    showPage('roadmap');
    document.getElementById('roadmapContent').innerHTML = `
      <div class="alert alert-amber">
        <span>⚠️</span>
        <span><strong>API error.</strong> ${e.message}</span>
      </div>
      <div class="card" style="margin-top:14px;">
        <div class="card-hdr"><div class="card-title">✅ Screening Complete</div></div>
        <div style="font-size:13px;color:var(--text-sec);line-height:1.8;">${buildAnswerContext().replace(/\n/g,'<br>')}</div>
      </div>`;
    initChat();
  }
}

function getMOSData() {
  for (const branch of Object.keys(MOS_BY_BRANCH)) {
    const found = MOS_BY_BRANCH[branch].find(m => m.code === ans.mos);
    if (found) return found;
  }
  return {code: ans.mos||'Unknown', label:'Unknown MOS', noise:'Unknown', tera:false, notes:''};
}

// =======================================================
// RENDER ROADMAP
// =======================================================
function renderRoadmap(text) {
  const isReserve = ['Reserve','National Guard'].includes(ans.component);
  const goalLabels = {
    first_time:'First-Time Disability Claim', increase:'Rating Increase Strategy',
    secondary:'Secondary Conditions Plan', appeal:'Denial Appeal Roadmap',
    healthcare:'VA Healthcare Access', understand:'Entitlement Assessment'
  };

  const hero = `
    <div class="rm-hero no-print">
      <div class="rm-hero-icon">🗺️</div>
      <div>
        <div class="rm-hero-lbl">Your Personalized Roadmap</div>
        <div class="rm-hero-title">${goalLabels[ans.goal] || 'Claim Blueprint'}</div>
        <div class="rm-hero-sub">${(ans.branch||[]).join('/')} · ${ans.mos||'MOS on file'} · ${ans.component||''} ${isReserve ? '· <span style="color:var(--gold);font-weight:600;">Reserve/Guard Rules Apply</span>' : ''}</div>
      </div>
    </div>`;

  const reserveBanner = isReserve ? `
    <div class="alert alert-amber" style="margin-bottom:14px;">
      <span>⚠️</span>
      <div><strong>Reserve / Guard Veteran — Evidence Strategy Adjusted</strong><br>
      <span style="font-size:12px;">STRs are sparse by nature — your roadmap prioritizes <strong>civilian medical records, personal statements (VA 21-4138), and buddy statements</strong> as primary evidence.</span></div>
    </div>` : '';

  // FIX: removed the erroneous backslash before the backtick
  const legend = `
    <div class="type-legend">
      <div class="legend-title">Connection Type Guide</div>
      <div class="legend-items">
        <div class="legend-item">
          <span class="legend-dot" style="background:#1565c0;"></span>
          <div><strong>Direct</strong> — condition caused directly by military service</div>
        </div>
        <div class="legend-item">
          <span class="legend-dot" style="background:#1976d2;"></span>
          <div><strong>Secondary</strong> — caused or worsened by an already service-connected condition</div>
        </div>
        <div class="legend-item">
          <span class="legend-dot" style="background:#6a1b9a;"></span>
          <div><strong>Presumptive</strong> — VA legally presumes service caused this (e.g. Agent Orange, burn pits, Gulf War)</div>
        </div>
        <div class="legend-item">
          <span class="legend-dot" style="background:#2e7d32;"></span>
          <div><strong>Lay Testimony</strong> — your own credible statement is the primary evidence required</div>
        </div>
      </div>
    </div>`;

  const formatted = parseRoadmapToCards(text);

  const actionBar = `
    <div class="rm-action-bar no-print" id="roadmapActionBar">
      <div>
        <div class="rm-action-text">Does this roadmap look right to you?</div>
        <span class="rm-action-sub">Confirm to activate your Kanban dashboard, or open the split view to discuss with the AI.</span>
      </div>
      <button class="btn btn-outline btn-red" onclick="openSplitChat()">💬 Questions / Concerns</button>
      <button class="btn btn-gold" onclick="confirmRoadmap()">✅ Activate Dashboard</button>
    </div>`;

  document.getElementById('roadmapContent').innerHTML = hero + reserveBanner + legend + formatted + actionBar;
  document.getElementById('roadmapSub').textContent = goalLabels[ans.goal] || 'Personalized Claim Blueprint';
}

const LBORDER = {
  'DIRECT':'lborder-direct',
  'SECONDARY':'lborder-secondary',
  'PRESUMPTIVE':'lborder-presumptive',
  'LAY TESTIMONY':'lborder-lay'
};
const BADGE_CLASS = {
  'DIRECT':'badge-direct',
  'SECONDARY':'badge-secondary',
  'PRESUMPTIVE':'badge-presumptive',
  'LAY TESTIMONY':'badge-lay'
};
const TYPE_LABEL = {
  'DIRECT':'Direct', 'SECONDARY':'Secondary',
  'PRESUMPTIVE':'Presumptive', 'LAY TESTIMONY':'Lay Testimony'
};

function parseRoadmapToCards(text) {
  const lines = text.replace(/\r\n/g,'\n').replace(/\r/g,'\n').split('\n').map(l => l.trimStart());

  let out = '';
  let cardIdx = 0;
  let inCard = false;
  let cardName='', cardType='', have='', need='', action='', ratingKey='';
  let pendingSectionBuf = '';

  function flushSection() {
    if (!pendingSectionBuf.trim()) return;
    out += `<div style="font-size:13px;line-height:1.75;color:var(--text-sec);padding:4px 14px 10px;">${pendingSectionBuf}</div>`;
    pendingSectionBuf = '';
  }

  function flushCard() {
    if (!cardName) return;
    flushSection();
    const lbc = LBORDER[cardType] || 'lborder-direct';
    const bc  = BADGE_CLASS[cardType] || 'badge-direct';
    const tl  = TYPE_LABEL[cardType] || cardType;
    const id  = 'cc' + cardIdx++;

    let ratingHtml = '';
    if (ratingKey) {
      const parts = ratingKey.split('|').map(p => p.trim()).filter(Boolean);
      ratingHtml = `<div class="rating-mini"><div class="rating-mini-hdr">VA Rating Criteria</div>${parts.map(p => {
        const m = p.match(/^(\d+%):?\s*(.+)$/);
        return m ? `<div class="rating-row"><div class="r-pct">${m[1]}</div><div class="r-desc">${m[2]}</div></div>` : '';
      }).join('')}</div>`;
    }

    out += `
      <div class="cond-card">
        <div class="cond-card-hdr ${lbc}" onclick="toggleCard('${id}')">
          <div style="flex:1;min-width:0;">
            <div class="cond-name">${cardName}</div>
            <div class="cond-meta"><span class="cond-pri-badge ${bc}">${tl}</span></div>
            ${have ? `<div class="cond-preview" style="font-size:12px;color:var(--text-hint);margin-top:3px;">✅ ${have.substring(0,70)}${have.length>70?'...':''}</div>` : ''}
          </div>
          <div class="cond-toggle" id="tog-${id}">▾</div>
        </div>
        <div class="cond-body open" id="${id}">
          <div class="ele-grid">
            ${have   ? `<div class="ele-row ele-row-green"><div class="ele-label g">✅ Have</div><div class="ele-val">${have}</div></div>` : ''}
            ${need   ? `<div class="ele-row ele-row-red"><div class="ele-label r">🔴 Need</div><div class="ele-val">${need}</div></div>` : ''}
            ${action ? `<div class="ele-row ele-row-blue"><div class="ele-label b">📋 Action</div><div class="ele-val">${action}</div></div>` : ''}
          </div>
          ${ratingHtml}
        </div>
      </div>`;
    cardName=''; cardType=''; have=''; need=''; action=''; ratingKey=''; inCard=false;
  }

  lines.forEach(line => {
    const condMatch = line.match(/^\*{0,2}(.+?)\*{0,2}\s*\|\s*(DIRECT|SECONDARY|PRESUMPTIVE|LAY TESTIMONY)/i);
    if (condMatch) {
      const typeRaw = condMatch[2].toUpperCase();
      if (['DIRECT','SECONDARY','PRESUMPTIVE','LAY TESTIMONY'].includes(typeRaw)) {
        flushCard();
        inCard = true;
        cardName = condMatch[1].replace(/\*/g,'').trim();
        cardType = typeRaw;
        return;
      }
    }

    if (inCard) {
      const stripped = line.replace(/^[-•*]\s*/,'');
      if (/Have:/i.test(line) && /🟢|✅|Have:/i.test(line))        { have      = line.replace(/.*(?:🟢|✅)?\s*Have:\s*/i,'').trim(); return; }
      if (/Need:/i.test(line) && /🔴|Need:/i.test(line))            { need      = line.replace(/.*(?:🔴)?\s*Need:\s*/i,'').trim(); return; }
      if (/Next action:|Action:/i.test(line))                        { action    = line.replace(/.*(?:📋)?\s*(?:Next action|Action):\s*/i,'').trim(); return; }
      if (/Rating key:|Rating criteria:/i.test(line))                { ratingKey = line.replace(/.*(?:⚖[️]?)?\s*Rating (?:key|criteria):\s*/i,'').trim(); return; }
      if (line.trim() === '') return;
      if (/^[-•]/.test(line) && action) { action += ' · ' + stripped; return; }
      if (/^[-•]/.test(line))           { action = stripped; return; }
      return;
    }

    if (/^#{1,3}\s+/.test(line)) {
      flushCard();
      flushSection();
      const title = line.replace(/^#{1,3}\s+/,'').replace(/\*\*(.+?)\*\*/g,'$1');
      out += `<div class="rm-section-hdr">${title}</div>`;
      return;
    }

    if (/^---+$/.test(line.trim())) return;

    if (!inCard) pendingSectionBuf += fmtLine(line);
  });

  flushCard();
  flushSection();

  if (!out.trim()) {
    return `<div class="card" style="padding:20px;font-size:14px;line-height:1.8;">${fmt(text)}</div>`;
  }
  return `<div id="condCards">${out}</div>`;
}

function fmtLine(line) {
  line = line.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;')
    .replace(/\*\*(.+?)\*\*/g,'<strong>$1</strong>')
    .replace(/\*(.+?)\*/g,'<em>$1</em>');
  if (line.match(/^\d+\.\s/)) return `<div style="display:flex;gap:10px;margin:7px 0;font-size:14px;"><span style="width:24px;height:24px;background:var(--blue);color:white;border-radius:50%;display:flex;align-items:center;justify-content:center;font-size:11px;font-weight:700;flex-shrink:0;margin-top:2px;">${line.match(/^(\d+)/)[1]}</span><span>${line.replace(/^\d+\.\s+/,'')}</span></div>`;
  if (line.match(/^-\s/)) return `<div style="display:flex;gap:7px;margin:3px 0;font-size:14px;"><span style="color:var(--blue-mid);flex-shrink:0;margin-top:2px;">•</span><span>${line.replace(/^-\s+/,'')}</span></div>`;
  if (line.trim() === '') return '<br>';
  return `<p style="margin:4px 0;">${line}</p>`;
}

function toggleCard(id) {
  const body = document.getElementById(id);
  const tog  = document.getElementById('tog-' + id);
  if (!body) return;
  const open = body.classList.toggle('open');
  if (tog) tog.textContent = open ? '▴' : '▾';
}

function confirmRoadmap() {
  localStorage.setItem('mc6_roadmap_confirmed', '1');
  if (!claims.length) autoPopulateConditions();
  showPage('dashboard');
  const notif = document.createElement('div');
  notif.style.cssText = 'position:fixed;top:70px;right:20px;background:var(--green);color:white;padding:10px 18px;border-radius:var(--r);font-size:13px;font-weight:600;z-index:9999;box-shadow:var(--shadow-md);';
  notif.textContent = '✅ Dashboard activated — tracking your case';
  document.body.appendChild(notif);
  setTimeout(() => notif.remove(), 3000);
}

// =======================================================
// SPLIT-SCREEN CHAT
// =======================================================
let splitChatHistory = [];
let splitChatOpen = false;

function openSplitChat() {
  if (splitChatOpen) return;
  splitChatOpen = true;
  const main = document.getElementById('page-roadmap');
  const existing = main.querySelector('#roadmapContent');

  const wrapper = document.createElement('div');
  wrapper.id = 'splitWrapper';
  wrapper.className = 'split-view';
  wrapper.innerHTML = `
    <div class="roadmap-panel" id="splitRoadmapPanel"></div>
    <div class="chat-panel">
      <div class="split-chat-wrap">
        <div class="split-chat-top">
          <div class="chat-av" style="width:30px;height:30px;font-size:11px;">A</div>
          <div>
            <div style="font-size:13px;font-weight:600;color:var(--blue);">AI Advisor</div>
            <div style="font-size:11px;color:var(--text-sec);">Ask about your roadmap</div>
          </div>
          <button class="btn-split-close" onclick="closeSplitChat()" style="margin-left:auto;">Close ✕</button>
        </div>
        <div class="split-chat-msgs" id="splitChatMsgs"></div>
        <div class="split-chat-input">
          <div class="split-chat-row">
            <textarea class="split-chat-ta" id="splitChatInput" rows="1" placeholder="Ask about your roadmap..." onkeydown="handleSplitKey(event)" oninput="autoResize(this)"></textarea>
            <button class="btn-send" onclick="sendSplitMessage()" id="splitSendBtn" style="width:34px;height:34px;font-size:15px;">↑</button>
          </div>
        </div>
      </div>
    </div>`;

  const panel = wrapper.querySelector('#splitRoadmapPanel');
  while (existing.firstChild) panel.appendChild(existing.firstChild);
  existing.innerHTML = '';
  existing.appendChild(wrapper);

  const bar = document.getElementById('roadmapActionBar');
  if (bar) bar.style.display = 'none';

  splitChatHistory = [];
  addSplitMsg('ai', `I can see your roadmap. What would you like to clarify or push back on?\n\nYou can ask about any specific condition, the evidence strategy, or whether the priorities look right for your situation.`);
}

function closeSplitChat() {
  splitChatOpen = false;
  const wrapper = document.getElementById('splitWrapper');
  if (!wrapper) return;
  const panel = wrapper.querySelector('#splitRoadmapPanel');
  const content = document.getElementById('roadmapContent');
  content.innerHTML = '';
  while (panel.firstChild) content.appendChild(panel.firstChild);
  const bar = document.getElementById('roadmapActionBar');
  if (bar) bar.style.display = '';
}

function addSplitMsg(role, text) {
  const msgs = document.getElementById('splitChatMsgs');
  if (!msgs) return;
  const div = document.createElement('div');
  div.className = 'msg ' + role;
  div.innerHTML = `<div class="msg-av ${role}" style="width:26px;height:26px;font-size:9px;">${role==='ai'?'A':'YOU'}</div><div class="msg-bub" style="font-size:13px;">${fmt(text)}</div>`;
  msgs.appendChild(div);
  msgs.scrollTop = msgs.scrollHeight;
}

async function sendSplitMessage() {
  const input = document.getElementById('splitChatInput');
  const btn   = document.getElementById('splitSendBtn');
  const text  = input.value.trim();
  if (!text || btn.disabled) return;
  input.value = ''; autoResize(input); btn.disabled = true;
  addSplitMsg('user', text);
  splitChatHistory.push({role:'user', content:text});

  const msgs = document.getElementById('splitChatMsgs');
  const td = document.createElement('div');
  td.id='splitTyping'; td.className='msg ai';
  td.innerHTML=`<div class="msg-av ai" style="width:26px;height:26px;font-size:9px;">A</div><div class="msg-bub"><div class="t-dot-wrap"><div class="t-dot"></div><div class="t-dot"></div><div class="t-dot"></div></div></div>`;
  msgs.appendChild(td); msgs.scrollTop=msgs.scrollHeight;

  try {
    const resp = await callClaude(splitChatHistory, buildSystemPrompt() + '\n\nContext: Veteran is reviewing their roadmap.');
    document.getElementById('splitTyping')?.remove();
    addSplitMsg('ai', resp);
    splitChatHistory.push({role:'assistant', content:resp});
  } catch(e) {
    document.getElementById('splitTyping')?.remove();
    addSplitMsg('ai', 'Connection issue — ' + e.message);
  }
  btn.disabled = false;
}

function handleSplitKey(e) {
  if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendSplitMessage(); }
}

function printRoadmap() { window.print(); }

function emailRoadmap() {
  const subject = encodeURIComponent('My VA Disability Claim Roadmap — Mission: Connected');
  const body = encodeURIComponent(`My VA claim roadmap from Mission: Connected:\n\nVeteran: ${(ans.branch||[]).join('/')} — ${ans.mos||''}\nGoal: ${ans.goal}\n\nGenerated at missionconnected.vet`);
  window.open(`mailto:?subject=${subject}&body=${body}`);
}

function fmt(t) {
  if (!t) return '';
  return t
    .replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;')
    .replace(/\*\*(.+?)\*\*/g,'<strong>$1</strong>')
    .replace(/\*(.+?)\*/g,'<em>$1</em>')
    .replace(/`(.+?)`/g,'<code style="background:#f5f5f5;border:1px solid #e0e0e0;padding:1px 5px;border-radius:3px;font-size:12px;font-family:monospace;">$1</code>')
    .replace(/^## (.+)$/gm,'<div style="font-size:15px;font-weight:700;color:var(--blue);margin:16px 0 6px;padding-top:10px;border-top:1px solid var(--blue-light);">$1</div>')
    .replace(/^### (.+)$/gm,'<div style="font-size:14px;font-weight:600;color:var(--text);margin:10px 0 4px;">$1</div>')
    .replace(/^- (.+)$/gm,'<div style="display:flex;gap:7px;margin:3px 0;font-size:14px;"><span style="color:var(--blue-mid);flex-shrink:0;margin-top:2px;">•</span><span>$1</span></div>')
    .replace(/^(\d+)\. (.+)$/gm,'<div style="display:flex;gap:8px;margin:5px 0;font-size:14px;"><span style="color:var(--blue);flex-shrink:0;font-weight:700;min-width:20px;">$1.</span><span>$2</span></div>')
    .replace(/\n\n/g,'<br><br>').replace(/\n/g,'<br>');
}

// =======================================================
// APP NAVIGATION
// =======================================================
function showPage(p) {
  document.querySelectorAll('.page').forEach(x => x.classList.remove('active'));
  document.querySelectorAll('.nav-item').forEach(x => x.classList.remove('active'));
  document.getElementById('page-' + p)?.classList.add('active');
  document.getElementById('nav-' + p)?.classList.add('active');
  if (p === 'regulations' && !document.getElementById('regsTree').innerHTML) buildRegsTree();
  if (p === 'dashboard') renderDashboard();
  if (p === 'tracker') renderTracker();
}

function updateSidebar() {
  const branch = (ans.branch||[]).join('/') || 'Veteran';
  const isReserve = ['Reserve','National Guard'].includes(ans.component);
  document.getElementById('sbName').textContent = `${branch} Veteran`;
  document.getElementById('sbMeta').textContent = [ans.mos, ans.component].filter(Boolean).join(' · ') + (isReserve ? ' ⚠️' : '') || 'Screener complete';
  const c = calcCombined();
  document.getElementById('sbRating').textContent = c > 0 ? c + '% Combined' : 'View Roadmap';
}

// =======================================================
// CONTEXT BUILDER
// =======================================================
function buildAnswerContext() {
  const lines = [];
  const isReserve = ['Reserve','National Guard'].includes(ans.component);
  if (ans.goal)               lines.push(`Goal: ${ans.goal}`);
  if (ans.branch?.length)     lines.push(`Branch: ${ans.branch.join(', ')}`);
  if (ans.component)          lines.push(`Component: ${ans.component}${isReserve ? ' (RESERVIST)' : ''}`);
  if (ans.startYear)          lines.push(`Service entry: ${ans.startYear}`);
  if (ans.endYear)            lines.push(`Separation: ${ans.endYear}`);
  if (ans.discharge)          lines.push(`Discharge: ${ans.discharge}`);
  if (ans.mos)                lines.push(`MOS/AFSC: ${ans.mos}`);
  if (ans.deployments?.length)lines.push(`Deployments: ${ans.deployments.join(', ')}`);
  if (ans.exposures?.length)  lines.push(`Toxic exposures: ${ans.exposures.join(', ')}`);
  if (ans.vaStatus)           lines.push(`VA status: ${ans.vaStatus}`);
  if (ans.ratedConditions?.length) lines.push(`Currently rated: ${ans.ratedConditions.join(', ')}`);
  if (ans.otherRated)         lines.push(`Other rated: ${ans.otherRated}`);
  if (ans.symptoms?.length)   lines.push(`Symptoms: ${ans.symptoms.join(', ')}`);
  if (ans.diagnoses?.length)  lines.push(`Diagnoses: ${ans.diagnoses.join(', ')}`);
  if (ans.otherDiag)          lines.push(`Other diagnoses: ${ans.otherDiag}`);
  if (ans.events?.length)     lines.push(`In-service events: ${ans.events.join(', ')}`);
  if (ans.evidence?.length)   lines.push(`Evidence on hand: ${ans.evidence.join(', ')}`);
  if (ans.impact?.length)     lines.push(`Life impact: ${ans.impact.join(', ')}`);
  ans.followupQs?.forEach(q => { const a = ans.followupAs[q.id]; if (a) lines.push(`[Q] ${q.text} → ${a}`); });
  return lines.join('\n');
}

function buildSystemPrompt() {
  const isReserve = ['Reserve','National Guard'].includes(ans.component);
  return `You are Aylene, a VA disability claims advocate and advisor. You are direct, warm, and knowledgeable — like a trusted friend who has navigated the VA system for years.

PERSONALITY: Conversational, human, never robotic. Short sentences, plain language. Never pad responses. Always answer in 1-3 sentences unless the question genuinely requires more depth. When citing regulations, always reference the specific CFR title and section (e.g., 38 CFR 3.303).

${isReserve ? 'VETERAN IS RESERVIST: Sparse STRs are normal. Focus on civilian records, personal statements, buddy statements. LOD rules for drill injuries.' : ''}

VETERAN PROFILE:
${buildAnswerContext()}

RULES:
- Always reference their actual MOS, branch, and specific conditions
- Be their advocate, not a bureaucrat
- Keep chat responses SHORT (1-3 sentences unless complex)
- Never say "I understand" or "Great question" — just answer`;
}

// =======================================================
// DASHBOARD — KANBAN BOARD
// =======================================================
const KANBAN_COLS = [
  {id:'todo',   label:'To Do',      cls:'kcol-todo'},
  {id:'inprog', label:'In Progress',cls:'kcol-inprog'},
  {id:'filed',  label:'Filed',      cls:'kcol-filed'},
  {id:'won',    label:'Won',        cls:'kcol-won'},
];

function buildChecksFor(name) {
  const n = name.toLowerCase();
  if (n.includes('tinnitus') || n.includes('ringing')) {
    return [{id:'dx',text:'No diagnosis needed — your own testimony is legally sufficient',done:false},{id:'stmt',text:'Write personal statement: describe when ringing started',done:false},{id:'form',text:'File VA Form 21-526EZ',done:false}];
  }
  if (n.includes('hearing loss')) {
    return [{id:'audio',text:'Get audiogram (hearing test) from VA or private audiologist',done:false},{id:'stmt',text:'Write personal statement describing noise exposure',done:false},{id:'form',text:'File VA Form 21-526EZ',done:false}];
  }
  if (n.includes('ptsd') || n.includes('nightmar') || n.includes('flashback')) {
    return [{id:'dx',text:'Get mental health evaluation and formal PTSD diagnosis',done:false},{id:'stressor',text:'Document your in-service stressor',done:false},{id:'stmt',text:'Write personal statement describing stressor and current symptoms',done:false},{id:'form',text:'File VA Form 21-526EZ',done:false}];
  }
  if (n.includes('anxiety') || n.includes('depress')) {
    return [{id:'dx',text:'Get formal diagnosis from mental health provider',done:false},{id:'nexus',text:'Get nexus letter linking condition to service or rated condition',done:false},{id:'stmt',text:'Write personal statement',done:false},{id:'form',text:'File VA Form 21-526EZ',done:false}];
  }
  if (n.includes('sleep apnea') || n.includes('apnea')) {
    return [{id:'dx',text:'Complete sleep study and get formal diagnosis',done:false},{id:'nexus',text:'Get nexus letter linking to PTSD, obesity, or direct service connection',done:false},{id:'cpap',text:'Get CPAP prescription (affects rating level)',done:false},{id:'form',text:'File VA Form 21-526EZ',done:false}];
  }
  if (n.includes('back') || n.includes('spine') || n.includes('lumbar') || n.includes('cervical')) {
    return [{id:'dx',text:'Get imaging (X-ray or MRI) and formal diagnosis',done:false},{id:'rom',text:'Document range of motion limitations with your doctor',done:false},{id:'nexus',text:'Get nexus letter linking to military service',done:false},{id:'form',text:'File VA Form 21-526EZ',done:false}];
  }
  if (n.includes('knee') || n.includes('shoulder') || n.includes('hip') || n.includes('foot') || n.includes('ankle')) {
    return [{id:'dx',text:'Get imaging and formal orthopedic diagnosis',done:false},{id:'nexus',text:'Get nexus letter linking to military service',done:false},{id:'buddy',text:'Get buddy statement from fellow service member if possible',done:false},{id:'form',text:'File VA Form 21-526EZ',done:false}];
  }
  if (n.includes('diabetes')) {
    return [{id:'dx',text:'Get formal Type 2 diabetes diagnosis',done:false},{id:'presumptive',text:'Confirm Agent Orange / herbicide exposure during service',done:false},{id:'form',text:'File VA Form 21-526EZ — presumptive, no nexus letter needed',done:false}];
  }
  if (n.includes('hypertension') || n.includes('blood pressure')) {
    return [{id:'dx',text:'Document hypertension diagnosis with readings over time',done:false},{id:'nexus',text:'Get nexus letter (secondary to sleep apnea, PTSD, or direct)',done:false},{id:'form',text:'File VA Form 21-526EZ',done:false}];
  }
  return [
    {id:'dx',text:'Get formal diagnosis from a licensed provider',done:false},
    {id:'strs',text:'Review service records for any in-service documentation',done:false},
    {id:'nexus',text:'Get nexus letter linking condition to military service',done:false},
    {id:'stmt',text:'Write personal statement (VA Form 21-4138)',done:false},
    {id:'form',text:'File VA Form 21-526EZ',done:false},
  ];
}

function autoBuildDashboard() {}
function saveDashboard() { saveClaims(); }

function renderDashboard() {
  localStorage.setItem('mc6_roadmap_confirmed', '1');
  const won   = claims.filter(d => d.col === 'won').length;
  const total = claims.length;

  const hero = `
    <div class="board-hero">
      <div>
        <div style="font-size:10px;font-weight:700;letter-spacing:1.5px;text-transform:uppercase;color:rgba(255,255,255,.65);margin-bottom:4px;">Case Dashboard</div>
        <div style="font-size:17px;font-weight:600;color:var(--white);">${(ans.branch||[]).join('/')||'Veteran'} · ${ans.mos||'MOS on file'}</div>
        <div style="font-size:12px;color:rgba(255,255,255,.65);margin-top:3px;">${total} condition${total!==1?'s':''} tracked · drag to update status</div>
      </div>
      <div class="board-stats">
        <div class="board-stat"><div class="board-stat-val">${total}</div><div class="board-stat-lbl">Total</div></div>
        <div class="board-stat"><div class="board-stat-val" style="color:var(--gold);">${calcCombined()}%</div><div class="board-stat-lbl">Est. Combined</div></div>
        <div class="board-stat"><div class="board-stat-val" style="color:#66bb6a;">${won}</div><div class="board-stat-lbl">Won</div></div>
      </div>
      <button class="btn no-print" style="background:rgba(255,255,255,.15);border:1px solid rgba(255,255,255,.3);color:white;margin-left:10px;font-size:12px;padding:6px 14px;border-radius:var(--r);cursor:pointer;" onclick="openAddModal()">＋ Add</button>
    </div>`;

  const typeColors = {'DIRECT':'#c8a84b','SECONDARY':'var(--blue-mid)','PRESUMPTIVE':'var(--purple)','LAY TESTIMONY':'var(--green)'};

  const board = `<div class="kanban" id="kanbanBoard">
    ${KANBAN_COLS.map(col => {
      const cards = claims.filter(d => d.col === col.id);
      const cardHtml = cards.map(item => {
        const idx = claims.indexOf(item);
        const doneCount = (item.checks||[]).filter(c => c.done).length;
        const totalSteps = (item.checks||[]).length;
        const pct = totalSteps ? Math.round((doneCount/totalSteps)*100) : 0;
        const tc = typeColors[item.type] || 'var(--blue)';
        const checksHtml = item.expanded ? `
          <div class="kcard-checks">
            ${(item.checks||[]).map((c,ci) => `
              <div class="check-item ${c.done?'checked':''}" onclick="toggleKCheck(${idx},${ci});event.stopPropagation()">
                <div class="check-box">${c.done?'✓':''}</div>
                <div class="check-text">${c.text}</div>
              </div>`).join('')}
          </div>` : '';
        return `
          <div class="kcard" id="kcard-${idx}" draggable="true"
            ondragstart="dragStart(event,${idx})" ondragend="dragEnd(event)"
            onclick="toggleKCard(${idx})">
            <div style="display:flex;align-items:flex-start;gap:6px;justify-content:space-between;">
              <div class="kcard-name">${item.name}</div>
              <div style="display:flex;gap:4px;flex-shrink:0;">
                <button style="background:none;border:none;cursor:pointer;color:var(--text-hint);font-size:12px;padding:0;" onclick="openEditModal(${idx});event.stopPropagation()" title="Edit">✏️</button>
                <button style="background:none;border:none;cursor:pointer;color:var(--text-hint);font-size:12px;padding:0;" onclick="removeClaim(${idx});event.stopPropagation()" title="Remove">✕</button>
              </div>
            </div>
            <div style="display:flex;align-items:center;gap:6px;margin-top:4px;">
              <span class="kcard-basis" style="background:${tc}22;color:${tc};">${item.type}</span>
              ${item.rating ? `<span style="font-size:11px;font-weight:700;color:var(--blue);">${item.rating}%</span>` : ''}
            </div>
            <div class="kcard-progress"><div class="kcard-prog-fill" style="width:${pct}%;background:${col.id==='won'?'var(--green)':col.id==='filed'?'var(--blue-mid)':'var(--blue)'}"></div></div>
            <div class="kcard-meta">
              <span>${doneCount}/${totalSteps} steps</span>
              <span style="color:var(--blue-mid);">${item.expanded?'▴ hide':'▾ steps'}</span>
            </div>
            ${checksHtml}
            <div class="kcard-actions" onclick="event.stopPropagation()">
              ${col.id !== 'won'
                ? `<button class="kbtn kbtn-advance" onclick="advanceCard(${idx})">→ Next</button>`
                : `<span style="font-size:11px;color:var(--green);font-weight:600;">🏆 Won</span>`}
            </div>
          </div>`;
      }).join('') || `<div style="padding:20px 10px;text-align:center;font-size:12px;color:var(--text-hint);border:2px dashed var(--border);border-radius:var(--r);margin:6px;">Drop here</div>`;

      return `
        <div class="kanban-col ${col.cls}" id="kcol-${col.id}"
          ondragover="event.preventDefault()" ondrop="dropCard(event,'${col.id}')">
          <div class="kanban-col-hdr">
            <div class="kanban-col-title">${col.label}</div>
            <div class="kanban-col-count">${cards.length}</div>
          </div>
          <div class="kanban-cards">${cardHtml}</div>
        </div>`;
    }).join('')}
  </div>`;

  document.getElementById('dashContent').innerHTML = hero + board;
}

let dragIdx = null;
function dragStart(e, idx) { dragIdx = idx; e.currentTarget.classList.add('dragging'); }
function dragEnd(e) { e.currentTarget.classList.remove('dragging'); dragIdx = null; }
function dropCard(e, colId) {
  e.preventDefault();
  if (dragIdx === null) return;
  claims[dragIdx].col = colId;
  claims[dragIdx].status = colId;
  saveClaims(); renderDashboard(); renderTracker(); updateSidebar();
}

function advanceCard(idx) {
  const order = ['todo','inprog','filed','won'];
  const cur = order.indexOf(claims[idx].col);
  if (cur < order.length - 1) {
    claims[idx].col = order[cur+1];
    claims[idx].status = claims[idx].col;
    saveClaims(); renderDashboard(); renderTracker(); updateSidebar();
  }
}

function toggleKCard(idx) {
  claims[idx].expanded = !claims[idx].expanded;
  saveClaims(); renderDashboard();
}

function toggleKCheck(itemIdx, checkIdx) {
  if (!claims[itemIdx].checks) return;
  claims[itemIdx].checks[checkIdx].done = !claims[itemIdx].checks[checkIdx].done;
  const item = claims[itemIdx];
  const allDone = item.checks.every(c => c.done);
  if (allDone && item.col === 'inprog') { item.col='filed'; item.status='filed'; }
  else if (allDone && item.col === 'todo') { item.col='inprog'; item.status='inprog'; }
  saveClaims(); renderDashboard(); renderTracker();
}

function addDashItem() { openAddModal(); }

function inferCondType(name) {
  const n = name.toLowerCase();
  if (n.includes('tinnitus') || n.includes('ringing') || n.includes('migrain') || n.includes('anxiety')) return 'LAY TESTIMONY';
  if (n.includes('diabetes') || n.includes('presumptive') || n.includes('cancer') || n.includes('bronchiolitis')) return 'PRESUMPTIVE';
  if (n.includes('sleep apnea') || n.includes('depression') || n.includes('hypertension') || n.includes('neuropathy')) return 'SECONDARY';
  return 'DIRECT';
}

// =======================================================
// CHAT
// =======================================================
function initChat() {
  if (chatHistory.length) return;
  const isReserve = ['Reserve','National Guard'].includes(ans.component);
  const reserveNote = isReserve ? " I know your Reserve/Guard service means we'll lean on civilian records over STRs — I've got that covered." : '';
  addMsg('ai', `Hey — I'm Aylene, your claim advisor.${reserveNote} Your roadmap's ready. What do you want to dig into first?`);
}

function addMsg(role, text) {
  const msgs = document.getElementById('chatMsgs');
  const div = document.createElement('div');
  div.className = 'msg ' + role;
  div.innerHTML = `<div class="msg-av ${role}">${role==='ai'?'A':'YOU'}</div><div class="msg-bub">${fmt(text)}</div>`;
  msgs.appendChild(div);
  msgs.scrollTop = msgs.scrollHeight;
}

function addTyping() {
  const msgs = document.getElementById('chatMsgs');
  const div = document.createElement('div');
  div.className = 'msg ai'; div.id = 'typdiv';
  div.innerHTML = `<div class="msg-av ai">A</div><div class="msg-bub"><span style="font-size:11px;color:var(--text-hint);font-style:italic;margin-right:6px;">Aylene is typing</span><div class="t-dot-wrap" style="display:inline-flex;"><div class="t-dot"></div><div class="t-dot"></div><div class="t-dot"></div></div></div>`;
  msgs.appendChild(div);
  msgs.scrollTop = msgs.scrollHeight;
}

function removeTyping() { document.getElementById('typdiv')?.remove(); }

async function sendMessage() {
  const input = document.getElementById('chatInput');
  const btn   = document.getElementById('sendBtn');
  const text  = input.value.trim();
  if (!text || btn.disabled) return;
  input.value = ''; autoResize(input); btn.disabled = true;
  addMsg('user', text);
  chatHistory.push({role:'user', content:text});
  addTyping();
  try {
    const resp = await callClaude(chatHistory, buildSystemPrompt());
    removeTyping();
    addMsg('ai', resp);
    chatHistory.push({role:'assistant', content:resp});
  } catch(e) {
    removeTyping();
    addMsg('ai', `**Connection issue.** ${e.message}`);
  }
  btn.disabled = false;
}

function clearChat() { chatHistory = []; document.getElementById('chatMsgs').innerHTML = ''; initChat(); }
function handleChatKey(e) { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendMessage(); } }
function autoResize(el) { el.style.height = 'auto'; el.style.height = Math.min(el.scrollHeight, 110) + 'px'; }

// =======================================================
// PDF TEXT EXTRACTION
// =======================================================
async function extractPDFText(file) {
  if (!window.pdfjsLib) {
    await new Promise((resolve, reject) => {
      const s = document.createElement('script');
      s.src = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.min.js';
      s.onload = resolve; s.onerror = reject;
      document.head.appendChild(s);
    });
    window.pdfjsLib.GlobalWorkerOptions.workerSrc =
      'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';
  }
  const buf = await file.arrayBuffer();
  const pdf = await pdfjsLib.getDocument({ data: buf }).promise;
  let text = '';
  const maxPages = Math.min(pdf.numPages, 25);
  for (let i = 1; i <= maxPages; i++) {
    const page = await pdf.getPage(i);
    const content = await page.getTextContent();
    text += content.items.map(item => item.str).join(' ') + '\n';
  }
  return text.trim();
}

// =======================================================
// DECISION LETTER ANALYSIS
// =======================================================
async function handleDLUpload(files) {
  if (!files.length) return;
  dlDocs = [{name:files[0].name, size:files[0].size, file:files[0], analyzed:false, result:null}];
  renderDLList(); analyzeDL(files[0]);
}

function renderDLList() {
  document.getElementById('dlFileList').innerHTML = dlDocs.map(d => `
    <div class="file-row" style="margin-top:8px;">
      <span style="font-size:18px;">📮</span>
      <div style="flex:1;"><div style="font-size:13px;font-weight:500;">${d.name}</div></div>
      ${d.analyzed ? '<span class="badge-done">✓ Analyzed</span>' : '<span class="badge-analyzing">⏳ Analyzing...</span>'}
    </div>`).join('');
}

async function analyzeDL(file) {
  let text = '';
  try {
    if (file.type === 'application/pdf') {
      try { text = await extractPDFText(file); }
      catch(pdfErr) { text = '[PDF extraction failed — please paste the letter text directly]'; }
    } else {
      text = await file.text();
    }
    if (text.length > 14000) text = text.substring(0, 14000) + '...[truncated]';
    const prompt = `You are a VA disability claims expert analyzing a decision letter.

VETERAN PROFILE:\n${buildAnswerContext()}

DECISION LETTER:\n${text}

Respond in EXACTLY this structure:

## FAVORABLE FINDINGS — What the VA Found in Your Favor
List every concession, acknowledgment, or partially favorable finding.

## WHY IT WAS DENIED OR RATED LOW
Plain language. Specific per condition.

## THE GAP — What's Missing
The exact 1-3 things that would flip this decision.

## YOUR NEXT STEP
Recommended appeal lane (Supplemental/HLR/BVA) and why. Include form numbers.

## DON'T GIVE UP
What these findings mean for their next filing.`;

    const resp = await callClaude([{role:'user',content:prompt}], 'VA claims expert. Be specific. This analysis could change a veteran\'s life.', 2500);
    const d = dlDocs[0]; if (d) { d.analyzed=true; d.result=resp; }
  } catch(e) {
    const d = dlDocs[0]; if (d) { d.analyzed=true; d.result='Error: '+e.message; }
  }
  renderDLList(); renderDLAnalysis();
}

function renderDLAnalysis() {
  const doc = dlDocs[0];
  if (!doc?.result) return;
  const card = document.getElementById('dlAnalysisCard');
  card.style.display = 'block';
  const content = document.getElementById('dlAnalysisContent');
  if (typeof doc.result === 'string') {
    const text = doc.result;
    const sections = [
      {key:'FAVORABLE FINDINGS',cls:'dl-green',icon:'✅'},
      {key:'WHY IT WAS DENIED',cls:'dl-red',icon:'❌'},
      {key:'THE GAP',cls:'dl-amber',icon:'🎯'},
      {key:'YOUR NEXT STEP',cls:'dl-blue',icon:'➡️'},
      {key:"DON'T GIVE UP",cls:'dl-green',icon:'💪'},
    ];
    let html = '';
    sections.forEach((sec, i) => {
      const nextKey = sections[i+1]?.key;
      const start = text.indexOf('## ' + sec.key);
      if (start === -1) return;
      const end = nextKey ? text.indexOf('## ' + nextKey) : text.length;
      const body = text.substring(start + sec.key.length + 4, end).trim();
      html += `<div class="dl-panel ${sec.cls}"><div class="dl-panel-title">${sec.icon} ${sec.key}</div><div class="dl-panel-body">${fmt(body)}</div></div>`;
    });
    content.innerHTML = html || `<div style="font-size:14px;line-height:1.7;">${fmt(text)}</div>`;
  } else {
    content.innerHTML = `<div class="alert alert-amber"><span>⚠️</span><span>Analysis unavailable.</span></div>`;
  }
}

function clearDL() { dlDocs=[]; document.getElementById('dlFileList').innerHTML=''; document.getElementById('dlAnalysisCard').style.display='none'; document.getElementById('dlFileInput').value=''; }

async function handleMedUpload(files) {
  [...files].forEach(file => {
    if (medDocs.find(d => d.name === file.name)) return;
    medDocs.push({name:file.name,size:file.size,file,analyzed:false,result:null});
    renderMedList(); analyzeMed(file);
  });
}

function renderMedList() {
  document.getElementById('medFileList').innerHTML = medDocs.map((d,i) => `
    <div class="file-row" style="margin-top:8px;">
      <span style="font-size:18px;">📄</span>
      <div style="flex:1;"><div style="font-size:13px;font-weight:500;">${d.name}</div></div>
      ${d.analyzed ? '<span class="badge-done">✓ Analyzed</span>' : '<span class="badge-analyzing">⏳ Analyzing...</span>'}
      <button style="background:none;border:none;cursor:pointer;color:var(--text-hint);font-size:14px;" onclick="removeMedDoc(${i})">✕</button>
    </div>`).join('');
}

function removeMedDoc(i) { medDocs.splice(i,1); renderMedList(); renderMedAnalysis(); }
function clearMed() { medDocs=[]; renderMedList(); document.getElementById('medAnalysisCard').style.display='none'; document.getElementById('medFileInput').value=''; }

async function analyzeMed(file) {
  let text = '';
  try {
    if (file.type === 'application/pdf') {
      try { text = await extractPDFText(file); }
      catch(pdfErr) { text = '[PDF extraction failed]'; }
    } else {
      text = await file.text();
    }
    if (text.length>12000) text=text.substring(0,12000)+'...[truncated]';
    const resp = await callClaude([{role:'user',content:`Analyze this record for VA claim opportunities.\n\nVETERAN:\n${buildAnswerContext()}\n\nDOCUMENT: ${file.name}\n${text}\n\nFind key diagnoses, claim opportunities, evidence provided, conditions not yet claimed, next actions.`}], buildSystemPrompt(), 1500);
    const d = medDocs.find(x=>x.name===file.name); if(d){d.analyzed=true;d.result=resp;}
  } catch(e) {
    const d=medDocs.find(x=>x.name===file.name); if(d){d.analyzed=true;d.result='Error: '+e.message;}
  }
  renderMedList(); renderMedAnalysis();
}

function renderMedAnalysis() {
  const analyzed = medDocs.filter(d => d.analyzed && d.result);
  const card = document.getElementById('medAnalysisCard');
  if (!analyzed.length) { card.style.display='none'; return; }
  card.style.display='block';
  document.getElementById('medAnalysisContent').innerHTML = analyzed.map(d => `
    <div style="background:var(--blue-pale);border:1px solid var(--blue-light);border-radius:var(--r);padding:13px;margin-bottom:10px;">
      <div style="font-weight:600;color:var(--blue);margin-bottom:7px;">📄 ${d.name}</div>
      <div style="font-size:13px;line-height:1.7;">${fmt(d.result)}</div>
    </div>`).join('');
}

// =======================================================
// CONDITIONS TRACKER
// =======================================================
function autoPopulateConditions() {
  if (claims.length) return;
  const seen = new Set();
  [...(ans.diagnoses||[]),...(ans.symptoms||[])].forEach(name => {
    if (!seen.has(name.toLowerCase())) {
      seen.add(name.toLowerCase());
      claims.push({
        id: Date.now() + '_' + Math.random().toString(36).slice(2),
        name,
        rating: 0,
        status: 'todo',
        col: 'todo',
        type: inferCondType(name),
        checks: buildChecksFor(name),
        expanded: false,
        code: '',
        secondary: '',
        notes: ''
      });
    }
  });
  saveClaims();
}

function calcCombined() {
  const rated = claims
    .filter(c => (c.col === 'won' || c.status === 'connected') && c.rating > 0)
    .map(c => c.rating).sort((a,b) => b-a);
  if (!rated.length) return 0;
  let rem = 100;
  rated.forEach(r => rem *= (1 - r/100));
  return Math.min(Math.round((100 - rem) / 10) * 10, 100);
}

function openAddModal() {
  ['mName','mCode','mSecondary','mNotes'].forEach(id => { const el=document.getElementById(id); if(el) el.value=''; });
  document.getElementById('mRating').value='0';
  document.getElementById('mStatus').value='todo';
  document.getElementById('mModalTitle').textContent = 'Add a Condition';
  document.getElementById('mSaveBtn').onclick = addClaim;
  document.getElementById('addModal').classList.add('active');
  setTimeout(() => document.getElementById('mName').focus(), 80);
}

function openEditModal(idx) {
  idx = parseInt(idx);
  const c = claims[idx];
  if (!c) return;
  document.getElementById('mName').value = c.name;
  document.getElementById('mCode').value = c.code || '';
  document.getElementById('mSecondary').value = c.secondary || '';
  document.getElementById('mNotes').value = c.notes || '';
  document.getElementById('mRating').value = c.rating || '0';
  document.getElementById('mStatus').value = c.col || 'todo';
  document.getElementById('mModalTitle').textContent = 'Edit Condition';
  document.getElementById('mSaveBtn').onclick = () => saveClaim(idx);
  document.getElementById('addModal').classList.add('active');
  setTimeout(() => document.getElementById('mName').focus(), 80);
}

function closeModal() { document.getElementById('addModal').classList.remove('active'); }

function addClaim() {
  const name = document.getElementById('mName').value.trim();
  if (!name) { document.getElementById('mName').focus(); return; }
  const col = document.getElementById('mStatus').value;
  claims.push({
    id: Date.now(),
    name, col,
    rating: parseInt(document.getElementById('mRating').value) || 0,
    status: col,
    type: inferCondType(name),
    checks: buildChecksFor(name),
    expanded: false,
    code: document.getElementById('mCode').value.trim(),
    secondary: document.getElementById('mSecondary').value.trim(),
    notes: document.getElementById('mNotes').value.trim()
  });
  saveClaims(); closeModal(); renderTracker(); renderDashboard(); updateSidebar();
}

function saveClaim(idx) {
  idx = parseInt(idx);
  const c = claims[idx];
  if (!c) return;
  const col = document.getElementById('mStatus').value;
  c.name      = document.getElementById('mName').value.trim() || c.name;
  c.rating    = parseInt(document.getElementById('mRating').value) || 0;
  c.col       = col;
  c.status    = col;
  c.code      = document.getElementById('mCode').value.trim();
  c.secondary = document.getElementById('mSecondary').value.trim();
  c.notes     = document.getElementById('mNotes').value.trim();
  saveClaims(); closeModal(); renderTracker(); renderDashboard(); updateSidebar();
}

function removeClaim(idx) {
  idx = parseInt(idx);
  if (isNaN(idx) || idx < 0 || idx >= claims.length) return;
  claims.splice(idx, 1);
  saveClaims(); renderTracker(); renderDashboard(); updateSidebar();
}

function renderTracker() {
  document.getElementById('st-combined').textContent = calcCombined() + '%';
  document.getElementById('st-connected').textContent = claims.filter(c => c.col === 'won').length;
  document.getElementById('st-pending').textContent   = claims.filter(c => c.col === 'filed').length;
  document.getElementById('trackerCombined').textContent = calcCombined() + '%';

  const tbody = document.getElementById('trackerBody');
  if (!claims.length) {
    tbody.innerHTML = `<tr><td colspan="5"><div class="empty-state" style="padding:28px;">No conditions yet. Click <strong>+ Add Condition</strong> to start.</div></td></tr>`;
    return;
  }

  tbody.innerHTML = [...claims].map((c, idx) => {
    const colLabels = {todo:'To Do',inprog:'In Progress',filed:'Filed',won:'✅ Won'};
    const colColors = {todo:'var(--gray-600)',inprog:'var(--amber)',filed:'var(--blue-mid)',won:'var(--green)'};
    const lbl   = colLabels[c.col] || 'To Do';
    const color = colColors[c.col] || 'var(--gray-600)';
    return `<tr>
      <td>
        <div style="font-weight:600;font-size:14px;">${c.name}</div>
        ${c.secondary ? `<div style="font-size:11px;color:var(--text-hint);">Secondary to: ${c.secondary}</div>` : ''}
        ${c.notes ? `<div style="font-size:11px;color:var(--text-hint);">${c.notes}</div>` : ''}
      </td>
      <td><span style="font-size:13px;font-weight:700;color:var(--blue);background:var(--blue-pale);padding:2px 8px;border-radius:3px;">${c.rating||0}%</span></td>
      <td><span style="font-size:12px;font-weight:600;color:${color};">${lbl}</span></td>
      <td style="font-size:12px;color:var(--text-sec);">${c.code||'—'}</td>
      <td>
        <button style="background:none;border:1px solid var(--border);border-radius:3px;cursor:pointer;color:var(--text-sec);font-size:12px;padding:3px 8px;margin-right:4px;" onclick="openEditModal(${idx})">Edit</button>
        <button style="background:none;border:none;cursor:pointer;color:var(--red);font-size:16px;line-height:1;" onclick="removeClaim(${idx})">🗑</button>
      </td>
    </tr>`;
  }).join('');
}

// =======================================================
// VA REGULATIONS
// =======================================================
const REGS = {
  "Service Connection": [
    {
      code: "38 CFR 3.303",
      title: "Direct Service Connection",
      html: `<div class="reg-intro">The foundational regulation for establishing that a current disability was caused by military service.</div>
<h3>The Three-Element Test</h3>
<p>To establish direct service connection, you must prove ALL three:</p>
<div class="reg-list">
  <div class="reg-item"><div class="reg-num">1</div><div><strong>Current Disability</strong> — A present medical diagnosis of the condition you're claiming.</div></div>
  <div class="reg-item"><div class="reg-num">2</div><div><strong>In-Service Incurrence or Aggravation</strong> — Evidence that an event, injury, or disease occurred during active military service.</div></div>
  <div class="reg-item"><div class="reg-num">3</div><div><strong>Nexus</strong> — A medical opinion stating it is "at least as likely as not" (50%+) that the current disability is related to the in-service event.</div></div>
</div>
<h3>Key Legal Points</h3>
<ul class="reg-bullets">
  <li><strong>"At least as likely as not"</strong> is a 50% standard — the benefit of the doubt goes to the veteran (38 CFR 3.102).</li>
  <li>Absence of records does not equal no injury — many conditions go untreated in service.</li>
  <li>A lay statement (your own testimony) can establish an in-service event when records don't exist.</li>
</ul>`
    },
    {
      code: "38 CFR 3.310",
      title: "Secondary Service Connection",
      html: `<div class="reg-intro">Allows you to claim a new condition that was caused OR aggravated by an already service-connected disability.</div>
<h3>Common Secondary Chains</h3>
<ul class="reg-bullets">
  <li><strong>PTSD → Sleep Apnea</strong></li>
  <li><strong>PTSD → Depression, Anxiety, Substance Use</strong></li>
  <li><strong>Sleep Apnea → Hypertension, Heart Conditions</strong></li>
  <li><strong>Knee/Hip/Ankle → Back conditions</strong> (altered gait)</li>
  <li><strong>Diabetes (Type 2) → Neuropathy, Retinopathy, ED</strong></li>
</ul>
<h3>What You Need</h3>
<p>A nexus letter from a physician stating the secondary condition is "at least as likely as not caused or aggravated by" the primary service-connected condition.</p>`
    },
    {
      code: "38 CFR 3.307-309",
      title: "Presumptive Conditions",
      html: `<div class="reg-intro">Certain diseases are presumed to be service-connected — no nexus letter required.</div>
<h3>PACT Act (2022)</h3>
<p>Post-9/11 burn pit veterans: ALL cancers and several respiratory conditions are now presumptive if you served in a covered location (Iraq, Afghanistan, Southwest Asia) after August 2, 1990.</p>
<h3>Agent Orange</h3>
<p>Type 2 Diabetes, ischemic heart disease, Parkinson's, peripheral neuropathy, various cancers — presumptive for Vietnam/Korea DMZ veterans.</p>
<h3>Gulf War Illness</h3>
<p>Undiagnosed illnesses, chronic fatigue, fibromyalgia, functional GI disorders — presumptive under 38 CFR 3.317.</p>`
    }
  ],
  "Rating & Compensation": [
    {
      code: "38 CFR Part 4",
      title: "How the VA Rates Disabilities",
      html: `<div class="reg-intro">The master rulebook for how VA assigns disability percentages.</div>
<h3>C&P Exam Tip</h3>
<p>Describe your <strong>worst days</strong>, not your average days. The examiner's written opinion largely determines your rating. Never minimize your symptoms.</p>
<h3>Whole Person Combined Rating</h3>
<p>Ratings don't add together. Each new rating applies to the remaining "able" percentage. 50% + 30% = 65%, which rounds to <strong>70%</strong>.</p>
<h3>Bilateral Factor (38 CFR 4.68)</h3>
<p>If you have service-connected disabilities affecting both arms OR both legs, a 10% bilateral factor is added before applying the combined ratings table.</p>`
    },
    {
      code: "38 CFR 4.16",
      title: "TDIU — Total Disability Individual Unemployability",
      html: `<div class="reg-intro">Paid at the 100% rate when service-connected conditions prevent substantially gainful employment — even if your combined rating is below 100%.</div>
<h3>Schedular TDIU — 4.16(a)</h3>
<ul class="reg-bullets">
  <li>ONE condition rated <strong>60%+</strong>, OR</li>
  <li>Combined rating of <strong>70%+</strong> with at least one disability at 40%+</li>
</ul>
<h3>Extra-Schedular TDIU — 4.16(b)</h3>
<p>Even without meeting the thresholds, VA must refer your case if conditions prevent employment.</p>
<h3>Evidence Needed</h3>
<p>VA Form 21-8940 + employment history showing job losses or inability to maintain employment.</p>`
    }
  ],
  "Appeals (AMA)": [
    {
      code: "38 CFR 19-20",
      title: "Your 3 Appeal Options",
      html: `<div class="reg-intro">The Appeals Modernization Act (AMA) gives you three lanes after a denial.</div>
<div class="reg-list">
  <div class="reg-item"><div class="reg-num">1</div><div><strong>Supplemental Claim</strong> — New and relevant evidence. Best starting point. File VA Form 20-0995. Can be filed at any time — no deadline.</div></div>
  <div class="reg-item"><div class="reg-num">2</div><div><strong>Higher-Level Review (HLR)</strong> — Senior reviewer, same evidence. Good for clear rater errors. File VA Form 20-0996.</div></div>
  <div class="reg-item"><div class="reg-num">3</div><div><strong>BVA Appeal</strong> — Veterans Law Judge. Can submit new evidence. File VA Form 10182. After BVA, appeal to CAVC within 120 days.</div></div>
</div>`
    },
    {
      code: "38 CFR 3.400",
      title: "Effective Dates",
      html: `<div class="reg-intro">The date your VA benefits begin. Getting the earliest possible effective date means maximum retroactive back pay.</div>
<h3>Intent to File (ITF)</h3>
<p>File an Intent to File (VA Form 21-0966) BEFORE you're ready to submit your full claim. This locks in an effective date up to <strong>1 year in advance</strong>.</p>
<h3>General Rule</h3>
<p>The effective date is the <strong>date VA receives your claim</strong>, OR the date you become entitled to benefits — whichever is later.</p>`
    }
  ],
  "PACT Act": [
    {
      code: "PL 117-168",
      title: "PACT Act — Toxic Exposure Overview",
      html: `<div class="reg-intro">The PACT Act of 2022 is the largest expansion of VA benefits in decades.</div>
<h3>Who It Covers</h3>
<ul class="reg-bullets">
  <li>Post-9/11 veterans who served in Southwest Asia after August 2, 1990</li>
  <li>Vietnam-era veterans with new cancers added to Agent Orange list</li>
  <li>Cold War veterans who served at radiation-contaminated sites</li>
</ul>
<h3>All Cancers Are Now Presumptive</h3>
<p>If you served in a covered location, no nexus letter is needed for any cancer claim.</p>
<h3>Camp Lejeune</h3>
<p>Veterans who lived/worked at Camp Lejeune for 30+ days from August 1953 to December 1987 are entitled to VA healthcare AND disability compensation for 15 qualifying conditions.</p>
<h3>How to File</h3>
<p>VA Form 21-526EZ — select "Yes" to toxic exposure and list your deployment locations.</p>`
    }
  ]
};

// =======================================================
// REGULATIONS
// =======================================================
function buildRegsTree() {
  const tree = document.getElementById('regsTree');
  tree.innerHTML = '';
  Object.entries(REGS).forEach(([sec, items], si) => {
    const el = document.createElement('div');
    el.innerHTML = `
      <div class="tree-grp-hdr ${si===0?'open':''}" onclick="toggleTree(this)"><span class="tree-chevron">▶</span><span>${sec}</span></div>
      <div class="tree-items ${si===0?'open':''}">
        ${items.map((item,ii)=>`<div class="tree-item ${si===0&&ii===0?'active':''}" onclick="showReg('${sec}','${item.code}')">${item.title}<div class="tree-code">${item.code}</div></div>`).join('')}
      </div>`;
    tree.appendChild(el);
  });
  showReg('Service Connection', REGS['Service Connection'][0].code);
}

function toggleTree(hdr) { hdr.classList.toggle('open'); hdr.nextElementSibling.classList.toggle('open'); }

function showReg(sec, code) {
  document.querySelectorAll('.tree-item').forEach(el => el.classList.remove('active'));
  const item = REGS[sec]?.find(i => i.code === code);
  if (!item) return;
  currentReg = item;
  document.querySelectorAll('.tree-item').forEach(el => { if (el.querySelector('.tree-code')?.textContent===code) el.classList.add('active'); });
  document.getElementById('regsTitle').textContent = item.title;
  document.getElementById('regsCode').textContent = item.code + ' — ' + sec;
  document.getElementById('regsBody').innerHTML = item.html;
}

function filterRegs(q) {
  q = q.toLowerCase();
  document.querySelectorAll('.tree-item').forEach(el => { el.style.display = !q || el.textContent.toLowerCase().includes(q) ? 'flex' : 'none'; });
}

async function askRegsAI() {
  const input = document.getElementById('regsInput');
  const btn   = document.getElementById('regsBtn');
  const q     = input.value.trim();
  if (!q) return;
  btn.disabled=true; btn.textContent='...';
  const ctx = currentReg ? `Veteran is reading: ${currentReg.title} (${currentReg.code}). ` : '';
  try {
    const resp = await callClaude([{role:'user',content:ctx+'Question: '+q}], buildSystemPrompt());
    const body = document.getElementById('regsBody');
    const block = document.createElement('div');
    block.style.cssText = 'background:var(--blue-pale);border:1px solid var(--blue-light);border-radius:var(--r);padding:13px;margin-top:14px;';
    block.innerHTML = `<div style="font-size:11px;font-weight:600;color:var(--blue);margin-bottom:7px;">🤖 "${q}"</div><div style="font-size:13px;line-height:1.7;">${fmt(resp)}</div>`;
    body.appendChild(block); body.scrollTop=body.scrollHeight; input.value='';
  } catch(e) { alert('Error: '+e.message); }
  btn.disabled=false; btn.textContent='Ask AI';
}

// =======================================================
// CLAUDE API
// =======================================================
async function callClaude(messages, system, maxTokens=450) {
  const r = await fetch('https://api.anthropic.com/v1/messages', {
    method:'POST',
    headers:{
      'Content-Type':'application/json',
      'x-api-key':API_KEY,
      'anthropic-version':'2023-06-01',
      'anthropic-dangerous-direct-browser-access':'true'
    },
    body:JSON.stringify({
      model:'claude-sonnet-4-20250514',
      max_tokens:maxTokens,
      system:system||buildSystemPrompt(),
      messages:messages.slice(-20)
    })
  });
  if (!r.ok) { const e=await r.json().catch(()=>({})); throw new Error(e.error?.message||`HTTP ${r.status}`); }
  const d = await r.json();
  return d.content[0]?.text || 'No response.';
}

// =======================================================
// INIT
// =======================================================
renderTracker();
document.querySelectorAll('.m-overlay').forEach(o => o.addEventListener('click', e => { if (e.target===o) o.classList.remove('active'); }));
['dlUploadZone','medUploadZone'].forEach(id => {
  const z = document.getElementById(id);
  if (!z) return;
  z.addEventListener('dragover', e => { e.preventDefault(); z.style.borderColor='var(--blue-mid)'; });
  z.addEventListener('dragleave', () => z.style.borderColor='');
  z.addEventListener('drop', e => { e.preventDefault(); z.style.borderColor=''; (id==='dlUploadZone'?handleDLUpload:handleMedUpload)(e.dataTransfer.files); });
});

// DEV STATUS BAR
(async function checkDevStatus() {
  const appEl = document.getElementById('devAppStatus');
  const apiEl = document.getElementById('devApiStatus');
  if (!appEl || !apiEl) return;

  appEl.textContent = '✅ App online';
  appEl.style.color = '#66bb6a';

  try {
    const r = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': API_KEY,
        'anthropic-version': '2023-06-01',
        'anthropic-dangerous-direct-browser-access': 'true'
      },
      body: JSON.stringify({
        model: 'claude-sonnet-4-20250514',
        max_tokens: 10,
        messages: [{role:'user', content:'hi'}]
      })
    });
    if (r.ok || r.status === 400) {
      apiEl.textContent = '✅ AI online';
      apiEl.style.color = '#66bb6a';
    } else if (r.status === 401) {
      apiEl.textContent = '❌ API key invalid';
      apiEl.style.color = '#ef5350';
    } else {
      apiEl.textContent = '⚠️ AI status unknown';
    }
  } catch(e) {
    apiEl.textContent = '❌ AI unreachable';
    apiEl.style.color = '#ef5350';
  }
})();
