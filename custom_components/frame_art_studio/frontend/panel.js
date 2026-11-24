/**
 * Home Assistant custom sidebar panel for Frame Art Studio.
 * Mounts the editor in a full-bleed iframe while forwarding Home Assistant's
 * live CSS theme tokens (Dark, Light & custom themes), narrow/sidebar state,
 * and authenticated hass.fetchWithAuth calls.
 */
const HA_THEME_PROPS = [
  '--primary-background-color',
  '--secondary-background-color',
  '--card-background-color',
  '--ha-card-background',
  '--app-header-background-color',
  '--app-header-text-color',
  '--primary-text-color',
  '--secondary-text-color',
  '--disabled-text-color',
  '--primary-color',
  '--dark-primary-color',
  '--light-primary-color',
  '--accent-color',
  '--text-primary-color',
  '--divider-color',
  '--outline-color',
  '--ha-card-border-color',
  '--ha-card-border-radius',
  '--ha-card-border-width',
  '--ha-card-box-shadow',
  '--mdc-theme-primary',
  '--mdc-theme-surface',
  '--error-color',
  '--warning-color',
  '--success-color',
  '--info-color',
  '--input-fill-color',
  '--input-ink-color',
  '--input-label-ink-color',
  '--input-outlined-idle-border-color',
  '--switch-checked-button-color',
  '--switch-checked-track-color',
  '--switch-unchecked-button-color',
  '--switch-unchecked-track-color',
  '--ha-font-family-body',
  '--paper-font-body1_-_font-family',
  '--header-height',
  '--scrollbar-thumb-color',
  '--rgb-primary-color',
  '--rgb-card-background-color',
  '--rgb-primary-text-color'
];

