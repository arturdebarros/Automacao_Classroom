/**
 * dashboard.js — Student Dashboard Logic
 * English Mastery Platform
 * PT-BR UI, English content
 */

/* ── Constants ──────────────────────────────────────────────── */
const SKILL_META = {
  grammar:       { label:'Grammar',       labelPT:'Grammar',       icon:'📖', color:'#818CF8', bg:'rgba(129,140,248,0.12)', border:'rgba(129,140,248,0.25)' },
  listening:     { label:'Listening',     labelPT:'Listening',     icon:'🎧', color:'#2DD4BF', bg:'rgba(45,212,191,0.12)',  border:'rgba(45,212,191,0.25)'  },
  speaking:      { label:'Speaking',      labelPT:'Speaking',      icon:'🗣️', color:'#FBBF24', bg:'rgba(251,191,36,0.12)',  border:'rgba(251,191,36,0.25)'  },
  writing:       { label:'Writing',       labelPT:'Writing',       icon:'✍️', color:'#FB7185', bg:'rgba(251,113,133,0.12)', border:'rgba(251,113,133,0.25)' },
  reading:       { label:'Reading',       labelPT:'Reading',       icon:'👁️', color:'#38BDF8', bg:'rgba(56,189,248,0.12)',  border:'rgba(56,189,248,0.25)'  },
  pronunciation: { label:'Pronunciation', labelPT:'Pronunciation', icon:'🔊', color:'#C084FC', bg:'rgba(192,132,252,0.12)', border:'rgba(192,132,252,0.25)' },
};

const LEVEL_COLORS = {
  'Beginner':         { badge:'bg-emerald-500/15 text-emerald-400 border-emerald-500/25', dot:'bg-emerald-400' },
  'Elementary':       { badge:'bg-blue-500/15 text-blue-400 border-blue-500/25',          dot:'bg-blue-400'    },
  'Pre-Intermediate': { badge:'bg-violet-500/15 text-violet-400 border-violet-500/25',    dot:'bg-violet-400'  },
  'Intermediate':     { badge:'bg-amber-500/15 text-amber-400 border-amber-500/25',       dot:'bg-amber-400'   },
  'Advanced':         { badge:'bg-rose-500/15 text-rose-400 border-rose-500/25',          dot:'bg-rose-400'    },
};

/* ── Heatmap ─────────────────────────────────────────────────── */

/**
 * Renders a 52-week × 7-day study heatmap.
 * studyLog = { 'YYYY-MM-DD': count }
 * joinedAt = ISO date string of when student started
 */
function renderHeatmap(containerId, student) {
  const container = document.getElementById(containerId);
  if (!container) return;

  const studyLog   = student?.progress?.studyLog || {};
  const joinedAt   = new Date(student?.joinedAt || Date.now());
  const today      = new Date();

  // Build 52 weeks grid
  // Start from Monday of the week the student joined
  const start = new Date(joinedAt);
  start.setHours(0,0,0,0);
  const dayOfWeek = start.getDay(); // 0=Sun
  start.setDate(start.getDate() - ((dayOfWeek + 6) % 7)); // rewind to Monday

  const weeks = [];
  let cursor = new Date(start);
  for (let w = 0; w < 52; w++) {
    const days = [];
    for (let d = 0; d < 7; d++) {
      const iso = cursor.toISOString().split('T')[0];
      const count = studyLog[iso] || 0;
      const isFuture = cursor > today;
      const isToday  = iso === today.toISOString().split('T')[0];
      days.push({ iso, count, isFuture, isToday });
      cursor.setDate(cursor.getDate() + 1);
    }
    weeks.push(days);
  }

  // Intensity levels (count → Tailwind class or inline color)
  function intensityColor(count, isFuture) {
    if (isFuture) return '#1C1C1F';
    if (count === 0) return '#27272A';
    if (count === 1) return '#1E3A5F';
    if (count === 2) return '#1D4ED8';
    if (count <= 4)  return '#2563EB';
    return '#3B82F6';
  }

  // Day labels
  const dayNames = ['Seg','Ter','Qua','Qui','Sex','Sáb','Dom'];

  let html = `<div style="display:flex; gap:0;">`;

  // Day label column
  html += `<div style="display:flex; flex-direction:column; gap:2px; margin-right:6px; padding-top:18px;">`;
  dayNames.forEach((d, i) => {
    const show = i % 2 === 0;
    html += `<div style="height:11px; line-height:11px; font-size:9px; color:#71717A; text-align:right;">${show ? d : ''}</div>`;
  });
  html += `</div>`;

  // Week columns
  html += `<div style="display:flex; flex-direction:column; gap:0;">`;
  // Month labels row
  html += `<div style="display:flex; gap:2px; margin-bottom:4px; height:14px;">`;
  let prevMonth = null;
  weeks.forEach((days) => {
    const m = new Date(days[0].iso).toLocaleString('pt-BR', { month: 'short' });
    const show = m !== prevMonth;
    html += `<div style="width:11px; font-size:9px; color:#71717A; overflow:visible; white-space:nowrap;">${show ? m : ''}</div>`;
    if (show) prevMonth = m;
  });
  html += `</div>`;

  // Grid
  html += `<div style="display:flex; gap:2px;">`;
  weeks.forEach((days) => {
    html += `<div style="display:flex; flex-direction:column; gap:2px;">`;
    days.forEach(({ iso, count, isFuture, isToday }) => {
      const bg    = intensityColor(count, isFuture);
      const title = `${iso}: ${count} atividade${count !== 1 ? 's' : ''} completada${count !== 1 ? 's' : ''}`;
      const todayBorder = isToday ? 'outline:1.5px solid #3B82F6; outline-offset:1px;' : '';
      html += `<div title="${title}"
        style="width:11px; height:11px; border-radius:2px; background:${bg}; cursor:pointer; transition:background 0.15s; ${todayBorder}"
        onmouseover="this.style.opacity='0.7'"
        onmouseout="this.style.opacity='1'">
      </div>`;
    });
    html += `</div>`;
  });
  html += `</div></div>`; // close grid + week col container

  html += `</div>`; // close outer flex

  container.innerHTML = html;
}

