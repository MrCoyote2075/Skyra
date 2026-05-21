const {
    app,
    BrowserWindow,
    ipcMain,
    BrowserView,
    screen,
    session,
} = require("electron");
const path = require("path");

// ==========================================
// GLOBAL SWITCHES
// ==========================================
// THIS BLOCKS THE WINDOWS PASSKEY POPUP AND FORCES "TAP YES" PHONE VERIFICATION
app.commandLine.appendSwitch(
    "disable-features",
    "WebAuthentication,WebAuthenticationProxy",
);

// ==========================================
// CONFIGURATION
// ==========================================
const CONFIG = {
    USER_AGENT:
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
    MAX_TAB_SWITCHES: 3,
    BLUR_GRACE_PERIOD_MS: 6000,
    ALLOWED_DOMAINS: [
        "hackerearth.com",
        "hackerrank.com",
        "is.gd",
        "accounts.google.com",
        "oauth",
        "github.com",
        "linkedin.com",
        "facebook.com",
    ],
};

class ExamController {
    constructor() {
        this.mainWindow = null;
        this.view = null;

        this.examStarted = false;
        this.isExiting = false;

        this.blurTimer = null;
        this.tabSwitchCount = 0;
        this.awaitingReturn = false;

        this.authView = null;
        this.forceCloseTimer = null;

        this.lastExamUrl = null;
        this.refocusInterval = null;
        this.refocusAttempts = 0;
    }

    initialize() {
        app.userAgentFallback = CONFIG.USER_AGENT;

        // Global crash safety
        process.on("uncaughtException", (err) => {
            console.error("uncaughtException:", err);
            this.safeShowFatalError(
                "A critical error occurred in the application.",
                err?.stack || String(err),
            );
        });

        process.on("unhandledRejection", (reason) => {
            console.error("unhandledRejection:", reason);
            this.safeShowFatalError(
                "A critical background error occurred.",
                String(reason),
            );
        });

        app.disableHardwareAcceleration();

        app.whenReady().then(async () => {
            try {
                await session.defaultSession.clearStorageData();
            } catch (e) {
                console.warn("Failed to clear storage at startup:", e);
            }

            this.createMainWindow();
            this.registerWindowEvents();
            this.registerIpcHandlers();
        });

        app.on("window-all-closed", () => {
            if (process.platform !== "darwin") app.quit();
        });
    }

