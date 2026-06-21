/**
 * teacher.js — Teacher Dashboard Logic
 * English Classes Platform
 */

// ── Area Metadata ─────────────────────────────────────────────
const AREA_META = {
  grammar:       { label: 'Grammar',       icon: '📖', color: 'grammar' },
  listening:     { label: 'Listening',     icon: '🎧', color: 'listening' },
  speaking:      { label: 'Speaking',      icon: '🗣️', color: 'speaking' },
  writing:       { label: 'Writing',       icon: '✍️', color: 'writing' },
  reading:       { label: 'Reading',       icon: '👁️', color: 'reading' },
  pronunciation: { label: 'Pronunciation', icon: '🔊', color: 'pronunciation' },
};

// ── State ─────────────────────────────────────────────────────
let currentFilter = 'all';
let editingId     = null;

// ── Init ──────────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', () => {
  checkAuth();
  setupPasswordGate();
  setupAreaSelect();
  setupFilterChips();
  setupFormSubmit();
  setupFormAreaChange();
  setupToastContainer();
});

// ── Auth ──────────────────────────────────────────────────────
function checkAuth() {
  if (window.Auth && window.Auth.isLoggedIn()) {
    const user = window.Auth.getCurrentUser();
    if (user) {
      if (user.role === 'teacher' || user.role === 'coordinator') {
        showDashboard();
        return;
      } else if (user.role === 'student') {
        window.location.href = 'dashboard.html';
        return;
      }
    }
  }
  showPasswordGate();
}

function showPasswordGate() {
  const gate = document.getElementById('password-gate');
  if (gate) gate.style.display = 'flex';

  const dashboard = document.getElementById('dashboard-wrapper');
  if (dashboard) dashboard.style.display = 'none';
}

function showDashboard() {
  const gate = document.getElementById('password-gate');
  if (gate) gate.style.display = 'none';

  const dashboard = document.getElementById('dashboard-wrapper');
  if (dashboard) dashboard.style.display = 'flex';

  refreshDashboard();
  setupStudentTargetDropdown();
}

function setupPasswordGate() {
  const form    = document.getElementById('password-form');
  const userInp = document.getElementById('teacher-username');
  const passInp = document.getElementById('password-input');
  const errorEl = document.getElementById('password-error');

  if (!form) return;

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const user = userInp.value.trim();
    const pw = passInp.value.trim();

    try {
      const authData = await window.Auth.login({ username: user, password: pw });
      if (authData.role !== 'teacher' && authData.role !== 'coordinator') {
        throw new Error('Access denied. Not a teacher.');
      }
      showDashboard();
    } catch (err) {
      errorEl.textContent = err.message || 'Incorrect password. Please try again.';
      passInp.value = '';
      passInp.focus();
      passInp.style.borderColor = 'var(--writing-color)';
      setTimeout(() => {
        passInp.style.borderColor = '';
        errorEl.textContent = '';
      }, 3000);
    }
  });
}

function logout() {
  if (window.Auth) window.Auth.logout();
  showPasswordGate();
  showToast('Logged out successfully.', 'info');
}

// ── Dashboard Refresh ─────────────────────────────────────────
function refreshDashboard() {
  renderStats();
  renderActivityList();
  updateSidebarCounts();
}

// ── Stats ─────────────────────────────────────────────────────
function renderStats() {
  const stats = Storage.getStats();

  Object.entries(AREA_META).forEach(([area, meta]) => {
    const el = document.getElementById(`stat-${area}`);
    if (el) el.textContent = stats[area]?.published || 0;
    const totalEl = document.getElementById(`total-${area}`);
    if (totalEl) totalEl.textContent = stats[area]?.total || 0;
  });
}

function updateSidebarCounts() {
  const stats = Storage.getStats();
  Object.keys(AREA_META).forEach(area => {
    const el = document.getElementById(`sidebar-count-${area}`);
    if (el) el.textContent = stats[area]?.total || 0;
  });
}

// ── Activity List ─────────────────────────────────────────────
function renderActivityList(areaFilter = currentFilter) {
  const container = document.getElementById('activity-list');
  if (!container) return;

  const area = areaFilter === 'all' ? null : areaFilter;
  const activities = Storage.getAllActivities(area);

  container.innerHTML = '';

  if (activities.length === 0) {
    container.innerHTML = `
      <div class="empty-state">
        <div class="empty-state-icon">📋</div>
        <div class="empty-state-title">No activities yet</div>
        <div class="empty-state-text">Create your first activity using the form above.</div>
      </div>
    `;
    return;
  }

  activities.forEach(act => {
    const card = buildManagerCard(act);
    container.appendChild(card);
  });
}

