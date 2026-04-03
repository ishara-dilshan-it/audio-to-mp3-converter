# WANX Audio to MP3 Converter

![PWA](https://img.shields.io/badge/PWA-enabled-blueviolet)
![License](https://img.shields.io/badge/license-Apache--2.0-blue)
![React](https://img.shields.io/badge/React-19-61dafb)
![TypeScript](https://img.shields.io/badge/TypeScript-5.8-3178c6)

> A privacy-focused Progressive Web App that converts audio/video files to MP3 locally on your device and transcribes YouTube videos using Google's Gemini AI — no file uploads, no server processing.

---

## Features

- **Batch MP3 Conversion** — Convert multiple audio/video files (MP4, WAV, AAC, OGG, FLAC, etc.) to high-quality MP3 simultaneously, up to 3 files in parallel
- **100% Local Processing** — FFmpeg runs entirely in your browser via WebAssembly; your files never leave your device
- **YouTube AI Transcriber** — Extract key points, summaries, and timestamped highlights from any YouTube video using Gemini AI
- **Offline Support** — Installable as a PWA with full offline capability for the MP3 converter
- **Real-time Progress** — Live progress tracking for each conversion job
- **Dark / Light Theme** — Toggle between themes; preference is saved automatically
- **Google Sign-In** — Optional authentication for YouTube transcription features
- **Transcription History** — Past transcriptions saved locally in your browser

---

## Tech Stack

| Layer | Technology |
|---|---|
| Frontend Framework | React 19 + TypeScript 5.8 |
| Build Tool | Vite 6 |
| Styling | Tailwind CSS 4, Lucide icons, Motion animations |
| Audio/Video Processing | FFmpeg via WebAssembly (`@ffmpeg/ffmpeg`) |
| AI Transcription | Google Gemini AI (`@google/genai`) |
| Authentication | Firebase Auth (Google Sign-In) |
| Database | Firebase Firestore (user profiles) |
| Backend | Express 4 (YouTube audio proxy) |
| PWA | vite-plugin-pwa (Workbox) |
| Mobile (optional) | Capacitor 8 (Android) |

---

## Prerequisites

- **Node.js 16 or higher** — [Download here](https://nodejs.org/)
- **npm** (comes with Node.js)
- **Gemini API Key** *(optional — required for YouTube transcription)*
  - Get a free key at [Google AI Studio](https://aistudio.google.com/app/apikey)

---

## Getting Started

### Quick Start (Windows)

Double-click `start.bat` in the project folder. It will install dependencies and start the app automatically.

### Quick Start (Linux / macOS)

```bash
chmod +x run.sh
./run.sh
```

### Manual Setup

1. **Install dependencies**

   ```bash
   npm install
   ```

2. **Set up environment variables**

   Copy the example env file and add your Gemini API key:

   ```bash
   cp .env.example .env
   ```

   Open `.env` and fill in your key:

   ```
   GEMINI_API_KEY=your_gemini_api_key_here
   ```

   > You can also enter the API key directly in the app's Settings panel — it will be stored in your browser's local storage.

3. **Start the development server**

   ```bash
   npm run dev
   ```

4. Open your browser at `http://localhost:3000`

---

## Environment Variables

| Variable | Required | Description |
|---|---|---|
| `GEMINI_API_KEY` | Optional | Google Gemini API key for YouTube transcription. Get one free at [aistudio.google.com](https://aistudio.google.com/app/apikey) |

> The API key is only used server-side to call Gemini. It is never exposed to the browser or sent to any third-party service.

---

## Available Scripts

| Command | Description |
|---|---|
| `npm run dev` | Start the development server at `localhost:3000` with hot reload |
| `npm run build` | Build the optimised production bundle into `dist/` |
| `npm run preview` | Preview the production build locally |
| `npm run clean` | Delete the `dist/` folder |
| `npm run lint` | Run TypeScript type-checking (no output emitted) |

---

## Using the App

### Tool 1 — Batch MP3 Converter

> Watch the [Video Tutorial](https://drive.google.com/file/d/1ywiBLxFOyjkem-Ke-I5yJIltfRG-rjwM/view?usp=sharing) for a step-by-step walkthrough.

1. **Add files** — Drag and drop audio/video files onto the upload area, or click to browse. Supported formats include MP4, WAV, AAC, OGG, FLAC, WebM, and more.
2. **Review the queue** — Each file appears as a card showing its name and size.
3. **Convert** — Click **Convert All**. Up to 3 files are processed simultaneously. Progress bars update in real time.
4. **Download** — Once conversion is complete, click the **Download** button on any file card to save the MP3.

> All conversion happens locally in your browser using WebAssembly. No files are uploaded anywhere.

---

### Tool 2 — YouTube Transcriber

> Watch the [Video Tutorial](https://drive.google.com/file/d/1ywiBLxFOyjkem-Ke-I5yJIltfRG-rjwM/view?usp=sharing) for a step-by-step walkthrough.

1. **Sign in** — Click **Sign in with Google** (required for YouTube access).
2. **Enter your API key** *(first-time setup)* — Click the Settings icon (gear) and paste your [Gemini API key](https://aistudio.google.com/app/apikey). It is saved to your browser automatically.
3. **Paste a YouTube URL** — Enter any public YouTube video URL in the input field.
4. **Choose a transcription mode**
   - **Standard** — Fast summary using Gemini
   - **Enhanced** — Uses Gemini with web search grounding for more accurate results
5. **Transcribe** — Click **Transcribe**. The app fetches audio from YouTube, sends it to Gemini, and returns a structured summary with key points and timestamps.
6. **Export / Copy** — Use the copy or download buttons to save the transcription output as text.
7. **History** — Previous transcriptions are listed in the History panel and stored in your browser.

---

## PWA Installation

Install the app as a native-like application on desktop and mobile — no app store required.

### Desktop (Chrome / Edge)

1. Open the app in Chrome or Edge
2. Look for the **Install** icon in the browser address bar (right side)
3. Click it and confirm — the app opens in its own window without browser chrome

### Mobile — Android (Chrome)

1. Open the app in **Chrome**
2. Tap the menu button (**⋮**, top right)
3. Tap **Add to Home Screen** → **Add**

### Mobile — iOS (Safari)

1. Open the app in **Safari**
2. Tap the **Share** button (bottom centre)
3. Scroll down and tap **Add to Home Screen** → **Add**

Once installed, the app launches in full-screen standalone mode and the MP3 converter works offline.

---

## Android Build (Capacitor)

The project includes a Capacitor configuration for building a native Android APK.

```bash
# Build the web app first
npm run build

# Sync web assets to the Android project
npx cap sync android

# Open in Android Studio
npx cap open android
```

> Android Studio is required to build and install the APK. The app ID is `com.torchlight.app`.

---

## Project Structure

```
audio-to-mp3-converter/
├── src/
│   ├── App.tsx          # Main UI — MP3 converter + YouTube transcriber
│   ├── main.tsx         # React entry point
│   ├── firebase.ts      # Firebase auth & Firestore setup
│   └── index.css        # Global styles & theme CSS variables
├── server.ts            # Express backend — YouTube audio proxy & static serving
├── vite.config.ts       # Vite + PWA plugin configuration
├── capacitor.config.ts  # Mobile (Android) configuration
├── index.html           # HTML shell
├── .env.example         # Environment variable template — copy to .env
├── start.bat            # Windows one-click launcher
├── run.sh               # Linux/macOS one-click launcher
├── dist/                # Production build output (generated)
└── android/             # Capacitor Android project
```

---

## Privacy & Security

- **Your files stay on your device.** The MP3 converter uses FFmpeg compiled to WebAssembly — audio and video files are processed entirely in your browser and never uploaded to any server.
- **Your API key is yours.** If you enter a Gemini API key in Settings, it is stored only in your browser's local storage and is never sent to this app's servers.
- **YouTube audio is proxied server-side** only to work around YouTube's bot-detection headers. The audio stream goes directly to your browser for local conversion and is not stored anywhere.
- **Firestore access is scoped per user.** Security rules ensure each signed-in user can only read and write their own data.
- **Transcription history is local.** Past transcriptions are stored in your browser's local storage only — they are not synced to any server.

---

## License

Licensed under the [Apache-2.0 License](https://www.apache.org/licenses/LICENSE-2.0).
