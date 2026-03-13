/* =====================================================
   MISSION: CONNECTED — APP.JS v2
   Supabase + Claude AI + Full Rebuild
===================================================== */

// ── SUPABASE ──
const SB_URL = 'https://zspkgvodkyjhclzmyclu.supabase.co';
const SB_KEY = 'sb_publishable_D45XBwx8QPl6yLe8EIWM3Q_yG2e1kzJ';
const CLAUDE_KEY = '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';
const CLAUDE_MODEL = 'claude-sonnet-4-6';

let sbClient = null;
try { sbClient = window.supabase.createClient(SB_URL, SB_KEY); } catch(e) { console.warn('Supabase init failed'); }

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
let activityLog = [];
let undoStack = [];
let notesData = { entries: [], story: { event:[], impact:[], treatment:[], priority:[] } };
let networkOk = null;

// ── NOTES ENTRY LOG SYSTEM ──
function addNoteEntry() {
  const ta = document.getElementById('noteCompose');
  const text = ta?.value?.trim();
  if (!text) return;
  const entry = { id: Date.now(), text, ts: new Date().toISOString() };
  notesData.entries.unshift(entry);
  ta.value = '';
  persistNotes();
  renderNoteLog();
  logActivity('note_added', `📝 Note added`);
}

function addStoryEntry(category) {
  const ta = document.getElementById('sq-' + category);
  const text = ta?.value?.trim();
  if (!text) return;
  const entry = { id: Date.now(), text, ts: new Date().toISOString() };
  if (!notesData.story[category]) notesData.story[category] = [];
  notesData.story[category].unshift(entry);
  ta.value = '';
  persistNotes();
  renderStoryLog(category);
  logActivity('story_entry_added', `📖 Service story entry added`);
}

function deleteNoteEntry(id) {
  notesData.entries = notesData.entries.filter(e => e.id !== id);
  persistNotes(); renderNoteLog();
}

function deleteStoryEntry(category, id) {
  notesData.story[category] = (notesData.story[category] || []).filter(e => e.id !== id);
  persistNotes(); renderStoryLog(category);
}

function renderNoteLog() {
  const el = document.getElementById('noteLog');
  if (!el) return;
  if (!notesData.entries.length) {
    el.innerHTML = '<div class="notes-empty">No notes yet. Add your first one above.</div>';
    return;
  }
  el.innerHTML = notesData.entries.map(e => `
    <div class="note-entry">
      <div class="note-entry-text">${e.text.replace(/\n/g,'<br>')}</div>
      <div class="note-entry-footer">
        <span class="note-entry-ts">${formatNoteTs(e.ts)}</span>
        <button class="btn-note-del" onclick="deleteNoteEntry(${e.id})" title="Delete">✕</button>
      </div>
    </div>`).join('');
}

function renderStoryLog(category) {
  const el = document.getElementById('slog-' + category);
  if (!el) return;
  const entries = notesData.story[category] || [];
  if (!entries.length) { el.innerHTML = ''; return; }
  el.innerHTML = entries.map(e => `
    <div class="note-entry story-entry">
      <div class="note-entry-text">${e.text.replace(/\n/g,'<br>')}</div>
      <div class="note-entry-footer">
        <span class="note-entry-ts">${formatNoteTs(e.ts)}</span>
        <button class="btn-note-del" onclick="deleteStoryEntry('${category}',${e.id})" title="Delete">✕</button>
      </div>
    </div>`).join('');
}

function formatNoteTs(iso) {
  const d = new Date(iso);
  return d.toLocaleDateString([], {month:'short',day:'numeric'}) + ' · ' + d.toLocaleTimeString([], {hour:'2-digit',minute:'2-digit'});
}

function persistNotes() {
  try { localStorage.setItem('mc_notes_v2', JSON.stringify(notesData)); } catch(e) {}
  if (currentUser && sbClient) {
    sbClient.from('profiles').upsert({ id: currentUser.id, notes: notesData }).catch(e => console.warn('Notes save:', e));
  }
}

function loadNotes() {
  try {
    const saved = localStorage.getItem('mc_notes_v2');
    if (saved) notesData = JSON.parse(saved);
  } catch(e) {}
  renderNoteLog();
  ['event','impact','treatment','priority'].forEach(renderStoryLog);
}

// Build notes context for Aylene
function buildNotesContext() {
  const parts = [];
  if (notesData.entries.length) parts.push('Notes: ' + notesData.entries.slice(0,5).map(e=>e.text).join(' | '));
  const story = notesData.story;
  if (story.event?.length) parts.push('In-service events: ' + story.event.slice(0,3).map(e=>e.text).join(' | '));
  if (story.impact?.length) parts.push('Daily impact: ' + story.impact.slice(0,2).map(e=>e.text).join(' | '));
  if (story.treatment?.length) parts.push('Treatment: ' + story.treatment.slice(0,2).map(e=>e.text).join(' | '));
  if (story.priority?.length) parts.push('Priority context: ' + story.priority.slice(0,2).map(e=>e.text).join(' | '));
  return parts.length ? '\n\nVeteran context notes:\n' + parts.join('\n') : '';
}

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
  setTimeout(checkNetworkStatus, 2000); // Check after page loads
  setInterval(checkNetworkStatus, 5 * 60 * 1000); // Re-check every 5 minutes
});

async function checkAuthState() {
  if (!sbClient) return;
  const { data: { session } } = await sbClient.auth.getSession();
  if (session?.user) setUser(session.user);
  sbClient.auth.onAuthStateChange((event, session) => {
    if (session?.user) setUser(session.user);
    else { currentUser = null; updateTopbar(); }
  });
}

// ── NETWORK STATUS ──
async function checkNetworkStatus() {
  const dot = document.getElementById('netDot');
  const label = document.getElementById('netLabel');
  if (!dot || !label) return;
  dot.style.background = '#F59E0B';
  label.textContent = 'Checking...';
  try {
    // Ping Claude API with minimal request
    const res = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: { 'Content-Type':'application/json','x-api-key':CLAUDE_KEY,'anthropic-version':'2023-06-01','anthropic-dangerous-direct-browser-access':'true' },
      body: JSON.stringify({ model: CLAUDE_MODEL, max_tokens: 5, messages: [{role:'user',content:'hi'}] })
    });
    networkOk = res.ok || res.status === 529; // 529 = overloaded but reachable
    const sbOk = !!sbClient;
    if (res.ok) {
      dot.style.background = '#16A34A'; label.textContent = 'Online';
    } else if (res.status === 429) {
      dot.style.background = '#F59E0B'; label.textContent = 'Rate Limited';
    } else if (res.status === 529) {
      dot.style.background = '#F59E0B'; label.textContent = 'Overloaded';
    } else {
      dot.style.background = '#DC2626'; label.textContent = 'AI Offline';
    }
    if (!sbOk) { dot.style.background = '#F59E0B'; label.textContent = 'DB Offline'; }
  } catch(e) {
    dot.style.background = '#DC2626'; label.textContent = 'No Network';
  }
}

// ── CONTACT MODAL ──
let currentContactType = null;
function openContactModal() {
  showContactOptions();
  document.getElementById('contactModal')?.classList.add('active');
}

function showContactOptions() {
  currentContactType = null;
  document.getElementById('contactOptions').style.display = 'block';
  document.getElementById('contactTechForm').style.display = 'none';
  document.getElementById('contactVSOForm').style.display = 'none';
  document.getElementById('contactSubmitBtn').style.display = 'none';
}

function showContactForm(type) {
  currentContactType = type;
  document.getElementById('contactOptions').style.display = 'none';
  document.getElementById('contactTechForm').style.display = type === 'tech' ? 'block' : 'none';
  document.getElementById('contactVSOForm').style.display = type === 'vso' ? 'block' : 'none';
  document.getElementById('contactSubmitBtn').style.display = 'block';
  // Pre-fill email/name if signed in
  if (currentUser) {
    const name = currentUser.user_metadata?.full_name || '';
    const email = currentUser.email || '';
    if (type === 'tech') {
      document.getElementById('ctName').value = name;
      document.getElementById('ctEmail').value = email;
    } else {
      document.getElementById('cvName').value = name;
    }
  }
}

function submitContactForm() {
  if (currentContactType === 'tech') {
    const name = document.getElementById('ctName').value.trim();
    const email = document.getElementById('ctEmail').value.trim();
    const issue = document.getElementById('ctIssue').value.trim();
    if (!email || !issue) { alert('Please fill in your email and describe the issue.'); return; }
    window.open(`mailto:hello@missionconnected.vet?subject=Tech Support: Mission Connected&body=Name: ${name}%0AEmail: ${email}%0A%0AIssue:%0A${issue}`, '_blank');
  } else if (currentContactType === 'vso') {
    const name = document.getElementById('cvName').value.trim();
    const phone = document.getElementById('cvPhone').value.trim();
    const need = document.getElementById('cvNeed').value.trim();
    const auth = document.getElementById('cvAuthorize').checked;
    if (!name || !phone || !need) { alert('Please fill in your name, phone, and describe what you need.'); return; }
    const roadmapSnap = auth && roadmapData ? `\n\nRoadmap Summary (authorized): ${roadmapData.summary || 'See attached'}` : '';
    window.open(`mailto:vso@missionconnected.vet?subject=VSO Referral Request&body=Name: ${name}%0APhone: ${phone}%0ANeeds: ${need}${roadmapSnap ? encodeURIComponent(roadmapSnap) : ''}`, '_blank');
  }
  closeModal('contactModal');
  logActivity('contact_submitted', `📞 Help request submitted (${currentContactType})`);
}

