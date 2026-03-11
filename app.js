/* =====================================================
   MISSION: CONNECTED — APP.JS v2
   Supabase + Claude AI + Full Rebuild
===================================================== */

// ── SUPABASE ──
const SB_URL = 'https://zspkgvodkyjhclzmyclu.supabase.co';
const SB_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InpzcGtndm9ka3lqaGNsem15Y2x1Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3MDAwMDAwMDAsImV4cCI6MjA1MDAwMDAwMH0.placeholder';
const CLAUDE_KEY = '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';
const CLAUDE_MODEL = 'claude-opus-4-5';

let supabase = null;
try { supabase = window.supabase.createClient(SB_URL, SB_KEY); } catch(e) { console.warn('Supabase init failed'); }

// ── STATE ──
let currentUser = null;
let currentView = 'vLanding';
let currentPage = 'roadmap';
let currentScreen = 1;
let roadmapData = null;
let conditions = [];
let chatHistory = [];
let uploadedFiles = [];
let authMode = 'signin';

// Screener answers
const ans = {
  goal:'', branch:[], component:'', startYear:'', endYear:'',
  discharge:'', mos:{}, deployments:[], exposures:[],
  vaStatus:'', ratedConds:[], symptoms:[], diagnoses:[],
  events:[], evidence:[], impact:[], followups:{}
};

// ── 2025 VA PAY TABLES ──
const VA_RATES = {
  10:  { none:175.51, spouse:175.51, spouse_child:175.51, spouse_2c:175.51, child:175.51 },
  20:  { none:346.95, spouse:346.95, spouse_child:346.95, spouse_2c:346.95, child:346.95 },
  30:  { none:537.42, spouse:590.95, spouse_child:637.60, spouse_2c:684.25, child:576.25 },
  40:  { none:774.16, spouse:847.87, spouse_child:906.93, spouse_2c:965.99, child:831.22 },
  50:  { none:1102.04,spouse:1196.03,spouse_child:1268.74,spouse_2c:1341.45,child:1171.79 },
  60:  { none:1395.93,spouse:1510.10,spouse_child:1596.26,spouse_2c:1682.42,child:1477.74 },
  70:  { none:1759.19,spouse:1893.69,spouse_child:1993.36,spouse_2c:2093.03,child:1852.87 },
  80:  { none:2044.89,spouse:2199.52,spouse_child:2312.63,spouse_2c:2425.74,child:2150.66 },
  90:  { none:2297.96,spouse:2472.72,spouse_child:2599.28,spouse_2c:2725.84,child:2416.27 },
  100: { none:3737.85,spouse:3946.25,spouse_child:4103.68,spouse_2c:4261.11,child:3870.43 }
};

// ── INIT ──
document.addEventListener('DOMContentLoaded', async () => {
  buildYearSelects();
  buildSymptomGrids();
  buildRegsTree();
  renderAyleneAvatar();
  checkAuthState();
});

async function checkAuthState() {
  if (!supabase) return;
  const { data: { session } } = await supabase.auth.getSession();
  if (session?.user) setUser(session.user);
  supabase.auth.onAuthStateChange((event, session) => {
    if (session?.user) setUser(session.user);
    else { currentUser = null; updateTopbar(); }
  });
}

function setUser(user) {
  currentUser = user;
  updateTopbar();
  loadUserData();
}

function updateTopbar() {
  const area = document.getElementById('tbUserArea');
  if (!area) return;
  if (currentUser) {
    const email = currentUser.email || '';
    const initial = email[0]?.toUpperCase() || 'V';
    area.innerHTML = `<div class="a-tb-user"><div class="a-tb-avatar-sm">${initial}</div><span class="a-tb-user-email">${email}</span><button class="btn-tb-out" onclick="signOut()">Sign Out</button></div>`;
  } else {
    area.innerHTML = `<button class="btn-tb-signup" onclick="openAuth('signup')">Save My Roadmap →</button>`;
  }
}

async function loadUserData() {
  if (!supabase || !currentUser) return;
  try {
    const { data: profile } = await supabase.from('profiles').select('*').eq('id', currentUser.id).single();
    if (profile?.screener_data) Object.assign(ans, profile.screener_data);
    if (profile?.roadmap_text) { roadmapData = profile.roadmap_text; }
    const { data: claims } = await supabase.from('claims').select('*').eq('user_id', currentUser.id);
    if (claims?.length) { conditions = claims; }
    if (roadmapData) renderRoadmap(roadmapData);
    if (conditions.length) renderDashboard();
  } catch(e) { console.warn('Load error:', e); }
}

// ── VIEW ROUTING ──
function showView(id) {
  document.querySelectorAll('.view').forEach(v => v.classList.remove('active'));
  document.getElementById(id)?.classList.add('active');
  currentView = id;
}

function showPage(id) {
  document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
  document.querySelectorAll('.nav-item').forEach(n => n.classList.remove('active'));
  document.getElementById('page-'+id)?.classList.add('active');
  document.getElementById('nav-'+id)?.classList.add('active');
  currentPage = id;
  showView('vApp');
  if (id === 'chat' && chatHistory.length === 0) initChat();
  if (id === 'regulations') buildRegsTree();
}

function requireAuth(fn) {
  if (currentUser) { fn(); return; }
  openAuth('signup');
}

// ── AUTH ──
function openAuth(mode = 'signin') {
  authMode = mode;
  switchAuthTab(mode);
  document.getElementById('authOverlay').classList.add('active');
  setTimeout(() => document.getElementById('authEmail')?.focus(), 100);
}

function closeAuth() {
  document.getElementById('authOverlay').classList.remove('active');
}

function switchAuthTab(mode) {
  authMode = mode;
  document.getElementById('tabSignin').classList.toggle('active', mode === 'signin');
  document.getElementById('tabSignup').classList.toggle('active', mode === 'signup');
  document.getElementById('authSubmitBtn').textContent = mode === 'signin' ? 'Sign In' : 'Create Free Account';
  document.getElementById('authModalTitle').textContent = mode === 'signin' ? 'Welcome Back' : 'Create Your Free Account';
  document.getElementById('authModalSub').textContent = mode === 'signin'
    ? 'Sign in to access your saved roadmap and case history.'
    : 'Free forever. Save your roadmap, chat with Aylene, track your case.';
  clearAuthError();
}

function clearAuthError() {
  const el = document.getElementById('authError');
  el.textContent = ''; el.classList.remove('show');
}

function showAuthError(msg) {
  const el = document.getElementById('authError');
  el.textContent = msg; el.classList.add('show');
}

