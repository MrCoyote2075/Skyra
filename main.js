const {
    app,
    BrowserWindow,
    ipcMain,
    BrowserView,
    screen,
    session,
} = require("electron");
const path = require("path");
const fs = require("fs");

// ==========================================
// GLOBAL SWITCHES
// ==========================================
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
    BLUR_GRACE_PERIOD_MS: 10000,
    GOOGLE_LOGIN_TTL_MS: 60 * 60 * 1000,
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
const SESSION_META_FILE = "session-meta.json";

class ExamController {
    constructor() {
        this.mainWindow = null;
        this.view = null;
        this.examStarted = false;
        this.isExiting = false;
        this.blurTimer = null;
        this.tabSwitchCount = 0;
        this.authView = null;
        this.forceCloseTimer = null;
        this.lastExamUrl = null;
        this.sessionMetaPath = path.join(app.getPath("userData"), SESSION_META_FILE);
        this.refocusInterval = null;
        this.refocusAttempts = 0;
    }

    readSessionMeta() {
        try {
            if (!fs.existsSync(this.sessionMetaPath)) return {};
            return JSON.parse(fs.readFileSync(this.sessionMetaPath, "utf8"));
        } catch {
            return {};
        }
    }

    writeSessionMeta(meta) {
        try {
            fs.writeFileSync(this.sessionMetaPath, JSON.stringify(meta), "utf8");
        } catch (e) {
            console.warn("Failed to write session metadata:", e);
        }
    }

    markGoogleLoginNow() {
        const meta = this.readSessionMeta();
        meta.lastGoogleLoginAt = Date.now();
        this.writeSessionMeta(meta);
    }

    isLoginWithinTtl() {
        const meta = this.readSessionMeta();
        const ts = Number(meta.lastGoogleLoginAt || 0);
        if (!Number.isFinite(ts) || ts <= 0) return false;
        return Date.now() - ts <= CONFIG.GOOGLE_LOGIN_TTL_MS;
    }

    async hasGoogleAuthCookies() {
        try {
            const cookies = await session.defaultSession.cookies.get({
                domain: "google.com",
            });
            return cookies.some((c) =>
                ["SID", "HSID", "SSID", "APISID", "SAPISID", "SIDCC"].some(
                    (name) => c.name.includes(name),
                ),
            );
        } catch {
            return false;
        }
    }

    async shouldPreserveLoginSession() {
        if (!this.isLoginWithinTtl()) return false;
        return await this.hasGoogleAuthCookies();
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
                const preserveLogin = await this.shouldPreserveLoginSession();
                if (!preserveLogin) {
                    await session.defaultSession.clearStorageData();
                }
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
        this.safeSend("show-fatal", { title, details });
    }

    startRefocusLoop() {
        if (this.refocusInterval) {
            clearInterval(this.refocusInterval);
            this.refocusInterval = null;
        }

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

        screen.on("display-removed", () => {
            if (this.examStarted && !this.isExiting) {
                this.terminateExam(
                    "Display configuration changed during the exam.",
                );
            }
        });

        screen.on("display-metrics-changed", () => {
            if (this.examStarted && !this.isExiting) {
                if (!this.monitorDisplays()) {
                    this.terminateExam(
                        "Display configuration changed during the exam.",
                    );
                }
            }
        });

        app.on("browser-window-blur", () => {
            if (!this.examStarted || this.isExiting) return;

            const activeWindow = BrowserWindow.getFocusedWindow();
            if (activeWindow) return;

            this.tabSwitchCount++;

            if (this.tabSwitchCount > CONFIG.MAX_TAB_SWITCHES) {
                this.isExiting = true;
                this.terminateExam(
                    "You exceeded the maximum allowed tab switches."
                );
                return;
            }

            try {
                if (this.mainWindow && !this.mainWindow.isDestroyed()) {
                    this.mainWindow.show();
                    this.mainWindow.focus();
                }
            } catch {
                // ignore
            }
            this.startRefocusLoop();

            // Show warning overlay, hide exam view
            this.hideExamView();

            this.safeSend("show-warning", {
                count: this.tabSwitchCount,
                seconds: Math.ceil(CONFIG.BLUR_GRACE_PERIOD_MS / 1000),
            });

            if (this.blurTimer) clearTimeout(this.blurTimer);

            this.blurTimer = setTimeout(() => {
                this.isExiting = true;
                this.terminateExam(
                    "You left the application for more than 6 seconds."
                );
            }, CONFIG.BLUR_GRACE_PERIOD_MS);
        });
    }