function isColorDark(cssColor) {
  const match = String(cssColor || '').match(/rgba?\(\s*(\d+)[,\s]+(\d+)[,\s]+(\d+)/i);
  if (!match) return null;
  const lum = 0.2126 * Number(match[1]) + 0.7152 * Number(match[2]) + 0.0722 * Number(match[3]);
  return lum < 128;
}

class FrameArtStudioPanel extends HTMLElement {
  constructor() {
    super();
    this._hass = null;
    this._narrow = false;
    this._iframe = null;
    this._lastThemeKey = null;
    this._themeObserver = null;
    this._colorSchemeMql = null;
    this._onColorSchemeChange = () => this._syncTheme(true);
    this.attachShadow({ mode: 'open' });
  }

  set hass(hass) {
    this._hass = hass;
    const themeKey = `${hass?.themes?.theme || ''}:${hass?.themes?.darkMode}`;
    const themeChanged = themeKey !== this._lastThemeKey;
    this._lastThemeKey = themeKey;
    this._attachBridge();
    if (themeChanged) {
      this._syncTheme(true);
    }
  }

  set narrow(value) {
    this._narrow = Boolean(value);
    this._syncNarrow();
  }

  connectedCallback() {
    if (!this._iframe) {
      const style = document.createElement('style');
      style.textContent = `
        :host {
          display: flex;
          flex-direction: column;
          width: 100%;
          height: 100vh;
          height: 100dvh;
          min-height: 100%;
          background: var(--primary-background-color, #111111);
          overflow: hidden;
        }
        iframe {
          flex: 1 1 0%;
          width: 100%;
          height: 100%;
          min-height: 0;
          border: 0;
          display: block;
          background: var(--primary-background-color, #111111);
        }
      `;

      const initialDark = this._detectDarkMode();
      const iframe = document.createElement('iframe');
      iframe.title = 'Frame Art Studio';
      iframe.src = `/frame_art_studio_static/index.html?ha=1&v=1.1.0&theme=${initialDark ? 'dark' : 'light'}`;
      iframe.addEventListener('load', () => {
        this._attachBridge();
        this._syncTheme(true);
        this._syncNarrow();
      });
      this._iframe = iframe;

      this.shadowRoot.append(style, iframe);
    }

    if (!this._themeObserver && typeof MutationObserver !== 'undefined') {
      this._themeObserver = new MutationObserver(() => this._syncTheme(true));
      this._themeObserver.observe(document.documentElement, {
        attributes: true,
        attributeFilter: ['style', 'class']
      });
    }

    if (!this._colorSchemeMql && window.matchMedia) {
      this._colorSchemeMql = window.matchMedia('(prefers-color-scheme: dark)');
      this._colorSchemeMql.addEventListener?.('change', this._onColorSchemeChange);
    }
  }

  disconnectedCallback() {
    if (this._themeObserver) {
      this._themeObserver.disconnect();
      this._themeObserver = null;
    }
    if (this._colorSchemeMql) {
      this._colorSchemeMql.removeEventListener?.('change', this._onColorSchemeChange);
      this._colorSchemeMql = null;
    }
  }

  _detectDarkMode() {
    if (typeof this._hass?.themes?.darkMode === 'boolean') {
      return this._hass.themes.darkMode;
    }
    const bg = getComputedStyle(this).backgroundColor;
    const dark = isColorDark(bg);
    if (dark !== null) return dark;
    return window.matchMedia ? window.matchMedia('(prefers-color-scheme: dark)').matches : true;
  }

  _attachBridge() {
    if (!this._iframe) return;
    try {
      const win = this._iframe.contentWindow;
      if (!win) return;
      win.__HA_FRAME_BRIDGE__ = {
        fetchWithAuth: (url, init) => {
          if (!this._hass) throw new Error('Home Assistant sessie nog niet gereed.');
          return this._hass.fetchWithAuth(url, init);
        },
        toggleMenu: () => {
          this.dispatchEvent(new CustomEvent('hass-toggle-menu', { bubbles: true, composed: true }));
        },
        narrow: this._narrow,
        darkMode: this._detectDarkMode()
      };
      if (this._hass) {
        win.dispatchEvent(new CustomEvent('ha-frame-bridge-ready'));
      }
    } catch {
      // Ignore while iframe is still initializing
    }
  }

  _syncNarrow() {
    if (!this._iframe) return;
    try {
      const win = this._iframe.contentWindow;
      const doc = this._iframe.contentDocument;
      if (!win || !doc?.documentElement) return;
      doc.documentElement.dataset.haNarrow = this._narrow ? 'true' : 'false';
      if (win.__HA_FRAME_BRIDGE__) {
        win.__HA_FRAME_BRIDGE__.narrow = this._narrow;
      }
      win.dispatchEvent(new CustomEvent('ha-frame-narrow-change', { detail: { narrow: this._narrow } }));
    } catch {
      // Ignore while iframe is still initializing
    }
  }

  _syncTheme(force = false) {
    if (!this._iframe) return;
    try {
      const win = this._iframe.contentWindow;
      const doc = this._iframe.contentDocument;
      if (!win || !doc?.documentElement) return;

      const computed = getComputedStyle(this);
      const targetStyle = doc.documentElement.style;
      for (const prop of HA_THEME_PROPS) {
        const value = computed.getPropertyValue(prop).trim();
        if (value) {
          targetStyle.setProperty(prop, value);
        } else if (force) {
          targetStyle.removeProperty(prop);
        }
      }

      const darkMode = this._detectDarkMode();
      doc.documentElement.dataset.haTheme = darkMode ? 'dark' : 'light';
      targetStyle.colorScheme = darkMode ? 'dark' : 'light';
      if (win.__HA_FRAME_BRIDGE__) {
        win.__HA_FRAME_BRIDGE__.darkMode = darkMode;
      }
    } catch {
      // Ignore while iframe is still initializing
    }
  }
}

if (!customElements.get('frame-art-studio-panel')) {
  customElements.define('frame-art-studio-panel', FrameArtStudioPanel);
}
