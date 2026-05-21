let countdownInterval;
let googleLoggedIn = false;

let lastWarningSeconds = 6;

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
    document.getElementById("app-header").style.display = "flex";
  }, 4000);
});

function acceptRules() {
  document.getElementById("rules-screen").style.display = "none";
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
  document.getElementById("post-warning-overlay").style.display = "none";
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

// ✅ called by warning overlay button
function returnToExam() {
  window.electronAPI.returnToExam();
}

// ✅ called by retry overlay button
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

// Keep header alive always unless terminated
function ensureHeaderVisible() {
  const header = document.getElementById("app-header");
  if (header) header.style.display = "flex";
}

window.electronAPI.onGoogleLoginSuccess(() => {
  googleLoggedIn = true;
  document.getElementById("google-login-container").style.display = "none";
  document.getElementById("login-container").style.display = "block";
  ensureHeaderVisible();
});

// Loaders triggered from main process
window.electronAPI.onShowLoader(() => {
  document.getElementById("loading-overlay").style.display = "flex";
});

window.electronAPI.onHideLoader(() => {
  document.getElementById("loading-overlay").style.display = "none";
});

window.electronAPI.onExamStarted(() => {
  document.getElementById("login-container").style.display = "none";
  document.getElementById("btn-refresh").style.display = "inline-block";
  ensureHeaderVisible();
});

window.electronAPI.onShowError((event, msg) => {
  ensureHeaderVisible();
  showError(msg);
});

// ✅ show-warning now sends payload {count, seconds}
window.electronAPI.onShowWarning((event, payload) => {
  if (countdownInterval) clearInterval(countdownInterval);

  hideAllOverlays();
  ensureHeaderVisible();

  const overlay = document.getElementById("warning-overlay");
  overlay.style.display = "flex";

  const count = payload?.count ?? payload; // backward compatible
  const seconds = payload?.seconds ?? 6;

  lastWarningSeconds = seconds;

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

window.electronAPI.onShowPostWarning((event, count) => {
  if (countdownInterval) clearInterval(countdownInterval);
  hideAllOverlays();
  ensureHeaderVisible();

  document.getElementById("post-warning-overlay").style.display = "flex";

  const postCountEl = document.getElementById("post-warning-count");
  if (postCountEl)
    postCountEl.innerText = `You have switched tabs ${count} out of 3 times.`;
});

function dismissPostWarning() {
  hideAllOverlays();
  ensureHeaderVisible();
  window.electronAPI.resumeExam();
}

window.electronAPI.onHideWarning(() => {
  if (countdownInterval) clearInterval(countdownInterval);
  hideAllOverlays();
  ensureHeaderVisible();
});

// ✅ recoverable error overlay with retry
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

// ✅ fatal overlay: show details and allow exit
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

// Terminated
window.electronAPI.onShowTerminated((event, reason) => {
  if (countdownInterval) clearInterval(countdownInterval);
  hideAllOverlays();

  document.getElementById("login-container").style.display = "none";
  document.getElementById("app-header").style.display = "none";

  const terminateReasonEl = document.getElementById("terminate-reason");
  if (terminateReasonEl && reason) terminateReasonEl.innerText = reason;

  document.getElementById("terminated-overlay").style.display = "flex";
});