const {
    app,
    BrowserWindow,
    ipcMain,
    BrowserView,
    screen,
    clipboard,
} = require("electron");
const path = require("path");

let mainWindow;
let view;
let examStarted = false;
let isExiting = false;
let blurTimer = null;

const ALLOWED_DOMAINS = [
    "hackerearth.com",
    "is.gd",
    "accounts.google.com",
    "oauth",
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
    if (
        input.key === "F12" ||
        input.meta ||
        (input.control &&
            ["w", "t", "c", "v"].includes(input.key.toLowerCase())) ||
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
            console.log("❌ New monitor plugged in! Terminating.");
            terminateExam();
        }
    });
}

function terminateExam() {
    examStarted = false;
    if (view && mainWindow) {
        mainWindow.removeBrowserView(view);
    }
    mainWindow.webContents.send("show-terminated");
}

app.on("browser-window-blur", () => {
    if (!examStarted || isExiting) return;

    const activeWindow = BrowserWindow.getFocusedWindow();
    if (activeWindow) return;

    console.log("📵 App lost focus! 5-sec timer started.");
    clipboard.clear();

    if (view && mainWindow) {
        mainWindow.removeBrowserView(view);
    }
    mainWindow.webContents.send("show-warning");

    blurTimer = setTimeout(() => {
        console.log("❌ 5 Seconds up. Terminating UI shown.");
        isExiting = true;
        terminateExam();
    }, 5000);
});

app.on("browser-window-focus", () => {
    if (!examStarted || isExiting || !blurTimer) return;

    console.log("✅ App regained focus.");
    clearTimeout(blurTimer);
    blurTimer = null;

    mainWindow.webContents.send("show-post-warning");
    mainWindow.setAlwaysOnTop(true, "screen-saver");
});

app.whenReady().then(createMainWindow);

// =========================
// IPC HANDLERS
// =========================
ipcMain.on("start-exam", (event, code) => {
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
                fullscreen: true,
                alwaysOnTop: true,
                webPreferences: {
                    contextIsolation: true,
                    nodeIntegration: false,
                },
            },
        };
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

ipcMain.on("exit-exam", () => {
    isExiting = true;
    app.quit();
});

// 🟢 NEW: Handler for the "Close Application" button
ipcMain.on("force-quit", () => {
    isExiting = true;
    app.quit();
});
