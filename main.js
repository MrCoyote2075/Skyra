const { app, BrowserWindow, ipcMain, BrowserView, dialog } = require('electron');

let win;
let view;
let examStarted = false;
let allowClose = false;
let isExiting = false;

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
      (input.control && ['w', 't', 'c', 'v'].includes(input.key.toLowerCase())) ||
      (input.alt && input.key === 'Tab') ||
      (input.alt && input.key === 'F4')
    ) {
      event.preventDefault();
    }
  });

  // ⛔ Prevent closing unless allowed
  // win.on('close', (e) => {
  //   if (examStarted && !allowClose) {
  //     e.preventDefault();
  //     dialog.showErrorBox("Blocked", "You cannot close the exam!");
  //   }
  // });

  // 🧠 SINGLE blur handler (IMPORTANT)
  win.on('blur', () => {
    if (examStarted && !isExiting) {

      console.log("User tried to switch!");

      setTimeout(() => {
        if (!isExiting) {
          win.show();
          win.focus();
          win.moveTop();
          win.setAlwaysOnTop(true, "screen-saver");
        }
      }, 50);
    }
  });

  win.on('close', (e) => {
    if (examStarted && !allowClose) {
      e.preventDefault();
    }
  });
}

app.whenReady().then(createWindow);



/* =========================
   🎯 START EXAM
========================= */


function decode(encodedStr) {
    if (!encodedStr.startsWith("DP-")) {
        throw new Error("Invalid encoded format");
    }

    const encoded = encodedStr.slice(3);

    const charset = "0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz";
    const shifts = [-1, 2, -4, 2, -2, 0, -2, 2];
    const n = charset.length;

    let original = "";

    for (let i = 0; i < encoded.length; i++) {
        let index = charset.indexOf(encoded[i]);

        if (index === -1) {
            throw new Error("Invalid character in encoded string");
        }

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

  win.setAlwaysOnTop(true, "screen-saver");

  // const url = "https://shorturl.at/" + code;

  let decoded;

    try {
      console.log("CODE : " +  code );
      decoded = decode(code);
      console.log("De-CODE : " + decoded );
    } catch (error) {
      dialog.showErrorBox("Invalid Code", error.message);
      return;
    }

    const url = "https://tinyurl.com/" + decoded;

  // const url = "https://tinyurl.com/" + decoded;

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
    width: width,
    height: height - HEADER_HEIGHT
  });

  view.setAutoResize({ width: true, height: true });

  view.webContents.loadURL(url);

  // 🔥 Allow login popup
  view.webContents.setWindowOpenHandler(() => {
    return {
      action: 'allow',
      overrideBrowserWindowOptions: {
        fullscreen: true,
        kiosk: true,
        webPreferences: {
          contextIsolation: true,
          nodeIntegration: false
        }
      }
    };
  });

  // 🚫 Restrict navigation
  view.webContents.on('will-navigate', (e, navUrl) => {
    if (
      !navUrl.startsWith("https://shorturl.at/") &&
      !navUrl.includes("hackerearth.com") &&
      !navUrl.includes("https://tinyurl.com") &&
      !navUrl.includes("google.com")
    ) {
      e.preventDefault();
    }
  });
//https://tinyurl.com/ybxqqyn8
  // 🚫 Disable right click
  view.webContents.on('context-menu', (e) => e.preventDefault());

  // 🚫 Block DevTools
  view.webContents.on('devtools-opened', () => {
    view.webContents.closeDevTools();
  });

  // 🚫 Block shortcuts inside view
  view.webContents.on('before-input-event', (event, input) => {
    if (
      input.key === 'F12' ||
      input.meta ||
      (input.control && ['w', 't', 'c', 'v'].includes(input.key.toLowerCase())) ||
      (input.alt && input.key === 'Tab') ||
      (input.alt && input.key === 'F4')
    ) {
      event.preventDefault();
    }
  });

  // 🎯 TIMER (30 min)
  const examDuration = 30 * 60 * 1000;

  setTimeout(() => {
    if (!isExiting) {
      dialog.showMessageBox(win, {
        type: "info",
        title: "Time Up",
        message: "Exam time is over. Please submit your test.",
        buttons: ["OK"],
        noLink: true
      });

      view.webContents.executeJavaScript(`
        alert("Time is up! Submit your exam now.");
      `);
    }
  }, examDuration);
});



/* =========================
   🔄 REFRESH EXAM
========================= */
ipcMain.on('refresh-exam', () => {
  if (view) {
    view.webContents.reload();
  }
});



/* =========================
   ❌ EXIT EXAM
========================= */
ipcMain.on('exit-exam', () => {

  // 🔥 allow closing
  allowClose = true;
  isExiting = true;
  examStarted = false;

  // 🔓 remove always on top
  win.setAlwaysOnTop(false);

  // 🚀 close app instantly
  app.quit();
});
