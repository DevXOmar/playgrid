import { execFileSync } from "node:child_process";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const ports = ["3000", "4000"];
const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");

function processCwd(pid) {
  try {
    const output = execFileSync("lsof", ["-a", "-p", pid, "-d", "cwd", "-Fn"], { encoding: "utf8" });
    return output
      .split("\n")
      .find((line) => line.startsWith("n"))
      ?.slice(1);
  } catch {
    return "";
  }
}

for (const port of ports) {
  let pids = [];
  try {
    const output = execFileSync("lsof", ["-tiTCP:" + port, "-sTCP:LISTEN"], { encoding: "utf8" }).trim();
    pids = output ? output.split(/\s+/) : [];
  } catch {
    continue;
  }

  for (const pid of pids) {
    let command = "";
    try {
      command = execFileSync("ps", ["-p", pid, "-o", "command="], { encoding: "utf8" }).trim();
    } catch {
      continue;
    }

    const cwd = processCwd(pid);
    const belongsToRepo = Boolean(cwd && resolve(cwd).startsWith(repoRoot));

    if (!belongsToRepo) {
      console.error(`Port ${port} is already used by a non-PLAYGRID process: ${command}`);
      process.exit(1);
    }

    process.kill(Number(pid), "SIGTERM");
    console.log(`Stopped stale PLAYGRID dev process ${pid} on port ${port}`);
  }
}
