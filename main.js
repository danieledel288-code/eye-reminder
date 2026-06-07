const {
  app, BrowserWindow, Tray, Menu, ipcMain,
  powerMonitor, screen, nativeImage,
} = require('electron')
const path = require('path')

// Suppress GPU cache errors (lock contention on Windows)
app.commandLine.appendSwitch('disable-gpu-shader-disk-cache')
app.commandLine.appendSwitch('disable-software-rasterizer')

const WORK_SECONDS   = 20 * 60
const IDLE_THRESHOLD = 60

let mainWin     = null
let tray        = null
let overlayWin  = null
let activeSeconds = 0
let isPaused    = false
let timerHandle = null

// ── Single instance ──────────────────────────────────────────────────────────
const gotLock = app.requestSingleInstanceLock()
if (!gotLock) {
  app.quit()
} else {
  app.on('second-instance', () => {
    if (mainWin) {
      if (mainWin.isMinimized()) mainWin.restore()
      mainWin.show()
      mainWin.focus()
    }
  })
}

// ── Main window ──────────────────────────────────────────────────────────────
function createMainWindow() {
  mainWin = new BrowserWindow({
    width: 320,
    height: 490,          // extra for title bar height
    resizable: false,
    maximizable: false,
    movable: true,
    title: 'Eye Reminder',
    icon: path.join(__dirname, 'icon.ico'),
    backgroundColor: '#0d1117',
    show: false,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      devTools: false,
    },
  })

  mainWin.setMenuBarVisibility(false)
  mainWin.loadFile('ui.html')

  mainWin.once('ready-to-show', () => mainWin.show())

  mainWin.on('close', (e) => {
    if (!app.isQuitting) {
      e.preventDefault()
      mainWin.hide()
    }
  })
}

// ── Overlay window ───────────────────────────────────────────────────────────
function showOverlay() {
  if (overlayWin && !overlayWin.isDestroyed()) return

  const { width } = screen.getPrimaryDisplay().workAreaSize
  const W = 300, H = 168

  overlayWin = new BrowserWindow({
    width: W,
    height: H,
    x: width - W - 20,
    y: 20,
    frame: false,
    transparent: true,
    alwaysOnTop: true,
    skipTaskbar: true,
    resizable: false,
    movable: false,
    focusable: true,
    backgroundColor: '#00000000',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  })

  overlayWin.setAlwaysOnTop(true, 'screen-saver')
  overlayWin.loadFile('overlay.html')

  overlayWin.on('closed', () => {
    overlayWin = null
    activeSeconds = 0   // reset timer after every break (whether completed or not)
  })
}

// ── Tray ─────────────────────────────────────────────────────────────────────
function createTray() {
  const iconPath = path.join(__dirname, 'icon.ico')
  tray = new Tray(iconPath)
  tray.setToolTip('Eye Reminder')

  const contextMenu = Menu.buildFromTemplate([
    {
      label: 'Open Eye Reminder',
      click: () => { mainWin.show(); mainWin.focus() },
    },
    {
      label: 'Test Overlay',
      click: () => showOverlay(),
    },
    {
      label: 'Reset Timer',
      click: () => { activeSeconds = 0 },
    },
    { type: 'separator' },
    {
      label: 'Quit',
      click: () => { app.isQuitting = true; app.quit() },
    },
  ])

  tray.setContextMenu(contextMenu)
  tray.on('double-click', () => { mainWin.show(); mainWin.focus() })
}

// ── Timer loop ────────────────────────────────────────────────────────────────
function startTimer() {
  timerHandle = setInterval(() => {
    try {
      const idle = powerMonitor.getSystemIdleTime()
      isPaused = idle > IDLE_THRESHOLD
      if (!isPaused) activeSeconds++
      if (activeSeconds >= WORK_SECONDS) {
        activeSeconds = 0
        showOverlay()
      }
    } catch (_) {}
  }, 1000)
}

// ── Auto-start ────────────────────────────────────────────────────────────────
function isStartupEnabled() {
  return app.getLoginItemSettings().openAtLogin
}
function setStartupEnabled(enabled) {
  app.setLoginItemSettings({ openAtLogin: !!enabled })
}

// ── IPC handlers ─────────────────────────────────────────────────────────────
ipcMain.handle('get-status', () => ({
  remaining_secs: Math.max(0, WORK_SECONDS - activeSeconds),
  total_secs:     WORK_SECONDS,
  paused:         isPaused,
  startup_enabled: isStartupEnabled(),
}))

ipcMain.handle('reset',       () => { activeSeconds = 0; return true })
ipcMain.handle('test-overlay',() => { showOverlay(); return true })
ipcMain.handle('set-startup', (_, enabled) => { setStartupEnabled(enabled); return true })
ipcMain.handle('hide-window', () => { mainWin?.hide(); return true })
ipcMain.handle('close-overlay', () => { overlayWin?.close(); return true })

// ── App lifecycle ─────────────────────────────────────────────────────────────
app.whenReady().then(() => {
  createMainWindow()
  createTray()
  startTimer()
})

app.on('window-all-closed', () => {
  // Keep alive via tray — don't quit
})

app.on('before-quit', () => {
  app.isQuitting = true
  clearInterval(timerHandle)
})