async function handleAuthSubmit() {
  if (!supabase) { showAuthError('Authentication service not available.'); return; }
  const email = document.getElementById('authEmail').value.trim();
  const password = document.getElementById('authPassword').value;
  if (!email || !password) { showAuthError('Please enter your email and password.'); return; }
  const btn = document.getElementById('authSubmitBtn');
  btn.disabled = true; btn.textContent = 'Please wait...';
  clearAuthError();
  try {
    let result;
    if (authMode === 'signup') {
      result = await supabase.auth.signUp({ email, password });
      if (result.error) throw result.error;
      if (result.data?.user) {
        await supabase.from('profiles').upsert({ id: result.data.user.id, screener_data: ans });
        setUser(result.data.user);
        closeAuth();
        if (roadmapData) saveRoadmapToSupabase();
      } else {
        showAuthError('Check your email to confirm your account.');
      }
    } else {
      result = await supabase.auth.signInWithPassword({ email, password });
      if (result.error) throw result.error;
      setUser(result.data.user);
      closeAuth();
    }
  } catch(e) {
    showAuthError(e.message || 'Authentication failed. Please try again.');
  }
  btn.disabled = false;
  btn.textContent = authMode === 'signin' ? 'Sign In' : 'Create Free Account';
}

async function signOut() {
  if (supabase) await supabase.auth.signOut();
  currentUser = null; roadmapData = null; conditions = []; chatHistory = [];
  updateTopbar();
  showView('vLanding');
}

async function saveRoadmapToSupabase() {
  if (!supabase || !currentUser || !roadmapData) return;
  try {
    await supabase.from('profiles').upsert({
      id: currentUser.id, screener_data: ans, roadmap_text: roadmapData
    });
  } catch(e) { console.warn('Save error:', e); }
}

// ── CALC ──
function updateCalc() {
  const rating = parseInt(document.getElementById('calcRating').value);
  const deps = document.getElementById('calcDeps').value;
  const amountEl = document.getElementById('calcAmount');
  const annualEl = document.getElementById('calcAnnual');
  if (!rating || !VA_RATES[rating]) {
    amountEl.textContent = 'Select a rating';
    annualEl.textContent = '';
    return;
  }
  const monthly = VA_RATES[rating][deps] || VA_RATES[rating]['none'];
  const annual = (monthly * 12).toFixed(0);
  amountEl.textContent = '$' + monthly.toFixed(2).replace(/\B(?=(\d{3})+(?!\d))/g, ',');
  annualEl.textContent = '$' + parseInt(annual).toLocaleString() + '/year';
}

// ── SCREENER ──
function startScreener() { currentScreen = 1; showView('vScreener'); goToScreen(1); }

function buildYearSelects() {
  const sy = document.getElementById('profStartYear');
  const ey = document.getElementById('profEndYear');
  if (!sy || !ey) return;
  const now = new Date().getFullYear();
  for (let y = now; y >= 1950; y--) {
    sy.innerHTML += `<option value="${y}">${y}</option>`;
    ey.innerHTML += `<option value="${y}">${y}</option>`;
  }
}

function goToScreen(n) {
  currentScreen = n;
  document.querySelectorAll('.s-screen').forEach(s => s.classList.remove('active'));
  const screen = document.getElementById('ss' + n);
  if (screen) screen.classList.add('active');
  const total = 15;
  const pct = Math.round(((n - 1) / total) * 100);
  document.getElementById('sProgFill').style.width = pct + '%';
  document.getElementById('sStepText').textContent = n <= total ? `Step ${n} of ${total}` : 'Finalizing...';
  document.getElementById('btnBack').disabled = n <= 1;
  document.getElementById('btnNext').textContent = n >= total ? 'Build My Roadmap →' : 'Continue →';
  const sNav = document.getElementById('sNav');
  if (n === 16) { sNav.style.display = 'none'; } else { sNav.style.display = 'flex'; }
  // load dynamic content
  if (n === 5) buildMOSList();
  if (n === 9) buildRatedGrid();
  if (n === 10) buildSymptomGrids();
  if (n === 15) loadFollowups();
}

function nextScreen() {
  if (currentScreen >= 15) { buildRoadmap(); return; }
  goToScreen(currentScreen + 1);
}
function prevScreen() { if (currentScreen > 1) goToScreen(currentScreen - 1); }
function skipScreen() { nextScreen(); }

function pick(el, key) {
  el.closest('.choice-grid').querySelectorAll('.choice-card').forEach(c => c.classList.remove('selected'));
  el.classList.add('selected');
  ans[key] = el.dataset.val;
  if (key === 'component') {
    document.getElementById('reserveNotice').style.display =
      (ans.component === 'Reserve' || ans.component === 'National Guard') ? 'flex' : 'none';
  }
}

function pickMulti(el, key) {
  el.classList.toggle('selected');
  if (!ans[key]) ans[key] = [];
  const val = el.dataset.val;
  const idx = ans[key].indexOf(val);
  if (idx >= 0) ans[key].splice(idx, 1);
  else ans[key].push(val);
}

// ── MOS ──
function buildMOSList() {
  const container = document.getElementById('mosBranchList');
  if (!container || !window.MOS_DATA) return;
  renderMOSItems(container, window.MOS_DATA);
}

function renderMOSItems(container, data) {
  container.innerHTML = '';
  const branch = ans.branch?.[0] || 'Army';
  const list = data[branch] || data['Army'] || [];
  list.slice(0, 15).forEach(m => {
    const el = document.createElement('div');
    el.className = 'mos-item' + (ans.mos?.code === m.code ? ' selected' : '');
    el.innerHTML = `<div class="mos-code">${m.code}</div><div class="mos-label">${m.label||m.title||''}</div><div class="mos-tags">${m.tera?'<span class="mos-tag tag-amber">TERA</span>':''}</div><div class="mos-check">✓</div>`;
    el.onclick = () => selectMOS(el, m);
    container.appendChild(el);
  });
}

function filterMOSList(q) {
  if (!window.MOS_DATA) return;
  const branch = ans.branch?.[0] || 'Army';
  const list = (window.MOS_DATA[branch] || []).filter(m =>
    m.code.toLowerCase().includes(q.toLowerCase()) ||
    m.title.toLowerCase().includes(q.toLowerCase())
  );
  const container = document.getElementById('mosBranchList');
  container.innerHTML = '';
  list.slice(0, 20).forEach(m => {
    const el = document.createElement('div');
    el.className = 'mos-item';
    el.innerHTML = `<div class="mos-code">${m.code}</div><div class="mos-label">${m.label||m.title||''}</div><div class="mos-check">✓</div>`;
    el.onclick = () => selectMOS(el, m);
    container.appendChild(el);
  });
}

