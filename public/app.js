// Theme Definitions
const themes = {
  'macos-dark': {
    background: '#1e1e1e', foreground: '#ffffff', cursor: '#ffffff',
    black: '#000000', red: '#ff5555', green: '#50fa7b', yellow: '#f1fa8c',
    blue: '#bd93f9', magenta: '#ff79c6', cyan: '#8be9fd', white: '#bbbbbb'
  },
  'dracula': {
    background: '#282a36', foreground: '#f8f8f2', cursor: '#f8f8f0',
    black: '#21222c', red: '#ff5555', green: '#50fa7b', yellow: '#f1fa8c',
    blue: '#bd93f9', magenta: '#ff79c6', cyan: '#8be9fd', white: '#ffffff'
  },
  'monokai': {
    background: '#272822', foreground: '#f8f8f2', cursor: '#f8f8f0',
    black: '#272822', red: '#f92672', green: '#a6e22e', yellow: '#f4bf75',
    blue: '#66d9ef', magenta: '#ae81ff', cyan: '#a1efe4', white: '#f8f8f2'
  },
  'solarized-dark': {
    background: '#002b36', foreground: '#839496', cursor: '#93a1a1',
    black: '#073642', red: '#dc322f', green: '#859900', yellow: '#b58900',
    blue: '#268bd2', magenta: '#d33682', cyan: '#2aa198', white: '#eee8d5'
  },
  'retro-green': {
    background: '#080f0a', foreground: '#33ff33', cursor: '#33ff33',
    black: '#000000', red: '#ff0000', green: '#33ff33', yellow: '#ffff00',
    blue: '#0000ff', magenta: '#ff00ff', cyan: '#00ffff', white: '#ffffff'
  },
  'retro-amber': {
    background: '#100a00', foreground: '#ffb000', cursor: '#ffb000',
    black: '#000000', red: '#ff0000', green: '#00ff00', yellow: '#ffb000',
    blue: '#0000ff', magenta: '#ff00ff', cyan: '#00ffff', white: '#ffffff'
  }
};

// ─── Global State ────────────────────────────────────────────────────────────
const sessions = {};
let activeTabId = null;
let tabCounter = 0;
let currentProfileId = null;
let autoRunOnEnter = localStorage.getItem('ssh_auto_run') !== 'false';
let commandHistory = [];

// ─── DOM References ───────────────────────────────────────────────────────────
const connectionForm    = document.getElementById('connection-form');
const hostInput         = document.getElementById('ssh-host');
const usernameInput     = document.getElementById('ssh-username');
const portInput         = document.getElementById('ssh-port');
const passwordInput     = document.getElementById('ssh-password');
const togglePasswordBtn = document.getElementById('toggle-password');
const connectBtn        = document.getElementById('btn-connect');
const saveProfileBtn    = document.getElementById('btn-save-profile');
const profilesList      = document.getElementById('profiles-list');

const statusDot         = document.getElementById('connection-status-dot');
const statusText        = document.getElementById('connection-status-text');

const terminalContainer = document.getElementById('terminal-container');
const terminalOverlay   = document.getElementById('terminal-overlay');
const overlayMessage    = document.getElementById('overlay-message');
const themeSelect       = document.getElementById('terminal-theme');
const toggleSidebarBtn  = document.getElementById('btn-toggle-sidebar');
const clearTerminalBtn  = document.getElementById('btn-clear-terminal');
const disconnectBtn     = document.getElementById('btn-disconnect');
const macCloseBtn       = document.getElementById('mac-close-btn');
const windowTitle       = document.getElementById('terminal-window-title');
const macbookWindow     = document.querySelector('.macbook-window');
const appContainer      = document.querySelector('.app-container');
const tabBar            = document.getElementById('tab-bar');
const btnNewTab         = document.getElementById('btn-new-tab');
const btnCopyOutput     = document.getElementById('btn-copy-output');

const thaiCommandInput  = document.getElementById('thai-command-input');
const sendCommandBtn    = document.getElementById('btn-send-command');
const autoRunToggle     = document.getElementById('auto-run-toggle');

// ─── DOMContentLoaded ────────────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', () => {
  lucide.createIcons();
  
  // Load saved theme or default to Dracula
  const savedTheme = localStorage.getItem('ssh_theme') || 'dracula';
  themeSelect.value = savedTheme;
  applyThemeStyles(savedTheme);

  if (toggleSidebarBtn) toggleSidebarBtn.addEventListener('click', toggleSidebar);

  loadProfiles();

  const lastProfile = localStorage.getItem('ssh_last_profile');
  if (lastProfile) {
    try {
      const d = JSON.parse(lastProfile);
      hostInput.value    = d.host     || '';
      usernameInput.value = d.username || '';
      portInput.value    = d.port     || '22';
    } catch (e) { /* ignore */ }
  }

  const savedHistory = localStorage.getItem('ssh_command_history');
  if (savedHistory) {
    try { commandHistory = JSON.parse(savedHistory); } catch (e) { /* ignore */ }
  }

  autoRunToggle.checked = autoRunOnEnter;
  autoRunToggle.addEventListener('change', () => {
    autoRunOnEnter = autoRunToggle.checked;
    localStorage.setItem('ssh_auto_run', autoRunOnEnter ? 'true' : 'false');
  });

  // Load saved mascot or default to dino
  const savedMascot = localStorage.getItem('ssh_mascot') || 'dino';
  const mascotSelect = document.getElementById('mascot-select');
  if (mascotSelect) {
    mascotSelect.value = savedMascot;
    mascotSelect.addEventListener('change', (e) => {
      const selected = e.target.value;
      localStorage.setItem('ssh_mascot', selected);
      updateMascotSVG(selected);
    });
  }
  updateMascotSVG(savedMascot);

  createTab();

  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('service-worker.js')
      .then(reg => console.log('SW registered:', reg.scope))
      .catch(err => console.error('SW failed:', err));
  }
});

