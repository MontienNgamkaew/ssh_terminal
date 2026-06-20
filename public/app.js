// Theme Definitions
const themes = {
  'macos-dark': {
    background: '#1e1e1e',
    foreground: '#ffffff',
    cursor: '#ffffff',
    black: '#000000',
    red: '#ff5555',
    green: '#50fa7b',
    yellow: '#f1fa8c',
    blue: '#bd93f9',
    magenta: '#ff79c6',
    cyan: '#8be9fd',
    white: '#bbbbbb'
  },
  'dracula': {
    background: '#282a36',
    foreground: '#f8f8f2',
    cursor: '#f8f8f0',
    black: '#21222c',
    red: '#ff5555',
    green: '#50fa7b',
    yellow: '#f1fa8c',
    blue: '#bd93f9',
    magenta: '#ff79c6',
    cyan: '#8be9fd',
    white: '#ffffff'
  },
  'monokai': {
    background: '#272822',
    foreground: '#f8f8f2',
    cursor: '#f8f8f0',
    black: '#272822',
    red: '#f92672',
    green: '#a6e22e',
    yellow: '#f4bf75',
    blue: '#66d9ef',
    magenta: '#ae81ff',
    cyan: '#a1efe4',
    white: '#f8f8f2'
  },
  'solarized-dark': {
    background: '#002b36',
    foreground: '#839496',
    cursor: '#93a1a1',
    black: '#073642',
    red: '#dc322f',
    green: '#859900',
    yellow: '#b58900',
    blue: '#268bd2',
    magenta: '#d33682',
    cyan: '#2aa198',
    white: '#eee8d5'
  },
  'retro-green': {
    background: '#080f0a',
    foreground: '#33ff33',
    cursor: '#33ff33',
    black: '#000000',
    red: '#ff0000',
    green: '#33ff33',
    yellow: '#ffff00',
    blue: '#0000ff',
    magenta: '#ff00ff',
    cyan: '#00ffff',
    white: '#ffffff'
  },
  'retro-amber': {
    background: '#100a00',
    foreground: '#ffb000',
    cursor: '#ffb000',
    black: '#000000',
    red: '#ff0000',
    green: '#00ff00',
    yellow: '#ffb000',
    blue: '#0000ff',
    magenta: '#ff00ff',
    cyan: '#00ffff',
    white: '#ffffff'
  }
};

// Global variables
let socket = null;
let term = null;
let fitAddon = null;
let commandHistory = [];
let historyIndex = -1;
let currentProfileId = null;

// DOM Elements
const connectionForm = document.getElementById('connection-form');
const hostInput = document.getElementById('ssh-host');
const usernameInput = document.getElementById('ssh-username');
const portInput = document.getElementById('ssh-port');
const passwordInput = document.getElementById('ssh-password');
const togglePasswordBtn = document.getElementById('toggle-password');
const connectBtn = document.getElementById('btn-connect');
const saveProfileBtn = document.getElementById('btn-save-profile');
const profilesList = document.getElementById('profiles-list');

const statusDot = document.getElementById('connection-status-dot');
const statusText = document.getElementById('connection-status-text');

const terminalContainer = document.getElementById('terminal-container');
const terminalOverlay = document.getElementById('terminal-overlay');
const overlayMessage = document.getElementById('overlay-message');
const themeSelect = document.getElementById('terminal-theme');
const toggleSidebarBtn = document.getElementById('btn-toggle-sidebar');
const clearTerminalBtn = document.getElementById('btn-clear-terminal');
const disconnectBtn = document.getElementById('btn-disconnect');
const macCloseBtn = document.getElementById('mac-close-btn');
const windowTitle = document.getElementById('terminal-window-title');
const macbookWindow = document.querySelector('.macbook-window');
const appContainer = document.querySelector('.app-container');

const thaiCommandInput = document.getElementById('thai-command-input');
const sendCommandBtn = document.getElementById('btn-send-command');

