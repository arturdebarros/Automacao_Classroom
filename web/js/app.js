/**
 * app.js — Student Portal Logic
 * English Classes Platform
 */

// ── Area Metadata ────────────────────────────────────────────
const AREAS = {
  grammar: {
    label:  'Grammar',
    icon:   '📖',
    desc:   'Master the rules and structures of the English language.',
    color:  'grammar',
  },
  listening: {
    label:  'Listening',
    icon:   '🎧',
    desc:   'Train your ear with audio exercises and comprehension tasks.',
    color:  'listening',
  },
  speaking: {
    label:  'Speaking',
    icon:   '🗣️',
    desc:   'Practice your oral fluency with guided speaking prompts.',
    color:  'speaking',
  },
  writing: {
    label:  'Writing',
    icon:   '✍️',
    desc:   'Develop your writing skills through structured tasks.',
    color:  'writing',
  },
  reading: {
    label:  'Reading',
    icon:   '👁️',
    desc:   'Expand your comprehension with varied reading passages.',
    color:  'reading',
  },
  pronunciation: {
    label:  'Pronunciation',
    icon:   '🔊',
    desc:   'Perfect your English sounds with phoneme training exercises.',
    color:  'pronunciation',
  },
};

// ── State ────────────────────────────────────────────────────
let currentArea = null;
let phonemeData  = [];
let mediaRecorder = null;
let recordingChunks = [];
let recordingTimer  = null;
let recordingSeconds = 0;
let recordedBlob = null;

// ── Init ─────────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', () => {
  Storage.seedIfEmpty();
  renderSkillCards();
  updateNavStats();
  setupModalCloseHandlers();
  setupToastContainer();
  loadPhonemesData();
});

// ── Skill Cards ───────────────────────────────────────────────
function renderSkillCards() {
  const grid = document.getElementById('skills-grid');
  if (!grid) return;

  const stats = Storage.getStats();

  Object.entries(AREAS).forEach(([areaKey, area]) => {
    const count = stats[areaKey]?.published || 0;

    const card = document.createElement('div');
    card.className = `skill-card ${areaKey}`;
    card.setAttribute('role', 'button');
    card.setAttribute('tabindex', '0');
    card.setAttribute('aria-label', `Open ${area.label} activities`);
    card.id = `card-${areaKey}`;

    card.innerHTML = `
      <div class="skill-card-icon">${area.icon}</div>
      <div>
        <div class="skill-card-title">${area.label}</div>
        <div class="skill-card-desc">${area.desc}</div>
      </div>
      <div class="skill-card-count">
        <span>📚</span>
        <span>${count} ${count === 1 ? 'activity' : 'activities'}</span>
      </div>
      <div class="skill-card-arrow">→</div>
    `;

    card.addEventListener('click', () => openAreaModal(areaKey));
    card.addEventListener('keydown', e => {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        openAreaModal(areaKey);
      }
    });

    grid.appendChild(card);
  });
}

function updateNavStats() {
  const totalEl = document.getElementById('total-activities');
  if (totalEl) totalEl.textContent = Storage.getTotalPublished();
}

// ── Area Modal ────────────────────────────────────────────────
function openAreaModal(areaKey) {
  currentArea = areaKey;
  const area = AREAS[areaKey];
  const activities = Storage.getActivities(areaKey, true);

  // Set modal theme
  const modal = document.getElementById('area-modal');
  if (!modal) return;

  // Remove old area color classes
  Object.keys(AREAS).forEach(k => modal.classList.remove(`area-${k}`));
  modal.classList.add(`area-${areaKey}`);

  // Update header
  document.getElementById('modal-area-icon').textContent  = area.icon;
  document.getElementById('modal-area-title').textContent = area.label;
  document.getElementById('modal-area-badge').textContent = `${activities.length} ${activities.length === 1 ? 'Activity' : 'Activities'}`;
  document.getElementById('modal-area-badge').className   = `badge badge-${areaKey}`;

  // Render content
  const body = document.getElementById('modal-area-body');
  body.innerHTML = '';

  if (areaKey === 'pronunciation') {
    renderPronunciationContent(body, activities);
  } else if (activities.length === 0) {
    body.innerHTML = `
      <div class="empty-state">
        <div class="empty-state-icon">${area.icon}</div>
        <div class="empty-state-title">No activities yet</div>
        <div class="empty-state-text">Your teacher hasn't posted any ${area.label} activities yet. Check back soon!</div>
      </div>
    `;
  } else {
    activities.forEach(act => {
      body.appendChild(buildActivityCard(act, areaKey));
    });
  }

  // Open modal
  openModal('area-modal');
}

