import React, { useEffect, useRef, useState } from 'react';
import {
  FileAudio,
  Keyboard,
  Loader2,
  Mic,
  Sparkles,
  Square,
  X,
} from 'lucide-react';
import {
  parseVoiceCommandWithGroqAI,
  transcribeAudioWithGroqWhisper,
  type ParsedVoiceResult,
} from '../services/integrations';

interface SmartVoiceModalProps {
  isOpen: boolean;
  onClose: () => void;
  context: 'purchase' | 'billing' | 'search';
  onVoiceApplied: (result: ParsedVoiceResult) => void;
  title?: string;
}

export const SmartVoiceModal: React.FC<SmartVoiceModalProps> = ({
  isOpen,
  onClose,
  context,
  onVoiceApplied,
  title,
}) => {
  const [phase, setPhase] = useState<'recording' | 'fallback_input' | 'processing'>('fallback_input');
  const [voiceText, setVoiceText] = useState('');
  const [recordSeconds, setRecordSeconds] = useState(0);
  const [statusLabel, setStatusLabel] = useState('Transcribing with Groq Whisper...');
  const [errorNote, setErrorNote] = useState<string | null>(null);

  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioStreamRef = useRef<MediaStream | null>(null);
  const chunksRef = useRef<BlobPart[]>([]);
  const timerRef = useRef<number | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);
  const nativeAudioInputRef = useRef<HTMLInputElement | null>(null);

  const stopRecorderTracks = () => {
    if (timerRef.current) {
      window.clearInterval(timerRef.current);
      timerRef.current = null;
    }
    if (audioStreamRef.current) {
      audioStreamRef.current.getTracks().forEach((t) => t.stop());
      audioStreamRef.current = null;
    }
  };

  const applyTranscriptWithAI = async (rawText: string) => {
    const cleaned = rawText.trim();
    if (!cleaned) return;
    setPhase('processing');
    setStatusLabel('Understanding items with Groq AI...');
    setErrorNote(null);
    try {
      const parsed = await parseVoiceCommandWithGroqAI(cleaned, context);
      onVoiceApplied(parsed);
      setVoiceText('');
      onClose();
    } catch {
      onVoiceApplied({
        transcript: cleaned,
        items: [{ name: cleaned, qty: 1, price: 0, mrp: 0, unit: 'Piece' }],
        searchQuery: cleaned,
      });
      setVoiceText('');
      onClose();
    }
  };

  const handleAudioBlob = async (blob: Blob, fileName = 'recording.webm') => {
    setPhase('processing');
    setStatusLabel('Transcribing voice via Groq Whisper AI...');
    setErrorNote(null);
    try {
      const transcript = await transcribeAudioWithGroqWhisper(blob, fileName);
      if (!transcript) {
        setPhase('fallback_input');
        setErrorNote('Could not hear words clearly. Please speak again or use Gboard Mic (🎤).');
        setTimeout(() => textareaRef.current?.focus(), 80);
        return;
      }
      setVoiceText(transcript);
      await applyTranscriptWithAI(transcript);
    } catch {
      // Seamless transition to Gboard / Native text input without frightening alerts
      setPhase('fallback_input');
      setTimeout(() => textareaRef.current?.focus(), 80);
    }
  };

  const startMediaRecorder = async () => {
    setErrorNote(null);
    setRecordSeconds(0);

    if (
      !navigator.mediaDevices ||
      !navigator.mediaDevices.getUserMedia ||
      typeof MediaRecorder === 'undefined'
    ) {
      // Layer 2 seamless transition (no error alert)
      setPhase('fallback_input');
      setTimeout(() => textareaRef.current?.focus(), 100);
      return;
    }

    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      audioStreamRef.current = stream;
      chunksRef.current = [];

      const mimeType = MediaRecorder.isTypeSupported('audio/webm')
        ? 'audio/webm'
        : MediaRecorder.isTypeSupported('audio/mp4')
          ? 'audio/mp4'
          : '';

      const recorder = mimeType
        ? new MediaRecorder(stream, { mimeType })
        : new MediaRecorder(stream);

      mediaRecorderRef.current = recorder;

      recorder.ondataavailable = (ev) => {
        if (ev.data && ev.data.size > 0) {
          chunksRef.current.push(ev.data);
        }
      };

      recorder.onstop = () => {
        stopRecorderTracks();
        const blobType = recorder.mimeType || 'audio/webm';
        const blob = new Blob(chunksRef.current, { type: blobType });
        if (blob.size > 0) {
          const ext = blobType.includes('mp4') ? 'm4a' : 'webm';
          void handleAudioBlob(blob, `voice_${Date.now()}.${ext}`);
        } else {
          setPhase('fallback_input');
          setTimeout(() => textareaRef.current?.focus(), 80);
        }
      };

      recorder.start();
      setPhase('recording');
      timerRef.current = window.setInterval(() => {
        setRecordSeconds((s) => s + 1);
      }, 1000);
    } catch {
      // Blocked or denied in Android WebView -> immediately switch to Layer 2 Gboard + Native Audio Modal
      stopRecorderTracks();
      setPhase('fallback_input');
      setTimeout(() => textareaRef.current?.focus(), 100);
    }
  };

  const stopRecordingAndTranscribe = () => {
    const rec = mediaRecorderRef.current;
    if (rec && rec.state !== 'inactive') {
      rec.stop();
    } else {
      stopRecorderTracks();
      setPhase('fallback_input');
    }
  };

  useEffect(() => {
    if (!isOpen) {
      const rec = mediaRecorderRef.current;
      if (rec && rec.state !== 'inactive') {
        rec.onstop = null;
        rec.stop();
      }
      stopRecorderTracks();
      setVoiceText('');
      setErrorNote(null);
      return;
    }

    void startMediaRecorder();

    return () => {
      const rec = mediaRecorderRef.current;
      if (rec && rec.state !== 'inactive') {
        rec.onstop = null;
        rec.stop();
      }
      stopRecorderTracks();
    };
  }, [isOpen]);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 bg-black/65 flex items-end justify-center">
      {/* Hidden Native Audio Capture Input for Android WebView fallback */}
      <input
        ref={nativeAudioInputRef}
        type="file"
        accept="audio/*"
        capture
        className="hidden"
        onChange={(e) => {
          const file = e.target.files?.[0];
          e.target.value = '';
          if (file) {
            void handleAudioBlob(file, file.name || 'native_voice.m4a');
          }
        }}
      />

      <div className="bg-white w-full max-w-md rounded-t-3xl p-5 space-y-4 shadow-2xl">
        <div className="w-10 h-1 bg-slate-300 rounded-full mx-auto" />

        {/* Header */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="w-10 h-10 rounded-2xl bg-gradient-to-br from-purple-600 to-indigo-600 text-white flex items-center justify-center shadow">
              <Mic className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-base font-extrabold text-[#0A2540]">
                {title || '🎙️ Smart Voice Input'}
              </h3>
              <p className="text-[11px] text-slate-500">
                Hindi, Hinglish & English • Powered by Groq Whisper + AI
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={() => {
              stopRecorderTracks();
              onClose();
            }}
            className="p-2 rounded-full bg-slate-100 text-slate-600"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* PHASE 1: Live MediaRecorder Active */}
        {phase === 'recording' && (
          <div className="bg-purple-50 border border-purple-200 rounded-2xl p-6 text-center space-y-4">
            <div className="w-16 h-16 rounded-full bg-purple-600 text-white flex items-center justify-center mx-auto animate-pulse shadow-lg">
              <Mic className="w-8 h-8" />
            </div>
            <div>
              <p className="text-sm font-extrabold text-[#0A2540]">
                Listening... ({recordSeconds}s)
              </p>
              <p className="text-xs text-slate-500 mt-1">
                Speak like: &ldquo;2 iPhone 15 65000 में&rdquo; or &ldquo;5 kg Basmati Rice 120&rdquo;
              </p>
            </div>
            <div className="grid grid-cols-2 gap-2.5">
              <button
                type="button"
                onClick={() => {
                  const rec = mediaRecorderRef.current;
                  if (rec && rec.state !== 'inactive') {
                    rec.onstop = null;
                    rec.stop();
                  }
                  stopRecorderTracks();
                  setPhase('fallback_input');
                  setTimeout(() => textareaRef.current?.focus(), 80);
                }}
                className="py-2.5 px-3 rounded-xl border border-slate-300 bg-white text-slate-700 text-xs font-bold flex items-center justify-center gap-1.5"
              >
                <Keyboard className="w-4 h-4" />
                <span>Use Gboard Mic</span>
              </button>
              <button
                type="button"
                onClick={stopRecordingAndTranscribe}
                className="py-2.5 px-3 rounded-xl bg-rose-600 text-white text-xs font-extrabold flex items-center justify-center gap-1.5 shadow"
              >
                <Square className="w-3.5 h-3.5 fill-white" />
                <span>Stop & Apply</span>
              </button>
            </div>
          </div>
        )}

        {/* PHASE 2: Processing Whisper / LLM */}
        {phase === 'processing' && (
          <div className="bg-indigo-50 border border-indigo-200 rounded-2xl p-7 text-center space-y-3">
            <Loader2 className="w-9 h-9 text-indigo-600 animate-spin mx-auto" />
            <p className="text-sm font-extrabold text-[#0A2540]">{statusLabel}</p>
            {voiceText && (
              <p className="text-xs text-slate-600 bg-white rounded-xl p-2.5 border border-indigo-100">
                &ldquo;{voiceText}&rdquo;
              </p>
            )}
          </div>
        )}

        {/* PHASE 3: Layer 2 Gboard Voice Typing + Native Hardware Audio Recorder */}
        {phase === 'fallback_input' && (
          <div className="space-y-3">
            <div className="bg-slate-50 border border-slate-200 rounded-2xl p-3 space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-[11px] font-bold text-[#0A2540] flex items-center gap-1">
                  <Keyboard className="w-3.5 h-3.5 text-purple-600" />
                  Tap box &amp; press Keyboard Mic (🎤)
                </span>
                <button
                  type="button"
                  onClick={() => nativeAudioInputRef.current?.click()}
                  className="text-[11px] font-bold text-purple-700 bg-purple-100 px-2.5 py-1 rounded-lg flex items-center gap-1"
                >
                  <FileAudio className="w-3.5 h-3.5" />
                  <span>Record Voice Clip</span>
                </button>
              </div>

              <textarea
                ref={textareaRef}
                autoFocus
                rows={3}
                value={voiceText}
                onChange={(e) => setVoiceText(e.target.value)}
                placeholder="कीबोर्ड का माइक (🎤) दबाकर बोलें (जैसे: 2 iPhone 15 65000 में)..."
                className="w-full bg-white border border-slate-300 rounded-xl p-3 text-sm text-slate-900 outline-none focus:border-purple-600"
              />
            </div>

            {errorNote && (
              <p className="text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-xl px-3 py-2">
                {errorNote}
              </p>
            )}

            <div className="grid grid-cols-2 gap-2.5">
              <button
                type="button"
                onClick={() => nativeAudioInputRef.current?.click()}
                className="py-3 rounded-xl border border-purple-300 bg-purple-50 text-purple-800 font-bold text-xs flex items-center justify-center gap-1.5"
              >
                <Mic className="w-4 h-4" />
                <span>Native Recorder</span>
              </button>

              <button
                type="button"
                disabled={!voiceText.trim()}
                onClick={() => void applyTranscriptWithAI(voiceText)}
                className="py-3 rounded-xl bg-gradient-to-r from-[#0A2540] to-indigo-700 text-white font-extrabold text-xs flex items-center justify-center gap-1.5 shadow disabled:opacity-50"
              >
                <Sparkles className="w-4 h-4 text-amber-300" />
                <span>✨ Apply with AI</span>
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
