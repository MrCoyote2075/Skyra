<div align="center">

# 🛡️ Skyra
**Kiosk-Style Secure Exam Environment**

[![Electron](https://img.shields.io/badge/Electron-191970?style=for-the-badge&logo=Electron&logoColor=white)](https://www.electronjs.org/)
[![Node.js](https://img.shields.io/badge/Node.js-43853D?style=for-the-badge&logo=node.js&logoColor=white)](https://nodejs.org/)
[![JavaScript](https://img.shields.io/badge/JavaScript-F7DF1E?style=for-the-badge&logo=javascript&logoColor=black)](https://developer.mozilla.org/en-US/docs/Web/JavaScript)
[![License: ISC](https://img.shields.io/badge/License-ISC-blue.svg?style=for-the-badge)](https://opensource.org/licenses/ISC)
[![Platform](https://img.shields.io/badge/Platform-Windows-lightgrey?style=for-the-badge)](#)

*A hardened, zero-trace desktop browser designed to maintain absolute integrity for online assessments and coding interviews.*

---
</div>

## 📌 Purpose
Skyra is a secure, kiosk-style desktop environment built for online assessments. It limits system access, enforces focus, and ensures exam integrity while still providing a clean and modern user experience for candidates.

## People Behind the Project
- **Praveen** — Architected and designed the project.
- **Dhanush** — Implemented the features, designed new functionality, and handled deployment workflow.
- **GitHub Copilot** — Assisted with targeted implementation support and technical refinements.

## Technology & Approach
Skyra is built on **Electron**, combining a secure **Main** process with a restricted **Renderer** process and a minimal **Preload** bridge.

Key technical approaches used:
- **Main/Renderer separation** with `contextIsolation` and no Node.js access in the UI.
- **BrowserView-based exam loading** to isolate third-party exam pages securely.
- **IPC-only communication** via a controlled preload bridge.
- **Strict OS event monitoring** for focus loss, multi-monitor detection, and keyboard shortcut blocking.
- **Session isolation** by clearing storage data before launch and on exit.
- **Network stability signals** to surface connection issues to users.

##  Software Flow
1. **Launch** → Splash → Rules screen.
2. **Google Sign-in** (optional pre-auth step).
3. **Access Code** entry (Skyra code).
4. **Exam mode** starts in a secure BrowserView.
5. **Monitoring** runs in background (focus, tab switches, display changes).
6. **Termination** triggers secure shutdown overlays and forced cleanup.

##  Features
### Security & Anti-Cheat
- Fullscreen kiosk lock-in with always-on-top window.
- Multi-monitor detection and termination.
- Focus tracking with **5-second grace period**.
- **3-strike** tab-switch enforcement.
- OS shortcut blocking (`Alt+Tab`, `Alt+F4`, `Win+Tab`, `F12`, etc.).
- Zero-trace session cleanup on start and exit.

### Navigation & Network
- Domain allowlist filtering (`will-navigate` policy).
- Secure BrowserView for external assessment sites.
- Network status indicator (Strong/Medium/Weak/Offline).

### UI/UX
- Glassmorphic UI built in vanilla HTML/CSS.
- Context-aware overlays: warning, error, termination, loading.
- Lightweight front-end with minimal dependencies.

## 🛠️ Setup & Run Locally

### Prerequisites
- [Node.js](https://nodejs.org/) v16+  
- npm
- Electron

### Installation
```bash
git clone https://github.com/MrCoyote2075/Skyra.git
cd Skyra
npm install
```

### Run in Development
```bash
npm start
```

## 📦 Build (Windows)
Skyra uses `electron-builder`.

```bash
npm run build
```

The output installer will be created in the `dist/` folder.

## 💝 Credits & Thanks
Thanks to the Team and everyone who Helped with this Project. Special Thanks to Faculties for the Help and having Trust on Skyra.

---
<div align="center">
  <i>Engineered and Designed with ❤️ by Dhanush & Praveen</i>
</div>
