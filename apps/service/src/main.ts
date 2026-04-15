/**
 * LinX Service - Main Entry Point
 *
 * Unified service that includes:
 * - xpod (Solid Pod server)
 * - Web Server (LinX UI)
 * - System Tray
 */
import { app, BrowserWindow, shell } from 'electron'
import { getXpodModule } from './lib/xpod'
import { getWebServerModule } from './lib/web-server'
import { getRuntimeThreadsModule } from './lib/runtime-threads'
import { getTrayModule } from './lib/tray'

// Prevent multiple instances
const gotTheLock = app.requestSingleInstanceLock()
if (!gotTheLock) {
  console.log('[LinX] Another instance is already running')
  app.quit()
}

// Handle second instance
app.on('second-instance', () => {
  // Open the web UI when user tries to start another instance
  const webUrl = getWebServerModule().getUrl()
  shell.openExternal(webUrl)
})

// Hide dock icon on macOS (we're a menu bar app)
if (process.platform === 'darwin') {
  app.dock?.hide()
}

/**
 * Run first-time setup wizard
 */
async function runSetup(): Promise<void> {
  console.log('[LinX] Running first-time setup...')

  // Start web server first so we can load the setup page
  try {
    await getWebServerModule().start()
    console.log('[LinX] Web server started for setup')
  } catch (error) {
    console.error('[LinX] Failed to start web server:', error)
    throw error
  }

  const webUrl = getWebServerModule().getUrl()

  // Create a window for setup
  const setupWindow = new BrowserWindow({
    width: 520,
    height: 680,
    resizable: false,
    frame: true,
    titleBarStyle: 'hiddenInset',
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
    },
  })

  // Load setup page from web app
  setupWindow.loadURL(`${webUrl}/setup`)

  // Wait for setup to complete via IPC or API polling
  await waitForSetupComplete()

  // Close setup window
  setupWindow.close()

  console.log('[LinX] Setup completed')
}

/**
 * Poll for setup completion
 */
async function waitForSetupComplete(): Promise<void> {
  const webServer = getWebServerModule()

  // Poll every 500ms until setup is completed
  return new Promise((resolve) => {
    const check = () => {
      if (webServer.isSetupCompleted()) {
        resolve()
      } else {
        setTimeout(check, 500)
      }
    }
    check()
  })
}

/**
 * Start all services
 */
async function startServices(isAfterSetup = false): Promise<void> {
  console.log('[LinX] Starting services...')

  // Start xpod
  try {
    await getXpodModule().start()
    console.log('[LinX] xpod started')
  } catch (error) {
    console.error('[LinX] Failed to start xpod:', error)
  }

  // Start web server (skip if already started during setup)
  if (!isAfterSetup) {
    try {
      await getWebServerModule().start()
      console.log('[LinX] Web server started')
    } catch (error) {
      console.error('[LinX] Failed to start web server:', error)
    }
  }

  // Create system tray
  getTrayModule().create()
  console.log('[LinX] System tray created')

  // Update tray menu with current status
  getTrayModule().updateMenu()
}

/**
 * Stop all services
 */
async function stopServices(): Promise<void> {
  console.log('[LinX] Stopping services...')

  getTrayModule().destroy()
  await getRuntimeThreadsModule().stopAllSessions()
  await getWebServerModule().stop()
  await getXpodModule().stop()

  console.log('[LinX] All services stopped')
}

/**
 * Main application entry
 */
async function main(): Promise<void> {
  console.log('[LinX] Starting LinX Service...')

  // Check if setup is needed
  const webServer = getWebServerModule()
  const needsSetup = !webServer.isSetupCompleted()
  if (needsSetup) {
    await runSetup()
  }

  // Start all services (skip web server if already started during setup)
  await startServices(needsSetup)

  // Open web UI on first launch
  const webUrl = getWebServerModule().getUrl()
  shell.openExternal(webUrl)

  console.log('[LinX] LinX Service is running')
  console.log(`[LinX] Web UI: ${webUrl}`)
}

// App lifecycle
app.whenReady().then(main)

app.on('before-quit', async () => {
  await stopServices()
})

// Keep the app running (no windows needed)
app.on('window-all-closed', () => {
  // Don't quit when all windows are closed - we're a tray app
})

// Handle activate (macOS)
app.on('activate', () => {
  // Open web UI when clicking dock icon
  const webUrl = getWebServerModule().getUrl()
  shell.openExternal(webUrl)
})
