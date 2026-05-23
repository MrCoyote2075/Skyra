let countdownInterval;
let googleLoggedIn = false;

// Network Latency Checker
function checkNetwork() {
  const start = Date.now();
  fetch("https://1.1.1.1/cdn-cgi/trace", {
    mode: "no-cors",
    cache: "no-store",
  })
    .then(() => {
      const latency = Date.now() - start;
      const statusEl = document.getElementById("network-status");
      if (!statusEl) return;

      if (latency < 100) {
        statusEl.innerText = `Network: Strong (${latency}ms)`;
        statusEl.style.color = "#34d399";
        statusEl.style.backgroundColor = "rgba(52, 211, 153, 0.15)";
      } else if (latency < 300) {
        statusEl.innerText = `Network: Medium (${latency}ms)`;
        statusEl.style.color = "#f59e0b";
        statusEl.style.backgroundColor = "rgba(245, 158, 11, 0.15)";
      } else {
        statusEl.innerText = `Network: Weak (${latency}ms)`;
        statusEl.style.color = "#ef4444";
        statusEl.style.backgroundColor = "rgba(239, 68, 68, 0.15)";
      }
    })
    .catch(() => {
      const statusEl = document.getElementById("network-status");
      if (statusEl) {
        statusEl.innerText = "Network: Offline";
        statusEl.style.color = "#ef4444";
        statusEl.style.backgroundColor = "rgba(239, 68, 68, 0.15)";
      }
    });
}
setTimeout(checkNetwork, 1000);
setInterval(checkNetwork, 5000);

window.addEventListener("DOMContentLoaded", () => {
  setTimeout(() => {
    document.getElementById("splash-screen").style.display = "none";
    document.getElementById("rules-screen").style.display = "flex";
    ensureHeaderVisible();
  }, 4000);
});

async function acceptRules() {
  document.getElementById("rules-screen").style.display = "none";
  try {
    const state = await window.electronAPI.getLoginState();
    if (state?.loggedIn) {
      googleLoggedIn = true;
      document.getElementById("login-container").style.display = "block";
      return;
    }
  } catch {
    // ignore and fall back to login screen
  }
  document.getElementById("google-login-container").style.display = "block";
}

function startGoogleLogin() {
  window.electronAPI.openGoogleLogin();
}

async function confirmGoogleLogin() {
  const ok = await window.electronAPI.confirmGoogleLogin();
  if (ok) {
    googleLoggedIn = true;
    document.getElementById("google-login-container").style.display = "none";
    document.getElementById("login-container").style.display = "block";
  } else {
    showError("Google login not detected yet. Please sign in and try again.");
  }
}

function startExam() {
  const networkText = document.getElementById("network-status").innerText;
  if (networkText.includes("Offline") || networkText.includes("Checking")) {
    showError("No internet connection! Please check your network and try again.");
    return;
  }

  if (!googleLoggedIn) {
    showError("Please sign in with your official email before starting the exam.");
    return;
  }

  const code = document.getElementById("code").value;
  if (!code) {
    showError("Please enter a valid access code.");
    return;
  }

  document.getElementById("loading-overlay").style.display = "flex";
  window.electronAPI.startExam(code);
}

function hideAllOverlays() {
  document.getElementById("warning-overlay").style.display = "none";
  document.getElementById("exit-overlay").style.display = "none";
  document.getElementById("error-overlay").style.display = "none";
  document.getElementById("loading-overlay").style.display = "none";
  const retryOverlay = document.getElementById("retry-overlay");
  if (retryOverlay) retryOverlay.style.display = "none";
  const fatalOverlay = document.getElementById("fatal-overlay");
  if (fatalOverlay) fatalOverlay.style.display = "none";
}

function requestExit() {
  window.electronAPI.hideView();
  hideAllOverlays();
  document.getElementById("exit-overlay").style.display = "flex";
}

function cancelExit() {
  hideAllOverlays();
  window.electronAPI.showView();
}

function confirmExit() {
  window.electronAPI.exitExam();
}

function refreshExam() {
  document.getElementById("loading-overlay").style.display = "flex";
  window.electronAPI.refreshExam();
}

function forceQuitApp() {
  window.electronAPI.forceQuit();
}