/* ── Circular Progress Ring (SVG) ────────────────────────────── */

function renderProgressRings(containerId, student) {
  const container = document.getElementById(containerId);
  if (!container) return;

  const masteries = Auth.getSkillMasteries(student, CURRICULUM);
  const skills    = Object.keys(SKILL_META);

  container.innerHTML = skills.map(skill => {
    const m    = SKILL_META[skill];
    const pct  = masteries[skill] || 0;
    const r    = 28;
    const circ = 2 * Math.PI * r; // ~175.9
    const dash = (pct / 100) * circ;
    const gap  = circ - dash;

    return `
      <div class="flex flex-col items-center gap-2" title="${m.label}: ${pct}% dominado">
        <div class="relative w-16 h-16">
          <svg viewBox="0 0 64 64" class="w-full h-full -rotate-90">
            <circle cx="32" cy="32" r="${r}" fill="none" stroke="#27272A" stroke-width="5"/>
            <circle cx="32" cy="32" r="${r}" fill="none"
              stroke="${m.color}" stroke-width="5"
              stroke-linecap="round"
              stroke-dasharray="${dash.toFixed(1)} ${gap.toFixed(1)}"
              style="transition: stroke-dasharray 1s ease-out;"
            />
          </svg>
          <div class="absolute inset-0 flex items-center justify-center">
            <span class="text-xs font-bold text-zinc-200">${pct}%</span>
          </div>
        </div>
        <div class="text-center">
          <div class="text-lg leading-none">${m.icon}</div>
          <div class="text-xs text-zinc-400 mt-0.5 font-medium">${m.label}</div>
        </div>
      </div>`;
  }).join('');

  // Animate rings after render
  setTimeout(() => {
    container.querySelectorAll('circle:last-child').forEach(circle => {
      const current = circle.getAttribute('stroke-dasharray');
      circle.style.strokeDasharray = '0 1000';
      setTimeout(() => {
        circle.style.strokeDasharray = current;
      }, 50);
    });
  }, 100);
}

/* ── Today's Tasks ───────────────────────────────────────────── */

