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

    isValidEmail(value) {
        if (!value || typeof value !== "string") return false;
        return /^[^\s@]+@[^\s@]+\.[^\s@]+$/i.test(value.trim());
    }

    deriveNameFromEmail(email) {
        if (!this.isValidEmail(email)) return "";
        const localPart = email.trim().split("@")[0] || "";
        if (!localPart) return "";
        return localPart
            .split(/[._-]+/)
            .filter(Boolean)
            .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
            .join(" ");
    }

    normalizeProfile(profile) {
        if (!profile || typeof profile !== "object") {
            return { name: "", email: "", photoUrl: "" };
        }

        const email = String(profile.email || "").trim();
        const validEmail = this.isValidEmail(email) ? email : "";
        const photoUrl = this.normalizePhotoUrl(profile.photoUrl || "");
        let name = String(profile.name || "").trim();

        if (!name && validEmail) {
            name = this.deriveNameFromEmail(validEmail);
        }

        return { name, email: validEmail, photoUrl };
    }

    sleep(ms) {
        return new Promise((resolve) => setTimeout(resolve, ms));
    }

    getCachedGoogleProfile() {
        const meta = this.readSessionMeta();
        const normalized = this.normalizeProfile(meta.lastGoogleProfile || {});
        if (!normalized.email && !normalized.name && !normalized.photoUrl) return null;
        return normalized;
    }

    saveGoogleProfile(profile) {
        const normalized = this.normalizeProfile(profile);
        if (!normalized.email && !normalized.name && !normalized.photoUrl) return;
        const meta = this.readSessionMeta();
        meta.lastGoogleProfile = normalized;
        this.writeSessionMeta(meta);
    }

    clearSavedGoogleProfile(meta) {
        const nextMeta = meta || this.readSessionMeta();
        delete nextMeta.lastGoogleProfile;
        this.writeSessionMeta(nextMeta);
    }

    markGoogleLoginNow(profile = null) {
        const meta = this.readSessionMeta();
        meta.lastGoogleLoginAt = Date.now();
        if (profile) {
            meta.lastGoogleProfile = this.normalizeProfile(profile);
        }
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

    async extractProfileFromCookies() {
        try {
            const cookies = await session.defaultSession.cookies.get({
                domain: ".google.com",
            });
            for (const cookie of cookies) {
                const decoded = decodeURIComponent(String(cookie.value || ""));
                const emailMatch = decoded.match(
                    /[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/,
                );
                if (emailMatch) {
                    return this.normalizeProfile({
                        name: "",
                        email: emailMatch[0],
                        photoUrl: "",
                    });
                }
            }
        } catch {
            // ignore
        }
        return null;
    }

    async shouldPreserveLoginSession() {
        if (!this.isLoginWithinTtl()) return false;
        return await this.hasGoogleAuthCookies();
    }

    parseListAccountsPayload(rawText) {
        if (!rawText || typeof rawText !== "string") return null;
        const startIdx = rawText.indexOf("[");
        if (startIdx < 0) return null;
        try {
            return JSON.parse(rawText.slice(startIdx));
        } catch {
            return null;
        }
    }

    getFirstEmailFromAnyNode(node) {
        const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/i;
        const stack = [node];
        while (stack.length > 0) {
            const current = stack.pop();
            if (typeof current === "string" && emailRegex.test(current.trim())) {
                return current.trim();
            }
            if (Array.isArray(current)) {
                for (let i = current.length - 1; i >= 0; i--) stack.push(current[i]);
            } else if (current && typeof current === "object") {
                const values = Object.values(current);
                for (let i = values.length - 1; i >= 0; i--) stack.push(values[i]);
            }
        }
        return "";
    }

    findAccountArray(node) {
        const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/i;
        const stack = [node];
        while (stack.length > 0) {
            const current = stack.pop();
            if (Array.isArray(current)) {
                if (
                    current.length >= 4 &&
                    typeof current[3] === "string" &&
                    emailRegex.test(current[3].trim())
                ) {
                    return current;
                }
                const hasAnyEmail = current.some(
                    (v) => typeof v === "string" && emailRegex.test(v.trim()),
                );
                if (hasAnyEmail) return current;

                for (let i = current.length - 1; i >= 0; i--) stack.push(current[i]);
            } else if (current && typeof current === "object") {
                const values = Object.values(current);
                for (let i = values.length - 1; i >= 0; i--) stack.push(values[i]);
            }
        }
        return null;
    }

    normalizePhotoUrl(photoUrl) {
        if (!photoUrl || typeof photoUrl !== "string") return "";
        const trimmed = photoUrl.trim();
        if (!trimmed) return "";
        if (trimmed.startsWith("//")) return `https:${trimmed}`;
        return trimmed;
    }

    isLikelyPhotoUrl(value) {
        if (!value || typeof value !== "string") return false;
        const v = value.trim();
        if (!v.startsWith("http://") && !v.startsWith("https://") && !v.startsWith("//")) {
            return false;
        }
        return /(googleusercontent|ggpht|gstatic|lh3)/i.test(v);
    }

    extractProfileFromListAccounts(payload) {
        const account = this.findAccountArray(payload);
        if (!account) return null;

        const email = this.getFirstEmailFromAnyNode(account);
        if (!email) return null;

        let name = "";
        if (typeof account[2] === "string") {
            const candidate = account[2].trim();
            if (candidate && candidate !== email) name = candidate;
        }

        if (!name) {
            const nameCandidate = account.find((item) => {
                if (typeof item !== "string") return false;
                const candidate = item.trim();
                if (!candidate || candidate === email) return false;
                if (candidate.includes("@")) return false;
                if (candidate.startsWith("http://") || candidate.startsWith("https://")) return false;
                if (candidate.startsWith("//")) return false;
                return candidate.length > 1;
            });
            name = typeof nameCandidate === "string" ? nameCandidate.trim() : "";
        }

        let photoUrl = "";
        if (typeof account[4] === "string" && this.isLikelyPhotoUrl(account[4])) {
            photoUrl = this.normalizePhotoUrl(account[4]);
        }
        if (!photoUrl) {
            const photoCandidate = account.find((item) => this.isLikelyPhotoUrl(item));
            photoUrl = this.normalizePhotoUrl(photoCandidate);
        }

        return this.normalizeProfile({ name, email, photoUrl });
    }

    extractProfileFromRawText(rawText) {
        if (!rawText || typeof rawText !== "string") return null;

        const payload = this.parseListAccountsPayload(rawText);
        if (payload) {
            const parsed = this.extractProfileFromListAccounts(payload);
            if (parsed?.email) return parsed;
        }

        const emailMatch = rawText.match(
            /[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/,
        );
        const photoMatch = rawText.match(
            /(https?:\/\/(?:lh3|lh4|lh5|lh6)\.googleusercontent\.com\/[^\s"']+)/i,
        );

        if (!emailMatch) return null;

        return this.normalizeProfile({
            name: "",
            email: emailMatch[0],
            photoUrl: photoMatch ? photoMatch[1] : "",
        });
    }

    async fetchCurrentGoogleProfile() {
        const ses = session.defaultSession;
        if (!ses || typeof ses.fetch !== "function") return null;

        const profileUrls = [
            "https://accounts.google.com/ListAccounts?gpsia=1&source=ChromiumBrowser&json=standard",
            "https://accounts.google.com/ListAccounts?gpsia=1&source=ChromiumBrowser",
            "https://accounts.google.com/AccountChooser?continue=https%3A%2F%2Fwww.google.com%2F&hl=en",
            "https://myaccount.google.com/",
        ];

        for (const profileUrl of profileUrls) {
            try {
                const response = await ses.fetch(profileUrl, {
                    method: "GET",
                    credentials: "include",
                    cache: "no-store",
                    headers: { Accept: "application/json,text/plain,*/*" },
                });
                if (!response.ok) continue;
                const rawText = await response.text();
                const profile = this.extractProfileFromRawText(rawText);
                if (profile?.email) return profile;
            } catch {
                // try next endpoint
            }
        }

        return await this.extractProfileFromCookies();
    }

    async captureProfileFromAuthView() {
        if (
            !this.authView ||
            !this.authView.webContents ||
            this.authView.webContents.isDestroyed()
        ) {
            return null;
        }

        // 1) Try extracting directly from the currently rendered Google page.
        try {
            const domProfile = await this.authView.webContents.executeJavaScript(
                `(() => {
                    try {
                        const emailRegex = /[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\\.[A-Za-z]{2,}/;
                        const html = document.documentElement?.outerHTML || "";
                        const text = document.body?.innerText || "";
                        const combined = html + "\\n" + text;

                        const explicitEmailSelectors = [
                            "[data-email]",
                            "[data-identifier]",
                            "[email]",
                            "[data-account-email]"
                        ];

                        let email = "";
                        for (const selector of explicitEmailSelectors) {
                            const node = document.querySelector(selector);
                            if (!node) continue;
                            const attrs = [
                                node.getAttribute("data-email"),
                                node.getAttribute("data-identifier"),
                                node.getAttribute("email"),
                                node.getAttribute("data-account-email"),
                                node.textContent
                            ].filter(Boolean);
                            for (const value of attrs) {
                                const m = String(value).match(emailRegex);
                                if (m) {
                                    email = m[0];
                                    break;
                                }
                            }
                            if (email) break;
                        }

                        if (!email) {
                            const mailtoNode = document.querySelector('a[href^="mailto:"]');
                            if (mailtoNode) {
                                const href = mailtoNode.getAttribute("href") || "";
                                const m = href.match(emailRegex);
                                if (m) email = m[0];
                            }
                        }

                        if (!email) {
                            const m = combined.match(emailRegex);
                            if (m) email = m[0];
                        }

                        let photoUrl = "";
                        const avatarImg = document.querySelector('img[src*="googleusercontent"], img[src*="ggpht"], img[src*="gstatic"]');
                        if (avatarImg?.src) photoUrl = avatarImg.src;

                        return {
                            email: email || "",
                            name: "",
                            photoUrl: photoUrl || ""
                        };
                    } catch {
                        return { email: "", name: "", photoUrl: "" };
                    }
                })();`,
                true,
            );

            const normalizedDomProfile = this.normalizeProfile(domProfile || {});
            if (normalizedDomProfile.email) return normalizedDomProfile;
        } catch {
            // ignore and continue
        }

        // 2) Try Google ListAccounts endpoints from inside auth view.
        try {
            const rawText = await this.authView.webContents.executeJavaScript(
                `(async () => {
                    try {
                        const endpoints = [
                            "/ListAccounts?gpsia=1&source=ChromiumBrowser&json=standard",
                            "/ListAccounts?gpsia=1&source=ChromiumBrowser"
                        ];
                        for (const endpoint of endpoints) {
                            try {
                                const res = await fetch(endpoint, {
                                    method: "GET",
                                    credentials: "include",
                                    cache: "no-store",
                                    headers: { "Accept": "application/json,text/plain,*/*" }
                                });
                                if (res.ok) {
                                    const txt = await res.text();
                                    if (txt && txt.length) return txt;
                                }
                            } catch {
                                // continue to next endpoint
                            }
                        }
                        return "";
                    } catch {
                        return "";
                    }
                })();`,
                true,
            );

            const profile = this.extractProfileFromRawText(rawText);
            if (profile?.email) return profile;
        } catch {
            // ignore and use fallback
        }

        try {
            const profile = await this.fetchCurrentGoogleProfile();
            return this.normalizeProfile(profile || {});
        } catch {
            return null;
        }
    }

    async captureProfileWithRetries(maxAttempts = 3) {
        for (let attempt = 1; attempt <= maxAttempts; attempt++) {
            const profile = await this.captureProfileFromAuthView();
            if (profile?.email) return profile;
            await this.sleep(350 * attempt);
        }
        return null;
    }

    async getCurrentUserProfile() {
        const loggedIn = await this.shouldPreserveLoginSession();
        if (!loggedIn) {
            return { loggedIn: false, name: "", email: "", photoUrl: "" };
        }

        let profile = this.getCachedGoogleProfile();
        try {
            if (!profile?.email) {
                profile = await this.fetchCurrentGoogleProfile();
                if (profile?.email) this.saveGoogleProfile(profile);
            }
        } catch (e) {
            console.warn("Failed to fetch current Google profile:", e);
        }

        const normalized = this.normalizeProfile(profile || {});
        return {
            loggedIn: true,
            name: normalized.name || "",
            email: normalized.email || "",
            photoUrl: normalized.photoUrl || "",
        };
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
                    const meta = this.readSessionMeta();
                    meta.lastGoogleLoginAt = 0;
                    delete meta.lastGoogleProfile;
                    this.writeSessionMeta(meta);
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
                const profile = await this.captureProfileWithRetries(4);
                this.markGoogleLoginNow(profile);
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

        ipcMain.handle("get-current-user-profile", async () => {
            return await this.getCurrentUserProfile();
        });

        ipcMain.handle("sign-out", async () => {
            try {
                await session.defaultSession.clearStorageData();
            } catch {
                // ignore
            }
            const meta = this.readSessionMeta();
            meta.lastGoogleLoginAt = 0;
            delete meta.lastGoogleProfile;
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
                const profile = await this.captureProfileWithRetries(4);
                this.markGoogleLoginNow(profile);
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