function selectMOS(el, m) {
  document.querySelectorAll('.mos-item').forEach(i => i.classList.remove('selected'));
  el.classList.add('selected');
  ans.mos = m;
  const intel = document.getElementById('mosIntel');
  if (!intel) return;
  intel.classList.add('show');
  intel.innerHTML = `<div class="mos-intel-title">⚡ Intelligence Report: ${m.code} — ${m.label||m.title||''}</div>
    <div>${(m.tags||[]).map(t=>`<span class="intel-tag intel-${t==='TERA'?'amber':'blue'}">${t}</span>`).join('')}</div>
    <div class="mos-intel-body">${m.notes || m.intel || 'Your roadmap will detail specific conditions associated with this specialty.'}</div>`;
}

// ── SYMPTOM GRIDS ── (from data.js)
// Use window.APP_SYMPTOMS, window.APP_DIAGNOSES, window.APP_RATED_CONDS

function buildSymptomGrids() {
  buildGrid('symptomGrid', window.APP_SYMPTOMS || [], 'symptoms');
  buildGrid('diagnosisGrid', window.APP_DIAGNOSES || [], 'diagnoses');
}

function buildRatedGrid() {
  buildGrid('ratedCondGrid', window.APP_RATED_CONDS || [], 'ratedConds');
}

function buildGrid(id, items, key) {
  const container = document.getElementById(id);
  if (!container) return;
  container.innerHTML = items.map(item => {
    const lbl = item.label || item.lbl || '';
    const sel = (ans[key]||[]).includes(lbl) ? 'selected' : '';
    const note = item.note ? `<div class="sym-note">${item.note}</div>` : '';
    return `<div class="sym-tile ${sel}" onclick="toggleSymptom(this,'${lbl}','${key}')"><div class="sym-icon">${item.icon}</div><div class="sym-lbl">${lbl}</div>${note}</div>`;
  }).join('');
}

function toggleSymptom(el, val, key) {
  el.classList.toggle('selected');
  if (!ans[key]) ans[key] = [];
  const idx = ans[key].indexOf(val);
  if (idx >= 0) ans[key].splice(idx, 1);
  else ans[key].push(val);
}

// ── FOLLOW-UPS ──
async function loadFollowups() {
  const container = document.getElementById('followupContainer');
  if (!container) return;
  try {
    const prompt = `Based on this veteran's screening:
Branch: ${ans.branch?.join(', ')||'Unknown'}
MOS: ${ans.mos?.code||'Unknown'} ${ans.mos?.title||''}
Deployments: ${ans.deployments?.join(', ')||'None'}
Exposures: ${ans.exposures?.join(', ')||'None'}
Symptoms: ${ans.symptoms?.join(', ')||'None'}
Events: ${ans.events?.join(', ')||'None'}

Generate 3 short, specific follow-up questions that would strengthen their VA disability roadmap. Format as JSON array:
[{"q":"question text","key":"unique_key","type":"yesno|text","placeholder":"optional"}]
Return ONLY the JSON array, nothing else.`;

    const data = await callClaude([{role:'user',content:prompt}], 300);
    const text = data.content?.[0]?.text || '[]';
    const clean = text.replace(/```json|```/g,'').trim();
    const questions = JSON.parse(clean);

    container.innerHTML = questions.map(q => `
      <div style="margin-bottom:16px">
        <div class="f-label">${q.q}</div>
        ${q.type === 'yesno'
          ? `<div class="choice-grid cols-2" style="margin-top:8px">
               <div class="choice-card" data-val="Yes" onclick="pick(this,'followup_${q.key}');ans.followups['${q.key}']='Yes'"><div class="choice-label">Yes</div><div class="choice-check">✓</div></div>
               <div class="choice-card" data-val="No" onclick="pick(this,'followup_${q.key}');ans.followups['${q.key}']='No'"><div class="choice-label">No</div><div class="choice-check">✓</div></div>
             </div>`
          : `<input class="s-input" style="margin-top:8px" placeholder="${q.placeholder||'Your answer...'}" oninput="ans.followups['${q.key}']=this.value">`
        }
      </div>`).join('');
  } catch(e) {
    container.innerHTML = '<div class="alert alert-blue"><span>💡</span><span>Continue to build your roadmap. You can always ask Aylene specific questions later.</span></div>';
  }
}

// ── ROADMAP BUILDER ──
async function buildRoadmap() {
  goToScreen(16);
  const loadingSteps = ['ls1','ls2','ls3','ls4','ls5','ls6'];
  let step = 0;
  const stepInterval = setInterval(() => {
    if (step > 0) { document.getElementById(loadingSteps[step-1])?.classList.add('done'); document.getElementById(loadingSteps[step-1])?.classList.remove('active'); }
    if (step < loadingSteps.length) { document.getElementById(loadingSteps[step])?.classList.add('active'); }
    step++;
    if (step > loadingSteps.length) clearInterval(stepInterval);
  }, 1800);

  const prompt = `You are a VA disability claims expert. Build a comprehensive claim roadmap for this veteran.

VETERAN PROFILE:
- Goal: ${ans.goal}
- Branch: ${ans.branch?.join(', ')}
- Component: ${ans.component}
- Service Dates: ${ans.startYear||'?'}–${ans.endYear||'?'}
- Discharge: ${ans.discharge}
- MOS/Rate: ${ans.mos?.code||'?'} ${ans.mos?.title||''}
- Deployments: ${ans.deployments?.join(', ')||'None listed'}
- Toxic Exposures: ${ans.exposures?.join(', ')||'None listed'}
- Current VA Status: ${ans.vaStatus}
- Already Rated: ${ans.ratedConds?.join(', ')||'None'}
- Reported Symptoms: ${ans.symptoms?.join(', ')||'None'}
- Diagnoses: ${ans.diagnoses?.join(', ')||'None'}
- In-Service Events: ${ans.events?.join(', ')||'None'}
- Evidence on Hand: ${ans.evidence?.join(', ')||'None'}
- Life Impact: ${ans.impact?.join(', ')||'Not specified'}
- Follow-up answers: ${JSON.stringify(ans.followups||{})}

Generate a JSON roadmap in this exact format:
{
  "summary": "2-3 sentence personalized summary of this veteran's claim outlook",
  "totalConditions": number,
  "priority": "direct|secondary|presumptive",
  "conditions": [
    {
      "name": "Condition name",
      "type": "direct|secondary|presumptive|lay",
      "priority": "high|medium|low",
      "nexus": "Specific explanation of how this connects to service",
      "evidence_have": "What they already have",
      "evidence_need": "What they still need",
      "action": "Specific next step",
      "secondaryTo": "Condition name (only for secondary)",
      "cfr": "38 CFR Part 4 diagnostic code if applicable",
      "ratingCriteria": [
        {"pct": 10, "desc": "Plain-language description of what 10% looks like"},
        {"pct": 30, "desc": "..."},
        {"pct": 50, "desc": "..."},
        {"pct": 70, "desc": "...if applicable"}
      ],
      "checks": ["Action step 1", "Action step 2", "Action step 3"]
    }
  ],
  "tdiu": boolean,
  "tdiu_note": "explanation if tdiu applies",
  "pact_note": "PACT Act note if relevant",
  "top_action": "The single most important thing this veteran should do right now"
}

Include 4–10 conditions. Prioritize high-value, winnable claims. Be specific to their MOS and exposures. Return ONLY valid JSON.`;

  try {
    const data = await callClaude([{role:'user',content:prompt}], 2000);
    clearInterval(stepInterval);
    const text = data.content?.[0]?.text || '{}';
    const clean = text.replace(/```json|```/g,'').trim();
    roadmapData = JSON.parse(clean);

    // Build conditions from roadmap
    conditions = roadmapData.conditions?.map((c, i) => ({
      id: 'local-'+i, name: c.name, rating: 0, col: 'todo',
      type: c.type, checks: (c.checks||[]).map(ch=>({text:ch,done:false})),
      nexus: c.nexus, evidence_need: c.evidence_need, action: c.action,
      secondaryTo: c.secondaryTo||'', cfr: c.cfr||'',
      ratingCriteria: c.ratingCriteria||[]
    })) || [];

    if (currentUser) await saveRoadmapToSupabase();
    showView('vApp');
    showPage('roadmap');
    renderRoadmap(roadmapData);
    renderDashboard();
    updateSidebar();
  } catch(e) {
    clearInterval(stepInterval);
    console.error('Roadmap error:', e);
    // fallback
    roadmapData = { summary: 'Your roadmap is ready.', conditions:[], error: e.message };
    showView('vApp');
    showPage('roadmap');
    renderRoadmap(roadmapData);
  }
}