function buildManagerCard(act) {
  const meta = AREA_META[act.area] || { label: act.area, icon: '📄', color: act.area };
  const card = document.createElement('div');
  card.className = 'manager-card';
  card.id = `manager-card-${act.id}`;

  const publishedLabel = act.published
    ? `<span class="badge badge-success">✓ Published</span>`
    : `<span class="badge badge-neutral">Draft</span>`;

  const date = Storage.formatDate(act.created_at || act.createdAt);

  card.innerHTML = `
    <div class="manager-card-info">
      <div class="manager-card-title">${escHtml(act.title)}</div>
      <div class="manager-card-meta">
        <span class="badge badge-${meta.color}">${meta.icon} ${meta.label}</span>
        ${publishedLabel}
        <span>📅 ${date}</span>
      </div>
    </div>
    <div class="manager-card-actions">
      <label class="toggle" title="${act.published ? 'Unpublish' : 'Publish'}">
        <input type="checkbox" ${act.published ? 'checked' : ''}
          onchange="togglePublish('${act.id}', this.checked)">
        <span class="toggle-slider"></span>
      </label>
      <button class="btn btn-secondary btn-sm btn-icon" title="Edit activity"
        onclick="editActivity('${act.id}')">✏️</button>
      <button class="btn btn-danger btn-sm btn-icon" title="Delete activity"
        onclick="confirmDelete('${act.id}')">🗑️</button>
    </div>
  `;

  return card;
}

// ── Form Setup ────────────────────────────────────────────────
function setupAreaSelect() {
  const select = document.getElementById('form-area');
  if (!select) return;

  Object.entries(AREA_META).forEach(([value, meta]) => {
    const opt = document.createElement('option');
    opt.value = value;
    opt.textContent = `${meta.icon} ${meta.label}`;
    select.appendChild(opt);
  });
}

function setupFormAreaChange() {
  const select   = document.getElementById('form-area');
  const typeField = document.getElementById('form-type');
  const audioSection  = document.getElementById('audio-upload-section');
  const contentLabel  = document.getElementById('content-label');

  if (!select) return;

  select.addEventListener('change', () => {
    const area = select.value;

    if (!typeField) return;

    // Auto-set sensible type based on area
    if (area === 'listening') {
      typeField.value = 'audio';
    } else if (area === 'speaking') {
      typeField.value = 'speaking_prompt';
    } else if (area === 'writing') {
      typeField.value = 'writing_prompt';
    } else {
      typeField.value = 'text';
    }
    handleTypeChange();
  });

  if (typeField) {
    typeField.addEventListener('change', handleTypeChange);
  }
}

function handleTypeChange() {
  const typeSelect    = document.getElementById('form-type');
  const audioSection  = document.getElementById('audio-upload-section');
  const contentGroup  = document.getElementById('content-group');
  const contentLabel  = document.getElementById('content-label');

  if (!typeSelect) return;
  const type = typeSelect.value;

  // Show/hide audio upload
  if (audioSection) {
    audioSection.style.display = (type === 'audio') ? 'block' : 'none';
  }

  // Adjust content label
  if (contentLabel) {
    const labels = {
      'text':            'Content (supports **bold**, *italic*, • bullets)',
      'speaking_prompt': 'Speaking Prompt & Instructions',
      'writing_prompt':  'Writing Task Description',
      'audio':           'Audio Description / Transcript (optional)',
    };
    contentLabel.textContent = labels[type] || 'Content';
  }

  if (contentGroup) {
    contentGroup.style.display = (type === 'audio') ? 'block' : 'block';
  }
}

// ── Form Submit ───────────────────────────────────────────────
function setupFormSubmit() {
  const form = document.getElementById('activity-form');
  if (!form) return;

  form.addEventListener('submit', async e => {
    e.preventDefault();
    const submitBtn = document.getElementById('submit-btn');
    const btnText   = document.getElementById('submit-btn-text');

    // Read fields
    const area        = document.getElementById('form-area').value;
    const title       = document.getElementById('form-title').value.trim();
    const description = document.getElementById('form-desc').value.trim();
    const content     = document.getElementById('form-content').value.trim();
    const type        = document.getElementById('form-type').value;
    const published   = document.getElementById('form-publish').checked;
    const audioFile   = document.getElementById('form-audio')?.files[0];
    const studentSel  = document.getElementById('form-student');
    const student_id  = studentSel && studentSel.value !== 'all' ? studentSel.value : null;

    // Validate
    if (!area || !title) {
      showToast('Please fill in the Area and Title fields.', 'error');
      return;
    }

    submitBtn.disabled = true;
    if (btnText) btnText.textContent = 'Saving...';

    let audioSrc = null;

    // Handle audio file
    if (type === 'audio' && audioFile) {
      try {
        audioSrc = await readFileAsDataURL(audioFile);
      } catch {
        showToast('Failed to read audio file.', 'error');
        submitBtn.disabled = false;
        if (btnText) btnText.textContent = editingId ? 'Save Changes' : 'Create Activity';
        return;
      }
    }

    const activityData = {
      area, title, description, content, type, published,
      student_id,
      ...(audioSrc ? { audioSrc } : {}),
    };

    if (editingId) {
      // Update existing
      await Storage.updateActivity(editingId, activityData);
      showToast('Activity updated successfully!', 'success');
      cancelEdit();
    } else {
      // Create new
      await Storage.addActivity(activityData);
      showToast(`"${title}" created and ${published ? 'published' : 'saved as draft'}!`, 'success');
      form.reset();
      handleTypeChange();
    }

    submitBtn.disabled = false;
    if (btnText) btnText.textContent = 'Create Activity';
    refreshDashboard();
  });
}

