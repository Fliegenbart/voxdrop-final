import { useState, useRef, useEffect, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Send, Mic, MicOff, Loader2, Scissors, Play, Clock, Volume2,
  Trash2, Zap, Bot, Check, X
} from "lucide-react";
import type { SessionFile } from "@/hooks/use-session";
import type { EditMode } from "./ModeSelector";

// ── Types ──────────────────────────────────────────────────────────────

interface VideoAiCommand {
  action: string;
  params: Record<string, number>;
}

interface ChatReply {
  text: string;
  actions?: VideoAiCommand[];
  suggestions?: string[];
}

export type ChatMessage =
  | { role: "assistant"; type: "text"; content: string; suggestions?: string[] }
  | { role: "assistant"; type: "preview"; command: VideoAiCommand; description: string }
  | { role: "assistant"; type: "thinking" }
  | { role: "user"; type: "text"; content: string };

// ── Props ──────────────────────────────────────────────────────────────

interface AiChatPanelProps {
  files: SessionFile[];
  selectedFile: SessionFile | null;
  duration: number;
  currentTime: number;
  transcript?: string;
  mode: EditMode;
  onSeek: (time: number) => void;
  onTrim: (start: number, end: number) => void;
  onCut: (start: number, end: number) => void;
  onRemoveFillers: () => void;
  onSetMode: (mode: EditMode) => void;
  onFreezeFrame: (fileId: string, time: number) => void;
}

// ── Helpers ────────────────────────────────────────────────────────────

function formatSec(s: number): string {
  const m = Math.floor(s / 60);
  const sec = Math.floor(s % 60);
  return `${m}:${String(sec).padStart(2, "0")}`;
}

const ACTION_LABELS: Record<string, { icon: typeof Scissors; label: string }> = {
  trim: { icon: Scissors, label: "Kürzen" },
  cut: { icon: Trash2, label: "Ausschneiden" },
  seek: { icon: Play, label: "Springen zu" },
  freeze_frame: { icon: Clock, label: "Standbild" },
  speed: { icon: Zap, label: "Geschwindigkeit" },
  silence: { icon: Volume2, label: "Stille einfügen" },
  remove_fillers: { icon: Trash2, label: "Füllwörter entfernen" },
};

function describeCommand(cmd: VideoAiCommand): string {
  const p = cmd.params;
  switch (cmd.action) {
    case "trim":
      return `Behalte nur ${formatSec(p.startSeconds)}–${formatSec(p.endSeconds)}`;
    case "cut":
      return `Entferne ${formatSec(p.startSeconds)}–${formatSec(p.endSeconds)}`;
    case "seek":
      return `Springe zu ${formatSec(p.timeSeconds)}`;
    case "freeze_frame":
      return `Standbild bei ${formatSec(p.atSeconds ?? p.timeSeconds)} (${p.durationSeconds ?? 3}s)`;
    case "speed":
      return `${p.factor}x Geschwindigkeit ${formatSec(p.startSeconds)}–${formatSec(p.endSeconds)}`;
    case "silence":
      return `${p.durationSeconds ?? 1}s Stille bei ${formatSec(p.atSeconds ?? p.timeSeconds)}`;
    case "remove_fillers":
      return "Alle Füllwörter automatisch entfernen";
    default:
      return cmd.action;
  }
}

// Timeline mini-bar showing affected region
function TimelineMiniBar({ command, duration }: { command: VideoAiCommand; duration: number }) {
  if (!duration || duration <= 0) return null;
  const p = command.params;
  let left = 0, width = 100;

  if (command.action === "trim") {
    left = ((p.startSeconds ?? 0) / duration) * 100;
    width = (((p.endSeconds ?? duration) - (p.startSeconds ?? 0)) / duration) * 100;
  } else if (command.action === "cut") {
    left = ((p.startSeconds ?? 0) / duration) * 100;
    width = (((p.endSeconds ?? 0) - (p.startSeconds ?? 0)) / duration) * 100;
  } else if (command.action === "seek" || command.action === "freeze_frame") {
    const t = p.timeSeconds ?? p.atSeconds ?? 0;
    left = (t / duration) * 100;
    width = 2;
  } else {
    return null;
  }

  const isCut = command.action === "cut";

  return (
    <div className="w-full h-3 bg-slate-200 rounded-full overflow-hidden relative mt-2 mb-1">
      <div
        className={`absolute top-0 h-full rounded-full ${isCut ? "bg-red-400/60" : "bg-purple-400/60"}`}
        style={{ left: `${Math.max(0, left)}%`, width: `${Math.min(100, width)}%` }}
      />
    </div>
  );
}

// ── Component ──────────────────────────────────────────────────────────

