/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { useState, useEffect, useRef } from "react";
import { 
  Compass, 
  ExternalLink, 
  Mic, 
  Phone, 
  Sparkles, 
  History, 
  AlertCircle,
  VolumeX,
  Volume2
} from "lucide-react";
import { ZoyaCore } from "./components/ZoyaCore";
import { LauncherPanel } from "./components/LauncherPanel";
import { AudioStreamer } from "./services/audioStreamer";
import { ConnectionState, ToolCallPayload, WebSiteItem } from "./types";

export default function App() {
  const [state, setState] = useState<ConnectionState>("disconnected");
  const [language, setLanguage] = useState<"hindi" | "english">("hindi");
  const [subtitles, setSubtitles] = useState("");
  const [launchedSites, setLaunchedSites] = useState<WebSiteItem[]>([]);
  const [activeToolCall, setActiveToolCall] = useState<ToolCallPayload | null>(null);
  const [errorMessage, setErrorMessage] = useState("");
  const [isMuted, setIsMuted] = useState(false);

  // Audio Streamer, socket and session state
  const streamerRef = useRef<AudioStreamer | null>(null);
  const socketRef = useRef<WebSocket | null>(null);
  const subtitleTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  // Initialize the AudioStreamer once
  if (!streamerRef.current) {
    streamerRef.current = new AudioStreamer();
  }

  // Handle call toggle action
  const handleToggleCall = async () => {
    if (state === "disconnected" || state === "error") {
      await startCallSession();
    } else {
      endCallSession();
    }
  };

  const startCallSession = async () => {
    try {
      console.log(`[Zoya] Launching session in ${language} mode...`);
      setState("connecting");
      setErrorMessage("");
      setSubtitles("");

      // 1. Setup WebSocket connection directly to Express side
      const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
      const host = window.location.host;
      const wsUrl = `${protocol}//${host}/api/live?lang=${language}`;
      
      const socket = new WebSocket(wsUrl);
      socketRef.current = socket;

      socket.onopen = async () => {
        console.log("[Zoya] WebSocket pipeline ready. Opening mic...");
        
        // Let's start capturing input audios
        try {
          await streamerRef.current?.startRecording((base64Pcm) => {
            // Send mic chunks if open and user is not muted
            if (socket.readyState === WebSocket.OPEN && !isMuted) {
              socket.send(JSON.stringify({ audio: base64Pcm }));
            }
          });
          
          setState("listening");
        } catch (recorderError: any) {
          console.error("Microphone capture blocked or failed:", recorderError);
          setErrorMessage("Failed to acquire microphone permissions. Please grant mic access and try again.");
          setState("error");
          endCallSession();
        }
      };

      socket.onmessage = async (event) => {
        try {
          const payload = JSON.parse(event.data);

          if (payload.type === "error") {
            setErrorMessage(payload.message || "An assistant error occurred.");
            setState("error");
            endCallSession();
          }

          else if (payload.type === "status") {
            console.log("[Zoya Status Update]:", payload.status);
          }

          else if (payload.type === "interrupted") {
            console.log("[Zoya] Client was interrupted by speech!");
            // Instantly halt current playing synthesized sounds
            streamerRef.current?.stopPlayback();
            setState("listening");
            
            // Show a visual note that she stopped to listen
            setSubtitles("Listening...");
          }

          else if (payload.type === "audio") {
            // Zoya is returning PCM chunks (24kHz)
            if (isMuted) return; // Ignore audio if muting is toggled client-side

            setState("speaking");
            streamerRef.current?.playAudioChunk(payload.audio, (isPlaying) => {
              if (isPlaying) {
                setState("speaking");
              } else {
                setState("listening");
              }
            });
          }

          else if (payload.type === "transcription") {
            // Handle subtitles in real-time
            setSubtitles(payload.text);

            // Debounce subtitle clearance so they stay briefly after speaking finishes
            if (subtitleTimeoutRef.current) clearTimeout(subtitleTimeoutRef.current);
            subtitleTimeoutRef.current = setTimeout(() => {
              // Fade out subtitles if she stays silent
              setSubtitles("");
            }, 5000);
          }

          else if (payload.type === "toolCall") {
            if (payload.toolCall.name === "openWebsite") {
              const toolPayload = payload.toolCall as ToolCallPayload;
              setActiveToolCall(toolPayload);
            }
          }

        } catch (parseError) {
          console.error("Error parsing socket frame:", parseError);
        }
      };

      socket.onerror = (wsError) => {
        console.error("Websocket pipeline error:", wsError);
        setErrorMessage("Connection dropped. Please make sure the backend server and Gemini API keys are configured correctly.");
        setState("error");
        endCallSession();
      };

      socket.onclose = () => {
        console.log("[Zoya] WebSocket context closed.");
        // If we were still connecting, show an error
        if (state === "connecting") {
          setErrorMessage("Failed to initiate voice link with the server.");
          setState("error");
        }
        endCallSession();
      };

    } catch (sessionError: any) {
      console.error("Session start crash:", sessionError);
      setErrorMessage(sessionError.message || "Could not launch conversation.");
      setState("error");
      endCallSession();
    }
  };

  const endCallSession = () => {
    console.log("[Zoya] Closing stream link...");
    
    // Stop mic recording safely
    streamerRef.current?.stopRecording();
    // Stop all audio output rendering
    streamerRef.current?.stopPlayback();

    // Close WebSocket safely
    if (socketRef.current) {
      if (socketRef.current.readyState === WebSocket.OPEN || socketRef.current.readyState === WebSocket.CONNECTING) {
        socketRef.current.close();
      }
      socketRef.current = null;
    }

    if (state !== "error") {
      setState("disconnected");
    }
  };

  // Handle user mute state toggles
  const handleMuteToggle = () => {
    setIsMuted(!isMuted);
    if (!isMuted) {
      // Instantly mute playback as well
      streamerRef.current?.stopPlayback();
    }
  };

  // Launch requested url safely and insert into historical lists
  const handleOpenWebsite = (id: string, url: string) => {
    // 1. Open URL in secondary browser-tab
    const win = window.open(url, "_blank");
    if (!win) {
      console.warn("Auto-popup blocked by browser security. Re-route via launcher UI successfully.");
    }

    // 2. Insert list item cleanly
    const matchingCall = activeToolCall?.id === id ? activeToolCall : null;
    const nameLabel = matchingCall?.args.label || "External Web Link";

    const newItem: WebSiteItem = {
      id: id,
      name: nameLabel,
      url: url,
      timestamp: Date.now(),
    };

    setLaunchedSites((prev) => {
      // Avoid adding duplicate IDs
      if (prev.some((item) => item.id === id)) return prev;
      return [newItem, ...prev];
    });

    // 3. Clear modal launcher overlay once dispatched
    setActiveToolCall(null);
  };

  // Dismiss Launcher without opening
  const handleDismissLauncher = () => {
    setActiveToolCall(null);
  };

  // Clean timeouts on unmount
  useEffect(() => {
    return () => {
      if (subtitleTimeoutRef.current) clearTimeout(subtitleTimeoutRef.current);
      endCallSession();
    };
  }, []);

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col justify-between font-sans selection:bg-cyan-500 selection:text-slate-950">
      
      {/* 1. Header Navigation HUD */}
      <header className="p-4 md:px-6 flex flex-col sm:flex-row gap-3 justify-between items-center border-b border-slate-900 bg-slate-950/60 backdrop-blur-md sticky top-0 z-40">
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2">
            <span className="flex h-2.5 w-2.5 relative">
              <span className={`animate-ping absolute inline-flex h-full w-full rounded-full opacity-75 ${
                state === "disconnected" ? "bg-slate-600" : state === "error" ? "bg-rose-500" : "bg-emerald-400"
              }`} />
              <span className={`relative inline-flex rounded-full h-2.5 w-2.5 ${
                state === "disconnected" ? "bg-slate-500" : state === "error" ? "bg-rose-600" : "bg-emerald-500"
              }`} />
            </span>
            <h1 className="font-display font-bold text-lg tracking-wider bg-gradient-to-r from-pink-400 via-purple-400 to-cyan-400 bg-clip-text text-transparent">
              ZOYA AI
            </h1>
          </div>
          <span className="text-[10px] font-mono py-0.5 px-2 bg-slate-900 border border-slate-800 rounded text-slate-400">
            {language === "hindi" ? "हिन्दी ACCENT" : "ENG GLOBAL"}
          </span>
        </div>

        {/* Dynamic Dialect Accent Switcher */}
        <div className="flex items-center gap-3">
          <div className="bg-slate-900/90 border border-slate-800 p-1 rounded-xl flex items-center shadow-lg">
            <button
              onClick={() => setLanguage("hindi")}
              disabled={state !== "disconnected"}
              className={`px-3 py-1.5 rounded-lg text-xs font-semibold cursor-pointer transition-all ${
                language === "hindi"
                  ? "bg-gradient-to-r from-pink-500 to-rose-600 text-white shadow-[0_2px_10px_rgba(236,72,153,0.3)]"
                  : "text-slate-400 hover:text-slate-200 disabled:opacity-40"
              }`}
              title={state !== "disconnected" ? "Hang up first to switch dialect!" : "Zoya in pure sassy Hindi accent"}
            >
              हिन्दी (Pure)
            </button>
            <button
              onClick={() => setLanguage("english")}
              disabled={state !== "disconnected"}
              className={`px-3 py-1.5 rounded-lg text-xs font-semibold cursor-pointer transition-all ${
                language === "english"
                  ? "bg-gradient-to-r from-cyan-500 to-blue-600 text-white shadow-[0_2px_10px_rgba(6,182,212,0.3)]"
                  : "text-slate-400 hover:text-slate-200 disabled:opacity-40"
              }`}
              title={state !== "disconnected" ? "Hang up first to switch dialect!" : "Zoya in Global English"}
            >
              Eng (Global)
            </button>
          </div>

          <div className="h-6 w-px bg-slate-800 hidden sm:block" />

          {/* Minimal connection states feedback label */}
          <div className="flex items-center gap-2 text-xs font-mono text-slate-400">
            {state === "disconnected" && "LINE IDLE"}
            {state === "connecting" && "DIALING CLIENT..."}
            {state === "listening" && "ONLINE"}
            {state === "speaking" && "SPEAKING"}
            {state === "error" && "LINE ERR"}
          </div>
        </div>
      </header>

      {/* 2. Main Call Desk Workspace */}
      <main className="flex-grow flex flex-col md:flex-row max-w-7xl mx-auto w-full p-4 md:p-6 gap-6 items-center md:items-stretch justify-center">
        
        {/* Call Panel Workspace Component */}
        <div className="flex-grow flex flex-col items-center justify-center bg-slate-900/10 border border-slate-900/50 rounded-3xl p-6 relative overflow-hidden w-full max-w-2xl min-h-[500px]">
          
          {/* Subtle decorative futuristic layout rings */}
          <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-96 h-96 border border-slate-900/20 rounded-full pointer-events-none" />
          <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-140 h-140 border border-slate-900/10 rounded-full pointer-events-none" />

          {/* Quick instructions / Help Header when idle */}
          {state === "disconnected" && (
            <div className="text-center max-w-sm mb-4 animate-fade-in z-10">
              <div className="w-12 h-12 rounded-2xl bg-pink-950/20 border border-pink-950/60 flex items-center justify-center mx-auto mb-4 text-pink-400 shadow-[0_0_15px_rgba(236,72,153,0.1)]">
                <Sparkles className="w-5 h-5" />
              </div>
              <h2 className="text-lg font-display font-medium text-slate-100 mb-2">Want to chat with Zoya?</h2>
              <p className="text-sm text-slate-400 leading-relaxed font-mono">
                She's sassy, witty, flirty, and absolutely charming. Hit the core below to initiate an audio call.
              </p>
            </div>
          )}

          {/* Error Banner */}
          {state === "error" && errorMessage && (
            <div className="max-w-md w-full bg-rose-950/20 border border-rose-950/50 p-4 rounded-xl flex items-start gap-3 text-sm text-rose-300 font-mono mb-6 z-10">
              <AlertCircle className="w-5 h-5 text-rose-400 shrink-0 mt-0.5" />
              <div className="flex-grow">
                <p className="font-semibold text-rose-400 mb-1">Session Failure</p>
                <p>{errorMessage}</p>
              </div>
            </div>
          )}

          {/* Zoya Visual Core Component */}
          <div className="z-10 flex-grow flex items-center justify-center">
            <ZoyaCore state={state} onClick={handleToggleCall} />
          </div>

          {/* Subtitles Area (Translucent Speech Bubble) */}
          <div className="w-full max-w-lg mt-4 text-center z-10 min-h-[64px] flex items-center justify-center">
            {subtitles ? (
              <div className="bg-slate-900/80 border border-slate-800 px-5 py-4 rounded-2xl backdrop-blur-md shadow-[0_10px_30px_rgba(0,0,0,0.5)] transition-all duration-300">
                <p className="text-slate-100 md:text-md font-display font-medium leading-relaxed tracking-wide">
                  {subtitles}
                </p>
              </div>
            ) : (
              state !== "disconnected" && (
                <p className="text-slate-500 font-mono text-xs tracking-wider uppercase animate-pulse">
                  {state === "listening" ? "Awaiting your voice..." : "..."}
                </p>
              )
            )}
          </div>
        </div>

        {/* 3. Launched History Sidebar Panel */}
        <div className="w-full md:w-80 shrink-0 flex flex-col bg-slate-950/40 border border-slate-900 rounded-3xl p-5 font-mono overflow-hidden">
          <div className="flex items-center justify-between border-b border-slate-900 pb-3 mb-4">
            <div className="flex items-center gap-2 text-xs font-semibold tracking-wider text-slate-400 uppercase">
              <History className="w-4 h-4 text-pink-400" />
              <span>Zoya Web Launcher</span>
            </div>
            <span className="text-[10px] py-0.5 px-2 bg-slate-900 rounded text-cyan-400 font-mono">
              {launchedSites.length} opened
            </span>
          </div>

          {launchedSites.length === 0 ? (
            <div className="flex-grow flex flex-col items-center justify-center p-6 text-center text-xs text-slate-500 select-none">
              <Compass className="w-8 h-8 text-slate-700/60 mb-2 stroke-[1.2]" />
              <p className="font-mono uppercase tracking-wider mb-1">No sites triggered yet</p>
              <p className="text-[10px] text-slate-600">
                Tell Zoya to show you something or open a webpage, and the active links will populate right here.
              </p>
            </div>
          ) : (
            <div className="flex-grow overflow-y-auto space-y-3 max-h-[300px] md:max-h-[450px] pr-1">
              {launchedSites.map((site) => (
                <div 
                  key={site.id} 
                  className="p-3 bg-slate-900/40 border border-slate-900 hover:border-cyan-500/30 rounded-xl flex items-center justify-between transition-all group"
                  id={`link-history-${site.id}`}
                >
                  <div className="flex flex-col gap-1 min-w-0 pr-2">
                    <span className="text-xs font-semibold text-slate-200 truncate group-hover:text-cyan-400 transition-colors">
                      {site.name}
                    </span>
                    <span className="text-[9px] text-slate-500 truncate font-mono">
                      {new URL(site.url).hostname}
                    </span>
                  </div>
                  <a
                    href={site.url}
                    target="_blank"
                    rel="noreferrer"
                    className="p-2 cursor-pointer rounded-lg bg-slate-950 text-slate-400 hover:text-cyan-400 hover:bg-slate-900 border border-slate-900 hover:border-cyan-500/20 transition-all flex items-center justify-center shrink-0"
                    title="Re-open link in new window"
                  >
                    <ExternalLink className="w-3.5 h-3.5" />
                  </a>
                </div>
              ))}
            </div>
          )}
        </div>
      </main>

      {/* 4. Bottom Utilities Bar */}
      <footer className="p-4 md:px-6 border-t border-slate-900 bg-slate-950/60 backdrop-blur-md flex flex-col sm:flex-row gap-4 items-center justify-between sticky bottom-0 z-30">
        <div className="flex gap-4 items-center">
          {/* Mute Mic controller toggle */}
          <button
            onClick={handleMuteToggle}
            className={`flex items-center gap-2 px-4 py-2 border rounded-xl font-mono text-xs tracking-wider uppercase cursor-pointer transition-all ${
              isMuted 
                ? "bg-rose-950/40 border-rose-950 text-rose-400 font-semibold"
                : "bg-slate-900 hover:bg-slate-850 border-slate-800 text-slate-300"
            }`}
            id="mic-mute-btn"
          >
            {isMuted ? (
              <>
                <VolumeX className="w-4 h-4 text-rose-400" />
                <span>MIC MUTED</span>
              </>
            ) : (
              <>
                <Volume2 className="w-4 h-4 text-emerald-400" />
                <span>MIC ACTIVE</span>
              </>
            )}
          </button>
        </div>

        {/* Quick hint guidance list for user speech */}
        <div className="text-[10px] font-mono text-slate-400 uppercase tracking-widest text-center sm:text-right">
          {state === "listening" && (
            language === "hindi" 
              ? "💡 बोलिए: 'Zoya, please show me YouTube' या 'सुनो यार, Google खोलो'!"
              : "💡 SAY: 'Zoya, please show me YouTube' / 'Search for Google'"
          )}
          {state === "speaking" && (
            language === "hindi"
              ? "⚡ तुम Zoya को बीच में टोक कर सीधे दोबारा बोल सकते हो!"
              : "⚡ TIP: You can interrupt Zoya by speaking directly!"
          )}
          {state === "disconnected" && (
            language === "hindi"
              ? "⚡ जोया से बात करने और मीठी बातें करने के लिए कॉलिंग कोर दबाएं"
              : "⚡ HIT THE GLOWING INNER CORE REGISTERS TO CALL ZOYA"
          )}
          {state === "connecting" && "📳 LINE ACQUISITION UNDERWAY..."}
        </div>
      </footer>

      {/* Modal Redirection Launcher overlay */}
      <LauncherPanel
        toolCall={activeToolCall}
        onOpen={handleOpenWebsite}
        onDismiss={handleDismissLauncher}
      />
    </div>
  );
}
