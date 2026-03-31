/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

/// <reference lib="dom" />

import { useState, useRef, useEffect, useCallback } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { FFmpeg } from '@ffmpeg/ffmpeg';
import { fetchFile, toBlobURL } from '@ffmpeg/util';
import { UploadCloud, FileAudio, Loader2, Download, CheckCircle2, Music, AlertCircle, Sun, Moon, Youtube, FileText, Copy, Trash2, Clock, Check, Settings, History, X } from 'lucide-react';
import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';
import { GoogleGenAI } from '@google/genai';
import ReactMarkdown from 'react-markdown';

function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

type FileStatus = 'queued' | 'converting' | 'finished' | 'error' | 'stopped';

interface ConversionTask {
  id: string;
  file: File;
  status: FileStatus;
  progress: number;
  url?: string;
  error?: string;
  saved?: boolean;
}

const MAX_CONCURRENT = 3;

interface TranscriptionHistoryItem {
  id: string;
  url: string;
  title: string;
  content: string;
  timestamp: number;
  model: string;
}

export default function App() {
  const [activeTool, setActiveTool] = useState<'mp3-converter' | 'youtube-transcriber'>('mp3-converter');
  const [loaded, setLoaded] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [downloadInfo, setDownloadInfo] = useState({ loaded: 0, total: 0 });
  const isLoadingRef = useRef(false);

  const [tasks, setTasks] = useState<ConversionTask[]>([]);
  const [activeTab, setActiveTab] = useState<'converting' | 'finished'>('converting');
  const [freeInstances, setFreeInstances] = useState(0);

  const ffmpegPool = useRef<{ id: number; instance: FFmpeg; busy: boolean; currentTaskId: string | null }[]>([]);
  const coreUrlRef = useRef<string | null>(null);
  const wasmUrlRef = useRef<string | null>(null);

  // Theme state
  const [theme, setTheme] = useState<'light' | 'dark'>(() => {
    if (typeof window !== 'undefined') {
      const saved = localStorage.getItem('theme');
      if (saved === 'dark' || saved === 'light') return saved;
      return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
    }
    return 'light';
  });

  // Apply theme class to document
  useEffect(() => {
    const root = window.document.documentElement;
    if (theme === 'dark') {
      root.classList.add('dark');
      root.style.setProperty('color-scheme', 'dark');
    } else {
      root.classList.remove('dark');
      root.style.setProperty('color-scheme', 'light');
    }
    localStorage.setItem('theme', theme);
  }, [theme]);

  const toggleTheme = () => {
    setTheme((prev) => (prev === 'light' ? 'dark' : 'light'));
  };

  const YoutubeTranscriber = () => {
    const [url, setUrl] = useState('');
    const [videoTitle, setVideoTitle] = useState('');
    const [selectedModel, setSelectedModel] = useState('gemini-3-flash-preview');
    const [useSearch, setUseSearch] = useState(false);
    const [transcription, setTranscription] = useState('');
    const [isTranscribing, setIsTranscribing] = useState(false);
    const [copySuccess, setCopySuccess] = useState<string | null>(null);
    const [isSettingsOpen, setIsSettingsOpen] = useState(false);
    const [isHistoryOpen, setIsHistoryOpen] = useState(false);

    const [history, setHistory] = useState<TranscriptionHistoryItem[]>(() => {
      if (typeof window !== 'undefined') {
        const saved = localStorage.getItem('transcription_history');
        return saved ? JSON.parse(saved) : [];
      }
      return [];
    });

    useEffect(() => {
      localStorage.setItem('transcription_history', JSON.stringify(history));
    }, [history]);

    const copyToClipboard = async (text: string, id: string) => {
      try {
        await navigator.clipboard.writeText(text);
        setCopySuccess(id);
        setTimeout(() => setCopySuccess(null), 2000);
      } catch (err) {
        console.error('Failed to copy text: ', err);
      }
    };

    const deleteHistoryItem = (id: string) => {
      setHistory(prev => prev.filter(item => item.id !== id));
    };

    const clearHistory = () => {
      if (window.confirm('Are you sure you want to clear all transcription history?')) {
        setHistory([]);
      }
    };

    const [userApiKey, setUserApiKey] = useState(() => {
      if (typeof window !== 'undefined') {
        return localStorage.getItem('GEMINI_API_KEY') || '';
      }
      return '';
    });

    const effectiveApiKey = process.env.GEMINI_API_KEY || userApiKey;

    const handleTranscribe = async () => {
      if (!url) return;
      if (!effectiveApiKey) {
        setTranscription('Error: Gemini API Key is missing. Please provide it in the **Settings** menu. \n\n[Get a free Gemini API key here](https://aistudio.google.com/app/apikey)');
        return;
      }
      setIsTranscribing(true);
      setTranscription('');
      try {
        console.log("Starting transcription for:", url, videoTitle ? `(Title: ${videoTitle})` : "", `Model: ${selectedModel}`);
        const ai = new GoogleGenAI({ apiKey: effectiveApiKey });
        
        // Create a timeout promise (increased to 120s)
        const timeoutPromise = new Promise((_, reject) =>
          setTimeout(() => reject(new Error('Transcription request timed out')), 120000)
        );

        const transcriptionPromise = ai.models.generateContent({
          model: selectedModel,
          contents: useSearch 
            ? `I want you to act as an expert summarizer for the YouTube video located at this exact URL: ${url}. 
${videoTitle ? `The user has provided the following title for the video: "${videoTitle}". Use this to help identify the correct video.` : ""}

First, use Google Search to identify the exact title and channel name for this video. 
Then, search for the transcript, detailed summary, or key points of this specific video. 

Please provide the summary in the following exact format:

The video "[Video Title]" from the channel **[Channel Name]** [brief description of what the video is about].

Here are the key points and examples shared in the video:

### [Number]. [Point Title]
* **Point:** [Brief explanation of the point]. [[Timestamp: MM:SS]]
* **Example:** [Examples provided in the video]. [[Timestamp: MM:SS]]

(Leave a blank line between each numbered point block)

... (Repeat for all points)

Watch the full video here: [${url}](${url})
![Video Thumbnail](https://img.youtube.com/vi/${url.match(/(?:v=|\/)([0-9A-Za-z_-]{11}).*/)?.[1] || ''}/maxresdefault.jpg)

IMPORTANT:
- Use "### [Number]. [Point Title]" for the main points to ensure they stand out.
- Use bullet points (*) for "Point:" and "Example:" under each numbered point.
- Use "Point:" instead of "The Point:".
- Use "Example:" instead of "Examples:".
- Bold the labels **Point:** and **Example:**.
- Ensure there is a blank line between each numbered point block for better readability.
- You MUST make every effort to find the actual timestamps (e.g., [00:07]). If they are absolutely not findable after searching, you may omit the timestamp bracket, but do NOT use the phrase "Timestamp unavailable".
- If you cannot find the video details at all, explain what you searched for and ask if the user can provide the video title to help you find the transcript.`
            : `I want you to act as an expert summarizer for the YouTube video at: ${url}.
${videoTitle ? `The video title is: "${videoTitle}".` : ""}

Please access the video content and provide a detailed summary in this format:

The video "[Video Title]" from the channel **[Channel Name]** [brief description].

### [Number]. [Point Title]
* **Point:** [Explanation]. [[Timestamp: MM:SS]]
* **Example:** [Examples]. [[Timestamp: MM:SS]]

(Leave a blank line between points)

Watch the full video here: [${url}](${url})
![Video Thumbnail](https://img.youtube.com/vi/${url.match(/(?:v=|\/)([0-9A-Za-z_-]{11}).*/)?.[1] || ''}/maxresdefault.jpg)

Note: If you cannot access the transcript directly, provide a summary based on the video metadata and your knowledge.`,
          config: {
            tools: useSearch ? [{ googleSearch: {} }] : [],
          },
        });

        const response = (await Promise.race([transcriptionPromise, timeoutPromise])) as any;
        console.log("Transcription received:", response);
        const content = response.text || 'No transcription available.';
        setTranscription(content);

        // Add to history
        if (response.text) {
          const newItem: TranscriptionHistoryItem = {
            id: Date.now().toString(),
            url,
            title: videoTitle || 'Untitled Video',
            content,
            timestamp: Date.now(),
            model: selectedModel
          };
          setHistory(prev => [newItem, ...prev]);
        }
      } catch (err: any) {
        console.error("Transcription error:", err);
        let errorMessage = 'Error transcribing video. Please check the URL and try again.';
        
        if (err?.message?.includes('429') || err?.message?.includes('RESOURCE_EXHAUSTED')) {
          errorMessage = 'Rate limit reached. The free tier has a limit on how much data you can process per minute. Please wait about 60 seconds and try again.';
        } else if (err instanceof Error) {
          errorMessage = `Error transcribing video: ${err.message}`;
        }
        
        setTranscription(errorMessage);
      } finally {
        setIsTranscribing(false);
      }
    };

    return (
      <div className="space-y-4 relative">
        <div className="flex items-center justify-between mb-2">
          <div className="flex items-center gap-2">
            <button
              onClick={() => setIsHistoryOpen(true)}
              className="p-2 bg-zinc-100 dark:bg-zinc-800 rounded-lg hover:bg-zinc-200 dark:hover:bg-zinc-700 transition-colors text-zinc-600 dark:text-zinc-400 flex items-center gap-2 text-xs font-bold uppercase tracking-wider"
              title="View History"
            >
              <History className="w-4 h-4" />
              History
            </button>
          </div>
          <button
            onClick={() => setIsSettingsOpen(true)}
            className="p-2 bg-zinc-100 dark:bg-zinc-800 rounded-lg hover:bg-zinc-200 dark:hover:bg-zinc-700 transition-colors text-zinc-600 dark:text-zinc-400 flex items-center gap-2 text-xs font-bold uppercase tracking-wider"
            title="Settings"
          >
            <Settings className="w-4 h-4" />
            Settings
          </button>
        </div>

        <div className="space-y-2">
          <label className="text-xs font-semibold text-zinc-500 dark:text-zinc-400 uppercase tracking-wider">YouTube URL</label>
          <input
            type="text"
            value={url}
            onChange={(e) => setUrl((e.target as HTMLInputElement).value)}
            placeholder="Paste YouTube URL here..."
            className="w-full p-3 rounded-xl border border-zinc-200 dark:border-zinc-700 bg-zinc-50 dark:bg-zinc-800 focus:outline-none focus:ring-2 focus:ring-indigo-500"
          />
        </div>
        <div className="space-y-2">
          <label className="text-xs font-semibold text-zinc-500 dark:text-zinc-400 uppercase tracking-wider">Video Title (Optional)</label>
          <input
            type="text"
            value={videoTitle}
            onChange={(e) => setVideoTitle((e.target as HTMLInputElement).value)}
            placeholder="Enter video title if known..."
            className="w-full p-3 rounded-xl border border-zinc-200 dark:border-zinc-700 bg-zinc-50 dark:bg-zinc-800 focus:outline-none focus:ring-2 focus:ring-indigo-500"
          />
        </div>

        <button
          onClick={handleTranscribe}
          disabled={isTranscribing}
          className="relative w-full py-3 bg-indigo-600 text-white rounded-xl hover:bg-indigo-700 transition disabled:opacity-100 overflow-hidden"
        >
          {isTranscribing ? (
            <>
              <div className="absolute inset-0 bg-indigo-800 animate-pulse" style={{ width: '100%' }}></div>
              <span className="relative z-10">Transcribing...</span>
            </>
          ) : (
            <span className="relative z-10">Transcribe</span>
          )}
        </button>

        {transcription && (
          <div className="relative group p-6 bg-zinc-100 dark:bg-zinc-800 rounded-xl text-sm text-zinc-700 dark:text-zinc-300 space-y-4 prose dark:prose-invert max-w-none
            [&>h3]:text-lg [&>h3]:font-bold [&>h3]:mb-4 [&>h3]:mt-6 [&>h3]:text-zinc-900 dark:[&>h3]:text-white
            [&>ul]:list-disc [&>ul]:ml-6 [&>ul]:space-y-2 [&>ul]:mb-6
            [&>p]:mb-4 [&>p]:leading-relaxed">
            <button
              onClick={() => copyToClipboard(transcription, 'current')}
              className="absolute top-4 right-4 p-2 bg-white dark:bg-zinc-700 border border-zinc-200 dark:border-zinc-600 rounded-lg shadow-sm hover:bg-zinc-50 dark:hover:bg-zinc-600 transition-all z-10"
              title="Copy transcription"
            >
              {copySuccess === 'current' ? (
                <Check className="w-4 h-4 text-emerald-500" />
              ) : (
                <Copy className="w-4 h-4 text-zinc-500 dark:text-zinc-400" />
              )}
            </button>
            <ReactMarkdown
              components={{
                a: ({ node, ...props }) => (
                  <a 
                    {...props} 
                    target="_blank" 
                    rel="noopener noreferrer" 
                    className="text-indigo-600 dark:text-indigo-400 underline hover:text-indigo-800 dark:hover:text-indigo-300 transition-colors"
                  />
                )
              }}
            >
              {transcription}
            </ReactMarkdown>
          </div>
        )}

        {/* Settings Dialog */}
        <AnimatePresence>
          {isSettingsOpen && (
            <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm">
              <motion.div
                initial={{ opacity: 0, scale: 0.95, y: 20 }}
                animate={{ opacity: 1, scale: 1, y: 0 }}
                exit={{ opacity: 0, scale: 0.95, y: 20 }}
                className="bg-white dark:bg-zinc-900 w-full max-w-md rounded-2xl shadow-2xl overflow-hidden border border-zinc-200 dark:border-zinc-800"
              >
                <div className="p-6 border-b border-zinc-100 dark:border-zinc-800 flex items-center justify-between">
                  <h2 className="text-xl font-bold text-zinc-900 dark:text-white flex items-center gap-2">
                    <Settings className="w-5 h-5" />
                    Transcription Settings
                  </h2>
                  <button onClick={() => setIsSettingsOpen(false)} className="p-2 hover:bg-zinc-100 dark:hover:bg-zinc-800 rounded-full transition-colors">
                    <X className="w-5 h-5 text-zinc-500" />
                  </button>
                </div>
                <div className="p-6 space-y-6">
                  <div className="space-y-2">
                    <label className="text-xs font-semibold text-zinc-500 dark:text-zinc-400 uppercase tracking-wider">AI Model</label>
                    <select
                      value={selectedModel}
                      onChange={(e) => setSelectedModel((e.target as HTMLSelectElement).value)}
                      className="w-full p-3 rounded-xl border border-zinc-200 dark:border-zinc-700 bg-zinc-50 dark:bg-zinc-800 focus:outline-none focus:ring-2 focus:ring-indigo-500 appearance-none cursor-pointer"
                    >
                      <option value="gemini-3.1-pro-preview">Gemini 3.1 Pro (Best Reasoning)</option>
                      <option value="gemini-3-flash-preview">Gemini 3 Flash (Fast & Balanced)</option>
                      <option value="gemini-3.1-flash-lite-preview">Gemini 3.1 Flash Lite (Fastest)</option>
                    </select>
                  </div>
                  <div className="space-y-2">
                    <label className="text-xs font-semibold text-zinc-500 dark:text-zinc-400 uppercase tracking-wider">Search Mode</label>
                    <select
                      value={useSearch ? 'true' : 'false'}
                      onChange={(e) => setUseSearch((e.target as HTMLSelectElement).value === 'true')}
                      className="w-full p-3 rounded-xl border border-zinc-200 dark:border-zinc-700 bg-zinc-50 dark:bg-zinc-800 focus:outline-none focus:ring-2 focus:ring-indigo-500 appearance-none cursor-pointer"
                    >
                      <option value="false">Standard (Faster, avoids rate limits)</option>
                      <option value="true">Enhanced (Uses Search, prone to limits)</option>
                    </select>
                  </div>
                  {!process.env.GEMINI_API_KEY && (
                    <div className="space-y-2 p-4 bg-amber-50 dark:bg-amber-500/10 border border-amber-200 dark:border-amber-500/20 rounded-xl">
                      <div className="flex items-center justify-between mb-2">
                        <div className="flex items-center gap-2 text-amber-800 dark:text-amber-400">
                          <AlertCircle className="w-4 h-4" />
                          <span className="text-xs font-bold uppercase tracking-wider">API Key Required</span>
                        </div>
                        <a 
                          href="https://aistudio.google.com/app/apikey" 
                          target="_blank" 
                          rel="noopener noreferrer"
                          className="text-[10px] font-bold text-amber-700 dark:text-amber-500 underline hover:text-amber-900 dark:hover:text-amber-300 transition-colors uppercase tracking-wider"
                        >
                          Get Key
                        </a>
                      </div>
                      <input
                        type="password"
                        value={userApiKey}
                        onChange={(e) => {
                          const val = (e.target as HTMLInputElement).value;
                          setUserApiKey(val);
                          localStorage.setItem('GEMINI_API_KEY', val);
                        }}
                        placeholder="Paste your Gemini API Key here..."
                        className="w-full p-2.5 text-sm rounded-lg border border-amber-200 dark:border-amber-500/30 bg-white dark:bg-zinc-900 focus:outline-none focus:ring-2 focus:ring-amber-500"
                      />
                      <p className="mt-2 text-[10px] text-amber-600/80 dark:text-amber-500/60 leading-tight">
                        Your key is stored locally in your browser and never sent to our servers.
                      </p>
                    </div>
                  )}
                </div>
                <div className="p-6 bg-zinc-50 dark:bg-zinc-800/50 border-t border-zinc-100 dark:border-zinc-800">
                  <button
                    onClick={() => setIsSettingsOpen(false)}
                    className="w-full py-3 bg-zinc-900 dark:bg-white text-white dark:text-zinc-900 rounded-xl font-bold hover:opacity-90 transition"
                  >
                    Done
                  </button>
                </div>
              </motion.div>
            </div>
          )}
        </AnimatePresence>

        {/* History Dialog */}
        <AnimatePresence>
          {isHistoryOpen && (
            <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm">
              <motion.div
                initial={{ opacity: 0, scale: 0.95, y: 20 }}
                animate={{ opacity: 1, scale: 1, y: 0 }}
                exit={{ opacity: 0, scale: 0.95, y: 20 }}
                className="bg-white dark:bg-zinc-900 w-full max-w-2xl h-[80vh] rounded-2xl shadow-2xl overflow-hidden border border-zinc-200 dark:border-zinc-800 flex flex-col"
              >
                <div className="p-6 border-b border-zinc-100 dark:border-zinc-800 flex items-center justify-between">
                  <h2 className="text-xl font-bold text-zinc-900 dark:text-white flex items-center gap-2">
                    <History className="w-5 h-5" />
                    Transcription History
                  </h2>
                  <div className="flex items-center gap-2">
                    {history.length > 0 && (
                      <button
                        onClick={clearHistory}
                        className="text-xs font-semibold text-red-500 hover:text-red-600 transition-colors uppercase tracking-wider mr-4"
                      >
                        Clear All
                      </button>
                    )}
                    <button onClick={() => setIsHistoryOpen(false)} className="p-2 hover:bg-zinc-100 dark:hover:bg-zinc-800 rounded-full transition-colors">
                      <X className="w-5 h-5 text-zinc-500" />
                    </button>
                  </div>
                </div>
                <div className="flex-1 overflow-y-auto p-6 space-y-4">
                  {history.length === 0 ? (
                    <div className="h-full flex flex-col items-center justify-center text-zinc-500 space-y-2">
                      <Clock className="w-12 h-12 opacity-20" />
                      <p className="text-sm font-medium">No history yet</p>
                    </div>
                  ) : (
                    history.map((item) => (
                      <div key={item.id} className="p-4 bg-zinc-50 dark:bg-zinc-800/50 border border-zinc-200 dark:border-zinc-700 rounded-xl hover:border-indigo-500/50 transition-all group">
                        <div className="flex justify-between items-start mb-2">
                          <div className="space-y-1">
                            <h3 className="text-sm font-bold text-zinc-900 dark:text-white line-clamp-1">{item.title}</h3>
                            <div className="flex items-center gap-3 text-[10px] text-zinc-500 dark:text-zinc-400 uppercase tracking-widest font-semibold">
                              <span className="flex items-center gap-1">
                                <Clock className="w-3 h-3" />
                                {new Date(item.timestamp).toLocaleDateString()}
                              </span>
                              <span className="px-1.5 py-0.5 bg-zinc-200 dark:bg-zinc-700 rounded text-zinc-600 dark:text-zinc-300">
                                {item.model.split('-')[1]}
                              </span>
                            </div>
                          </div>
                          <div className="flex items-center gap-1">
                            <button
                              onClick={() => copyToClipboard(item.content, item.id)}
                              className="p-1.5 hover:bg-zinc-200 dark:hover:bg-zinc-700 rounded-lg transition-colors text-zinc-500 dark:text-zinc-400"
                              title="Copy content"
                            >
                              {copySuccess === item.id ? (
                                <Check className="w-3.5 h-3.5 text-emerald-500" />
                              ) : (
                                <Copy className="w-3.5 h-3.5" />
                              )}
                            </button>
                            <button
                              onClick={() => deleteHistoryItem(item.id)}
                              className="p-1.5 hover:bg-red-100 dark:hover:bg-red-500/20 rounded-lg transition-colors text-zinc-500 dark:text-zinc-400 hover:text-red-500"
                              title="Delete item"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        </div>
                        <p className="text-xs text-zinc-600 dark:text-zinc-400 line-clamp-2 mb-3 leading-relaxed">
                          {item.content.replace(/[#*]/g, '').substring(0, 150)}...
                        </p>
                        <button
                          onClick={() => {
                            setTranscription(item.content);
                            setIsHistoryOpen(false);
                          }}
                          className="text-[10px] font-bold text-indigo-600 dark:text-indigo-400 hover:text-indigo-700 dark:hover:text-indigo-300 uppercase tracking-widest flex items-center gap-1"
                        >
                          View Full Transcription
                        </button>
                      </div>
                    ))
                  )}
                </div>
              </motion.div>
            </div>
          )}
        </AnimatePresence>
      </div>
    );
  };

  const load = async () => {
    if (loaded || isLoadingRef.current) return;
    isLoadingRef.current = true;
    setIsLoading(true);
    setError(null);
    setDownloadInfo({ loaded: 0, total: 0 });
    
    console.log("[FFmpeg] Starting load sequence...");
    const baseURL = 'https://unpkg.com/@ffmpeg/core@0.12.10/dist/esm';

    try {
      console.log("[FFmpeg] Loading core and wasm...");
      
      // We use toBlobURL to load the files, which is the recommended way for v0.12+
      // This handles the MIME types and blob creation correctly.
      const coreURL = await toBlobURL(`${baseURL}/ffmpeg-core.js`, 'text/javascript');
      const wasmURL = await toBlobURL(`${baseURL}/ffmpeg-core.wasm`, 'application/wasm');
      
      console.log("[FFmpeg] Initializing FFmpeg pool...");
      ffmpegPool.current = [];
      coreUrlRef.current = coreURL;
      wasmUrlRef.current = wasmURL;
      
      await Promise.all(
        Array.from({ length: MAX_CONCURRENT }).map(async (_, i) => {
          const ffmpeg = new FFmpeg();
          await ffmpeg.load({
            coreURL,
            wasmURL,
          });
          ffmpegPool.current.push({ id: i, instance: ffmpeg, busy: false, currentTaskId: null });
        })
      );
      
      console.log("[FFmpeg] Pool load complete!");
      setLoaded(true);
      setFreeInstances(MAX_CONCURRENT);
    } catch (err: any) {
      console.error("[FFmpeg] Failed to load FFmpeg:", err);
      setError(`Failed to load the conversion engine: ${err?.message || 'Unknown error'}. Please check your console for details.`);
    } finally {
      setIsLoading(false);
      isLoadingRef.current = false;
    }
  };

  useEffect(() => {
    load();
  }, []);

  const stopTask = async (task: ConversionTask) => {
    setTasks(prev => prev.map(t => t.id === task.id ? { ...t, status: 'stopped' } : t));
    
    const poolItem = ffmpegPool.current.find(p => p.currentTaskId === task.id);
    if (poolItem) {
      poolItem.instance.terminate();
      
      // Re-initialize the instance
      const ffmpeg = new FFmpeg();
      await ffmpeg.load({
        coreURL: coreUrlRef.current!,
        wasmURL: wasmUrlRef.current!,
      });
      poolItem.instance = ffmpeg;
      poolItem.busy = false;
      poolItem.currentTaskId = null;
      setFreeInstances(prev => prev + 1);
    }
  };

  const restartTask = (task: ConversionTask) => {
    setTasks(prev => prev.map(t => t.id === task.id ? { ...t, status: 'queued', progress: 0 } : t));
  };

  const startConversion = async (task: ConversionTask, poolItem: { id: number, instance: FFmpeg, busy: boolean, currentTaskId: string | null }) => {
    poolItem.busy = true;
    poolItem.currentTaskId = task.id;
    setFreeInstances(prev => prev - 1);
    
    setTasks(prev => prev.map(t => t.id === task.id ? { ...t, status: 'converting', progress: 0 } : t));

    const ffmpeg = poolItem.instance;
    
    if (!ffmpeg.loaded) {
      await ffmpeg.load({
        coreURL: coreUrlRef.current!,
        wasmURL: wasmUrlRef.current!,
      });
    }
    
    const onProgress = ({ progress }: { progress: number }) => {
      const p = Math.max(0, Math.min(100, Math.round(progress * 100)));
      setTasks(prev => prev.map(t => t.id === task.id ? { ...t, progress: p } : t));
    };
    
    ffmpeg.on('progress', onProgress);

    try {
      const extMatch = task.file.name.match(/\.[0-9a-z]+$/i);
      const ext = extMatch ? extMatch[0] : '.tmp';
      const inputName = `input_${task.id}${ext}`;
      const outputName = `output_${task.id}.mp3`;

      await ffmpeg.writeFile(inputName, await fetchFile(task.file));
      await ffmpeg.exec(['-i', inputName, '-q:a', '0', '-map', 'a', outputName]);
      const data = await ffmpeg.readFile(outputName);
      const url = URL.createObjectURL(new Blob([data as Uint8Array], { type: 'audio/mp3' }));
      
      setTasks(prev => prev.map(t => t.id === task.id ? { ...t, status: 'finished', url, progress: 100 } : t));
      
      try {
        await ffmpeg.deleteFile(inputName);
        await ffmpeg.deleteFile(outputName);
      } catch (e) {}
    } catch (err: any) {
      // Check if it was stopped
      if (err.message !== 'called FFmpeg.terminate()') {
        console.error("Conversion error:", err);
        setTasks(prev => prev.map(t => t.id === task.id ? { ...t, status: 'error', error: err?.message || 'Conversion failed' } : t));
      }
    } finally {
      ffmpeg.off('progress', onProgress);
      poolItem.busy = false;
      poolItem.currentTaskId = null;
      setFreeInstances(prev => prev + 1);
    }
  };

  useEffect(() => {
    if (freeInstances > 0) {
      const queuedTasks = tasks.filter(t => t.status === 'queued');
      if (queuedTasks.length > 0) {
        const poolItem = ffmpegPool.current.find(p => !p.busy);
        if (poolItem) {
          startConversion(queuedTasks[0], poolItem);
        }
      }
    }
  }, [tasks, freeInstances]);

  const handleFiles = (files: FileList | File[]) => {
    const newFiles = Array.from(files).filter(f => f.type.startsWith('audio/') || f.type.startsWith('video/'));
    
    if (newFiles.length === 0) return;

    const newTasks: ConversionTask[] = newFiles.map(file => ({
      id: Math.random().toString(36).substring(2, 9),
      file,
      status: 'queued',
      progress: 0
    }));

    setTasks(prev => [...prev, ...newTasks]);
    setActiveTab('converting');
  };

  const onDrop = useCallback((e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setIsDragging(false);
    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      handleFiles(e.dataTransfer.files);
    }
  }, []);

  const handleFileInput = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      handleFiles(e.target.files);
    }
    e.target.value = '';
  };

  const handleSave = async (task: ConversionTask) => {
    if (!task.url) return;
    
    const defaultName = `${task.file.name.replace(/\.[^/.]+$/, "")}_mp3.mp3`;
    
    try {
      const a = document.createElement('a');
      a.href = task.url;
      a.download = defaultName;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      
      setTasks(prev => prev.map(t => t.id === task.id ? { ...t, saved: true } : t));
    } catch (err: any) {
      if (err.name !== 'AbortError') {
        console.error('Failed to save file:', err);
      }
    }
  };

  const activeTasks = tasks.filter(t => t.status === 'queued' || t.status === 'converting' || t.status === 'error' || t.status === 'stopped');
  const finishedTasks = tasks.filter(t => t.status === 'finished');

  return (
    <div className="min-h-screen bg-zinc-50 dark:bg-zinc-950 flex flex-col items-center justify-center p-4 font-sans text-zinc-900 dark:text-zinc-100 transition-colors duration-300">
      
      {/* Theme Toggle */}
      <button
        onClick={toggleTheme}
        className="absolute top-6 right-6 p-2.5 rounded-full bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 text-zinc-500 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-zinc-100 shadow-sm transition-all hover:scale-105 active:scale-95"
        aria-label="Toggle theme"
      >
        {theme === 'light' ? <Moon className="w-5 h-5" /> : <Sun className="w-5 h-5" />}
      </button>

      <div className="w-full max-w-2xl bg-white dark:bg-zinc-900 rounded-3xl shadow-xl overflow-hidden border border-zinc-100 dark:border-zinc-800 transition-colors duration-300">
        
        {/* Header */}
        <div className="p-8 text-center border-b border-zinc-100 dark:border-zinc-800 bg-zinc-50/50 dark:bg-zinc-900/50 transition-colors duration-300">
          <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-indigo-100 dark:bg-indigo-500/20 text-indigo-600 dark:text-indigo-400 mb-4 shadow-sm transition-colors duration-300">
            {activeTool === 'mp3-converter' ? <Music className="w-8 h-8" /> : <Youtube className="w-8 h-8" />}
          </div>
          <h1 className="text-2xl font-bold tracking-tight text-zinc-900 dark:text-white mb-2 transition-colors duration-300">
            {activeTool === 'mp3-converter' ? 'Batch MP3 Converter' : 'YouTube Transcriber'}
          </h1>
          <p className="text-zinc-500 dark:text-zinc-400 text-sm max-w-sm mx-auto transition-colors duration-300">
            {activeTool === 'mp3-converter' 
              ? 'Convert multiple audio files to high-quality MP3 simultaneously. 100% private, processed locally.'
              : 'Paste a YouTube URL to transcribe and extract key points and examples.'}
          </p>
        </div>

        {/* Tool Toggle */}
        <div className="flex p-2 bg-zinc-100 dark:bg-zinc-800 rounded-xl m-6">
          <button
            onClick={() => setActiveTool('mp3-converter')}
            className={cn(
              "flex-1 py-2 text-sm font-medium rounded-lg transition-all",
              activeTool === 'mp3-converter' 
                ? "bg-white dark:bg-zinc-700 text-zinc-900 dark:text-white shadow-sm" 
                : "text-zinc-500 dark:text-zinc-400 hover:text-zinc-700 dark:hover:text-zinc-300"
            )}
          >
            MP3 Converter
          </button>
          <button
            onClick={() => setActiveTool('youtube-transcriber')}
            className={cn(
              "flex-1 py-2 text-sm font-medium rounded-lg transition-all",
              activeTool === 'youtube-transcriber' 
                ? "bg-white dark:bg-zinc-700 text-zinc-900 dark:text-white shadow-sm" 
                : "text-zinc-500 dark:text-zinc-400 hover:text-zinc-700 dark:hover:text-zinc-300"
            )}
          >
            YouTube Transcriber
          </button>
        </div>

        <div className="p-6">
          {activeTool === 'youtube-transcriber' ? (
            <YoutubeTranscriber />
          ) : (
            <>
              {/* Engine Loading State */}
              {!loaded && isLoading && (
                <div className="flex flex-col items-center justify-center py-12 text-zinc-500 dark:text-zinc-400 w-full">
                  <Loader2 className="w-8 h-8 animate-spin text-indigo-500 dark:text-indigo-400 mb-4" />
                  <p className="text-sm font-medium">Downloading conversion engine...</p>
                  
                  {downloadInfo.loaded > 0 && (
                    <div className="w-full max-w-xs mt-6 space-y-2">
                      <div className="flex justify-between text-xs font-medium text-zinc-600 dark:text-zinc-400">
                        <span>{(downloadInfo.loaded / (1024 * 1024)).toFixed(1)} MB</span>
                        <span>{downloadInfo.total ? (downloadInfo.total / (1024 * 1024)).toFixed(1) + ' MB' : '~30.5 MB'}</span>
                      </div>
                      <div className="w-full bg-zinc-200 dark:bg-zinc-800 rounded-full h-2 overflow-hidden">
                        <div 
                          className="bg-indigo-500 h-2 rounded-full transition-all duration-200 ease-out"
                          style={{ width: `${Math.min(100, (downloadInfo.loaded / (downloadInfo.total || 31980000)) * 100)}%` }}
                        ></div>
                      </div>
                    </div>
                  )}
                  
                  <p className="text-xs mt-6 opacity-80 max-w-xs text-center">
                    This downloads a WebAssembly file to your browser. It only happens once, but may take a minute depending on your internet speed.
                  </p>
                </div>
              )}

              {/* Engine Error State */}
              {!loaded && error && !isLoading && (
                <div className="flex flex-col items-center justify-center py-8 text-red-500 dark:text-red-400 bg-red-50 dark:bg-red-500/10 rounded-2xl border border-red-100 dark:border-red-500/20 transition-colors duration-300">
                  <AlertCircle className="w-8 h-8 mb-3" />
                  <p className="text-sm font-medium text-center px-4">{error}</p>
                  <button 
                    onClick={load}
                    className="mt-4 px-4 py-2 bg-white dark:bg-zinc-800 text-red-600 dark:text-red-400 text-sm font-medium rounded-lg shadow-sm border border-red-200 dark:border-red-500/30 hover:bg-red-50 dark:hover:bg-red-500/20 transition-colors"
                  >
                    Retry Loading
                  </button>
                </div>
              )}

              {/* Main Interface */}
              {loaded && (
                <div className="space-y-6">
                  
                  {/* Dropzone */}
                  <div
                    onDragOver={(e) => { e.preventDefault(); setIsDragging(true); }}
                    onDragLeave={() => setIsDragging(false)}
                    onDrop={onDrop}
                    className={cn(
                      "relative group flex flex-col items-center justify-center w-full h-32 border-2 border-dashed rounded-2xl transition-all duration-200 ease-in-out cursor-pointer overflow-hidden",
                      isDragging 
                        ? "border-indigo-500 bg-indigo-50/50 dark:bg-indigo-500/10" 
                        : "border-zinc-200 dark:border-zinc-700 bg-zinc-50 dark:bg-zinc-800/30 hover:bg-zinc-100 dark:hover:bg-zinc-800 hover:border-zinc-300 dark:hover:border-zinc-600"
                    )}
                  >
                    <input
                      type="file"
                      multiple
                      accept="audio/*,video/*"
                      onChange={handleFileInput}
                      className="absolute inset-0 w-full h-full opacity-0 cursor-pointer z-10"
                    />
                    <div className="flex flex-col items-center justify-center text-zinc-500 dark:text-zinc-400 group-hover:text-zinc-700 dark:group-hover:text-zinc-300 transition-colors">
                      <UploadCloud className={cn("w-8 h-8 mb-2 transition-transform duration-300", isDragging && "scale-110 text-indigo-500 dark:text-indigo-400")} />
                      <p className="text-sm font-medium mb-1">
                        <span className="text-indigo-600 dark:text-indigo-400 font-semibold">Click to upload</span> or drag and drop
                      </p>
                      <p className="text-xs text-zinc-400 dark:text-zinc-500">Add multiple files</p>
                    </div>
                  </div>

                  {/* Tabs */}
                  <div className="flex border-b border-zinc-200 dark:border-zinc-800">
                    <button 
                      className={cn("flex-1 py-3 text-sm font-medium text-center border-b-2 transition-colors", activeTab === 'converting' ? "border-indigo-500 text-indigo-600 dark:text-indigo-400" : "border-transparent text-zinc-500 hover:text-zinc-700 dark:text-zinc-400 dark:hover:text-zinc-300")}
                      onClick={() => setActiveTab('converting')}
                    >
                      Converting ({activeTasks.length})
                    </button>
                    <button 
                      className={cn("flex-1 py-3 text-sm font-medium text-center border-b-2 transition-colors", activeTab === 'finished' ? "border-emerald-500 text-emerald-600 dark:text-emerald-400" : "border-transparent text-zinc-500 hover:text-zinc-700 dark:text-zinc-400 dark:hover:text-zinc-300")}
                      onClick={() => setActiveTab('finished')}
                    >
                      Finished ({finishedTasks.length})
                    </button>
                  </div>

                  {/* Tab Content */}
                  <div className="min-h-[200px]">
                    {activeTab === 'converting' && (
                      <div className="space-y-3 max-h-[300px] overflow-y-auto pr-2 custom-scrollbar">
                        {activeTasks.map(task => (
                          <div key={task.id} className="p-4 bg-zinc-50 dark:bg-zinc-800/50 border border-zinc-200 dark:border-zinc-700 rounded-xl transition-colors duration-300">
                            <div className="flex items-center justify-between mb-2">
                              <div className="flex items-center truncate pr-4">
                                <FileAudio className="w-5 h-5 text-zinc-400 mr-3 shrink-0" />
                                <span className="text-sm font-medium truncate">{task.file.name}</span>
                              </div>
                              <div className="flex items-center gap-2">
                                <span className="text-xs font-medium text-zinc-500 shrink-0">
                                  {task.status === 'queued' && 'Queued'}
                                  {task.status === 'converting' && `${task.progress}%`}
                                  {task.status === 'error' && <span className="text-red-500">Error</span>}
                                  {task.status === 'stopped' && <span className="text-amber-500">Stopped</span>}
                                </span>
                                { (task.status === 'converting' || task.status === 'queued') && (
                                  <button onClick={() => stopTask(task)} className="text-xs text-amber-600 hover:text-amber-700 mr-2">Stop</button>
                                )}
                                {task.status === 'stopped' && (
                                  <button onClick={() => restartTask(task)} className="text-xs text-indigo-600 hover:text-indigo-700">Restart</button>
                                )}
                              </div>
                            </div>
                            {task.status === 'converting' && (
                              <div className="w-full bg-zinc-200 dark:bg-zinc-700 rounded-full h-1.5 overflow-hidden">
                                <div 
                                  className="bg-indigo-500 h-1.5 rounded-full transition-all duration-300 ease-out" 
                                  style={{ width: `${task.progress}%` }}
                                ></div>
                              </div>
                            )}
                            {task.status === 'error' && (
                              <p className="text-xs text-red-500 mt-1">{task.error}</p>
                            )}
                          </div>
                        ))}
                        {activeTasks.length === 0 && (
                          <div className="text-center py-12 text-zinc-500 dark:text-zinc-400 text-sm">
                            No files converting. Drop some files above!
                          </div>
                        )}
                      </div>
                    )}

                    {activeTab === 'finished' && (
                      <div className="space-y-3 max-h-[300px] overflow-y-auto pr-2 custom-scrollbar">
                        {finishedTasks.map(task => (
                          <div key={task.id} className="p-4 bg-emerald-50 dark:bg-emerald-500/10 border border-emerald-100 dark:border-emerald-500/20 rounded-xl flex items-center justify-between transition-colors duration-300">
                            <div className="flex items-center truncate pr-4">
                              <CheckCircle2 className="w-5 h-5 text-emerald-500 mr-3 shrink-0" />
                              <div className="truncate">
                                <p className="text-sm font-medium text-emerald-900 dark:text-emerald-300 truncate">{task.file.name}</p>
                                <p className="text-xs text-emerald-600/70 dark:text-emerald-400/70">Converted successfully</p>
                              </div>
                            </div>
                            <button 
                              onClick={() => handleSave(task)}
                              className={cn(
                                "shrink-0 flex items-center justify-center px-3 py-1.5 text-xs font-medium rounded-lg shadow-sm transition-colors",
                                task.saved 
                                  ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-500/20 dark:text-emerald-400" 
                                  : "bg-emerald-600 hover:bg-emerald-700 text-white"
                              )}
                            >
                              {task.saved ? <CheckCircle2 className="w-3.5 h-3.5 mr-1.5" /> : <Download className="w-3.5 h-3.5 mr-1.5" />}
                              {task.saved ? 'Saved' : 'Save MP3'}
                            </button>
                          </div>
                        ))}
                        {finishedTasks.length === 0 && (
                          <div className="text-center py-12 text-zinc-500 dark:text-zinc-400 text-sm">
                            No finished conversions yet.
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}
