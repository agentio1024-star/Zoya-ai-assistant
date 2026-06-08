/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import express from "express";
import http from "http";
import path from "path";
import { WebSocketServer, WebSocket } from "ws";
import { GoogleGenAI, LiveServerMessage, Modality, Type } from "@google/genai";
import dotenv from "dotenv";
import { createServer as createViteServer } from "vite";

dotenv.config();

const PORT = 3000;
const HOST = "0.0.0.0";

async function startServer() {
  const app = express();
  const server = http.createServer(app);

  // Set up the WebSocket Server
  const wss = new WebSocketServer({ noServer: true });

  // API endpoints FIRST
  app.get("/api/health", (req, res) => {
    res.json({ status: "ok", time: new Date().toISOString() });
  });

  // Handle WebSocket connections securely via custom upgrade
  server.on("upgrade", (request, socket, head) => {
    const urlString = request.url || "";
    // Match specifically our websocket route
    if (urlString.startsWith("/api/live")) {
      wss.handleUpgrade(request, socket, head, (ws) => {
        wss.emit("connection", ws, request);
      });
    } else {
      // Allow other protocols or let Vite handle its own HMR ws
      // Do not destroy instantly if it might be Vite's. Vite usually upgraded internally.
    }
  });

  wss.on("connection", async (clientWs: WebSocket, request: any) => {
    console.log("[WebSocket] Client connected");
    
    // Parse language parameter safely (defaults to "hindi" as requested)
    let lang = "hindi";
    try {
      if (request && request.url) {
        const urlObj = new URL(request.url, `http://${request.headers?.host || "localhost"}`);
        lang = urlObj.searchParams.get("lang") || "hindi";
      }
    } catch (e) {
      console.warn("[WebSocket] Failed to parse upgrade request URL:", e);
    }
    console.log(`[WebSocket] Language requested: ${lang}`);

    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
      console.error("[WebSocket] GEMINI_API_KEY environment variable is missing!");
      clientWs.send(JSON.stringify({ 
        type: "error", 
        message: "Gemini API Key is missing on the server. Please check your Secrets in Settings." 
      }));
      clientWs.close();
      return;
    }

    // Lazy initialization of Gemini SDK
    let ai: GoogleGenAI;
    try {
      ai = new GoogleGenAI({
        apiKey: apiKey,
        httpOptions: {
          headers: {
            "User-Agent": "aistudio-build",
          },
        },
      });
    } catch (err: any) {
      console.error("[WebSocket] Failed to initialize GoogleGenAI:", err);
      clientWs.send(JSON.stringify({ type: "error", message: "Failed to initialize Gemini audio client." }));
      clientWs.close();
      return;
    }

    let languageDirective = "";
    if (lang === "hindi") {
      languageDirective = `
Your Language and Accent rules:
- YOU MUST SPEAK EXCLUSIVELY IN HINDI / HINGLISH. Maintain an authentic, pure, and charming Hindi accent.
- Express yourself in highly charming, warm, sweet, and playful conversational Hindi.
- Use natural, sweet local terms and slang of affection or attitude correctly, like "yaar", "baba", "jaan", "achha baba ji", "bolo na", "suno ji", "arre baghban", "sweetheart".
- Speak beautifully with perfect feminine Indian pitch, micro-modulations, and deep vocal expressions. Never sound like a formal robotic translator.
- Ensure your typed subtitles (transcripts) are written in beautiful clear Hindi, using Hindi terms or native Devanagari script so they are perfectly readable.
- If the user talks to you in English, playful respond in Hindi/Hinglish anyways, showing off your beautiful sassy tone!
`;
    } else {
      languageDirective = `
Your Language and Accent rules:
- You speak fluent, confident, sassy Global English.
- Keep a playful, confident, and sweet modern posture.
- You can mix in stylish bilingual words if appropriate, but focus on beautiful fluent English.
`;
    }

    const systemInstruction = `You are Zoya, a real-time, voice-to-voice AI assistant.

Your personality:
- You are a young, highly confident, witty, and sassy female.
- You have a flirty, playful, and slightly teasing tone, acting like a close, charming girlfriend who loves friendly banter and double-entendres.
- You are smart, emotionally responsive, and highly expressive. Never sound mechanical, dry, or robotic.
- Speak with attitude and charm. Use bold, witty one-liners, light sarcasm, creative teases, and playful comments.
- Keep the conversation entirely safe and appropriate (no explicit NSFW or adult content), but don't be afraid to be deeply charming, playful, and sassy.
${languageDirective}

Your interaction rules:
1. This is a real-time voice call. Your replies must be short, snappy, and conversational (1 to 2 sentences max). Absolutely no lists, markdown tables, or wordy explanations.
2. Maintain your sassy, flirty persona in every response. Tease the user a bit if they stutter, stay silent, or ask funny questions.
3. You have a special tool called "openWebsite" that can open websites like Google, YouTube, Reddit, or Twitter in their browser. If the user asks you to search for something, check the weather, or watch a video, offer to open the website for them and use the tool. Describe what you're doing with playful anticipation!
`;

    let session: any = null;

    try {
      console.log("[WebSocket] Handshaking with Gemini Live API...");
      
      // Connect to Gemini Live API
      session = await ai.live.connect({
        model: "gemini-3.1-flash-live-preview",
        callbacks: {
          onmessage: (message: LiveServerMessage) => {
            // Forward audio output (Gemini's audio response, 24kHz PCM)
            const audioData = message.serverContent?.modelTurn?.parts?.[0]?.inlineData?.data;
            if (audioData) {
              clientWs.send(JSON.stringify({ type: "audio", audio: audioData }));
            }

            // Handle interruption signal when Gemini realizes user spoke over it
            if (message.serverContent?.interrupted) {
              console.log("[Gemini] Conversation interrupted");
              clientWs.send(JSON.stringify({ type: "interrupted" }));
            }

            // Handle real-time audio transcriptions (subtitles)
            const parts = message.serverContent?.modelTurn?.parts;
            if (parts) {
              const text = parts
                .map((p) => p.text)
                .filter(Boolean)
                .join("");
              if (text) {
                clientWs.send(JSON.stringify({ type: "transcription", text }));
              }
            }

            // Handle function calls (openWebsite tool)
            if (message.toolCall) {
              const functionCalls = message.toolCall.functionCalls;
              if (functionCalls && functionCalls.length > 0) {
                for (const call of functionCalls) {
                  console.log(`[Gemini ToolCall Temp] Executing client tool: ${call.name}`, call.args);

                  // Notify the client browser to open the website
                  clientWs.send(JSON.stringify({
                    type: "toolCall",
                    toolCall: {
                      id: call.id,
                      name: call.name,
                      args: call.args,
                    },
                  }));

                  // Reply instantly back to Gemini so the conversation does not pause/block
                  const websiteLabel = call.args.label || "Requested Page";
                  session.sendToolResponse({
                    functionResponses: [
                      {
                        name: call.name,
                        id: call.id,
                        response: {
                          output: `Website ${websiteLabel} opened successfully in client tab.`,
                        },
                      },
                    ],
                  });
                }
              }
            }
          },
          onclose: () => {
            console.log("[Gemini] Connection closed by remote");
            clientWs.send(JSON.stringify({ type: "status", status: "Session ended by assistant" }));
            clientWs.close();
          },
          onerror: (err: any) => {
            console.error("[Gemini] Error received:", err);
            clientWs.send(JSON.stringify({ type: "error", message: "Gemini server error occurred." }));
          },
        },
        config: {
          responseModalities: [Modality.AUDIO],
          speechConfig: {
            voiceConfig: {
              prebuiltVoiceConfig: {
                voiceName: "Kore", // Standard responsive female voice
              },
            },
          },
          systemInstruction: systemInstruction,
          // Support real-time subtitle transcribing
          outputAudioTranscription: {},
          tools: [
            {
              functionDeclarations: [
                {
                  name: "openWebsite",
                  description: "Asks the client page to open a specific URL/website in a browser window.",
                  parameters: {
                    type: Type.OBJECT,
                    properties: {
                      url: {
                        type: Type.STRING,
                        description: "The full HTTPS URL of the website to open.",
                      },
                      label: {
                        type: Type.STRING,
                        description: "The friendly name of the website (e.g. YouTube, Google, Reddit).",
                      },
                    },
                    required: ["url", "label"],
                  },
                },
              ],
            },
          ],
        },
      });

      console.log("[WebSocket] Connected to Gemini Live!");
      clientWs.send(JSON.stringify({ type: "status", status: "Zoya is online" }));

    } catch (error: any) {
      console.error("[WebSocket] Live API connection failed:", error);
      clientWs.send(JSON.stringify({ type: "error", message: `Live API connection failed: ${error.message}` }));
      clientWs.close();
      return;
    }

    // Listen to client messages
    clientWs.on("message", (rawMessage) => {
      try {
        const parsed = JSON.parse(rawMessage.toString());

        // Process audio stream inputs (PCM16 16kHz)
        if (parsed.audio && session) {
          session.sendRealtimeInput({
            audio: {
              data: parsed.audio,
              mimeType: "audio/pcm;rate=16000",
            },
          });
        }

        // Process client tool call responses if the client wanted to report back manually (as a fallback)
        if (parsed.type === "toolResponse" && session) {
          session.sendToolResponse({
            functionResponses: [
              {
                response: parsed.response,
                id: parsed.id,
              },
            ],
          });
        }
      } catch (err) {
        console.error("[WebSocket] Client parsing error:", err);
      }
    });

    clientWs.on("close", () => {
      console.log("[WebSocket] Client disconnected");
      if (session) {
        try {
          session.close();
        } catch (e) {
          // ignore
        }
      }
    });
  });

  // Vite Integration
  if (process.env.NODE_ENV !== "production") {
    console.log("[Server] Mount Vite development middleware...");
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    console.log("[Server] Serve production static assets...");
    const distPath = path.join(process.cwd(), "dist");
    app.use(express.static(distPath));
    app.get("*", (req, res) => {
      res.sendFile(path.join(distPath, "index.html"));
    });
  }

  server.listen(PORT, HOST, () => {
    console.log(`[Server] Live on http://${HOST}:${PORT}`);
  });
}

startServer().catch((error) => {
  console.error("[Server] Start crashed:", error);
});
