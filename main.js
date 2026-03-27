// const { app, BrowserWindow, ipcMain, BrowserView, dialog } = require('electron');

// let win;
// let view;
// let examStarted = false;
// let allowClose = false;
// let isExiting = false;

// function createWindow() {
//   win = new BrowserWindow({
//     fullscreen: true,
//     kiosk: true,
//     webPreferences: {
//       preload: __dirname + '/preload.js',
//       contextIsolation: true,
//       nodeIntegration: false
//     }
//   });

//   win.loadFile('index.html');

//   // 🚫 Block DevTools
//   win.webContents.on('devtools-opened', () => {
//     win.webContents.closeDevTools();
//   });

//   // 🚫 Block shortcuts
//   win.webContents.on('before-input-event', (event, input) => {
//     if (
//       input.key === 'F12' ||
//       input.meta ||
//       (input.control && ['w', 't', 'c', 'v'].includes(input.key.toLowerCase())) ||
//       (input.alt && input.key === 'Tab') ||
//       (input.alt && input.key === 'F4')
//     ) {
//       event.preventDefault();
//     }
//   });

//   // ⛔ Prevent closing unless allowed
//   // win.on('close', (e) => {
//   //   if (examStarted && !allowClose) {
//   //     e.preventDefault();
//   //     dialog.showErrorBox("Blocked", "You cannot close the exam!");
//   //   }
//   // });

//   // 🧠 SINGLE blur handler (IMPORTANT)
//   win.on('blur', () => {
//     if (examStarted && !isExiting) {

//       console.log("User tried to switch!");

//       setTimeout(() => {
//         if (!isExiting) {
//           win.show();
//           win.focus();
//           win.moveTop();
//           win.setAlwaysOnTop(true, "screen-saver");
//         }
//       }, 50);
//     }
//   });

//   win.on('close', (e) => {
//     if (examStarted && !allowClose) {
//       e.preventDefault();
//     }
//   });
// }

// app.whenReady().then(createWindow);



// /* =========================
//    🎯 START EXAM
// ========================= */


// function decode(encodedStr) {
//     if (!encodedStr.startsWith("DP-")) {
//         throw new Error("Invalid encoded format");
//     }

//     const encoded = encodedStr.slice(3);

//     const charset = "0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz";
//     const shifts = [-1, 2, -4, 2, -2, 0, -2, 2, -7 , 4 ];
//     const n = charset.length;

//     let original = "";

//     for (let i = 0; i < encoded.length; i++) {
//         let index = charset.indexOf(encoded[i]);

//         if (index === -1) {
//             throw new Error("Invalid character in encoded string");
//         }

//         let shift = shifts[i % shifts.length];
//         let originalIndex = (index - shift) % n;

//         if (originalIndex < 0) originalIndex += n;

//         original += charset[originalIndex];
//     }

//     return original;
// }

// ipcMain.on('start-exam', (event, code) => {

//   if (!code) return;

//   examStarted = true;
//   allowClose = false;
//   isExiting = false;

//   win.setAlwaysOnTop(true, "screen-saver");

//   // const url = "https://shorturl.at/" + code;

//   let decoded;

//     try {
//       console.log("CODE : " +  code );
//       decoded = decode(code);
//       console.log("De-CODE : " + decoded );
//     } catch (error) {
//       dialog.showErrorBox("Invalid Code", error.message);
//       return;
//     }

//     const url = "https://is.gd/" + decoded;

//   // const url = "https://tinyurl.com/" + decoded;

//   view = new BrowserView({
//     webPreferences: {
//       contextIsolation: true,
//       nodeIntegration: false
//     }
//   });

//   win.setBrowserView(view);

//   const [width, height] = win.getSize();
//   const HEADER_HEIGHT = 60;

//   view.setBounds({
//     x: 0,
//     y: HEADER_HEIGHT,
//     width: width,
//     height: height - HEADER_HEIGHT
//   });

//   view.setAutoResize({ width: true, height: true });

//   view.webContents.loadURL(url);

//   // 🔥 Allow login popup
//   view.webContents.setWindowOpenHandler(() => {
//     return {
//       action: 'allow',
//       overrideBrowserWindowOptions: {
//         fullscreen: true,
//         kiosk: true,
//         webPreferences: {
//           contextIsolation: true,
//           nodeIntegration: false
//         }
//       }
//     };
//   });