// ── Activity Card Builder ─────────────────────────────────────
function buildActivityCard(act, areaKey) {
  const card = document.createElement('div');
  card.className = 'activity-card';

  let contentHtml = '';

  switch (act.type) {
    case 'audio':
      contentHtml = buildAudioPlayer(act);
      break;
    case 'speaking_prompt':
      contentHtml = buildSpeakingWidget(act);
      break;
    case 'writing_prompt':
      contentHtml = buildWritingWidget(act);
      break;
    default:
      contentHtml = `<div class="activity-card-content">${markdownToHtml(act.content || '')}</div>`;
  }

  card.innerHTML = `
    <div class="activity-card-header">
      <div class="activity-card-title">${escHtml(act.title)}</div>
      <span class="badge badge-${areaKey}">${AREAS[areaKey].label}</span>
    </div>
    ${act.description ? `<div class="activity-card-desc">${escHtml(act.description)}</div>` : ''}
    ${contentHtml}
    <div style="margin-top:var(--sp-3); font-size:0.75rem; color:var(--text-muted);">
      Posted ${Storage.formatDate(act.created_at || act.createdAt)}
    </div>
  `;

  return card;
}

// ── Audio Player ──────────────────────────────────────────────
function buildAudioPlayer(act) {
  const bars = Array.from({ length: 40 }, (_, i) => {
    const h = 8 + Math.random() * 22;
    return `<div class="audio-bar" style="height:${h}px"></div>`;
  }).join('');

  const id = `audio-${act.id}`;

  return `
    <div class="audio-player" id="player-${act.id}">
      <button class="audio-play-btn" id="playbtn-${act.id}" onclick="toggleAudio('${act.id}')">▶</button>
      <div class="audio-track">
        <div class="audio-waveform" id="wave-${act.id}">${bars}</div>
        <div class="audio-progress">
          <span id="cur-${act.id}">0:00</span>
          <span id="dur-${act.id}">0:00</span>
        </div>
      </div>
    </div>
    <audio id="${id}" src="${act.audioSrc || ''}" style="display:none"
      onended="onAudioEnd('${act.id}')"
      ontimeupdate="onAudioTime('${act.id}', this)"
      onloadedmetadata="onAudioMeta('${act.id}', this)">
    </audio>
  `;
}

function toggleAudio(id) {
  const audio = document.getElementById(`audio-${id}`);
  const btn   = document.getElementById(`playbtn-${id}`);
  if (!audio) return;

  if (audio.paused) {
    // Pause all others
    document.querySelectorAll('audio').forEach(a => { a.pause(); });
    document.querySelectorAll('.audio-play-btn').forEach(b => b.textContent = '▶');
    audio.play();
    btn.textContent = '⏸';
    animateWave(id, true);
  } else {
    audio.pause();
    btn.textContent = '▶';
    animateWave(id, false);
  }
}

function onAudioEnd(id) {
  const btn = document.getElementById(`playbtn-${id}`);
  if (btn) btn.textContent = '▶';
  animateWave(id, false);
}

function onAudioTime(id, audio) {
  const el = document.getElementById(`cur-${id}`);
  if (el) el.textContent = formatTime(audio.currentTime);

  // Animate bars
  const wave = document.getElementById(`wave-${id}`);
  if (wave) {
    const bars = wave.querySelectorAll('.audio-bar');
    const pct  = audio.currentTime / (audio.duration || 1);
    const active = Math.floor(pct * bars.length);
    bars.forEach((b, i) => b.classList.toggle('active', i <= active));
  }
}

function onAudioMeta(id, audio) {
  const el = document.getElementById(`dur-${id}`);
  if (el) el.textContent = formatTime(audio.duration);
}

function animateWave(id, playing) {
  const wave = document.getElementById(`wave-${id}`);
  if (!wave) return;
  wave.style.opacity = playing ? '1' : '0.5';
}

function formatTime(s) {
  const m = Math.floor(s / 60);
  const sec = Math.floor(s % 60);
  return `${m}:${sec.toString().padStart(2, '0')}`;
}

