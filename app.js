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
let deadlines = [];

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
    if (profile?.roadmap_text) { try { roadmapData = typeof profile.roadmap_text === 'string' ? JSON.parse(profile.roadmap_text) : profile.roadmap_text; } catch(e) { roadmapData = profile.roadmap_text; } }
    if (profile?.notes) { notesData = profile.notes; renderNoteLog(); ['event','impact','treatment','priority'].forEach(renderStoryLog); }
    const { data: claims } = await sbClient.from('claims').select('*').eq('user_id', currentUser.id);
    if (claims?.length) { conditions = claims.map(c => ({ ...c, secondaryTo: c.secondary_to, targetRating: c.target_rating })); }
    if (roadmapData || conditions.length) {
      showView('vApp');
      if (roadmapData) { renderRoadmap(roadmapData); showPage('roadmap'); }
      if (conditions.length) renderDashboard();
    }
  } catch(e) { console.warn('Load error:', e); }
}

// ── VIEW ROUTING ──
function showView(id) {
  document.querySelectorAll('.view').forEach(v => v.classList.remove('active'));
  document.getElementById(id)?.classList.add('active');
  currentView = id;
  if (id === 'vApp' && roadmapData) showAyleneFloat();
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
  if (id === 'notes') { requestAnimationFrame(() => { loadNotes(); ['event','impact','treatment','priority'].forEach(renderStoryLog); }); }
  if (id === 'cpprep') { renderCPPrep(); }
  if (id === 'deadlines') { renderDeadlines(); }
  if (id === 'buddy') { updateBuddyPlaceholders(); }
  if (id === 'timeline') { renderTimeline(); }
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
  // Mental Health (DC 9411 PTSD, DC 9400 GAD, DC 9434 MDD — all use same general schedule)
  'ptsd':             [{pct:10,desc:'Mild/transient symptoms; occupational and social functioning generally satisfactory'},{pct:30,desc:'Occasional decrease in work efficiency; some difficulty with occupational and social tasks under stress'},{pct:50,desc:'Reduced reliability and productivity; panic attacks more than once a week; difficulty understanding complex commands'},{pct:70,desc:'Deficiencies in most areas: work, school, family, judgment, thinking, mood; persistent danger of hurting self/others'},{pct:100,desc:'Total occupational and social impairment; persistent delusions or hallucinations; danger of hurting self/others'}],
  'anxiety':          [{pct:10,desc:'Mild symptoms; occupational and social functioning generally satisfactory'},{pct:30,desc:'Occasional decreases in work efficiency; difficulty with occupational/social tasks under stress'},{pct:50,desc:'Reduced reliability and productivity; panic attacks more than once a week'},{pct:70,desc:'Deficiencies in most areas of work, school, family, judgment, thinking, mood'},{pct:100,desc:'Total occupational and social impairment'}],
  'depression':       [{pct:10,desc:'Mild symptoms; occupational and social functioning generally satisfactory'},{pct:30,desc:'Occasional decreases in work efficiency under stress'},{pct:50,desc:'Reduced reliability and productivity; difficulty maintaining relationships'},{pct:70,desc:'Deficiencies in most areas: work, family, judgment, mood'},{pct:100,desc:'Total occupational and social impairment'}],
  'mst':              [{pct:10,desc:'Mild symptoms; occupational and social functioning generally satisfactory'},{pct:30,desc:'Occasional decreases in work efficiency; difficulty with social tasks'},{pct:50,desc:'Reduced reliability and productivity; panic attacks more than once a week'},{pct:70,desc:'Deficiencies in most areas including judgment, thinking, mood'},{pct:100,desc:'Total occupational and social impairment'}],
  // Respiratory (DC 6602 Asthma, DC 6847 OSA, DC 6604 COPD)
  'asthma':           [{pct:10,desc:'FEV-1 71-80% predicted, OR daily inhalational/oral bronchodilator therapy OR; intermittent inhalational or oral bronchodilator therapy'},{pct:30,desc:'FEV-1 56-70% predicted, OR daily inhalational/oral bronchodilator therapy AND systemic corticosteroids at least monthly'},{pct:60,desc:'FEV-1 40-55% predicted, OR more than one attack per week OR; daily use of systemic (oral or parenteral) corticosteroids'},{pct:100,desc:'FEV-1 less than 40% predicted, OR FEV-1/FVC less than 40%, OR more frequent than weekly attacks, OR use of systemic corticosteroids'}],
  'sleep apnea':      [{pct:0,desc:'Asymptomatic but with documented sleep disorder breathing'},{pct:30,desc:'Persistent daytime hypersomnolence (excessive daytime sleepiness)'},{pct:50,desc:'Requires use of a breathing assistance device (CPAP, BiPAP, oral appliance)'},{pct:100,desc:'Chronic respiratory failure with carbon dioxide retention, or cor pulmonale, or requires tracheostomy'}],
  'copd':             [{pct:10,desc:'FEV-1 71-80% predicted or FEV-1/FVC 70-79%'},{pct:30,desc:'FEV-1 56-70% predicted or FEV-1/FVC 60-69%'},{pct:60,desc:'FEV-1 40-55% predicted or FEV-1/FVC 40-59%'},{pct:100,desc:'FEV-1 less than 40% predicted or FEV-1/FVC less than 40%'}],
  'sinusitis':        [{pct:10,desc:'1-2 incapacitating episodes per year, OR up to 6 non-incapacitating episodes per year'},{pct:30,desc:'3 or more incapacitating episodes per year, OR constant sinusitis with headache, pain, purulent discharge or crusting'}],
  'rhinitis':         [{pct:0,desc:'Allergic rhinitis with polyps if not covered by higher rating for sinusitis'},{pct:10,desc:'Without polyps; with polyps is rated 30% minimum'}],
  // Musculoskeletal
  'lumbar':           [{pct:10,desc:'Flexion limited to 60°, or characteristic pain on motion'},{pct:20,desc:'Flexion limited to 40°, or combined range of motion limited to 120°'},{pct:40,desc:'Flexion limited to 30°'},{pct:50,desc:'Flexion limited to 30° with muscle spasm on extreme forward bending'},{pct:100,desc:'Unfavorable ankylosis of the entire thoracolumbar spine'}],
  'cervical':         [{pct:10,desc:'Forward flexion to 30-45°, or combined ROM 170-335°'},{pct:20,desc:'Forward flexion 15-30°, or combined ROM 100-170°'},{pct:30,desc:'Forward flexion to 15° or less, or combined ROM under 100°'},{pct:40,desc:'Unfavorable ankylosis in mild degree'}],
  'knee':             [{pct:10,desc:'Slight recurrent subluxation or lateral instability, painful motion, or slight instability'},{pct:20,desc:'Moderate recurring subluxation or lateral instability; pain on motion'},{pct:30,desc:'Severe recurrent subluxation or lateral instability daily; knee brace required'}],
  'shoulder':         [{pct:10,desc:'Forward flexion to 91-170°, or abduction to 91-170°'},{pct:20,desc:'Forward flexion to 61-90°, or abduction to 61-90°'},{pct:30,desc:'Forward flexion to 31-60°, or abduction to 31-60°'},{pct:40,desc:'Forward flexion to 30° or less, or complete ankylosis in favorable position'}],
  'hip':              [{pct:10,desc:'Flexion limited to 0-30° or extension limited, abduction limited to 10°'},{pct:20,desc:'Flexion limited to less than 30° or abduction limited to 0-10°'},{pct:40,desc:'Intermediate degrees of unfavorable ankylosis'}],
  'ankle':            [{pct:10,desc:'Dorsiflexion limited to less than 30°, or plantar flexion limited to less than 30°'},{pct:20,desc:'Marked limited motion of ankle'}],
  'flat foot':        [{pct:10,desc:'Unilateral — marked, with pain on use, accentuated on prolonged standing'},{pct:20,desc:'Bilateral — marked, with pain on use, accentuated on prolonged standing'}],
  // Neurological
  'tinnitus':         [{pct:10,desc:'Tinnitus, recurrent. Note: 10% is the maximum single bilateral rating regardless of severity (DC 6260). File both ears together — only one 10% rating is assigned.'}],
  'hearing loss':     [{pct:0,desc:'0% to 100% based on audiogram results — pure tone average and speech discrimination score. Rating is determined from a VA grid table combining both values. VA must administer the audiogram; a private one can be submitted too.'}],
  'migraines':        [{pct:0,desc:'Less frequent attacks'},{pct:10,desc:'Characteristic prostrating attacks averaging 1 per month over last several months'},{pct:30,desc:'Characteristic prostrating attacks occurring on average once a month over the last several months'},{pct:50,desc:'Very frequent completely prostrating and prolonged attacks productive of severe economic inadaptability'}],
  'peripheral neuropathy': [{pct:10,desc:'Mild; paresthesias only, no motor involvement'},{pct:20,desc:'Moderate; paresthesias interfering with daily activity, slight muscle wasting'},{pct:40,desc:'Moderately severe; incomplete paralysis, muscle atrophy'},{pct:60,desc:'Severe; complete or nearly complete paralysis'}],
  'tbi':              [{pct:10,desc:'Cognitive impairment; mild memory loss, occasional forgetfulness'},{pct:40,desc:'Moderate; pronounced impairment affecting most complex daily activities'},{pct:70,desc:'Moderately severe; impairment in several cognitive domains'},{pct:100,desc:'Severe; total occupational and social impairment'}],
  // Cardiovascular
  'hypertension':     [{pct:10,desc:'Diastolic 100-109 mm/Hg, OR systolic 160-199 mm/Hg (or minimum evaluation if on continuous medication)'},{pct:20,desc:'Diastolic 110-119 mm/Hg, OR systolic 200+ mm/Hg'},{pct:40,desc:'Diastolic 120+ mm/Hg'},{pct:60,desc:'Diastolic 130+ mm/Hg'}],
  'ischemic heart':   [{pct:10,desc:'Workload greater than 7 METs but no more than 10 METs results in dyspnea, fatigue, angina; OR continuous medication required'},{pct:30,desc:'Workload greater than 5 METs but no more than 7 METs results in dyspnea'},{pct:60,desc:'More than one episode of acute congestive heart failure in the past year; OR workload of 3-5 METs'},{pct:100,desc:'Chronic congestive heart failure, workload of 3 METs or less, or ejection fraction of 30% or less'}],
  // Gastrointestinal
  'gerd':             [{pct:10,desc:'Two or more episodes of esophagitis, or two or more hospitalizations; OR continuous medication required'},{pct:30,desc:'Daily esophageal regurgitation, heartburn, and pyrosis with two or more episodes of esophagitis per year'}],
  'ibs':              [{pct:0,desc:'Mild IBS'},{pct:10,desc:'Moderate irritable colon syndrome with occasional mucous discharge, with disturbances of bowel function with lower abdominal cramps'},{pct:30,desc:'Severe irritable colon syndrome — diarrhea, or alternating diarrhea and constipation, with more or less constant abdominal distress'}],
  // Other common
  'diabetes':         [{pct:10,desc:'Manageable by restricted diet only'},{pct:20,desc:'Requires insulin, restricted diet, or oral hypoglycemic agent'},{pct:40,desc:'Requires insulin and restricted diet with episodes of ketoacidosis or hypoglycemic reactions requiring hospitalization'},{pct:60,desc:'Requires insulin and restricted diet; regulation of activities'},{pct:100,desc:'Causing acidosis or coma at least once a year, OR requiring daily insulin, plus restricted diet, plus regulation of activities'}],
  'fibromyalgia':     [{pct:10,desc:'Widespread musculoskeletal pain with associated fatigue — symptoms require continuous medication for control'},{pct:20,desc:'Episodes of widespread musculoskeletal pain with fatigue, cognitive symptoms, and sleep disturbance occurring more than one-third of the time'},{pct:40,desc:'Constant or nearly constant widespread musculoskeletal pain and fatigue, refractory to therapy'}],
  'chronic fatigue':  [{pct:10,desc:'Debilitating fatigue, cognitive impairments, or a combination of other signs and symptoms that are episodic (about 10-25% of the time)'},{pct:20,desc:'Debilitating fatigue, cognitive impairments, or a combination of symptoms that are episodic (about 25-50% of the time)'},{pct:40,desc:'Debilitating fatigue, cognitive impairments, or symptoms 50-75% of the time'},{pct:60,desc:'Nearly constant debilitating fatigue, cognitive impairments, or symptoms'}],
  'erectile':         [{pct:0,desc:'Erectile dysfunction is rated 0% — but if service-connected, it qualifies for Special Monthly Compensation (SMC-K) which adds approximately $130/month on top of your combined rating. Always file even at 0%.'}],
  // Default fallback
  'default':          [{pct:10,desc:'Mild — minimal symptoms with little functional impairment; controllable with treatment'},{pct:30,desc:'Moderate — occasional symptoms affecting occupational and social function'},{pct:50,desc:'Moderately severe — significant impact on daily and occupational function'},{pct:70,desc:'Severe — frequent and debilitating symptoms affecting most areas of life'},{pct:100,desc:'Total — complete occupational and social impairment'}]
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
        // Explicitly set the session so RLS recognizes auth.uid() before we upsert
        if (result.data?.session) {
          await sbClient.auth.setSession({
            access_token: result.data.session.access_token,
            refresh_token: result.data.session.refresh_token
          });
        }
        // Retry upsert up to 3x to handle session propagation delay
        let upsertOk = false;
        for (let attempt = 0; attempt < 3; attempt++) {
          const { error: upsertErr } = await sbClient.from('profiles').upsert({
            id: result.data.user.id,
            screener_data: ans,
            full_name: fullName, phone, state,
            birth_month: birthMonth, birth_year: birthYear
          }, { onConflict: 'id' });
          if (!upsertErr) { upsertOk = true; break; }
          console.warn(`Profile upsert attempt ${attempt+1} failed:`, upsertErr.message);
          await new Promise(r => setTimeout(r, 800 * (attempt + 1)));
        }
        if (!upsertOk) console.warn('Profile upsert failed after 3 attempts — trigger will handle it on next login');
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
    const { error: re } = await sbClient.from('profiles').upsert({
      id: currentUser.id, screener_data: ans, roadmap_text: roadmapData
    }, { onConflict: 'id' });
    if (re) console.warn('saveRoadmap upsert error:', re.message, re.code);
  } catch(e) { console.warn('saveRoadmap exception:', e); }
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
  // Screen 15 (followups) is now skipped — no need to load
}