function updateSidebar() {
  if (!roadmapData) return;
  const branch = ans.branch?.[0] || 'Veteran';
  document.getElementById('sbName').textContent = branch + ' Veteran';
  document.getElementById('sbMeta').textContent = `${roadmapData.totalConditions||conditions.length} conditions identified`;
  document.getElementById('sbRating').textContent = conditions.length + ' Claims →';
  document.getElementById('roadmapSub').textContent = `${conditions.length} conditions · Built ${new Date().toLocaleDateString()}`;
}

// ── RENDER ROADMAP ──
function renderRoadmap(data) {
  const el = document.getElementById('roadmapContent');
  if (!el) return;
  if (!data || !data.conditions) { el.innerHTML = '<div class="empty-state">Roadmap could not be generated. Please retry.</div>'; return; }

  const typeColors = { direct:'#002855', secondary:'#0076CE', presumptive:'#6D28D9', lay:'#16A34A' };
  const typeLabels = { direct:'Direct Service', secondary:'Secondary', presumptive:'Presumptive', lay:'Lay Evidence' };

  const high = data.conditions.filter(c=>c.priority==='high');
  const mid = data.conditions.filter(c=>c.priority==='medium');
  const low = data.conditions.filter(c=>c.priority==='low'||!c.priority);

  let html = `
    <div class="rm-hero">
      <div style="font-size:40px">🎯</div>
      <div>
        <div class="rm-hero-tag">Your Personalized Blueprint</div>
        <div class="rm-hero-title">${data.conditions.length} Conditions Identified</div>
        <div class="rm-hero-sub">${data.summary||''}</div>
      </div>
    </div>
    <div class="legend-bar">
      <span class="legend-label">Claim Type:</span>
      <span class="legend-item"><span class="legend-dot" style="background:#002855"></span>Direct Service</span>
      <span class="legend-item"><span class="legend-dot" style="background:#0076CE"></span>Secondary</span>
      <span class="legend-item"><span class="legend-dot" style="background:#6D28D9"></span>Presumptive</span>
      <span class="legend-item"><span class="legend-dot" style="background:#16A34A"></span>Lay Evidence</span>
    </div>`;

  if (data.pact_note) html += `<div class="alert alert-amber"><span>⚠️</span><span><strong>PACT Act:</strong> ${data.pact_note}</span></div>`;
  if (data.tdiu) html += `<div class="alert alert-green"><span>💡</span><span><strong>TDIU Opportunity:</strong> ${data.tdiu_note||'You may qualify for Total Disability based on Individual Unemployability.'}</span></div>`;

  const renderGroup = (conds, label) => {
    if (!conds.length) return '';
    return `<div class="rm-section-hdr">${label}</div>` + conds.map(c => renderCondCard(c, typeColors, typeLabels)).join('');
  };

  html += renderGroup(high, '🔴 High Priority');
  html += renderGroup(mid, '🟡 Medium Priority');
  html += renderGroup(low, '🔵 Lower Priority');

  if (data.top_action) {
    html += `<div class="rm-action-bar">
      <div style="font-size:28px">⚡</div>
      <div style="flex:1">
        <div class="rm-action-text">Your #1 Next Action</div>
        <div class="rm-action-sub">${data.top_action}</div>
      </div>
      <button class="btn btn-gold" onclick="requireAuth(()=>showPage('chat'))">💬 Ask Aylene</button>
    </div>`;
  }

  html += `<div class="rm-gate-notice" id="roadmapGate">🔒 <strong>Create a free account</strong> to save this roadmap, print it, and chat with Aylene. <button class="btn btn-primary" style="margin-left:12px" onclick="openAuth('signup')">Save My Roadmap →</button></div>`;

  el.innerHTML = html;
  if (currentUser) document.getElementById('roadmapGate')?.remove();
  updateSidebar();
}

function renderCondCard(c, typeColors, typeLabels) {
  const color = typeColors[c.type] || '#002855';
  const label = typeLabels[c.type] || c.type;
  return `
  <div class="cond-card">
    <div class="cond-card-hdr lborder-${c.type}" onclick="toggleCondBody(this)">
      <div style="flex:1">
        <div class="cond-name">${c.name}</div>
        <span class="cond-pri-badge badge-${c.type}">${label}</span>
        ${c.secondaryTo ? `<span style="font-size:11px;color:var(--text-sec);margin-left:6px">↳ Secondary to ${c.secondaryTo}</span>` : ''}
        ${c.cfr ? `<span style="font-size:10px;color:var(--text-hint);margin-left:8px">${c.cfr}</span>` : ''}
      </div>
      <div class="cond-toggle">▼</div>
    </div>
    <div class="cond-body">
      <div class="ele-grid">
        ${c.nexus ? `<div class="ele-row ele-row-blue"><div class="ele-label b">NEXUS</div><div class="ele-val">${c.nexus}</div></div>` : ''}
        ${c.evidence_have ? `<div class="ele-row ele-row-green"><div class="ele-label g">HAVE</div><div class="ele-val">${c.evidence_have}</div></div>` : ''}
        ${c.evidence_need ? `<div class="ele-row ele-row-red"><div class="ele-label r">NEED</div><div class="ele-val">${c.evidence_need}</div></div>` : ''}
        ${c.action ? `<div class="ele-row ele-row-blue"><div class="ele-label b">ACTION</div><div class="ele-val">${c.action}</div></div>` : ''}
      </div>
      ${c.ratingCriteria?.length ? `
      <div class="rating-criteria">
        <div class="rating-criteria-hdr">📊 VA Rating Criteria (38 CFR Part 4) — Read and interpret based on your symptoms</div>
        ${c.ratingCriteria.map(r => `<div class="rating-row"><div class="r-pct">${r.pct}%</div><div class="r-desc">${r.desc}</div></div>`).join('')}
      </div>` : ''}
    </div>
  </div>`;
}

