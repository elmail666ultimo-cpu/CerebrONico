/**
 * CerebroNico IDE - Electron Main (v3.4 "EXE auto-suficiente")
 * Autor y propietario: Mario Nicolas Quintero
 * Copyright © 2026 Mario Nicolas Quintero. Todos los derechos reservados.
 * ============================================================
 * HISTORIAL DE CORRECCIONES
 *  v3.1 "Autoarranque Total": splash + polling + BAT oculto (pantalla negra).
 *  v3.3: página de error con reintento en vez de ventana oculta para siempre.
 *  v3.4 (ESTA VERSIÓN) — arregla el EXE empaquetado, que en dev funciona y
 *      empaquetado no reconocía los puertos:
 *   A) CRASH "SyntaxError: Unexpected identifier 'Electron'": el archivo que
 *      se empaquetó tenía la línea del console.log SIN las comillas invertidas
 *      (backticks) — típico cuando el código se reescribe desde PowerShell o
 *      desde un chat que se los come (el backtick es el carácter de escape de
 *      PowerShell). Este archivo vuelve a estar íntegro y verificado con
 *      `node --check`.
 *   B) findBatFile() ahora SOLO acepta un BAT que esté en la raíz del proyecto
 *      (a su lado debe haber package.json). El BAT copiado dentro de
 *      resources/ ya no secuestra el arranque: se ejecutaba en una carpeta
 *      sin package.json, fallaba y bloqueaba el fallback.
 *   C) forkFallbackServer() funciona de verdad con "asar": false:
 *      - serverPath y cwd son rutas REALES (antes apuntaban dentro de
 *        app.asar, donde un proceso ELECTRON_RUN_AS_NODE no puede leer ni
 *        poner cwd => el hijo moría al nacer y ningún puerto subía).
 *      - La salida del server se guarda en %userData%/logs/backend.log
 *        (antes stdio:'ignore' = proceso sordo y sin diagnóstico).
 *      - PROJECT_DIR = C:\Cerebronico (la MISMA raíz de datos del BAT, para
 *        que el EXE y el modo dev vean los mismos proyectos); si ese disco
 *        no es escribible, cae a userData.
 *   D) ensureOllama(): en modo empaquetado sin BAT nadie levantaba Ollama;
 *      ahora, si :11434 no escucha, se lanza "ollama serve" oculto (best
 *      effort; si Ollama no está instalado, la app arranca igual).
 *  NOTA: para que el backend empaquetado arranque, electron-builder debe
 *  EMPIR "asar": false y empaquetar node_modules + agent_bridge_5000.py +
 *  app/ (ver package.json → build). Los agentes Python del puente :5000
 *  deben quedar en resources/dist/ (extraResources "to": "dist/..."), que
 *  es donde server.ts los busca (cwd/../dist/CerebroNicoAgent.exe).
 */

const { app, BrowserWindow, shell } = require('electron');
const path = require('path');
const fs = require('fs');
const net = require('net');
const { spawn, execSync } = require('child_process');

const IDE_URL = 'http://127.0.0.1:3000';
const BOOT_TIMEOUT_MS = 6 * 60 * 1000; // 6 min: cubre npm install en PCs lentas

let mainWindow = null;
let splashWindow = null;
let startedBat = null;   // { pid } del BAT que arrancamos nosotros (para limpiar al salir)
let backendFork = null;  // fork de respaldo (modo instalado sin BAT)
let backendLogFile = null;

// ------------------------------------------------------------
// Utilidades
// ------------------------------------------------------------
function logLine(msg) {
  try {
    console.log(`[CerebroNico Electron] ${msg}`);
  } catch {}
}

async function isServerUp(url, timeoutMs = 2500) {
  try {
    const ctl = new AbortController();
    const t = setTimeout(() => ctl.abort(), timeoutMs);
    const res = await fetch(url, { signal: ctl.signal });
    clearTimeout(t);
    return res.ok || res.status < 500;
  } catch {
    return false;
  }
}