    startExam(code) {
        this.tabSwitchCount = 0;

        if (!this.monitorDisplays()) {
            this.safeSend(
                "show-error",
                "Multiple monitors detected! Disconnect external displays.",
            );
            return;
        }

        try {
            this.lastExamUrl = this.decodeAccessCode(code);
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
            if (errorCode === -3) return;
            this.hideExamView();
            this.safeSend("show-retry", {
                title: "Connection Failed",
                message:
                    "Failed to load the exam page. Please check your internet connection and retry.",
            });
        });
    }

    terminateExam(reason) {
        this.examStarted = false;

        if (this.refocusInterval) {
            clearInterval(this.refocusInterval);
            this.refocusInterval = null;
        }

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

    decodeAccessCode(code) {
        // Paste your decode access code logic here, unchanged
        // ...
        // [Use your v3 logic if you want to simplify]
        if (!code || code.length < 5) throw new Error("Invalid Skyra code format");
        const signature = code.slice(0, 3);
        if (signature !== "DP-") throw new Error("Invalid Skyra code, valid eg. DP-abcdef");
        
        code = code.slice(3);
        const idChar = code.charAt(0);
        let core = code.slice(1);
        if (!/\d/.test(idChar) || !core) throw new Error("Invalid Skyra code format");
        const reverseStr = (s) => s.split("").reverse().join("");
        const unswapParts = (s) => {
            const m = s.length;
            if (m % 2 === 0) {
                const half = m / 2;
                const right = s.slice(0, half);
                const left = s.slice(half);
                return left + right;
            } else {
                const leftLen = Math.floor(m / 2);
                const right = s.slice(0, leftLen);
                const middle = s.charAt(leftLen);
                const left = s.slice(leftLen + 1);
                return left + middle + right;
            }
        };
        const shiftChar = (ch, delta) => {
            const charCode = ch.charCodeAt(0);
            if (ch >= "a" && ch <= "z") {
                const base = "a".charCodeAt(0);
                return String.fromCharCode(((charCode - base + delta + 26) % 26) + base);
            }
            if (ch >= "A" && ch <= "Z") {
                const base = "A".charCodeAt(0);
                return String.fromCharCode(((charCode - base + delta + 26) % 26) + base);
            }
            if (ch >= "0" && ch <= "9") {
                const base = "0".charCodeAt(0);
                return String.fromCharCode(((charCode - base + delta + 10) % 10) + base);
            }
            return String.fromCharCode(charCode + delta);
        };
        const altShift = (s, startDelta) => {
            let delta = startDelta;
            return s.split("").map((ch) => {
                const out = shiftChar(ch, delta);
                delta = -delta;
                return out;
            }).join("");
        };
        core = reverseStr(core);
        core = altShift(core, -2);
        core = unswapParts(core);
        const n = core.length;
        let originalToken = "";
        if (n === 1) {
            originalToken = core;
        } else {
            const last = core.charAt(0);
            const first = core.charAt(1);
            const middle = n > 2 ? core.slice(2) : "";
            originalToken = first + middle + last;
        }
        let finalToken = "";
        for (let i = 0; i < originalToken.length; i++) {
            const char = originalToken[i];
            if (char >= "a" && char <= "z") {
                finalToken += char.toUpperCase();
            } else if (char >= "A" && char <= "Z") {
                finalToken += char.toLowerCase();
            } else {
                finalToken += char;
            }
        }
        const providerMap = {
            "1": "https://shorturl.at/",
            "2": "https://tinyurl.com/",
            "3": "https://bit.ly/"
        };
        const baseUrl = providerMap[idChar] || "https://shorturl.at/";
        return baseUrl + finalToken;
    }

    registerIpcHandlers() {
        ipcMain.on("start-exam", (event, code) => {
            this.startExam(code);

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
            if (this.refocusInterval) {
                clearInterval(this.refocusInterval);
                this.refocusInterval = null;
            }
            // Just re-attach exam view and hide all overlays
            if (this.view && this.mainWindow) {
                try {
                    this.mainWindow.setBrowserView(this.view);
                    this.resizeView();
                } catch (e) {
                    console.warn("Failed to restore exam view:", e);
                }
            }
            this.safeSend("hide-warning");
            // No post-warning overlay!
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
                this.showExamView();
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
                const preserveLogin = await this.shouldPreserveLoginSession();
                if (!preserveLogin) {
                    await session.defaultSession.clearStorageData();
                }
            } catch {
                // ignore
            }
            app.quit();
        });

        ipcMain.on("force-quit", async () => {
            this.isExiting = true;
            try {
                const preserveLogin = await this.shouldPreserveLoginSession();
                if (!preserveLogin) {
                    await session.defaultSession.clearStorageData();
                }
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
                this.markGoogleLoginNow();
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

        ipcMain.handle("get-login-state", async () => {
            const preserveLogin = await this.shouldPreserveLoginSession();
            return { loggedIn: preserveLogin };
        });

        ipcMain.handle("sign-out", async () => {
            try {
                await session.defaultSession.clearStorageData();
            } catch {
                // ignore
            }
            const meta = this.readSessionMeta();
            meta.lastGoogleLoginAt = 0;
            this.writeSessionMeta(meta);
            return { success: true };
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
                this.markGoogleLoginNow();
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
