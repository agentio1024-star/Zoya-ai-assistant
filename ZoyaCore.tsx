/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React from "react";
import { Mic, Power, Sparkles, AlertCircle } from "lucide-react";
import { ConnectionState } from "../types";

interface ZoyaCoreProps {
  state: ConnectionState;
  onClick: () => void;
}

export const ZoyaCore: React.FC<ZoyaCoreProps> = ({ state, onClick }) => {
  // Determine color theme based on connection state
  const getThemeClasses = () => {
    switch (state) {
      case "disconnected":
        return {
          ring: "border-slate-800 bg-slate-950/40 text-slate-500",
          glow: "from-slate-900/10 to-transparent shadow-[0_0_15px_rgba(30,41,59,0.2)]",
          label: "Offline",
          themeColor: "text-slate-500",
        };
      case "connecting":
        return {
          ring: "border-cyan-500/50 bg-cyan-950/25 text-cyan-400 rotate-180 transition-transform duration-1000",
          glow: "from-cyan-500/20 to-teal-500/10 shadow-[0_0_30px_rgba(6,182,212,0.3)] animate-pulse",
          label: "Syncing...",
          themeColor: "text-cyan-400",
        };
      case "listening":
        return {
          ring: "border-teal-400 bg-teal-950/30 text-teal-300 animate-cyber-pulse",
          glow: "from-teal-400/30 to-emerald-500/10 shadow-[0_0_40px_rgba(20,184,166,0.4)]",
          label: "Zoya Is Listening",
          themeColor: "text-teal-400 animate-pulse",
        };
      case "speaking":
        return {
          ring: "border-pink-500 bg-pink-950/30 text-pink-400 animate-cyber-speaking",
          glow: "from-pink-500/40 to-rose-500/20 shadow-[0_0_50px_rgba(236,72,153,0.5)]",
          label: "Zoya Is Speaking",
          themeColor: "text-pink-400",
        };
      case "error":
        return {
          ring: "border-rose-500/60 bg-rose-950/20 text-rose-400",
          glow: "from-rose-500/20 to-transparent shadow-[0_0_30px_rgba(244,63,94,0.4)]",
          label: "Core Error",
          themeColor: "text-rose-400",
        };
    }
  };

  const theme = getThemeClasses();

  return (
    <div className="flex flex-col items-center justify-center p-6 select-none" id="zoya-core-wrapper">
      {/* Outer Rotating/Pulsating Visual Core Chassis */}
      <div className="relative w-72 h-72 md:w-80 md:h-80 flex items-center justify-center">
        
        {/* Animated Radial Backdrop Glow */}
        <div className={`absolute inset-0 rounded-full bg-radial ${theme.glow} transition-all duration-700 ease-in-out`} />

        {/* Ambient Ring 1: Orbits */}
        <div className={`absolute inset-2 rounded-full border border-dashed transition-all duration-700 border-opacity-30 ${
          state === "connecting" ? "animate-[spin_4s_linear_infinite]" : ""
        } ${state === "listening" || state === "speaking" ? "border-teal-500/50 scale-105" : "border-slate-800"}`} />

        {/* Ambient Ring 2: Core Outer Shell */}
        <div className={`absolute inset-6 rounded-full border transition-all duration-1000 ease-in-out ${
          state === "speaking" ? "border-rose-500/30 scale-110" : ""
        } ${state === "listening" ? "border-teal-400/23 scale-105" : "border-slate-900"}`} />

        {/* The Action Circle Button */}
        <button
          onClick={onClick}
          className={`absolute inset-10 rounded-full border-2 flex flex-col items-center justify-center cursor-pointer transition-all duration-500 ease-out active:scale-95 z-20 hover:scale-102 ${theme.ring}`}
          id="zoya-interactive-chassis"
        >
          {/* Inner holographic scanlines effect */}
          <div className="absolute inset-0 rounded-full overflow-hidden bg-grid-slate-900/10 pointer-events-none">
            <div className={`w-full h-1/2 bg-gradient-to-b from-white/5 to-transparent absolute top-0 left-0 transition-transform ${
              state !== "disconnected" ? "animate-[bounce_3s_infinite_ease-in-out]" : ""
            }`} />
          </div>

          {/* Core Icons based on current states */}
          <div className="relative z-10 flex flex-col items-center justify-center">
            {state === "disconnected" && (
              <Power className="w-16 h-16 stroke-[1.2] opacity-80 group-hover:opacity-100 drop-shadow-[0_0_10px_rgba(255,255,255,0.1)] transition-opacity" />
            )}
            {state === "connecting" && (
              <Sparkles className="w-16 h-16 stroke-[1.2] animate-spin text-cyan-400 duration-2000" />
            )}
            {state === "listening" && (
              <div className="relative flex items-center justify-center">
                <Mic className="w-16 h-16 stroke-[1.3] text-teal-300 drop-shadow-[0_0_12px_rgba(20,184,166,0.5)]" />
                <span className="absolute -inset-2 rounded-full border border-teal-400/30 animate-ping" />
              </div>
            )}
            {state === "speaking" && (
              <div className="relative flex items-center justify-center">
                <div className="flex gap-1.5 items-center justify-center h-16 w-20">
                  <span className="w-1.5 h-6 bg-pink-400 rounded-full animate-[bounce_0.8s_infinite_0s]" />
                  <span className="w-1.5 h-12 bg-pink-500 rounded-full animate-[bounce_0.8s_infinite_0.15s]" />
                  <span className="w-1.5 h-16 bg-rose-400 rounded-full animate-[bounce_0.8s_infinite_0.3s]" />
                  <span className="w-1.5 h-10 bg-pink-500 rounded-full animate-[bounce_0.8s_infinite_0.45s]" />
                  <span className="w-1.5 h-5 bg-pink-400 rounded-full animate-[bounce_0.8s_infinite_0.6s]" />
                </div>
              </div>
            )}
            {state === "error" && (
              <AlertCircle className="w-16 h-16 stroke-[1.2] text-rose-400 drop-shadow-[0_0_10px_rgba(244,63,94,0.5)]" />
            )}

            {/* Micro Indicator Label */}
            <span className={`text-[10px] font-mono tracking-[4px] uppercase mt-4 block ${theme.themeColor}`}>
              {theme.label}
            </span>
          </div>
        </button>

        {/* Ambient Orbiting Dot (glowing satellite) when active */}
        {state !== "disconnected" && (
          <div className={`absolute top-0 bottom-0 left-0 right-0 rounded-full pointer-events-none animate-[spin_5s_linear_infinite] ${
            state === "speaking" ? "text-pink-500" : "text-cyan-500"
          }`}>
            <span className="absolute -top-1 left-1/2 w-2.5 h-2.5 rounded-full bg-current shadow-[0_0_10px_currentColor]" />
          </div>
        )}
      </div>

      {/* Quick click instruction helper */}
      <p className="text-xs text-slate-500 font-mono tracking-wider mt-4">
        {state === "disconnected" ? "TAP CORE TO CALL ZOYA" : "CLICK CORE TO HANG UP"}
      </p>
    </div>
  );
};
