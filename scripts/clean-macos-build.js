const fs = require("fs");
const path = require("path");
const { execFileSync } = require("child_process");

const projectRoot = path.resolve(__dirname, "..");
const distPath = path.join(projectRoot, "dist");

function removeDist() {
  fs.rmSync(distPath, { recursive: true, force: true });
}

function clearExtendedAttributes(targetPath) {
  if (process.platform !== "darwin") return;

  try {
    execFileSync("xattr", ["-cr", targetPath], { stdio: "inherit" });
  } catch (error) {
    console.warn(`xattr cleanup skipped: ${error.message}`);
  }
}

removeDist();
clearExtendedAttributes(projectRoot);
