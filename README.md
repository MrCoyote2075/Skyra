<div align="center">

# 🛡️ Skyra
**Next-Generation Secure Exam Environment**

[![Electron](https://img.shields.io/badge/Electron-191970?style=for-the-badge&logo=Electron&logoColor=white)](https://www.electronjs.org/)
[![Node.js](https://img.shields.io/badge/Node.js-43853D?style=for-the-badge&logo=node.js&logoColor=white)](https://nodejs.org/)
[![JavaScript](https://img.shields.io/badge/JavaScript-F7DF1E?style=for-the-badge&logo=javascript&logoColor=black)](https://developer.mozilla.org/en-US/docs/Web/JavaScript)
[![License: ISC](https://img.shields.io/badge/License-ISC-blue.svg?style=for-the-badge)](https://opensource.org/licenses/ISC)
[![Platform](https://img.shields.io/badge/Platform-Windows%20%7C%20macOS%20%7C%20Linux-lightgrey?style=for-the-badge)](#)

*A hardened, zero-trace desktop browser designed to maintain absolute integrity for online assessments and coding interviews.*

---
</div>

## 📖 Overview

**Skyra** is a custom-built, highly secure kiosk browser engineered to prevent cheating during online exams. Built natively on top of **Electron**, Skyra completely isolates the candidate from their host operating system, enforcing strict focus rules, hardware limitations, and network constraints. 

It bridges the gap between seamless user experience and aggressive exam proctoring, featuring a modern glassmorphic UI alongside a ruthless background monitoring engine.

## ✨ Core Features

### 🔒 Enterprise-Grade Security & Anti-Cheat
* **Kiosk Mode Lock-In:** Forces the application into an always-on-top, borderless, fullscreen state preventing access to the host OS.
* **Hardware Monitoring:** Automatically detects secondary monitors or screen-sharing hardware via OS-level polling and instantly terminates the session to prevent off-screen assistance.
* **Aggressive Focus Tracking:** Listens for OS-level blur events. If the user minimizes the app or attempts to switch windows, a strict **5-second termination timer** is triggered.
* **3-Strike Tab Switching Rule:** Candidates are permitted a maximum of 3 accidental tab switches before the session is forcibly closed. State is precisely managed in memory to carry across application layers.
* **OS Shortcut Blocking:** Intercepts and nullifies unauthorized keyboard inputs natively (e.g., `Alt+Tab`, `Alt+F4`, `Win+Tab`, `Cmd+Q`, `F12` DevTools) while preserving essential functions like `Ctrl+C` / `Ctrl+V`.
* **Zero-Trace Sessions (Incognito Mode):** Completely wipes all session data, cookies, local storage, and cache prior to launching and immediately upon application exit.

### 🌐 Network & Navigation Sandbox
* **Domain Whitelisting:** Intercepts Electron's `will-navigate` lifecycle. Traffic is strictly limited to authorized assessment domains (e.g., *HackerRank, HackerEarth, GitHub, LinkedIn, Google OAuth*).
* **Live Latency Diagnostics:** Pings edge servers over UDP/No-CORS to display real-time network stability (Strong, Medium, Weak, Offline) to the user, preventing infinite loading screens on dropped connections.

### 💻 Modern UI/UX
* **Glassmorphism Design:** Beautiful UI crafted with vanilla CSS, featuring backdrop filters, radial gradients, and fluid CSS animations that rival React/Tailwind implementations.
* **Custom Code Decoder:** Uses a custom bit-shifting cipher (`DP-XXXXXX`) to securely obfuscate destination URLs.
* **Smart Overlays:** Context-aware modals for connection drops, rules acceptance, warnings, and termination states.

---

## 🧠 System Architecture

Skyra is designed following Electron's strict security guidelines, utilizing a secure **Main** and **Renderer** process architecture connected via an isolated **Preload** bridge.

1. **Main Process (`main.js`):** Acts as the hypervisor. Manages window states, intercepts OS-level hardware events (display additions), handles clipboard data, blocks DevTools, and restricts unauthorized URL navigation.
2. **Renderer Process (`renderer.js`):** Handles the frontend logic, UI animations, and network latency polling. Runs completely stripped of Node.js integration to prevent Remote Code Execution (RCE) vulnerabilities.
3. **Context Bridge (`preload.js`):** Exposes a tightly controlled API (`window.electronAPI`) allowing the UI to safely trigger exam starts, exits, and memory cleanups via IPC (Inter-Process Communication) messaging.
4. **BrowserView Injection:** Instead of standard vulnerable `iframes`, Skyra dynamically injects an isolated `BrowserView` container to load third-party exam URLs securely. Views are completely garbage-collected upon exit to ensure **zero memory leaks**.

---

## 🛠️ Technical Implementation & Challenges Solved

* **Memory Leak Prevention:** Built a robust IPC bridge to dynamically create, destroy, and garbage-collect `BrowserView` containers when a user navigates between the home screen and active exams.
* **Asynchronous State Management:** Implemented bulletproof state management across Main and Renderer processes to ensure violation counters (`tabSwitchCount`) accurately trigger frontend overlays while maintaining timer locks.
* **Graceful Failure States:** Engineered network-interception logic using `did-fail-load` to gracefully tear down broken views if the internet connection drops mid-exam, returning the user to a safe UI state rather than a blank screen.

---

## 🚀 Getting Started

### Prerequisites
* [Node.js](https://nodejs.org/en/) (v16.x or higher)
* NPM or Yarn

### Installation

1. **Clone the repository:**
   ```bash
   git clone https://github.com/MrCoyote2075/Skyra.git
   cd Skyra
   ```

2. **Install dependencies:**
   ```bash
   npm install
   ```

3. **Run in development mode:**
   ```bash
   npm start
   ```

---

## 📦 Building for Production

Skyra uses `electron-builder` to package executables for all major operating systems.

* **Build for Windows (.exe):**
  ```bash
  npm run dist
  ```
* **Build for macOS (.dmg):**
  *(Requires a macOS host environment)*
  ```bash
  npm run dist --mac
  ```
* **Build for Linux (.AppImage):**
  ```bash
  npm run dist --linux
  ```

---

## 📜 License

This project is licensed under the ISC License.

---
<div align="center">
  <i>Engineered and Designed with ❤️ by <a href="https://github.com/MrCoyote2075">Dhanush.N (MrCoyote2075)</a></i>
</div>