async function waitForServer(url, timeoutMs, onTick) {
  const start = Date.now();
  let tick = 0;
  while (Date.now() - start < timeoutMs) {
    if (await isServerUp(url)) return true;
    tick++;
    if (typeof onTick === 'function') onTick(Math.round((Date.now() - start) / 1000), tick);
    await new Promise((r) => setTimeout(r, 1000));
  }
  return false;
}

/** Comprueba si un puerto TCP local está escuchando (sin fetch, para Ollama). */
function isPortUp(port, timeoutMs = 1500) {
  return new Promise((resolve) => {
    const sock = new net.Socket();
    let done = false;
    const finish = (v) => { if (!done) { done = true; try { sock.destroy(); } catch {} resolve(v); } };
    sock.setTimeout(timeoutMs);
    sock.once('connect', () => finish(true));
    sock.once('timeout', () => finish(false));
    sock.once('error', () => finish(false));
    sock.connect(port, '127.0.0.1');
  });
}

/** v3.4 D) Si :11434 no escucha, lanza "ollama serve" oculto (mejor esfuerzo). */
async function ensureOllama() {
  if (await isPortUp(11434)) {
    logLine('Ollama ya escuchaba en :11434.');
    return;
  }
  try {
    const child = spawn('ollama', ['serve'], { windowsHide: true, stdio: 'ignore', detached: false });
    child.on('error', (e) => logLine(`No se pudo lanzar ollama serve (${e.message}). Instala Ollama si quieres inferencia local.`));
    logLine('ollama serve lanzado en segundo plano (:11434).');
  } catch (e) {
    logLine(`ensureOllama: ${e.message}`);
  }
}

/**
 * Busca iniciar_todo_windows.bat subiendo por los directorios padres.
 * v3.4 B) Solo vale un BAT que conviva con package.json (raíz real del
 * proyecto). El que electron-builder copia a resources/ NO: ejecutarlo ahí
 * hace cd a una carpeta sin proyecto, imprime su error y deja al EXE sin
 * :3000 ni fallback.
 */
function findBatFile() {
  const candidates = [];
  const roots = [];
  try { roots.push(path.dirname(app.getPath('exe'))); } catch {}
  try { roots.push(app.getAppPath()); } catch {}
  try { roots.push(__dirname); } catch {}
  for (const root of roots) {
    let dir = path.resolve(root);
    for (let i = 0; i < 5 && dir; i++) {
      candidates.push(path.join(dir, 'iniciar_todo_windows.bat'));
      const parent = path.dirname(dir);
      if (parent === dir) break;
      dir = parent;
    }
  }
  for (const c of candidates) {
    try {
      if (fs.existsSync(c) && fs.existsSync(path.join(path.dirname(c), 'package.json'))) return c;
    } catch {}
  }
  return null;
}

function killTree(pid) {
  if (!pid) return;
  try {
    if (process.platform === 'win32') {
      execSync(`taskkill /PID ${pid} /T /F`, { stdio: 'ignore' });
    } else {
      process.kill(-pid, 'SIGKILL');
    }
  } catch (e) {
    logLine(`killTree(${pid}): ${e.message}`);
  }
}

