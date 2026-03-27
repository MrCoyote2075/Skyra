let countdownInterval;

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

// Show HTML Exit Modal (Hides the exam view so it doesn't cover the modal)
function requestExit() {
  window.electronAPI.hideView();
  hideAllOverlays();
  document.getElementById("exit-overlay").style.display = "flex";
}

// Cancel Exit (Puts the exam view back)
function cancelExit() {
  hideAllOverlays();
  window.electronAPI.showView();
}

// Actually exit
function confirmExit() {
  window.electronAPI.exitExam();
}

function refreshExam() {
  window.electronAPI.refreshExam();
}

function showError(msg) {
  hideAllOverlays();
  document.getElementById("error-message").innerText = msg;
  document.getElementById("error-overlay").style.display = "flex";
}

window.electronAPI.onExamStarted(() => {
  document.getElementById("login-container").style.display = "none";
});

window.electronAPI.onShowError((event, msg) => {
  showError(msg);
});

// The 5-Second countdown when they tab out
window.electronAPI.onShowWarning(() => {
  if (countdownInterval) clearInterval(countdownInterval);
  hideAllOverlays();
  document.getElementById("warning-overlay").style.display = "flex";
  
  let time = 6; // Updated to 5 seconds
  document.getElementById("countdown-text").innerText = time;
  
  countdownInterval = setInterval(() => {
    time--;
    if (time > 0) {
      document.getElementById("countdown-text").innerText = time;
    }
  }, 1000);
});

// The Warning Popup AFTER they focus back in
window.electronAPI.onShowPostWarning(() => {
  if (countdownInterval) clearInterval(countdownInterval);
  hideAllOverlays();
  document.getElementById("post-warning-overlay").style.display = "flex";
});

// Resumes the exam after they acknowledge the warning
function dismissPostWarning() {
  hideAllOverlays();
  window.electronAPI.resumeExam();
}

window.electronAPI.onHideWarning(() => {
  if (countdownInterval) clearInterval(countdownInterval);
  hideAllOverlays();
});