    createMainWindow() {
        this.mainWindow = new BrowserWindow({
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

        this.mainWindow.loadFile("index.html");
        this.mainWindow.setContentProtection(true);

        this.mainWindow.on("close", (e) => {
            if (this.isExiting) return;
            e.preventDefault();

            // Graceful close UX
            this.safeSend("show-error", "Closing...");
            if (!this.forceCloseTimer) {
                this.forceCloseTimer = setTimeout(() => {
                    this.isExiting = true;
                    app.exit(0);
                }, 2000);
            }
        });

        this.enforceSecurity(this.mainWindow.webContents);
    }

    enforceSecurity(webContents) {
        webContents.on("devtools-opened", () => webContents.closeDevTools());
        webContents.on("context-menu", (e) => e.preventDefault());

        webContents.on("before-input-event", (event, input) => {
            const isMac = process.platform === "darwin";
            const modifier = isMac ? input.meta : input.control;

            // Keep existing blocks (we can expand later)
            if (
                input.key === "F12" ||
                input.key === "F11" ||
                (modifier && ["w", "t"].includes(input.key.toLowerCase())) ||
                (input.alt && input.key === "F4")
            ) {
                event.preventDefault();
            }
        });
    }

    startRefocusLoop() {
        // keep trying to refocus for a short moment (Windows needs repeated focus)
        if (this.refocusInterval) clearInterval(this.refocusInterval);

        this.refocusAttempts = 0;
        this.refocusInterval = setInterval(() => {
            this.refocusAttempts++;

            try {
                if (this.mainWindow && !this.mainWindow.isDestroyed()) {
                    // show + focus helps on Windows
                    this.mainWindow.show();
                    this.mainWindow.focus();
                }
            } catch {
                // ignore
            }

            // stop after ~1 second
            if (this.refocusAttempts >= 10) {
                clearInterval(this.refocusInterval);
                this.refocusInterval = null;
            }
        }, 100);
    }

    safeSend(channel, ...args) {
        try {
            if (
                this.mainWindow &&
                !this.mainWindow.isDestroyed() &&
                this.mainWindow.webContents &&
                !this.mainWindow.webContents.isDestroyed()
            ) {
                this.mainWindow.webContents.send(channel, ...args);
            }
        } catch (e) {
            console.warn(`safeSend failed for ${channel}:`, e);
        }
    }

    safeShowFatalError(title, details) {
        // Only show in-app overlay (HTML). No native dialogs.
        this.safeSend("show-fatal", { title, details });
    }

    monitorDisplays() {
        return screen.getAllDisplays().length <= 1;
    }

    registerWindowEvents() {
        screen.on("display-added", () => {
            if (this.examStarted && !this.isExiting) {
                this.terminateExam(
                    "Multiple monitors detected during the exam.",
                );
            }
        });

        // ✅ Better coverage (recommended earlier)
        screen.on("display-removed", () => {
            if (this.examStarted && !this.isExiting) {
                this.terminateExam(
                    "Display configuration changed during the exam.",
                );
            }
        });

        screen.on("display-metrics-changed", () => {
            if (this.examStarted && !this.isExiting) {
                // if multiple monitors appear after metrics change
                if (!this.monitorDisplays()) {
                    this.terminateExam(
                        "Display configuration changed during the exam.",
                    );
                }
            }
        });
        
        app.on("browser-window-blur", () => {
            if (!this.examStarted || this.isExiting) return;

            // If some other BrowserWindow of THIS app is focused, ignore
            const activeWindow = BrowserWindow.getFocusedWindow();
            if (activeWindow) return;

            this.tabSwitchCount++;

            if (this.tabSwitchCount > CONFIG.MAX_TAB_SWITCHES) {
                this.isExiting = true;
                this.terminateExam("You exceeded the maximum allowed tab switches.");
                return;
            }

            // Show warning overlay and require explicit "Return to Exam"
            this.awaitingReturn = true;

            // ✅ BEST-EFFORT AUTO-REFOCUS (Windows needs repeated focus attempts)
            // Note: Alt+Tab cannot be fully blocked by Electron, but this forces focus back quickly.
            try {
                if (this.mainWindow && !this.mainWindow.isDestroyed()) {
                    this.mainWindow.show();
                    this.mainWindow.focus();
                }
            } catch {
                // ignore
            }

            // Start a short refocus loop (about 1 second)
            // Add these to constructor:
            //   this.refocusInterval = null;
            //   this.refocusAttempts = 0;
            try {
                if (this.refocusInterval) clearInterval(this.refocusInterval);
                this.refocusAttempts = 0;

                this.refocusInterval = setInterval(() => {
                    this.refocusAttempts++;

                    try {
                        if (this.mainWindow && !this.mainWindow.isDestroyed()) {
                            this.mainWindow.show();
                            this.mainWindow.focus();
                        }
                    } catch {
                        // ignore
                    }

                    if (this.refocusAttempts >= 10) {
                        clearInterval(this.refocusInterval);
                        this.refocusInterval = null;
                    }
                }, 100);
            } catch {
                // ignore
            }

            this.hideExamView();

            // Send warning payload (count + seconds)
            this.safeSend("show-warning", {
                count: this.tabSwitchCount,
                seconds: Math.ceil(CONFIG.BLUR_GRACE_PERIOD_MS / 1000),
            });

            if (this.blurTimer) clearTimeout(this.blurTimer);

            this.blurTimer = setTimeout(() => {
                this.isExiting = true;
                this.terminateExam("You left the application for more than 6 seconds.");
            }, CONFIG.BLUR_GRACE_PERIOD_MS);
        });

        app.on("browser-window-focus", () => {
            // Important:
            // - If awaitingReturn=true we DO NOT auto-cancel the timer.
            // - The user MUST click Return to Exam button to continue.
            if (!this.examStarted || this.isExiting || !this.blurTimer) return;
            if (this.awaitingReturn) return;
        });
    }

    startExam(code) {
        this.tabSwitchCount = 0;
        this.awaitingReturn = false;

        if (!this.monitorDisplays()) {
            this.safeSend(
                "show-error",
                "Multiple monitors detected! Disconnect external displays.",
            );
            return;
        }

        let decodedUrl;
        try {
            decodedUrl = this.decodeAccessCode(code);
        } catch (error) {
            this.safeSend("show-error", "Invalid Access Code.");
            return;
        }

        this.examStarted = true;
        this.safeSend("exam-started");
        this.safeSend("show-loader");

        this.view = new BrowserView({
            webPreferences: { contextIsolation: true, nodeIntegration: false },
        });

        this.mainWindow.setBrowserView(this.view);
        this.resizeView();

        this.enforceSecurity(this.view.webContents);
        this.setupViewNavigation();

        this.lastExamUrl = "https://is.gd/" + decodedUrl;
        this.view.webContents.loadURL(this.lastExamUrl);
    }

    setupViewNavigation() {
        if (!this.view) return;
        const webContents = this.view.webContents;

        webContents.on("will-navigate", (e, navUrl) => {
            const isAllowed = CONFIG.ALLOWED_DOMAINS.some((domain) =>
                navUrl.includes(domain),
            );
            if (!isAllowed) e.preventDefault();
        });

        webContents.setWindowOpenHandler(() => {
            return {
                action: "allow",
                overrideBrowserWindowOptions: {
                    width: 600,
                    height: 700,
                    parent: this.mainWindow,
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

        webContents.on("did-stop-loading", () => {
            this.safeSend("hide-loader");
        });

        webContents.on("did-fail-load", (event, errorCode) => {
            this.safeSend("hide-loader");
            if (errorCode === -3) return; // navigation aborted

            // small problem => retry
            this.safeSend("show-retry", {
                title: "Connection Failed",
                message:
                    "Failed to load the exam page. Please check your internet connection and retry.",
            });
        });
    }

    terminateExam(reason) {
        this.examStarted = false;
        this.awaitingReturn = false;

        if (this.blurTimer) {
            clearTimeout(this.blurTimer);
            this.blurTimer = null;
        }

        this.destroyExamView();

        if (this.authView && this.mainWindow) {
            try {
                this.mainWindow.removeBrowserView(this.authView);
                if (
                    this.authView.webContents &&
                    !this.authView.webContents.isDestroyed()
                ) {
                    this.authView.webContents.destroy();
                }
            } catch {
                // ignore
            }
            this.authView = null;
        }

        this.safeSend("show-terminated", reason);
    }

    resizeView() {
        if (!this.view || !this.mainWindow) return;
        const [width, height] = this.mainWindow.getSize();
        this.view.setBounds({ x: 0, y: 70, width, height: height - 70 });
        this.view.setAutoResize({ width: true, height: true });
    }

    hideExamView() {
        if (this.view && this.mainWindow) {
            try {
                this.mainWindow.removeBrowserView(this.view);
            } catch {
                // ignore
            }
        }
    }

    showExamView() {
        if (this.view && this.mainWindow) {
            this.mainWindow.setBrowserView(this.view);
            this.resizeView();
        }
    }

    destroyExamView() {
        if (this.view && this.mainWindow) {
            try {
                this.mainWindow.removeBrowserView(this.view);
                if (
                    this.view.webContents &&
                    !this.view.webContents.isDestroyed()
                ) {
                    this.view.webContents.destroy();
                }
            } catch {
                // ignore
            }
            this.view = null;
        }
    }

    decodeAccessCode(encodedStr) {
        if (!encodedStr.startsWith("DP-")) throw new Error("Invalid format");
        const encoded = encodedStr.slice(3);
        const charset =
            "0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz";
        const shifts = [-1, 2, -4, 2, -2, 0, -2, 2, -7, 4];

        let original = "";
        for (let i = 0; i < encoded.length; i++) {
            const index = charset.indexOf(encoded[i]);
            if (index === -1) throw new Error("Invalid character");
            let originalIndex =
                (index - shifts[i % shifts.length]) % charset.length;
            if (originalIndex < 0) originalIndex += charset.length;
            original += charset[originalIndex];
        }
        return original;
    }

    registerIpcHandlers() {
        ipcMain.on("start-exam", (event, code) => {
            this.startExam(code);

            // clean google view if present
            if (this.authView && this.mainWindow) {
                try {
                    this.mainWindow.removeBrowserView(this.authView);
                    if (
                        this.authView.webContents &&
                        !this.authView.webContents.isDestroyed()
                    ) {
                        this.authView.webContents.destroy();
                    }
                } catch {
                    // ignore
                }
                this.authView = null;
            }
        });

        ipcMain.on("return-to-exam", () => {
            if (!this.examStarted || this.isExiting) return;

            if (this.blurTimer) {
                clearTimeout(this.blurTimer);
                this.blurTimer = null;
            }

            this.awaitingReturn = false;

            // ✅ Stop refocus loop once user returns
            if (this.refocusInterval) {
                clearInterval(this.refocusInterval);
                this.refocusInterval = null;
            }

            // ✅ Force a clean BrowserView re-attach (fixes header disappearing)
            if (this.view && this.mainWindow) {
                try {
                    this.mainWindow.setBrowserView(null);
                    this.mainWindow.setBrowserView(this.view);
                    this.resizeView();

                    this.mainWindow.show();
                    this.mainWindow.focus();
                } catch (e) {
                    console.warn("Failed to restore exam view:", e);
                }
            }

            this.mainWindow.webContents.send("hide-warning");
            this.mainWindow.webContents.send("show-post-warning", this.tabSwitchCount);
        });

        ipcMain.on("hide-view", () => {
            this.hideExamView();
            if (this.authView && this.mainWindow) {
                try {
                    this.mainWindow.removeBrowserView(this.authView);
                } catch {
                    // ignore
                }
            }
        });

        ipcMain.on("show-view", () => {
            // Ensure main window is focused and view is shown
            try {
                this.mainWindow?.focus();
            } catch {
                // ignore
            }
            this.showExamView();
        });

        ipcMain.on("resume-exam", () => {
            try {
                this.mainWindow?.focus();
            } catch {
                // ignore
            }
            this.showExamView();
        });

        ipcMain.on("retry-load", () => {
            if (this.view && this.lastExamUrl) {
                this.safeSend("show-loader");
                this.view.webContents.loadURL(this.lastExamUrl);
            } else {
                this.safeSend("show-error", "Nothing to retry.");
            }
        });

        ipcMain.on("refresh-exam", () => {
            if (
                this.view &&
                this.view.webContents &&
                !this.view.webContents.isDestroyed()
            ) {
                this.view.webContents.reload();
            } else {
                this.safeSend("hide-loader");
                this.safeSend("show-error", "Exam view disconnected.");
            }
        });

        ipcMain.on("exit-exam", async () => {
            this.isExiting = true;
            try {
                await session.defaultSession.clearStorageData();
            } catch {
                // ignore
            }
            app.quit();
        });

        ipcMain.on("force-quit", async () => {
            this.isExiting = true;
            try {
                await session.defaultSession.clearStorageData();
            } catch {
                // ignore
            }
            app.quit();
        });

        ipcMain.on("open-google-login", () => {
            if (this.view && this.mainWindow) {
                try {
                    this.mainWindow.removeBrowserView(this.view);
                } catch {
                    // ignore
                }
            }
            this.createGoogleLoginView();
        });

        ipcMain.handle("confirm-google-login", async () => {
            const cookies = await session.defaultSession.cookies.get({
                domain: "google.com",
            });

            const isLoggedIn = cookies.some((c) =>
                ["SID", "HSID", "SSID", "APISID", "SAPISID", "SIDCC"].some(
                    (name) => c.name.includes(name),
                ),
            );

            if (isLoggedIn && this.authView && this.mainWindow) {
                try {
                    this.mainWindow.removeBrowserView(this.authView);
                    if (
                        this.authView.webContents &&
                        !this.authView.webContents.isDestroyed()
                    ) {
                        this.authView.webContents.destroy();
                    }
                } catch {
                    // ignore
                }
                this.authView = null;
            }

            return isLoggedIn;
        });
    }

    createGoogleLoginView() {
        if (
            this.authView &&
            this.authView.webContents &&
            !this.authView.webContents.isDestroyed()
        ) {
            this.mainWindow.setBrowserView(this.authView);
            return;
        }

        this.authView = new BrowserView({
            webPreferences: { contextIsolation: true, nodeIntegration: false },
        });

        this.mainWindow.setBrowserView(this.authView);

        const [width, height] = this.mainWindow.getSize();
        this.authView.setBounds({ x: 0, y: 70, width, height: height - 70 });
        this.authView.setAutoResize({ width: true, height: true });

        this.authView.webContents.loadURL("https://accounts.google.com/");

        this.authView.webContents.on("did-navigate", async () => {
            const cookies = await session.defaultSession.cookies.get({
                domain: "google.com",
            });

            const isLoggedIn = cookies.some((c) =>
                ["SID", "HSID", "SSID", "APISID", "SAPISID", "SIDCC"].some(
                    (name) => c.name.includes(name),
                ),
            );

            if (isLoggedIn) {
                try {
                    this.mainWindow.removeBrowserView(this.authView);
                    if (
                        this.authView.webContents &&
                        !this.authView.webContents.isDestroyed()
                    ) {
                        this.authView.webContents.destroy();
                    }
                } catch {
                    // ignore
                }
                this.authView = null;

                this.safeSend("google-login-success");
            }
        });
    }
}

const appController = new ExamController();
appController.initialize();