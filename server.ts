import express from 'express';
import { createServer as createViteServer } from 'vite';
import path from 'path';
import { fileURLToPath } from 'url';
import fs from 'fs';
import ytdl from '@distube/ytdl-core';
import YTDlpWrapModule from 'yt-dlp-wrap';
const YTDlpWrap = (YTDlpWrapModule as any).default ?? YTDlpWrapModule;
import cors from 'cors';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// yt-dlp binary — downloaded once on first run, stored next to server
const YT_DLP_BINARY = path.join(process.cwd(), process.platform === 'win32' ? 'yt-dlp.exe' : 'yt-dlp');


async function ensureYtDlp(): Promise<typeof YTDlpWrap> {
  if (!fs.existsSync(YT_DLP_BINARY)) {
    console.log('[yt-dlp] Binary not found — downloading from GitHub...');
    await YTDlpWrap.downloadFromGithub(YT_DLP_BINARY);
    console.log('[yt-dlp] Binary ready:', YT_DLP_BINARY);
  }
  return new YTDlpWrap(YT_DLP_BINARY);
}

async function startServer() {
  const app = express();
  const PORT = parseInt(process.env.PORT || '3000', 10);

  // Initialise yt-dlp binary in the background (non-blocking)
  const ytDlpReady = ensureYtDlp();

  app.use(cors({
    origin: [/localhost/, /127\.0\.0\.1/, /\.github\.io$/],
  }));
  app.use(express.json());

  // Headers required by FFmpeg.wasm (SharedArrayBuffer)
  app.use((_req, res, next) => {
    res.setHeader('Cross-Origin-Opener-Policy', 'same-origin-allow-popups');
    next();
  });

  // API Route — YouTube video info (uses yt-dlp, includes audio file size)
  app.get('/api/youtube/info', async (req, res) => {
    const videoUrl = req.query.url as string;

    if (!videoUrl) return res.status(400).json({ error: 'URL is required' });
    if (!ytdl.validateURL(videoUrl)) return res.status(400).json({ error: 'Invalid YouTube URL' });

    try {
      const ytDlp = await ytDlpReady;
      const info = await ytDlp.getVideoInfo(videoUrl);

      // Find best audio-only format to report its file size
      const audioFormats = ((info.formats as any[]) || []).filter(
        (f: any) => f.vcodec === 'none' && f.acodec && f.acodec !== 'none'
      );
      audioFormats.sort((a: any, b: any) => (b.abr || 0) - (a.abr || 0));
      const bestAudio = audioFormats[0];
      const audioSize: number | null = bestAudio?.filesize ?? bestAudio?.filesize_approx ?? null;

      res.json({
        title: info.title as string,
        thumbnail: info.thumbnail as string || '',
        duration: info.duration as number,
        audioSize,
      });
    } catch (error: any) {
      console.error('[info] Error:', error.message);
      res.status(500).json({
        error: 'Failed to fetch video info',
        details: error.message,
      });
    }
  });

  // API Route — YouTube audio download (uses yt-dlp for reliability)
  app.get('/api/youtube/download', async (req, res) => {
    const videoUrl = req.query.url as string;

    if (!videoUrl) return res.status(400).json({ error: 'URL is required' });
    if (!ytdl.validateURL(videoUrl)) return res.status(400).json({ error: 'Invalid YouTube URL' });

    try {
      const ytDlp = await ytDlpReady;

      // Get title for filename
      const info = await ytDlp.getVideoInfo(videoUrl);
      const title = (info.title as string || 'audio').replace(/[\\/:*?"<>|]/g, '');

      res.header('Content-Disposition', `attachment; filename="${title}.mp4"`);
      res.header('Content-Type', 'audio/mp4');

      // Stream best audio directly to response
      const stream = ytDlp.execStream([
        videoUrl,
        '-f', 'bestaudio',
        '--no-playlist',
        '-o', '-',        // output to stdout
        '--quiet',
      ]);

      stream.on('error', (err: Error) => {
        console.error('[download] Stream error:', err);
        if (!res.headersSent) res.status(500).json({ error: err.message });
        else res.destroy();
      });

      req.on('close', () => stream.destroy());

      stream.pipe(res);
    } catch (error: any) {
      console.error('[download] Error:', error.message);
      if (!res.headersSent) res.status(500).json({ error: error.message });
    }
  });

  // Vite middleware for development
  if (process.env.NODE_ENV !== 'production') {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (_req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

startServer();