//   // 🚫 Restrict navigation
//   view.webContents.on('will-navigate', (e, navUrl) => {
//     if (
//       !navUrl.startsWith("https://shorturl.at/") &&
//       !navUrl.includes("hackerearth.com") &&
//       !navUrl.includes("https://is.gd/") &&
//       !navUrl.includes("https://tinyurl.com") &&
//       !navUrl.includes("google.com")
//     ) {
//       e.preventDefault();
//     }
//   });
// //https://tinyurl.com/ybxqqyn8
//   // 🚫 Disable right click
//   view.webContents.on('context-menu', (e) => e.preventDefault());

//   // 🚫 Block DevTools
//   view.webContents.on('devtools-opened', () => {
//     view.webContents.closeDevTools();
//   });

//   // 🚫 Block shortcuts inside view
//   view.webContents.on('before-input-event', (event, input) => {
//     if (
//       input.key === 'F12' ||
//       input.meta ||
//       (input.control && ['w', 't', 'c', 'v'].includes(input.key.toLowerCase())) ||
//       (input.alt && input.key === 'Tab') ||
//       (input.alt && input.key === 'F4')
//     ) {
//       event.preventDefault();
//     }
//   });

//   // 🎯 TIMER (30 min)
//   const examDuration = 30 * 60 * 1000;

//   setTimeout(() => {
//     if (!isExiting) {
//       dialog.showMessageBox(win, {
//         type: "info",
//         title: "Time Up",
//         message: "Exam time is over. Please submit your test.",
//         buttons: ["OK"],
//         noLink: true
//       });

//       view.webContents.executeJavaScript(`
//         alert("Time is up! Submit your exam now.");
//       `);
//     }
//   }, examDuration);
// });



// /* =========================
//    🔄 REFRESH EXAM
// ========================= */
// ipcMain.on('refresh-exam', () => {
//   if (view) {
//     view.webContents.reload();
//   }
// });



// /* =========================
//    ❌ EXIT EXAM
// ========================= */
// ipcMain.on('exit-exam', () => {

//   // 🔥 allow closing
//   allowClose = true;
//   isExiting = true;
//   examStarted = false;

//   // 🔓 remove always on top
//   win.setAlwaysOnTop(false);

//   // 🚀 close app instantly
//   app.quit();
// });
// =========================================================================
// =========================================================================
// =========================================================================
// =========================================================================


// const { app, BrowserWindow, ipcMain, BrowserView, dialog } = require('electron');

// let win;
// let view;
// let examStarted = false;
// let allowClose = false;
// let isExiting = false;

// function createWindow() {
//   win = new BrowserWindow({
//     fullscreen: true,
//     kiosk: true,
//     webPreferences: {
//       preload: __dirname + '/preload.js',
//       contextIsolation: true,
//       nodeIntegration: false
//     }
//   });

//   win.loadFile('index.html');

//   // 🚫 Block DevTools
//   win.webContents.on('devtools-opened', () => {
//     win.webContents.closeDevTools();
//   });

//   // 🚫 Block shortcuts
//   win.webContents.on('before-input-event', (event, input) => {
//     if (
//       input.key === 'F12' ||
//       input.meta ||
//       (input.control && ['w', 't', 'c', 'v'].includes(input.key.toLowerCase())) ||
//       (input.alt && input.key === 'Tab') ||
//       (input.alt && input.key === 'F4')
//     ) {
//       event.preventDefault();
//     }
//   });

//   // 🧠 STRONG REFOCUS (NO EXIT)
//   win.on('blur', () => {
//     if (examStarted && !isExiting) {

//       console.log("User tried to switch → refocus");

//       setTimeout(() => {
//         if (!isExiting) {
//           win.show();
//           win.focus();
//           win.moveTop();
//           win.setAlwaysOnTop(true, "screen-saver");
//         }
//       }, 50);
//     }
//   });

//   // ⛔ Prevent manual close
//   win.on('close', (e) => {
//     if (examStarted && !allowClose) {
//       e.preventDefault();
//     }
//   });
// }

// app.whenReady().then(createWindow);



// /* =========================
//    🎯 START EXAM
// ========================= */

// function decode(encodedStr) {
//   if (!encodedStr.startsWith("DP-")) {
//     throw new Error("Invalid encoded format");
//   }

//   const encoded = encodedStr.slice(3);

//   const charset = "0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz";
//   const shifts = [-1, 2, -4, 2, -2, 0, -2, 2, -7, 4];
//   const n = charset.length;