// ─── Tab Management ───────────────────────────────────────────────────────────
function createTab() {
  tabCounter++;
  const tabId = `tab_${tabCounter}`;

  // Create terminal DOM element
  const termEl = document.createElement('div');
  termEl.className = 'terminal-instance';
  termEl.style.display = 'block';
  terminalContainer.appendChild(termEl);

  // Create xterm instance
  const term = new Terminal({
    cursorBlink: true,
    fontFamily: 'JetBrains Mono, Courier New, monospace',
    fontSize: 14,
    lineHeight: 1.2,
    theme: themes[themeSelect.value],
    allowProposedApi: true
  });

  const fitAddon = new FitAddon.FitAddon();
  term.loadAddon(fitAddon);
  term.open(termEl);
  fitAddon.fit();

  // Prevent xterm from capturing Alt+Spacebar so it can be handled globally
  term.attachCustomKeyEventHandler((e) => {
    if (e.altKey && (e.code === 'Space' || e.key === ' ' || e.keyCode === 32)) {
      return false;
    }
    return true;
  });

  // Forward keystrokes to active SSH session
  term.onData((data) => {
    if (tabId === activeTabId) triggerGimmickActivity();
    const s = sessions[tabId];
    if (s && s.socket && s.socket.readyState === WebSocket.OPEN) {
      s.socket.send(JSON.stringify({ type: 'input', data }));
    }
  });

  // Store session
  sessions[tabId] = {
    id: tabId,
    socket: null,
    term,
    fitAddon,
    termEl,
    status: 'disconnected',
    profile: null,
    reconnectAttempts: 0,
    reconnectTimer: null,
    intentionalDisconnect: false,
    historyIndex: -1
  };

  // Create tab UI button
  const tabEl = document.createElement('div');
  tabEl.className = 'tab';
  tabEl.dataset.tabId = tabId;
  tabEl.innerHTML = `<span class="tab-title">Tab ${tabCounter}</span><button class="tab-close" title="ปิด Tab">✕</button>`;

  tabEl.addEventListener('click', (e) => {
    if (!e.target.classList.contains('tab-close')) switchToTab(tabId);
  });
  tabEl.querySelector('.tab-close').addEventListener('click', (e) => {
    e.stopPropagation();
    closeTab(tabId);
  });

  tabBar.insertBefore(tabEl, btnNewTab);

  term.writeln('\x1b[1;36mยินดีต้อนรับสู่ SSH Terminal Bridge!\x1b[0m');
  term.writeln('กรอกรายละเอียดเซิร์ฟเวอร์ด้านซ้ายแล้วกดปุ่ม \x1b[1;32m"เชื่อมต่อ SSH"\x1b[0m เพื่อเริ่มต้นใช้งาน...');

  switchToTab(tabId);
  return tabId;
}

function switchToTab(tabId) {
  // Hide all terminal instances
  Object.values(sessions).forEach(s => { s.termEl.style.display = 'none'; });

  // Update tab UI
  document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
  document.querySelector(`.tab[data-tab-id="${tabId}"]`)?.classList.add('active');

  const session = sessions[tabId];
  if (!session) return;

  session.termEl.style.display = 'block';
  activeTabId = tabId;

  // Fit and focus after layout paint
  requestAnimationFrame(() => {
    session.fitAddon.fit();
    session.term.focus();
  });

  // Sync UI state
  syncUIToSession(session);
}

function closeTab(tabId) {
  const session = sessions[tabId];
  if (!session) return;

  const tabIds = Object.keys(sessions);
  if (tabIds.length === 1) {
    // Keep at least one tab; just disconnect
    if (session.status === 'connected' || session.status === 'reconnecting') {
      doDisconnect(tabId, true);
    }
    return;
  }

  session.intentionalDisconnect = true;
  if (session.reconnectTimer) clearTimeout(session.reconnectTimer);
  if (session.socket) session.socket.close();

  session.term.dispose();
  session.termEl.remove();
  document.querySelector(`.tab[data-tab-id="${tabId}"]`)?.remove();
  delete sessions[tabId];

  if (activeTabId === tabId) {
    const remaining = Object.keys(sessions);
    switchToTab(remaining[remaining.length - 1]);
  }
}

function updateTabTitle(tabId, title) {
  const el = document.querySelector(`.tab[data-tab-id="${tabId}"] .tab-title`);
  if (el) el.textContent = title;
}