function renderTodaysTasks(containerId, student) {
  const container = document.getElementById(containerId);
  if (!container) return;

  const weekNum = student?.currentWeek || 1;
  const weekData = getCurriculumWeek(weekNum);

  if (!weekData) {
    container.innerHTML = `
      <div class="text-center py-8">
        <div class="text-3xl mb-2">🎉</div>
        <div class="text-zinc-300 font-semibold">Programa Concluído!</div>
        <div class="text-zinc-500 text-sm mt-1">Você completou todas as 52 semanas. Parabéns!</div>
      </div>`;
    return;
  }

  const activities = weekData.activities || [];
  const levelMeta  = LEVEL_COLORS[weekData.level] || LEVEL_COLORS['Beginner'];

  container.innerHTML = activities.map(act => {
    const m        = SKILL_META[act.skill] || SKILL_META.grammar;
    const done     = Auth.isActivityComplete(student, weekNum, act.slot);
    const doneClass = done ? 'opacity-60' : '';

    return `
      <button
        class="w-full text-left flex items-center gap-4 p-4 rounded-xl border transition-all duration-200 group
          ${done
            ? 'bg-zinc-900/60 border-zinc-800 cursor-default'
            : 'bg-zinc-900 border-zinc-800 hover:border-zinc-600 hover:bg-zinc-800/70 cursor-pointer active:scale-[0.99]'
          }"
        onclick="openActivity(${weekNum}, ${act.slot})"
        data-week="${weekNum}"
        data-slot="${act.slot}"
        aria-label="${done ? 'Concluído: ' : 'Iniciar: '}${act.title}"
      >
        <!-- Skill icon -->
        <div class="flex-shrink-0 w-10 h-10 rounded-lg flex items-center justify-center text-lg"
          style="background:${m.bg}; border:1px solid ${m.border}">
          ${m.icon}
        </div>

        <!-- Content -->
        <div class="flex-1 min-w-0 ${doneClass}">
          <div class="flex items-center gap-2 mb-0.5">
            <span class="text-xs font-semibold" style="color:${m.color}">${m.label}</span>
            <span class="text-xs text-zinc-600">·</span>
            <span class="text-xs text-zinc-500">${act.estimatedMin} min</span>
          </div>
          <div class="text-sm font-semibold text-zinc-100 truncate">${act.title}</div>
        </div>

        <!-- Status -->
        <div class="flex-shrink-0">
          ${done
            ? `<div class="w-7 h-7 rounded-full bg-emerald-500/15 border border-emerald-500/30 flex items-center justify-center">
                 <svg class="w-3.5 h-3.5 text-emerald-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="3">
                   <path stroke-linecap="round" stroke-linejoin="round" d="M5 13l4 4L19 7"/>
                 </svg>
               </div>`
            : `<div class="w-7 h-7 rounded-full border-2 border-zinc-700 group-hover:border-blue-500 transition-colors"></div>`
          }
        </div>
      </button>`;
  }).join('');
}

/* ── Week Progress Bar ───────────────────────────────────────── */

function updateWeekProgress(student) {
  const weekNum = student?.currentWeek || 1;
  const done    = Auth.getWeekCompletionCount(student, weekNum);
  const pct     = Math.round((done / 5) * 100);

  const el  = document.getElementById('week-progress-bar');
  const txt = document.getElementById('week-progress-text');
  const pill = document.getElementById('week-pill');

  if (el)   el.style.width = `${pct}%`;
  if (txt)  txt.textContent = `${done}/5 atividades`;
  if (pill) pill.textContent = `Semana ${weekNum} / 52`;
}

/* ── Streak Display ──────────────────────────────────────────── */

function updateStreak(student) {
  const streak  = student?.progress?.streak || { current: 0, longest: 0 };
  const today   = new Date().toISOString().split('T')[0];
  const studied = (student?.progress?.studyLog || {})[today] > 0;

  const el      = document.getElementById('streak-count');
  const longest = document.getElementById('streak-longest');
  const msg     = document.getElementById('streak-message');

  if (el)      el.textContent = streak.current;
  if (longest) longest.textContent = `Recorde: ${streak.longest} dias`;
  if (msg) {
    msg.textContent = studied
      ? '✅ Você já estudou hoje. Continue assim!'
      : '⚡ Estude hoje para manter sua sequência!';
  }
}

/* ── Sidebar Active State ────────────────────────────────────── */

function setSidebarActive(section) {
  document.querySelectorAll('[data-nav]').forEach(el => {
    el.classList.remove('bg-blue-600/10', 'text-blue-400', 'border', 'border-blue-600/20');
    el.classList.add('text-zinc-400', 'hover:bg-zinc-800', 'hover:text-zinc-100');
  });
  const active = document.querySelector(`[data-nav="${section}"]`);
  if (active) {
    active.classList.add('bg-blue-600/10', 'text-blue-400', 'border', 'border-blue-600/20');
    active.classList.remove('text-zinc-400', 'hover:bg-zinc-800', 'hover:text-zinc-100');
  }
}

/* ── Open Activity Modal ─────────────────────────────────────── */

