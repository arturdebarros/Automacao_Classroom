/**
 * storage.js — API Data Layer
 * English Mastery Platform
 */

const CACHE_KEY = 'em_api_cache_v1';
const API_BASE_URL = 'http://localhost:8080/api';

const Storage = {

  // ── Sync with API ──────────────────────────────────────────
  async syncCache() {
    const token = Auth.getToken();
    if (!token) return;

    try {
      const res = await fetch(`${API_BASE_URL}/activities/`, {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      if (res.ok) {
        const activities = await res.json();
        
        // Split activities into custom ones vs curriculum overrides
        const customActs = activities.filter(a => !a.week_num);
        const overrides = activities.filter(a => a.week_num);
        
        const overridesMap = {};
        overrides.forEach(a => {
          overridesMap[`w${a.week_num}_s${a.slot_num}`] = a;
        });

        localStorage.setItem(CACHE_KEY, JSON.stringify({
          customActivities: customActs,
          overrides: overridesMap
        }));
      }
    } catch (e) {
      console.error("Failed to sync cache", e);
    }
  },

  _getCache() {
    try {
      const raw = localStorage.getItem(CACHE_KEY);
      return raw ? JSON.parse(raw) : { customActivities: [], overrides: {} };
    } catch {
      return { customActivities: [], overrides: {} };
    }
  },

  // ── Custom Activities ──────────────────────────────────────

  getActivities(area = null, publishedOnly = true) {
    const cache = this._getCache();
    let acts = cache.customActivities || [];

    if (publishedOnly) {
      acts = acts.filter(a => a.published);
    }
    if (area) {
      acts = acts.filter(a => a.area === area);
    }
    // Newest first
    return acts.sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
  },

  getAllActivities(area = null) {
    return this.getActivities(area, false);
  },

  getActivity(id) {
    const cache = this._getCache();
    return (cache.customActivities || []).find(a => a.id === id) || null;
  },

  async addActivity(activity) {
    const token = Auth.getToken();
    const res = await fetch(`${API_BASE_URL}/activities/`, {
      method: 'POST',
      headers: { 
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`
      },
      body: JSON.stringify({
        ...activity,
        type: activity.type || 'text',
        area: activity.area || 'grammar',
        published: activity.published !== undefined ? activity.published : false
      })
    });
    
    if (res.ok) {
      await this.syncCache();
      return await res.json();
    }
    throw new Error('Failed to add activity');
  },

  async updateActivity(id, updates) {
    const token = Auth.getToken();
    const res = await fetch(`${API_BASE_URL}/activities/${id}`, {
      method: 'PUT',
      headers: { 
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`
      },
      body: JSON.stringify(updates)
    });
    
    if (res.ok) {
      await this.syncCache();
      return await res.json();
    }
    return false;
  },

  async deleteActivity(id) {
    // API not implemented yet, just simulating for now
    const cache = this._getCache();
    cache.customActivities = cache.customActivities.filter(a => a.id !== id);
    localStorage.setItem(CACHE_KEY, JSON.stringify(cache));
    return true; 
  },

  async togglePublish(id) {
    const act = this.getActivity(id);
    if (!act) return null;
    return this.updateActivity(id, { ...act, published: !act.published });
  },

  // ── Stats ──────────────────────────────────────────────────
  getStats() {
    const areas = ['grammar', 'listening', 'speaking', 'writing', 'reading', 'pronunciation'];
    const all = this._getCache().customActivities || [];

    return areas.reduce((acc, area) => {
      acc[area] = {
        total:     all.filter(a => a.area === area).length,
        published: all.filter(a => a.area === area && a.published).length,
      };
      return acc;
    }, {});
  },

  getTotalPublished() {
    return (this._getCache().customActivities || []).filter(a => a.published).length;
  },

  // ── Curriculum Overrides ──────────────────────────────────
  getCurriculumOverrides() {
    return this._getCache().overrides || {};
  },

  async saveCurriculumOverride(weekNum, slot, activityData) {
    const token = Auth.getToken();
    // Fetch if exists
    const existing = this.getCurriculumOverrides()[`w${weekNum}_s${slot}`];
    
    if (existing && existing.id) {
      return await this.updateActivity(existing.id, {
        ...existing,
        ...activityData
      });
    } else {
      return await this.addActivity({
        ...activityData,
        week_num: weekNum,
        slot_num: slot
      });
    }
  },

  formatDate(dateStr) {
    if (!dateStr) return '';
    try {
      const d = new Date(dateStr);
      if (isNaN(d.getTime())) return '';
      return d.toLocaleDateString('pt-BR', { day: 'numeric', month: 'short', year: 'numeric' });
    } catch {
      return '';
    }
  },
};

window.Storage = Storage;