function syncUIToSession(session) {
  if (session.status === 'connected' && session.profile) {
    const { host, username, port } = session.profile;
    setConnectionStatus('connected', `เชื่อมต่อแล้ว: ${username}@${host}`);
    windowTitle.textContent = `SSH Terminal - ${username}@${host}:${port}`;
    enableCommandBar(true);
    hideOverlay();
  } else if (session.status === 'connecting' || session.status === 'reconnecting') {
    setConnectionStatus('connecting', session.status === 'reconnecting' ? 'กำลัง reconnect...' : 'กำลังเชื่อมต่อ...');
    enableCommandBar(false);
    showOverlay('กำลังเชื่อมต่อ...');
  } else {
    setConnectionStatus('disconnected', 'ไม่ได้เชื่อมต่อ');
    windowTitle.textContent = 'SSH Terminal (ยังไม่ได้เชื่อมต่อ)';
    enableCommandBar(false);
    hideOverlay();
  }
}

// ─── SSH Connection ───────────────────────────────────────────────────────────
function connectSSH(tabId) {
  const targetId = tabId || activeTabId;
  const session = sessions[targetId];
  if (!session) return;

  if (session.socket) doDisconnect(targetId, true);

  const host     = hostInput.value.trim();
  const username = usernameInput.value.trim();
  const port     = parseInt(portInput.value) || 22;
  const password = passwordInput.value;

  if (!host || !username || !password) {
    alert('กรุณากรอกข้อมูลให้ครบถ้วน');
    return;
  }

  session.profile = { host, username, port, password };
  session.reconnectAttempts = 0;
  session.intentionalDisconnect = false;

  doConnect(targetId);
}

function doConnect(tabId) {
  const session = sessions[tabId];
  if (!session || !session.profile) return;

  const { host, username, port, password } = session.profile;
  const isReconnect = session.reconnectAttempts > 0;

  session.status = isReconnect ? 'reconnecting' : 'connecting';

  if (tabId === activeTabId) {
    const msg = isReconnect
      ? `กำลัง reconnect ครั้งที่ ${session.reconnectAttempts}/5...`
      : 'กำลังเริ่มการเชื่อมต่อกับเซิร์ฟเวอร์...';
    setConnectionStatus('connecting', isReconnect ? `Reconnecting ${session.reconnectAttempts}/5...` : 'กำลังเชื่อมต่อ...');
    showOverlay(msg);
  }

  localStorage.setItem('ssh_last_profile', JSON.stringify({ host, username, port }));

  const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
  const ws = new WebSocket(`${protocol}//${window.location.host}`);
  session.socket = ws;

  ws.onopen = () => {
    ws.send(JSON.stringify({
      type: 'connect', host, port, username, password,
      cols: session.term.cols, rows: session.term.rows
    }));
  };

  ws.onmessage = (event) => {
    try {
      const msg = JSON.parse(event.data);

      if (msg.type === 'status') {
        if (tabId === activeTabId) updateOverlayStatus(msg.message);

        if (msg.level === 'success') {
          session.status = 'connected';
          session.reconnectAttempts = 0;
          updateTabTitle(tabId, `${username}@${host}`);

          if (tabId === activeTabId) {
            setConnectionStatus('connected', `เชื่อมต่อแล้ว: ${username}@${host}`);
            windowTitle.textContent = `SSH Terminal - ${username}@${host}:${port}`;
            hideOverlay();
            enableCommandBar(true);
            session.term.clear();
            session.term.focus();

            if (appContainer) {
              appContainer.classList.add('sidebar-hidden');
              setTimeout(() => { session.fitAddon.fit(); sendResize(tabId); }, 300);
            }
          }
        }
      } else if (msg.type === 'data') {
        session.term.write(msg.data);
        if (tabId === activeTabId) triggerGimmickActivity();
      } else if (msg.type === 'error') {
        if (tabId === activeTabId) alert(msg.message);
        doDisconnect(tabId, true);
      }
    } catch (e) {
      console.error(e);
    }
  };

  ws.onclose = () => {
    session.socket = null;

    if (!session.intentionalDisconnect && session.reconnectAttempts < 5) {
      session.reconnectAttempts++;
      const delay = Math.min(2000 * Math.pow(2, session.reconnectAttempts - 1), 30000);
      const delaySec = (delay / 1000).toFixed(0);

      session.term.writeln(`\r\n\x1b[1;33m⚡ การเชื่อมต่อขาดหาย — reconnect ครั้งที่ ${session.reconnectAttempts}/5 ใน ${delaySec}s...\x1b[0m`);
      updateTabTitle(tabId, `[⟳] ${username}@${host}`);

      if (tabId === activeTabId) {
        setConnectionStatus('connecting', `Reconnecting ${session.reconnectAttempts}/5...`);
        showOverlay(`การเชื่อมต่อขาดหาย กำลัง reconnect ครั้งที่ ${session.reconnectAttempts}/5 ใน ${delaySec}s...`);
      }

      session.reconnectTimer = setTimeout(() => doConnect(tabId), delay);
    } else {
      if (!session.intentionalDisconnect) {
        session.term.writeln('\r\n\x1b[1;31m✗ Reconnect ไม่สำเร็จ — กรุณาเชื่อมต่อใหม่\x1b[0m');
      }
      doDisconnect(tabId, false);
    }
  };

  ws.onerror = (err) => console.error('WebSocket error:', err);
}

