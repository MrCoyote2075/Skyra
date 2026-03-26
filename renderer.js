// Timer
let time = 60;
setInterval(() => {
  time--;
  document.getElementById("timer").innerText = "Time: " + time;

  if (time <= 0) {
    alert("Time up!");
    submitExam();
  }
}, 1000);

// Detect tab switching
document.addEventListener("visibilitychange", () => {
  if (document.hidden) {
    alert("Tab switching detected! 🚫");
    submitExam();
  }
});

// Disable right click
document.addEventListener("contextmenu", (e) => {
  e.preventDefault();
});

// Disable copy
document.addEventListener("keydown", (e) => {
  if (e.ctrlKey && ['c','v','x'].includes(e.key.toLowerCase())) {
    e.preventDefault();
  }
});

function submitExam() {
  alert("Exam Submitted!");
}