//   let original = "";

//   for (let i = 0; i < encoded.length; i++) {
//     let index = charset.indexOf(encoded[i]);

//     if (index === -1) {
//       throw new Error("Invalid character in encoded string");
//     }

//     let shift = shifts[i % shifts.length];
//     let originalIndex = (index - shift) % n;

//     if (originalIndex < 0) originalIndex += n;

//     original += charset[originalIndex];
//   }

//   return original;
// }

// ipcMain.on('start-exam', (event, code) => {

//   if (!code) return;

//   examStarted = true;
//   allowClose = false;
//   isExiting = false;

//   win.setAlwaysOnTop(true, "screen-saver");

//   let decoded;

//   try {
//     decoded = decode(code);
//   } catch (error) {
//     dialog.showErrorBox("Invalid Code", error.message);
//     return;
//   }

//   const url = "https://is.gd/" + decoded;

//   view = new BrowserView({
//     webPreferences: {
//       contextIsolation: true,
//       nodeIntegration: false
//     }
//   });

//   win.setBrowserView(view);

//   const [width, height] = win.getSize();
//   const HEADER_HEIGHT = 60;

//   view.setBounds({
//     x: 0,
//     y: HEADER_HEIGHT,
//     width: width,
//     height: height - HEADER_HEIGHT
//   });

//   view.setAutoResize({ width: true, height: true });

//   view.webContents.loadURL(url);

//   // 🔥 Allow login popup
//   view.webContents.setWindowOpenHandler(() => {
//     return {
//       action: 'allow',
//       overrideBrowserWindowOptions: {
//         fullscreen: true,
//         kiosk: true,
//         webPreferences: {
//           contextIsolation: true,
//           nodeIntegration: false
//         }
//       }
//     };
//   });

//   // 🚫 Restrict navigation
//   view.webContents.on('will-navigate', (e, navUrl) => {
//     if (
//       !navUrl.startsWith("https://shorturl.at/") &&
//       !navUrl.includes("hackerearth.com") &&
//       !navUrl.includes("https://is.gd/") &&
//       !navUrl.includes("https://tinyurl.com") &&
//       !navUrl.includes("google.com")
//     ) {
//       e.preventDefault();
//     }
//   });

//   // 🚫 Disable right click
//   view.webContents.on('context-menu', (e) => e.preventDefault());

//   // 🚫 Block DevTools
//   view.webContents.on('devtools-opened', () => {
//     view.webContents.closeDevTools();
//   });

//   // 🚫 Block shortcuts inside view
//   view.webContents.on('before-input-event', (event, input) => {
//     if (
//       input.key === 'F12' ||
//       input.meta ||
//       (input.control && ['w', 't', 'c', 'v'].includes(input.key.toLowerCase())) ||
//       (input.alt && input.key === 'Tab') ||
//       (input.alt && input.key === 'F4')
//     ) {
//       event.preventDefault();
//     }
//   });

//   // 🎯 TIMER
//   const examDuration = 30 * 60 * 1000;

//   setTimeout(() => {
//     if (!isExiting) {
//       dialog.showMessageBox(win, {
//         type: "info",
//         title: "Time Up",
//         message: "Exam time is over. Please submit your test.",
//         buttons: ["OK"],
//         noLink: true
//       });

//       view.webContents.executeJavaScript(`
//         alert("Time is up! Submit your exam now.");
//       `);
//     }
//   }, examDuration);
// });


// /* =========================
//    🔄 REFRESH
// ========================= */
// ipcMain.on('refresh-exam', () => {
//   if (view) view.webContents.reload();
// });


// /* =========================
//    ❌ EXIT
// ========================= */
// ipcMain.on('exit-exam', () => {

//   allowClose = true;
//   isExiting = true;
//   examStarted = false;

//   win.setAlwaysOnTop(false);

//   app.quit();
// });


// ===================================================================================
// ===================================================================================
// ===================================================================================
// ===================================================================================


// const { app, BrowserWindow, ipcMain, BrowserView, dialog } = require('electron');

// let win;
// let view;
// let examStarted = false;
// let allowClose = false;
// let isExiting = false;

// let violations = 0;
// let blurStartTime = 0;
// let lastViolationTime = 0; // 🔥 prevent spam

// function createWindow() {
//   win = new BrowserWindow({
//     fullscreen: true,
//     kiosk: true,
//     webPreferences: {
//       preload: __dirname + '/preload.js',
//       contextIsolation: true,
//       nodeIntegration: false
//     }
//   });