export function AiChatPanel({
  files,
  selectedFile,
  duration,
  currentTime,
  transcript,
  mode,
  onSeek,
  onTrim,
  onCut,
  onRemoveFillers,
  onSetMode,
  onFreezeFrame,
}: AiChatPanelProps) {
  const [messages, setMessages] = useState<ChatMessage[]>([
    {
      role: "assistant",
      type: "text",
      content: "Hallo! Ich bin dein Schnittassistent. Was hast du vor \u2014 kannst du mir dein Projekt grob umrei\u00dfen?",
      suggestions: ["Schulungsvideo k\u00fcrzen", "F\u00fcllw\u00f6rter entfernen", "Video f\u00fcr Website vorbereiten"],
    },
  ]);
  const [input, setInput] = useState("");
  const [isThinking, setIsThinking] = useState(false);
  const [isListening, setIsListening] = useState(false);
  const [interimTranscript, setInterimTranscript] = useState("");
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const recognitionRef = useRef<any>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // Auto-scroll on new messages
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, isThinking]);

  // ── Send message ───────────────────────────────────────────────────

  const sendMessage = useCallback(async (text: string) => {
    if (!text.trim() || isThinking) return;

    const userMsg: ChatMessage = { role: "user", type: "text", content: text.trim() };
    setMessages((prev) => [...prev, userMsg]);
    setInput("");
    setIsThinking(true);

    try {
      const res = await fetch("/api/video-ai/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          messages: [...messages, userMsg].map((m) => {
            if (m.type === "thinking") return null;
            if (m.type === "preview") return { role: m.role, content: `[Aktion: ${m.command.action}] ${m.description}` };
            return { role: m.role, content: m.content };
          }).filter(Boolean),
          projectContext: {
            hasFiles: files.length > 0,
            selectedFileName: selectedFile?.name,
            duration: duration || undefined,
            currentTime: currentTime || undefined,
            transcript: transcript?.slice(0, 3000),
            mode,
          },
        }),
      });

      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data?.error || "Chat fehlgeschlagen");

      const reply = data.reply as ChatReply;
      const newMessages: ChatMessage[] = [];

      if (reply.text) {
        newMessages.push({
          role: "assistant",
          type: "text",
          content: reply.text,
          suggestions: reply.suggestions,
        });
      }

      if (reply.actions?.length) {
        for (const action of reply.actions) {
          newMessages.push({
            role: "assistant",
            type: "preview",
            command: action,
            description: describeCommand(action),
          });
        }
      }

      setMessages((prev) => [...prev, ...newMessages]);
    } catch (err: any) {
      setMessages((prev) => [
        ...prev,
        {
          role: "assistant",
          type: "text",
          content: `Entschuldigung, da ist etwas schiefgelaufen: ${err?.message || "Unbekannter Fehler"}. Du kannst alle Tools weiterhin manuell nutzen.`,
        },
      ]);
    } finally {
      setIsThinking(false);
    }
  }, [messages, files, selectedFile, duration, currentTime, transcript, mode, isThinking]);

  // ── Execute a preview command ──────────────────────────────────────

  const executeCommand = useCallback((cmd: VideoAiCommand) => {
    const p = cmd.params;
    switch (cmd.action) {
      case "seek":
        onSeek(p.timeSeconds);
        break;
      case "trim":
        onSetMode("trim");
        onTrim(p.startSeconds, p.endSeconds);
        break;
      case "cut":
        onSetMode("cut");
        onCut(p.startSeconds, p.endSeconds);
        break;
      case "freeze_frame":
        if (selectedFile) onFreezeFrame(selectedFile.id, p.atSeconds ?? p.timeSeconds);
        break;
      case "remove_fillers":
        onRemoveFillers();
        break;
    }
    setMessages((prev) => [
      ...prev,
      { role: "assistant", type: "text", content: "Erledigt! Was m\u00f6chtest du als N\u00e4chstes?" },
    ]);
  }, [onSeek, onTrim, onCut, onRemoveFillers, onSetMode, onFreezeFrame, selectedFile]);

  const dismissCommand = useCallback((idx: number) => {
    setMessages((prev) => prev.filter((_, i) => i !== idx));
  }, []);

  // ── Voice input ────────────────────────────────────────────────────

  const startListening = useCallback(() => {
    const SR = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (!SR) return;

    const recognition = new SR();
    recognition.lang = "de-DE";
    recognition.continuous = false;
    recognition.interimResults = true;
    recognition.maxAlternatives = 1;

    recognition.onstart = () => {
      setIsListening(true);
      setInterimTranscript("");
    };

    recognition.onresult = (event: any) => {
      let interim = "", final = "";
      for (let i = event.resultIndex; i < event.results.length; i++) {
        const t = event.results[i][0].transcript;
        if (event.results[i].isFinal) final += t;
        else interim += t;
      }
      if (final) {
        setInterimTranscript("");
        sendMessage(final);
      } else {
        setInterimTranscript(interim);
      }
    };

    recognition.onerror = () => {
      setIsListening(false);
      setInterimTranscript("");
    };

    recognition.onend = () => {
      setIsListening(false);
      setInterimTranscript("");
    };

    recognitionRef.current = recognition;
    recognition.start();
  }, [sendMessage]);

  const stopListening = useCallback(() => {
    recognitionRef.current?.stop();
    recognitionRef.current = null;
    setIsListening(false);
    setInterimTranscript("");
  }, []);

  const toggleVoice = useCallback(() => {
    if (isListening) stopListening();
    else startListening();
  }, [isListening, startListening, stopListening]);

  // ── Submit ─────────────────────────────────────────────────────────

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    sendMessage(input);
  };

  // ── Render ─────────────────────────────────────────────────────────

  return (
    <div className="flex flex-col h-full bg-white rounded-2xl border border-slate-200 overflow-hidden">
      {/* Header */}
      <div className="flex items-center gap-2 px-4 py-3 border-b border-slate-100 bg-gradient-to-r from-purple-50 to-slate-50">
        <Bot className="w-5 h-5 text-purple-600" />
        <span className="font-semibold text-sm text-slate-800">Schnittassistent</span>
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto px-4 py-3 space-y-3 min-h-0">
        {messages.map((msg, idx) => {
          if (msg.type === "thinking") return null;

          // User message
          if (msg.role === "user") {
            return (
              <div key={idx} className="flex justify-end">
                <div className="max-w-[85%] bg-purple-600 text-white rounded-2xl rounded-br-md px-3 py-2 text-sm">
                  {msg.content}
                </div>
              </div>
            );
          }

          // Preview card
          if (msg.type === "preview") {
            const info = ACTION_LABELS[msg.command.action] || { icon: Zap, label: msg.command.action };
            const Icon = info.icon;
            return (
              <div key={idx} className="max-w-[90%]">
                <div className="bg-slate-50 border border-slate-200 rounded-xl p-3">
                  <div className="flex items-center gap-2 mb-1">
                    <Icon className="w-4 h-4 text-purple-600" />
                    <span className="font-medium text-sm text-slate-800">{info.label}</span>
                  </div>
                  <p className="text-xs text-slate-600 mb-1">{msg.description}</p>
                  <TimelineMiniBar command={msg.command} duration={duration} />
                  <div className="flex gap-2 mt-2">
                    <Button
                      size="sm"
                      className="bg-purple-600 hover:bg-purple-700 text-white text-xs h-7 px-3"
                      onClick={() => executeCommand(msg.command)}
                    >
                      <Check className="w-3 h-3 mr-1" /> Ausf\u00fchren
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      className="text-xs h-7 px-3 text-slate-500"
                      onClick={() => dismissCommand(idx)}
                    >
                      <X className="w-3 h-3 mr-1" /> Verwerfen
                    </Button>
                  </div>
                </div>
              </div>
            );
          }

          // Assistant text
          return (
            <div key={idx}>
              <div className="max-w-[90%] bg-slate-100 text-slate-800 rounded-2xl rounded-bl-md px-3 py-2 text-sm whitespace-pre-wrap">
                {msg.content}
              </div>
              {/* Quick-reply suggestions */}
              {msg.suggestions && msg.suggestions.length > 0 && idx === messages.length - 1 && (
                <div className="flex flex-wrap gap-1.5 mt-2">
                  {msg.suggestions.map((s, si) => (
                    <button
                      key={si}
                      onClick={() => sendMessage(s)}
                      className="px-3 py-1 bg-white border border-purple-200 text-purple-700 rounded-full text-xs hover:bg-purple-50 transition-colors"
                    >
                      {s}
                    </button>
                  ))}
                </div>
              )}
            </div>
          );
        })}

        {/* Thinking indicator */}
        {isThinking && (
          <div className="flex items-center gap-2 text-slate-400 text-sm">
            <Loader2 className="w-4 h-4 animate-spin" />
            <span>Denkt nach...</span>
          </div>
        )}

        {/* Interim voice transcript */}
        {isListening && interimTranscript && (
          <div className="flex justify-end">
            <div className="max-w-[85%] bg-purple-100 text-purple-600 rounded-2xl rounded-br-md px-3 py-2 text-sm italic">
              {interimTranscript}...
            </div>
          </div>
        )}

        <div ref={messagesEndRef} />
      </div>

      {/* Input bar */}
      <form onSubmit={handleSubmit} className="flex items-center gap-2 px-3 py-3 border-t border-slate-100 bg-slate-50">
        <button
          type="button"
          onClick={toggleVoice}
          className={`shrink-0 p-2 rounded-full transition-colors ${
            isListening
              ? "bg-red-100 text-red-600 animate-pulse"
              : "bg-slate-100 text-slate-500 hover:bg-slate-200"
          }`}
          title={isListening ? "Aufnahme stoppen" : "Sprachnachricht"}
        >
          {isListening ? <MicOff className="w-4 h-4" /> : <Mic className="w-4 h-4" />}
        </button>

        <Input
          ref={inputRef}
          value={isListening ? interimTranscript || "H\u00f6re zu..." : input}
          onChange={(e) => setInput(e.target.value)}
          placeholder="Nachricht eingeben..."
          disabled={isThinking || isListening}
          className="flex-1 text-sm h-9 bg-white"
        />

        <Button
          type="submit"
          size="sm"
          disabled={isThinking || !input.trim()}
          className="shrink-0 bg-purple-600 hover:bg-purple-700 h-9 w-9 p-0"
        >
          <Send className="w-4 h-4" />
        </Button>
      </form>
    </div>
  );
}