// --- Warning overlay button: "Return to Exam" ---
function returnToExam() {
  window.electronAPI.returnToExam();
}

function retryLoad() {
  hideAllOverlays();
  document.getElementById("loading-overlay").style.display = "flex";
  window.electronAPI.retryLoad();
}

function showError(msg) {
  hideAllOverlays();
  document.getElementById("error-message").innerText = msg;
  document.getElementById("error-overlay").style.display = "flex";
}

// --- Always keep header visible and restore button visibility ---
function ensureHeaderVisible() {
  const header = document.getElementById("app-header");
  if (header) header.style.display = "flex";
  const btnRefresh = document.getElementById("btn-refresh");
  if (btnRefresh) btnRefresh.style.display = "inline-block";
}

// --- IPC handlers ---
window.electronAPI.onGoogleLoginSuccess(() => {
  googleLoggedIn = true;
  document.getElementById("google-login-container").style.display = "none";
  document.getElementById("login-container").style.display = "block";
  ensureHeaderVisible();
});

window.electronAPI.onShowLoader(() => {
  document.getElementById("loading-overlay").style.display = "flex";
});

window.electronAPI.onHideLoader(() => {
  document.getElementById("loading-overlay").style.display = "none";
});

window.electronAPI.onExamStarted(() => {
  document.getElementById("login-container").style.display = "none";
  ensureHeaderVisible();
});

window.electronAPI.onShowError((event, msg) => {
  ensureHeaderVisible();
  showError(msg);
});

// --- WARNING OVERLAY LOGIC: no post-warning, just hides on resume ---
window.electronAPI.onShowWarning((event, payload) => {
  if (countdownInterval) clearInterval(countdownInterval);
  hideAllOverlays();
  ensureHeaderVisible();

  const overlay = document.getElementById("warning-overlay");
  overlay.style.display = "flex";
  const count = payload?.count ?? payload;
  const seconds = payload?.seconds ?? 6;
  const warningCountEl = document.getElementById("warning-count-text");
  if (warningCountEl) warningCountEl.innerText = `Warning ${count}/3`;

  let time = seconds;
  const cd = document.getElementById("countdown-text");
  cd.innerText = time;

  countdownInterval = setInterval(() => {
    time--;
    if (time > 0) {
      cd.innerText = time;
    } else {
      clearInterval(countdownInterval);
      countdownInterval = null;
    }
  }, 1000);
});

// --- Return from warning: just hide the warning ---
window.electronAPI.onHideWarning(() => {
  if (countdownInterval) clearInterval(countdownInterval);
  hideAllOverlays();
  ensureHeaderVisible();
});

// --- Recoverable error overlay with retry ---
window.electronAPI.onShowRetry((event, payload) => {
  hideAllOverlays();
  ensureHeaderVisible();
  const titleEl = document.getElementById("retry-title");
  const msgEl = document.getElementById("retry-message");
  if (titleEl) titleEl.innerText = payload?.title || "Something went wrong";
  if (msgEl)
    msgEl.innerText =
      payload?.message ||
      "A recoverable error occurred. Please retry.";
  const o = document.getElementById("retry-overlay");
  if (o) o.style.display = "flex";
});

// --- Fatal error overlay ---
window.electronAPI.onShowFatal((event, payload) => {
  hideAllOverlays();
  ensureHeaderVisible();
  const titleEl = document.getElementById("fatal-title");
  const msgEl = document.getElementById("fatal-message");
  const detailsEl = document.getElementById("fatal-details");
  if (titleEl) titleEl.innerText = payload?.title || "Fatal Error";
  if (msgEl)
    msgEl.innerText =
      "A critical problem occurred. Please close the application.";
  if (detailsEl) detailsEl.innerText = payload?.details || "";
  const o = document.getElementById("fatal-overlay");
  if (o) o.style.display = "flex";
});

// --- Terminated ---
window.electronAPI.onShowTerminated((event, reason) => {
  if (countdownInterval) clearInterval(countdownInterval);
  hideAllOverlays();
  document.getElementById("login-container").style.display = "none";
  document.getElementById("app-header").style.display = "none";
  const terminateReasonEl = document.getElementById("terminate-reason");
  if (terminateReasonEl && reason) terminateReasonEl.innerText = reason;
  document.getElementById("terminated-overlay").style.display = "flex";
});
