import path from 'path';
import { existsSync } from 'fs';

const binary = path.join(process.cwd(), process.platform === 'win32' ? 'yt-dlp.exe' : 'yt-dlp');

if (existsSync(binary)) {
  console.log('[yt-dlp] Binary already present, skipping download.');
  process.exit(0);
}

console.log('[yt-dlp] Downloading binary...');

try {
  const mod = await import('yt-dlp-wrap');
  const YTDlpWrap = mod.default?.default ?? mod.default ?? mod;
  await YTDlpWrap.downloadFromGithub(binary);
  console.log('[yt-dlp] Downloaded to', binary);
} catch (err) {
  // Non-fatal — server will retry at startup
  console.warn('[yt-dlp] Download skipped:', err.message);
}