// Initial Setup
document.addEventListener('DOMContentLoaded', () => {
  // Initialize Lucide icons
  lucide.createIcons();
  
  // Set default theme from selector
  const defaultTheme = themeSelect.value;
  applyThemeStyles(defaultTheme);
  
  // Toggle Sidebar
  if (toggleSidebarBtn) {
    toggleSidebarBtn.addEventListener('click', toggleSidebar);
  }

  // Initialize Terminal
  initTerminal(defaultTheme);
  
  // Load Saved Profiles
  loadProfiles();

  // Load last used session if available
  const lastProfile = localStorage.getItem('ssh_last_profile');
  if (lastProfile) {
    try {
      const data = JSON.parse(lastProfile);
      hostInput.value = data.host || '';
      usernameInput.value = data.username || '';
      portInput.value = data.port || '22';
    } catch (e) {
      console.error(e);
    }
  }

  // Load history from localStorage
  const savedHistory = localStorage.getItem('ssh_command_history');
  if (savedHistory) {
    try {
      commandHistory = JSON.parse(savedHistory);
    } catch (e) {
      console.error(e);
    }
  }

  // Register Service Worker for PWA installation support
  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('service-worker.js')
      .then(reg => console.log('Service Worker registered successfully:', reg.scope))
      .catch(err => console.error('Service Worker registration failed:', err));
  }
});

// Password visibility toggle
togglePasswordBtn.addEventListener('click', () => {
  const isPassword = passwordInput.type === 'password';
  passwordInput.type = isPassword ? 'text' : 'password';
  togglePasswordBtn.innerHTML = isPassword ? '<i data-lucide="eye-off"></i>' : '<i data-lucide="eye"></i>';
  lucide.createIcons();
});

// Initialize Terminal using xterm.js
function initTerminal(themeKey) {
  // Setup standard Terminal Options
  term = new Terminal({
    cursorBlink: true,
    fontFamily: 'JetBrains Mono, Courier New, monospace',
    fontSize: 14,
    lineHeight: 1.2,
    theme: themes[themeKey],
    allowProposedApi: true
  });

  // Fit Addon
  fitAddon = new FitAddon.FitAddon();
  term.loadAddon(fitAddon);

  // Render terminal
  term.open(terminalContainer);
  fitAddon.fit();

  // Handle Resize Event
  window.addEventListener('resize', () => {
    if (term) {
      fitAddon.fit();
      sendResize();
    }
  });

  // Send keystrokes directly typed in the terminal
  term.onData((data) => {
    if (socket && socket.readyState === WebSocket.OPEN) {
      socket.send(JSON.stringify({
        type: 'input',
        data: data
      }));
    }
  });

  // Print initial message
  term.writeln('\x1b[1;36mยินดีต้อนรับสู่ SSH Terminal Bridge!\x1b[0m');
  term.writeln('กรอกรายละเอียดเซิร์ฟเวอร์ด้านซ้ายแล้วกดปุ่ม \x1b[1;32m"เชื่อมต่อ SSH"\x1b[0m เพื่อเริ่มต้นใช้งาน...');
}

// Apply visual theme to both XTerm and macOS window container
function applyThemeStyles(themeKey) {
  const theme = themes[themeKey];
  if (!theme) return;
  
  // Set Terminal Background/Foreground in Xterm
  if (term) {
    term.options.theme = theme;
  }
  
  // Set container styles
  macbookWindow.style.backgroundColor = theme.background;
  
  // Custom tweak: for light backgrounds, adjust color themes
  if (themeKey.includes('retro')) {
    macbookWindow.style.borderColor = theme.foreground;
  } else {
    macbookWindow.style.borderColor = '#3c3d40';
  }
}

// Theme Change Handler
themeSelect.addEventListener('change', (e) => {
  applyThemeStyles(e.target.value);
});

// Clear Terminal Handler
clearTerminalBtn.addEventListener('click', () => {
  if (term) {
    term.clear();
    term.focus();
  }
});

// Disconnect Handlers
disconnectBtn.addEventListener('click', disconnectSSH);
macCloseBtn.addEventListener('click', () => {
  if (socket) {
    if (confirm('คุณต้องการตัดการเชื่อมต่อ SSH หรือไม่?')) {
      disconnectSSH();
    }
  }
});

// Send resize details to backend
function sendResize() {
  if (socket && socket.readyState === WebSocket.OPEN && term) {
    socket.send(JSON.stringify({
      type: 'resize',
      cols: term.cols,
      rows: term.rows
    }));
  }
}

// Toggle Sidebar display
function toggleSidebar() {
  if (!appContainer) return;
  appContainer.classList.toggle('sidebar-hidden');
  
  // Fit immediately
  if (term && fitAddon) {
    fitAddon.fit();
    sendResize();
  }
  
  // Fit again after CSS transition completes
  setTimeout(() => {
    if (term && fitAddon) {
      fitAddon.fit();
      sendResize();
    }
  }, 300);
}