//   win.loadFile('index.html');

//   // 🚫 DevTools
//   win.webContents.on('devtools-opened', () => {
//     win.webContents.closeDevTools();
//   });

//   // 🚫 Shortcuts
//   win.webContents.on('before-input-event', (event, input) => {
//     if (
//       input.key === 'F12' ||
//       input.meta ||
//       (input.control && ['w','t','c','v'].includes(input.key.toLowerCase())) ||
//       (input.alt && input.key === 'Tab') ||
//       (input.alt && input.key === 'F4')
//     ) {
//       event.preventDefault();
//     }
//   });

//   // 🧠 BLUR HANDLER (Quick switch handling)
//   win.on('blur', () => {
//     if (!examStarted || isExiting) return;

//     blurStartTime = Date.now();

//     setTimeout(() => {
//       if (!examStarted || isExiting) return;

//       const diff = Date.now() - blurStartTime;

//       // 🔄 Try refocus
//       win.show();
//       win.focus();
//       win.moveTop();
//       win.setAlwaysOnTop(true, "screen-saver");

//       if (diff > 800) {
//         registerViolation("Blur long");
//       }

//     }, 200);
//   });

//   // 🔥 BACKGROUND CHECK (IMPORTANT)
//   setInterval(() => {
//     if (!examStarted || isExiting) return;

//     if (!win.isFocused()) {
//       registerViolation("Background focus lost");

//       // 🔄 refocus
//       win.show();
//       win.focus();
//       win.moveTop();
//       win.setAlwaysOnTop(true, "screen-saver");
//     }

//   }, 1000);

//   // ⛔ Prevent close
//   win.on('close', (e) => {
//     if (examStarted && !allowClose) {
//       e.preventDefault();
//     }
//   });
// }

// app.whenReady().then(createWindow);



// // 🔥 COMMON VIOLATION FUNCTION
// function registerViolation(reason) {

//   // prevent multiple counts quickly
//   if (Date.now() - lastViolationTime < 2000) return;

//   lastViolationTime = Date.now();

//   violations++;

//   console.log(`${reason} → Violation ${violations}/3`);

//   if (violations >= 3) {
//     console.log("Too many violations → EXIT");

//     isExiting = true;
//     allowClose = true;
//     examStarted = false;

//     win.setAlwaysOnTop(false);

//     app.quit();
//     return;
//   }

//   // ⚠️ warning
//   dialog.showMessageBox(win, {
//     type: "warning",
//     title: "Warning",
//     message: `Do not switch desktop!\nViolation ${violations}/3`,
//     buttons: ["OK"],
//     noLink: true
//   });
// }



// /* =========================
//    🎯 START EXAM
// ========================= */

// function decode(encodedStr) {
//   if (!encodedStr.startsWith("DP-")) {
//     throw new Error("Invalid encoded format");
//   }

//   const encoded = encodedStr.slice(3);

//   const charset = "0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz";
//   const shifts = [-1, 2, -4, 2, -2, 0, -2, 2, -7, 4];
//   const n = charset.length;

//   let original = "";

//   for (let i = 0; i < encoded.length; i++) {
//     let index = charset.indexOf(encoded[i]);

//     if (index === -1) throw new Error("Invalid character");

//     let shift = shifts[i % shifts.length];
//     let originalIndex = (index - shift) % n;

//     if (originalIndex < 0) originalIndex += n;

//     original += charset[originalIndex];
//   }

//   return original;
// }

// ipcMain.on('start-exam', (event, code) => {

//   if (!code) return;

//   examStarted = true;
//   allowClose = false;
//   isExiting = false;
//   violations = 0;

//   win.setAlwaysOnTop(true, "screen-saver");

//   let decoded;

//   try {
//     decoded = decode(code);
//   } catch (error) {
//     dialog.showErrorBox("Invalid Code", error.message);
//     return;
//   }

//   const url = "https://is.gd/" + decoded;

//   view = new BrowserView({
//     webPreferences: {
//       contextIsolation: true,
//       nodeIntegration: false
//     }
//   });

//   win.setBrowserView(view);

//   const [width, height] = win.getSize();
//   const HEADER_HEIGHT = 60;

//   view.setBounds({
//     x: 0,
//     y: HEADER_HEIGHT,
//     width,
//     height: height - HEADER_HEIGHT
//   });

