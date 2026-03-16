import { execSync } from "child_process";
import fs from "fs";

let cachedNvencAvailable: boolean | null = null;
let loggedOnce = false;

function hasNvidiaDevice(): boolean {
  // If the container doesn't have /dev/nvidia*, NVENC cannot work even if ffmpeg is compiled with it.
  return fs.existsSync("/dev/nvidia0") || fs.existsSync("/dev/nvidiactl");
}

function nvencSmokeTest(): void {
  // Real runtime test (fast) to ensure libcuda is present and encoder can initialize.
  execSync(
    "ffmpeg -hide_banner -loglevel error -f lavfi -i color=black:s=320x240 -t 0.1 -c:v h264_nvenc -f null -",
    { encoding: "utf-8", stdio: "pipe", timeout: 7000 }
  );
}

export function checkNvencAvailable(logPrefix?: string): boolean {
  if (cachedNvencAvailable !== null) return cachedNvencAvailable;

  if (!hasNvidiaDevice()) {
    cachedNvencAvailable = false;
    if (logPrefix && !loggedOnce) {
      loggedOnce = true;
      console.log(`${logPrefix} NVENC: NOT AVAILABLE (no NVIDIA device in container)`);
    }
    return cachedNvencAvailable;
  }

  try {
    nvencSmokeTest();
    cachedNvencAvailable = true;
  } catch (err: any) {
    cachedNvencAvailable = false;
    if (logPrefix && !loggedOnce) {
      loggedOnce = true;
      const msg = String(err?.stderr || err?.message || err);
      const snippet = msg.length > 500 ? msg.slice(-500) : msg;
      console.log(`${logPrefix} NVENC: NOT AVAILABLE (runtime check failed): ${snippet}`);
    }
  }

  return cachedNvencAvailable;
}