// Connect form submit handler
connectionForm.addEventListener('submit', (e) => {
  e.preventDefault();
  connectSSH();
});

// Connect to SSH via backend WebSocket
function connectSSH() {
  if (socket) {
    disconnectSSH();
  }

  const host = hostInput.value.trim();
  const username = usernameInput.value.trim();
  const port = parseInt(portInput.value) || 22;
  const password = passwordInput.value;

  if (!host || !username || !password) {
    alert('กรุณากรอกข้อมูลให้ครบถ้วน');
    return;
  }

  // Update status UI to connecting
  setConnectionStatus('connecting', 'กำลังเชื่อมต่อ...');
  showOverlay('กำลังเริ่มการเชื่อมต่อกับเซิร์ฟเวอร์...');

  // Save last used parameters (except password)
  localStorage.setItem('ssh_last_profile', JSON.stringify({ host, username, port }));

  // Create WebSocket
  const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
  const wsUrl = `${protocol}//${window.location.host}`;
  
  socket = new WebSocket(wsUrl);

  socket.onopen = () => {
    // Send connection details
    socket.send(JSON.stringify({
      type: 'connect',
      host,
      port,
      username,
      password,
      cols: term.cols,
      rows: term.rows
    }));
  };

  socket.onmessage = (event) => {
    try {
      const msg = JSON.parse(event.data);

      if (msg.type === 'status') {
        updateOverlayStatus(msg.message, msg.level);
        if (msg.level === 'success') {
          setConnectionStatus('connected', `เชื่อมต่อแล้ว: ${username}@${host}`);
          windowTitle.textContent = `SSH Terminal - ${username}@${host}:${port}`;
          hideOverlay();
          enableCommandBar(true);
          term.clear();
          term.focus();
          
          // Auto collapse sidebar when connected
          if (appContainer) {
            appContainer.classList.add('sidebar-hidden');
            setTimeout(() => {
              if (term && fitAddon) {
                fitAddon.fit();
                sendResize();
              }
            }, 300);
          }
        } else if (msg.level === 'warning') {
          // Warning state
        }
      } else if (msg.type === 'data') {
        term.write(msg.data);
      } else if (msg.type === 'error') {
        alert(msg.message);
        disconnectSSH();
      }
    } catch (e) {
      console.error(e);
    }
  };

  socket.onclose = (event) => {
    disconnectSSH();
    term.writeln('\r\n\x1b[1;31mการเชื่อมต่อถูกปิดลง\x1b[0m');
  };

  socket.onerror = (error) => {
    console.error('WebSocket Error:', error);
    alert('เกิดข้อผิดพลาดในการเชื่อมต่อ WebSocket');
    disconnectSSH();
  };
}

function disconnectSSH() {
  if (socket) {
    socket.close();
    socket = null;
  }
  
  setConnectionStatus('disconnected', 'ไม่ได้เชื่อมต่อ');
  windowTitle.textContent = 'SSH Terminal (ยังไม่ได้เชื่อมต่อ)';
  hideOverlay();
  enableCommandBar(false);
  
  // Auto restore sidebar on disconnect
  if (appContainer) {
    appContainer.classList.remove('sidebar-hidden');
    setTimeout(() => {
      if (term && fitAddon) {
        fitAddon.fit();
      }
    }, 300);
  }
}

// Update connection status label
function setConnectionStatus(state, text) {
  statusDot.className = 'status-indicator';
  statusDot.classList.add(state);
  statusText.textContent = text;

  if (state === 'connected') {
    connectBtn.disabled = true;
    disconnectBtn.classList.remove('hidden');
  } else {
    connectBtn.disabled = false;
    disconnectBtn.classList.add('hidden');
  }
}

// Control Command Bar state
function enableCommandBar(enabled) {
  thaiCommandInput.disabled = !enabled;
  sendCommandBtn.disabled = !enabled;
  if (enabled) {
    thaiCommandInput.focus();
  }
}

// Overlay helpers
function showOverlay(message) {
  overlayMessage.textContent = message;
  terminalOverlay.classList.remove('hidden');
}

function updateOverlayStatus(message, level) {
  overlayMessage.textContent = message;
}

function hideOverlay() {
  terminalOverlay.classList.add('hidden');
}

