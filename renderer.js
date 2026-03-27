let countdownInterval;

// 🟢 Splash Screen & Rules Flow
window.addEventListener('DOMContentLoaded', () => {
  // Wait 3 seconds, then hide Splash and show Rules
  setTimeout(() => {
    document.getElementById('splash-screen').style.display = 'none';
    document.getElementById('rules-screen').style.display = 'flex';
  }, 3000);
});

// Called when they click "I Accept All Conditions"
function acceptRules() {
  document.getElementById('rules-screen').style.display = 'none';
  document.getElementById('login-container').style.display = 'block'; // Make login card visible
}

function startExam() {
  const code = document.getElementById("code").value;
  if (!code) {
    showError("Please enter a valid access code.");
    return;
  }
  window.electronAPI.startExam(code);
}

function hideAllOverlays() {
  document.getElementById("warning-overlay").style.display = "none";
  document.getElementById("exit-overlay").style.display = "none";
  document.getElementById("error-overlay").style.display = "none";
  document.getElementById("post-warning-overlay").style.display = "none";
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
  window.electronAPI.refreshExam();
}

// 🟢 Sends final kill signal to main process
function forceQuitApp() {
  window.electronAPI.forceQuit();
}

function showError(msg) {
  hideAllOverlays();
  document.getElementById("error-message").innerText = msg;
  document.getElementById("error-overlay").style.display = "flex";
}

window.electronAPI.onExamStarted(() => {
  document.getElementById("login-container").style.display = "none";
  document.getElementById("app-header").style.display = "flex"; // Show header only when exam starts
});

window.electronAPI.onShowError((event, msg) => {
  showError(msg);
});

window.electronAPI.onShowWarning(() => {
  if (countdownInterval) clearInterval(countdownInterval);
  hideAllOverlays();
  document.getElementById("warning-overlay").style.display = "flex";
  
  let time = 5; 
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

// 🟢 Shows the Termination screen when 5 seconds are up
window.electronAPI.onShowTerminated(() => {
  if (countdownInterval) clearInterval(countdownInterval);
  hideAllOverlays();
  
  document.getElementById("login-container").style.display = "none";
  document.getElementById("app-header").style.display = "none";
  
  // Show the final death screen
  document.getElementById("terminated-overlay").style.display = "flex";
});