//   view.setAutoResize({ width: true, height: true });

//   view.webContents.loadURL(url);

//   view.webContents.setWindowOpenHandler(() => ({
//     action: 'allow',
//     overrideBrowserWindowOptions: {
//       fullscreen: true,
//       kiosk: true,
//       webPreferences: {
//         contextIsolation: true,
//         nodeIntegration: false
//       }
//     }
//   }));

//   view.webContents.on('will-navigate', (e, navUrl) => {
//     if (
//       !navUrl.includes("hackerearth.com") &&
//       !navUrl.includes("is.gd") &&
//       !navUrl.includes("tinyurl.com") &&
//       !navUrl.includes("google.com")
//     ) {
//       e.preventDefault();
//     }
//   });

//   view.webContents.on('context-menu', (e) => e.preventDefault());

//   view.webContents.on('devtools-opened', () => {
//     view.webContents.closeDevTools();
//   });

//   view.webContents.on('before-input-event', (event, input) => {
//     if (
//       input.key === 'F12' ||
//       input.meta ||
//       (input.control && ['w','t','c','v'].includes(input.key.toLowerCase())) ||
//       (input.alt && input.key === 'Tab') ||
//       (input.alt && input.key === 'F4')
//     ) {
//       event.preventDefault();
//     }
//   });

//   // ⏱️ Timer
//   setTimeout(() => {
//     if (!isExiting) {
//       dialog.showMessageBox(win, {
//         type: "info",
//         message: "Time is up!",
//         buttons: ["OK"]
//       });
//     }
//   }, 30 * 60 * 1000);
// });


// /* =========================
//    🔄 REFRESH
// ========================= */
// ipcMain.on('refresh-exam', () => {
//   if (view) view.webContents.reload();
// });


// /* =========================
//    ❌ EXIT
// ========================= */
// ipcMain.on('exit-exam', () => {

//   allowClose = true;
//   isExiting = true;
//   examStarted = false;

//   win.setAlwaysOnTop(false);

//   app.quit();
// });
// this code work tab switch and decktop switch show last third waring message
// =================================================
// =================================================
// =================================================

const { app, BrowserWindow, ipcMain, BrowserView, dialog } = require('electron');

let win;
let view;
let examStarted = false;
let allowClose = false;
let isExiting = false;

let violations = 0;
let blurStartTime = 0;
let lastViolationTime = 0;

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

  // 🧠 BLUR HANDLER (timing-based: tab switch vs desktop switch)
  win.on('blur', () => {
    if (!examStarted || isExiting) return;

    // Wait 150ms to distinguish a quick tab switch from a real desktop switch
    setTimeout(() => {
      if (!examStarted || isExiting) return;

      // If the window already regained focus it was a quick tab switch — no violation
      if (win.isFocused()) return;

      // Still not focused after 150ms → desktop switch → count as violation
      registerViolation("Desktop switch detected");

      // 🔄 Bring back window
      win.show();
      win.focus();
      win.moveTop();
      win.setAlwaysOnTop(true, "screen-saver");
    }, 150);
  });

  // 🔥 BACKGROUND CHECK
  setInterval(() => {
    if (!examStarted || isExiting) return;

    if (!win.isFocused()) {
      registerViolation("Background Lost");

      win.show();
      win.focus();
      win.moveTop();
      win.setAlwaysOnTop(true, "screen-saver");
    }

  }, 1000);

  // ⛔ Prevent close
  win.on('close', (e) => {
    if (examStarted && !allowClose) {
      e.preventDefault();
    }
  });
}

app.whenReady().then(createWindow);



// 🔥 FINAL VIOLATION FUNCTION
function registerViolation(reason) {

  if (Date.now() - lastViolationTime < 500) return;

  lastViolationTime = Date.now();

  violations++;

  console.log(`${reason} → Violation ${violations}/3`);

  // ❌ CLOSE IMMEDIATELY ( NO POPUP )
  if (violations >= 3) {

    console.log("3 violations → EXIT");

    isExiting = true;
    allowClose = true;
    examStarted = false;

    win.setAlwaysOnTop(false);

    app.quit();
    return;
  }

  // ⚠️ Show warning only for 1 & 2
  dialog.showMessageBox(win, {
    type: "warning",
    title: "Warning",
    message: `Do not switch desktop!\nViolation ${violations}/3`,
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

  let original = "";

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

  // ⏱️ Timer
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