let countdownInterval;

// 🟢 Network Latency Checker
function checkNetwork() {
    const start = Date.now();
    // Using a fast, reliable endpoint with no-cors to avoid CORS errors.
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
// Run network check immediately and every 5 seconds
setTimeout(checkNetwork, 1000);
setInterval(checkNetwork, 5000);

// 🟢 Splash Screen & Rules Flow
window.addEventListener("DOMContentLoaded", () => {
    setTimeout(() => {
        document.getElementById("splash-screen").style.display = "none";
        document.getElementById("rules-screen").style.display = "flex";
    }, 3000);
});

// Called when they click "I Accept All Conditions"
function acceptRules() {
    document.getElementById("rules-screen").style.display = "none";
    document.getElementById("login-container").style.display = "block";
}

function startExam() {
    const code = document.getElementById("code").value;
    if (!code) {
        showError("Please enter a valid access code.");
        return;
    }
    document.getElementById("loading-overlay").style.display = "flex"; // Show loader immediately
    window.electronAPI.startExam(code);
}

function hideAllOverlays() {
    document.getElementById("warning-overlay").style.display = "none";
    document.getElementById("exit-overlay").style.display = "none";
    document.getElementById("error-overlay").style.display = "none";
    document.getElementById("post-warning-overlay").style.display = "none";
    document.getElementById("loading-overlay").style.display = "none";
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
    document.getElementById("loading-overlay").style.display = "flex"; // Show loader
    window.electronAPI.refreshExam();
}

// Sends final kill signal to main process
function forceQuitApp() {
    window.electronAPI.forceQuit();
}

function showError(msg) {
    hideAllOverlays();
    document.getElementById("error-message").innerText = msg;
    document.getElementById("error-overlay").style.display = "flex";
}

// Loaders triggered from main process navigation status
window.electronAPI.onShowLoader(() => {
    document.getElementById("loading-overlay").style.display = "flex";
});

window.electronAPI.onHideLoader(() => {
    document.getElementById("loading-overlay").style.display = "none";
});

window.electronAPI.onExamStarted(() => {
    document.getElementById("login-container").style.display = "none";
    document.getElementById("app-header").style.display = "flex";
});

window.electronAPI.onShowError((event, msg) => {
    showError(msg);
});

window.electronAPI.onShowWarning(() => {
    if (countdownInterval) clearInterval(countdownInterval);
    hideAllOverlays();
    document.getElementById("warning-overlay").style.display = "flex";

    let time = 3; // 🟢 Reduced to 3 Seconds
    document.getElementById("countdown-text").innerText = time;

    countdownInterval = setInterval(() => {
        time--;
        if (time > 0) {
            document.getElementById("countdown-text").innerText = time;
        }
    }, 1000);
});

window.electronAPI.onShowPostWarning(() => {
    if (countdownInterval) clearInterval(countdownInterval);
    hideAllOverlays();
    document.getElementById("post-warning-overlay").style.display = "flex";
});

function dismissPostWarning() {
    hideAllOverlays();
    window.electronAPI.resumeExam();
}

window.electronAPI.onHideWarning(() => {
    if (countdownInterval) clearInterval(countdownInterval);
    hideAllOverlays();
});

window.electronAPI.onShowTerminated(() => {
    if (countdownInterval) clearInterval(countdownInterval);
    hideAllOverlays();

    document.getElementById("login-container").style.display = "none";
    document.getElementById("app-header").style.display = "none";

    document.getElementById("terminated-overlay").style.display = "flex";
});