function toggleCondBody(hdr) {
  const body = hdr.nextElementSibling;
  body?.classList.toggle('open');
  hdr.querySelector('.cond-toggle').textContent = body?.classList.contains('open') ? '▲' : '▼';
}

// ── DASHBOARD ──
function renderDashboard() {
  const el = document.getElementById('dashContent');
  if (!el) return;
  if (!conditions.length) { el.innerHTML = '<div class="empty-state"><div style="font-size:36px;margin-bottom:10px">📊</div>Complete your screener to activate your dashboard.</div>'; return; }

  const branch = ans.branch?.[0] || 'Unknown';
  const mos = ans.mos?.title || 'Unknown MOS';
  const start = ans.startYear || '?';
  const end = ans.endYear || 'Present';
  const estimated = Math.min(conditions.length * 12, 90);

  let html = `
  <div class="dash-hero">
    <div class="dash-hero-top">
      <div>
        <div class="dash-branch-tag">🎖️ ${branch.toUpperCase()}</div>
        <div class="dash-vet-name">${branch} Veteran</div>
        <div class="dash-vet-meta">${mos} · ${start}–${end} · ${ans.component||''}</div>
      </div>
    </div>
    <div class="dash-stats-row">
      <div><div class="dash-stat-val">${conditions.length}</div><div class="dash-stat-lbl">Conditions</div></div>
      <div><div class="dash-stat-val">${conditions.filter(c=>c.col==='won').length}</div><div class="dash-stat-lbl">Won</div></div>
      <div><div class="dash-stat-val">${estimated}%</div><div class="dash-stat-lbl">Est. Max Rating</div></div>
    </div>
  </div>

  <div class="gauge-section">
    <div class="gauge-card">
      <div class="gauge-title">Combined Rating Potential</div>
      <div class="gauge-wrap">
        <svg class="gauge-svg" viewBox="0 0 200 110">
          <path d="M 10 100 A 90 90 0 0 1 190 100" fill="none" stroke="#E5E7EB" stroke-width="18" stroke-linecap="round"/>
          <path d="M 10 100 A 90 90 0 0 1 190 100" fill="none" stroke="#002855" stroke-width="18" stroke-linecap="round"
            stroke-dasharray="${Math.PI * 90 * estimated / 100} ${Math.PI * 90}" />
          <path d="M 10 100 A 90 90 0 0 1 190 100" fill="none" stroke="#C9A84C" stroke-width="18" stroke-linecap="round" stroke-opacity="0.25"/>
        </svg>
        <div class="gauge-center-val"><div class="gauge-pct">${estimated}%</div><div class="gauge-pct-label">Estimated</div></div>
      </div>
      <div class="gauge-legend">
        <div class="gauge-legend-item"><div class="gauge-legend-dot" style="background:#002855"></div>Current</div>
        <div class="gauge-legend-item"><div class="gauge-legend-dot" style="background:#C9A84C"></div>Potential</div>
      </div>
    </div>
    <div class="service-profile">
      <div class="sp-header"><div class="sp-title">Service Profile</div></div>
      <div class="sp-grid">
        <div class="sp-item"><div class="sp-item-label">Branch</div><div class="sp-item-val">${branch}</div></div>
        <div class="sp-item"><div class="sp-item-label">Component</div><div class="sp-item-val ${!ans.component?'empty':''}">${ans.component||'Not specified'}</div></div>
        <div class="sp-item"><div class="sp-item-label">MOS / Rate</div><div class="sp-item-val ${!ans.mos?.code?'empty':''}">${ans.mos?.code ? ans.mos.code+' — '+ans.mos.title : 'Not specified'}</div></div>
        <div class="sp-item"><div class="sp-item-label">Service Dates</div><div class="sp-item-val">${start} – ${end}</div></div>
        <div class="sp-item"><div class="sp-item-label">Discharge</div><div class="sp-item-val ${!ans.discharge?'empty':''}">${ans.discharge||'Not specified'}</div></div>
        <div class="sp-item"><div class="sp-item-label">Deployments</div><div class="sp-item-val ${!ans.deployments?.length?'empty':''}">${ans.deployments?.join(', ')||'None listed'}</div></div>
      </div>
    </div>
  </div>

  <div class="card">
    <div class="card-hdr"><div class="card-title">Claim Kanban</div></div>
    <div class="card-body">
      <div class="kanban">
        ${renderKanbanCol('todo','📋 To Do','gray')}
        ${renderKanbanCol('inprog','🔄 In Progress','amber')}
        ${renderKanbanCol('filed','📮 Filed','sky')}
        ${renderKanbanCol('won','✅ Won','green')}
      </div>
    </div>
  </div>`;

  el.innerHTML = html;
}

function renderKanbanCol(status, title, color) {
  const conds = conditions.filter(c => c.col === status);
  return `<div class="kanban-col kcol-${status}">
    <div class="kanban-col-hdr">
      <div class="kanban-col-title">${title}</div>
      <div class="kanban-col-count">${conds.length}</div>
    </div>
    ${conds.map(c => renderKcard(c)).join('')}
    ${!conds.length ? `<div style="font-size:12px;color:var(--text-hint);text-align:center;padding:16px">No conditions yet</div>` : ''}
  </div>`;
}

function renderKcard(c) {
  const total = c.checks?.length || 0;
  const done = c.checks?.filter(ch => ch.done)?.length || 0;
  const pct = total ? Math.round((done / total) * 100) : 0;
  const colMap = { direct:'#002855', secondary:'#0076CE', presumptive:'#6D28D9', lay:'#16A34A' };
  const col = colMap[c.type] || '#9CA3AF';
  return `<div class="kcard">
    <div class="kcard-name">${c.name}</div>
    <span class="kcard-basis" style="background:${col}20;color:${col}">${c.type||'direct'}</span>
    ${total > 0 ? `
    <div class="kcard-progress"><div class="kcard-prog-fill" style="width:${pct}%;background:${col}"></div></div>
    <div class="kcard-meta"><span>${done}/${total} steps</span><span>${pct}%</span></div>` : ''}
    ${total > 0 ? `<div class="kcard-checks">${(c.checks||[]).map((ch,i) => `
      <div class="check-item ${ch.done?'checked':''}" onclick="toggleCheck('${c.id}',${i})">
        <div class="check-box">${ch.done?'✓':''}</div>
        <div class="check-text">${ch.text}</div>
      </div>`).join('')}</div>` : ''}
    ${c.col !== 'won' ? `<button class="kbtn-advance" onclick="advanceCondition('${c.id}')" style="margin-top:8px">Advance →</button>` : ''}
  </div>`;
}