// ── Speaking Widget ───────────────────────────────────────────
function buildSpeakingWidget(act) {
  const widgetId = `speak-${act.id}`;
  return `
    <div class="activity-card-content" style="margin-bottom:var(--sp-4);">
      ${markdownToHtml(act.content || '')}
    </div>
    <div class="recording-widget" id="${widgetId}">
      <div class="record-timer" id="timer-${act.id}">0:00</div>
      <div class="record-status" id="status-${act.id}">Press to start recording</div>
      <button class="record-btn" id="recbtn-${act.id}" onclick="toggleRecording('${act.id}')">🎙️</button>
      <div id="playback-${act.id}" style="margin-top:var(--sp-4); display:none;">
        <p style="font-size:0.82rem; color:var(--text-muted); margin-bottom:var(--sp-2);">Your recording:</p>
        <audio id="playback-audio-${act.id}" controls style="width:100%; border-radius:var(--r-md);"></audio>
      </div>
    </div>
  `;
}

function toggleRecording(actId) {
  const btn    = document.getElementById(`recbtn-${actId}`);
  const status = document.getElementById(`status-${actId}`);
  const timer  = document.getElementById(`timer-${actId}`);

  if (mediaRecorder && mediaRecorder.state === 'recording') {
    // Stop recording
    mediaRecorder.stop();
    clearInterval(recordingTimer);
    btn.classList.remove('recording');
    btn.textContent = '🎙️';
    status.textContent = 'Recording saved! Listen to your playback below.';
    return;
  }

  // Start recording
  navigator.mediaDevices.getUserMedia({ audio: true })
    .then(stream => {
      recordingChunks = [];
      recordingSeconds = 0;
      timer.textContent = '0:00';
      status.textContent = '● Recording...';
      btn.classList.add('recording');
      btn.textContent = '⏹️';

      recordingTimer = setInterval(() => {
        recordingSeconds++;
        const m = Math.floor(recordingSeconds / 60);
        const s = recordingSeconds % 60;
        timer.textContent = `${m}:${s.toString().padStart(2,'0')}`;
      }, 1000);

      mediaRecorder = new MediaRecorder(stream);
      mediaRecorder.ondataavailable = e => recordingChunks.push(e.data);
      mediaRecorder.onstop = () => {
        const blob = new Blob(recordingChunks, { type: 'audio/webm' });
        const url  = URL.createObjectURL(blob);
        const playback    = document.getElementById(`playback-${actId}`);
        const audioPlayer = document.getElementById(`playback-audio-${actId}`);
        if (audioPlayer) audioPlayer.src = url;
        if (playback)    playback.style.display = 'block';
        stream.getTracks().forEach(t => t.stop());
      };
      mediaRecorder.start();
    })
    .catch(() => {
      status.textContent = '⚠️ Microphone access denied. Please allow mic access.';
      showToast('Microphone access is required for speaking exercises.', 'error');
    });
}

// ── Writing Widget ────────────────────────────────────────────
function buildWritingWidget(act) {
  return `
    <div class="activity-card-content" style="margin-bottom:var(--sp-4);">
      ${markdownToHtml(act.content || '')}
    </div>
    <div class="form-group">
      <label class="form-label">Your Response</label>
      <textarea class="form-textarea" id="writing-${act.id}" placeholder="Type your answer here..." rows="6"></textarea>
    </div>
    <div style="display:flex; gap:var(--sp-3); align-items:center;">
      <button class="btn btn-secondary btn-sm" onclick="clearWriting('${act.id}')">Clear</button>
      <button class="btn btn-primary btn-sm" onclick="saveWriting('${act.id}')">Save Response</button>
      <span id="writing-saved-${act.id}" style="font-size:0.8rem; color:var(--grammar-color); opacity:0; transition:opacity 0.3s;">✓ Saved!</span>
    </div>
  `;
}

function clearWriting(actId) {
  const el = document.getElementById(`writing-${actId}`);
  if (el) el.value = '';
}

function saveWriting(actId) {
  const el = document.getElementById(`writing-${actId}`);
  if (!el) return;
  localStorage.setItem(`writing_response_${actId}`, el.value);
  const saved = document.getElementById(`writing-saved-${actId}`);
  if (saved) {
    saved.style.opacity = '1';
    setTimeout(() => { saved.style.opacity = '0'; }, 2000);
  }
}

// ── Pronunciation / Phoneme Explorer ─────────────────────────
function loadPhonemesData() {
  fetch('../roteiros.json')
    .then(r => {
      if (!r.ok) throw new Error('not found');
      return r.json();
    })
    .then(data => {
      phonemeData = data;
    })
    .catch(() => {
      phonemeData = [];
    });
}

