/**
 * theme.js — Dark / Light Mode Manager
 * English Mastery Platform
 */

const THEME_KEY = 'em_theme';

const Theme = {
  /** Initialize theme from localStorage on page load */
  init() {
    const saved = localStorage.getItem(THEME_KEY) || 'dark';
    this.apply(saved, false);
  },

  /**
   * Apply a theme globally.
   * Sets data-theme attribute (for vanilla CSS custom props)
   * and the 'dark' class (for Tailwind dark: prefix).
   */
  apply(theme, animate = true) {
    const html = document.documentElement;

    if (animate) {
      html.style.transition = 'background-color 0.25s ease, color 0.2s ease, border-color 0.25s ease';
      setTimeout(() => { html.style.transition = ''; }, 350);
    }

    html.setAttribute('data-theme', theme);

    if (theme === 'dark') {
      html.classList.add('dark');
      html.classList.remove('light');
    } else {
      html.classList.remove('dark');
      html.classList.add('light');
    }

    localStorage.setItem(THEME_KEY, theme);
    this._syncUI(theme);
  },

  /** Toggle between dark and light */
  toggle() {
    const current = localStorage.getItem(THEME_KEY) || 'dark';
    this.apply(current === 'dark' ? 'light' : 'dark');
  },

  /** Update all theme-aware UI elements */
  _syncUI(theme) {
    const isDark = theme === 'dark';

    document.querySelectorAll('[data-theme-icon]').forEach(el => {
      el.textContent = isDark ? '☀️' : '🌙';
    });
    document.querySelectorAll('[data-theme-label]').forEach(el => {
      el.textContent = isDark ? 'Modo Claro' : 'Modo Escuro';
    });
    document.querySelectorAll('[data-theme-toggle]').forEach(btn => {
      btn.setAttribute('title', isDark ? 'Ativar modo claro' : 'Ativar modo escuro');
      btn.setAttribute('aria-label', isDark ? 'Ativar modo claro' : 'Ativar modo escuro');
    });
  },

  get current() {
    return localStorage.getItem(THEME_KEY) || 'dark';
  },

  get isDark() {
    return this.current === 'dark';
  },
};

window.Theme = Theme;
