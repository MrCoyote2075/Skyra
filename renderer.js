let countdownInterval;

// Network Latency Checker
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

window.addEventListener("DOMContentLoaded", () => {
    setTimeout(() => {
        document.getElementById("splash-screen").style.display = "none";
        // document.getElementById("credits").style.display = "block"; 
        document.getElementById("rules-screen").style.display = "flex";
        document.getElementById("app-header").style.display = "flex"; 
    }, 4000);
});


// Called when they click "I Accept All Conditions"
function acceptRules() {
    document.getElementById("rules-screen").style.display = "none";
    document.getElementById("login-container").style.display = "block";
}

function startExam() {
    // Prevent loading if there is no internet
    const networkText = document.getElementById("network-status").innerText;
    if (networkText.includes("Offline") || networkText.includes("Checking")) {
        showError("No internet connection! Please check your network and try again.");
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
    document.getElementById("btn-home").style.display = "inline-block";
    document.getElementById("btn-refresh").style.display = "inline-block";
});

window.electronAPI.onShowError((event, msg) => {
    showError(msg);
});

window.electronAPI.onShowWarning((event, count) => {
    if (countdownInterval) clearInterval(countdownInterval);
    hideAllOverlays();
    document.getElementById("warning-overlay").style.display = "flex";

    const warningCountEl = document.getElementById("warning-count-text");
    if (warningCountEl) warningCountEl.innerText = `Warning ${count}/3`;

    let time = 5;
    document.getElementById("countdown-text").innerText = time;

    countdownInterval = setInterval(() => {
        time--;
        if (time > 0) {
            document.getElementById("countdown-text").innerText = time;
        }
    }, 1000);
});

window.electronAPI.onShowPostWarning((event, count) => {
    if (countdownInterval) clearInterval(countdownInterval);
    hideAllOverlays();
    document.getElementById("post-warning-overlay").style.display = "flex";

    const postCountEl = document.getElementById("post-warning-count");
    if (postCountEl) postCountEl.innerText = `You have switched tabs ${count} out of 3 times.`;
});

function dismissPostWarning() {
    hideAllOverlays();
    window.electronAPI.resumeExam();
}

window.electronAPI.onHideWarning(() => {
    if (countdownInterval) clearInterval(countdownInterval);
    hideAllOverlays();
});

//  Capture the reason parameter
window.electronAPI.onShowTerminated((event, reason) => {
    if (countdownInterval) clearInterval(countdownInterval);
    hideAllOverlays();

    document.getElementById("login-container").style.display = "none";
    document.getElementById("app-header").style.display = "none";

    //  Display the reason for termination
    const terminateReasonEl = document.getElementById("terminate-reason");
    if (terminateReasonEl && reason) terminateReasonEl.innerText = reason;

    document.getElementById("terminated-overlay").style.display = "flex";
});

// Home Button Functionality
function goHome() {
    window.electronAPI.goHome(); 
    document.getElementById("login-container").style.display = "block";
    document.getElementById("btn-home").style.display = "none";
    document.getElementById("btn-refresh").style.display = "none";
}