function renderPronunciationContent(container, activities) {
  // Tabs: Teacher Activities | Phoneme Explorer
  const tabsHtml = `
    <div class="tabs" style="margin-bottom:var(--sp-5);">
      <button class="tab-btn active" onclick="switchPronTab(event, 'teacher-acts')">📋 Teacher Activities</button>
      <button class="tab-btn" onclick="switchPronTab(event, 'phoneme-explorer')">🔬 Phoneme Explorer</button>
    </div>
    <div id="pron-tab-teacher-acts" class="tab-content active">
      ${activities.length === 0
        ? `<div class="empty-state">
             <div class="empty-state-icon">🔊</div>
             <div class="empty-state-title">No activities yet</div>
             <div class="empty-state-text">Your teacher hasn't posted any Pronunciation activities yet.</div>
           </div>`
        : ''}
      <div id="pron-activities-list"></div>
    </div>
    <div id="pron-tab-phoneme-explorer" class="tab-content">
      <div style="margin-bottom:var(--sp-4);">
        <input class="form-input" id="phoneme-search" placeholder="Search phonemes or words..." oninput="filterPhonemes(this.value)" style="max-width:360px;">
      </div>
      <div class="filter-bar" id="phoneme-filters">
        <button class="filter-chip active" onclick="filterPhonemeType(event, 'all')">All</button>
        <button class="filter-chip" onclick="filterPhonemeType(event, 'short')">Short Vowels</button>
        <button class="filter-chip" onclick="filterPhonemeType(event, 'long')">Long Vowels</button>
        <button class="filter-chip" onclick="filterPhonemeType(event, 'diph')">Diphthongs</button>
        <button class="filter-chip" onclick="filterPhonemeType(event, 'cons')">Consonants</button>
      </div>
      <div class="phoneme-grid" id="phoneme-grid"></div>
    </div>
  `;

  container.innerHTML = tabsHtml;

  // Render teacher activities
  const actList = document.getElementById('pron-activities-list');
  if (actList) {
    activities.forEach(act => actList.appendChild(buildActivityCard(act, 'pronunciation')));
  }

  // Render phoneme grid
  renderPhonemeGrid(phonemeData, '');
}

function switchPronTab(e, tabId) {
  document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
  document.querySelectorAll('.tab-content').forEach(c => c.classList.remove('active'));
  e.target.classList.add('active');
  const content = document.getElementById(`pron-tab-${tabId}`);
  if (content) content.classList.add('active');

  if (tabId === 'phoneme-explorer') {
    renderPhonemeGrid(phonemeData, '');
  }
}

let currentPhonemeFilter = 'all';

function filterPhonemeType(e, type) {
  document.querySelectorAll('#phoneme-filters .filter-chip').forEach(c => c.classList.remove('active'));
  e.target.classList.add('active');
  currentPhonemeFilter = type;
  const search = document.getElementById('phoneme-search')?.value || '';
  renderPhonemeGrid(phonemeData, search);
}

function filterPhonemes(query) {
  renderPhonemeGrid(phonemeData, query);
}

function renderPhonemeGrid(data, query) {
  const grid = document.getElementById('phoneme-grid');
  if (!grid) return;

  let filtered = data;

  // Type filter
  if (currentPhonemeFilter !== 'all') {
    filtered = filtered.filter(p => p.id_fonema.startsWith(currentPhonemeFilter));
  }

  // Text filter
  if (query) {
    const q = query.toLowerCase();
    filtered = filtered.filter(p =>
      p.simbolo_ipa.toLowerCase().includes(q) ||
      p.id_fonema.toLowerCase().includes(q) ||
      (p.palavras_escolhidas || []).some(w => w.toLowerCase().includes(q))
    );
  }

  grid.innerHTML = '';

  if (filtered.length === 0) {
    grid.innerHTML = `<div style="grid-column:1/-1;"><div class="empty-state"><div class="empty-state-icon">🔍</div><div class="empty-state-title">No phonemes found</div><div class="empty-state-text">Try a different search term.</div></div></div>`;
    return;
  }

  filtered.forEach(p => {
    const type = getPhonemeTypeName(p.id_fonema);
    const card = document.createElement('div');
    card.className = 'phoneme-card';
    card.setAttribute('title', `Click to hear description: ${p.id_fonema}`);

    const words = (p.palavras_escolhidas || [])
      .map(w => `<span class="phoneme-word">${escHtml(w)}</span>`)
      .join('');

    card.innerHTML = `
      <div class="phoneme-ipa">${escHtml(p.simbolo_ipa)}</div>
      <div class="phoneme-type">${type}</div>
      <div class="phoneme-words">${words}</div>
    `;

    card.addEventListener('click', () => openPhonemeModal(p));
    grid.appendChild(card);
  });
}

