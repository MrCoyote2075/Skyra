const { app, BrowserWindow, ipcMain, BrowserView, dialog } = require('electron');

let win;
let view;
let examStarted = false;
let allowClose = false;
let isExiting = false;

let violations = 0;
let lastViolationTime = 0;
let blurStartTime = 0;
let isBlurred = false;

function createWindow() {
  win = new BrowserWindow({
    fullscreen: true,
    kiosk: true,
    webPreferences: {
      preload: __dirname + '/preload.js',
      contextIsolation: true,
      nodeIntegration: false
    }
  });

  win.loadFile('index.html');

  // 🚫 Block DevTools
  win.webContents.on('devtools-opened', () => {
    win.webContents.closeDevTools();
  });

  // 🚫 Block shortcuts
  win.webContents.on('before-input-event', (event, input) => {
    if (
      input.key === 'F12' ||
      input.meta ||
      (input.control && ['w','t','c','v'].includes(input.key.toLowerCase())) ||
      (input.alt && input.key === 'Tab') ||
      (input.alt && input.key === 'F4')
    ) {
      event.preventDefault();
    }
  });

  // 🧠 BLUR EVENT - Window loses focus
  win.on('blur', () => {
    if (!examStarted || isExiting) return;
    
    isBlurred = true;
    blurStartTime = Date.now();
    console.log("📵 Window lost focus - blur event triggered");
  });

  // 🎯 FOCUS EVENT - Window regains focus
  win.on('focus', () => {
    if (!examStarted || isExiting || !isBlurred) return;

    const blurDuration = Date.now() - blurStartTime;
    console.log(`📱 Window regained focus - blur duration: ${blurDuration}ms`);

    isBlurred = false;

    // ✅ TAB SWITCH (< 200ms) = Quick return = NO violation
    if (blurDuration < 200) {
      console.log("✅ Quick tab switch detected - NO violation");
      win.show();
      win.focus();
      win.moveTop();
      win.setAlwaysOnTop(true, "screen-saver");
      return; // NO violation
    }

    // 🖥️ DESKTOP SWITCH (> 200ms) = Longer blur = COUNT violation
    console.log("🖥️ Desktop switch detected - COUNTING violation");
    registerViolation("Desktop switch detected");
    
    // Refocus immediately
    setTimeout(() => {
      if (!isExiting) {
        win.show();
        win.focus();
        win.moveTop();
        win.setAlwaysOnTop(true, "screen-saver");
      }
    }, 100);
  });

  // 🔥 BACKGROUND CHECK (Catch switches not captured by focus event)
  setInterval(() => {
    if (!examStarted || isExiting) return;

    if (isBlurred && !win.isFocused()) {
      const blurDuration = Date.now() - blurStartTime;
      
      // If blurred for > 500ms and still not focused → likely a desktop switch
      if (blurDuration > 500) {
        console.log("🖥️ Long blur detected - counting violation");
        registerViolation("Desktop switch (interval check)");
        
        win.show();
        win.focus();
        win.moveTop();
        win.setAlwaysOnTop(true, "screen-saver");
        
        isBlurred = false;
      }
    }
  }, 500);

  // ⛔ Prevent close
  win.on('close', (e) => {
    if (examStarted && !allowClose) {
      e.preventDefault();
    }
  });
}

app.whenReady().then(createWindow);

// 🔥 VIOLATION FUNCTION
function registerViolation(reason) {
  // Prevent spam (only count once per 2 seconds)
  if (Date.now() - lastViolationTime < 2000) {
    console.log("⏱️ Violation cooldown - ignoring");
    return;
  }

  lastViolationTime = Date.now();
  violations++;

  console.log(`⚠️ ${reason} → Violation ${violations}/3`);

  // ❌ 3 violations = AUTO EXIT
  if (violations >= 3) {
    console.log("❌ 3 violations reached → CLOSING APP");
    
    isExiting = true;
    allowClose = true;
    examStarted = false;
    win.setAlwaysOnTop(false);
    
    // dialog.showMessageBox(win, {
    //   type: "error",
    //   title: "Exam Terminated",
    //   message: "Too many violations detected. Exam has been terminated.",
    //   buttons: ["OK"]
    // }).then(() => {
      app.quit();
    // });
    
    return;
  }

  // ⚠️ Show warning for violations 1 & 2
  dialog.showMessageBox(win, {
    type: "warning",
    title: "⚠️ Violation Warning",
    message: `Do not switch desktops!\n\nViolation ${violations}/3\n\nOne more violation will close this exam.`,
    buttons: ["OK"],
    noLink: true
  });
}