function doDisconnect(tabId, intentional) {
  const session = sessions[tabId];
  if (!session) return;

  session.intentionalDisconnect = true;
  if (session.reconnectTimer) { clearTimeout(session.reconnectTimer); session.reconnectTimer = null; }
  if (session.socket) { session.socket.close(); session.socket = null; }

  session.status = 'disconnected';
  const num = tabId.split('_')[1];
  updateTabTitle(tabId, `Tab ${num}`);

  if (intentional) {
    session.term.writeln('\r\n\x1b[1;31mตัดการเชื่อมต่อแล้ว\x1b[0m');
  }

  if (tabId === activeTabId) {
    setConnectionStatus('disconnected', 'ไม่ได้เชื่อมต่อ');
    windowTitle.textContent = 'SSH Terminal (ยังไม่ได้เชื่อมต่อ)';
    hideOverlay();
    enableCommandBar(false);

    if (appContainer) {
      appContainer.classList.remove('sidebar-hidden');
      setTimeout(() => { session.fitAddon.fit(); }, 300);
    }
  }
}

// ─── UI Helpers ───────────────────────────────────────────────────────────────
function setConnectionStatus(state, text) {
  statusDot.className = `status-indicator ${state}`;
  statusText.textContent = text;

  const gimmick = document.querySelector('.header-gimmick');
  if (gimmick) {
    gimmick.classList.remove('state-connected', 'state-connecting', 'state-disconnected');
    gimmick.classList.add(`state-${state}`);
  }

  if (state === 'connected') {
    connectBtn.disabled = true;
    disconnectBtn.classList.remove('hidden');
  } else {
    connectBtn.disabled = false;
    disconnectBtn.classList.add('hidden');
  }
}

function enableCommandBar(enabled) {
  thaiCommandInput.disabled = !enabled;
  sendCommandBtn.disabled = !enabled;
  if (enabled) thaiCommandInput.focus();
}

function showOverlay(message) {
  overlayMessage.textContent = message;
  terminalOverlay.classList.remove('hidden');
}

function updateOverlayStatus(message) {
  overlayMessage.textContent = message;
}

function hideOverlay() {
  terminalOverlay.classList.add('hidden');
}

function sendResize(tabId = activeTabId) {
  const s = sessions[tabId];
  if (s && s.socket && s.socket.readyState === WebSocket.OPEN) {
    s.socket.send(JSON.stringify({ type: 'resize', cols: s.term.cols, rows: s.term.rows }));
  }
}

function toggleSidebar() {
  if (!appContainer) return;
  appContainer.classList.toggle('sidebar-hidden');
  setTimeout(() => {
    const s = sessions[activeTabId];
    if (s) { s.fitAddon.fit(); sendResize(); }
  }, 300);
}

function applyThemeStyles(themeKey) {
  const theme = themes[themeKey];
  if (!theme) return;
  Object.values(sessions).forEach(s => { s.term.options.theme = theme; });
  macbookWindow.style.backgroundColor = theme.background;
  macbookWindow.style.borderColor = themeKey.includes('retro') ? theme.foreground : '#3c3d40';
}

// ─── Copy Output ──────────────────────────────────────────────────────────────
function copyTerminalOutput() {
  const session = sessions[activeTabId];
  if (!session) return;

  const selected = session.term.getSelection();
  const textToCopy = selected || '';

  if (!textToCopy) {
    btnCopyOutput.title = 'เลือกข้อความก่อน!';
    btnCopyOutput.classList.add('copy-empty');
    setTimeout(() => { btnCopyOutput.classList.remove('copy-empty'); btnCopyOutput.title = 'คัดลอกข้อความที่เลือก'; }, 1500);
    return;
  }

  navigator.clipboard.writeText(textToCopy).then(() => {
    btnCopyOutput.classList.add('copied');
    setTimeout(() => btnCopyOutput.classList.remove('copied'), 1500);
  }).catch(() => {
    // Fallback for older browsers
    const ta = document.createElement('textarea');
    ta.value = textToCopy;
    document.body.appendChild(ta);
    ta.select();
    document.execCommand('copy');
    document.body.removeChild(ta);
    btnCopyOutput.classList.add('copied');
    setTimeout(() => btnCopyOutput.classList.remove('copied'), 1500);
  });
}

// ─── Event Listeners ──────────────────────────────────────────────────────────
togglePasswordBtn.addEventListener('click', () => {
  const isPassword = passwordInput.type === 'password';
  passwordInput.type = isPassword ? 'text' : 'password';
  togglePasswordBtn.innerHTML = isPassword ? '<i data-lucide="eye-off"></i>' : '<i data-lucide="eye"></i>';
  lucide.createIcons();
});

connectionForm.addEventListener('submit', (e) => { e.preventDefault(); connectSSH(); });

disconnectBtn.addEventListener('click', () => doDisconnect(activeTabId, true));

macCloseBtn.addEventListener('click', () => {
  const s = sessions[activeTabId];
  if (s && (s.status === 'connected' || s.status === 'reconnecting')) {
    if (confirm('คุณต้องการตัดการเชื่อมต่อ SSH หรือไม่?')) doDisconnect(activeTabId, true);
  }
});

themeSelect.addEventListener('change', (e) => {
  const selectedTheme = e.target.value;
  applyThemeStyles(selectedTheme);
  localStorage.setItem('ssh_theme', selectedTheme);
});

clearTerminalBtn.addEventListener('click', () => {
  const s = sessions[activeTabId];
  if (s) { s.term.clear(); s.term.focus(); }
});

btnCopyOutput.addEventListener('click', copyTerminalOutput);

btnNewTab.addEventListener('click', () => createTab());

window.addEventListener('resize', () => {
  const s = sessions[activeTabId];
  if (s) { s.fitAddon.fit(); sendResize(); }
});