// Profile Management (LocalStorage)
saveProfileBtn.addEventListener('click', () => {
  const host = hostInput.value.trim();
  const username = usernameInput.value.trim();
  const port = parseInt(portInput.value) || 22;
  const password = passwordInput.value;

  if (!host || !username) {
    alert('กรุณากรอก Host และ Username ก่อนเซฟ');
    return;
  }

  const profiles = getSavedProfiles();
  const id = currentProfileId || 'profile_' + Date.now();
  
  // We can choose to save password or not. For maximum developer convenience,
  // we save the password too, encrypted in localStorage (simple obfuscation or plain text since it is user's local machine).
  const newProfile = {
    id,
    name: `${username}@${host}`,
    host,
    username,
    port,
    password: password // Saved in client-side localStorage only
  };

  profiles[id] = newProfile;
  localStorage.setItem('ssh_profiles', JSON.stringify(profiles));
  
  currentProfileId = null;
  loadProfiles();
  alert('บันทึกโปรไฟล์เรียบร้อยแล้ว!');
});

function getSavedProfiles() {
  const profilesStr = localStorage.getItem('ssh_profiles');
  if (!profilesStr) return {};
  try {
    return JSON.parse(profilesStr);
  } catch (e) {
    return {};
  }
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
        <button class="btn-profile-action connect" title="ใช้งานโปรไฟล์นี้">
          <i data-lucide="arrow-right"></i>
        </button>
        <button class="btn-profile-action delete" title="ลบโปรไฟล์">
          <i data-lucide="trash-2"></i>
        </button>
      </div>
    `;

    // Click profile name to populate form
    card.querySelector('.profile-info').addEventListener('click', () => {
      hostInput.value = p.host;
      usernameInput.value = p.username;
      portInput.value = p.port;
      passwordInput.value = p.password || '';
      currentProfileId = p.id;
    });

    // Click connect button to load form and connect immediately
    card.querySelector('.connect').addEventListener('click', () => {
      hostInput.value = p.host;
      usernameInput.value = p.username;
      portInput.value = p.port;
      passwordInput.value = p.password || '';
      currentProfileId = p.id;
      connectSSH();
    });

    // Delete profile
    card.querySelector('.delete').addEventListener('click', (e) => {
      e.stopPropagation();
      if (confirm('คุณต้องการลบโปรไฟล์นี้หรือไม่?')) {
        deleteProfiles(p.id);
      }
    });

    profilesList.appendChild(card);
  });

  lucide.createIcons();
}

function deleteProfiles(id) {
  const profiles = getSavedProfiles();
  delete profiles[id];
  localStorage.setItem('ssh_profiles', JSON.stringify(profiles));
  if (currentProfileId === id) currentProfileId = null;
  loadProfiles();
}

// Thai Command Input & History Handling
function sendThaiCommand() {
  const cmd = thaiCommandInput.value;
  if (!cmd) return;

  if (socket && socket.readyState === WebSocket.OPEN) {
    // Send command + newline character so shell executes it immediately
    socket.send(JSON.stringify({
      type: 'input',
      data: cmd + '\n'
    }));

    // Add to history if it's new or not the same as the last one
    if (commandHistory.length === 0 || commandHistory[commandHistory.length - 1] !== cmd) {
      commandHistory.push(cmd);
      // Cap history at 50 entries
      if (commandHistory.length > 50) {
        commandHistory.shift();
      }
      localStorage.setItem('ssh_command_history', JSON.stringify(commandHistory));
    }

    // Reset input states
    thaiCommandInput.value = '';
    historyIndex = -1;
  }
}

// Click Send Button
sendCommandBtn.addEventListener('click', sendThaiCommand);

// Press Enter inside command input
thaiCommandInput.addEventListener('keydown', (e) => {
  if (e.key === 'Enter') {
    e.preventDefault();
    sendThaiCommand();
  } else if (e.key === 'ArrowUp') {
    // Cycle older commands
    e.preventDefault();
    if (commandHistory.length === 0) return;
    
    if (historyIndex === -1) {
      historyIndex = commandHistory.length - 1;
    } else if (historyIndex > 0) {
      historyIndex--;
    }
    thaiCommandInput.value = commandHistory[historyIndex];
  } else if (e.key === 'ArrowDown') {
    // Cycle newer commands
    e.preventDefault();
    if (commandHistory.length === 0) return;

    if (historyIndex !== -1) {
      if (historyIndex < commandHistory.length - 1) {
        historyIndex++;
        thaiCommandInput.value = commandHistory[historyIndex];
      } else {
        historyIndex = -1;
        thaiCommandInput.value = '';
      }
    }
  }
});
