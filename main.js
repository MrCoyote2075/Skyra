const {
    app,
    BrowserWindow,
    ipcMain,
    BrowserView,
    screen,
    session
} = require("electron");
const path = require("path");

// ==========================================
// GLOBAL SWITCHES
// ==========================================
// THIS BLOCKS THE WINDOWS PASSKEY POPUP AND FORCES "TAP YES" PHONE VERIFICATION
app.commandLine.appendSwitch(
    "disable-features",
    "WebAuthentication,WebAuthenticationProxy"
);

// ==========================================
// CONFIGURATION
// ==========================================
const CONFIG = {
    USER_AGENT: "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
    MAX_TAB_SWITCHES: 3,
    BLUR_GRACE_PERIOD_MS: 5000,
    ALLOWED_DOMAINS: [
        "hackerearth.com",
        "hackerrank.com",
        "is.gd",
        "accounts.google.com",
        "oauth",
        "github.com",
        "linkedin.com",
        "facebook.com",
    ]
};

// ==========================================
// EXAM CONTROLLER CLASS
// ==========================================
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
    }

    initialize() {
        app.userAgentFallback = CONFIG.USER_AGENT;

        app.disableHardwareAcceleration();
        app.whenReady().then(async () => {
            await session.defaultSession.clearStorageData();

            this.createMainWindow();
            this.registerWindowEvents();
            this.registerIpcHandlers();
        });

        app.on("window-all-closed", () => {
            if (process.platform !== "darwin") {
                app.quit();
            }
        });
    }

    createMainWindow() {
        this.mainWindow = new BrowserWindow({
            fullscreen: true,
            kiosk: true,
            alwaysOnTop: false,
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
            if (!this.isExiting) e.preventDefault();
        });

        this.mainWindow.on("close", (e) => {
            if (this.isExiting) return;

            e.preventDefault();

            this.mainWindow.webContents.send("show-error", "Closing...");

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

    monitorDisplays() {
        if (screen.getAllDisplays().length > 1) return false;
        return true;
    }

    registerWindowEvents() {
        screen.on("display-added", () => {
            if (this.examStarted && !this.isExiting) {
                this.terminateExam("Multiple monitors detected during the exam.");
            }
        });

        app.on("browser-window-blur", () => {
            if (!this.examStarted || this.isExiting) return;

            const activeWindow = BrowserWindow.getFocusedWindow();
            if (activeWindow) return;

            this.tabSwitchCount++;

            if (this.tabSwitchCount > CONFIG.MAX_TAB_SWITCHES) {
                this.isExiting = true;
                this.terminateExam("You exceeded the maximum allowed tab switches.");
                return;
            }

            this.awaitingReturn = true;
            this.hideExamView();
            this.mainWindow.webContents.send("show-warning", this.tabSwitchCount);

            this.blurTimer = setTimeout(() => {
                this.isExiting = true;
                this.terminateExam("You left the application for more than 5 seconds.");
            }, CONFIG.BLUR_GRACE_PERIOD_MS);
        });

        app.on("browser-window-focus", () => {
            if (!this.examStarted || this.isExiting || !this.blurTimer) return;
            if (this.awaitingReturn) return;

            clearTimeout(this.blurTimer);
            this.blurTimer = null;
            this.mainWindow.webContents.send("show-post-warning", this.tabSwitchCount);
        });
    }

    startExam(code) {
        this.tabSwitchCount = 0;
        this.awaitingReturn = false;

        if (!this.monitorDisplays()) {
            this.mainWindow.webContents.send("show-error", "Multiple monitors detected! Disconnect external displays.");
            return;
        }

        let decodedUrl;
        try {
            decodedUrl = this.decodeAccessCode(code);
        } catch (error) {
            this.mainWindow.webContents.send("show-error", "Invalid Access Code.");
            return;
        }

        this.examStarted = true;
        this.mainWindow.webContents.send("exam-started");
        this.mainWindow.webContents.send("show-loader");

        this.view = new BrowserView({
            webPreferences: { contextIsolation: true, nodeIntegration: false },
        });

        this.mainWindow.setBrowserView(this.view);
        this.resizeView();

        this.enforceSecurity(this.view.webContents);
        this.setupViewNavigation();

        this.view.webContents.loadURL("https://is.gd/" + decodedUrl);
    }

    setupViewNavigation() {
        const webContents = this.view.webContents;

        webContents.on("will-navigate", (e, navUrl) => {
            const isAllowed = CONFIG.ALLOWED_DOMAINS.some((domain) => navUrl.includes(domain));
            if (!isAllowed) e.preventDefault();
        });

        webContents.setWindowOpenHandler(({ url }) => {
            return {
                action: "allow",
                overrideBrowserWindowOptions: {
                    width: 600, height: 700,
                    parent: this.mainWindow, modal: true,
                    alwaysOnTop: true, autoHideMenuBar: true,
                    webPreferences: { contextIsolation: true, nodeIntegration: false },
                },
            };
        });

        webContents.on("did-stop-loading", () => {
            if (this.mainWindow && !this.mainWindow.isDestroyed()) {
                this.mainWindow.webContents.send("hide-loader");
            }
        });

        webContents.on("did-fail-load", (event, errorCode) => {
            if (!this.mainWindow || this.mainWindow.isDestroyed()) return;
            this.mainWindow.webContents.send("hide-loader");
            if (errorCode === -3) return;

            this.destroyExamView();
            this.examStarted = false;
            this.mainWindow.webContents.send("show-error", "Failed to connect. Please check your internet connection.");
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
            this.mainWindow.removeBrowserView(this.authView);
            if (this.authView.webContents && !this.authView.webContents.isDestroyed()) {
                this.authView.webContents.destroy();
            }
            this.authView = null;
        }

        if (this.mainWindow && !this.mainWindow.isDestroyed()) {
            this.mainWindow.webContents.send("show-terminated", reason);
        }
    }

    resizeView() {
        if (!this.view || !this.mainWindow) return;
        const [width, height] = this.mainWindow.getSize();
        this.view.setBounds({ x: 0, y: 70, width, height: height - 70 });
        this.view.setAutoResize({ width: true, height: true });
    }

    hideExamView() {
        if (this.view && this.mainWindow) this.mainWindow.removeBrowserView(this.view);
    }

    showExamView() {
        if (this.view && this.mainWindow) {
            this.mainWindow.setBrowserView(this.view);
            this.resizeView();
        }
    }

    destroyExamView() {
        if (this.view && this.mainWindow) {
            this.mainWindow.removeBrowserView(this.view);
            if (this.view.webContents && !this.view.webContents.isDestroyed()) this.view.webContents.destroy();
            this.view = null;
        }
    }

    decodeAccessCode(encodedStr) {
        if (!encodedStr.startsWith("DP-")) throw new Error("Invalid format");
        const encoded = encodedStr.slice(3);
        const charset = "0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz";
        const shifts = [-1, 2, -4, 2, -2, 0, -2, 2, -7, 4];
        let original = "";
        for (let i = 0; i < encoded.length; i++) {
            let index = charset.indexOf(encoded[i]);
            if (index === -1) throw new Error("Invalid character");
            let originalIndex = (index - shifts[i % shifts.length]) % charset.length;
            if (originalIndex < 0) originalIndex += charset.length;
            original += charset[originalIndex];
        }
        return original;
    }

    registerIpcHandlers() {
        ipcMain.on("start-exam", (event, code) => {
            this.startExam(code);

            if (this.authView && this.mainWindow) {
                this.mainWindow.removeBrowserView(this.authView);
                if (this.authView.webContents && !this.authView.webContents.isDestroyed()) {
                    this.authView.webContents.destroy();
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
            this.showExamView();

            if (this.mainWindow && !this.mainWindow.isDestroyed()) {
                this.mainWindow.webContents.send("hide-warning");
                this.mainWindow.webContents.send("show-post-warning", this.tabSwitchCount);
            }
        });

        ipcMain.on("hide-view", () => {
            this.hideExamView();
            if (this.authView && this.mainWindow) {
                this.mainWindow.removeBrowserView(this.authView);
            }
        });

        ipcMain.on("show-view", () => this.showExamView());

        ipcMain.on("resume-exam", () => {
            this.showExamView();
        });

        ipcMain.on("refresh-exam", () => {
            if (this.view && this.view.webContents && !this.view.webContents.isDestroyed()) {
                this.view.webContents.reload();
            } else {
                if (this.mainWindow && !this.mainWindow.isDestroyed()) {
                    this.mainWindow.webContents.send("hide-loader");
                    this.mainWindow.webContents.send("show-error", "Exam view disconnected.");
                }
            }
        });

        // PURE WIPE ON EXIT
        ipcMain.on("exit-exam", async () => {
            this.isExiting = true;
            await session.defaultSession.clearStorageData();
            app.quit();
        });

        ipcMain.on("force-quit", async () => {
            this.isExiting = true;
            await session.defaultSession.clearStorageData();
            app.quit();
        });

        ipcMain.on("open-google-login", () => {
            if (this.view && this.mainWindow) {
                this.mainWindow.removeBrowserView(this.view);
            }
            this.createGoogleLoginView();
        });

        ipcMain.handle("confirm-google-login", async () => {
            const cookies = await session.defaultSession.cookies.get({
                domain: "google.com",
            });

            const isLoggedIn = cookies.some((c) =>
                ["SID", "HSID", "SSID", "APISID", "SAPISID", "SIDCC"].some((name) =>
                    c.name.includes(name),
                ),
            );

            if (isLoggedIn && this.authView && this.mainWindow) {
                this.mainWindow.removeBrowserView(this.authView);
                if (this.authView.webContents && !this.authView.webContents.isDestroyed()) {
                    this.authView.webContents.destroy();
                }
                this.authView = null;
            }

            return isLoggedIn;
        });
    }

    createGoogleLoginView() {
        if (this.authView && this.authView.webContents && !this.authView.webContents.isDestroyed()) {
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
            const cookies = await session.defaultSession.cookies.get({ domain: "google.com" });
            const isLoggedIn = cookies.some((c) =>
                ["SID", "HSID", "SSID", "APISID", "SAPISID", "SIDCC"].some((name) => c.name.includes(name)),
            );

            if (isLoggedIn && this.mainWindow && !this.mainWindow.isDestroyed()) {
                this.mainWindow.removeBrowserView(this.authView);
                if (this.authView.webContents && !this.authView.webContents.isDestroyed()) {
                    this.authView.webContents.destroy();
                }
                this.authView = null;

                this.mainWindow.webContents.send("google-login-success");
            }
        });
    }
}

const appController = new ExamController();
appController.initialize();