// ------------------------------------------------------------
// Splash: progreso visible en vez de pantalla negra
// ------------------------------------------------------------
const splashHtml = (status, seconds) => `<!DOCTYPE html>
<html><head><meta charset="utf-8">
<style>
  * { margin:0; padding:0; box-sizing:border-box; font-family:'Segoe UI',system-ui,sans-serif; }
  html,body { height:100%; background:#05070d; color:#e4e4e7; overflow:hidden; user-select:none; }
  .wrap { height:100%; display:flex; flex-direction:column; align-items:center; justify-content:center; padding:24px; text-align:center; }
  .logo { width:64px; height:64px; border-radius:16px; margin-bottom:16px;
          background:linear-gradient(135deg,#06b6d4,#3b82f6); display:flex; align-items:center; justify-content:center;
          font-size:30px; font-weight:800; color:#fff; box-shadow:0 8px 32px rgba(6,182,212,.35); }
  h1 { font-size:16px; font-weight:700; letter-spacing:.5px; margin-bottom:6px; }
  .bar { width:260px; height:5px; border-radius:99px; background:#131b2c; overflow:hidden; margin:16px 0 12px; }
  .bar > div { width:35%; height:100%; border-radius:99px; background:linear-gradient(90deg,#06b6d4,#3b82f6); animation:slide 1.4s ease-in-out infinite; }
  @keyframes slide { 0%{margin-left:-35%} 100%{margin-left:100%} }
  #status { font-size:11.5px; color:#22d3ee; min-height:16px; max-width:340px; line-height:1.5; }
  #secs { font-size:10px; color:#52525b; margin-top:8px; }
  .tip { position:fixed; bottom:14px; left:0; right:0; font-size:9.5px; color:#3f3f46; padding:0 20px; }
</style></head>
<body>
  <div class="wrap">
    <div class="logo">C</div>
    <h1>CerebroNico IDE</h1>
    <div class="bar"><div></div></div>
    <div id="status">${status || 'Iniciando…'}</div>
    <div id="secs">${seconds ? seconds + 's' : ''}</div>
    <div class="tip">El primer arranque instala dependencias e inicia Ollama; puede tardar unos minutos.</div>
  </div>
  <script>
    const { ipcRenderer } = require('electron');
    ipcRenderer.on('boot-status', (_e, status, secs) => {
      document.getElementById('status').textContent = status;
      document.getElementById('secs').textContent = secs ? secs + 's' : '';
    });
  </script>
</body></html>`;

function sendStatus(status, seconds) {
  logLine(status);
  try {
    if (splashWindow && !splashWindow.isDestroyed()) {
      splashWindow.webContents.send('boot-status', status, seconds || 0);
    }
  } catch {}
}

function createSplash() {
  splashWindow = new BrowserWindow({
    width: 420,
    height: 280,
    frame: false,
    resizable: false,
    movable: true,
    show: false,
    backgroundColor: '#05070d',
    webPreferences: { nodeIntegration: true, contextIsolation: false },
  });
  splashWindow.once('ready-to-show', () => splashWindow.show());
  splashWindow.on('closed', () => { splashWindow = null; });
  splashWindow.loadURL('data:text/html;charset=utf-8,' + encodeURIComponent(splashHtml('Preparando el entorno…', 0)));
}