function toggleCheck(condId, checkIdx) {
  const c = conditions.find(c => c.id === condId);
  if (c?.checks?.[checkIdx]) {
    c.checks[checkIdx].done = !c.checks[checkIdx].done;
    renderDashboard();
    saveConditions();
  }
}

function advanceCondition(condId) {
  const c = conditions.find(c => c.id === condId);
  if (!c) return;
  const flow = ['todo','inprog','filed','won'];
  const idx = flow.indexOf(c.col);
  if (idx < flow.length - 1) c.col = flow[idx + 1];
  renderDashboard();
  saveConditions();
}

async function saveConditions() {
  if (!supabase || !currentUser) return;
  try {
    for (const c of conditions) {
      if (c.id?.startsWith('local-')) {
        const { data } = await supabase.from('claims').insert({
          user_id: currentUser.id, name: c.name, rating: c.rating||0,
          col: c.col, type: c.type, checks: c.checks
        }).select().single();
        if (data) c.id = data.id;
      } else {
        await supabase.from('claims').update({ col: c.col, checks: c.checks, rating: c.rating }).eq('id', c.id);
      }
    }
  } catch(e) { console.warn('Save conditions error:', e); }
}

function openAddModal() {
  document.getElementById('addCondName').value = '';
  document.getElementById('addCondNotes').value = '';
  document.getElementById('addModal').classList.add('active');
}

function closeModal(id) { document.getElementById(id)?.classList.remove('active'); }

function addCondition() {
  const name = document.getElementById('addCondName').value.trim();
  if (!name) { alert('Please enter a condition name.'); return; }
  const type = document.getElementById('addCondBasis').value;
  const status = document.getElementById('addCondStatus').value;
  conditions.push({
    id: 'local-' + Date.now(), name, type, col: status,
    checks: [
      {text:'Get current diagnosis from doctor',done:false},
      {text:'Gather supporting evidence',done:false},
      {text:'Write personal statement',done:false},
    ]
  });
  closeModal('addModal');
  renderDashboard();
  renderTrackerTable();
  saveConditions();
}

// ── TRACKER TABLE ──
function renderTrackerTable() {
  const tbody = document.getElementById('trackerTableBody');
  if (!tbody) return;
  if (!conditions.length) { tbody.innerHTML = '<tr><td colspan="6" class="empty-state">No conditions added yet.</td></tr>'; return; }
  const colLabels = { todo:'To Do', inprog:'In Progress', filed:'Filed', won:'Won ✅' };
  tbody.innerHTML = conditions.map(c => `
    <tr>
      <td><strong>${c.name}</strong></td>
      <td><span style="font-size:11px;padding:2px 7px;border-radius:3px;background:#dbeafe;color:#002855">${c.type||'direct'}</span></td>
      <td>–</td>
      <td>${c.evidence_need||'–'}</td>
      <td>${colLabels[c.col]||c.col}</td>
      <td><button class="btn btn-outline" style="padding:4px 10px;font-size:11px" onclick="requireAuth(()=>showPage('dashboard'))">View</button></td>
    </tr>`).join('');
}

// ── AYLENE CHAT ──
const AYLENE_SYSTEM = `You are Aylene, a 25-year-old U.S. Army veteran and VA disability claims advisor.

PERSONALITY:
- Warm, calm, and deeply caring about veterans
- Soft-spoken but confident and extremely knowledgeable
- Gen Z energy — direct, real, no corporate fluff
- Shy about your own service; never brag about yourself
- Keep focus entirely on the veteran you're helping
- Passionate advocate; this is your calling, not just a job

EXPERTISE:
- VA disability claims process, C-file requests, rating schedules
- 38 CFR Part 4, nexus letters, C&P exam preparation
- TDIU, SMC, appeals (RAMP, BVA, CAVC)
- PACT Act, burn pit presumptives, Agent Orange
- Secondary conditions, mental health claims, MST claims

COMMUNICATION STYLE:
- Conversational, never clinical or robotic
- Use first-person and address the veteran directly
- Short-to-medium responses unless detail is truly needed
- Cite 38 CFR when helpful but explain it in plain language
- Never guess — say "I'd want to look into that more" when uncertain

WHAT YOU DO NOT DO:
- Never estimate someone's rating — show criteria, let them interpret
- Never give legal advice or represent yourself as a lawyer
- Never discuss anything unrelated to veterans benefits
- Never talk about yourself extensively`;

const AYLENE_AVATAR_SVG = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 80 80" style="width:100%;height:100%">
  <circle cx="40" cy="40" r="40" fill="#E8F4FD"/>
  <ellipse cx="40" cy="52" rx="20" ry="14" fill="#FFDDB4"/>
  <circle cx="40" cy="32" r="18" fill="#FFDDB4"/>
  <ellipse cx="30" cy="30" rx="4" ry="5" fill="white"/>
  <ellipse cx="50" cy="30" rx="4" ry="5" fill="white"/>
  <circle cx="30" cy="31" r="2.5" fill="#002855"/>
  <circle cx="50" cy="31" r="2.5" fill="#002855"/>
  <path d="M36 38 Q40 41 44 38" stroke="#C9A84C" stroke-width="1.5" fill="none" stroke-linecap="round"/>
  <path d="M22 28 Q25 22 32 23" stroke="#3B2314" stroke-width="2.5" fill="none" stroke-linecap="round"/>
  <path d="M48 23 Q55 22 58 28" stroke="#3B2314" stroke-width="2.5" fill="none" stroke-linecap="round"/>
  <path d="M26 20 Q40 8 54 20 Q54 12 40 10 Q26 12 26 20" fill="#3B2314"/>
  <path d="M24 24 Q26 14 40 12 Q54 14 56 24 Q50 18 40 18 Q30 18 24 24" fill="#5C3D2E"/>
</svg>`;

function renderAyleneAvatar() {
  document.querySelectorAll('.aylene-avatar, #ayleneAvTop').forEach(el => {
    el.innerHTML = AYLENE_AVATAR_SVG;
  });
}

function initChat() {
  renderAyleneAvatar();
  const msgs = document.getElementById('chatMsgs');
  if (!msgs) return;
  msgs.innerHTML = '';
  chatHistory = [];
  // brief intro with slight delay
  setTimeout(() => {
    const intro = `Hey. I'm Aylene. Here to help with your VA claim — ask me anything.`;
    appendMsg('ai', intro);
    chatHistory.push({ role: 'assistant', content: intro });
  }, 800);
}