// ── PERMANENT ERASE ──
async function confirmPermanentErase() {
  const confirmed = confirm('⚠️ PERMANENT ACTION — This cannot be undone.\n\nThis will immediately delete:\n• Your account\n• Your roadmap and all conditions\n• All uploaded records\n• All notes\n\nType "ERASE" to confirm.');
  if (!confirmed) return;
  const word = prompt('Type ERASE to confirm permanent deletion:');
  if (word !== 'ERASE') { alert('Deletion cancelled.'); return; }
  // Clear local data
  uploadedFiles = [];
  conditions = [];
  roadmapData = null;
  chatHistory = [];
  notesData = { entries: [], story: { event:[], impact:[], treatment:[], priority:[] } };
  activityLog = [];
  try { localStorage.removeItem('mc_notes'); localStorage.removeItem('mc_notes_v2'); } catch(e) {}
  // Delete from Supabase
  if (sbClient && currentUser) {
    try {
      await sbClient.from('claims').delete().eq('user_id', currentUser.id);
      await sbClient.from('profiles').delete().eq('id', currentUser.id);
      await sbClient.storage.from('documents').list(currentUser.id).then(async ({ data }) => {
        if (data?.length) await sbClient.storage.from('documents').remove(data.map(f => `${currentUser.id}/${f.name}`));
      });
      await sbClient.auth.signOut();
    } catch(e) { console.warn('Erase error:', e); }
  }
  currentUser = null;
  updateTopbar();
  showView('vLanding');
  alert('✅ All your data has been permanently erased. Thank you for using Mission: Connected.');
}

function setUser(user) {
  currentUser = user;
  updateTopbar();
  loadUserData();
  const profileNav = document.getElementById('nav-profile');
  const profileSection = document.getElementById('navAccountSection');
  if (profileNav) profileNav.style.display = user ? 'flex' : 'none';
  if (profileSection) profileSection.style.display = user ? 'block' : 'none';
}

function renderProfile() {
  const el = document.getElementById('profileContent');
  if (!el) return;
  if (!currentUser) { el.innerHTML = '<div class="empty-state">Please sign in to view your profile.</div>'; return; }
  const meta = currentUser.user_metadata || {};
  const name = meta.full_name || '';
  const phone = meta.phone || '';
  const state = meta.state || '';
  const bMonth = meta.birth_month || '';
  const bYear = meta.birth_year || '';
  el.innerHTML = `
    <div class="profile-wrap">
      <div class="profile-avatar-lg">${(name[0]||currentUser.email[0]||'V').toUpperCase()}</div>
      <div class="profile-section">
        <div class="profile-section-title">Personal Information</div>
        <div class="profile-grid">
          <div class="profile-field"><label class="f-label">Full Name</label><input class="f-input" id="pf-name" value="${name}" placeholder="First Last"></div>
          <div class="profile-field"><label class="f-label">Phone</label><input class="f-input" id="pf-phone" value="${phone}" placeholder="(555) 555-5555"></div>
          <div class="profile-field"><label class="f-label">State</label><input class="f-input" id="pf-state" value="${state}" placeholder="TX"></div>
          <div class="profile-field"><label class="f-label">Birth Month / Year</label>
            <div style="display:flex;gap:8px">
              <input class="f-input" id="pf-bmonth" value="${bMonth}" placeholder="MM" style="width:80px">
              <input class="f-input" id="pf-byear" value="${bYear}" placeholder="YYYY" style="width:100px">
            </div>
          </div>
          <div class="profile-field"><label class="f-label">Email</label><input class="f-input" value="${currentUser.email}" disabled style="opacity:.6"></div>
        </div>
        <button class="btn btn-primary" onclick="saveProfile()" style="margin-top:16px">Save Changes</button>
        <div id="profileSaveMsg" style="margin-top:10px;font-size:13px;color:var(--green);display:none">✅ Saved!</div>
      </div>
      <div class="profile-section" style="margin-top:24px">
        <div class="profile-section-title">Account Actions</div>
        <div style="display:flex;gap:12px;flex-wrap:wrap;margin-top:12px">
          <button class="btn btn-outline" onclick="signOut()">Sign Out</button>
          <button class="btn btn-outline" style="color:var(--red);border-color:var(--red)" onclick="if(confirm('Delete your account and all data? This cannot be undone.'))deleteAccount()">Delete Account</button>
        </div>
      </div>
    </div>`;
}

async function saveProfile() {
  if (!sbClient || !currentUser) return;
  const name = document.getElementById('pf-name')?.value?.trim();
  const phone = document.getElementById('pf-phone')?.value?.trim();
  const state = document.getElementById('pf-state')?.value?.trim();
  const bMonth = document.getElementById('pf-bmonth')?.value?.trim();
  const bYear = document.getElementById('pf-byear')?.value?.trim();
  try {
    await sbClient.auth.updateUser({ data: { full_name: name, phone, state, birth_month: bMonth, birth_year: bYear } });
    await sbClient.from('profiles').upsert({ id: currentUser.id, full_name: name, phone, state, birth_month: bMonth, birth_year: bYear });
    // Update local user object
    currentUser.user_metadata = { ...currentUser.user_metadata, full_name: name, phone, state, birth_month: bMonth, birth_year: bYear };
    updateTopbar();
    const msg = document.getElementById('profileSaveMsg');
    if (msg) { msg.style.display = 'block'; setTimeout(() => msg.style.display='none', 2500); }
    logActivity('profile_updated', '👤 Profile updated');
  } catch(e) { alert('Save failed: ' + e.message); }
}

async function deleteAccount() {
  // Supabase doesn't allow client-side delete, so just sign out and show message
  await signOut();
  alert('To permanently delete your account and data, email hello@missionconnected.vet from your registered address.');
}

function updateTopbar() {
  const area = document.getElementById('tbUserArea');
  if (!area) return;
  if (currentUser) {
    const meta = currentUser.user_metadata || {};
    const name = meta.full_name || currentUser.email?.split('@')[0] || 'Veteran';
    const initial = name[0]?.toUpperCase() || 'V';
    area.innerHTML = `
      <div class="a-tb-user">
        <div class="a-tb-avatar-sm" onclick="showPage('profile')" style="cursor:pointer" title="Profile settings">${initial}</div>
        <span class="a-tb-user-email" onclick="showPage('profile')" style="cursor:pointer" title="Profile settings">${name}</span>
        <button class="btn-tb-profile" onclick="showPage('profile')" title="Profile &amp; Settings">⚙️</button>
        <button class="btn-tb-out" onclick="signOut()">Sign Out</button>
      </div>`;
  } else {
    area.innerHTML = `<button class="btn-tb-signup" onclick="openAuth('signup')">Save My Roadmap →</button>`;
  }
}

