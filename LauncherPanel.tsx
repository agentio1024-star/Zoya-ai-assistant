/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useEffect, useState } from "react";
import { ExternalLink, ShieldAlert, X } from "lucide-react";
import { ToolCallPayload } from "../types";

interface LauncherPanelProps {
  toolCall: ToolCallPayload | null;
  onOpen: (id: string, url: string) => void;
  onDismiss: () => void;
}

export const LauncherPanel: React.FC<LauncherPanelProps> = ({ toolCall, onOpen, onDismiss }) => {
  const [countdown, setCountdown] = useState(4);
  const [hasInteracted, setHasInteracted] = useState(false);

  const handleCompleteOpening = () => {
    setHasInteracted(true);
    if (toolCall) {
      onOpen(toolCall.id, toolCall.args.url);
    }
  };

  useEffect(() => {
    if (!toolCall) return;
    setCountdown(4);
    setHasInteracted(false);

    // Automatic launcher timer progress
    const interval = setInterval(() => {
      setCountdown((prev) => {
        if (prev <= 1) {
          clearInterval(interval);
          return 0;
        }
        return prev - 1;
      });
    }, 1000);

    return () => clearInterval(interval);
  }, [toolCall]);

  // Safely trigger automatic redirect when countdown finishes and user hasn't hand-clicked yet
  useEffect(() => {
    if (countdown === 0 && !hasInteracted && toolCall) {
      handleCompleteOpening();
    }
  }, [countdown, hasInteracted, toolCall]);

  if (!toolCall) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-md"
      id="modal-launcher-wrapper"
    >
      <div className="relative w-full max-w-md border border-cyan-500/50 bg-slate-900 rounded-2xl shadow-[0_0_50px_rgba(6,182,212,0.25)] overflow-hidden">
        {/* Top styling strip */}
        <div className="bg-gradient-to-r from-cyan-500 to-indigo-500 h-1.5 w-full" />

        {/* Dismiss Button */}
        <button
          onClick={onDismiss}
          className="absolute top-4 right-4 text-slate-400 hover:text-white transition-colors cursor-pointer"
        >
          <X className="w-5 h-5" />
        </button>

        <div className="p-6">
          <div className="flex items-center gap-3 mb-4 text-cyan-400">
            <span className="flex h-3 w-3 relative">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-cyan-400 opacity-75"></span>
              <span className="relative inline-flex rounded-full h-3 w-3 bg-cyan-500"></span>
            </span>
            <span className="font-mono text-xs tracking-widest uppercase">ZOYA SYSTEM INTERCEPT</span>
          </div>

          <h3 className="text-xl font-display font-medium text-white mb-2 tracking-tight">
            Launching {toolCall.args.label || "Requested Page"}
          </h3>
          
          <p className="text-slate-400 text-sm font-mono leading-relaxed mb-6 break-all">
            Zoya wants to open:{" "}
            <span className="text-cyan-300 font-mono text-xs">{toolCall.args.url}</span>
          </p>

          {/* Progress loader bar */}
          <div className="relative w-full h-1 bg-slate-800 rounded-full overflow-hidden mb-6">
            <div
              className="absolute top-0 bottom-0 left-0 bg-cyan-400 transition-all duration-1000 ease-out"
              style={{ width: `${(countdown / 4) * 100}%` }}
            />
          </div>

          <div className="flex flex-col gap-3">
            {/* CTA Main Button */}
            <button
              onClick={handleCompleteOpening}
              className="w-full flex items-center justify-center gap-2 cursor-pointer bg-cyan-500 hover:bg-cyan-400 text-slate-950 font-medium py-3 px-4 rounded-xl shadow-[0_0_15px_rgba(6,182,212,0.3)] transition-all hover:scale-[1.01]"
            >
              <ExternalLink className="w-4 h-4" />
              <span>Launch Site Now</span>
            </button>

            {countdown > 0 ? (
              <p className="text-center text-[11px] text-slate-500 font-mono uppercase tracking-wider mt-1">
                Auto-opening in {countdown}s...
              </p>
            ) : (
              <p className="text-center text-[11px] text-teal-400 font-mono uppercase tracking-wider mt-1 animate-pulse">
                Opening in new browser tab
              </p>
            )}
          </div>

          {/* Browser popup block notice */}
          <div className="flex gap-2.5 items-start mt-6 p-3 rounded-lg bg-indigo-950/20 border border-indigo-950/50 text-[11px] text-indigo-300/80 font-mono">
            <ShieldAlert className="w-4 h-4 text-indigo-400 shrink-0 mt-0.5" />
            <span>
              If the website fails to spawn automatically, click "Launch Site Now" to bypass your browser's security popup blocker.
            </span>
          </div>
        </div>
      </div>
    </div>
  );
};