function clearChat() { chatHistory = []; initChat(); }

function appendMsg(role, text) {
  const msgs = document.getElementById('chatMsgs');
  if (!msgs) return;
  const div = document.createElement('div');
  div.className = 'msg ' + (role === 'user' ? 'user' : 'ai');
  if (role === 'ai') {
    div.innerHTML = `<div class="msg-av-aylene">${AYLENE_AVATAR_SVG}</div><div class="msg-bub">${text.replace(/\n/g,'<br>')}</div>`;
  } else {
    const init = (currentUser?.email?.[0]||'V').toUpperCase();
    div.innerHTML = `<div class="msg-av-user">${init}</div><div class="msg-bub">${text}</div>`;
  }
  msgs.appendChild(div);
  msgs.scrollTop = msgs.scrollHeight;
}

function showTyping() {
  const msgs = document.getElementById('chatMsgs');
  if (!msgs) return;
  const div = document.createElement('div');
  div.className = 'msg ai'; div.id = 'typingIndicator';
  div.innerHTML = `<div class="msg-av-aylene">${AYLENE_AVATAR_SVG}</div><div class="msg-bub"><div class="t-dot-wrap"><div class="t-dot"></div><div class="t-dot"></div><div class="t-dot"></div></div></div>`;
  msgs.appendChild(div);
  msgs.scrollTop = msgs.scrollHeight;
}

function hideTyping() { document.getElementById('typingIndicator')?.remove(); }

async function sendMessage() {
  const input = document.getElementById('chatInput');
  const text = input.value.trim();
  if (!text) return;
  input.value = ''; autoResize(input);
  document.getElementById('sendBtn').disabled = true;
  appendMsg('user', text);
  chatHistory.push({ role: 'user', content: text });

  // Aylene delay: 2–7 seconds (she doesn't type instantly)
  const delay = 2000 + Math.random() * 5000;
  await new Promise(r => setTimeout(r, delay));
  showTyping();

  const context = roadmapData
    ? `\nVeteran context: Branch ${ans.branch?.join(',')}, MOS ${ans.mos?.code||'?'} ${ans.mos?.title||''}, Conditions: ${conditions.map(c=>c.name).join(', ')}`
    : '';

  try {
    const messages = [
      ...chatHistory.slice(-8),
    ];
    const data = await callClaude(messages, 600, AYLENE_SYSTEM + context);
    hideTyping();
    const reply = data.content?.[0]?.text || "I'm having trouble right now. Try again in a moment.";
    appendMsg('ai', reply);
    chatHistory.push({ role: 'assistant', content: reply });
  } catch(e) {
    hideTyping();
    appendMsg('ai', "Sorry, I'm having trouble connecting right now. Try again in a moment.");
  }
  document.getElementById('sendBtn').disabled = false;
}

function handleChatKey(e) {
  if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendMessage(); }
}

function autoResize(el) {
  el.style.height = 'auto';
  el.style.height = Math.min(el.scrollHeight, 110) + 'px';
}

// ── RECORDS ──
function handleFileSelect(e) {
  Array.from(e.target.files).forEach(file => {
    uploadedFiles.push({ file, id: Date.now() + Math.random() });
    renderFiles();
  });
}

function renderFiles() {
  const list = document.getElementById('fileList');
  if (!list) return;
  list.innerHTML = uploadedFiles.map(f => {
    const size = (f.file.size / 1024 / 1024).toFixed(1);
    const icon = f.file.type.includes('pdf') ? '📄' : f.file.type.includes('image') ? '🖼️' : '📁';
    return `<div class="file-item">
      <div class="file-item-icon">${icon}</div>
      <div style="flex:1"><div class="file-item-name">${f.file.name}</div><div class="file-item-size">${size} MB</div></div>
      <span class="badge-ready">Ready</span>
      <button class="btn-remove-file" onclick="removeFile('${f.id}')">✕</button>
    </div>`;
  }).join('');
}

function removeFile(id) {
  uploadedFiles = uploadedFiles.filter(f => f.id != id);
  renderFiles();
}

// Drag-drop
document.addEventListener('DOMContentLoaded', () => {
  const zone = document.getElementById('uploadZone');
  if (!zone) return;
  zone.addEventListener('dragover', e => { e.preventDefault(); zone.classList.add('drag-over'); });
  zone.addEventListener('dragleave', () => zone.classList.remove('drag-over'));
  zone.addEventListener('drop', e => {
    e.preventDefault(); zone.classList.remove('drag-over');
    Array.from(e.dataTransfer.files).forEach(file => {
      uploadedFiles.push({ file, id: Date.now() + Math.random() });
    });
    renderFiles();
  });
});

