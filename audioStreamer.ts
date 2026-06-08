/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

export class AudioStreamer {
  private audioCtx: AudioContext | null = null;
  private mediaStream: MediaStream | null = null;
  private audioSource: MediaStreamAudioSourceNode | null = null;
  private scriptProcessor: ScriptProcessorNode | null = null;
  private activeSources: Set<AudioBufferSourceNode> = new Set();
  
  // Audio playback timeline tracker
  private nextStartTime = 0;
  
  // Callbacks
  private onUserAudioCallback: ((base64Pcm: string) => void) | null = null;
  private onPlaybackStateChange: ((isPlaying: boolean) => void) | null = null;

  constructor() {}

  // Lazily initialize AudioContext to avoid Autoplay restrictions
  private async initAudioContext() {
    if (!this.audioCtx) {
      // Create context. Some browsers require standard name, others webkitAudioContext
      const AudioCtxClass = window.AudioContext || (window as any).webkitAudioContext;
      this.audioCtx = new AudioCtxClass();
    }
    if (this.audioCtx.state === "suspended") {
      await this.audioCtx.resume();
    }
  }

  /**
   * Start recording mic input, downsample to 16kHz, convert to PCM16 base64, and stream.
   */
  async startRecording(onAudioChunk: (base64Pcm: string) => void) {
    try {
      await this.initAudioContext();
      if (!this.audioCtx) throw new Error("Could not initialize AudioContext");

      this.onUserAudioCallback = onAudioChunk;

      // Get microphone audio stream
      this.mediaStream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
        },
      });

      this.audioSource = this.audioCtx.createMediaStreamSource(this.mediaStream);
      
      // Let's use standard ScriptProcessor. 4096 is a good, stable buffer size.
      this.scriptProcessor = this.audioCtx.createScriptProcessor(4096, 1, 1);
      
      const inputSampleRate = this.audioCtx.sampleRate;
      const targetSampleRate = 16000;

      this.scriptProcessor.onaudioprocess = (e) => {
        if (!this.onUserAudioCallback) return;

        const inputData = e.inputBuffer.getChannelData(0);
        // Downsample input to 16000Hz
        const downsampled = this.downsampleBuffer(inputData, inputSampleRate, targetSampleRate);
        // Pack Float32 array into PCM16 ArrayBuffer
        const pcmBuffer = this.float32ToPCM16(downsampled);
        // Convert to Base64
        const base64Pcm = this.pcmToBase64(pcmBuffer);
        
        this.onUserAudioCallback(base64Pcm);
      };

      this.audioSource.connect(this.scriptProcessor);
      this.scriptProcessor.connect(this.audioCtx.destination);
    } catch (error) {
      console.error("[AudioStreamer] Start recording failed:", error);
      throw error;
    }
  }

  /**
   * Stop recording mic input and clean up audio nodes.
   */
  stopRecording() {
    this.onUserAudioCallback = null;
    
    if (this.scriptProcessor) {
      this.scriptProcessor.disconnect();
      this.scriptProcessor = null;
    }
    
    if (this.audioSource) {
      this.audioSource.disconnect();
      this.audioSource = null;
    }

    if (this.mediaStream) {
      this.mediaStream.getTracks().forEach((track) => track.stop());
      this.mediaStream = null;
    }
  }

  /**
   * Add 24kHz base64-encoded PCM16 audio chunk into playback queue.
   */
  async playAudioChunk(base64Pcm: string, onPlaybackState: (isPlaying: boolean) => void) {
    this.onPlaybackStateChange = onPlaybackState;
    try {
      await this.initAudioContext();
      if (!this.audioCtx) return;

      const float32Data = this.base64ToFloat32(base64Pcm);
      
      // Create a single-channel Web Audio buffer at 24000Hz
      const audioBuffer = this.audioCtx.createBuffer(1, float32Data.length, 24000);
      audioBuffer.copyToChannel(float32Data, 0);

      const source = this.audioCtx.createBufferSource();
      source.buffer = audioBuffer;
      source.connect(this.audioCtx.destination);

      this.activeSources.add(source);
      
      // Handle the ending of a chunk
      source.onended = () => {
        this.activeSources.delete(source);
        if (this.activeSources.size === 0 && this.onPlaybackStateChange) {
          this.onPlaybackStateChange(false);
        }
      };

      // Notify that audio is playing
      if (this.onPlaybackStateChange) {
        this.onPlaybackStateChange(true);
      }

      // Schedule accurate playback timeline to avoid network gaps
      const currentTime = this.audioCtx.currentTime;
      if (this.nextStartTime < currentTime) {
        // Timeline is in the past, reset with a small safe start gap (30ms)
        this.nextStartTime = currentTime + 0.03;
      }

      source.start(this.nextStartTime);
      this.nextStartTime += audioBuffer.duration;

    } catch (error) {
      console.error("[AudioStreamer] Play chunk failed:", error);
    }
  }

  /**
   * Cancel all running and queued audio immediately on interruption.
   */
  stopPlayback() {
    console.log("[AudioStreamer] Stop playback (Interruption)");
    
    // Call stop on all active playback source nodes
    this.activeSources.forEach((source) => {
      try {
        source.stop();
      } catch (e) {
        // Node might have already finished
      }
    });
    
    this.activeSources.clear();
    this.nextStartTime = 0;

    if (this.onPlaybackStateChange) {
      this.onPlaybackStateChange(false);
    }
  }

  /**
   * Linear Downsampling helper.
   */
  private downsampleBuffer(buffer: Float32Array, inputRate: number, outputRate: number): Float32Array {
    if (inputRate === outputRate) return buffer;
    
    const sampleRateRatio = inputRate / outputRate;
    const newLength = Math.round(buffer.length / sampleRateRatio);
    const result = new Float32Array(newLength);
    
    let offsetResult = 0;
    let offsetBuffer = 0;
    
    while (offsetResult < result.length) {
      const nextOffsetBuffer = Math.round((offsetResult + 1) * sampleRateRatio);
      let accum = 0;
      let count = 0;
      
      for (let i = offsetBuffer; i < nextOffsetBuffer && i < buffer.length; i++) {
        accum += buffer[i];
        count++;
      }
      
      result[offsetResult] = count > 0 ? accum / count : 0;
      offsetResult++;
      offsetBuffer = nextOffsetBuffer;
    }
    
    return result;
  }

  /**
   * Convert normalized float32 values of standard sample bounds into Signed Int16 ArrayBuffer
   */
  private float32ToPCM16(float32Array: Float32Array): ArrayBuffer {
    const buffer = new ArrayBuffer(float32Array.length * 2);
    const view = new DataView(buffer);
    let offset = 0;
    for (let i = 0; i < float32Array.length; i++, offset += 2) {
      const s = Math.max(-1, Math.min(1, float32Array[i]));
      view.setInt16(offset, s < 0 ? s * 0x8000 : s * 0x7fff, true); // Little endian
    }
    return buffer;
  }

  /**
   * Convert raw PCM ArrayBuffer to Base64 String
   */
  private pcmToBase64(arrayBuffer: ArrayBuffer): string {
    const bytes = new Uint8Array(arrayBuffer);
    let binary = "";
    const len = bytes.byteLength;
    for (let i = 0; i < len; i++) {
      binary += String.fromCharCode(bytes[i]);
    }
    return btoa(binary);
  }

  /**
   * Convert 24kHz Base64 PCM16 back to structured float32 space
   */
  private base64ToFloat32(base64: string): Float32Array {
    const binaryString = atob(base64);
    const len = binaryString.length;
    const bytes = new Uint8Array(len);
    for (let i = 0; i < len; i++) {
      bytes[i] = binaryString.charCodeAt(i);
    }
    
    const int16Array = new Int16Array(bytes.buffer);
    const float32Array = new Float32Array(int16Array.length);
    for (let i = 0; i < int16Array.length; i++) {
      // Scale back to [-1.0, 1.0] float representation
      float32Array[i] = int16Array[i] / 32768.0;
    }
    
    return float32Array;
  }
}