// ─── Profile Management ───────────────────────────────────────────────────────
saveProfileBtn.addEventListener('click', () => {
  const host     = hostInput.value.trim();
  const username = usernameInput.value.trim();
  const port     = parseInt(portInput.value) || 22;
  const password = passwordInput.value;

  if (!host || !username) { alert('กรุณากรอก Host และ Username ก่อนเซฟ'); return; }

  const profiles = getSavedProfiles();
  const id = currentProfileId || `profile_${Date.now()}`;
  profiles[id] = { id, name: `${username}@${host}`, host, username, port, password };
  localStorage.setItem('ssh_profiles', JSON.stringify(profiles));
  currentProfileId = null;
  loadProfiles();
  alert('บันทึกโปรไฟล์เรียบร้อยแล้ว!');
});

function getSavedProfiles() {
  try { return JSON.parse(localStorage.getItem('ssh_profiles') || '{}'); } catch (e) { return {}; }
}

function loadProfiles() {
  const profiles = getSavedProfiles();
  profilesList.innerHTML = '';
  const keys = Object.keys(profiles);

  if (keys.length === 0) {
    profilesList.innerHTML = '<div class="empty-profiles">ไม่มีโปรไฟล์ที่บันทึกไว้</div>';
    return;
  }

  keys.forEach(key => {
    const p = profiles[key];
    const card = document.createElement('div');
    card.className = 'profile-card';
    card.innerHTML = `
      <div class="profile-info">
        <span class="profile-name">${p.name}</span>
        <span class="profile-host">${p.username}@${p.host}:${p.port}</span>
      </div>
      <div class="profile-actions">
        <button class="btn-profile-action connect" title="ใช้งานโปรไฟล์นี้"><i data-lucide="arrow-right"></i></button>
        <button class="btn-profile-action delete" title="ลบโปรไฟล์"><i data-lucide="trash-2"></i></button>
      </div>`;

    card.querySelector('.profile-info').addEventListener('click', () => {
      hostInput.value = p.host; usernameInput.value = p.username;
      portInput.value = p.port; passwordInput.value = p.password || '';
      currentProfileId = p.id;
    });

    card.querySelector('.connect').addEventListener('click', () => {
      hostInput.value = p.host; usernameInput.value = p.username;
      portInput.value = p.port; passwordInput.value = p.password || '';
      currentProfileId = p.id;
      connectSSH();
    });

    card.querySelector('.delete').addEventListener('click', (e) => {
      e.stopPropagation();
      if (confirm('คุณต้องการลบโปรไฟล์นี้หรือไม่?')) deleteProfile(p.id);
    });

    profilesList.appendChild(card);
  });

  lucide.createIcons();
}

function deleteProfile(id) {
  const profiles = getSavedProfiles();
  delete profiles[id];
  localStorage.setItem('ssh_profiles', JSON.stringify(profiles));
  if (currentProfileId === id) currentProfileId = null;
  loadProfiles();
}

// ─── Thai Command Input ───────────────────────────────────────────────────────
function sendThaiCommand() {
  const session = sessions[activeTabId];
  if (!session) return;
  const cmd = thaiCommandInput.value;
  if (!cmd) return;

  if (session.socket && session.socket.readyState === WebSocket.OPEN) {
    const suffix = autoRunOnEnter ? '\r' : '';
    session.socket.send(JSON.stringify({ type: 'input', data: cmd + suffix }));

    if (commandHistory.length === 0 || commandHistory[commandHistory.length - 1] !== cmd) {
      commandHistory.push(cmd);
      if (commandHistory.length > 50) commandHistory.shift();
      localStorage.setItem('ssh_command_history', JSON.stringify(commandHistory));
    }

    thaiCommandInput.value = '';
    session.historyIndex = -1;
  }
}

sendCommandBtn.addEventListener('click', sendThaiCommand);

thaiCommandInput.addEventListener('keydown', (e) => {
  const session = sessions[activeTabId];
  if (!session) return;

  if (e.key === 'Enter') {
    e.preventDefault();
    if (e.isComposing || e.keyCode === 229) return;
    sendThaiCommand();
  } else if (e.key === 'ArrowUp') {
    e.preventDefault();
    if (commandHistory.length === 0) return;
    if (session.historyIndex === -1) session.historyIndex = commandHistory.length - 1;
    else if (session.historyIndex > 0) session.historyIndex--;
    thaiCommandInput.value = commandHistory[session.historyIndex];
  } else if (e.key === 'ArrowDown') {
    e.preventDefault();
    if (session.historyIndex === -1) return;
    if (session.historyIndex < commandHistory.length - 1) {
      session.historyIndex++;
      thaiCommandInput.value = commandHistory[session.historyIndex];
    } else {
      session.historyIndex = -1;
      thaiCommandInput.value = '';
    }
  }
});

// ─── Focus Toggle (Alt + Spacebar) ───────────────────────────────────────────
let lastToggleTime = 0;
function toggleCursorFocus() {
  const now = Date.now();
  if (now - lastToggleTime < 100) return; // Debounce double triggers
  lastToggleTime = now;

  const session = sessions[activeTabId];
  if (!session) return;

  if (document.activeElement === thaiCommandInput) {
    session.term.focus();
  } else {
    if (!thaiCommandInput.disabled) {
      thaiCommandInput.focus();
    }
  }
}