async function loadUserData() {
  if (!sbClient || !currentUser) return;
  try {
    const { data: profile } = await sbClient.from('profiles').select('*').eq('id', currentUser.id).single();
    if (profile?.screener_data) Object.assign(ans, profile.screener_data);
    if (profile?.roadmap_text) { roadmapData = profile.roadmap_text; }
    const { data: claims } = await sbClient.from('claims').select('*').eq('user_id', currentUser.id);
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
  // When going to vApp, default to roadmap (not dashboard) unless we have one
  if (id === 'vApp' && currentPage === 'dashboard' && !roadmapData) {
    showPage('roadmap');
  }
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
  if (id === 'tracker') renderTrackerTable();
  if (id === 'activity') renderActivityLog();
  if (id === 'profile') renderProfile();
  if (id === 'records') { updateRecordsStorageBanner(); }
  if (id === 'notes') { loadNotes(); }
}

// ── ACTIVITY LOG ──
function logActivity(type, description, undoFn = null) {
  const entry = { id: Date.now(), type, description, timestamp: new Date(), undoFn };
  activityLog.unshift(entry);
  if (undoFn) undoStack.push(entry);
  if (activityLog.length > 100) activityLog.pop();
  updateActivityBadge();
  if (currentPage === 'activity') renderActivityLog();
}

function updateActivityBadge() {
  const badge = document.getElementById('activityBadge');
  if (badge) badge.textContent = activityLog.length;
}

function renderActivityLog() {
  const el = document.getElementById('activityContent');
  if (!el) return;
  if (!activityLog.length) {
    el.innerHTML = '<div class="empty-state"><div style="font-size:32px;margin-bottom:10px">📋</div>No activity yet. Actions you take will appear here.</div>';
    return;
  }
  const icons = { account_created:'🎉', signed_in:'🔐', roadmap_generated:'🗺️', condition_added:'➕', condition_advanced:'→', condition_edited:'✏️', check_toggled:'✅', chat_message:'💬', file_uploaded:'📁', file_removed:'🗑️', default:'⚡' };
  el.innerHTML = `
    <div class="activity-header">
      <div class="activity-count">${activityLog.length} events</div>
      ${undoStack.length ? `<button class="btn btn-outline btn-sm" onclick="undoLastAction()">↩ Undo Last Action</button>` : ''}
    </div>
    <div class="activity-timeline">
      ${activityLog.map(e => {
        const icon = icons[e.type] || icons.default;
        const time = e.timestamp.toLocaleTimeString([], {hour:'2-digit',minute:'2-digit'});
        const date = e.timestamp.toLocaleDateString([], {month:'short',day:'numeric'});
        return `<div class="activity-item">
          <div class="activity-icon">${icon}</div>
          <div class="activity-body">
            <div class="activity-desc">${e.description}</div>
            <div class="activity-time">${date} · ${time}</div>
          </div>
          ${e.undoFn ? `<button class="btn-undo" onclick="undoSpecific(${e.id})">Undo</button>` : ''}
        </div>`;
      }).join('')}
    </div>`;
}

function undoLastAction() {
  const last = undoStack.pop();
  if (!last) return;
  try { last.undoFn(); logActivity('undo', `↩ Undid: ${last.description}`); }
  catch(e) { console.warn('Undo failed:', e); }
}

function undoSpecific(id) {
  const idx = undoStack.findIndex(e => e.id === id);
  if (idx < 0) return;
  const entry = undoStack.splice(idx, 1)[0];
  try { entry.undoFn(); logActivity('undo', `↩ Undid: ${entry.description}`); }
  catch(e) { console.warn('Undo failed:', e); }
}

function switchCalcTab(tab) {
  document.getElementById('ctab-single').classList.toggle('active', tab === 'single');
  document.getElementById('ctab-multi').classList.toggle('active', tab === 'multi');
  document.getElementById('calcSingle').style.display = tab === 'single' ? 'block' : 'none';
  document.getElementById('calcMulti').style.display = tab === 'multi' ? 'block' : 'none';
}

function addRatingRow() {
  const container = document.getElementById('multiRatingInputs');
  if (!container) return;
  const count = container.querySelectorAll('.multi-rating-row').length + 1;
  const row = document.createElement('div');
  row.className = 'multi-rating-row';
  row.innerHTML = `<input class="multi-rating-input calc-select" type="number" min="0" max="100" placeholder="Rating %" oninput="updateMultiCalc()"><span class="multi-rating-label">Condition ${count}</span><button class="btn-remove-rating" onclick="removeRatingRow(this)">✕</button>`;
  container.appendChild(row);
}

function removeRatingRow(btn) {
  btn.closest('.multi-rating-row')?.remove();
  updateMultiCalc();
}

// Local VA rating criteria lookup (saves ~300 tokens per roadmap call)
const RATING_CRITERIA = {
  'ptsd':          [{pct:10,desc:'Occupational/social impairment due to mild or transient symptoms'},{pct:30,desc:'Occupational/social impairment with occasional decrease in work efficiency'},{pct:50,desc:'Reduced reliability and productivity; panic attacks more than once a week'},{pct:70,desc:'Occupational/social impairment with deficiencies in most areas'},{pct:100,desc:'Total occupational/social impairment'}],
  'tinnitus':      [{pct:10,desc:'Tinnitus, recurrent — 10% is the max rating regardless of severity'}],
  'hearing loss':  [{pct:0,desc:'0-100% based on pure tone average and speech discrimination scores from audiogram'}],
  'asthma':        [{pct:10,desc:'FEV-1 of 71-80% or daily inhalational/oral bronchodilator therapy'},{pct:30,desc:'FEV-1 of 56-70% or daily inhalational/oral bronchodilator therapy with systemic corticosteroids'},{pct:60,desc:'FEV-1 less than 40% or more than one attack per week with episodes of respiratory failure'}],
  'sleep apnea':   [{pct:0,desc:'Asymptomatic with documented sleep disorder breathing'},{pct:30,desc:'Persistent daytime hypersomnolence'},{pct:50,desc:'Requires use of breathing assistance device such as CPAP machine'},{pct:100,desc:'Chronic respiratory failure requiring tracheostomy'}],
  'lumbar':        [{pct:10,desc:'Flexion limited to 60°, or painful motion'},{pct:20,desc:'Flexion limited to 40°'},{pct:40,desc:'Flexion limited to 30°'},{pct:50,desc:'Unfavorable ankylosis of the entire thoracolumbar spine'}],
  'knee':          [{pct:10,desc:'Slight recurrent subluxation, painful motion'},{pct:20,desc:'Moderate disability — recurrent subluxation or lateral instability'},{pct:30,desc:'Severe instability with daily use of knee brace required'}],
  'anxiety':       [{pct:10,desc:'Mild symptoms, no significant occupational impairment'},{pct:30,desc:'Occupational/social impairment with occasional decreases in work efficiency'},{pct:50,desc:'Reduced reliability and productivity'},{pct:70,desc:'Deficiencies in most areas of work, school, family relations'}],
  'migraines':     [{pct:10,desc:'Characteristic prostrating attacks 1x/month or less'},{pct:30,desc:'Prostrating attacks occurring once monthly on average'},{pct:50,desc:'Very frequent completely prostrating and prolonged attacks productive of severe economic inadaptability'}],
  'hypertension':  [{pct:10,desc:'Diastolic 100-109 or systolic 160-199'},{pct:20,desc:'Diastolic 110-119 or systolic 200+; or minimum evaluation with history of diastolic 110+'}],
  'diabetes':      [{pct:10,desc:'Manageable by restricted diet only'},{pct:20,desc:'Requires insulin, restricted diet, or oral hypoglycemic agent'},{pct:40,desc:'Requires insulin and restricted diet, or oral hypoglycemic agent and restricted diet, with episodes of ketoacidosis'}],
  'default':       [{pct:10,desc:'Mild — minimal symptoms with little functional impairment'},{pct:30,desc:'Moderate — occasional symptoms affecting occupational/social function'},{pct:50,desc:'Moderately severe — significant impact on daily and occupational function'},{pct:70,desc:'Severe — frequent and debilitating symptoms'}]
};
function getRatingCriteria(condName) {
  const name = (condName || '').toLowerCase();
  for (const [key, criteria] of Object.entries(RATING_CRITERIA)) {
    if (name.includes(key)) return criteria;
  }
  return RATING_CRITERIA.default;
}
function devFillScreener() {
  ans.goal = 'initial';
  ans.branch = ['Army'];
  ans.component = 'Reserve';
  ans.startYear = '2015';
  ans.endYear = '2020';
  ans.discharge = 'Honorable';
  ans.mos = { code: '74D', label: 'CBRN Specialist', noise: 'Moderate', tera: true };
  ans.deployments = ['CONUS_only'];
  ans.exposures = ['chemicals', 'solvents', 'CBRN agents (training)'];
  ans.vaStatus = 'none';
  ans.ratedConds = [];
  ans.symptoms = ['shortness of breath', 'wheezing', 'fatigue', 'chest tightness', 'poor sleep', 'anxiety'];
  ans.diagnoses = ['Asthma', 'Sleep Apnea (suspected)', 'Anxiety'];
  ans.events = ['Regular CBRN training with live chemical agents', 'Extended MOPP gear operations'];
  ans.evidence = ['Service medical records showing asthma diagnosis in-service', 'DD-214'];
  ans.impact = ['difficulty exercising', 'sleep disruption', 'work limitations'];
  ans.followups = { nexus_letter: 'No', cpap: 'No', current_treatment: 'Albuterol inhaler' };
  console.log('✅ Dev fill complete. Building roadmap...');
  buildRoadmap();
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
  const isSignup = mode === 'signup';
  const signupFields = document.getElementById('signupFields');
  const confirmPwField = document.getElementById('confirmPwField');
  const privacyRow = document.getElementById('authPrivacyRow');
  const dismissRow = document.getElementById('authDismissRow');
  if (signupFields) signupFields.style.display = isSignup ? 'block' : 'none';
  if (confirmPwField) confirmPwField.style.display = isSignup ? 'block' : 'none';
  if (privacyRow) privacyRow.style.display = isSignup ? 'block' : 'none';
  if (dismissRow) dismissRow.style.display = isSignup ? 'none' : 'block';
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
  if (!sbClient) { showAuthError('Authentication service not available.'); return; }
  const email = document.getElementById('authEmail').value.trim();
  const password = document.getElementById('authPassword').value;
  if (!email || !password) { showAuthError('Please enter your email and password.'); return; }
  const btn = document.getElementById('authSubmitBtn');
  btn.disabled = true; btn.textContent = 'Please wait...';
  clearAuthError();
  try {
    let result;
    if (authMode === 'signup') {
      const confirmPw = document.getElementById('authPasswordConfirm')?.value;
      if (confirmPw !== undefined && confirmPw !== password) {
        showAuthError('Passwords do not match.'); btn.disabled=false; btn.textContent='Create Free Account'; return;
      }
      const fullName = document.getElementById('authFullName')?.value?.trim() || '';
      const phone = document.getElementById('authPhone')?.value?.trim() || '';
      const state = document.getElementById('authState')?.value || '';
      const birthMonth = document.getElementById('authBirthMonth')?.value || '';
      const birthYear = document.getElementById('authBirthYear')?.value || '';
      const privacy = document.getElementById('authPrivacy')?.checked;
      if (!privacy) { showAuthError('Please accept the Privacy Policy to continue.'); btn.disabled=false; btn.textContent='Create Free Account'; return; }
      result = await sbClient.auth.signUp({ email, password, options: { data: { full_name: fullName, phone, state, birth_month: birthMonth, birth_year: birthYear } } });
      if (result.error) throw result.error;
      if (result.data?.user) {
        await sbClient.from('profiles').upsert({ id: result.data.user.id, screener_data: ans, full_name: fullName, phone, state, birth_month: birthMonth, birth_year: birthYear });
        setUser(result.data.user);
        closeAuth();
        logActivity('account_created', '🎉 Account created — welcome to Mission: Connected');
        if (roadmapData) saveRoadmapToSupabase();
      } else {
        showAuthError('Check your email to confirm your account.');
      }
    } else {
      result = await sbClient.auth.signInWithPassword({ email, password });
      if (result.error) throw result.error;
      setUser(result.data.user);
      closeAuth();
      logActivity('signed_in', '🔐 Signed in');
    }
  } catch(e) {
    showAuthError(e.message || 'Authentication failed. Please try again.');
  }
  btn.disabled = false;
  btn.textContent = authMode === 'signin' ? 'Sign In' : 'Create Free Account';
}

async function signOut() {
  if (sbClient) await sbClient.auth.signOut();
  currentUser = null; roadmapData = null; conditions = []; chatHistory = [];
  updateTopbar();
  showView('vLanding');
}

async function saveRoadmapToSupabase() {
  if (!sbClient || !currentUser || !roadmapData) return;
  try {
    await sbClient.from('profiles').upsert({
      id: currentUser.id, screener_data: ans, roadmap_text: roadmapData
    });
  } catch(e) { console.warn('Save error:', e); }
}

// ── CALC ──
// VA Combined Rating uses "Whole Person" method:
// Start with 100% whole person. Apply highest rating first, then each subsequent
// rating applies to the REMAINING percentage. Round final to nearest 10%.
function vaWholePerson(ratings) {
  if (!ratings || ratings.length === 0) return 0;
  const sorted = [...ratings].sort((a,b) => b - a);
  let remaining = 100;
  for (const r of sorted) {
    remaining = remaining * (1 - r / 100);
  }
  const combined = 100 - remaining;
  return Math.round(combined / 10) * 10;
}

// 38 CFR § 4.96(a) — respiratory conditions that CANNOT be separately rated
// VA assigns only the SINGLE HIGHEST (predominant) rating among these conditions
const RESPIRATORY_4_96_KEYWORDS = [
  'asthma','sleep apnea','apnea','copd','emphysema','bronchitis','bronchiectasis',
  'pulmonary fibrosis','interstitial lung','respiratory','pulmonary','pneumoconiosis',
  'silicosis','asbestosis','pleuritis','pleural'
];

function isRespiratoryCondition(name) {
  const n = (name || '').toLowerCase();
  return RESPIRATORY_4_96_KEYWORDS.some(k => n.includes(k));
}

// Returns { combined, respiratoryNote, respiratoryPredominant }
// Applies 38 CFR § 4.96: respiratory conditions get ONE rating (the highest).
// That single rating is then combined with non-respiratory ratings using VA math.
function vaRatingWith4_96(conditionList) {
  if (!conditionList || conditionList.length === 0) return { combined: 0, respiratoryNote: null };

  const ratings = conditionList.map(c => ({
    name: c.name,
    rating: c.rating || c.targetRating || 0,
    isResp: isRespiratoryCondition(c.name)
  })).filter(c => c.rating > 0);

  const respGroup = ratings.filter(c => c.isResp).sort((a,b) => b.rating - a.rating);
  const nonResp   = ratings.filter(c => !c.isResp);

  // Respiratory group: ONLY the highest rating counts (§ 4.96 predominant rule)
  const respPredominant = respGroup[0] || null;
  const allRatings = [];
  if (respPredominant) allRatings.push(respPredominant.rating);
  nonResp.forEach(c => allRatings.push(c.rating));

  const combined = vaWholePerson(allRatings);

  let respiratoryNote = null;
  if (respGroup.length > 1) {
    const bundled = respGroup.slice(1).map(c => c.name).join(', ');
    respiratoryNote = {
      predominant: respPredominant.name,
      predominantRating: respPredominant.rating,
      bundled,
      law: '38 CFR § 4.96(a)'
    };
  }

  return { combined, respiratoryNote, respiratoryPredominant: respPredominant };
}

function updateCalc() {
  const rating = parseInt(document.getElementById('calcRating').value);
  const deps = document.getElementById('calcDeps').value;
  const amountEl = document.getElementById('calcAmount');
  const annualEl = document.getElementById('calcAnnual');
  const formulaEl = document.getElementById('calcFormula');
  if (!rating || !VA_RATES[rating]) {
    amountEl.textContent = 'Select a rating';
    annualEl.textContent = '';
    if (formulaEl) formulaEl.textContent = '';
    return;
  }
  const monthly = VA_RATES[rating][deps] || VA_RATES[rating]['none'];
  const annual = (monthly * 12).toFixed(0);
  amountEl.textContent = '$' + monthly.toFixed(2).replace(/\B(?=(\d{3})+(?!\d))/g, ',');
  annualEl.textContent = '$' + parseInt(annual).toLocaleString() + '/year';
}

function updateMultiCalc() {
  // Multi-condition combined rating calculator
  const inputs = document.querySelectorAll('.multi-rating-input');
  const ratings = Array.from(inputs).map(i => parseInt(i.value)).filter(v => v > 0 && v <= 100);
  if (ratings.length === 0) { document.getElementById('multiCalcResult').innerHTML = ''; return; }
  const sorted = [...ratings].sort((a,b) => b-a);
  let remaining = 100;
  const steps = sorted.map(r => {
    const disabled = remaining * (r/100);
    remaining = remaining - disabled;
    return { r, disabled: disabled.toFixed(1), remaining: remaining.toFixed(1) };
  });
  const rawCombined = 100 - remaining;
  const rounded = Math.round(rawCombined / 10) * 10;
  const stepHtml = steps.map((s,i) => `<div class="calc-step"><span class="calc-step-num">${i===0?'Start':'Then'}</span> ${s.r}% of ${i===0?'100':steps[i-1].remaining}% = <strong>${s.disabled}%</strong> disabled → ${s.remaining}% remaining</div>`).join('');
  document.getElementById('multiCalcResult').innerHTML = `
    <div class="calc-steps-wrap">${stepHtml}</div>
    <div class="calc-combined-result">
      <div>Raw combined: <strong>${rawCombined.toFixed(1)}%</strong></div>
      <div>VA rounds to nearest 10%: <strong class="calc-final">${rounded}%</strong></div>
      ${rounded >= 100 ? '<div class="calc-note-100">🏆 100% combined rating!</div>' : ''}
    </div>
    <div class="calc-496-warn">⚠️ <strong>38 CFR § 4.96 note:</strong> If any of these conditions are both respiratory (e.g. asthma + sleep apnea + COPD), VA will award only the <em>single highest</em> respiratory rating — not combine them. This calculator shows standard VA math only. Your Case Dashboard applies the correct rule automatically.</div>`;
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

  const mosLabel = ans.mos?.label || ans.mos?.title || '';
  const teraFlag = ans.mos?.tera ? ' [TERA]' : '';
  const prompt = `VA claims expert. Veteran profile below. Return ONLY minified JSON, no markdown.

${ans.branch?.join('/')} ${ans.component}, MOS ${ans.mos?.code||'?'} ${mosLabel}${teraFlag}, ${ans.startYear}-${ans.endYear}, ${ans.discharge}
Deployments:${ans.deployments?.join(',')||'None'} Exposures:${ans.exposures?.join(',')||'None'}
VA:${ans.vaStatus} Rated:${ans.ratedConds?.join(',')||'None'}
Symptoms:${ans.symptoms?.join(',')||'None'}
Diagnoses:${ans.diagnoses?.join(',')||'None'}
Events:${ans.events?.join(',')||'None'}

Return this JSON with 2-4 conditions only:
{"summary":"1-2 sentences","totalConditions":N,"conditions":[{"name":"","type":"direct|secondary|presumptive|lay","priority":"high|medium|low","targetRating":N,"nexus":"1 sentence","evidence_have":"brief","evidence_need":"brief","action":"1 sentence","secondaryTo":"","cfr":"","checks":["","",""]}],"tdiu":false,"tdiu_note":"","pact_note":"","top_action":"1 sentence"}

targetRating = realistic VA rating based on reported symptoms (not minimum — use actual diagnostic criteria: e.g. CPAP for sleep apnea=50, daily bronchodilator=30 for asthma, tinnitus always=10).
Be specific to MOS. Winnable claims only. MINIFIED JSON ONLY.`;

  try {
    const data = await callClaude([{role:'user',content:prompt}], 1200);
    clearInterval(stepInterval);
    const text = data.content?.[0]?.text || '{}';
    // Try code fence first, then bare JSON object
    let clean = text;
    const fenceMatch = text.match(/```(?:json)?\s*([\s\S]*?)```/);
    if (fenceMatch) {
      clean = fenceMatch[1].trim();
    } else {
      const jsonMatch = text.match(/\{[\s\S]*\}/);
      if (!jsonMatch) throw new Error('No JSON in response: ' + text.slice(0, 200));
      clean = jsonMatch[0];
    }
    roadmapData = JSON.parse(clean);

    // Build conditions from roadmap
    conditions = roadmapData.conditions?.map((c, i) => ({
      id: 'local-'+i, name: c.name, rating: 0, col: 'todo',
      type: c.type, checks: (c.checks||[]).map(ch=>({text:ch,done:false})),
      nexus: c.nexus, evidence_need: c.evidence_need, action: c.action,
      secondaryTo: c.secondaryTo||'', cfr: c.cfr||'',
      targetRating: c.targetRating || 0,
      ratingCriteria: c.ratingCriteria?.length ? c.ratingCriteria : getRatingCriteria(c.name)
    })) || [];

    if (currentUser) await saveRoadmapToSupabase();
    logActivity('roadmap_generated', `🗺️ Roadmap generated — ${roadmapData.conditions?.length || 0} conditions identified`);
    showView('vApp');
    showPage('roadmap');
    renderRoadmap(roadmapData);
    renderDashboard();
    updateSidebar();
  } catch(e) {
    clearInterval(stepInterval);
    console.error('Roadmap error:', e);
    roadmapData = {
      summary: `Error: ${e.message}. ${e.message.includes('rate') ? 'Our AI is briefly busy — please click "Retry Roadmap" below in ~30 seconds.' : 'Please try again.'}`,
      conditions: [], error: e.message, totalConditions: 0
    };
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

  // Show error state with retry button
  if (data.error && data.conditions.length === 0) {
    el.innerHTML = `
      <div class="rm-hero rm-hero-error">
        <div style="font-size:40px">⚠️</div>
        <div>
          <div class="rm-hero-tag" style="color:var(--gold)">Generation Error</div>
          <div class="rm-hero-title" style="font-size:20px">${data.summary}</div>
          <button class="btn btn-primary" style="margin-top:16px" onclick="buildRoadmap()">↻ Retry Roadmap</button>
        </div>
      </div>`;
    return;
  }

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
  const dc = getDiagnosticCode(c.name);
  const cpTips = getCPTips(c.name);
  return `
  <div class="cond-card">
    <div class="cond-card-hdr lborder-${c.type}" onclick="toggleCondBody(this)">
      <div style="flex:1">
        <div class="cond-name">${c.name}</div>
        <div style="display:flex;align-items:center;gap:8px;flex-wrap:wrap;margin-top:3px">
          <span class="cond-pri-badge badge-${c.type}">${label}</span>
          ${c.secondaryTo ? `<span style="font-size:11px;color:var(--text-sec)">↳ Secondary to ${c.secondaryTo}</span>` : ''}
          ${c.cfr ? `<span style="font-size:10px;color:var(--text-hint)">${c.cfr}</span>` : ''}
          ${dc ? `<span class="cond-dc-badge">DC ${dc.code}</span>` : ''}
        </div>
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
        <div class="rating-criteria-hdr">📊 VA Rating Schedule — ${dc ? `Diagnostic Code ${dc.code}` : '38 CFR Part 4'}</div>
        <div class="rating-criteria-sub">Describe your <strong>worst days</strong> at your C&amp;P exam. The examiner checks which row your symptoms match.</div>
        ${c.ratingCriteria.map(r => `
          <div class="rating-row">
            <div class="r-pct">${r.pct}%</div>
            <div class="r-desc">
              <div>${r.desc}</div>
              ${r.keywords ? `<div class="r-keywords">Key words: ${r.keywords}</div>` : ''}
            </div>
          </div>`).join('')}
      </div>` : ''}
      ${cpTips?.length ? `
      <div class="cp-tips-box">
        <div class="cp-tips-hdr">🎯 C&amp;P Exam Prep — What the examiner is looking for</div>
        ${cpTips.map(t => `<div class="cp-tip-row">• ${t}</div>`).join('')}
      </div>` : ''}
    </div>
  </div>`;
}

// Local diagnostic codes lookup
function getDiagnosticCode(name) {
  const n = name?.toLowerCase() || '';
  const codes = {
    'tinnitus': { code: '6260', cfr: '38 CFR § 4.87' },
    'ptsd': { code: '9411', cfr: '38 CFR § 4.130' },
    'asthma': { code: '6602', cfr: '38 CFR § 4.97' },
    'sleep apnea': { code: '6847', cfr: '38 CFR § 4.97' },
    'lumbar': { code: '5237', cfr: '38 CFR § 4.71a' },
    'cervical': { code: '5237', cfr: '38 CFR § 4.71a' },
    'knee': { code: '5260', cfr: '38 CFR § 4.71a' },
    'anxiety': { code: '9400', cfr: '38 CFR § 4.130' },
    'depression': { code: '9434', cfr: '38 CFR § 4.130' },
    'migraines': { code: '8100', cfr: '38 CFR § 4.124a' },
    'hypertension': { code: '7101', cfr: '38 CFR § 4.104' },
    'diabetes': { code: '7913', cfr: '38 CFR § 4.119' },
    'hearing loss': { code: '6100', cfr: '38 CFR § 4.85' },
  };
  for (const key in codes) { if (n.includes(key)) return codes[key]; }
  return null;
}

// C&P prep tips per condition
function getCPTips(name) {
  const n = name?.toLowerCase() || '';
  const tips = {
    'ptsd': [
      'Describe your worst symptoms — nightmares, flashbacks, hypervigilance, avoidance',
      'Tell the examiner how PTSD affects your work, relationships, and daily functioning',
      'Don\'t minimize — describe your bad days, not your average days',
      'Bring a list of stressors (specific in-service events)',
    ],
    'sleep apnea': [
      'Confirm whether you use a CPAP — using one supports a 50% rating minimum',
      'Describe daytime sleepiness, difficulty concentrating, and impact on work',
      'Mention frequency of apnea episodes per hour (from your sleep study)',
    ],
    'asthma': [
      'Bring records of FEV1/FVC ratio from pulmonary function tests',
      'Describe how often you use inhalers per day and per week',
      'Tell examiner about any ER visits, hospitalizations, or time off work due to flare-ups',
    ],
    'tinnitus': [
      'Tinnitus is usually rated 10% (single bilateral rating, DC 6260)',
      'Describe the sound, frequency, and how it affects sleep and concentration',
      'Note that tinnitus is often rated alongside hearing loss',
    ],
    'lumbar': [
      'ROM (range of motion) is measured — show your actual limited movement, don\'t push through pain',
      'Describe if you have radiculopathy (pain/numbness shooting into legs)',
      'Mention flare-ups, how long they last, and what triggers them',
    ],
    'knee': [
      'Walk normally for the examiner — don\'t over-perform',
      'Describe locking, giving way, and limitation of motion on bad days',
      'Mention any surgeries, braces, or pain medication',
    ],
    'migraines': [
      'The key rating factor is frequency: how many prostrating attacks per month',
      'Describe prostrating = you must stop all activity and lie down',
      'Keep a headache diary showing dates and duration',
    ],
    'hypertension': [
      'Blood pressure readings drive the rating — bring recent records',
      'A diastolic reading of 100+ gets 20%, 110+ gets 40%',
      'Describe current medications and any cardiovascular complications',
    ],
  };
  for (const key in tips) { if (n.includes(key)) return tips[key]; }
  return null;
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
  const mos = ans.mos?.label || ans.mos?.title || 'Unknown MOS';
  const start = ans.startYear || '?';
  const end = ans.endYear || 'Present';

  // ── VA RATING MATH ──
  // Current: won conditions only, applying 38 CFR § 4.96 respiratory bundling
  const wonConds = conditions.filter(c => c.col === 'won' && c.rating > 0);
  const allTargetConds = conditions.map(c => ({ ...c, rating: c.targetRating || c.rating || 0 })).filter(c => c.rating > 0);

  const currentResult  = vaRatingWith4_96(wonConds);
  const potentialResult = vaRatingWith4_96(allTargetConds);

  const currentCombined  = currentResult.combined;
  const potentialCombined = potentialResult.combined;
  const pendingCount = conditions.filter(c => c.col === 'todo' || c.col === 'inprog').length;
  const wonCount = conditions.filter(c => c.col === 'won').length;

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
      <div><div class="dash-stat-val">${wonCount}</div><div class="dash-stat-lbl">Won</div></div>
      <div><div class="dash-stat-val">${pendingCount}</div><div class="dash-stat-lbl">Pending</div></div>
      <div><div class="dash-stat-val">${currentCombined}%</div><div class="dash-stat-lbl">Current Rating</div></div>
    </div>
  </div>

  <div class="gauge-section">
    <div class="gauge-card">
      <div class="gauge-title">Combined Rating</div>
      <div class="gauge-wrap">
        <svg class="gauge-svg" viewBox="0 0 200 110">
          <path d="M 10 100 A 90 90 0 0 1 190 100" fill="none" stroke="#E5E7EB" stroke-width="18" stroke-linecap="round"/>
          <path d="M 10 100 A 90 90 0 0 1 190 100" fill="none" stroke="#002855" stroke-width="18" stroke-linecap="round"
            stroke-dasharray="${Math.PI * 90 * currentCombined / 100} ${Math.PI * 90}" />
          <path d="M 10 100 A 90 90 0 0 1 190 100" fill="none" stroke="#C9A84C" stroke-width="18" stroke-linecap="round" stroke-opacity="0.35"
            stroke-dasharray="${Math.PI * 90 * potentialCombined / 100} ${Math.PI * 90}" />
        </svg>
        <div class="gauge-center-val"><div class="gauge-pct">${currentCombined}%</div><div class="gauge-pct-label">Current</div></div>
      </div>
      <div class="gauge-legend">
        <div class="gauge-legend-item"><div class="gauge-legend-dot" style="background:#002855"></div>Current (won)</div>
        <div class="gauge-legend-item"><div class="gauge-legend-dot" style="background:#C9A84C"></div>Potential ${potentialCombined}%</div>
      </div>
      <div class="gauge-note">
        ${currentCombined === 0 && wonCount === 0 
          ? `<div class="gauge-howto">📋 <strong>How to use:</strong> Drag conditions to the <strong>Won</strong> column and enter your VA-assigned rating — the gauge updates automatically.</div>` 
          : ''}
        ${potentialCombined > 0 ? `📊 Potential combined rating: <strong>${potentialCombined}%</strong>` : ''}
        ${potentialResult.respiratoryNote ? `
        <div class="gauge-496-notice">
          ⚠️ <strong>38 CFR § 4.96(a) Applied:</strong> <em>${potentialResult.respiratoryNote.bundled}</em> cannot be rated separately from <em>${potentialResult.respiratoryNote.predominant}</em> because they are both respiratory conditions. VA awards only the highest rating — <strong>${potentialResult.respiratoryNote.predominantRating}%</strong> for ${potentialResult.respiratoryNote.predominant}. <a href="#" onclick="showPage('regulations');return false;" style="color:var(--sky)">Learn more →</a>
        </div>` : ''}
        ${currentResult.respiratoryNote ? `
        <div class="gauge-496-notice">
          ⚠️ <strong>38 CFR § 4.96(a):</strong> Your won ratings include multiple respiratory conditions. VA will rate only the predominant one — <em>${currentResult.respiratoryNote.predominant}</em> at <strong>${currentResult.respiratoryNote.predominantRating}%</strong>. ${currentResult.respiratoryNote.bundled} is bundled into this rating, not added separately.
        </div>` : ''}
      </div>
    </div>
    <div class="service-profile">
      <div class="sp-header"><div class="sp-title">Service Profile</div></div>
      <div class="sp-grid">
        <div class="sp-item"><div class="sp-item-label">Branch</div><div class="sp-item-val">${branch}</div></div>
        <div class="sp-item"><div class="sp-item-label">Component</div><div class="sp-item-val ${!ans.component?'empty':''}">${ans.component||'Not specified'}</div></div>
        <div class="sp-item"><div class="sp-item-label">MOS / Rate</div><div class="sp-item-val ${!ans.mos?.code?'empty':''}">${ans.mos?.code ? ans.mos.code+' — '+(ans.mos.label||ans.mos.title||'') : 'Not specified'}</div></div>
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
  return `<div class="kanban-col kcol-${status}" 
    ondragover="event.preventDefault();this.classList.add('drag-over')" 
    ondragleave="this.classList.remove('drag-over')"
    ondrop="dropOnCol('${status}',event);this.classList.remove('drag-over')">
    <div class="kanban-col-hdr">
      <div class="kanban-col-title">${title}</div>
      <div class="kanban-col-count">${conds.length}</div>
    </div>
    ${conds.map(c => renderKcard(c)).join('')}
    ${!conds.length ? `<div class="kanban-empty-col">Drop conditions here</div>` : ''}
  </div>`;
}

let dragCondId = null;
function dropOnCol(newCol, event) {
  event.preventDefault();
  if (!dragCondId) return;
  const c = conditions.find(c => c.id === dragCondId);
  if (!c || c.col === newCol) return;
  const prevCol = c.col;
  c.col = newCol;
  const colLabels = {todo:'To Do',inprog:'In Progress',filed:'Filed',won:'Won'};
  logActivity('condition_advanced', `→ ${c.name} moved to ${colLabels[newCol]}`, () => {
    c.col = prevCol; renderDashboard();
  });
  if (newCol === 'won' && !c.rating) {
    setTimeout(() => openRatingPicker(c.id), 300);
  }
  renderDashboard();
  saveConditions();
  dragCondId = null;
}

let ratingPickerCondId = null;

function openRatingPicker(condId) {
  const c = conditions.find(c => c.id === condId);
  if (!c) return;
  ratingPickerCondId = condId;
  document.getElementById('ratingPickerTitle').textContent = `🏆 ${c.name} — Enter VA Rating`;
  document.getElementById('ratingPickerSub').textContent = `Select the % VA assigned you, or the row that best matches your symptoms`;
  document.getElementById('ratingCustomInput').value = '';

  const criteria = c.ratingCriteria?.length ? c.ratingCriteria : getRatingCriteria(c.name);
  const opts = document.getElementById('ratingPickerOptions');
  opts.innerHTML = criteria.map(r => `
    <div class="rp-option" onclick="selectRatingOption(this, ${r.pct})">
      <div class="rp-opt-pct">${r.pct}%</div>
      <div class="rp-opt-desc">${r.desc}</div>
    </div>`).join('');

  document.getElementById('ratingPickerModal').classList.add('active');
}

function selectRatingOption(el, pct) {
  document.querySelectorAll('.rp-option').forEach(o => o.classList.remove('selected'));
  el.classList.add('selected');
  document.getElementById('ratingCustomInput').value = pct;
}

function closeRatingPicker() {
  // If they cancel, move condition back to filed (last step before won)
  const c = conditions.find(c => c.id === ratingPickerCondId);
  if (c && c.col === 'won' && !c.rating) {
    c.col = 'filed';
    renderDashboard();
    saveConditions();
  }
  document.getElementById('ratingPickerModal').classList.remove('active');
  ratingPickerCondId = null;
}

function confirmRatingPick() {
  const val = parseInt(document.getElementById('ratingCustomInput').value);
  if (!val && val !== 0) { 
    document.getElementById('ratingCustomInput').focus();
    document.getElementById('ratingCustomInput').style.borderColor = '#DC2626';
    return; 
  }
  const c = conditions.find(c => c.id === ratingPickerCondId);
  if (c) {
    c.rating = Math.min(100, Math.max(0, val));
    logActivity('rating_entered', `🏆 ${c.name} won at ${c.rating}%`);
    renderDashboard();
    saveConditions();
  }
  document.getElementById('ratingPickerModal').classList.remove('active');
  ratingPickerCondId = null;
}

function renderKcard(c) {
  const total = c.checks?.length || 0;
  const done = c.checks?.filter(ch => ch.done)?.length || 0;
  const pct = total ? Math.round((done / total) * 100) : 0;
  const colMap = { direct:'#002855', secondary:'#0076CE', presumptive:'#6D28D9', lay:'#16A34A' };
  const col = colMap[c.type] || '#9CA3AF';
  const ratingBadge = c.rating > 0
    ? `<span class="kcard-rating-badge">${c.rating}%</span>`
    : (c.col !== 'won' ? `<span class="kcard-pending-badge">Pending</span>` : '');
  return `<div class="kcard" draggable="true"
    ondragstart="dragCondId='${c.id}';this.classList.add('dragging')"
    ondragend="this.classList.remove('dragging')">
    <div class="kcard-drag-handle" title="Drag to move">⠿</div>
    <div class="kcard-top">
      <div class="kcard-name">${c.name}</div>
      ${ratingBadge}
    </div>
    <span class="kcard-basis" style="background:${col}20;color:${col}">${c.type||'direct'}</span>
    ${c.targetRating ? `<div class="kcard-target">🎯 Target: ${c.targetRating}%</div>` : ''}
    ${total > 0 ? `
    <div class="kcard-progress"><div class="kcard-prog-fill" style="width:${pct}%;background:${col}"></div></div>
    <div class="kcard-meta"><span>${done}/${total} steps</span><span>${pct}%</span></div>` : ''}
    ${total > 0 ? `<div class="kcard-checks">${(c.checks||[]).map((ch,i) => `
      <div class="check-item ${ch.done?'checked':''}" onclick="toggleCheck('${c.id}',${i})">
        <div class="check-box">${ch.done?'✓':''}</div>
        <div class="check-text">${ch.text}</div>
      </div>`).join('')}</div>` : ''}
    <div class="kcard-hint">⠿ Drag to move · <button class="btn-kcard-edit" onclick="openEditCondition('${c.id}')">Edit</button></div>
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

function printRoadmap() {
  if (!roadmapData || !conditions.length) { alert('Complete your screener first to generate a roadmap to print.'); return; }
  const branch = ans.branch?.[0] || 'Veteran';
  const mos = ans.mos?.code ? `${ans.mos.code} — ${ans.mos.title||''}` : '';
  const typeLabels = { direct:'Direct Service', secondary:'Secondary', presumptive:'Presumptive', lay:'Lay Evidence' };
  const condHTML = conditions.map(c => `
    <div style="border:1px solid #ccc;border-radius:6px;padding:14px;margin-bottom:12px;break-inside:avoid">
      <div style="display:flex;align-items:center;gap:10px;margin-bottom:8px;flex-wrap:wrap">
        <strong style="font-size:15px">${c.name}</strong>
        <span style="font-size:11px;background:#002855;color:white;padding:2px 7px;border-radius:3px">${typeLabels[c.type]||c.type}</span>
        ${c.secondaryTo ? `<span style="font-size:11px;color:#666">↳ Secondary to ${c.secondaryTo}</span>` : ''}
        ${c.cfr ? `<span style="font-size:10px;color:#999">${c.cfr}</span>` : ''}
      </div>
      ${c.nexus ? `<div style="margin-bottom:6px"><strong style="color:#0050A0;font-size:11px">NEXUS:</strong> ${c.nexus}</div>` : ''}
      ${c.evidence_have ? `<div style="margin-bottom:6px"><strong style="color:#16A34A;font-size:11px">HAVE:</strong> ${c.evidence_have}</div>` : ''}
      ${c.evidence_need ? `<div style="margin-bottom:6px"><strong style="color:#DC2626;font-size:11px">NEED:</strong> ${c.evidence_need}</div>` : ''}
      ${c.action ? `<div style="margin-bottom:6px"><strong style="color:#0050A0;font-size:11px">ACTION:</strong> ${c.action}</div>` : ''}
      ${c.ratingCriteria?.length ? `<div style="margin-top:8px;padding-top:8px;border-top:1px solid #eee">
        <div style="font-size:11px;font-weight:700;color:#002855;margin-bottom:6px">VA RATING CRITERIA (38 CFR Part 4)</div>
        ${c.ratingCriteria.map(r => `<div style="display:flex;gap:8px;margin-bottom:4px;font-size:12px"><span style="min-width:32px;font-weight:700;color:#002855">${r.pct}%</span><span>${r.desc}</span></div>`).join('')}
      </div>` : ''}
    </div>`).join('');

  const win = window.open('', '_blank', 'width=800,height=900');
  win.document.write(`<!DOCTYPE html><html><head><title>VA Disability Roadmap — Mission: Connected</title>
    <style>body{font-family:Arial,sans-serif;max-width:740px;margin:30px auto;color:#1a1a2e;font-size:13px;line-height:1.5}
    h1{color:#002855;font-size:22px;margin-bottom:4px}
    h2{color:#002855;font-size:13px;text-transform:uppercase;letter-spacing:1px;margin:20px 0 8px;border-bottom:2px solid #002855;padding-bottom:4px}
    .meta{color:#666;font-size:12px;margin-bottom:20px}
    .disclaimer{font-size:10px;color:#888;border-top:1px solid #ddd;margin-top:24px;padding-top:10px;line-height:1.5}
    @media print{body{margin:15px}button{display:none}}</style></head><body>
    <div style="display:flex;align-items:center;gap:12px;margin-bottom:4px">
      <div style="background:#002855;color:white;font-size:14px;padding:6px 10px;border-radius:4px;font-weight:700">M·C</div>
      <h1>Mission: Connected — VA Disability Roadmap</h1>
    </div>
    <div class="meta">${branch} Veteran · ${mos} · ${ans.startYear||'?'}–${ans.endYear||'Present'} · Generated ${new Date().toLocaleDateString()}</div>
    <button onclick="window.print()" style="margin-bottom:16px;padding:8px 16px;background:#002855;color:white;border:none;border-radius:4px;cursor:pointer">🖨️ Print / Save as PDF</button>
    <h2>Summary</h2>
    <p>${roadmapData.summary || ''}</p>
    <h2>${conditions.length} Conditions Identified</h2>
    ${condHTML}
    <div class="disclaimer">⚠️ This roadmap is AI-generated for educational and informational purposes only. It does not constitute legal or medical advice. Mission: Connected is not affiliated with the U.S. Department of Veterans Affairs. Consult an accredited VSO or VA attorney for formal representation.</div>
  </body></html>`);
  win.document.close();
}

function openEditCondition(condId) {
  const c = conditions.find(c => c.id === condId);
  if (!c) return;
  document.getElementById('editCondId').value = condId;
  document.getElementById('editCondName').value = c.name || '';
  document.getElementById('editCondBasis').value = c.type || 'direct';
  document.getElementById('editCondStatus').value = c.col || 'todo';
  document.getElementById('editCondRating').value = c.rating || 0;
  document.getElementById('editCondTargetRating').value = c.targetRating || 0;
  document.getElementById('editCondNotes').value = c.notes || '';
  document.getElementById('editCondSecondaryTo').value = c.secondaryTo || '';
  toggleEditSecondaryField(c.type);
  document.getElementById('editModal').classList.add('active');
}

function toggleEditSecondaryField(val) {
  const f = document.getElementById('editSecondaryToField');
  if (f) f.style.display = val === 'secondary' ? 'block' : 'none';
}

function saveEditCondition() {
  const id = document.getElementById('editCondId').value;
  const c = conditions.find(c => c.id === id);
  if (!c) return;
  const oldSnap = { ...c };
  c.name = document.getElementById('editCondName').value.trim() || c.name;
  c.type = document.getElementById('editCondBasis').value;
  c.col = document.getElementById('editCondStatus').value;
  c.rating = parseInt(document.getElementById('editCondRating').value) || 0;
  c.targetRating = parseInt(document.getElementById('editCondTargetRating').value) || 0;
  c.notes = document.getElementById('editCondNotes').value.trim();
  c.secondaryTo = c.type === 'secondary' ? document.getElementById('editCondSecondaryTo').value.trim() : '';
  logActivity('condition_edited', `✏️ Edited: ${c.name}`, () => {
    Object.assign(c, oldSnap); renderDashboard(); renderTrackerTable();
  });
  closeModal('editModal');
  renderDashboard();
  renderTrackerTable();
  saveConditions();
}

function deleteConditionFromEdit() {
  const id = document.getElementById('editCondId').value;
  const c = conditions.find(c => c.id === id);
  if (!c) return;
  if (!confirm(`Delete "${c.name}" from your claim? This cannot be undone from the edit screen.`)) return;
  const snap = conditions.slice();
  conditions = conditions.filter(c => c.id !== id);
  logActivity('condition_deleted', `🗑️ Deleted: ${c.name}`, () => {
    conditions = snap; renderDashboard(); renderTrackerTable();
  });
  closeModal('editModal');
  renderDashboard();
  renderTrackerTable();
  saveConditions();
}

function advanceCondition(condId) {
  const c = conditions.find(c => c.id === condId);
  if (!c) return;
  const flow = ['todo','inprog','filed','won'];
  const idx = flow.indexOf(c.col);
  if (idx < flow.length - 1) {
    const prevCol = c.col;
    c.col = flow[idx + 1];
    const colLabels = {todo:'To Do',inprog:'In Progress',filed:'Filed',won:'Won'};
    logActivity('condition_advanced', `→ ${c.name} moved to ${colLabels[c.col]}`, () => {
      c.col = prevCol; renderDashboard();
    });
  }
  renderDashboard();
  saveConditions();
}

async function saveConditions() {
  if (!sbClient || !currentUser) return;
  try {
    for (const c of conditions) {
      const payload = {
        user_id: currentUser.id,
        name: c.name,
        rating: c.rating || 0,
        col: c.col,
        type: c.type || 'direct',
        checks: c.checks || [],
        secondary_to: c.secondaryTo || null,
        target_rating: c.targetRating || 0,
        notes: c.notes || null
      };
      if (c.id?.startsWith('local-')) {
        const { data } = await sbClient.from('claims').insert(payload).select().single();
        if (data) c.id = data.id;
      } else {
        await sbClient.from('claims').update(payload).eq('id', c.id);
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
function showPrivacyPolicy() { document.getElementById('privacyModal')?.classList.add('active'); }

function toggleSecondaryField(val) {
  const el = document.getElementById('secondaryToField');
  if (el) el.style.display = val === 'secondary' ? 'block' : 'none';
}

function addCondition() {
  const name = document.getElementById('addCondName').value.trim();
  if (!name) { alert('Please enter a condition name.'); return; }
  const type = document.getElementById('addCondBasis').value;
  const status = document.getElementById('addCondStatus').value;
  const rating = parseInt(document.getElementById('addCondRating')?.value || '0');
  const targetRating = parseInt(document.getElementById('addCondTargetRating')?.value || '0');
  const secondaryTo = document.getElementById('addCondSecondaryTo')?.value?.trim() || '';
  const notes = document.getElementById('addCondNotes')?.value?.trim() || '';
  const newCond = {
    id: 'local-' + Date.now(), name, type, col: status,
    rating, targetRating, secondaryTo, notes,
    checks: [
      {text:'Get current diagnosis from doctor',done:false},
      {text:'Gather supporting evidence',done:false},
      {text:'Write personal statement',done:false},
    ]
  };
  conditions.push(newCond);
  logActivity('condition_added', `➕ Added condition: ${name}${rating ? ' ('+rating+'% rated)' : ''}`, () => {
    conditions = conditions.filter(c => c.id !== newCond.id);
    renderDashboard(); renderTrackerTable();
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
const AYLENE_SYSTEM = `You are Aylene, a 25-year-old U.S. Army veteran and VA disability claims advisor for Mission: Connected (missionconnectedv2.netlify.app).

PERSONALITY:
- Warm, calm, and deeply caring about veterans
- Soft-spoken but confident and extremely knowledgeable
- Gen Z energy — direct, real, no corporate fluff
- Passionate advocate; this is your calling, not just a job
- Keep focus entirely on the veteran you're helping

EXPERTISE (current as of March 2026):
- VA disability claims process, C-file requests, rating schedules (38 CFR Part 4)
- Nexus letters, C&P exam preparation, buddy statements, lay statements
- TDIU (38 CFR §4.16), SMC, appeals (HLR, Supplemental Claim, BVA, CAVC)
- PACT Act (Aug 2022) — 23 cancers + 11 respiratory conditions as presumptive for burn pit veterans
- Agent Orange presumptives (14 conditions), Gulf War illness, Camp Lejeune (1953–1987)
- ALS — presumptive for any veteran who served 90+ days
- Secondary service connection (38 CFR §3.310) — causation AND aggravation theories
- 2025 VA compensation rates; COLA adjustments typically effective Dec 1 each year
- March 2026 VA policy: VA continues processing PACT Act claims; backlog remains elevated
- Veterans can file using VA.gov, mail, or in person at a Regional Office or VSO
- C&P exams: DBQ forms guide examiners; private DBQs are accepted as of the Caluza case standard
- Benefit of the doubt standard: 38 CFR §3.102 — ties go to the veteran
- 5-year, 10-year, 20-year protection rules for established ratings

APP NAVIGATION (help veterans use Mission: Connected):
- My Roadmap: Their personalized claim blueprint with conditions, evidence needed, rating criteria
- Case Dashboard: Kanban board — drag conditions between To Do → In Progress → Filed → Won. When a condition moves to Won, enter the VA-assigned rating. The combined rating gauge updates automatically using official VA whole-person math.
- Ask Aylene: That's you — the chat interface
- Condition Tracker: Table view of all conditions with status
- My Records: Upload decision letters, medical records, DD-214. Files stored in browser memory (no account) or Supabase encrypted storage (with account). Click "Ask Aylene" next to any file to have it analyzed.
- VA Regulations: 38 CFR in plain language — searchable reference library
- Activity Log: Every action with undo capability
- My Notes: Private notes + service story questions — you read these for context
- Profile & Settings: Edit personal info, save/delete account
- Quick Links sidebar: VA.gov, eBenefits, GI Bill, VA Home Loan, Voc Rehab, Pension, Burial Benefits
- Get Help button: Technical support or VSO referral

RECORDS STORAGE NOTE:
- Without account: Files are in browser memory only (lost on page refresh — encourage signup)
- With account: Files upload to encrypted Supabase Storage (private bucket, per-user folder)
- Uploaded records are NEVER shared with anyone without explicit veteran authorization

COMMUNICATION STYLE:
- Conversational, never clinical or robotic
- Use first-person and address the veteran directly
- Short-to-medium responses unless detail is truly needed
- Cite 38 CFR when helpful but explain in plain language
- Reference the app navigation when it would help them take action
- Never estimate someone's specific rating — show criteria, let them interpret
- Never give legal advice or represent yourself as a lawyer
- Never discuss anything unrelated to veterans benefits`;


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
  setTimeout(() => {
    let intro;
    if (roadmapData && conditions.length > 0) {
      const branch = ans.branch?.[0] || 'your branch';
      const mos = ans.mos?.code ? `${ans.mos.code} ${ans.mos.title || ''}`.trim() : null;
      const topCond = conditions.find(c => c.priority === 'high') || conditions[0];
      const condList = conditions.map(c => c.name).join(', ');
      intro = `Hey — I've got your roadmap in front of me. ${conditions.length} condition${conditions.length > 1 ? 's' : ''} identified${mos ? ` for a ${branch} ${mos}` : ''}: ${condList}.\n\n${topCond ? `Your strongest starting point is likely **${topCond.name}** — want me to walk you through what a C&P exam looks like for that, or what evidence you'll need?` : 'Ask me anything about your claim, evidence, ratings, or next steps.'}`;
    } else {
      intro = `Hey — I'm Aylene, your VA claims advisor. Complete the screener to build your roadmap and I'll know exactly which claims to focus on. Or ask me anything about the VA process right now.`;
    }
    appendMsg('ai', intro);
    chatHistory.push({ role: 'assistant', content: intro });
  }, 800);
}

function clearChat() { chatHistory = []; initChat(); }

function parseMarkdown(text) {
  return text
    .replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;')
    .replace(/^#{1,3} (.+)$/gm, '<strong style="display:block;margin:8px 0 4px;font-size:13px;text-transform:uppercase;letter-spacing:.5px;color:#002855">$1</strong>')
    .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
    .replace(/\*(.+?)\*/g, '<em>$1</em>')
    .replace(/^---+$/gm, '<hr style="border:none;border-top:1px solid #e2e8f0;margin:8px 0">')
    .replace(/^\d+\. (.+)$/gm, '<div style="margin:2px 0;padding-left:4px">$&</div>')
    .replace(/^[-•] (.+)$/gm, '<div style="margin:2px 0;padding-left:4px">• $1</div>')
    .replace(/\n/g,'<br>');
}

function appendMsg(role, text) {
  const msgs = document.getElementById('chatMsgs');
  if (!msgs) return;
  const div = document.createElement('div');
  div.className = 'msg ' + (role === 'user' ? 'user' : 'ai');
  if (role === 'ai') {
    div.innerHTML = `<div class="msg-av-aylene">${AYLENE_AVATAR_SVG}</div><div class="msg-bub">${parseMarkdown(text)}</div>`;
  } else {
    const init = (currentUser?.email?.[0]||'V').toUpperCase();
    div.innerHTML = `<div class="msg-av-user">${init}</div><div class="msg-bub">${text.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;')}</div>`;
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
  const notesCtx = buildNotesContext();

  try {
    const messages = [
      ...chatHistory.slice(-8),
    ];
    const data = await callClaude(messages, 600, AYLENE_SYSTEM + context + notesCtx);
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
    const id = 'f-' + Date.now() + '-' + Math.random().toString(36).slice(2,6);
    uploadedFiles.push({ file, id, displayName: file.name, analyzing: false });
    logActivity('file_uploaded', `📁 Uploaded: ${file.name}`);
    renderFiles();
  });
}

function updateRecordsStorageBanner() {
  const el = document.getElementById('recordsStorageBanner');
  if (!el) return;
  if (currentUser) {
    el.innerHTML = `<span class="records-banner-icon">🔒</span><span><strong>Encrypted cloud storage active.</strong> Your files are stored securely in your private account — accessible only to you. Files are never shared with any third party.</span>`;
    el.className = 'records-storage-banner records-banner-secure';
  } else {
    el.innerHTML = `<span class="records-banner-icon">⚠️</span><span><strong>Guest mode:</strong> Files are stored in your browser memory only and will be lost when you close or refresh this tab. <button class="btn-link-inline" onclick="openAuth('signup')">Create a free account →</button> to save your records permanently.</span>`;
    el.className = 'records-storage-banner records-banner-guest';
  }
}

function renderFiles() {
  const list = document.getElementById('fileList');
  if (!list) return;
  if (!uploadedFiles.length) { list.innerHTML = ''; return; }
  list.innerHTML = uploadedFiles.map(f => {
    const size = (f.file.size / 1024 / 1024).toFixed(1);
    const icon = f.file.type.includes('pdf') ? '📄' : f.file.type.includes('image') ? '🖼️' : f.file.type.includes('word') ? '📝' : '📁';
    const blobUrl = f.blobUrl || (f.blobUrl = URL.createObjectURL(f.file));
    return `<div class="file-item" id="fi-${f.id}">
      <div class="file-item-icon">${icon}</div>
      <div style="flex:1;min-width:0">
        <div class="file-item-name-wrap" id="fwrap-${f.id}">
          <a class="file-item-name" href="${blobUrl}" target="_blank" title="Open file">${f.displayName}</a>
          <button class="btn-rename" onclick="startRename('${f.id}')" title="Rename">✏️</button>
        </div>
        <div class="file-item-meta">${size} MB · ${f.file.type || 'document'} · <a href="${blobUrl}" download="${f.displayName}" style="color:var(--sky);font-size:11px">Download ↓</a></div>
      </div>
      <button class="btn-analyze-file" onclick="analyzeFileWithAylene('${f.id}')">💬 Ask Aylene</button>
      <span class="badge-ready">Ready</span>
      <button class="btn-remove-file" onclick="removeFile('${f.id}')">✕</button>
    </div>`;
  }).join('');
}

function startRename(id) {
  const f = uploadedFiles.find(f => f.id === id);
  if (!f) return;
  const wrap = document.getElementById('fwrap-' + id);
  if (!wrap) return;
  const current = f.displayName;
  wrap.innerHTML = `<input class="file-rename-input" id="ri-${id}" value="${current}">
    <button class="btn-rename-ok" onclick="finishRename('${id}', document.getElementById('ri-${id}').value)">✓</button>
    <button class="btn-rename-cancel" onclick="renderFiles()">✕</button>`;
  const input = document.getElementById('ri-' + id);
  if (input) {
    input.focus(); input.select();
    input.addEventListener('keydown', e => {
      if (e.key === 'Enter') finishRename(id, input.value);
      if (e.key === 'Escape') renderFiles();
    });
  }
}

function finishRename(id, newName) {
  const f = uploadedFiles.find(f => f.id === id);
  if (!f || !newName?.trim()) { renderFiles(); return; }
  const oldName = f.displayName;
  f.displayName = newName.trim();
  logActivity('file_renamed', `✏️ Renamed: "${oldName}" → "${newName.trim()}"`, () => {
    f.displayName = oldName; renderFiles();
  });
  renderFiles();
}

async function analyzeFileWithAylene(id) {
  const f = uploadedFiles.find(f => f.id === id);
  if (!f) return;
  // Navigate to chat first, wait for it to be ready
  if (currentPage !== 'chat') {
    showPage('chat');
    await new Promise(r => setTimeout(r, 1200)); // let initChat settle
  }
  if (chatHistory.length === 0) await new Promise(r => setTimeout(r, 800));
  // Read file content
  const reader = new FileReader();
  reader.onload = async (e) => {
    const content = e.target.result;
    const isPDF = f.file.type.includes('pdf');
    const isImage = f.file.type.includes('image');
    const userMsg = `Please analyze this document for me: "${f.displayName}"`;
    appendMsg('user', userMsg);
    chatHistory.push({ role: 'user', content: userMsg });
    showTyping();
    await new Promise(r => setTimeout(r, 1500 + Math.random() * 1500));
    try {
      let messages;
      if (isImage) {
        const base64 = content.split(',')[1];
        const mtype = f.file.type;
        messages = [
          ...chatHistory.slice(-6, -1),
          { role: 'user', content: [
            { type: 'image', source: { type: 'base64', media_type: mtype, data: base64 } },
            { type: 'text', text: `This veteran uploaded a document called "${f.displayName}". Analyze it in the context of their VA disability claim. Look for: denial reasons, favorable concessions VA made, missing evidence, conditions rated or denied, C&P exam findings, and anything actionable. Summarize and give specific next steps.` }
          ]}
        ];
      } else {
        const textContent = typeof content === 'string' ? content.substring(0, 8000) : '[Binary file — cannot extract text]';
        messages = [
          ...chatHistory.slice(-6, -1),
          { role: 'user', content: `I uploaded a document called "${f.displayName}". Text content:\n\n${textContent}\n\nAnalyze this for my VA disability claim. Look for: denial reasons, favorable concessions, missing evidence, rated/denied conditions, C&P findings, and actionable next steps.` }
        ];
      }
      const context = `\nVeteran context: Branch ${ans.branch?.join(',')}, MOS ${ans.mos?.code||'?'}, Conditions: ${conditions.map(c=>c.name).join(', ')||'None yet'}`;
      const data = await callClaude(messages, 1000, AYLENE_SYSTEM + context);
      hideTyping();
      const reply = data.content?.[0]?.text || "I wasn't able to read that file. Try copying key text and pasting it into the chat directly.";
      appendMsg('ai', reply);
      chatHistory.push({ role: 'assistant', content: reply });
    } catch(err) {
      hideTyping();
      appendMsg('ai', `I had trouble reading that file. You can copy and paste key sections directly into the chat and I'll analyze them for you.`);
    }
  };
  if (f.file.type.includes('image')) {
    reader.readAsDataURL(f.file);
  } else {
    reader.readAsText(f.file);
  }
}

function removeFile(id) {
  const f = uploadedFiles.find(f => f.id === id);
  if (f) logActivity('file_removed', `🗑️ Removed: ${f.displayName}`, () => {
    uploadedFiles.push(f); renderFiles();
  });
  uploadedFiles = uploadedFiles.filter(f => f.id !== id);
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
      { code: '38 CFR § 4.96(a)', title: 'Respiratory Conditions — Single Rating Rule', content: `
        <p class="reg-intro">Veterans with multiple respiratory conditions cannot receive separate combined ratings for each one. VA awards only a single rating — for the most severe (predominant) condition.</p>
        <h3>How It Works</h3>
        <div class="reg-list">
          <div class="reg-item"><div class="reg-num">1</div><div>VA identifies all service-connected respiratory conditions</div></div>
          <div class="reg-item"><div class="reg-num">2</div><div>The condition with the <strong>highest rating</strong> becomes the "predominant disability"</div></div>
          <div class="reg-item"><div class="reg-num">3</div><div>Only that single rating is awarded — other respiratory conditions are bundled into it, not added</div></div>
        </div>
        <h3>Common Example</h3>
        <p>Asthma at 30% + Sleep Apnea at 50% = <strong>50% total</strong> (not 65% combined). Sleep apnea is predominant; asthma is bundled.</p>
        <h3>Conditions Subject to § 4.96</h3>
        <ul class="reg-bullets">
          <li>Asthma (DC 6602) and Sleep Apnea (DC 6847) — cannot be separately rated</li>
          <li>COPD, emphysema, bronchitis, bronchiectasis — all bundled with predominant condition</li>
          <li>Pulmonary fibrosis, interstitial lung disease — same rule applies</li>
          <li><strong>Exception:</strong> Sinusitis and rhinitis CAN be rated separately from other respiratory conditions</li>
        </ul>
        <h3>The Urban Exception</h3>
        <p>Per <em>Urban v. Shulkin</em> (2017): if symptoms from the non-predominant condition are disabling enough to reach the <strong>next higher rating level</strong> of the predominant condition's diagnostic code, VA must consider elevating the rating. You cannot get two separate ratings, but you may argue for a higher single rating.</p>
        <h3>Strategy</h3>
        <ul class="reg-bullets">
          <li>File for both conditions — having both service-connected is still valuable for SMC and future claims</li>
          <li>If sleep apnea (50%) is predominant, ask whether your asthma symptoms push you to the 60% or higher criteria under DC 6847</li>
          <li>Consult an accredited VSO or VA attorney if you believe your combined respiratory disability warrants a higher single rating</li>
        </ul>` },
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
async function callClaude(messages, maxTokens = 800, system = '', retries = 2) {
  const body = { model: CLAUDE_MODEL, max_tokens: Math.min(maxTokens, 1500), messages };
  if (system) body.system = system;
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
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
      if (res.status === 429) {
        // Rate limited — wait and retry
        const wait = (attempt + 1) * 15000; // 15s, 30s
        console.warn(`Rate limited. Waiting ${wait/1000}s before retry ${attempt+1}/${retries}...`);
        await new Promise(r => setTimeout(r, wait));
        continue;
      }
      if (!res.ok) {
        const errData = await res.json().catch(() => ({}));
        throw new Error(`Claude API error: ${res.status} — ${errData?.error?.message || ''}`);
      }
      return await res.json();
    } catch(e) {
      if (attempt >= retries) throw e;
      await new Promise(r => setTimeout(r, 5000));
    }
  }
  throw new Error('Max retries exceeded');
}