/* =========================
   🎯 START EXAM
========================= */

function decode(encodedStr) {
  if (!encodedStr.startsWith("DP-")) {
    throw new Error("Invalid encoded format");
  }

  const encoded = encodedStr.slice(3);

  const charset = "0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz";
  const shifts = [-1, 2, -4, 2, -2, 0, -2, 2, -7, 4];
  const n = charset.length;

  let original = "" ;  

  for (let i = 0; i < encoded.length; i++) {
    let index = charset.indexOf(encoded[i]);

    if (index === -1) throw new Error("Invalid character");

    let shift = shifts[i % shifts.length];
    let originalIndex = (index - shift) % n;

    if (originalIndex < 0) originalIndex += n;

    original += charset[originalIndex];
  }

  return original;
}

ipcMain.on('start-exam', (event, code) => {

  if (!code) return;

  examStarted = true;
  allowClose = false;
  isExiting = false;
  violations = 0;
  isBlurred = false;

  win.setAlwaysOnTop(true, "screen-saver");

  let decoded;

  try {
    decoded = decode(code);
  } catch (error) {
    dialog.showErrorBox("Invalid Code", error.message);
    return;
  }

  const url = "https://is.gd/" + decoded;

  view = new BrowserView({
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false
    }
  });

  win.setBrowserView(view);

  const [width, height] = win.getSize();
  const HEADER_HEIGHT = 60;

  view.setBounds({
    x: 0,
    y: HEADER_HEIGHT,
    width,
    height: height - HEADER_HEIGHT
  });

  view.setAutoResize({ width: true, height: true });

  view.webContents.loadURL(url);

  view.webContents.setWindowOpenHandler(() => ({
    action: 'allow',
    overrideBrowserWindowOptions: {
      fullscreen: true,
      kiosk: true,
      webPreferences: {
        contextIsolation: true,
        nodeIntegration: false
      }
    }
  }));

  view.webContents.on('will-navigate', (e, navUrl) => {
    if (
      !navUrl.includes("hackerearth.com") &&
      !navUrl.includes("is.gd") &&
      !navUrl.includes("tinyurl.com") &&
      !navUrl.includes("google.com")
    ) {
      e.preventDefault();
    }
  });

  view.webContents.on('context-menu', (e) => e.preventDefault());

  view.webContents.on('devtools-opened', () => {
    view.webContents.closeDevTools();
  });

  view.webContents.on('before-input-event', (event, input) => {
    if (
      input.key === 'F12' ||
      input.meta ||
      (input.control && ['w','t','c','v'].includes(input.key.toLowerCase())) ||
      (input.alt && input.key === 'Tab') ||
      (input.alt && input.key === 'F4')
    ) {
      event.preventDefault();
    }
  });

  // ⏱️ Timer (30 minutes)
  setTimeout(() => {
    if (!isExiting) {
      dialog.showMessageBox(win, {
        type: "info",
        message: "Time is up!",
        buttons: ["OK"]
      });
    }
  }, 30 * 60 * 1000);
});

/* =========================
   🔄 REFRESH
========================= */
ipcMain.on('refresh-exam', () => {
  if (view) view.webContents.reload();
});

/* =========================
   ❌ EXIT
========================= */
ipcMain.on('exit-exam', () => {
  allowClose = true;
  isExiting = true;
  examStarted = false;

  win.setAlwaysOnTop(false);

  app.quit();
});