function openActivity(weekNum, slot) {
  const student = Auth.getCurrentStudent();
  if (!student) return;

  const weekData = getCurriculumWeek(weekNum);
  if (!weekData) return;

  const act = weekData.activities.find(a => a.slot === slot);
  if (!act) return;

  const done = Auth.isActivityComplete(student, weekNum, slot);
  const m    = SKILL_META[act.skill] || SKILL_META.grammar;

  const modal  = document.getElementById('activity-modal');
  const overlay = document.getElementById('overlay-activity-modal');
  if (!modal || !overlay) return;

  // Populate modal
  document.getElementById('modal-skill-icon').textContent  = m.icon;
  document.getElementById('modal-skill-label').textContent = m.label;
  document.getElementById('modal-skill-label').style.color = m.color;
  document.getElementById('modal-activity-title').textContent = act.title;
  document.getElementById('modal-activity-week').textContent  = `Semana ${weekNum} · Atividade ${slot}/5`;
  document.getElementById('modal-activity-time').textContent  = `${act.estimatedMin} min`;
  document.getElementById('modal-activity-content').innerHTML = renderMarkdown(act.content || '');

  const completeBtn = document.getElementById('modal-complete-btn');
  if (completeBtn) {
    if (done) {
      completeBtn.textContent = '✅ Concluída';
      completeBtn.disabled = true;
      completeBtn.classList.add('opacity-50', 'cursor-not-allowed');
    } else {
      completeBtn.textContent = '✓ Marcar como Concluída';
      completeBtn.disabled = false;
      completeBtn.classList.remove('opacity-50', 'cursor-not-allowed');
      completeBtn.onclick = () => markDone(weekNum, slot, act.skill);
    }
  }

  // Show speaking recorder or writing box?
  const speakSection  = document.getElementById('modal-speak-section');
  const writeSection  = document.getElementById('modal-write-section');
  if (speakSection) speakSection.style.display  = act.type === 'speaking_prompt' ? '' : 'none';
  if (writeSection) writeSection.style.display  = (act.type === 'writing_prompt') ? '' : 'none';

  overlay.classList.add('active');
}

async function markDone(weekNum, slot, skill) {
  const student = Auth.getCurrentStudent();
  if (!student) return;

  // Make the button show loading state
  const completeBtn = document.getElementById('modal-complete-btn');
  if (completeBtn) {
    completeBtn.textContent = '⏳ Salvando...';
    completeBtn.disabled = true;
  }

  const updated = await Auth.markComplete(weekNum, slot, skill);
  if (!updated) {
    if (completeBtn) {
      completeBtn.textContent = '✓ Marcar como Concluída';
      completeBtn.disabled = false;
    }
    return;
  }

  // Update UI
  renderTodaysTasks('todays-tasks', updated);
  updateWeekProgress(updated);
  updateStreak(updated);
  renderProgressRings('skill-rings', updated);
  renderHeatmap('heatmap-grid', updated);

  // Show celebration if week complete
  const doneCt = Auth.getWeekCompletionCount(updated, weekNum);
  if (doneCt === 5) {
    showWeekComplete(weekNum);
  }

  // Close modal
  closeActivityModal();
}

function closeActivityModal() {
  const overlay = document.getElementById('overlay-activity-modal');
  if (overlay) overlay.classList.remove('active');
}

function showWeekComplete(weekNum) {
  const el = document.getElementById('week-complete-toast');
  if (!el) return;
  el.textContent = `🎉 Semana ${weekNum} concluída! Avançando para semana ${weekNum + 1}.`;
  el.classList.remove('hidden', 'opacity-0');
  el.classList.add('opacity-100');
  setTimeout(() => {
    el.classList.add('opacity-0');
    setTimeout(() => el.classList.add('hidden'), 600);
  }, 4000);
}

/* ── Markdown-lite renderer ──────────────────────────────────── */

function renderMarkdown(text) {
  if (!text) return '';
  return text
    .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
    .replace(/\*(.+?)\*/g,     '<em>$1</em>')
    .replace(/`(.+?)`/g,       '<code class="bg-zinc-800 text-blue-300 px-1 rounded text-sm">$1</code>')
    .replace(/^• (.+)$/gm,     '<li class="ml-4 list-disc list-outside">$1</li>')
    .replace(/^(\d+)\. (.+)$/gm, '<li class="ml-4 list-decimal list-outside"><span>$2</span></li>')
    .replace(/(<li[^>]*>.*<\/li>\n?)+/g, m => `<ul class="my-2 space-y-1 text-zinc-300">${m}</ul>`)
    .replace(/\n\n/g, '</p><p class="mb-3">')
    .replace(/\n/g, '<br>')
    .replace(/^(.)/,'<p class="mb-3">$1')
    .replace(/(.)$/, '$1</p>');
}

/* ── User Display ────────────────────────────────────────────── */