// ── REGULATIONS ──
const REGS = [
  {
    group: 'Service Connection',
    items: [
      { code: '38 CFR § 3.303', title: 'Direct Service Connection', content: `
        <p class="reg-intro">Direct service connection means your condition was caused or aggravated by something that happened during your military service.</p>
        <h3>The Three Elements</h3>
        <div class="reg-list">
          <div class="reg-item"><div class="reg-num">1</div><div>A current, diagnosed condition</div></div>
          <div class="reg-item"><div class="reg-num">2</div><div>An in-service event, injury, or disease</div></div>
          <div class="reg-item"><div class="reg-num">3</div><div>A medical nexus (link) between the two</div></div>
        </div>
        <h3>Important Points</h3>
        <ul class="reg-bullets">
          <li>You don't need a continuous chain of treatment records</li>
          <li>A nexus letter from a private doctor can provide the medical link</li>
          <li>Lay statements (yours and buddy statements) are valid evidence</li>
          <li>The benefit of the doubt goes to the veteran when evidence is roughly equal</li>
        </ul>` },
      { code: '38 CFR § 3.310', title: 'Secondary Service Connection', content: `
        <p class="reg-intro">A condition is secondary if it was caused or aggravated by a condition that is already service-connected.</p>
        <h3>Two Types</h3>
        <div class="reg-list">
          <div class="reg-item"><div class="reg-num">1</div><div><strong>Causation:</strong> The service-connected condition directly caused the new condition</div></div>
          <div class="reg-item"><div class="reg-num">2</div><div><strong>Aggravation:</strong> The service-connected condition worsened a pre-existing condition beyond its natural progression</div></div>
        </div>
        <h3>Common Secondary Claims</h3>
        <ul class="reg-bullets">
          <li>PTSD → Depression, Sleep Apnea, Substance Use</li>
          <li>Knee injury → Hip / Back conditions</li>
          <li>Diabetes → Peripheral neuropathy, eye conditions</li>
          <li>Hypertension → Heart disease, erectile dysfunction</li>
        </ul>` },
      { code: '38 CFR § 3.307/3.309', title: 'Presumptive Service Connection', content: `
        <p class="reg-intro">For certain conditions and service types, VA presumes service connection — you don't need to prove the link.</p>
        <h3>Key Presumptive Categories</h3>
        <ul class="reg-bullets">
          <li><strong>PACT Act (2022):</strong> 23+ cancers and 11 respiratory conditions for burn pit veterans</li>
          <li><strong>Agent Orange:</strong> 14 conditions for Vietnam-era veterans</li>
          <li><strong>Gulf War Illness:</strong> Undiagnosed conditions for SWA veterans post-8/2/1990</li>
          <li><strong>Camp Lejeune:</strong> 8 conditions for veterans who served 1953–1987</li>
          <li><strong>ALS:</strong> Any veteran who served 90+ days active duty</li>
        </ul>` },
    ]
  },
  {
    group: 'Rating Schedule',
    items: [
      { code: '38 CFR Part 4', title: 'VA Rating Schedule Overview', content: `
        <p class="reg-intro">The VA rates disabilities on a scale of 0%, 10%, 20%, 30%, 40%, 50%, 60%, 70%, 80%, 90%, or 100% based on the severity of symptoms.</p>
        <h3>Key Principles</h3>
        <ul class="reg-bullets">
          <li>Ratings are based on average impairment in earning capacity, not your personal situation</li>
          <li>The examiner uses a C&P exam to assess severity — your job is to describe your worst days</li>
          <li>A 0% rating means service connection is granted but symptoms don't meet the minimum threshold</li>
          <li>Combined ratings use the "VA math" whole-person method — never just add percentages</li>
        </ul>
        <h3>The Benefit of the Doubt Rule</h3>
        <p>When evidence for and against a claim is approximately equal, VA must resolve the issue in your favor. This is one of the most important principles in VA law.</p>` },
      { code: '38 CFR § 4.16', title: 'TDIU — Total Disability (Individual Unemployability)', content: `
        <p class="reg-intro">TDIU allows you to receive 100% compensation even if your combined rating is below 100%, if your disabilities prevent substantially gainful employment.</p>
        <h3>Eligibility Thresholds</h3>
        <div class="reg-list">
          <div class="reg-item"><div class="reg-num">1</div><div>Single disability rated at 60%+ (§ 4.16(a))</div></div>
          <div class="reg-item"><div class="reg-num">2</div><div>Combined rating of 70%+ with at least one disability at 40% (§ 4.16(a))</div></div>
          <div class="reg-item"><div class="reg-num">3</div><div>Extraschedular TDIU if you don't meet the above but are still unemployable (§ 4.16(b))</div></div>
        </div>` },
    ]
  },
  {
    group: 'Claims Process',
    items: [
      { code: '38 CFR § 3.159', title: 'VA Duty to Assist', content: `
        <p class="reg-intro">VA has a legal duty to help you develop your claim — including obtaining records and providing examinations.</p>
        <h3>VA Must:</h3>
        <ul class="reg-bullets">
          <li>Request relevant records from federal agencies (STRs, SSA, etc.)</li>
          <li>Request records from non-federal sources if you give authorization</li>
          <li>Provide a medical examination (C&P exam) when it's needed to decide your claim</li>
          <li>Notify you of what evidence is needed and give you time to submit it</li>
        </ul>` },
      { code: '38 CFR § 20.101', title: 'Appeals — Board of Veterans Appeals', content: `
        <p class="reg-intro">If VA denies your claim or rates it too low, you have multiple appeal paths.</p>
        <h3>Three Appeal Lanes</h3>
        <div class="reg-list">
          <div class="reg-item"><div class="reg-num">1</div><div><strong>Supplemental Claim:</strong> Submit new and relevant evidence. VA re-adjudicates.</div></div>
          <div class="reg-item"><div class="reg-num">2</div><div><strong>Higher-Level Review:</strong> Senior reviewer looks for clear error in the original decision.</div></div>
          <div class="reg-item"><div class="reg-num">3</div><div><strong>BVA Appeal:</strong> Board of Veterans Appeals. Choose direct review, evidence submission, or hearing.</div></div>
        </div>` },
    ]
  }
];

function buildRegsTree() {
  const tree = document.getElementById('regsTree');
  if (!tree || tree.children.length > 0) return;
  tree.innerHTML = REGS.map((grp, gi) => `
    <div class="tree-grp-hdr ${gi===0?'open':''}" onclick="toggleTreeGroup(this)">
      <span class="tree-chevron">▶</span> ${grp.group}
    </div>
    <div class="tree-items ${gi===0?'open':''}">
      ${grp.items.map((item, ii) => `
        <div class="tree-item" onclick="showReg(${gi},${ii})">${item.title}<div class="tree-code">${item.code}</div></div>
      `).join('')}
    </div>`).join('');
}

function toggleTreeGroup(hdr) {
  hdr.classList.toggle('open');
  hdr.nextElementSibling?.classList.toggle('open');
}

function showReg(gi, ii) {
  document.querySelectorAll('.tree-item').forEach(i => i.classList.remove('active'));
  const grp = REGS[gi];
  const item = grp?.items?.[ii];
  if (!item) return;
  document.querySelectorAll('.tree-item')[gi * 10 + ii]?.classList.add('active');
  document.getElementById('regsTitle').textContent = item.title;
  document.getElementById('regsCode').textContent = item.code;
  document.getElementById('regsBody').innerHTML = item.content;
}

function filterRegs(q) {
  const lower = q.toLowerCase();
  document.querySelectorAll('.tree-item').forEach(el => {
    el.style.display = el.textContent.toLowerCase().includes(lower) ? '' : 'none';
  });
}

async function askAboutReg() {
  const input = document.getElementById('regsAskInput');
  const question = input.value.trim();
  if (!question) return;
  input.value = '';
  const title = document.getElementById('regsTitle').textContent;
  showPage('chat');
  if (chatHistory.length === 0) initChat();
  setTimeout(() => {
    document.getElementById('chatInput').value = `About ${title}: ${question}`;
    sendMessage();
  }, 500);
}

// ── CLAUDE API ──
async function callClaude(messages, maxTokens = 1000, system = '') {
  const body = { model: CLAUDE_MODEL, max_tokens: maxTokens, messages };
  if (system) body.system = system;
  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': CLAUDE_KEY,
      'anthropic-version': '2023-06-01',
      'anthropic-dangerous-direct-browser-access': 'true'
    },
    body: JSON.stringify(body)
  });
  if (!res.ok) throw new Error(`Claude API error: ${res.status}`);
  return await res.json();
}
