const { app, BrowserWindow, ipcMain } = require('electron')
const path = require('path')
const fs = require('fs')

const isDev = process.env.NODE_ENV !== 'production'

const DEFAULT_DATA = {
  categories: [
    { id: '1', name: '政治' },
    { id: '2', name: '经济' },
    { id: '3', name: '哲学与思想' },
    { id: '4', name: '历史' },
    { id: '5', name: 'AI 与科技' },
    { id: '6', name: '其他' },
  ],
  entries: [],
}

function getDataFilePath() {
  return path.join(app.getPath('userData'), 'data.json')
}

function normalizeData(data) {
  return {
    ...data,
    entries: (data.entries || []).map((e) => ({
      ...e,
      tags: e.tags || [],
      children: (e.children || []).map((c) => ({ ...c, tags: c.tags || [] })),
    })),
  }
}

function readData() {
  const filePath = getDataFilePath()
  if (!fs.existsSync(filePath)) {
    // 迁移旧的 categories.json
    const oldPath = path.join(app.getPath('userData'), 'categories.json')
    if (fs.existsSync(oldPath)) {
      try {
        const categories = JSON.parse(fs.readFileSync(oldPath, 'utf-8'))
        if (Array.isArray(categories)) {
          const data = normalizeData({ categories, entries: [] })
          fs.writeFileSync(filePath, JSON.stringify(data, null, 2), 'utf-8')
          return data
        }
      } catch {}
    }
    fs.writeFileSync(filePath, JSON.stringify(DEFAULT_DATA, null, 2), 'utf-8')
    return DEFAULT_DATA
  }
  try {
    return normalizeData(JSON.parse(fs.readFileSync(filePath, 'utf-8')))
  } catch {
    return DEFAULT_DATA
  }
}

function writeData(data) {
  fs.writeFileSync(getDataFilePath(), JSON.stringify(data, null, 2), 'utf-8')
}

function createWindow() {
  const win = new BrowserWindow({
    width: 1200,
    height: 800,
    minWidth: 800,
    minHeight: 600,
    title: 'Kn0wledge',
    titleBarStyle: 'hiddenInset',
    backgroundColor: '#ffffff',
    icon: path.join(__dirname, '../assets/icon.icns'),
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      preload: path.join(__dirname, 'preload.js'),
    },
  })

  if (isDev) {
    win.loadURL('http://localhost:5173')
  } else {
    win.loadFile(path.join(__dirname, '../dist/index.html'))
  }
}

ipcMain.handle('get-data', () => readData())
ipcMain.handle('save-data', (_, data) => {
  writeData(data)
  return true
})

app.whenReady().then(() => {
  createWindow()
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})