// ------------------------------------------------------------
// Arranque del backend (BAT automático o fork de respaldo)
// ------------------------------------------------------------
function launchBat(batPath) {
  const batDir = path.dirname(batPath);
  sendStatus('Ejecutando iniciar_todo_windows.bat (oculto)…');
  const child = spawn('cmd.exe', ['/c', batPath], {
    cwd: batDir,
    windowsHide: true,
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  startedBat = { pid: child.pid };
  logLine(`BAT lanzado en modo oculto (pid ${child.pid}): ${batPath}`);
  child.stdout?.on('data', (d) => logLine(`[bat] ${String(d).trim()}`));
  child.stderr?.on('data', (d) => logLine(`[bat:err] ${String(d).trim()}`));
  child.on('exit', (code) => logLine(`BAT terminó con código ${code}`));
}

/** v3.4 C) Raíz de datos del EXE: la misma del BAT (C:\Cerebronico) si es escribible. */
function resolveDatosUsuario() {
  const raizBat = 'C:\\Cerebronico';
  try {
    fs.mkdirSync(raizBat, { recursive: true });
    fs.accessSync(raizBat, fs.constants.W_OK);
    return raizBat;
  } catch {}
  const alt = path.join(app.getPath('userData'), 'CerebroNico');
  try { fs.mkdirSync(alt, { recursive: true }); } catch {}
  return alt;
}

function forkFallbackServer(projectDir) {
  const serverPath = path.join(projectDir, 'dist', 'server.mjs');
  if (!fs.existsSync(serverPath)) return false;
  sendStatus('Arrancando server compilado (dist/server.mjs)…');
  // USERDATA v1 (recap) + v3.4: en una instalación por-máquina (C:\Program Files)
  // cwd puede ser solo-lectura: los logs y .proyectos del server fallaban.
  // El backend honra PROJECT_DIR; el cwd se queda en projectDir porque desde
  // ahí server.mjs sirve dist/ y busca agent_bridge_5000.py y ../dist/*.exe.
  // IMPORTANTE: esto exige "asar": false en build (rutas reales, no app.asar).
  const datosUsuario = resolveDatosUsuario();
  let logStream = 'ignore';
  try {
    const logDir = path.join(app.getPath('userData'), 'logs');
    fs.mkdirSync(logDir, { recursive: true });
    backendLogFile = path.join(logDir, 'backend.log');
    logStream = fs.createWriteStream(backendLogFile, { flags: 'a' });
  } catch {}
  backendFork = spawn(process.execPath, [serverPath], {
    cwd: projectDir,
    env: {
      ...process.env,
      PORT: '3000',
      HOST: '127.0.0.1',
      NODE_ENV: 'production', // EXE v1: sin esto caería en la rama dev (vite) que el instalador no trae
      ELECTRON_RUN_AS_NODE: '1',
      PROJECT_DIR: datosUsuario,
    },
    stdio: ['ignore', logStream, logStream],
    detached: false,
    windowsHide: true,
  });
  backendFork.on('exit', (code, sig) => {
    logLine(`Server empaquetado terminó (code=${code} sig=${sig}).${backendLogFile ? ' Revisa: ' + backendLogFile : ''}`);
  });
  backendFork.on('error', (e) => logLine(`Error de spawn del server: ${e.message}`));
  logLine(`Fork de respaldo: ${serverPath} (pid ${backendFork.pid})`);
  return true;
}

// ------------------------------------------------------------
// Ventana principal
// ------------------------------------------------------------
/** Página de error con reintento automático (nunca una ventana muerta en silencio). */
function showConnectionError() {
  if (!mainWindow || mainWindow.isDestroyed()) return;
  const errorHtml = `<!DOCTYPE html>
<html lang="es"><head><meta charset="utf-8">
<style>
  * { margin:0; padding:0; box-sizing:border-box; font-family:'Segoe UI',system-ui,sans-serif; }
  html,body { height:100%; background:#05070d; color:#e4e4e7; display:flex; align-items:center; justify-content:center; }
  .box { text-align:center; max-width:460px; padding:32px; }
  .logo { width:64px; height:64px; border-radius:16px; margin:0 auto 16px; background:linear-gradient(135deg,#06b6d4,#3b82f6);
          display:flex; align-items:center; justify-content:center; font-size:30px; font-weight:800; color:#fff; }
  h1 { font-size:18px; margin-bottom:10px; }
  p { font-size:12.5px; color:#a1a1aa; line-height:1.6; margin-bottom:20px; }
  button { padding:10px 26px; border-radius:10px; border:0; cursor:pointer; font-size:13px; font-weight:600;
           background:linear-gradient(135deg,#06b6d4,#3b82f6); color:#fff; }
  button:hover { filter:brightness(1.1); }
  #retryIn { font-size:11px; color:#52525b; margin-top:14px; }
</style></head>
<body><div class="box">
  <div class="logo">C</div>
  <h1>No se pudo conectar con CerebroNico</h1>
  <p>El server local en <b>127.0.0.1:3000</b> no respondió. Reintento automático cada 10 segundos; si persiste, cierra y abre de nuevo la app (el primer arranque puede tardar varios minutos instalando dependencias).</p>
  <button onclick="location.href='${IDE_URL}'">Reintentar ahora</button>
  <div id="retryIn"></div>
</div>
<script>
  let s = 10;
  const el = document.getElementById('retryIn');
  setInterval(() => {
    s--;
    if (s <= 0) { location.href = '${IDE_URL}'; }
    else { el.textContent = 'Reintentando en ' + s + 's…'; }
  }, 1000);
</script>
</body></html>`;
  try {
    try { splashWindow?.close(); } catch {}
    mainWindow.loadURL('data:text/html;charset=utf-8,' + encodeURIComponent(errorHtml));
    if (mainWindow.isMinimized()) mainWindow.restore();
    mainWindow.show();
  } catch (e) {
    logLine(`showConnectionError: ${e.message}`);
  }
}

function createMainWindow() {
  mainWindow = new BrowserWindow({
    width: 1440,
    height: 860,
    show: false,
    backgroundColor: '#05070d',
    title: 'CerebroNico IDE',
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      sandbox: false,
    },
  });

  let loadAttempts = 0;
  const tryLoad = async () => {
    loadAttempts++;
    try {
      await mainWindow.loadURL(IDE_URL);
    } catch (e) {
      if (loadAttempts <= 10 && (await isServerUp(IDE_URL, 1500) || loadAttempts <= 3)) {
        sendStatus('Conectando con la interfaz…', 0);
        setTimeout(tryLoad, 2000);
      } else {
        // 🔧 CORRECCIÓN v3.3: antes la ventana quedaba oculta para siempre
        // (show:false + ready-to-show que nunca llegaba). Ahora se muestra una
        // página de error con botón Reintentar en vez de un silencio eterno.
        sendStatus('No se pudo conectar al server local.', 0);
        showConnectionError();
      }
    }
  };

  mainWindow.once('ready-to-show', () => {
    try { splashWindow?.close(); } catch {}
    mainWindow.show();
  });

  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    if (String(url).startsWith('http')) shell.openExternal(url);
    return { action: 'deny' };
  });

  mainWindow.on('closed', () => { mainWindow = null; });
  tryLoad();
}

