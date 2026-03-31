const {
    app,
    BrowserWindow,
    ipcMain,
    BrowserView,
    screen,
    clipboard,
    session,
} = require("electron");
const path = require("path");

// Pretend to be a normal Chrome browser so Google OAuth doesn't block us
app.userAgentFallback =
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36";

let mainWindow;
let view;
let examStarted = false;
let isExiting = false;
let blurTimer = null;
let tabSwitchCount = 0;

const ALLOWED_DOMAINS = [
    "hackerearth.com",
    "hackerrank.com",
    "is.gd",
    "accounts.google.com",
    "oauth",
    "github.com",
    "linkedin.com",
    "facebook.com",
];

function decode(encodedStr) {
    if (!encodedStr.startsWith("DP-")) throw new Error("Invalid format");
    const encoded = encodedStr.slice(3);
    const charset =
        "0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz";
    const shifts = [-1, 2, -4, 2, -2, 0, -2, 2, -7, 4];
    let original = "";
    for (let i = 0; i < encoded.length; i++) {
        let index = charset.indexOf(encoded[i]);
        if (index === -1) throw new Error("Invalid character");
        let originalIndex =
            (index - shifts[i % shifts.length]) % charset.length;
        if (originalIndex < 0) originalIndex += charset.length;
        original += charset[originalIndex];
    }
    return original;
}

function preventShortcuts(event, input) {
    const isMac = process.platform === 'darwin';
    const modifier = isMac ? input.meta : input.control;

    if (
        input.key === "F12" ||
        // input.key === "F11" ||
        (modifier && ["w", "t"].includes(input.key.toLowerCase())) ||
        (input.alt && input.key === "Tab") ||
        (input.alt && input.key === "F4")
    ) {
        event.preventDefault();
    }
}

function createMainWindow() {
    mainWindow = new BrowserWindow({
        fullscreen: true,
        kiosk: true,
        alwaysOnTop: true,
        resizable: false,
        movable: false,
        minimizable: false,
        maximizable: false,
        webPreferences: {
            preload: path.join(__dirname, "preload.js"),
            contextIsolation: true,
            nodeIntegration: false,
        },
    });

    mainWindow.loadFile("index.html");
    mainWindow.setContentProtection(true);

    mainWindow.on("close", (e) => {
        if (!isExiting) e.preventDefault();
    });

    mainWindow.webContents.on("devtools-opened", () =>
        mainWindow.webContents.closeDevTools(),
    );
    mainWindow.webContents.on("before-input-event", preventShortcuts);

    screen.on("display-added", () => {
        if (examStarted && !isExiting) {
            console.log("New monitor plugged in! Terminating.");
            terminateExam("Multiple monitors detected during the exam."); 
        }
    });
}

function terminateExam(reason) {
    examStarted = false;
    if (view && mainWindow) {
        mainWindow.removeBrowserView(view);
    }
    mainWindow.webContents.send("show-terminated", reason);
}

app.on("browser-window-blur", () => {
    if (!examStarted || isExiting) return;

    const activeWindow = BrowserWindow.getFocusedWindow();
    if (activeWindow) return;

    tabSwitchCount++;

    if (tabSwitchCount > 3) {
        console.log("Tab switch limit exceeded! Terminating.");
        isExiting = true;
        terminateExam("You exceeded the maximum allowed tab switches.");
        return;
    }

    console.log("App lost focus! 5-sec timer started.");
    
    if (view && mainWindow) {
        mainWindow.removeBrowserView(view);
    }
    mainWindow.webContents.send("show-warning", tabSwitchCount);

    blurTimer = setTimeout(() => {
        console.log("5 Seconds up. Terminating UI shown.");
        isExiting = true;
        terminateExam("You left the application for more than 5 seconds.");
    }, 5000);
});

app.on("browser-window-focus", () => {
    if (!examStarted || isExiting || !blurTimer) return;

    console.log("App regained focus.");
    clearTimeout(blurTimer);
    blurTimer = null;

    mainWindow.webContents.send("show-post-warning", tabSwitchCount);
    mainWindow.setAlwaysOnTop(true, "screen-saver");
});

// Wait for app to be ready, clear all data, THEN create window
app.whenReady().then(async () => {
    // This effectively forces an "Incognito Mode" fresh start
    await session.defaultSession.clearStorageData();
    createMainWindow();
});