function updateUserDisplay(student) {
  const displayName = student?.displayName || 'Aluno';
  const initial     = displayName.charAt(0).toUpperCase();

  document.querySelectorAll('[data-user-name]').forEach(el => el.textContent = displayName);
  document.querySelectorAll('[data-user-initial]').forEach(el => el.textContent = initial);
}

/* ── Sidebar navigation ──────────────────────────────────────── */

function showSection(section) {
  const sections = ['section-home','section-program','section-progress'];
  sections.forEach(id => {
    const el = document.getElementById(id);
    if (el) el.classList.toggle('hidden', id !== `section-${section}`);
  });
  setSidebarActive(section);

  if (section === 'program') renderProgramView();
}

function renderProgramView() {
  const container = document.getElementById('program-grid');
  if (!container) return;

  const student = Auth.getCurrentStudent();

  container.innerHTML = CURRICULUM.map(week => {
    const done     = Auth.getWeekCompletionCount(student, week.week);
    const isCurrent = week.week === (student?.currentWeek || 1);
    const levelMeta = LEVEL_COLORS[week.level] || LEVEL_COLORS['Beginner'];

    return `
      <button onclick="openWeekDetail(${week.week})"
        class="text-left p-4 rounded-xl border transition-all duration-150
          ${isCurrent
            ? 'bg-blue-600/10 border-blue-600/30 hover:border-blue-500'
            : 'bg-zinc-900 border-zinc-800 hover:border-zinc-600 hover:bg-zinc-800/50'
          }"
        aria-label="Semana ${week.week}: ${week.tema}">
        <div class="flex items-start justify-between mb-2">
          <div class="flex items-center gap-2">
            <span class="text-xs font-bold text-zinc-500">S${String(week.week).padStart(2,'0')}</span>
            ${isCurrent ? '<span class="text-xs bg-blue-600 text-white px-2 py-0.5 rounded-full font-semibold">Atual</span>' : ''}
          </div>
          <div class="flex items-center gap-0.5">
            ${[1,2,3,4,5].map(s =>
              `<div class="w-1.5 h-1.5 rounded-full ${Auth.isActivityComplete(student, week.week, s) ? 'bg-blue-500' : 'bg-zinc-700'}"></div>`
            ).join('')}
          </div>
        </div>
        <div class="text-sm font-semibold text-zinc-200 leading-snug line-clamp-2 mb-2">${week.tema}</div>
        <div class="flex items-center justify-between">
          <span class="text-xs px-2 py-0.5 rounded-full border ${levelMeta.badge}">${week.levelPT}</span>
          <span class="text-xs text-zinc-500">${done}/5 feitas</span>
        </div>
      </button>`;
  }).join('');
}

function openWeekDetail(weekNum) {
  const student  = Auth.getCurrentStudent();
  const weekData = getCurriculumWeek(weekNum);
  if (!weekData) return;

  // Jump to today's tasks if it's current week
  if (weekNum === (student?.currentWeek || 1)) {
    showSection('home');
    document.getElementById('section-home')?.scrollIntoView({ behavior:'smooth' });
    return;
  }

  // Otherwise open first incomplete activity
  const firstIncomplete = weekData.activities.find(a => !Auth.isActivityComplete(student, weekNum, a.slot));
  const act = firstIncomplete || weekData.activities[0];
  if (act) openActivity(weekNum, act.slot);
}

/* ── Init ────────────────────────────────────────────────────── */

function initDashboard() {
  const student = Auth.getCurrentStudent();
  if (!student) {
    const user = Auth.getCurrentUser();
    if (user) {
      if (user.role === 'teacher') { window.location.href = 'teacher.html'; return; }
      if (user.role === 'coordinator') { window.location.href = 'coordinator.html'; return; }
    }
    window.location.href = 'index.html';
    return;
  }

  Theme.init();
  updateUserDisplay(student);
  renderTodaysTasks('todays-tasks', student);
  updateWeekProgress(student);
  updateStreak(student);
  renderProgressRings('skill-rings', student);
  renderHeatmap('heatmap-grid', student);

  // Init week theme display
  const weekNum  = student.currentWeek || 1;
  const weekData = getCurriculumWeek(weekNum);
  const themeTxt = document.getElementById('week-theme-text');
  if (themeTxt && weekData) {
    themeTxt.textContent = weekData.tema;
  }

  // Show home section by default
  showSection('home');
}

window.initDashboard   = initDashboard;
window.showSection     = showSection;
window.openActivity    = openActivity;
window.closeActivityModal = closeActivityModal;
window.markDone        = markDone;
window.renderMarkdown  = renderMarkdown;
window.openWeekDetail  = openWeekDetail;