function getPhonemeTypeName(id) {
  if (id.startsWith('short')) return 'Short Vowel';
  if (id.startsWith('long'))  return 'Long Vowel';
  if (id.startsWith('diph'))  return 'Diphthong';
  if (id.startsWith('cons'))  return 'Consonant';
  if (id === 'schwa')         return 'Schwa';
  return 'Phoneme';
}

function openPhonemeModal(phoneme) {
  document.getElementById('phoneme-modal-ipa').textContent = phoneme.simbolo_ipa;
  document.getElementById('phoneme-modal-type').textContent = getPhonemeTypeName(phoneme.id_fonema);
  document.getElementById('phoneme-modal-roteiro').textContent = phoneme.roteiro_ssml || '';

  const wordsList = document.getElementById('phoneme-modal-words');
  wordsList.innerHTML = (phoneme.palavras_escolhidas || [])
    .map(w => `<span class="phoneme-word" style="font-size:0.9rem; padding:4px 12px;">${escHtml(w)}</span>`)
    .join('');

  openModal('phoneme-modal');
}

// ── Modal System ──────────────────────────────────────────────
function openModal(id) {
  const overlay = document.getElementById(`overlay-${id}`);
  if (overlay) {
    overlay.classList.add('active');
    document.body.style.overflow = 'hidden';
  }
}

function closeModal(id) {
  const overlay = document.getElementById(`overlay-${id}`);
  if (overlay) {
    overlay.classList.remove('active');
    document.body.style.overflow = '';
  }
  // Stop any playing audio
  document.querySelectorAll('audio').forEach(a => a.pause());
  document.querySelectorAll('.audio-play-btn').forEach(b => b.textContent = '▶');
  // Stop recording
  if (mediaRecorder && mediaRecorder.state === 'recording') {
    mediaRecorder.stop();
    clearInterval(recordingTimer);
  }
}

function setupModalCloseHandlers() {
  document.querySelectorAll('.modal-overlay').forEach(overlay => {
    overlay.addEventListener('click', e => {
      if (e.target === overlay) {
        overlay.classList.remove('active');
        document.body.style.overflow = '';
      }
    });
  });

  document.addEventListener('keydown', e => {
    if (e.key === 'Escape') {
      document.querySelectorAll('.modal-overlay.active').forEach(o => {
        o.classList.remove('active');
        document.body.style.overflow = '';
      });
    }
  });
}

// ── Toast System ──────────────────────────────────────────────
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

// ── Utilities ─────────────────────────────────────────────────
function escHtml(str) {
  const div = document.createElement('div');
  div.appendChild(document.createTextNode(str || ''));
  return div.innerHTML;
}

function markdownToHtml(text) {
  return (text || '')
    .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
    .replace(/\*(.*?)\*/g, '<em>$1</em>')
    .replace(/`(.*?)`/g, '<code style="background:var(--bg-surface);padding:2px 6px;border-radius:4px;font-size:0.85em;">$1</code>')
    .replace(/^### (.+)$/gm, '<h4 style="font-weight:700;margin:0.75rem 0 0.25rem;color:var(--text-primary);">$1</h4>')
    .replace(/^## (.+)$/gm,  '<h3 style="font-weight:700;margin:0.75rem 0 0.25rem;color:var(--text-primary);">$1</h3>')
    .replace(/^• (.+)$/gm,   '<div style="display:flex;gap:0.5rem;margin:0.2rem 0;"><span style="color:var(--grammar-color);">•</span><span>$1</span></div>')
    .replace(/^\d+\. (.+)$/gm, (m, p1) => `<div style="display:flex;gap:0.5rem;margin:0.2rem 0;"><span style="color:var(--grammar-color);font-weight:600;">→</span><span>${p1}</span></div>`)
    .replace(/\n\n/g, '</p><p style="margin:0.5rem 0;">')
    .replace(/\n/g, '<br>');
}

// Expose globally
window.openAreaModal    = openAreaModal;
window.closeModal       = closeModal;
window.toggleAudio      = toggleAudio;
window.onAudioEnd       = onAudioEnd;
window.onAudioTime      = onAudioTime;
window.onAudioMeta      = onAudioMeta;
window.toggleRecording  = toggleRecording;
window.clearWriting     = clearWriting;
window.saveWriting      = saveWriting;
window.switchPronTab    = switchPronTab;
window.filterPhonemeType = filterPhonemeType;
window.filterPhonemes   = filterPhonemes;
window.openPhonemeModal = openPhonemeModal;
window.showToast        = showToast;