// IPC HANDLERS
ipcMain.on("start-exam", (event, code) => {
    tabSwitchCount = 0; 

    if (screen.getAllDisplays().length > 1) {
        mainWindow.webContents.send(
            "show-error",
            "Multiple monitors detected! Disconnect external displays.",
        );
        return;
    }

    let decoded;
    try {
        decoded = decode(code);
    } catch (error) {
        mainWindow.webContents.send("show-error", "Invalid Access Code.");
        return;
    }

    examStarted = true;
    mainWindow.webContents.send("exam-started");
    mainWindow.webContents.send("show-loader");

    view = new BrowserView({
        webPreferences: { contextIsolation: true, nodeIntegration: false },
    });

    mainWindow.setBrowserView(view);
    const [width, height] = mainWindow.getSize();
    view.setBounds({ x: 0, y: 70, width, height: height - 70 });
    view.setAutoResize({ width: true, height: true });

    view.webContents.on("devtools-opened", () =>
        view.webContents.closeDevTools(),
    );
    view.webContents.on("context-menu", (e) => e.preventDefault());
    view.webContents.on("before-input-event", preventShortcuts);

    view.webContents.on("will-navigate", (e, navUrl) => {
        const isAllowed = ALLOWED_DOMAINS.some((domain) =>
            navUrl.includes(domain),
        );
        if (!isAllowed) e.preventDefault();
    });

    view.webContents.setWindowOpenHandler(({ url }) => {
        return {
            action: "allow",
            overrideBrowserWindowOptions: {
                width: 600,
                height: 700,
                parent: mainWindow,
                modal: true,
                alwaysOnTop: true,
                autoHideMenuBar: true,
                webPreferences: {
                    contextIsolation: true,
                    nodeIntegration: false,
                },
            },
        };
    });

    view.webContents.on("did-stop-loading", () => {
        mainWindow.webContents.send("hide-loader");
    });

     view.webContents.on("did-fail-load", () => {
        mainWindow.webContents.send("hide-loader");
        if (view && mainWindow) {
            mainWindow.removeBrowserView(view);
            view.webContents.destroy(); // Optional: forcefully destroy
        }
        examStarted = false;
        mainWindow.webContents.send("show-error", "Failed to connect. Please check your internet connection.");
    });

    app.on("web-contents-created", (e, contents) => {
        contents.on("devtools-opened", () => contents.closeDevTools());
        contents.on("context-menu", (event) => event.preventDefault());
        contents.on("before-input-event", preventShortcuts);
        contents.on("will-navigate", (event, navUrl) => {
            const isAllowed = ALLOWED_DOMAINS.some((domain) =>
                navUrl.includes(domain),
            );
            if (!isAllowed) event.preventDefault();
        });
    });

    view.webContents.loadURL("https://is.gd/" + decoded);
});

ipcMain.on("go-home", () => {
    if (view && mainWindow) {
        mainWindow.removeBrowserView(view);
        view.webContents.destroy(); // Free up memory
    }
    examStarted = false;
});

ipcMain.on("hide-view", () => {
    if (view && mainWindow) mainWindow.removeBrowserView(view);
});

ipcMain.on("show-view", () => {
    if (view && mainWindow) {
        mainWindow.setBrowserView(view);
        const [width, height] = mainWindow.getSize();
        view.setBounds({ x: 0, y: 70, width, height: height - 70 });
    }
});

ipcMain.on("resume-exam", () => {
    if (view && mainWindow) {
        mainWindow.setBrowserView(view);
        const [width, height] = mainWindow.getSize();
        view.setBounds({ x: 0, y: 70, width, height: height - 70 });
        mainWindow.setAlwaysOnTop(true, "screen-saver");
    }
});

ipcMain.on("refresh-exam", () => {
    if (view) view.webContents.reload();
});

// Clear data immediately before exiting
ipcMain.on("exit-exam", async () => {
    isExiting = true;
    await session.defaultSession.clearStorageData();
    app.quit();
});

// Clear data immediately before Force Quitting
ipcMain.on("force-quit", async () => {
    isExiting = true;
    await session.defaultSession.clearStorageData();
    app.quit();
});