// ------------------------------------------------------------
// Ciclo de vida
// ------------------------------------------------------------
const gotLock = app.requestSingleInstanceLock();
if (!gotLock) {
  app.quit();
} else {
  app.on('second-instance', () => {
    if (mainWindow) {
      if (mainWindow.isMinimized()) mainWindow.restore();
      mainWindow.focus();
    }
  });

  app.whenReady().then(async () => {
    createSplash();

    let up = await isServerUp(IDE_URL);
    if (up) {
      sendStatus('Server ya activo en :3000. Conectando…');
    } else {
      const batPath = findBatFile();
      if (batPath) {
        launchBat(batPath);
      } else {
        logLine('iniciar_todo_windows.bat no encontrado (o sin package.json al lado); intentando fork de respaldo.');
        // v3.4 D) En modo empaquetado nadie levanta Ollama: lo intentamos aquí.
        void ensureOllama();
        const roots = [];
        try { roots.push(app.getAppPath()); } catch {}
        try { roots.push(path.resolve(__dirname)); } catch {}
        let forked = false;
        for (const start of roots) {
          let dir = start;
          for (let i = 0; i < 4 && !forked; i++) {
            forked = forkFallbackServer(dir);
            if (!forked) {
              const parent = path.dirname(dir);
              if (parent === dir) break;
              dir = parent;
            }
          }
          if (forked) break;
        }
        if (!forked) {
          sendStatus('No encontré el server ni el BAT. Abre iniciar_todo_windows.bat primero.', 0);
          await new Promise((r) => setTimeout(r, 6000));
          try { app.quit(); } catch {}
          return;
        }
      }

      const t0 = Date.now();
      sendStatus('Esperando al server en :3000 (esto es normal)…');
      up = await waitForServer(IDE_URL, BOOT_TIMEOUT_MS, (secs) => {
        sendStatus('Arrancando CerebroNico (Ollama + server)…', secs);
      });
      if (!up) {
        // 🔧 CORRECCIÓN v3.3: antes el timeout dejaba la ventana oculta para
        // siempre. createMainWindow -> tryLoad agota sus reintentos y termina
        // mostrando la página de error con botón Reintentar.
        sendStatus('El server no respondió a tiempo. Revisa la consola del BAT o backend.log.', Math.round((Date.now() - t0) / 1000));
      }
    }

    createMainWindow();
  });

  app.on('window-all-closed', () => {
    try { splashWindow?.close(); } catch {}
    app.quit();
  });

  app.on('before-quit', () => {
    // Limpiamos SOLO lo que este EXE arrancó (no tocamos Ollama ni sesiones del usuario)
    if (startedBat?.pid) {
      logLine('Cerrando server arrancado por el EXE (árbol del BAT)…');
      killTree(startedBat.pid);
      startedBat = null;
    }
    if (backendFork?.pid) {
      try { backendFork.kill(); } catch {}
      backendFork = null;
    }
  });
}