function nextScreen() {
  if (currentScreen >= 14) { buildRoadmap(); return; } // Skip screen 15 (followup Qs) - roadmap prompt handles context
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
    el.innerHTML = `<div class="mos-code">${m.code}</div><div class="mos-label">${m.label||m.title||''}</div><div class="mos-tags"></div><div class="mos-check">✓</div>`;
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
    <div>${(m.tags||[]).filter(t=>t!=='TERA').map(t=>`<span class="intel-tag intel-blue">${t}</span>`).join('')}</div>
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

// ── ROADMAP JSON REPAIR ──
// The AI sometimes produces JSON with unescaped apostrophes, literal newlines, or
// trailing commas inside string values. This function repairs the most common cases.
function safeParseRoadmapJSON(raw) {
  // First attempt: direct parse
  try { return JSON.parse(raw); } catch(e1) {}

  // Second attempt: sanitize common issues inside string values
  let fixed = raw;

  // Remove any literal control characters inside strings (newlines, tabs embedded in values)
  // Strategy: walk char by char, track if inside string, escape problematic chars
  try {
    fixed = repairJSON(raw);
    return JSON.parse(fixed);
  } catch(e2) {}

  // Third attempt: extract just the fields we need via regex fallback
  try {
    return extractRoadmapFields(raw);
  } catch(e3) {
    throw new Error('Could not parse roadmap JSON: ' + e1?.message);
  }
}

function repairJSON(str) {
  let result = '';
  let inString = false;
  let escape = false;

  for (let i = 0; i < str.length; i++) {
    const ch = str[i];

    if (escape) {
      result += ch;
      escape = false;
      continue;
    }

    if (ch === '\\') {
      escape = true;
      result += ch;
      continue;
    }

    if (ch === '"') {
      inString = !inString;
      result += ch;
      continue;
    }

    if (inString) {
      // Escape literal control characters that break JSON
      if (ch === '\n') { result += '\\n'; continue; }
      if (ch === '\r') { result += '\\r'; continue; }
      if (ch === '\t') { result += '\\t'; continue; }
      // Unescaped single quotes are fine in JSON strings — skip
      result += ch;
    } else {
      // Outside strings: remove trailing commas before ] or }
      if (ch === ',' ) {
        // Look ahead for closing bracket
        let j = i + 1;
        while (j < str.length && /\s/.test(str[j])) j++;
        if (str[j] === ']' || str[j] === '}') {
          continue; // skip trailing comma
        }
      }
      result += ch;
    }
  }
  return result;
}

function extractRoadmapFields(str) {
  // Last resort: regex extract key fields
  const get = (key) => { const m = str.match(new RegExp('"' + key + '"\\s*:\\s*"([^"]*)"')); return m?.[1] || ''; };
  const getNum = (key) => { const m = str.match(new RegExp('"' + key + '"\\s*:\\s*(\\d+)')); return m ? parseInt(m[1]) : 0; };

  // Extract conditions array as best we can
  const condMatches = [...str.matchAll(/"name"\s*:\s*"([^"]+)"/g)];
  const conditions = condMatches.map((m, i) => ({
    name: m[1], type: 'direct', priority: 'high', filing_order: i+1,
    targetRating: 0, nexus: '', evidence_have: '', evidence_need: '',
    options: [], action: 'See your roadmap for details', secondaryTo: '', cfr: '', checks: []
  }));

  return {
    summary: get('summary') || 'Roadmap generated — review your conditions below.',
    pathway: get('pathway') || 'DIRECT',
    strategy: get('strategy') || '',
    filing_sequence: get('filing_sequence') || '',
    totalConditions: conditions.length || getNum('totalConditions'),
    conditions,
    tdiu: false, tdiu_note: '', pact_note: get('pact_note') || '',
    top_action: get('top_action') || ''
  };
}

// ── ROADMAP BUILDER ──
async function buildRoadmap() {
  goToScreen(16);
  setTimeout(startC101Carousel, 100);
  const loadingSteps = ['ls1','ls2','ls3','ls4','ls5','ls6'];
  let step = 0;
  const stepInterval = setInterval(() => {
    if (step > 0) { document.getElementById(loadingSteps[step-1])?.classList.add('done'); document.getElementById(loadingSteps[step-1])?.classList.remove('active'); }
    if (step < loadingSteps.length) { document.getElementById(loadingSteps[step])?.classList.add('active'); }
    step++;
    if (step > loadingSteps.length) clearInterval(stepInterval);
  }, 1800);

  const mosLabel = ans.mos?.label || ans.mos?.title || '';

  // ══════════════════════════════════════════════════════════════
  // COMPREHENSIVE PATHWAY CLASSIFIER
  // Covers all eras, all branches, all major VA legal pathways.
  // Each flag is mutually informed — a veteran can trigger multiple.
  // ══════════════════════════════════════════════════════════════

  const deps = ans.deployments || [];
  const exps = ans.exposures || [];
  const evts = ans.events || [];
  const syms = ans.symptoms || [];
  const dx   = ans.diagnoses || [];
  const branch = (ans.branch || []).join('/').toLowerCase();
  const moscode = (ans.mos?.code || '').toUpperCase();
  const allText = [...deps, ...exps, ...evts, ...syms, ...dx].join(' ').toLowerCase();

  // ── ERA / DEPLOYMENT FLAGS ──
  const isPostGulfWar = deps.some(d => /gulf|kuwait|iraq|saudi|bahrain|qatar|oman|uae|jordan|lebanon|syria|yemen|djibouti|afghanistan|uzbekistan|sinai|egypt|somalia/i.test(d)) ||
    (ans.startYear >= 1990 && allText.includes('southwest asia'));
  const isVietnamEra = deps.some(d => /vietnam|thailand|korea.*dmz|laos|cambodia|guam/i.test(d)) ||
    (ans.startYear >= 1962 && ans.endYear <= 1975);
  const isKoreanEra = deps.some(d => /korea/i.test(d)) && (ans.startYear >= 1950 && ans.endYear <= 1954);
  const isPost911 = deps.some(d => /afghanistan|iraq|oif|oef|enduring|freedom|iraqi/i.test(d)) ||
    (ans.startYear >= 2001 && isPostGulfWar);
  const hasBurnPit = exps.some(e => /burn.?pit|open.?air|airborne.?hazard/i.test(e)) || isPost911;

  // ── SPECIFIC EXPOSURE FLAGS ──
  const hasAgentOrange = isVietnamEra ||
    deps.some(d => /vietnam|thailand|korea.*dmz|johnston.?island|guam/i.test(d)) ||
    exps.some(e => /agent.?orange|herbicide|dioxin/i.test(e));
  const hasCampLejeune = evts.some(e => /lejeune/i.test(e)) || exps.some(e => /lejeune|contaminated.?water/i.test(e)) ||
    (branch.includes('marine') && ans.startYear >= 1953 && ans.startYear <= 1987);
  const hasRadiation = exps.some(e => /radiation|nuclear|atomic|depleted.?uranium|ionizing/i.test(e)) ||
    evts.some(e => /hiroshima|nagasaki|nuclear.?test|enewetak|palomares|thule/i.test(e));
  const hasMustardGas = exps.some(e => /mustard.?gas|lewisite|vesicant|blister.?agent/i.test(e));
  const hasAsbestos = exps.some(e => /asbestos/i.test(e)) ||
    (branch.includes('navy') || branch.includes('marine') || branch.includes('coast')) ||
    /mm|en|ht|mr|dc|bf|boiler|engine|shipyard|seabee|11c|combat.?engineer|12b/i.test(moscode + ' ' + allText);
  const hasPfas = exps.some(e => /pfas|afff|aqueous.?film|firefighting.?foam/i.test(e)) ||
    (branch.includes('air force') || branch.includes('coast')) ||
    /fire.?fight|crash.?rescue|afsc.*1d|3e/i.test(allText);

  // TERA: CONUS training toxic exposure (NOT a PACT presumptive — direct SC pathway)
  const hasTeraTraining = ans.mos?.tera &&
    exps.some(e => /chemical|solvent|cbrn|sarin|vx|nerve.?agent|mustard|lead|depleted/i.test(e)) &&
    !isPostGulfWar && !isVietnamEra;

  // TRUE PACT ACT (overseas qualifying service or specific covered exposures)
  const hasPactAct = isPostGulfWar || hasBurnPit || hasAgentOrange || hasCampLejeune || hasRadiation || hasMustardGas;

  // ── MOS / BRANCH OCCUPATIONAL FLAGS ──
  const highNoiseExposure =
    /11b|11c|11x|13b|13f|13m|19d|19k|15t|15u|31b|0311|0331|0341|0351|0621|infantry|armor|cav|artillery|tanker|paratrooper/i.test(moscode + ' ' + mosLabel) ||
    /gunner|pilot|crew.?chief|door.?gunner|aviation.?mechanic|naval.?gunfire|deck.?crew|abh|abe|machinist|boilerman|engineman/i.test(mosLabel + ' ' + allText) ||
    /heavy.?equipment|combat.?engineer|seabee|explosive|ordinance|eod/i.test(mosLabel + ' ' + allText);

  const heavyPhysicalMOS =
    /11b|11c|19d|19k|31b|88m|92a|68w|0311|0331|0621|infantry|mp|military.?police|combat|paratrooper|ranger|special.?forces|sapper|engineer|mechanic|91|92/i.test(moscode + ' ' + mosLabel) ||
    branch.includes('marine') || /seabee|cb|construction.?battalion/i.test(allText);

  const chemBioMOS = /74d|74b|cbrn|chemical|biological|radiological|nuclear|nuclear.?medical|aoc|chemical.?officer/i.test(moscode + ' ' + mosLabel);

  const intelAdminMOS = /35|96|09|42a|56m|25u|15p|admin|intel|signal|s2|g2|j2|analyst|linguist/i.test(moscode + ' ' + mosLabel);

  const medicalMOS = /68w|68|91|corpsman|hm|medic|pa|nurse|medical|dental|68d|68e|68f|68g|68j|68k|68p|68q|68r|68s|68t|68v|68w|68x|68y/i.test(moscode + ' ' + mosLabel);

  // ── SPECIAL CIRCUMSTANCES ──
  const hasMST = evts.some(e => /sexual.?trauma|mst|assault|rape|harassment/i.test(e)) ||
    syms.some(s => /mst|sexual.?trauma/i.test(s));
  const isPOW = evts.some(e => /prisoner.?of.?war|pow|captured|internment/i.test(e));
  const hasCombatService = evts.some(e => /combat|hostile|idf|mortar|ied|firefight|direct.?fire|ambush|convoy.?attack/i.test(e)) || isPost911;
  const hasPriorRating = ans.ratedConds?.length > 0;
  const isReserveGuard = /reserve|guard|ng|national.?guard|arng|usar|usnr|usmcr|afrc|ang|uscgr/i.test(ans.component + ' ' + allText);

  // ── BUILD PATHWAY CONTEXT ──
  const pathwayLines = [];

  // 1. PACT ACT (highest priority — covers most post-1990 veterans with overseas service)
  if (hasPactAct) {
    let pactDetail = '';
    if (hasAgentOrange) pactDetail += 'Agent Orange/herbicide exposure (Vietnam/Thailand/Korea DMZ). Covered conditions: Type 2 diabetes, ischemic heart disease, Parkinsons disease, peripheral neuropathy, various cancers, hypertension (added 2025), MGUS (added 2025), AL amyloidosis, hypothyroidism, bladder cancer, Parkinsonism, bladder cancer, B-cell leukemia. ';
    if (isPostGulfWar && !isPost911) pactDetail += 'Gulf War service (SW Asia 1990-present). Covered: Chronic Fatigue Syndrome, fibromyalgia, functional GI disorders (IBS, dyspepsia), undiagnosed multi-symptom illnesses (Gulf War Syndrome) — do NOT require specific diagnosis, just chronic 10%+ symptoms for 6 months. ';
    if (isPost911 || hasBurnPit) pactDetail += 'Post-9/11/burn pit exposure. Covered: Respiratory conditions (constrictive bronchiolitis, obliterative bronchiolitis, constrictive pericarditis, sarcoidosis, sinusitis, rhinitis, laryngitis, pharyngitis, rhinosinusitis), cancers (head/neck, respiratory, GI, urinary, genitourinary, reproductive, lymphatic, blood cancers including leukemias/myeloma added Jan 2025), granulomatous disease. ';
    if (hasCampLejeune) pactDetail += 'Camp Lejeune contaminated water (1953-1987): 8 covered conditions — non-Hodgkin lymphoma, adult leukemia, aplastic anemia, bladder cancer, kidney cancer, liver cancer, multiple myeloma, Parkinsons disease. Also: PFAS-related conditions if applicable. ';
    if (hasRadiation) pactDetail += 'Ionizing radiation exposure. Covered: 21 specific cancers. Must have participated in atmospheric nuclear testing, post-WWII Japan occupation, or other qualifying radiation-risk activities. ';
    if (hasMustardGas) pactDetail += 'Mustard gas/Lewisite experimental exposure. Covered: Chronic laryngitis, rhinitis, sinusitis, anosmia, bronchitis, asthma, COPD, keratitis, corneal scarring, skin cancer at exposure sites. ';
    pathwayLines.push(
      'PATHWAY: PACT ACT PRESUMPTIVE (' + pactDetail.trim() + ') ' +
      'Under the PACT Act and relevant CFR sections, covered conditions are PRESUMPTIVE — VA must schedule C&P, no private nexus letter required to file. ' +
      'Mark covered conditions type:presumptive. Filing options: (A) file immediately — VA duty to assist applies, or (B) get private IMO for higher rating tier. ' +
      'NOT COVERED by PACT presumptive: mental health (anxiety/depression/PTSD — these are direct SC), musculoskeletal, tinnitus. ' +
      'NOTE FOR RESERVE/GUARD: Qualifies if exposure occurred during qualifying active duty periods or federally ordered training where exposure was documented.'
    );
  }

  // 2. TERA TRAINING (CONUS toxic exposure — direct SC, not presumptive)
  if (hasTeraTraining) {
    pathwayLines.push(
      'PATHWAY: TERA TRAINING EXPOSURE (CONUS DIRECT SERVICE CONNECTION) — MOS ' + moscode + ' has documented toxic training exposure (' + exps.join(', ') + '). ' +
      'CRITICAL: This is NOT PACT Act presumptive. This is a direct service connection claim supported by TERA duty-to-assist (38 CFR 3.303). ' +
      'Veteran must prove: (1) diagnosis, (2) in-service chemical exposure event, (3) medical nexus linking specific exposure to diagnosis. ' +
      'VA has duty to consider the exposure when evaluating, but veteran carries the burden. ' +
      'A specialist nexus letter (pulmonologist/toxicologist) connecting the specific agent to the specific condition is STRONGLY recommended. ' +
      'Use type:direct for all conditions. Use pact_note to explain TERA duty-to-assist, NOT presumptive language.'
    );
  }

  // 3. ASBESTOS (direct SC — no PACT coverage)
  if (hasAsbestos && !hasPactAct) {
    pathwayLines.push(
      'OCCUPATIONAL HAZARD: ASBESTOS EXPOSURE — ' + (branch.includes('navy') || branch.includes('coast') ? 'Navy/Coast Guard shipboard service involves high asbestos exposure in engine rooms, boiler rooms, and sleeping quarters.' : 'Service occupation involved asbestos-containing materials.') + ' ' +
      'PACT Act does NOT cover asbestos. File as type:direct. ' +
      'Covered conditions: mesothelioma, asbestosis, lung cancer, pleural disease, laryngeal cancer. ' +
      'Evidence needed: ship names and service dates (for Navy), MOS exposure documentation, current pulmonology/oncology diagnosis, nexus letter. ' +
      'Asbestos-related cancers are NOT automatically presumptive — nexus letter is essential.'
    );
  }

  // 4. PFAS EXPOSURE (direct SC or presumptive depending on regulation)
  if (hasPfas && !hasPactAct) {
    pathwayLines.push(
      'OCCUPATIONAL HAZARD: PFAS/AFFF EXPOSURE — ' + (branch.includes('air force') ? 'Air Force firefighters and crash rescue personnel had high AFFF/PFAS exposure.' : 'Service involved firefighting foam (AFFF) containing PFAS chemicals.') + ' ' +
      'PFAS is not yet a PACT Act presumptive — file as type:direct with exposure documentation. ' +
      'Linked conditions: thyroid disease, kidney cancer, testicular cancer, liver disease, immune dysfunction. ' +
      'VA is expanding PFAS research — document exposure specifically and obtain specialist nexus letter.'
    );
  }

  // 5. MST (liberal evidentiary standard — no corroboration required)
  if (hasMST) {
    pathwayLines.push(
      'PATHWAY: MILITARY SEXUAL TRAUMA (MST) — Under 38 CFR 3.304(f)(5), MST-related PTSD and mental health conditions receive a LIBERALIZED evidentiary standard. ' +
      'VA does NOT require corroborating evidence of the assault/trauma. Markers of behavioral change, performance records, medical records, and lay statements are sufficient. ' +
      'DO NOT require service records to document the MST event itself. ' +
      'Covered conditions: PTSD (primary), depression, anxiety, MST-related physical conditions (fibromyalgia, IBS, pelvic pain, hypertension). ' +
      'Use type:lay for MST-related PTSD. Buddy statements and personal statements carry significant weight. ' +
      'Filing tip: Request Military Personnel Records for any documented behavioral/performance changes following the incident period as supportive evidence.'
    );
  }

  // 6. POW (specific presumptive list)
  if (isPOW) {
    pathwayLines.push(
      'PATHWAY: PRISONER OF WAR — Under 38 CFR 3.309(c), POW veterans receive a specific presumptive list. ' +
      'Covered (mark type:presumptive): psychosis, dysthymic disorder, anxiety, organic mental conditions, post-traumatic osteoarthritis, stroke, residuals of stroke, hypertension, atherosclerotic heart disease, heart disease due to avitaminosis, helminthiasis, peripheral neuropathy, irritable bowel syndrome, peptic ulcer disease, B12 deficiency, malnutrition, optic neuropathy, pellagra (or other nutritional deficiency), all tropical diseases. ' +
      'Veterans held for 30+ days get additional presumptions: all cancers. ' +
      'Evidence needed: POW documentation in service records or JPAC records, current diagnosis.'
    );
  }

  // 7. COMBAT/PTSD LIBERAL STANDARD
  if (hasCombatService && !hasMST) {
    pathwayLines.push(
      'PATHWAY: COMBAT SERVICE — PTSD LIBERAL STANDARD — Under 38 CFR 3.304(f), combat veterans receive liberalized evidentiary standard for PTSD. ' +
      'If service records confirm engagement with the enemy or presence in a combat zone, VA must accept personal statement as evidence of the in-service stressor. ' +
      'No requirement to corroborate in-service stressor with official records. Buddy statements strengthen the claim significantly. ' +
      'PTSD should be filed as type:direct. Also consider: TBI (from blast exposure), tinnitus/hearing loss (from weapons fire), and musculoskeletal from combat loads.'
    );
  }

  // 8. MOS-SPECIFIC OCCUPATIONAL HAZARDS (all veterans, all branches)
  const mosHazards = [];
  if (highNoiseExposure) mosHazards.push(
    'HIGH NOISE EXPOSURE MOS — VA Duty MOS Noise Exposure Listing concedes hazardous noise exposure for this MOS. ' +
    'Tinnitus and hearing loss claims are STRONG for this veteran — VA will not contest the in-service noise event. ' +
    'Evidence needed: current audiogram, statement of onset, Duty MOS listing as supporting documentation. ' +
    'Tinnitus: always file at 10%. Hearing loss: file simultaneously, rated on speech recognition scores.'
  );
  if (heavyPhysicalMOS) mosHazards.push(
    'HEAVY PHYSICAL MOS — High incidence of musculoskeletal conditions from ruck marching, load-bearing, vehicle operations, parachuting. ' +
    'Back (lumbar/cervical), knees, hips, shoulders, ankles are high-probability direct service connection claims. ' +
    'Evidence: STRs showing in-service treatment, current imaging, range of motion testing at C&P. ' +
    'Secondary cascade: knee secondary to back, ankle secondary to knee — document all.'
  );
  if (medicalMOS) mosHazards.push(
    'MEDICAL/CORPSMAN MOS — High risk for PTSD from secondary trauma and traumatic patient care. ' +
    'Also: bloodborne pathogen exposure (hepatitis B/C), musculoskeletal from patient lifting, burnout/depression. ' +
    'PTSD secondary trauma is documentable through patient case load, deployment records, and treating provider statements.'
  );
  if (intelAdminMOS && !hasCombatService) mosHazards.push(
    'ADMINISTRATIVE/INTEL MOS — Lower physical hazard profile, but: musculoskeletal from prolonged sitting/computer work, ' +
    'mental health from secondary trauma exposure (intel analysts), and deployment-related PTSD if applicable. ' +
    'Carpal tunnel and cervical strain from desk work can be direct SC with STR documentation.'
  );
  if (mosHazards.length) pathwayLines.push('MOS-SPECIFIC HAZARDS: ' + mosHazards.join(' | '));

  // 9. DIRECT SC (fallback for any veteran)
  if (!hasPactAct && !hasTeraTraining) {
    pathwayLines.push(
      'PATHWAY: DIRECT SERVICE CONNECTION (ALL CONDITIONS NOT COVERED ABOVE) — ' +
      '3-legged stool: (1) current diagnosis, (2) in-service event/incident/exposure, (3) medical nexus linking the two. ' +
      'Private nexus letter from treating physician strongly recommended for any condition not covered by presumptive pathway. ' +
      'Service treatment records (STRs) are the foundation — request them before filing.'
    );
  }

  // 10. SECONDARY SC (for any veteran with prior ratings)
  if (hasPriorRating) {
    pathwayLines.push(
      'PATHWAY: SECONDARY SERVICE CONNECTION — Veteran has prior SC ratings (' + ans.ratedConds.join(', ') + '). ' +
      'New conditions caused or aggravated by rated conditions = type:secondary. Assign filing_order AFTER anchor. ' +
      'This is often strategically superior to direct SC — burden of proof is lower.'
    );
  }

  const pathwayContext = pathwayLines.join('\n\n');

  const prompt = `You are a VA claims strategist generating a personalized legal roadmap. Return ONLY minified JSON, no markdown.

VETERAN PROFILE:
${ans.branch?.join('/')} ${ans.component} | MOS ${ans.mos?.code||'?'} ${mosLabel} | ${ans.startYear}-${ans.endYear} | ${ans.discharge} discharge
Deployments: ${ans.deployments?.join(', ')||'None'}
Exposures: ${ans.exposures?.join(', ')||'None'}
VA Status: ${ans.vaStatus} | Prior Ratings: ${ans.ratedConds?.join(', ')||'None'}
Symptoms: ${ans.symptoms?.join(', ')||'None'}
Diagnoses: ${ans.diagnoses?.join(', ')||'None'}
In-Service Events: ${ans.events?.join(', ')||'None'}

LEGAL PATHWAY ANALYSIS (apply strictly — each section below is based on this veteran's specific profile):
${pathwayContext}

SECONDARY OPPORTUNITIES (check before assigning type:direct):
Sleep apnea→secondary to asthma/rhinitis or PTSD. Depression/anxiety→secondary to tinnitus/chronic pain. Hypertension→secondary to PTSD or OSA. GERD→secondary to PTSD/asthma meds. Knee/hip→secondary to SC back. Migraines→secondary to TBI/PTSD. ED→secondary to PTSD/diabetes/spine. If secondary pathway exists, it is strategically superior. Anchor=filing_order:1, secondary=filing_order:2+.

RULES:
- 2-4 winnable conditions specific to this veteran's profile
- options: 2 short decision points (e.g. "File now" vs "Get nexus letter first")
- targetRating: CPAP=50, bronchodilator=30, tinnitus=10, PTSD mild=30 moderate=50 severe=70, hypertension=10-60
- checks: 3 brief action items only
- pathway: PACT_ACT|TERA_DIRECT|AGENT_ORANGE|GULF_WAR|CAMP_LEJEUNE|RADIATION|MST|POW|COMBAT_DIRECT|DIRECT|MIXED
- Keep ALL text fields SHORT — nexus 1 sentence, evidence_have brief, evidence_need brief, action 1 sentence

RETURN THIS JSON STRUCTURE (minified):
{"summary":"2-3 sentences on legal position and overall strategy","pathway":"PACT_ACT|TERA_DIRECT|AGENT_ORANGE|GULF_WAR|CAMP_LEJEUNE|RADIATION|MST|POW|COMBAT_DIRECT|DIRECT|MIXED","strategy":"1 sentence on why this sequence and approach","filing_sequence":"Plain English e.g.: File conditions 1+2 simultaneously. Once rated, file condition 3 as secondary.","totalConditions":N,"conditions":[{"name":"","type":"direct|secondary|presumptive|lay","priority":"high|medium|low","filing_order":N,"targetRating":N,"nexus":"for presumptive: note VA duty; for direct: describe required medical link","evidence_have":"what veteran already has","evidence_need":"what is still needed","options":["Option A: ...","Option B: ..."],"action":"single most important next step","secondaryTo":"","cfr":"","checks":["","",""]}],"tdiu":false,"tdiu_note":"","pact_note":"","top_action":"single most important action across the whole claim"}
CRITICAL: Return ONLY valid minified JSON. No markdown, no code fences. All string values must be short. No apostrophes (write "its" not "it's"). No literal line breaks inside strings.`;

    try {
    const data = await callClaude([{role:'user',content:prompt}], 2500);
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
    roadmapData = safeParseRoadmapJSON(clean);

    // Build conditions from roadmap
    conditions = roadmapData.conditions?.map((c, i) => ({
      id: 'local-'+i, name: c.name, rating: 0, col: 'todo',
      type: c.type, checks: (c.checks||[]).map(ch=>({text:ch,done:false})),
      nexus: c.nexus, evidence_have: c.evidence_have, evidence_need: c.evidence_need,
      action: c.action, options: c.options||[],
      secondaryTo: c.secondaryTo||'', cfr: c.cfr||'',
      filing_order: c.filing_order || (i+1),
      targetRating: c.targetRating || 0,
      ratingCriteria: c.ratingCriteria?.length ? c.ratingCriteria : getRatingCriteria(c.name)
    })) || [];

    if (currentUser) await saveRoadmapToSupabase();
    logActivity('roadmap_generated', `🗺️ Roadmap generated — ${roadmapData.conditions?.length || 0} conditions identified`);
    showView('vApp');
    updateSidebar();
    stopC101Carousel();
    showLandingMoment(roadmapData);
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

  // Pathway banner — different message per pathway type
  const pathwayBanners = {
    PACT_ACT: { label:'⚡ PACT Act Presumptive Pathway', body:'Your service qualifies under the PACT Act (2022). For covered conditions, <strong>VA is legally required to obtain a medical opinion</strong> — no private nexus letter needed to file. A nexus letter remains an option to push for a higher rating tier.', stat1:'No nexus letter required', stat1sub:'VA must schedule C&P', stat2:'38 CFR 3.309(e)', stat2sub:'PACT Act 2022', color:'var(--gold)' },
    AGENT_ORANGE: { label:'🍃 Agent Orange Presumptive Pathway', body:'Your Vietnam-era/herbicide exposure qualifies under Agent Orange presumptives. For covered conditions including Type 2 diabetes, ischemic heart disease, Parkinsons disease, and cancers, <strong>VA presumes service connection</strong> — no nexus letter required.', stat1:'No nexus letter required', stat1sub:'38 CFR 3.309(e)', stat2:'Agent Orange', stat2sub:'Vietnam era', color:'#86EFAC' },
    GULF_WAR: { label:'🏜️ Gulf War Illness Presumptive Pathway', body:'Your Southwest Asia service qualifies for Gulf War presumptives. Chronic Fatigue Syndrome, fibromyalgia, functional GI disorders, and undiagnosed multi-symptom illnesses do not require a specific diagnosis — <strong>chronic symptoms for 6+ months at 10%+ is sufficient</strong>.', stat1:'No diagnosis required', stat1sub:'Chronic symptoms qualify', stat2:'38 CFR 3.317', stat2sub:'Gulf War Illness', color:'#FDE68A' },
    CAMP_LEJEUNE: { label:'💧 Camp Lejeune Contaminated Water Pathway', body:'Your Camp Lejeune service (1953–1987) qualifies for 8 presumptive conditions including cancers and Parkinsons disease. <strong>No nexus letter required</strong> — VA presumes service connection for covered conditions.', stat1:'No nexus letter required', stat1sub:'8 covered conditions', stat2:'38 CFR 3.309(f)', stat2sub:'Camp Lejeune', color:'#93C5FD' },
    RADIATION: { label:'☢️ Ionizing Radiation Presumptive Pathway', body:'Your radiation exposure during service qualifies for 21 specific cancer presumptives. <strong>VA presumes service connection</strong> for covered cancers if you participated in qualifying radiation-risk activities.', stat1:'21 cancer presumptives', stat1sub:'No nexus required', stat2:'38 CFR 3.309(d)', stat2sub:'Radiation exposure', color:'#C4B5FD' },
    MST: { label:'🛡️ Military Sexual Trauma — Liberal Evidentiary Standard', body:'MST-related conditions qualify under a <strong>liberalized evidentiary standard</strong> (38 CFR 3.304(f)(5)). VA does not require corroborating evidence of the trauma — behavioral changes, medical records, and personal statements are sufficient.', stat1:'No corroboration required', stat1sub:'Lay evidence sufficient', stat2:'38 CFR 3.304(f)(5)', stat2sub:'MST liberal standard', color:'#F9A8D4' },
    POW: { label:'🎖️ Prisoner of War Presumptive Pathway', body:'POW veterans have a specific presumptive list under 38 CFR 3.309(c) covering mental health, cardiovascular, neurological, and GI conditions. Veterans held 30+ days receive additional cancer presumptives.', stat1:'POW presumptive list', stat1sub:'38 CFR 3.309(c)', stat2:'Veterans held 30+ days', stat2sub:'Cancer presumptive', color:'#FCD34D' },
    COMBAT_DIRECT: { label:'⚔️ Combat Service — PTSD Liberal Standard', body:'Combat service qualifies for the PTSD liberal evidentiary standard (38 CFR 3.304(f)). VA accepts personal statement as evidence of the in-service stressor — no requirement to corroborate with official records.', stat1:'Personal statement sufficient', stat1sub:'No official record needed', stat2:'38 CFR 3.304(f)', stat2sub:'Combat PTSD standard', color:'var(--gold)' },
    TERA_DIRECT: { label:'🔬 TERA Training Exposure — Direct Service Connection', body:'Your MOS has documented toxic training exposure. <strong>This is NOT a PACT Act presumptive claim</strong> — file as direct service connection. VA has a duty to consider your exposure (38 CFR 3.303), but you must build the evidentiary case. A specialist nexus letter is strongly recommended.', stat1:'Nexus letter recommended', stat1sub:'Direct SC required', stat2:'38 CFR 3.303', stat2sub:'TERA duty-to-assist', color:'#7DD3FC' },
    MIXED: { label:'🔀 Multiple Pathways Identified', body:'Your service history qualifies under multiple VA pathways. Review each condition card — some conditions will be presumptive while others require direct service connection. Follow the filing sequence for maximum efficiency.', stat1:'Multiple pathways', stat1sub:'See each condition card', stat2:'Mixed strategy', stat2sub:'Follow filing order', color:'var(--gold)' },
    DIRECT: { label:'📋 Direct Service Connection Pathway', body:'Your conditions require direct service connection — you must establish a current diagnosis, an in-service event or exposure, and a medical nexus linking the two. A private nexus letter from a treating physician is strongly recommended.', stat1:'Nexus letter recommended', stat1sub:'3-legged stool required', stat2:'38 CFR 3.303', stat2sub:'Direct service connection', color:'rgba(255,255,255,.7)' }
  };
  const bannerData = pathwayBanners[data.pathway] || pathwayBanners.DIRECT;
  if (data.pathway && data.pathway !== 'DIRECT') {
    html += `<div class="tera-pathway-banner" style="border-left-color:${bannerData.color}">
      <div class="tera-banner-left">
        <div class="tera-banner-label" style="color:${bannerData.color}">${bannerData.label}</div>
        <div class="tera-banner-body">${bannerData.body}</div>
      </div>
      <div class="tera-banner-right">
        <div class="tera-stat"><div class="tera-stat-val" style="color:${bannerData.color}">${bannerData.stat1}</div><div class="tera-stat-label">${bannerData.stat1sub}</div></div>
        <div class="tera-stat"><div class="tera-stat-val" style="color:${bannerData.color}">${bannerData.stat2}</div><div class="tera-stat-label">${bannerData.stat2sub}</div></div>
      </div>
    </div>`;
  }
  if (data.pact_note) html += `<div class="alert alert-amber"><span>⚠️</span><span><strong>PACT Act:</strong> ${data.pact_note}</span></div>`;
  if (data.tdiu) html += `<div class="alert alert-green"><span>💡</span><span><strong>TDIU Opportunity:</strong> ${data.tdiu_note||'You may qualify for Total Disability based on Individual Unemployability.'}</span></div>`;

  const renderGroup = (conds, label) => {
    if (!conds.length) return '';
    return `<div class="rm-section-hdr">${label}</div>` + conds.map(c => renderCondCard(c, typeColors, typeLabels)).join('');
  };

  // Filing sequence banner
  if (data.filing_sequence) {
    html += `<div class="alert alert-blue" style="margin-bottom:12px"><span>📋</span><span><strong>Filing Strategy:</strong> ${data.filing_sequence}</span></div>`;
  }

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
  const criteria = c.ratingCriteria?.length ? c.ratingCriteria : getRatingCriteria(c.name);
  return `
  <div class="cond-card">
    <div class="cond-card-hdr lborder-${c.type}" onclick="toggleCondBody(this)">
      <div style="flex:1">
        <div class="cond-name">${c.name}</div>
        <div style="display:flex;align-items:center;gap:8px;flex-wrap:wrap;margin-top:3px">
          <span class="cond-pri-badge badge-${c.type}">${label}</span>
          ${c.filing_order ? `<span style="font-size:10px;background:#F1F5F9;color:#64748B;border-radius:4px;padding:1px 6px;font-weight:600">File #${c.filing_order}</span>` : ''}
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
      </div>
      ${c.options?.length ? `
      <div class="cond-options-box">
        <div class="cond-options-hdr">⚖️ Your Options — Choose Your Path</div>
        ${c.options.map((opt, i) => `<div class="cond-option-row"><span class="cond-option-num">${i+1}</span><span>${opt}</span></div>`).join('')}
      </div>` : ''}
      ${c.action ? `<div class="cond-next-step"><div class="cond-next-step-label">Your Next Step</div><div class="cond-next-step-text">${c.action}</div></div>` : ''}
      ${criteria?.length ? `
      <div class="rating-criteria">
        <div class="rating-criteria-hdr">📊 VA Rating Schedule — ${dc ? `DC ${dc.code}` : '38 CFR Part 4'}</div>
        <div class="rating-criteria-sub">Read each row and match your symptoms. This is how VA assigns your rating — <strong>you decide what to enter in your tracker</strong>.</div>
        ${criteria.map(r => `
          <div class="rating-row">
            <div class="r-pct">${r.pct}%</div>
            <div class="r-desc">
              <div>${r.desc}</div>
              ${r.keywords ? `<div class="r-keywords">Key words: ${r.keywords}</div>` : ''}
            </div>
          </div>`).join('')}
        <div class="rating-criteria-cta">
          <span style="font-size:12px;color:var(--text-sec)">Know which rating fits your symptoms?</span>
          <button class="btn btn-outline btn-sm" onclick="showPage('tracker')" style="margin-left:10px">Set Target in Tracker →</button>
        </div>
      </div>` : ''}
      ${cpTips?.length ? `
      <div class="cp-tips-box">
        <div class="cp-tips-hdr">🎯 C&amp;P Exam Prep</div>
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
  return [];
}

function toggleCondBody(hdr) {
  const body = hdr.nextElementSibling;
  body?.classList.toggle('open');
  hdr.querySelector('.cond-toggle').textContent = body?.classList.contains('open') ? '▲' : '▼';
}

// ── DASHBOARD ──
// ── SECONDARY OPPORTUNITY SUGGESTIONS ──
// Fires when at least one condition is in "Won" — surfaces contextual secondary claims
// based on what the veteran has already won. Medical literature backed.
function getSecondaryOpportunities(wonConditions) {
  const won = wonConditions.map(c => c.name.toLowerCase());
  const alreadyTracked = conditions.map(c => c.name.toLowerCase());
  const suggestions = [];

  const hasWon = (pattern) => won.some(n => new RegExp(pattern, 'i').test(n));
  const notTracked = (name) => !alreadyTracked.some(n => n.includes(name.toLowerCase().slice(0, 8)));

  // Sleep Apnea secondaries
  if ((hasWon('asthma|rhinitis|sinusitis|copd|respiratory|bronch') || hasWon('ptsd|anxiety|depression|mental')) && notTracked('sleep apnea')) {
    suggestions.push({
      name: 'Sleep Apnea (OSA)',
      secondaryTo: hasWon('asthma|rhinitis|respiratory') ? 'Asthma' : 'PTSD',
      reason: hasWon('asthma|rhinitis|respiratory')
        ? 'Upper airway inflammation from service-connected asthma/rhinitis causes obstructive sleep apnea. One of the strongest secondary relationships in VA claims.'
        : 'Hypervigilance from service-connected PTSD disrupts sleep architecture and causes OSA. Strongly supported by medical literature.',
      targetRating: 50,
      icon: '😴',
      cfr: '38 CFR 3.310'
    });
  }

  // Anxiety/Depression secondaries
  if (hasWon('tinnitus') && notTracked('anxiety') && notTracked('depression')) {
    suggestions.push({
      name: 'Anxiety Disorder',
      secondaryTo: 'Tinnitus',
      reason: 'Chronic tinnitus causes psychological distress, sleep disruption, concentration difficulty, and social withdrawal — documented to cause secondary anxiety and depression.',
      targetRating: 30,
      icon: '🧠',
      cfr: '38 CFR 3.310'
    });
  }

  // Hypertension secondary
  if (hasWon('ptsd|anxiety') && notTracked('hypertension') && notTracked('blood pressure')) {
    suggestions.push({
      name: 'Hypertension',
      secondaryTo: 'PTSD',
      reason: 'PTSD causes chronic sympathetic nervous system activation, elevating blood pressure. Multiple peer-reviewed studies confirm this secondary relationship. Added to PACT presumptive list in 2025 for some veterans.',
      targetRating: 10,
      icon: '🩺',
      cfr: '38 CFR 3.310'
    });
  }

  // Knee/hip secondary to back
  if (hasWon('back|lumbar|spine|lumbosacral') && notTracked('knee')) {
    suggestions.push({
      name: 'Knee Condition (Bilateral)',
      secondaryTo: 'Lumbar Spine',
      reason: 'Altered gait and compensatory mechanics from service-connected back conditions cause secondary knee degeneration. File both knees — each is rated separately.',
      targetRating: 10,
      icon: '🦵',
      cfr: '38 CFR 3.310'
    });
  }

  // GERD secondary
  if (hasWon('ptsd|anxiety|asthma') && notTracked('gerd') && notTracked('acid reflux') && notTracked('gastro')) {
    suggestions.push({
      name: 'GERD / Acid Reflux',
      secondaryTo: hasWon('ptsd|anxiety') ? 'PTSD' : 'Asthma',
      reason: hasWon('asthma') ? 'Bronchodilator medications (albuterol, corticosteroids) used for service-connected asthma cause acid reflux as a documented side effect.' : 'Stress from service-connected PTSD/anxiety directly causes gastrointestinal symptoms including GERD.',
      targetRating: 10,
      icon: '🔥',
      cfr: '38 CFR 3.310'
    });
  }

  // Migraines secondary to tinnitus or TBI
  if ((hasWon('tinnitus|tbi|traumatic brain') || hasWon('ptsd')) && notTracked('migraine') && notTracked('headache')) {
    suggestions.push({
      name: 'Migraines',
      secondaryTo: hasWon('tbi|traumatic brain') ? 'TBI' : hasWon('tinnitus') ? 'Tinnitus' : 'PTSD',
      reason: 'Strong medical literature links migraines to service-connected TBI, tinnitus, and PTSD. Rated based on frequency — 10% for less than once/month, up to 50% for very frequent prostrating attacks.',
      targetRating: 30,
      icon: '🤕',
      cfr: '38 CFR 3.310'
    });
  }

  // Erectile dysfunction secondary
  if ((hasWon('ptsd|anxiety|depression|diabetes|back|spine') ) && notTracked('erectile') && notTracked('ed ')) {
    suggestions.push({
      name: 'Erectile Dysfunction',
      secondaryTo: hasWon('ptsd') ? 'PTSD' : hasWon('diabetes') ? 'Diabetes Mellitus' : 'Lumbar Spine',
      reason: 'ED is well-supported as secondary to PTSD (psychological), diabetes (vascular/neurological), or spinal conditions (neurological). Often overlooked but rated 0% with Special Monthly Compensation (SMC-K) which adds ~$130/month.',
      targetRating: 0,
      icon: '⚕️',
      cfr: '38 CFR 3.310'
    });
  }

  // Fibromyalgia secondary to PTSD for Gulf War / MST veterans
  if (hasWon('ptsd') && notTracked('fibromyalgia')) {
    suggestions.push({
      name: 'Fibromyalgia',
      secondaryTo: 'PTSD',
      reason: 'Research shows 39.7% of veterans seeking PTSD treatment have fibromyalgia. The chronic stress response from PTSD is strongly associated with widespread musculoskeletal pain. Common secondary claim for MST and combat veterans.',
      targetRating: 10,
      icon: '💪',
      cfr: '38 CFR 3.310'
    });
  }

  // Return max 3 most relevant
  return suggestions.slice(0, 3);
}

function renderSecondarySuggestions(wonConditions) {
  const suggestions = getSecondaryOpportunities(wonConditions);
  if (!suggestions.length) return '';

  return `
  <div class="secondary-suggest-card">
    <div class="secondary-suggest-hdr">
      <div class="secondary-suggest-title">💡 Secondary Claim Opportunities</div>
      <div class="secondary-suggest-sub">Based on your service-connected conditions, these secondary claims are supported by medical literature and are commonly won at the VA.</div>
    </div>
    ${suggestions.map(s => `
    <div class="secondary-suggest-item">
      <div class="secondary-suggest-item-left">
        <div class="ssi-icon">${s.icon}</div>
        <div class="ssi-body">
          <div class="ssi-name">${s.name} <span class="ssi-secondary-tag">secondary to ${s.secondaryTo}</span></div>
          <div class="ssi-reason">${s.reason}</div>
          <div class="ssi-meta">${s.cfr} · Target rating: ${s.targetRating}%${s.targetRating === 0 ? ' + SMC-K' : ''}</div>
        </div>
      </div>
      <div class="ssi-actions">
        <button class="btn btn-outline btn-sm" onclick="askAyleneAboutSecondary('${s.name.replace(/'/g,"\'")}','${s.secondaryTo.replace(/'/g,"\'")}')">Ask Aylene</button>
      </div>
    </div>`).join('')}
    <div class="secondary-suggest-footer">These are educational suggestions only. Consult an accredited VSO or VA attorney before filing. <button class="btn-link-inline" onclick="showPage('regulations')">Learn about secondary service connection →</button></div>
  </div>`;
}

function askAyleneAboutSecondary(condName, secondaryTo) {
  showPage('chat');
  if (chatHistory.length === 0) initChat();
  setTimeout(() => {
    document.getElementById('chatInput').value = `I have service-connected ${secondaryTo}. Can you help me build a secondary service connection claim for ${condName}? What evidence do I need and what's the strongest way to file?`;
    sendMessage();
  }, 600);
}

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
  </div>
  ${wonConds.length ? renderSecondarySuggestions(wonConds) : ''}`;

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
  const printConds = (conditions.length ? conditions : (roadmapData?.conditions?.map((c,i) => ({...c, id:'p-'+i, secondaryTo:c.secondaryTo||'', targetRating:c.targetRating||0})) || [])).map(c => ({...c, ratingCriteria: (c.ratingCriteria?.length ? c.ratingCriteria : getRatingCriteria(c.name))}));
  if (!roadmapData || !printConds.length) { alert('Complete your screener first to generate a roadmap to print.'); return; }
  const branch = ans.branch?.[0] || 'Veteran';
  const mos = ans.mos?.code ? `${ans.mos.code} — ${ans.mos.title||ans.mos.label||''}` : '';
  const typeLabels = { direct:'Direct Service', secondary:'Secondary', presumptive:'Presumptive / PACT Act', lay:'Lay Evidence' };
  const pathwayLabels = { TERA_PACT:'TERA / PACT Act', DIRECT:'Direct Service Connection', SECONDARY:'Secondary Service Connection', MIXED:'Multiple Pathways' };

  const condHTML = printConds.map((c, i) => `
    <div style="border:1px solid #ccc;border-radius:6px;padding:16px;margin-bottom:14px;break-inside:avoid;page-break-inside:avoid">
      <div style="display:flex;align-items:center;gap:10px;margin-bottom:10px;flex-wrap:wrap">
        ${c.filing_order ? `<span style="font-size:11px;background:#F1F5F9;color:#334155;padding:2px 8px;border-radius:3px;font-weight:700">File #${c.filing_order}</span>` : ''}
        <strong style="font-size:16px;color:#002855">${c.name}</strong>
        <span style="font-size:11px;background:#002855;color:white;padding:2px 8px;border-radius:3px">${typeLabels[c.type]||c.type}</span>

        ${c.secondaryTo ? `<span style="font-size:11px;color:#666">↳ Secondary to ${c.secondaryTo}</span>` : ''}
        ${c.cfr ? `<span style="font-size:10px;color:#999">${c.cfr}</span>` : ''}
      </div>
      ${c.nexus ? `<div style="margin-bottom:8px;padding:6px 8px;background:#EFF6FF;border-left:3px solid #0050A0;border-radius:3px"><span style="font-weight:700;color:#0050A0;font-size:11px;text-transform:uppercase">Nexus / Legal Basis: </span><span style="font-size:12px">${c.nexus}</span></div>` : ''}
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-bottom:10px">
        ${c.evidence_have ? `<div style="padding:6px 8px;background:#F0FDF4;border-left:3px solid #16A34A;border-radius:3px"><div style="font-weight:700;color:#16A34A;font-size:10px;text-transform:uppercase;margin-bottom:2px">Evidence You Have</div><div style="font-size:12px">${c.evidence_have}</div></div>` : ''}
        ${c.evidence_need ? `<div style="padding:6px 8px;background:#FFF5F5;border-left:3px solid #DC2626;border-radius:3px"><div style="font-weight:700;color:#DC2626;font-size:10px;text-transform:uppercase;margin-bottom:2px">Evidence Still Needed</div><div style="font-size:12px">${c.evidence_need}</div></div>` : ''}
      </div>
      ${c.options?.length ? `
      <div style="margin-bottom:10px;padding:10px;background:#FFFBEB;border:1px solid #FDE68A;border-radius:4px">
        <div style="font-weight:700;color:#92400E;font-size:11px;text-transform:uppercase;margin-bottom:6px">Your Options — Choose Your Path</div>
        ${c.options.map((opt, oi) => `<div style="display:flex;gap:8px;margin-bottom:4px;font-size:12px"><span style="min-width:18px;height:18px;background:#92400E;color:white;border-radius:50%;display:inline-flex;align-items:center;justify-content:center;font-size:10px;font-weight:700;flex-shrink:0">${oi+1}</span><span>${opt}</span></div>`).join('')}
      </div>` : ''}
      ${c.action ? `<div style="padding:8px 10px;background:#002855;color:white;border-radius:4px;font-size:12px"><span style="font-weight:700;font-size:10px;text-transform:uppercase;opacity:.8">Your Next Step: </span>${c.action}</div>` : ''}
      ${c.ratingCriteria?.length ? `<div style="margin-top:10px;padding-top:8px;border-top:1px solid #eee">
        <div style="font-size:10px;font-weight:700;color:#002855;text-transform:uppercase;margin-bottom:6px">VA Rating Criteria (38 CFR Part 4)</div>
        ${c.ratingCriteria.map(r => `<div style="display:flex;gap:8px;margin-bottom:3px;font-size:11px"><span style="min-width:32px;font-weight:700;color:#002855">${r.pct}%</span><span style="color:#444">${r.desc}</span></div>`).join('')}
      </div>` : ''}
    </div>`).join('');

  const win = window.open('', '_blank', 'width=820,height=1000');
  win.document.write(`<!DOCTYPE html><html><head><title>VA Disability Roadmap — Mission: Connected</title>
    <style>
      body{font-family:Arial,sans-serif;max-width:740px;margin:30px auto;color:#1a1a2e;font-size:13px;line-height:1.5}
      h1{color:#002855;font-size:22px;margin-bottom:4px}
      h2{color:#002855;font-size:12px;text-transform:uppercase;letter-spacing:1px;margin:20px 0 8px;border-bottom:2px solid #002855;padding-bottom:4px}
      .meta{color:#666;font-size:12px;margin-bottom:6px}
      .strategy-box{background:#002855;color:white;border-radius:6px;padding:14px 16px;margin-bottom:20px}
      .strategy-box .s-label{font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:.1em;color:#C9A84C;margin-bottom:4px}
      .strategy-box .s-text{font-size:13px;line-height:1.6;color:rgba(255,255,255,.9)}
      .seq-box{background:#EFF6FF;border:1px solid #BFDBFE;border-radius:6px;padding:12px 14px;margin-bottom:20px}
      .seq-box .seq-label{font-size:10px;font-weight:700;text-transform:uppercase;color:#1E40AF;margin-bottom:4px}
      .seq-box .seq-text{font-size:13px;color:#1E3A5F}
      .top-action{background:#C9A84C;border-radius:6px;padding:12px 16px;margin-bottom:20px}
      .top-action .ta-label{font-size:10px;font-weight:700;text-transform:uppercase;color:#002855;margin-bottom:4px}
      .top-action .ta-text{font-size:14px;font-weight:700;color:#002855}
      .disclaimer{font-size:10px;color:#888;border-top:1px solid #ddd;margin-top:24px;padding-top:10px;line-height:1.5}
      @media print{body{margin:15px}button{display:none}.no-print{display:none}}
    </style></head><body>
    <div style="display:flex;align-items:center;gap:12px;margin-bottom:8px">
      <div style="background:#002855;color:white;font-size:14px;padding:6px 10px;border-radius:4px;font-weight:700">M·C</div>
      <h1>Mission: Connected — VA Disability Roadmap</h1>
    </div>
    <div class="meta">${branch} Veteran · ${mos} · ${ans.startYear||'?'}–${ans.endYear||'Present'}</div>
    <div class="meta" style="margin-bottom:16px">Pathway: <strong>${pathwayLabels[roadmapData.pathway]||roadmapData.pathway||'Direct Service'}</strong> · Generated ${new Date().toLocaleDateString()}</div>
    <button class="no-print" onclick="window.print()" style="margin-bottom:20px;padding:8px 16px;background:#002855;color:white;border:none;border-radius:4px;cursor:pointer;font-size:13px">🖨️ Print / Save as PDF</button>

    ${roadmapData.top_action ? `<div class="top-action">
      <div class="ta-label">⚡ Your Single Most Important Next Action</div>
      <div class="ta-text">${roadmapData.top_action}</div>
    </div>` : ''}

    ${roadmapData.filing_sequence ? `<div class="seq-box">
      <div class="seq-label">📋 Filing Sequence — Do This in This Order</div>
      <div class="seq-text">${roadmapData.filing_sequence}</div>
    </div>` : ''}

    ${roadmapData.strategy ? `<div class="strategy-box">
      <div class="s-label">Strategic Overview</div>
      <div class="s-text">${roadmapData.strategy}</div>
    </div>` : ''}

    <h2>Summary</h2>
    <p style="font-size:13px;line-height:1.6;color:#333">${roadmapData.summary || ''}</p>

    <h2>${conditions.length} Condition${conditions.length!==1?'s':''} Identified</h2>
    ${condHTML}

    <div class="disclaimer">⚠️ This roadmap is AI-generated for educational and informational purposes only. It does not constitute legal or medical advice. Mission: Connected is not affiliated with the U.S. Department of Veterans Affairs. Consult an accredited VSO or VA attorney for formal claim representation.</div>
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
        const { data, error: ie } = await sbClient.from('claims').insert(payload).select().single();
        if (ie) console.warn('claims insert error:', ie.message, ie.code);
        else if (data) c.id = data.id;
      } else {
        const { error: ue } = await sbClient.from('claims').update(payload).eq('id', c.id);
        if (ue) console.warn('claims update error:', ue.message, ue.code);
      }
    }
  } catch(e) { console.warn('saveConditions exception:', e); }
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

COMMUNICATION STYLE — THIS IS CRITICAL:
- You are texting a veteran, not writing a report. Keep responses SHORT — 2 to 5 sentences max unless they explicitly ask for detail.
- NEVER use bullet points, numbered lists, bold headers, or emoji sections. Just talk.
- Write like a knowledgeable friend texting: direct, warm, no fluff.
- One idea per message. If there's more to say, ask a follow-up question instead.
- If you want to emphasize something, just say it plainly — don't bold it or put it in a list.
- Match the veteran's energy. If they send one sentence, send one or two back.
- Cite 38 CFR only when it genuinely helps — and only inline, never as a header.
- Never estimate a specific rating. Show criteria briefly if asked.
- Never give legal advice or say you're a lawyer.
- Only discuss veterans benefits. If asked about anything else, redirect warmly.
- Do NOT mention PACT Act or deployments unless the veteran's profile shows qualifying overseas service. A CONUS-only veteran's claim is direct service connection, not PACT.`;


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
    ? `\nVETERAN PROFILE (use this to personalize every response):` +
      `\n- Branch: ${ans.branch?.join('/') || 'Unknown'}, Component: ${ans.component || 'Unknown'}` +
      `\n- MOS: ${ans.mos?.code || '?'} ${ans.mos?.title || ans.mos?.label || ''}` +
      `\n- Service: ${ans.startYear || '?'}–${ans.endYear || 'Present'}, Discharge: ${ans.discharge || 'Unknown'}` +
      `\n- Deployments: ${ans.deployments?.join(', ') || 'None listed'}` +
      `\n- Exposures: ${ans.exposures?.join(', ') || 'None listed'}` +
      `\n- Legal pathway: ${roadmapData?.pathway || 'DIRECT'}` +
      `\n- Conditions in roadmap: ${(roadmapData?.conditions || conditions).map(c => c.name + (c.type === 'presumptive' ? ' (presumptive)' : c.type === 'secondary' ? ' (secondary to ' + (c.secondaryTo || '?') + ')' : ' (direct)')).join(', ')}` +
      `\n- Current VA status: ${ans.vaStatus || 'none'}, Prior ratings: ${ans.ratedConds?.join(', ') || 'none'}` +
      `\nIMPORTANT: Only mention PACT Act / presumptive if the pathway above says PACT_ACT. This veteran has ${ans.deployments?.some(d => /gulf|iraq|afghanistan|oif|oef|vietnam|swa/i.test(d)) ? 'qualifying overseas service' : 'CONUS service only — do NOT suggest PACT Act or presumptive pathways'}.`
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
    const msg = e.message?.includes('overloaded') || e.message?.includes('529')
      ? "API is a little busy right now — give it a few seconds and try again."
      : "Having trouble connecting. Check your connection and try again.";
    appendMsg('ai', msg);
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
    const safeId = f.id.replace(/[^a-zA-Z0-9_-]/g, '_');
    uploadedFiles[uploadedFiles.indexOf(f)]._safeId = safeId;
    window['_fmap_' + safeId] = f.id;
    return `<div class="file-item" id="fi-${safeId}">
      <div class="file-item-icon">${icon}</div>
      <div style="flex:1;min-width:0">
        <div class="file-item-name-wrap" id="fwrap-${safeId}">
          <a class="file-item-name" href="${blobUrl}" target="_blank" title="Open file">${f.displayName}</a>
          <button class="btn-rename" onclick="startRename(window['_fmap_${safeId}'])" title="Rename">✏️</button>
        </div>
        <div class="file-item-meta">${size} MB · ${f.file.type || 'document'} · <a href="${blobUrl}" download="${f.displayName}" style="color:var(--sky);font-size:11px">Download ↓</a></div>
      </div>
      <button class="btn-analyze-file" onclick="analyzeFileWithAylene(window['_fmap_${safeId}'])">💬 Ask Aylene</button>
      <span class="badge-ready">Ready</span>
      <button class="btn-remove-file" onclick="removeFile(window['_fmap_${safeId}'])">✕</button>
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
  if (currentPage !== 'chat') {
    showPage('chat');
    await new Promise(r => setTimeout(r, 1200));
  }
  if (chatHistory.length === 0) await new Promise(r => setTimeout(r, 800));

  const reader = new FileReader();
  reader.onload = async (e) => {
    const base64 = e.target.result.split(',')[1];
    const mediaType = f.file.type || (f.displayName.endsWith('.pdf') ? 'application/pdf' : 'image/jpeg');
    const isPDF = mediaType.includes('pdf') || f.displayName.toLowerCase().endsWith('.pdf');
    const isImage = mediaType.startsWith('image/');

    const userMsg = `Please analyze this document for me: "${f.displayName}"`;
    appendMsg('user', userMsg);
    chatHistory.push({ role: 'user', content: userMsg });
    showTyping();
    await new Promise(r => setTimeout(r, 1000));

    const analysisPrompt = `This veteran uploaded a document called "${f.displayName}". Analyze it thoroughly in the context of their VA disability claim:

1. What type of document is this?
2. Key findings — what does this say that matters for their claim?
3. If it's a decision letter: what was approved, denied, at what rating? Any rating errors or appealable points?
4. If it's a medical record: what diagnoses, findings, or treatment history is relevant?
5. Specific next steps this veteran should take based on this document
6. Any deadlines or dates they need to track

Veteran context: Branch ${ans.branch?.join(',') || 'Unknown'}, MOS ${ans.mos?.code || 'Unknown'}, Active conditions: ${conditions.map(c=>c.name).join(', ') || 'None yet'}

Be specific, direct, and actionable.`;

    try {
      let contentBlock;
      if (isPDF) {
        contentBlock = { type: 'document', source: { type: 'base64', media_type: 'application/pdf', data: base64 } };
      } else if (isImage) {
        contentBlock = { type: 'image', source: { type: 'base64', media_type: mediaType, data: base64 } };
      } else {
        // Fallback for unsupported types
        hideTyping();
        appendMsg('ai', `I can analyze PDFs and images directly. For Word documents or other file types, please copy and paste the key text into the chat and I'll analyze it for you.`);
        return;
      }

      const messages = [
        ...chatHistory.slice(-4, -1),
        { role: 'user', content: [contentBlock, { type: 'text', text: analysisPrompt }] }
      ];

      const context = `\nVeteran context: Branch ${ans.branch?.join(',')}, MOS ${ans.mos?.code||'?'}, Conditions: ${conditions.map(c=>c.name).join(', ')||'None yet'}`;
      const data = await callClaude(messages, 1200, AYLENE_SYSTEM + context);
      hideTyping();
      const reply = data.content?.[0]?.text || "I wasn't able to read that file. Try a PDF or image format.";
      appendMsg('ai', reply);
      chatHistory.push({ role: 'assistant', content: reply });
      logActivity('doc_analyzed', `🤖 Aylene analyzed: ${f.displayName}`);
    } catch(err) {
      hideTyping();
      appendMsg('ai', `I had trouble reading that file (${err.message || 'unknown error'}). Make sure it's a PDF or image under 20MB. You can also copy and paste key sections directly into the chat.`);
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

// ── EMOTIONAL LANDING MOMENT ──
function showLandingMoment(data) {
  const existing = document.getElementById('landingMoment');
  if (existing) existing.remove();
  const overlay = document.createElement('div');
  overlay.id = 'landingMoment';
  overlay.style.cssText = 'position:fixed;inset:0;background:rgba(0,8,40,0.93);z-index:9999;display:flex;align-items:center;justify-content:center;padding:24px';
  const condCount = data.conditions?.length || 0;
  const pathway = data.pathway || 'DIRECT';
  const pathwayLabel = {
    TERA_PACT: '⚡ TERA / PACT Act pathway identified',
    DIRECT: '📋 Direct service connection pathway',
    SECONDARY: '🔗 Secondary service connection pathway',
    MIXED: '🔀 Multiple pathways identified'
  }[pathway] || '';
  overlay.innerHTML = `
    <div style="max-width:560px;text-align:center;color:#fff">
      <div style="font-size:56px;margin-bottom:16px">🎯</div>
      <div style="font-size:11px;font-weight:700;letter-spacing:.12em;color:#C9A84C;text-transform:uppercase;margin-bottom:12px">Your Personalized Blueprint Is Ready</div>
      <div style="font-size:28px;font-weight:700;font-family:'Oswald',sans-serif;margin-bottom:16px">${condCount} Potential Claim${condCount !== 1 ? 's' : ''} Identified</div>
      <div style="font-size:15px;color:rgba(255,255,255,0.8);line-height:1.6;margin-bottom:14px">${data.summary || ''}</div>
      ${pathwayLabel ? `<div style="display:inline-block;background:rgba(201,168,76,0.15);border:1px solid rgba(201,168,76,0.4);color:#C9A84C;padding:6px 16px;border-radius:20px;font-size:12px;font-weight:600;margin-bottom:20px">${pathwayLabel}</div>` : ''}
      <div style="font-size:14px;color:rgba(255,255,255,0.6);line-height:1.7;margin-bottom:28px;padding:0 8px">
        What you shared matters. These conditions reflect your specific legal position — not a generic checklist. The options shown are yours to decide. Review each condition carefully and use Ask Aylene for guidance at any point.
      </div>
      <button onclick="closeLandingMoment()" style="background:#C9A84C;color:#002855;border:none;padding:14px 40px;border-radius:6px;font-size:15px;font-weight:700;cursor:pointer;font-family:'Oswald',sans-serif;letter-spacing:.04em">View My Roadmap →</button>
    </div>`;
  document.body.appendChild(overlay);
}

function closeLandingMoment() {
  document.getElementById('landingMoment')?.remove();
  showPage('roadmap');
  renderRoadmap(roadmapData);
  renderDashboard();
  updateSidebar();
  showAyleneFloat();
}

// ── C&P EXAM PREP ──
function renderCPPrep() {
  const el = document.getElementById('cpprepContent');
  if (!el) return;
  const conds = conditions.length ? conditions : (roadmapData?.conditions || []);
  if (!conds.length) {
    el.innerHTML = '<div class="empty-state"><div style="font-size:36px;margin-bottom:10px">🎯</div>Complete your screener to generate your personalized C&P prep guide.</div>';
    return;
  }
  const hasTera = roadmapData?.pathway === 'PACT_ACT' || roadmapData?.pathway === 'MIXED';
  let html = '';
  if (hasTera) {
    html += `<div class="alert alert-amber" style="margin-bottom:20px"><span>⚡</span><span><strong>TERA/PACT Act Note:</strong> Because your claim falls under the PACT Act, VA is required to schedule your C&P exam. You don't need to prove causation — your job at the exam is to accurately describe the severity of your symptoms so the examiner assigns the correct rating tier.</span></div>`;
  }
  html += `<div class="cpprep-intro">
    <div class="cpprep-intro-title">The Golden Rule of C&P Exams</div>
    <div class="cpprep-intro-body">Describe your <strong>worst days</strong> — not your average days, not your best days. The rating schedule is based on severity. If you minimize your symptoms, your rating reflects that permanently. You are not exaggerating — you are being accurate about the full impact of your condition.</div>
  </div>`;
  conds.forEach((c, i) => {
    const name = c.name || '';
    const dc = typeof getDiagnosticCode === 'function' ? getDiagnosticCode(name) : null;
    const tips = typeof getCPTips === 'function' ? getCPTips(name) : [];
    html += `
    <div class="cpprep-card">
      <div class="cpprep-card-hdr" onclick="this.nextElementSibling.classList.toggle('open')">
        <div>
          <div class="cpprep-cond-name">${name}</div>
          <div style="font-size:11px;color:var(--text-sec);margin-top:2px">${dc ? 'DC ' + dc.code : ''} · Target: ${c.targetRating || '?'}%</div>
        </div>
        <span class="cpprep-chevron">▼</span>
      </div>
      <div class="cpprep-card-body ${i === 0 ? 'open' : ''}">
        <div class="cpprep-section-title">⚠️ Common Mistakes to Avoid</div>
        <div class="cpprep-mistake">• Saying "I'm doing okay" or "I manage fine" — even if true on that day</div>
        <div class="cpprep-mistake">• Minimizing frequency: say "multiple times a week" not "sometimes"</div>
        <div class="cpprep-mistake">• Forgetting to mention how it affects work, sleep, relationships, and daily activities</div>
        <div class="cpprep-mistake">• Not mentioning medications and their side effects</div>
        ${tips.length ? `<div class="cpprep-section-title" style="margin-top:16px">✅ What the Examiner Is Evaluating</div>${tips.map(t => `<div class="cpprep-tip">• ${t}</div>`).join('')}` : ''}
        <div class="cpprep-section-title" style="margin-top:16px">📝 Questions to Prepare For</div>
        ${getCPQuestions(name).map(q => `<div class="cpprep-question"><span class="cpprep-q-icon">Q</span><span>${q}</span></div>`).join('')}
        <div class="cpprep-section-title" style="margin-top:16px">💬 Practice With Aylene</div>
        <button class="btn btn-outline btn-sm" onclick="askAyleneAboutCP('${name.replace(/'/g, "\\'")}')">Ask Aylene to role-play this C&P exam →</button>
      </div>
    </div>`;
  });
  el.innerHTML = html;
}

function getCPQuestions(condName) {
  const n = (condName || '').toLowerCase();
  if (/asthma|respiratory|pulmonary|bronch/.test(n)) return [
    'How often do you use your rescue inhaler — on your worst days?',
    'Have you had attacks requiring ER visits, oral steroids, or hospitalization?',
    'What triggers your symptoms — exercise, cold air, chemicals, stress?',
    'Does this condition affect your ability to work, exercise, or sleep?',
    'Are you on a daily controller medication in addition to a rescue inhaler?'
  ];
  if (/sleep.?apnea|osa/.test(n)) return [
    'Do you use a CPAP machine? Every night? What happens when you don\'t?',
    'How is your sleep quality even with CPAP? Do you wake up exhausted?',
    'Does your bed partner observe apnea episodes or loud snoring?',
    'How does fatigue affect your daily functioning and work performance?',
    'When were you first diagnosed and what type of doctor diagnosed you?'
  ];
  if (/ptsd|anxiety|mst|trauma/.test(n)) return [
    'Describe your worst panic attack or flashback episode in detail',
    'How many days per week do symptoms affect your ability to function?',
    'Do you have difficulty maintaining relationships or employment?',
    'Describe your sleep — nightmares, hypervigilance, inability to fall asleep?',
    'Have you been hospitalized or had periods of being unable to function?'
  ];
  if (/tinnitus|ringing/.test(n)) return [
    'Is the ringing constant or intermittent? Both ears or one?',
    'Does it interfere with concentration, sleep, or conversations?',
    'What makes it worse — stress, noise, silence?',
    'When did it start relative to your service?'
  ];
  if (/back|lumbar|spine|cervical|neck/.test(n)) return [
    'What is your range of motion on your worst days — can you bend, twist, reach?',
    'Do you have radiculopathy — pain, numbness, or tingling down your arms or legs?',
    'How many days per week does pain limit your activity?',
    'What medications are you taking and do they fully control the pain?',
    'Has this affected your ability to work, lift, sit, or stand for extended periods?'
  ];
  return [
    'Describe your worst day with this condition in the past month',
    'How frequently do you experience symptoms?',
    'How does this condition affect your work, sleep, and relationships?',
    'What medications or treatments are you using — are they fully effective?',
    'Have your symptoms gotten better, worse, or stayed the same since separation?'
  ];
}

function askAyleneAboutCP(condName) {
  showPage('chat');
  if (chatHistory.length === 0) initChat();
  setTimeout(() => {
    document.getElementById('chatInput').value = `I have a C&P exam coming up for ${condName}. Can you role-play as the VA examiner and ask me the questions I need to prepare for? I want to practice describing my worst days accurately.`;
    sendMessage();
  }, 600);
}

// ── DEADLINES ──
function loadDeadlines() {
  try { deadlines = JSON.parse(localStorage.getItem('mc_deadlines_v1') || '[]'); } catch(e) { deadlines = []; }
}

function saveDeadlineData() {
  try { localStorage.setItem('mc_deadlines_v1', JSON.stringify(deadlines)); } catch(e) {}
}

function addDeadlineModal() {
  document.getElementById('dlDate').value = new Date().toISOString().split('T')[0];
  document.getElementById('dlLabel').value = '';
  document.getElementById('dlNotes').value = '';
  document.getElementById('deadlineModal').classList.add('active');
}

function saveDeadline() {
  const label = document.getElementById('dlLabel').value.trim();
  const date = document.getElementById('dlDate').value;
  const type = document.getElementById('dlType').value;
  const notes = document.getElementById('dlNotes').value.trim();
  if (!label || !date) { alert('Please enter a label and date.'); return; }
  deadlines.push({ id: Date.now(), label, date, type, notes });
  deadlines.sort((a, b) => new Date(a.date) - new Date(b.date));
  saveDeadlineData();
  closeModal('deadlineModal');
  renderDeadlines();
  logActivity('deadline_added', `📅 Deadline added: ${label}`);
}

function deleteDeadline(id) {
  deadlines = deadlines.filter(d => d.id !== id);
  saveDeadlineData();
  renderDeadlines();
}

function quickAddDeadline(type, label) {
  document.getElementById('dlLabel').value = label;
  document.getElementById('dlType').value = type;
  document.getElementById('dlDate').value = new Date().toISOString().split('T')[0];
  document.getElementById('dlNotes').value = '';
  document.getElementById('deadlineModal').classList.add('active');
}

function updateDeadlineBadge() {
  const badge = document.getElementById('deadlineBadge');
  if (!badge) return;
  const today = new Date(); today.setHours(0, 0, 0, 0);
  const urgent = deadlines.filter(d => {
    const diff = Math.round((new Date(d.date + 'T00:00:00') - today) / 86400000);
    return diff >= 0 && diff <= 30;
  });
  if (urgent.length) { badge.textContent = urgent.length; badge.style.display = 'inline-flex'; }
  else badge.style.display = 'none';
}

function renderDeadlines() {
  loadDeadlines();
  const el = document.getElementById('deadlinesContent');
  if (!el) return;
  const today = new Date(); today.setHours(0, 0, 0, 0);
  const typeIcons = { intent: '📋', exam: '🏥', deadline: '⚖️', followup: '🔔', other: '📌' };
  const typeLabels = { intent: 'Intent to File', exam: 'C&P Exam', deadline: 'Appeal Deadline', followup: 'Follow-Up', other: 'Other' };
  const typeColors = { intent: 'var(--navy)', exam: 'var(--sky)', deadline: '#DC2626', followup: 'var(--gold)', other: 'var(--text-sec)' };

  let html = `<div class="dl-quickadd-row">
    <div class="dl-quick-card" onclick="quickAddDeadline('intent','Intent to File Submitted')">
      <div class="dl-quick-icon">📋</div><div class="dl-quick-label">Log Intent to File</div><div class="dl-quick-sub">Protects your effective date</div>
    </div>
    <div class="dl-quick-card" onclick="quickAddDeadline('exam','C&P Exam Scheduled')">
      <div class="dl-quick-icon">🏥</div><div class="dl-quick-label">Schedule C&P Exam</div><div class="dl-quick-sub">Track your appointment</div>
    </div>
    <div class="dl-quick-card" onclick="quickAddDeadline('deadline','Decision Received — 1-Year Appeal Window Opens')">
      <div class="dl-quick-icon">⚖️</div><div class="dl-quick-label">Decision Received</div><div class="dl-quick-sub">Start 1-year appeal clock</div>
    </div>
  </div>`;

  if (!deadlines.length) {
    html += `<div class="empty-state" style="margin-top:24px"><div style="font-size:32px;margin-bottom:10px">📅</div>No dates tracked yet. Use the quick-add cards above or the + Add Date button.</div>`;
    el.innerHTML = html; updateDeadlineBadge(); return;
  }

  const renderItem = (d) => {
    const dDate = new Date(d.date + 'T00:00:00');
    const diffDays = Math.round((dDate - today) / 86400000);
    const isPast = diffDays < 0;
    const isUrgent = !isPast && diffDays <= 14;
    const dayLabel = isPast ? `${Math.abs(diffDays)} days ago` : diffDays === 0 ? 'TODAY' : `In ${diffDays} day${diffDays !== 1 ? 's' : ''}`;
    return `<div class="dl-item ${isUrgent ? 'dl-item-urgent' : ''} ${isPast ? 'dl-item-past' : ''}">
      <div class="dl-item-icon" style="color:${typeColors[d.type] || 'var(--navy)'}">${typeIcons[d.type] || '📌'}</div>
      <div class="dl-item-body">
        <div class="dl-item-label">${d.label}</div>
        <div class="dl-item-meta">${typeLabels[d.type] || d.type} · ${dDate.toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })}</div>
        ${d.notes ? `<div class="dl-item-notes">${d.notes}</div>` : ''}
      </div>
      <div class="dl-item-right">
        <div class="dl-day-badge ${isUrgent ? 'dl-day-urgent' : ''} ${isPast ? 'dl-day-past' : ''}">${dayLabel}</div>
        <button class="btn-note-del" onclick="deleteDeadline(${d.id})" title="Remove">✕</button>
      </div>
    </div>`;
  };

  const upcoming = deadlines.filter(d => new Date(d.date + 'T00:00:00') >= today);
  const past = deadlines.filter(d => new Date(d.date + 'T00:00:00') < today);
  if (upcoming.length) html += `<div class="dl-section-hdr">Upcoming</div>` + upcoming.map(renderItem).join('');
  if (past.length) html += `<div class="dl-section-hdr" style="margin-top:20px;color:var(--text-sec)">Past Dates</div>` + past.map(renderItem).join('');
  el.innerHTML = html;
  updateDeadlineBadge();
}

// ── BUDDY STATEMENT GENERATOR ──
function updateBuddyPlaceholders() {
  const relation = document.getElementById('buddyRelation')?.value || 'fellow_veteran';
  const ta = document.getElementById('buddyWitnessed');
  if (!ta) return;
  const ph = {
    fellow_veteran: 'e.g. I witnessed [veteran] participate in live chemical agent CBRN training drills without full protective gear on at least 6 occasions between 2016 and 2018...',
    spouse: 'e.g. As [veteran]\'s spouse, I observe daily the impact their condition has on our life — including breathing episodes, sleep disruption, and difficulty with physical activity...',
    family: 'e.g. As [veteran]\'s sibling, I have seen significant changes in their health since they returned from service, specifically...',
    supervisor: 'e.g. As [veteran]\'s platoon sergeant, I can attest to the in-service exposures and incidents that occurred under my command...',
    friend: 'e.g. I have known [veteran] since before their service and have personally observed significant changes in their health and ability to function...'
  };
  ta.placeholder = ph[relation] || ph.fellow_veteran;
}

async function generateBuddyStatement() {
  const author = document.getElementById('buddyAuthorName').value.trim();
  const relation = document.getElementById('buddyRelationDetail').value.trim();
  const condition = document.getElementById('buddyCondition').value.trim();
  const witnessed = document.getElementById('buddyWitnessed').value.trim();
  const impact = document.getElementById('buddyImpact').value.trim();
  if (!author || !condition || !witnessed) { alert('Please fill in the author name, condition, and what they witnessed.'); return; }
  const outputEl = document.getElementById('buddyOutput');
  outputEl.innerHTML = '<div style="padding:40px;text-align:center;color:var(--text-sec)">✨ Generating statement...</div>';
  document.getElementById('buddyOutputActions').style.display = 'none';
  const veteranName = currentUser?.user_metadata?.full_name || 'the veteran';
  const prompt = `Write a formal VA buddy statement (lay evidence) to support a VA disability claim. Format it as a proper letter.

Author name: ${author}
Author's relationship: ${relation || 'Not specified'}
Condition being supported: ${condition}
What they witnessed: ${witnessed}
Impact on daily life they observed: ${impact || 'Not provided'}
Veteran's name: ${veteranName}

The statement must:
1. Open with author identification and relationship to the veteran
2. State the purpose (supporting VA disability claim for ${condition})
3. Describe witnessed events/exposures with specificity (dates, locations, circumstances where possible)
4. Describe observed daily impact on the veteran's functioning
5. Close with a formal attestation that the statement is true to the best of the author's knowledge
6. End with a signature block: Name, Date, Contact info placeholders

Keep it factual, specific, formal, and under 500 words. Do not use brackets except for [DATE], [PHONE], [EMAIL], and [ADDRESS] placeholders.`;
  try {
    const data = await callClaude([{ role: 'user', content: prompt }], 800);
    const text = data.content?.[0]?.text || '';
    outputEl.innerHTML = `<pre class="buddy-statement-text">${text}</pre>`;
    document.getElementById('buddyOutputActions').style.display = 'flex';
    logActivity('buddy_generated', `✍️ Buddy statement generated for ${condition}`);
  } catch(e) {
    outputEl.innerHTML = `<div class="empty-state">Generation failed. Please try again.</div>`;
  }
}

function copyBuddyStatement() {
  const text = document.querySelector('.buddy-statement-text')?.textContent || '';
  navigator.clipboard.writeText(text).then(() => {
    const btn = event.target;
    btn.textContent = '✅ Copied!';
    setTimeout(() => btn.textContent = '📋 Copy Text', 2000);
  });
}

function printBuddyStatement() {
  const text = document.querySelector('.buddy-statement-text')?.textContent || '';
  const win = window.open('', '_blank');
  win.document.write(`<html><head><title>Buddy Statement</title><style>body{font-family:Georgia,serif;padding:40px;max-width:700px;margin:0 auto;white-space:pre-wrap;line-height:1.7;font-size:14px}@media print{body{padding:20px}}</style></head><body>${text.replace(/</g,'&lt;')}</body></html>`);
  win.document.close(); win.print();
}

// ── POST-FILING TIMELINE ──
function renderTimeline() {
  const el = document.getElementById('timelineContent');
  if (!el) return;
  const stages = [
    { icon: '📋', color: 'var(--navy)', title: 'Intent to File (ITF)', timing: 'Do this immediately — before gathering all evidence', details: ['Filing an ITF protects your effective date — the date VA starts calculating retroactive back pay.', 'You have 12 months from your ITF date to submit a complete claim. File within that window and back pay goes to the ITF date, not claim date.', 'File online at va.gov, by phone (1-800-827-1000), or at a regional office.', 'Get confirmation in writing. Screenshot or save the confirmation number.'], action: 'File at va.gov/decision-reviews/intent-to-file-a-claim/' },
    { icon: '📬', color: 'var(--sky)', title: 'Claim Submission', timing: 'Within 12 months of your Intent to File', details: ['Submit VA Form 21-526EZ online at va.gov (fastest processing) or by mail.', 'Attach all available evidence: nexus letters, medical records, buddy statements, DD-214.', 'A Fully Developed Claim (FDC) — certifying no more evidence to submit — is processed faster.', 'Keep copies of everything and document the submission date and method.'], action: 'va.gov/disability/file-disability-claim-form-21-526ez/' },
    { icon: '⏳', color: '#8B5CF6', title: 'VA Processing (60–200 days)', timing: 'Typical wait: 3–6 months, varies by regional office', details: ['VA will request your service treatment records (STRs) and may request records from VA health facilities.', 'If evidence is insufficient, VA must schedule a C&P exam — this is their duty to assist.', 'Check claim status anytime at va.gov/claim-or-appeal-status.', 'If VA sends a development letter requesting information, respond within 30 days.'], action: null },
    { icon: '🏥', color: '#0891B2', title: 'C&P Exam', timing: 'Usually within 30–90 days of claim submission', details: ['You will receive a letter from VA or a contractor (LHI, QTC). Attend — missing without rescheduling can result in denial.', 'The examiner evaluates your claim, not treats you. Describe your worst days.', 'Bring a list of symptoms, medications, and how the condition affects daily life.', 'Request a copy of the exam report within 30 days — errors are common and appealable.'], action: 'Use your C&P Exam Prep guide in the sidebar →' },
    { icon: '📄', color: 'var(--gold)', title: 'Rating Decision Letter', timing: 'Arrives by mail after processing completes', details: ['This letter shows what was approved, denied, your rating percentages, and your combined rating.', 'Read carefully — rating errors are common. Check effective date, percentages against diagnostic criteria, and denied conditions.', 'Upload your decision letter in My Records and ask Aylene to analyze it.', 'You have exactly ONE YEAR from the decision date to appeal if you disagree.'], action: 'Upload in My Records → Analyze with Aylene' },
    { icon: '💰', color: '#16A34A', title: 'First Payment', timing: '15–30 days after decision — retroactive to your effective date', details: ['Payments are made on the first business day of each month.', 'Retroactive pay covers the period from your effective date to the decision date.', 'Update direct deposit at va.gov to avoid delays.', 'If you receive military retirement pay, review Combat-Related Special Compensation (CRSC) eligibility.'], action: null },
    { icon: '🔄', color: 'var(--text-sec)', title: 'What Comes Next', timing: 'Ongoing — your claim journey does not end at first rating', details: ['Denied condition? Appeal within 1 year: Supplemental Claim (new evidence), Higher-Level Review, or BVA Appeal.', 'Rated lower than expected? File for an increase anytime symptoms worsen. No limit on increase filings.', 'New conditions caused by service-connected conditions can be filed as secondary at any time.', 'Review TDIU if disabilities prevent substantially gainful employment.', 'Claim Dependency allowance if you have a spouse or children — adds to monthly payment.'], action: null }
  ];

  let html = `<div class="timeline-intro">
    <div class="timeline-intro-title">The VA Claims Journey — What to Expect</div>
    <div class="timeline-intro-body">Most veterans are surprised by how long the process takes and how much they can influence the outcome. Here is the full picture — from filing to payment and beyond.</div>
  </div><div class="timeline-track">`;

  stages.forEach((s, i) => {
    html += `<div class="tl-item">
      <div class="tl-left">
        <div class="tl-dot" style="background:${s.color}">${s.icon}</div>
        ${i < stages.length - 1 ? '<div class="tl-line"></div>' : ''}
      </div>
      <div class="tl-right">
        <div class="tl-stage-hdr" onclick="this.nextElementSibling.classList.toggle('open')">
          <div><div class="tl-stage-title">${s.title}</div><div class="tl-stage-timing">${s.timing}</div></div>
          <span class="tl-chevron">▼</span>
        </div>
        <div class="tl-stage-body ${i === 0 ? 'open' : ''}">
          ${s.details.map(d => `<div class="tl-detail">• ${d}</div>`).join('')}
          ${s.action ? `<div class="tl-action-link">→ ${s.action}</div>` : ''}
        </div>
      </div>
    </div>`;
  });
  html += '</div>';
  el.innerHTML = html;
}

// ── FLOATING AYLENE BUBBLE ──
let floatOpen = false;
let floatHistory = [];

function showAyleneFloat() {
  const el = document.getElementById('ayleneFloat');
  if (el) {
    el.style.display = 'block';
    // Render Aylene avatar in bubble
    const av = document.getElementById('ayleneFloatAvatar');
    const avSm = document.getElementById('ayleneFloatAvatarSm');
    if (av) av.innerHTML = AYLENE_AVATAR_SVG;
    if (avSm) avSm.innerHTML = AYLENE_AVATAR_SVG;
    // Init with greeting if no history
    if (!floatHistory.length) {
      const greeting = roadmapData
        ? `Hey — I can see your roadmap. What do you want to dig into?`
        : `Hey! I'm Aylene. Ask me anything about your VA claim.`;
      appendFloatMsg('ai', greeting);
      floatHistory.push({ role: 'assistant', content: greeting });
    }
  }
}

function toggleAyleneFloat() {
  const panel = document.getElementById('ayleneFloatPanel');
  if (!panel) return;
  floatOpen = !floatOpen;
  panel.style.display = floatOpen ? 'flex' : 'none';
  if (floatOpen) {
    document.getElementById('ayleneFloatBadge').style.display = 'none';
    setTimeout(() => document.getElementById('ayleneFloatInput')?.focus(), 100);
    scrollFloatToBottom();
  }
}

function closeAyleneFloat() {
  floatOpen = false;
  const panel = document.getElementById('ayleneFloatPanel');
  if (panel) panel.style.display = 'none';
}

function appendFloatMsg(role, text) {
  const msgs = document.getElementById('ayleneFloatMsgs');
  if (!msgs) return;
  const div = document.createElement('div');
  div.className = role === 'user' ? 'float-msg float-msg-user' : 'float-msg float-msg-ai';
  div.innerHTML = text.replace(/\n/g, '<br>');
  msgs.appendChild(div);
  scrollFloatToBottom();
  // Show badge if panel closed
  if (!floatOpen && role === 'ai') {
    const badge = document.getElementById('ayleneFloatBadge');
    if (badge) badge.style.display = 'flex';
  }
}

function scrollFloatToBottom() {
  const msgs = document.getElementById('ayleneFloatMsgs');
  if (msgs) msgs.scrollTop = msgs.scrollHeight;
}

async function sendFloatMessage() {
  const input = document.getElementById('ayleneFloatInput');
  const text = input?.value?.trim();
  if (!text) return;
  input.value = '';
  input.style.height = 'auto';
  appendFloatMsg('user', text);
  floatHistory.push({ role: 'user', content: text });

  // Typing indicator
  const typingId = 'float-typing-' + Date.now();
  const msgs = document.getElementById('ayleneFloatMsgs');
  if (msgs) {
    const t = document.createElement('div');
    t.className = 'float-msg float-msg-ai float-typing';
    t.id = typingId;
    t.innerHTML = '<span></span><span></span><span></span>';
    msgs.appendChild(t);
    scrollFloatToBottom();
  }

  const context = roadmapData
    ? `
VETERAN PROFILE:
- Branch: ${ans.branch?.join('/') || 'Unknown'}, MOS: ${ans.mos?.code || '?'} ${ans.mos?.label || ''}
- Deployments: ${ans.deployments?.join(', ') || 'None'}
- Pathway: ${roadmapData?.pathway || 'DIRECT'}
- Conditions: ${(roadmapData?.conditions || conditions).map(c => c.name).join(', ')}
${ans.deployments?.some(d => /gulf|iraq|afghanistan|oif|oef|vietnam|swa/i.test(d)) ? '' : 'CONUS only — do NOT mention PACT Act.'}`
    : '';

  try {
    const data = await callClaude([...floatHistory.slice(-6)], 300, AYLENE_SYSTEM + context);
    document.getElementById(typingId)?.remove();
    const reply = data.content?.[0]?.text || "Having trouble right now, try again.";
    appendFloatMsg('ai', reply);
    floatHistory.push({ role: 'assistant', content: reply });
  } catch(e) {
    document.getElementById(typingId)?.remove();
    const msg = e.message?.includes('overloaded') || e.message?.includes('529')
      ? 'API is a little busy right now — try again in a few seconds.'
      : 'Connection issue — try again in a moment.';
    appendFloatMsg('ai', msg);
  }
}

// ── CLAIMS 101 CAROUSEL ──
let _c101Timer = null;
let _c101Current = 0;

function showC101(idx) {
  const cards = document.querySelectorAll('.c101-card');
  const dots = document.querySelectorAll('.c101-dot');
  cards.forEach((c, i) => c.classList.toggle('active', i === idx));
  dots.forEach((d, i) => d.classList.toggle('active', i === idx));
  _c101Current = idx;
  // Reset progress bar on card change
  const bar = document.getElementById('c101ProgressFill');
  if (bar) bar.style.width = '0%';
}

function startC101Carousel() {
  _c101Current = 0;
  showC101(0);
  clearInterval(_c101Timer);
  const CARD_DURATION = 7000; // 7 seconds per card
  let _c101Elapsed = 0;
  const TICK = 50;
  _c101Timer = setInterval(() => {
    _c101Elapsed += TICK;
    // Update progress bar
    const pct = (_c101Elapsed / CARD_DURATION) * 100;
    const bar = document.getElementById('c101ProgressFill');
    if (bar) bar.style.width = Math.min(pct, 100) + '%';
    if (_c101Elapsed >= CARD_DURATION) {
      _c101Elapsed = 0;
      const total = document.querySelectorAll('.c101-card').length;
      _c101Current = (_c101Current + 1) % total;
      showC101(_c101Current);
    }
  }, TICK);
}

function stopC101Carousel() {
  clearInterval(_c101Timer);
  _c101Timer = null;
}

// ── CLAUDE API ──
async function callClaude(messages, maxTokens = 800, system = '', retries = 3) {
  const body = { model: CLAUDE_MODEL, max_tokens: Math.min(maxTokens, 3000), messages };
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

      // 429 = rate limited, 529 = overloaded — both get exponential backoff retry
      if (res.status === 429 || res.status === 529) {
        if (attempt >= retries) {
          const label = res.status === 529 ? 'overloaded' : 'rate limited';
          throw new Error(`API ${label} after ${retries} retries. Please try again in a moment.`);
        }
        // Exponential backoff with jitter: 3s, 9s, 27s (+/- 1s random)
        const base = Math.pow(3, attempt + 1) * 1000;
        const jitter = Math.random() * 1000;
        const wait = base + jitter;
        console.warn(`API ${res.status} (attempt ${attempt + 1}/${retries}). Retrying in ${Math.round(wait/1000)}s...`);
        await new Promise(r => setTimeout(r, wait));
        continue;
      }

      if (!res.ok) {
        const errData = await res.json().catch(() => ({}));
        throw new Error(`Claude API error: ${res.status} — ${errData?.error?.message || res.statusText}`);
      }

      return await res.json();

    } catch(e) {
      // Network errors (no internet, DNS, etc.) — short retry
      if (attempt < retries && !e.message.includes('API')) {
        const wait = (attempt + 1) * 3000;
        await new Promise(r => setTimeout(r, wait));
        continue;
      }
      throw e;
    }
  }
  throw new Error('Max retries exceeded');
}
