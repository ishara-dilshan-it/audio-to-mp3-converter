import { execSync } from 'child_process';
import path from 'path';
import { existsSync } from 'fs';

const isWin = process.platform === 'win32';
const binary = path.join(process.cwd(), isWin ? 'yt-dlp.exe' : 'yt-dlp');

if (existsSync(binary)) {
  console.log('[yt-dlp] Binary already present, skipping download.');
  process.exit(0);
}

console.log('[yt-dlp] Downloading binary...');

if (isWin) {
  // Windows: use PowerShell (local dev — start.bat uses npm run dev, not npm start,
  // so this path rarely runs; ensureYtDlp() in server.ts handles the local case)
  execSync(
    `powershell -Command "Invoke-WebRequest -Uri 'https://github.com/yt-dlp/yt-dlp/releases/latest/download/yt-dlp.exe' -OutFile '${binary}'"`,
    { stdio: 'inherit' }
  );
} else {
  // Linux/macOS (Render): curl is always available
  execSync(
    `curl -fsSL "https://github.com/yt-dlp/yt-dlp/releases/latest/download/yt-dlp" -o "${binary}" && chmod +x "${binary}"`,
    { stdio: 'inherit' }
  );
}

console.log('[yt-dlp] Downloaded to', binary);