function readFileAsDataURL(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload  = e => resolve(e.target.result);
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

// ── Edit / Delete / Publish ───────────────────────────────────
function editActivity(id) {
  const act = Storage.getActivity(id);
  if (!act) return;

  editingId = id;

  // Fill form
  document.getElementById('form-area').value    = act.area;
  document.getElementById('form-title').value   = act.title;
  document.getElementById('form-desc').value    = act.description || '';
  document.getElementById('form-content').value = act.content || '';
  document.getElementById('form-type').value    = act.type || 'text';
  document.getElementById('form-publish').checked = act.published;

  handleTypeChange();

  // Update button text
  const btnText  = document.getElementById('submit-btn-text');
  const cancelBtn = document.getElementById('cancel-edit-btn');
  if (btnText)   btnText.textContent = 'Save Changes';
  if (cancelBtn) cancelBtn.style.display = 'inline-flex';

  // Update form header
  const formTitle = document.getElementById('form-section-title');
  if (formTitle) formTitle.textContent = '✏️ Edit Activity';

  // Scroll to form
  document.getElementById('activity-form')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
}

function cancelEdit() {
  editingId = null;

  const form = document.getElementById('activity-form');
  if (form) form.reset();

  handleTypeChange();

  const btnText  = document.getElementById('submit-btn-text');
  const cancelBtn = document.getElementById('cancel-edit-btn');
  if (btnText)   btnText.textContent = 'Create Activity';
  if (cancelBtn) cancelBtn.style.display = 'none';

  const formTitle = document.getElementById('form-section-title');
  if (formTitle) formTitle.textContent = '➕ New Activity';
}

async function togglePublish(id, checked) {
  const updated = await Storage.updateActivity(id, { published: checked });
  if (updated) {
    showToast(
      checked ? '✓ Activity published!' : 'Activity moved to drafts.',
      checked ? 'success' : 'info'
    );
    refreshDashboard();
  }
}

function confirmDelete(id) {
  const act = Storage.getActivity(id);
  if (!act) return;

  document.getElementById('delete-modal-title').textContent = `Delete "${act.title}"?`;
  document.getElementById('confirm-delete-btn').onclick = async () => {
    await Storage.deleteActivity(id);
    closeDeleteModal();
    showToast('Activity deleted.', 'info');
    refreshDashboard();
  };

  openDeleteModal();
}

function openDeleteModal() {
  const overlay = document.getElementById('overlay-delete-modal');
  if (overlay) {
    overlay.classList.add('active');
    document.body.style.overflow = 'hidden';
  }
}

function closeDeleteModal() {
  const overlay = document.getElementById('overlay-delete-modal');
  if (overlay) {
    overlay.classList.remove('active');
    document.body.style.overflow = '';
  }
}

// ── Sidebar & Filter ──────────────────────────────────────────
function setupFilterChips() {
  const chips = document.querySelectorAll('.filter-chip[data-area]');
  chips.forEach(chip => {
    chip.addEventListener('click', () => {
      chips.forEach(c => c.classList.remove('active'));
      chip.classList.add('active');
      currentFilter = chip.dataset.area;
      renderActivityList(currentFilter);
    });
  });
}

function sidebarFilter(area) {
  currentFilter = area;

  // Update filter chips
  document.querySelectorAll('.filter-chip[data-area]').forEach(c => {
    c.classList.toggle('active', c.dataset.area === area);
  });

  // Update sidebar active state
  document.querySelectorAll('.sidebar-nav-item[data-area]').forEach(item => {
    item.classList.toggle('active', item.dataset.area === area);
  });

  renderActivityList(area);

  // Scroll to list
  document.getElementById('activity-list')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
}

// ── Toast ─────────────────────────────────────────────────────
function setupToastContainer() {
  if (!document.getElementById('toast-container')) {
    const el = document.createElement('div');
    el.id = 'toast-container';
    el.className = 'toast-container';
    document.body.appendChild(el);
  }
}

function showToast(message, type = 'info') {
  const icons = { success: '✅', error: '❌', info: 'ℹ️', warning: '⚠️' };
  const container = document.getElementById('toast-container');
  if (!container) return;

  const toast = document.createElement('div');
  toast.className = `toast ${type}`;
  toast.innerHTML = `
    <span class="toast-icon">${icons[type] || 'ℹ️'}</span>
    <span class="toast-text">${escHtml(message)}</span>
  `;
  container.appendChild(toast);

  setTimeout(() => {
    toast.classList.add('removing');
    setTimeout(() => toast.remove(), 300);
  }, 3500);
}

// ── Main Section Switching ────────────────────────────────────
function switchMainTab(tab) {
  const isCustom = tab === 'custom';
  const isCurriculum = tab === 'curriculum';
  const isStudents = tab === 'students';

  // Toggle active class on sidebar buttons
  document.getElementById('tab-btn-custom')?.classList.toggle('active', isCustom);
  document.getElementById('tab-btn-curriculum')?.classList.toggle('active', isCurriculum);
  document.getElementById('tab-btn-students')?.classList.toggle('active', isStudents);

  // Toggle visibility of main views
  document.getElementById('view-custom')?.classList.toggle('hidden', !isCustom);
  document.getElementById('view-curriculum')?.classList.toggle('hidden', !isCurriculum);
  document.getElementById('view-students')?.classList.toggle('hidden', !isStudents);

  // Toggle visibility of custom filters in sidebar
  document.getElementById('sidebar-custom-group')?.classList.toggle('hidden', !isCustom);

  if (tab === 'curriculum') {
    renderCurriculumWeeks();
  } else if (tab === 'students') {
    loadTeacherStudents();
  }
}

// ── Render Curriculum Weeks Grid ──────────────────────────────
function renderCurriculumWeeks() {
  const container = document.getElementById('curriculum-weeks-grid');
  if (!container) return;

  const overrides = Storage.getCurriculumOverrides();

  container.innerHTML = CURRICULUM.map(week => {
    // Count overridden slots for this week
    let overrideCount = 0;
    const slotsStatus = [1, 2, 3, 4, 5].map(slotNum => {
      const isOverridden = !!overrides[`w${week.week}_s${slotNum}`];
      if (isOverridden) overrideCount++;
      return { slotNum, isOverridden };
    });

    const levelColors = {
      'Beginner':         'bg-emerald-500/15 text-emerald-400 border-emerald-500/25',
      'Elementary':       'bg-blue-500/15 text-blue-400 border-blue-500/25',
      'Pre-Intermediate': 'bg-violet-500/15 text-violet-400 border-violet-500/25',
      'Intermediate':     'bg-amber-500/15 text-amber-400 border-amber-500/25',
      'Advanced':         'bg-rose-500/15 text-rose-400 border-rose-500/25',
    };
    const badgeClass = levelColors[week.level] || 'bg-zinc-800 text-zinc-400';

    // Dot colors matching dashboard skills
    const dotColors = {
      grammar:       '#818cf8',
      listening:     '#2dd4bf',
      speaking:      '#fbbf24',
      writing:       '#fb7185',
      reading:       '#38bdf8',
      pronunciation: '#c084fc',
    };

    const dotsHtml = week.activities.map(act => {
      const isOverridden = !!overrides[`w${week.week}_s${act.slot}`];
      const color = dotColors[act.skill] || '#71717a';
      const borderStyle = isOverridden ? 'outline: 1.5px solid #ffffff; outline-offset: 1px; box-shadow: 0 0 8px ' + color : '';
      return `<div class="area-dot" title="Slot ${act.slot}: ${act.skill} (${isOverridden ? 'Customized' : 'Standard'})"
        style="width: 10px; height: 10px; border-radius: 50%; background: ${color}; ${borderStyle}"></div>`;
    }).join('');

    return `
      <div class="curriculum-week-card" onclick="openCurriculumWeekModal(${week.week})"
        style="background: var(--bg-card); border: 1px solid var(--border-subtle); border-radius: var(--r-xl); padding: var(--sp-4); cursor: pointer; transition: all var(--t-base); position: relative;">
        <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: var(--sp-2);">
          <span style="font-size: 0.8rem; font-weight: 700; color: var(--text-muted);">SEMANA ${String(week.week).padStart(2,'0')}</span>
          <span class="badge ${badgeClass}" style="font-size: 0.65rem; border: 1px solid currentColor;">${week.levelPT}</span>
        </div>
        <div style="font-size: 0.95rem; font-weight: 700; color: var(--text-primary); margin-bottom: var(--sp-3); line-height: 1.3; min-height: 2.6rem;" class="line-clamp-2">
          ${week.tema}
        </div>
        
        <div style="display: flex; justify-content: space-between; align-items: center; border-top: 1px solid var(--border-subtle); padding-top: var(--sp-3); margin-top: var(--sp-1);">
          <span style="font-size: 0.72rem; color: var(--text-muted);">${overrideCount}/5 customizados</span>
          <div style="display: flex; gap: 6px;">
            ${dotsHtml}
          </div>
        </div>
      </div>`;
  }).join('');
}

// ── Open Curriculum Week Modal ────────────────────────────────
let currentOpenWeek = null;
function openCurriculumWeekModal(weekNum) {
  currentOpenWeek = weekNum;
  const weekData = getCurriculumWeek(weekNum);
  if (!weekData) return;

  const modal = document.getElementById('overlay-curriculum-modal');
  const title = document.getElementById('curriculum-modal-title');

  if (title) title.textContent = `Semana ${weekNum}: ${weekData.tema} (${weekData.levelPT})`;
  
  renderCurriculumSlotsList(weekNum, weekData);

  if (modal) {
    modal.classList.add('active');
    document.body.style.overflow = 'hidden';
  }
}

function closeCurriculumModal() {
  const modal = document.getElementById('overlay-curriculum-modal');
  if (modal) {
    modal.classList.remove('active');
    document.body.style.overflow = '';
  }
  refreshDashboard();
  renderCurriculumWeeks();
}

// ── Render Slots List inside Modal ────────────────────────────
function renderCurriculumSlotsList(weekNum, weekData) {
  const body = document.getElementById('curriculum-modal-body');
  if (!body) return;

  const overrides = Storage.getCurriculumOverrides();

  // Mapping of skill icons
  const skillIcons = {
    grammar:       '📖 Grammar',
    listening:     '🎧 Listening',
    speaking:      '🗣️ Speaking',
    writing:       '✍️ Writing',
    reading:       '👁️ Reading',
    pronunciation: '🔊 Pronunciation',
  };

  const skillBadgeColors = {
    grammar:       'badge-grammar',
    listening:     'badge-listening',
    speaking:      'badge-speaking',
    writing:       'badge-writing',
    reading:       'badge-reading',
    pronunciation: 'badge-pronunciation',
  };

  body.innerHTML = weekData.activities.map(act => {
    const key = `w${weekNum}_s${act.slot}`;
    const isOverridden = !!overrides[key];
    const badgeClass = skillBadgeColors[act.skill] || 'badge-neutral';
    
    return `
      <div id="slot-card-${weekNum}-${act.slot}" class="activity-card" 
        style="border: 1px solid ${isOverridden ? 'var(--grammar-color)' : 'var(--border-subtle)'}; 
               background: var(--bg-surface); padding: var(--sp-4); border-radius: var(--r-lg); margin-bottom: var(--sp-4);">
        
        <!-- View mode -->
        <div id="slot-view-${weekNum}-${act.slot}">
          <div style="display: flex; justify-content: space-between; align-items: start; margin-bottom: var(--sp-2);">
            <div style="display: flex; align-items: center; gap: var(--sp-2);">
              <span class="badge ${badgeClass}">${skillIcons[act.skill] || act.skill}</span>
              <span style="font-size: 0.8rem; color: var(--text-muted);">Slot ${act.slot} ${isOverridden ? '(Editado)' : '(Padrão)'}</span>
            </div>
            <button class="btn btn-secondary btn-sm" onclick="editCurriculumSlot(${weekNum}, ${act.slot})">
              ✏️ Editar Atividade
            </button>
          </div>
          <h3 style="font-size: 1rem; font-weight: 700; color: var(--text-primary); margin-bottom: var(--sp-1);">${escHtml(act.title)}</h3>
          <div style="font-size: 0.8rem; color: var(--text-muted); margin-bottom: var(--sp-3);">
            Duração: ${act.estimatedMin} min | Tipo: ${act.type}
          </div>
          
          ${act.audioSrc ? `
            <div style="margin-bottom:var(--sp-3); max-width:400px;">
              <audio src="${act.audioSrc}" controls style="width:100%; height:32px;"></audio>
            </div>
          ` : ''}

          <div style="font-size: 0.85rem; color: var(--text-secondary); line-height: 1.6; white-space: pre-wrap; background: var(--bg-card); padding: var(--sp-3); border-radius: var(--r-md); max-height: 180px; overflow-y: auto;">
            ${escHtml(act.content)}
          </div>
        </div>

        <!-- Edit mode -->
        <div id="slot-edit-${weekNum}-${act.slot}" class="hidden">
          <h3 style="font-size: 0.95rem; font-weight: 700; color: var(--text-primary); margin-bottom: var(--sp-3); border-bottom: 1px solid var(--border-subtle); padding-bottom: var(--sp-1);">
            Editar Slot ${act.slot}: ${skillIcons[act.skill] || act.skill}
          </h3>
          <form onsubmit="saveCurriculumSlot(event, ${weekNum}, ${act.slot})">
            <div class="form-group">
              <label class="form-label" for="edit-title-${weekNum}-${act.slot}">Título da Atividade *</label>
              <input type="text" id="edit-title-${weekNum}-${act.slot}" class="form-input" value="${escHtml(act.title)}" required>
            </div>
            <div class="form-row">
              <div class="form-group">
                <label class="form-label" for="edit-time-${weekNum}-${act.slot}">Duração (minutos) *</label>
                <input type="number" id="edit-time-${weekNum}-${act.slot}" class="form-input" min="5" max="120" value="${act.estimatedMin}" required>
              </div>
              <div class="form-group">
                <label class="form-label" for="edit-type-${weekNum}-${act.slot}">Tipo de Atividade</label>
                <select id="edit-type-${weekNum}-${act.slot}" class="form-select" onchange="toggleEditAudioField(${weekNum}, ${act.slot})">
                  <option value="text" ${act.type === 'text' ? 'selected' : ''}>📝 Texto / Exercício</option>
                  <option value="audio" ${act.type === 'audio' ? 'selected' : ''}>🎧 Audio Listening</option>
                  <option value="speaking_prompt" ${act.type === 'speaking_prompt' ? 'selected' : ''}>🗣️ Speaking Prompt</option>
                  <option value="writing_prompt" ${act.type === 'writing_prompt' ? 'selected' : ''}>✍️ Writing Prompt</option>
                </select>
              </div>
            </div>

            <!-- Audio Upload for slot -->
            <div class="form-group" id="edit-audio-group-${weekNum}-${act.slot}" style="display: ${act.type === 'audio' ? 'block' : 'none'};">
              <label class="form-label">Arquivo de Áudio</label>
              <input type="file" id="edit-audio-${weekNum}-${act.slot}" accept="audio/*" class="form-input" style="padding: 0.25rem;">
              <span class="form-hint">Deixe em branco para manter o áudio anterior (se houver).</span>
            </div>

            <div class="form-group">
              <label class="form-label" for="edit-content-${weekNum}-${act.slot}">Conteúdo / Instruções *</label>
              <textarea id="edit-content-${weekNum}-${act.slot}" class="form-textarea" rows="8" required>${escHtml(act.content)}</textarea>
            </div>
            <div style="display: flex; gap: var(--sp-2); justify-content: flex-end; margin-top: var(--sp-3);">
              <button type="button" class="btn btn-ghost btn-sm" onclick="cancelEditCurriculumSlot(${weekNum}, ${act.slot})">
                Cancelar
              </button>
              <button type="submit" class="btn btn-primary btn-sm" id="edit-save-btn-${weekNum}-${act.slot}">
                Salvar Alterações
              </button>
            </div>
          </form>
        </div>
      </div>`;
  }).join('');
}

function editCurriculumSlot(weekNum, slot) {
  document.getElementById(`slot-view-${weekNum}-${slot}`).classList.add('hidden');
  document.getElementById(`slot-edit-${weekNum}-${slot}`).classList.remove('hidden');
}

function cancelEditCurriculumSlot(weekNum, slot) {
  document.getElementById(`slot-view-${weekNum}-${slot}`).classList.remove('hidden');
  document.getElementById(`slot-edit-${weekNum}-${slot}`).classList.add('hidden');
}

function toggleEditAudioField(weekNum, slot) {
  const type = document.getElementById(`edit-type-${weekNum}-${slot}`).value;
  const audioGroup = document.getElementById(`edit-audio-group-${weekNum}-${slot}`);
  if (audioGroup) {
    audioGroup.style.display = (type === 'audio') ? 'block' : 'none';
  }
}

async function saveCurriculumSlot(event, weekNum, slot) {
  event.preventDefault();

  const title      = document.getElementById(`edit-title-${weekNum}-${slot}`).value.trim();
  const time       = parseInt(document.getElementById(`edit-time-${weekNum}-${slot}`).value);
  const type       = document.getElementById(`edit-type-${weekNum}-${slot}`).value;
  const content    = document.getElementById(`edit-content-${weekNum}-${slot}`).value.trim();
  const audioFile  = document.getElementById(`edit-audio-${weekNum}-${slot}`)?.files[0];
  const saveBtn    = document.getElementById(`edit-save-btn-${weekNum}-${slot}`);

  if (!title || isNaN(time) || !content) {
    showToast('Por favor preencha todos os campos obrigatórios.', 'error');
    return;
  }

  if (saveBtn) {
    saveBtn.disabled = true;
    saveBtn.textContent = 'Salvando...';
  }

  let audioSrc = null;
  if (type === 'audio' && audioFile) {
    try {
      audioSrc = await readFileAsDataURL(audioFile);
    } catch {
      showToast('Falha ao ler o arquivo de áudio.', 'error');
      if (saveBtn) {
        saveBtn.disabled = false;
        saveBtn.textContent = 'Salvar Alterações';
      }
      return;
    }
  }

  const activityData = {
    title,
    estimatedMin: time,
    type,
    content,
    ...(audioSrc ? { audioSrc } : {})
  };

  await Storage.saveCurriculumOverride(weekNum, slot, activityData);
  showToast('Atividade do currículo atualizada com sucesso!', 'success');

  // Refresh slot rendering in modal
  const weekData = getCurriculumWeek(weekNum);
  renderCurriculumSlotsList(weekNum, weekData);
}

// ── Utilities ─────────────────────────────────────────────────
function escHtml(str) {
  const div = document.createElement('div');
  div.appendChild(document.createTextNode(str || ''));
  return div.innerHTML;
}

// ── Handle audio file name display ───────────────────────────
document.addEventListener('DOMContentLoaded', () => {
  const audioInput = document.getElementById('form-audio');
  const audioName  = document.getElementById('audio-file-name');
  if (audioInput && audioName) {
    audioInput.addEventListener('change', () => {
      const file = audioInput.files[0];
      audioName.textContent = file ? file.name : 'No file chosen';
    });
  }
});

// ── Students & Submissions & Logs Logic ────────────────────────
let teacherStudents = [];
let activeStudentId = null;

async function setupStudentTargetDropdown() {
  const select = document.getElementById('form-student');
  if (!select) return;
  
  if (window.Auth && window.Auth.isLoggedIn()) {
    try {
      const token = window.Auth.getToken();
      const res = await fetch(`${API_BASE_URL}/users/students`, {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      if (res.ok) {
        const studentsList = await res.json();
        select.innerHTML = '<option value="all">All Students (Global)</option>';
        studentsList.forEach(s => {
          const opt = document.createElement('option');
          opt.value = s.id;
          opt.textContent = `${s.full_name} (@${s.username})`;
          select.appendChild(opt);
        });
      }
    } catch (e) {
      console.error(e);
    }
  }
}

async function loadTeacherStudents() {
  const token = window.Auth.getToken();
  const listEl = document.getElementById('teacher-students-list');
  if (!listEl) return;
  
  listEl.innerHTML = '<div class="text-xs text-zinc-500 p-2">Loading students...</div>';
  
  try {
    const res = await fetch(`${API_BASE_URL}/users/students`, {
      headers: { 'Authorization': `Bearer ${token}` }
    });
    if (res.ok) {
      teacherStudents = await res.json();
      if (teacherStudents.length === 0) {
        listEl.innerHTML = '<div class="text-xs text-zinc-500 p-2">No assigned students.</div>';
        return;
      }
      listEl.innerHTML = teacherStudents.map(s => {
        const week = s.student_profile?.current_week || 1;
        return `
          <button onclick="selectTeacherStudent('${s.id}')" id="student-row-${s.id}" class="w-full text-left px-3 py-2 rounded-lg text-sm text-zinc-300 hover:bg-zinc-800 transition-colors flex items-center justify-between">
            <span>${escHtml(s.full_name)}</span>
            <span class="text-xs text-zinc-500">Week ${week}</span>
          </button>
        `;
      }).join('');
    } else {
      listEl.innerHTML = '<div class="text-xs text-rose-400 p-2">Error loading students.</div>';
    }
  } catch (err) {
    listEl.innerHTML = '<div class="text-xs text-rose-400 p-2">Error loading students.</div>';
  }
}

async function selectTeacherStudent(studentId) {
  activeStudentId = studentId;
  const student = teacherStudents.find(s => s.id === studentId);
  if (!student) return;
  
  // Highlight active row
  document.querySelectorAll('[id^="student-row-"]').forEach(el => {
    el.classList.remove('bg-blue-600/10', 'text-blue-400');
  });
  const row = document.getElementById(`student-row-${studentId}`);
  if (row) row.classList.add('bg-blue-600/10', 'text-blue-400');
  
  // Show active detail panel
  document.getElementById('no-student-selected').style.display = 'none';
  document.getElementById('student-active-detail').classList.remove('hidden');
  
  // Update header text
  document.getElementById('active-student-name').textContent = student.full_name;
  const week = student.student_profile?.current_week || 1;
  const classCode = student.student_profile?.class_code || 'No Class';
  document.getElementById('active-student-meta').textContent = `@${student.username} | Week ${week} | Class: ${classCode}`;
  
  // Load default sub tab (submissions)
  switchStudentSubTab('submissions');
}

function switchStudentSubTab(subTab) {
  const isSubmissions = subTab === 'submissions';
  
  document.getElementById('sub-tab-btn-submissions').classList.toggle('active', isSubmissions);
  document.getElementById('sub-tab-btn-board-log').classList.toggle('active', !isSubmissions);
  
  document.getElementById('student-sub-tab-submissions').classList.toggle('hidden', !isSubmissions);
  document.getElementById('student-sub-tab-board-log').classList.toggle('hidden', isSubmissions);
  
  if (isSubmissions) {
    loadStudentSubmissions(activeStudentId);
  } else {
    loadStudentBoardLogs(activeStudentId);
  }
}

async function loadStudentSubmissions(studentId) {
  const listEl = document.getElementById('student-submissions-list');
  if (!listEl) return;
  listEl.innerHTML = '<div class="text-xs text-zinc-500 py-4">Loading submissions...</div>';
  
  try {
    const token = window.Auth.getToken();
    const res = await fetch(`${API_BASE_URL}/progress/student/${studentId}`, {
      headers: { 'Authorization': `Bearer ${token}` }
    });
    if (res.ok) {
      const progressList = await res.json();
      if (progressList.length === 0) {
        listEl.innerHTML = '<div class="text-xs text-zinc-500 py-4">No completed activities yet.</div>';
        return;
      }
      
      listEl.innerHTML = progressList.map(p => {
        const date = new Date(p.completed_at).toLocaleString('pt-BR');
        const scoreDisplay = p.teacher_score !== null ? `${p.teacher_score}/100` : 'Not graded';
        const feedbackDisplay = p.teacher_notes || 'No feedback notes yet.';
        
        return `
          <div class="bg-zinc-950 border border-zinc-800 p-4 rounded-lg space-y-3">
            <div class="flex justify-between items-center text-xs text-zinc-500">
              <span class="font-bold text-blue-400 uppercase tracking-wider">${escHtml(p.skill_area)}</span>
              <span>Week ${p.week_num} · Slot ${p.slot_num} · Completed: ${date}</span>
            </div>
            
            ${p.student_response ? `
              <div class="text-xs text-zinc-400 font-semibold mb-1">Student Response:</div>
              <div class="bg-zinc-900 border border-zinc-800 p-3 rounded text-sm text-zinc-100 whitespace-pre-wrap">${escHtml(p.student_response)}</div>
            ` : `<div class="text-xs text-zinc-500 italic">Self-completed / Mark done only.</div>`}
            
            <div class="border-t border-zinc-900 pt-3 mt-2">
              <form onsubmit="submitGrade(event, '${p.id}', '${studentId}')" class="space-y-2">
                <div style="display: flex; gap: var(--sp-4);">
                  <div style="flex: 1;">
                    <label class="form-label text-xs" style="margin-bottom: 2px;">Teacher Feedback</label>
                    <input type="text" id="grade-notes-${p.id}" value="${escHtml(p.teacher_notes || '')}" class="form-input" style="padding: 0.25rem 0.5rem; font-size: 0.8rem;" placeholder="Excellent work...">
                  </div>
                  <div style="width: 80px;">
                    <label class="form-label text-xs" style="margin-bottom: 2px;">Score</label>
                    <input type="number" id="grade-score-${p.id}" value="${p.teacher_score !== null ? p.teacher_score : ''}" min="0" max="100" class="form-input text-center font-bold" style="padding: 0.25rem; font-size: 0.8rem;" placeholder="0-100">
                  </div>
                </div>
                <div style="display: flex; justify-content: space-between; align-items: center;">
                  <span class="text-xs text-zinc-500">Status: <strong class="${p.teacher_score !== null ? 'text-emerald-400' : 'text-amber-400'}">${scoreDisplay}</strong></span>
                  <button type="submit" class="btn btn-secondary btn-sm" style="padding: 0.25rem 0.5rem; font-size: 0.75rem;">Grade</button>
                </div>
              </form>
            </div>
          </div>
        `;
      }).join('');
    } else {
      listEl.innerHTML = '<div class="text-xs text-rose-400 py-4">Error loading progress data.</div>';
    }
  } catch (err) {
    listEl.innerHTML = '<div class="text-xs text-rose-400 py-4">Error loading progress data.</div>';
  }
}

async function submitGrade(event, progressId, studentId) {
  event.preventDefault();
  const notes = document.getElementById(`grade-notes-${progressId}`).value.trim();
  const scoreVal = document.getElementById(`grade-score-${progressId}`).value;
  const score = scoreVal !== '' ? parseInt(scoreVal) : null;
  
  if (score === null || isNaN(score)) {
    showToast('Please enter a valid score (0-100).', 'error');
    return;
  }
  
  try {
    const token = window.Auth.getToken();
    const res = await fetch(`${API_BASE_URL}/progress/${progressId}/grade`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
      body: JSON.stringify({ teacher_notes: notes, teacher_score: score })
    });
    if (res.ok) {
      showToast('Activity graded successfully!', 'success');
      loadStudentSubmissions(studentId);
    } else {
      showToast('Failed to save grade.', 'error');
    }
  } catch (e) {
    showToast('Failed to save grade.', 'error');
  }
}

async function loadStudentBoardLogs(studentId) {
  const container = document.getElementById('student-board-log-entries');
  if (!container) return;
  container.innerHTML = '<div class="text-xs text-zinc-500 py-4">Loading board logs...</div>';
  
  try {
    const token = window.Auth.getToken();
    const res = await fetch(`${API_BASE_URL}/board-logs/student/${studentId}`, {
      headers: { 'Authorization': `Bearer ${token}` }
    });
    if (res.ok) {
      const logs = await res.json();
      if (logs.length === 0) {
        container.innerHTML = '<div class="text-xs text-zinc-500 py-4 text-center">No progress logs recorded for this student yet.</div>';
        return;
      }
      
      container.innerHTML = logs.map(l => {
        const date = new Date(l.created_at).toLocaleString('pt-BR');
        return `
          <div class="bg-zinc-950 border border-zinc-800 p-4 rounded-lg space-y-2">
            <div class="flex justify-between items-center text-xs text-zinc-500">
              <span class="font-semibold text-blue-400">Log Entry</span>
              <span>📅 ${date}</span>
            </div>
            <div class="text-sm text-zinc-200 whitespace-pre-wrap">${escHtml(l.content)}</div>
          </div>
        `;
      }).join('');
    } else {
      container.innerHTML = '<div class="text-xs text-rose-400 py-4">Error loading board logs.</div>';
    }
  } catch (err) {
    container.innerHTML = '<div class="text-xs text-rose-400 py-4">Error loading board logs.</div>';
  }
}

// Board Log Form listener
document.addEventListener('DOMContentLoaded', () => {
  const form = document.getElementById('add-board-log-form');
  if (form) {
    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      const textarea = document.getElementById('board-log-content');
      const content = textarea.value.trim();
      if (!content || !activeStudentId) return;
      
      try {
        const token = window.Auth.getToken();
        const res = await fetch(`${API_BASE_URL}/board-logs/`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
          body: JSON.stringify({ student_id: activeStudentId, content })
        });
        if (res.ok) {
          showToast('Board log added successfully!', 'success');
          textarea.value = '';
          loadStudentBoardLogs(activeStudentId);
        } else {
          showToast('Failed to add board log.', 'error');
        }
      } catch (err) {
        showToast('Failed to add board log.', 'error');
      }
    });
  }
});

// ── Expose Globals ────────────────────────────────────────────
window.logout                   = logout;
window.editActivity             = editActivity;
window.cancelEdit               = cancelEdit;
window.togglePublish            = togglePublish;
window.confirmDelete            = confirmDelete;
window.closeDeleteModal         = closeDeleteModal;
window.sidebarFilter            = sidebarFilter;
window.showToast                = showToast;
window.switchMainTab            = switchMainTab;
window.renderCurriculumWeeks    = renderCurriculumWeeks;
window.openCurriculumWeekModal  = openCurriculumWeekModal;
window.closeCurriculumModal     = closeCurriculumModal;
window.editCurriculumSlot       = editCurriculumSlot;
window.selectTeacherStudent     = selectTeacherStudent;
window.switchStudentSubTab      = switchStudentSubTab;
window.submitGrade              = submitGrade;
window.cancelEditCurriculumSlot = cancelEditCurriculumSlot;
window.toggleEditAudioField     = toggleEditAudioField;
window.saveCurriculumSlot       = saveCurriculumSlot;

