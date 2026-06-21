/**
 * auth.js — Platform Authentication
 * English Mastery Platform
 * Storage: sessionStorage (JWT Token)
 */

const SESSION_KEY  = 'em_access_token';
const USER_KEY     = 'em_current_user';
const API_BASE_URL = 'http://localhost:8080/api';

const Auth = {
  // ── Registration ─────────────────────────────────────────────
  async register({ username, displayName, password, classCode }) {
    if (!username || username.length < 3)
      throw new Error('O nome de usuário deve ter ao menos 3 caracteres.');
    if (!password || password.length < 4)
      throw new Error('A senha deve ter ao menos 4 caracteres.');
    if (!displayName || displayName.trim().length < 2)
      throw new Error('Digite seu nome completo.');

    const res = await fetch(`${API_BASE_URL}/auth/register/student`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        username: username.trim().toLowerCase(),
        full_name: displayName.trim(),
        password: password,
        role: 'student',
        class_code: classCode ? classCode.trim().toUpperCase() : null
      })
    });

    if (!res.ok) {
      const data = await res.json();
      throw new Error(data.detail || 'Erro ao registrar usuário.');
    }

    // Auto-login after registration
    return this.login({ username, password });
  },

  // ── Login ─────────────────────────────────────────────────────
  async login({ username, password }) {
    const formData = new URLSearchParams();
    formData.append('username', username.trim().toLowerCase());
    formData.append('password', password);

    const res = await fetch(`${API_BASE_URL}/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: formData
    });

    if (!res.ok) {
      throw new Error('Usuário ou senha incorretos. Tente novamente.');
    }

    const data = await res.json();
    this._setSession(data.access_token);
    
    // Fetch current user details and sync storage
    const user = await this.fetchCurrentUser();
    if (window.Storage && typeof window.Storage.syncCache === 'function') await window.Storage.syncCache();
    return user;
  },

  // ── Session ──────────────────────────────────────────────────
  _setSession(token) {
    sessionStorage.setItem(SESSION_KEY, token);
  },
  
  getToken() {
    return sessionStorage.getItem(SESSION_KEY);
  },

  logout() {
    sessionStorage.removeItem(SESSION_KEY);
    sessionStorage.removeItem(USER_KEY);
    if (!window.location.pathname.endsWith('index.html') && window.location.pathname !== '/') {
      window.location.href = "index.html";
    }
  },

  isLoggedIn() {
    return !!this.getToken();
  },

  async initSession() {
    if (this.isLoggedIn()) {
      const user = await this.fetchCurrentUser();
      return user;
    }
    return null;
  },

  async fetchCurrentUser() {
    const token = this.getToken();
    if (!token) return null;
    
    try {
      const res = await fetch(`${API_BASE_URL}/users/me`, {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      if (!res.ok) {
        this.logout();
        return null;
      }
      const user = await res.json();
      
      if (user.role === 'student') {
        const progRes = await fetch(`${API_BASE_URL}/progress/me`, {
          headers: { 'Authorization': `Bearer ${token}` }
        });
        if (progRes.ok) {
          user.progress_data = await progRes.json();
        } else {
          user.progress_data = [];
        }
      }
      
      sessionStorage.setItem(USER_KEY, JSON.stringify(user));
      return user;
    } catch (e) {
      console.error(e);
      return null;
    }
  },

  getCurrentStudent() {
    const userJson = sessionStorage.getItem(USER_KEY);
    if (!userJson) return null;
    const user = JSON.parse(userJson);
    return user.role === 'student' ? user : null;
  },
  
  getCurrentUser() {
    const userJson = sessionStorage.getItem(USER_KEY);
    if (!userJson) return null;
    return JSON.parse(userJson);
  },

  // ── Progress Tracking (API) ─────────────────────────────────────────
  async markComplete(weekNum, slot, skill, responseContent = null) {
    const token = this.getToken();
    if (!token) return null;
    
    const res = await fetch(`${API_BASE_URL}/progress/`, {
      method: 'POST',
      headers: { 
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`
      },
      body: JSON.stringify({
        week_num: weekNum,
        slot_num: slot,
        skill_area: skill || 'grammar',
        student_response: responseContent
      })
    });
    
    if (res.ok) {
      const updatedUser = await this.fetchCurrentUser();
      return updatedUser;
    }
    return null;
  },

  isActivityComplete(student, weekNum, slot) {
    const progress = student?.progress_data || [];
    return progress.some(p => p.week_num === weekNum && p.slot_num === slot);
  },

  getWeekCompletionCount(student, weekNum) {
    const progress = student?.progress_data || [];
    return progress.filter(p => p.week_num === weekNum).length;
  },

  getSkillMastery(student, skill, totalForSkill) {
    if (!totalForSkill) return 0;
    const progress = student?.progress_data || [];
    const completed = progress.filter(p => p.skill_area === skill).length;
    return Math.min(100, Math.round((completed / totalForSkill) * 100));
  },

  getSkillMasteries(student, curriculum) {
    const counts = { grammar:0, listening:0, speaking:0, writing:0, reading:0, pronunciation:0 };
    (curriculum || []).forEach(week => {
      (week.activities || []).forEach(act => {
        if (counts[act.skill] !== undefined) counts[act.skill]++;
      });
    });
    
    const progress = student?.progress_data || [];
    
    const result = {};
    Object.keys(counts).forEach(skill => {
      const completed = progress.filter(p => p.skill_area === skill).length;
      const total = counts[skill];
      result[skill] = total ? Math.min(100, Math.round((completed / total) * 100)) : 0;
    });
    return result;
  },
};

window.Auth = Auth;