window.addEventListener('keydown', (e) => {
  if (e.altKey && (e.code === 'Space' || e.key === ' ' || e.keyCode === 32)) {
    if (!thaiCommandInput.disabled) {
      e.preventDefault();
      e.stopPropagation();
      toggleCursorFocus();
    }
  }
});

// ─── Header Gimmick Activity Control ─────────────────────────────────────────
let gimmickTimeout = null;
function triggerGimmickActivity() {
  const gimmick = document.querySelector('.header-gimmick');
  if (!gimmick) return;
  
  gimmick.classList.add('active');
  
  if (gimmickTimeout) clearTimeout(gimmickTimeout);
  gimmickTimeout = setTimeout(() => {
    gimmick.classList.remove('active');
  }, 1000);
}

// ─── Mascot Gimmick Setup ───────────────────────────────────────────────────
const MASCOT_SVGS = {
  dino: `
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 48 16">
      <!-- Frame 1 -->
      <g transform="translate(0, 0)">
        <rect class="pixel" x="6" y="0" width="7" height="1"/>
        <rect class="pixel" x="5" y="1" width="3" height="1"/><rect class="pixel" x="9" y="1" width="5" height="1"/>
        <rect class="pixel" x="5" y="2" width="9" height="1"/>
        <rect class="pixel" x="5" y="3" width="6" height="1"/>
        <rect class="pixel" x="5" y="4" width="4" height="1"/>
        <rect class="pixel" x="4" y="5" width="4" height="1"/>
        <rect class="pixel" x="3" y="6" width="7" height="1"/>
        <rect class="pixel" x="1" y="7" width="9" height="1"/>
        <rect class="pixel" x="0" y="8" width="9" height="1"/>
        <rect class="pixel" x="0" y="9" width="8" height="1"/>
        <rect class="pixel" x="1" y="10" width="6" height="1"/>
        <rect class="pixel" x="2" y="11" width="4" height="1"/>
        <rect class="pixel" x="2" y="12" width="1" height="1"/><rect class="pixel" x="4" y="12" width="1" height="1"/>
        <rect class="pixel" x="2" y="13" width="1" height="1"/><rect class="pixel" x="4" y="13" width="1" height="1"/>
        <rect class="pixel" x="2" y="14" width="2" height="1"/><rect class="pixel" x="4" y="14" width="2" height="1"/>
      </g>
      <!-- Frame 2 -->
      <g transform="translate(16, 0)">
        <rect class="pixel" x="6" y="0" width="7" height="1"/>
        <rect class="pixel" x="5" y="1" width="3" height="1"/><rect class="pixel" x="9" y="1" width="5" height="1"/>
        <rect class="pixel" x="5" y="2" width="9" height="1"/>
        <rect class="pixel" x="5" y="3" width="6" height="1"/>
        <rect class="pixel" x="5" y="4" width="4" height="1"/>
        <rect class="pixel" x="4" y="5" width="4" height="1"/>
        <rect class="pixel" x="3" y="6" width="7" height="1"/>
        <rect class="pixel" x="1" y="7" width="9" height="1"/>
        <rect class="pixel" x="0" y="8" width="9" height="1"/>
        <rect class="pixel" x="0" y="9" width="8" height="1"/>
        <rect class="pixel" x="1" y="10" width="6" height="1"/>
        <rect class="pixel" x="2" y="11" width="4" height="1"/>
        <rect class="pixel" x="2" y="12" width="1" height="1"/><rect class="pixel" x="4" y="12" width="1" height="1"/>
        <rect class="pixel" x="2" y="13" width="1" height="1"/><rect class="pixel" x="5" y="13" width="1" height="1"/>
        <rect class="pixel" x="2" y="14" width="2" height="1"/><rect class="pixel" x="5" y="14" width="2" height="1"/>
      </g>
      <!-- Frame 3 -->
      <g transform="translate(32, 0)">
        <rect class="pixel" x="6" y="0" width="7" height="1"/>
        <rect class="pixel" x="5" y="1" width="3" height="1"/><rect class="pixel" x="9" y="1" width="5" height="1"/>
        <rect class="pixel" x="5" y="2" width="9" height="1"/>
        <rect class="pixel" x="5" y="3" width="6" height="1"/>
        <rect class="pixel" x="5" y="4" width="4" height="1"/>
        <rect class="pixel" x="4" y="5" width="4" height="1"/>
        <rect class="pixel" x="3" y="6" width="7" height="1"/>
        <rect class="pixel" x="1" y="7" width="9" height="1"/>
        <rect class="pixel" x="0" y="8" width="9" height="1"/>
        <rect class="pixel" x="0" y="9" width="8" height="1"/>
        <rect class="pixel" x="1" y="10" width="6" height="1"/>
        <rect class="pixel" x="2" y="11" width="4" height="1"/>
        <rect class="pixel" x="2" y="12" width="1" height="1"/><rect class="pixel" x="4" y="12" width="1" height="1"/>
        <rect class="pixel" x="1" y="13" width="1" height="1"/><rect class="pixel" x="4" y="13" width="1" height="1"/>
        <rect class="pixel" x="0" y="14" width="2" height="1"/><rect class="pixel" x="4" y="14" width="2" height="1"/>
      </g>
    </svg>
  `,
  cat: `
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 48 16">
      <!-- Frame 1 -->
      <g transform="translate(0, 0)">
        <rect class="pixel" x="4" y="3" width="1" height="1"/>
        <rect class="pixel" x="9" y="3" width="1" height="1"/>
        <rect class="pixel" x="3" y="4" width="8" height="1"/>
        <rect class="pixel" x="3" y="5" width="2" height="1"/><rect class="pixel" x="6" y="5" width="2" height="1"/><rect class="pixel" x="9" y="5" width="2" height="1"/>
        <rect class="pixel" x="3" y="6" width="8" height="1"/>
        <rect class="pixel" x="4" y="7" width="6" height="1"/>
        <rect class="pixel" x="2" y="8" width="9" height="4"/>
        <rect class="pixel" x="11" y="7" width="1" height="2"/>
        <rect class="pixel" x="12" y="5" width="1" height="3"/>
        <rect class="pixel" x="3" y="12" width="1" height="3"/>
        <rect class="pixel" x="5" y="12" width="1" height="2"/>
        <rect class="pixel" x="8" y="12" width="1" height="3"/>
        <rect class="pixel" x="10" y="12" width="1" height="2"/>
      </g>
      <!-- Frame 2 -->
      <g transform="translate(16, 0)">
        <rect class="pixel" x="4" y="3" width="1" height="1"/>
        <rect class="pixel" x="9" y="3" width="1" height="1"/>
        <rect class="pixel" x="3" y="4" width="8" height="1"/>
        <rect class="pixel" x="3" y="5" width="2" height="1"/><rect class="pixel" x="6" y="5" width="2" height="1"/><rect class="pixel" x="9" y="5" width="2" height="1"/>
        <rect class="pixel" x="3" y="6" width="8" height="1"/>
        <rect class="pixel" x="4" y="7" width="6" height="1"/>
        <rect class="pixel" x="2" y="8" width="9" height="4"/>
        <rect class="pixel" x="11" y="8" width="1" height="2"/>
        <rect class="pixel" x="12" y="9" width="1" height="2"/>
        <rect class="pixel" x="3" y="12" width="1" height="2"/>
        <rect class="pixel" x="5" y="12" width="1" height="3"/>
        <rect class="pixel" x="8" y="12" width="1" height="2"/>
        <rect class="pixel" x="10" y="12" width="1" height="3"/>
      </g>
      <!-- Frame 3 -->
      <g transform="translate(32, 0)">
        <rect class="pixel" x="4" y="3" width="1" height="1"/>
        <rect class="pixel" x="9" y="3" width="1" height="1"/>
        <rect class="pixel" x="3" y="4" width="8" height="1"/>
        <rect class="pixel" x="3" y="5" width="2" height="1"/><rect class="pixel" x="6" y="5" width="2" height="1"/><rect class="pixel" x="9" y="5" width="2" height="1"/>
        <rect class="pixel" x="3" y="6" width="8" height="1"/>
        <rect class="pixel" x="4" y="7" width="6" height="1"/>
        <rect class="pixel" x="2" y="8" width="9" height="4"/>
        <rect class="pixel" x="11" y="6" width="1" height="2"/>
        <rect class="pixel" x="12" y="4" width="1" height="3"/>
        <rect class="pixel" x="3" y="12" width="1" height="3"/>
        <rect class="pixel" x="5" y="12" width="1" height="3"/>
        <rect class="pixel" x="8" y="12" width="1" height="3"/>
        <rect class="pixel" x="10" y="12" width="1" height="3"/>
      </g>
    </svg>
  `,
  ghost: `
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 48 16">
      <!-- Frame 1 -->
      <g transform="translate(0, 0)">
        <rect class="pixel" x="4" y="1" width="8" height="1"/>
        <rect class="pixel" x="2" y="2" width="12" height="1"/>
        <rect class="pixel" x="1" y="3" width="14" height="1"/>
        <rect class="pixel" x="1" y="4" width="2" height="1"/><rect class="pixel" x="5" y="4" width="4" height="1"/><rect class="pixel" x="11" y="4" width="4" height="1"/>
        <rect class="pixel" x="1" y="5" width="2" height="1"/><rect class="pixel" x="5" y="5" width="4" height="1"/><rect class="pixel" x="11" y="5" width="4" height="1"/>
        <rect class="pixel" x="1" y="6" width="14" height="6"/>
        <rect class="pixel" x="1" y="12" width="2" height="2"/>
        <rect class="pixel" x="5" y="12" width="2" height="2"/>
        <rect class="pixel" x="9" y="12" width="2" height="2"/>
        <rect class="pixel" x="13" y="12" width="2" height="2"/>
        <rect class="pixel" x="3" y="12" width="2" height="1"/>
        <rect class="pixel" x="7" y="12" width="2" height="1"/>
        <rect class="pixel" x="11" y="12" width="2" height="1"/>
      </g>
      <!-- Frame 2 -->
      <g transform="translate(16, 0)">
        <rect class="pixel" x="4" y="1" width="8" height="1"/>
        <rect class="pixel" x="2" y="2" width="12" height="1"/>
        <rect class="pixel" x="1" y="3" width="14" height="1"/>
        <rect class="pixel" x="1" y="4" width="1" height="1"/><rect class="pixel" x="4" y="4" width="4" height="1"/><rect class="pixel" x="10" y="4" width="5" height="1"/>
        <rect class="pixel" x="1" y="5" width="1" height="1"/><rect class="pixel" x="4" y="5" width="4" height="1"/><rect class="pixel" x="10" y="5" width="5" height="1"/>
        <rect class="pixel" x="1" y="6" width="14" height="6"/>
        <rect class="pixel" x="3" y="12" width="2" height="2"/>
        <rect class="pixel" x="7" y="12" width="2" height="2"/>
        <rect class="pixel" x="11" y="12" width="2" height="2"/>
        <rect class="pixel" x="1" y="12" width="2" height="1"/>
        <rect class="pixel" x="5" y="12" width="2" height="1"/>
        <rect class="pixel" x="9" y="12" width="2" height="1"/>
        <rect class="pixel" x="13" y="12" width="2" height="1"/>
      </g>
      <!-- Frame 3 -->
      <g transform="translate(32, 0)">
        <rect class="pixel" x="4" y="1" width="8" height="1"/>
        <rect class="pixel" x="2" y="2" width="12" height="1"/>
        <rect class="pixel" x="1" y="3" width="14" height="1"/>
        <rect class="pixel" x="1" y="4" width="2" height="1"/><rect class="pixel" x="5" y="4" width="4" height="1"/><rect class="pixel" x="11" y="4" width="4" height="1"/>
        <rect class="pixel" x="1" y="5" width="2" height="1"/><rect class="pixel" x="5" y="5" width="4" height="1"/><rect class="pixel" x="11" y="5" width="4" height="1"/>
        <rect class="pixel" x="1" y="6" width="14" height="6"/>
        <rect class="pixel" x="2" y="12" width="2" height="2"/>
        <rect class="pixel" x="6" y="12" width="2" height="2"/>
        <rect class="pixel" x="10" y="12" width="2" height="2"/>
        <rect class="pixel" x="1" y="12" width="1" height="1"/>
        <rect class="pixel" x="4" y="12" width="2" height="1"/>
        <rect class="pixel" x="8" y="12" width="2" height="1"/>
        <rect class="pixel" x="12" y="12" width="3" height="1"/>
      </g>
    </svg>
  `,
  robot: `
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 48 16">
      <!-- Frame 1 -->
      <g transform="translate(0, 0)">
        <rect class="pixel" x="7" y="0" width="2" height="1"/>
        <rect class="pixel" x="7" y="1" width="2" height="1"/>
        <rect class="pixel" x="4" y="2" width="8" height="4"/>
        <rect class="pixel" x="4" y="4" width="1" height="1"/><rect class="pixel" x="6" y="4" width="4" height="1"/><rect class="pixel" x="11" y="4" width="1" height="1"/>
        <rect class="pixel" x="7" y="6" width="2" height="1"/>
        <rect class="pixel" x="3" y="7" width="10" height="5"/>
        <rect class="pixel" x="1" y="7" width="2" height="3"/>
        <rect class="pixel" x="13" y="9" width="2" height="3"/>
        <rect class="pixel" x="4" y="12" width="8" height="2"/>
        <rect class="pixel" x="5" y="14" width="2" height="1"/>
        <rect class="pixel" x="9" y="14" width="2" height="1"/>
      </g>
      <!-- Frame 2 -->
      <g transform="translate(16, 0)">
        <rect class="pixel" x="7" y="0" width="2" height="1"/>
        <rect class="pixel" x="7" y="1" width="2" height="1"/>
        <rect class="pixel" x="4" y="2" width="8" height="4"/>
        <rect class="pixel" x="4" y="4" width="1" height="1"/><rect class="pixel" x="6" y="4" width="4" height="1"/><rect class="pixel" x="11" y="4" width="1" height="1"/>
        <rect class="pixel" x="7" y="6" width="2" height="1"/>
        <rect class="pixel" x="3" y="7" width="10" height="5"/>
        <rect class="pixel" x="1" y="9" width="2" height="3"/>
        <rect class="pixel" x="13" y="7" width="2" height="3"/>
        <rect class="pixel" x="4" y="12" width="8" height="2"/>
        <rect class="pixel" x="6" y="14" width="2" height="1"/>
        <rect class="pixel" x="10" y="14" width="2" height="1"/>
      </g>
      <!-- Frame 3 -->
      <g transform="translate(32, 0)">
        <rect class="pixel" x="7" y="0" width="2" height="1"/>
        <rect class="pixel" x="7" y="1" width="2" height="1"/>
        <rect class="pixel" x="4" y="2" width="8" height="4"/>
        <rect class="pixel" x="4" y="4" width="1" height="1"/><rect class="pixel" x="6" y="4" width="4" height="1"/><rect class="pixel" x="11" y="4" width="1" height="1"/>
        <rect class="pixel" x="7" y="6" width="2" height="1"/>
        <rect class="pixel" x="3" y="7" width="10" height="5"/>
        <rect class="pixel" x="1" y="8" width="2" height="2"/>
        <rect class="pixel" x="13" y="8" width="2" height="2"/>
        <rect class="pixel" x="4" y="12" width="8" height="2"/>
        <rect class="pixel" x="4" y="14" width="2" height="1"/>
        <rect class="pixel" x="8" y="14" width="2" height="1"/>
      </g>
    </svg>
  `
};

function updateMascotSVG(mascotName) {
  const container = document.querySelector('.mascot-sprite-container');
  if (!container) return;
  const svgContent = MASCOT_SVGS[mascotName] || MASCOT_SVGS['dino'];
  container.innerHTML = svgContent;
}

