/**
 * Home Assistant custom sidebar panel for Frame Art Studio.
 * Isolates the editor UI inside a full-bleed iframe while exposing an
 * authenticated hass.fetchWithAuth bridge for all /api/frame_art_studio/* calls.
 */
class FrameArtStudioPanel extends HTMLElement {
  constructor() {
    super();
    this._hass = null;
    this._narrow = false;
    this._iframe = null;
    this._menuBtn = null;
    this.attachShadow({ mode: 'open' });
  }

  set hass(hass) {
    this._hass = hass;
    this._attachBridge();
  }

  set narrow(value) {
    this._narrow = Boolean(value);
    if (this._menuBtn) {
      this._menuBtn.hidden = !this._narrow;
    }
  }

  connectedCallback() {
    if (this._iframe) return;

    const style = document.createElement('style');
    style.textContent = `
      :host {
        display: flex;
        flex-direction: column;
        width: 100%;
        height: 100vh;
        height: 100dvh;
        min-height: 100%;
        background: #181d1b;
        overflow: hidden;
      }
      .ha-mobile-bar {
        display: flex;
        align-items: center;
        gap: 0.75rem;
        padding: calc(0.5rem + env(safe-area-inset-top, 0px)) 0.9rem 0.5rem;
        background: #141917;
        color: #f4efe6;
        border-block-end: 1px solid #47524b;
        font-family: system-ui, -apple-system, sans-serif;
        font-size: 0.95rem;
        flex: 0 0 auto;
      }
      .ha-mobile-bar[hidden] {
        display: none;
      }
      .ha-menu-btn {
        min-inline-size: 2.5rem;
        min-block-size: 2.5rem;
        border: 1px solid #6e7b70;
        border-radius: 0.4rem;
        background: #2d3631;
        color: inherit;
        font-size: 1.15rem;
        cursor: pointer;
      }
      iframe {
        flex: 1 1 0%;
        width: 100%;
        height: 100%;
        min-height: 0;
        border: 0;
        display: block;
        background: #181d1b;
      }
    `;

    const mobileBar = document.createElement('div');
    mobileBar.className = 'ha-mobile-bar';
    mobileBar.hidden = !this._narrow;
    const menuBtn = document.createElement('button');
    menuBtn.type = 'button';
    menuBtn.className = 'ha-menu-btn';
    menuBtn.setAttribute('aria-label', 'Open Home Assistant menu');
    menuBtn.textContent = '☰';
    menuBtn.addEventListener('click', () => {
      this.dispatchEvent(new CustomEvent('hass-toggle-menu', { bubbles: true, composed: true }));
    });
    const title = document.createElement('span');
    title.textContent = 'Frame Art Studio';
    mobileBar.append(menuBtn, title);
    this._menuBtn = mobileBar;

    const iframe = document.createElement('iframe');
    iframe.title = 'Frame Art Studio';
    iframe.src = '/frame_art_studio_static/index.html?ha=1&v=1.0.0-3';
    iframe.addEventListener('load', () => this._attachBridge());
    this._iframe = iframe;

    this.shadowRoot.append(style, mobileBar, iframe);
  }

  _attachBridge() {
    if (!this._hass || !this._iframe) return;
    try {
      const win = this._iframe.contentWindow;
      if (!win) return;
      win.__HA_FRAME_BRIDGE__ = {
        fetchWithAuth: (url, init) => this._hass.fetchWithAuth(url, init)
      };
      win.dispatchEvent(new CustomEvent('ha-frame-bridge-ready'));
    } catch {
      // Ignore while iframe is still initializing
    }
  }
}

if (!customElements.get('frame-art-studio-panel')) {
  customElements.define('frame-art-studio-panel', FrameArtStudioPanel);
}
