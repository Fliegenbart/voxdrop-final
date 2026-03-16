import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Scissors, MoveVertical, Merge, LayoutList, Cloud, Monitor, Zap, Loader2, Subtitles
} from "lucide-react";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { SmartSyncPanel } from "@/components/SmartSyncPanel";
import type { SessionFile } from "@/hooks/use-session";

export type EditMode = 'trim' | 'cut' | 'merge' | 'voiceover' | 'subtitles' | 'timeline' | 'record';

interface ModeSelectorProps {
  mode: EditMode;
  onModeChange: (mode: EditMode) => void;
  advancedToolsOpen: boolean;
  onAdvancedToolsOpenChange: (v: boolean) => void;
  // AI Regie
  regieOpen: boolean;
  onRegieOpenChange: (v: boolean) => void;
  regiePrompt: string;
  onRegiePromptChange: (v: string) => void;
  regieWorking: boolean;
  onRunRegie: () => void;
  // Smart-Sync
  smartSyncOpen: boolean;
  onSmartSyncOpenChange: (v: boolean) => void;
  sessionId: string | null;
  selectedFile: SessionFile | null;
  refreshSession: () => Promise<void>;
  onSmartSyncUseResult: (file: SessionFile) => void;
}

export function ModeSelector({
  mode,
  onModeChange,
  advancedToolsOpen,
  onAdvancedToolsOpenChange,
  regieOpen,
  onRegieOpenChange,
  regiePrompt,
  onRegiePromptChange,
  regieWorking,
  onRunRegie,
  smartSyncOpen,
  onSmartSyncOpenChange,
  sessionId,
  selectedFile,
  refreshSession,
  onSmartSyncUseResult,
}: ModeSelectorProps) {
  const isAdvancedMode = mode === "trim" || mode === "cut" || mode === "merge" || mode === "timeline";

  const modeButton = (
    m: EditMode,
    label: string,
    icon: React.ReactNode,
    tooltip: string,
    activeColor = 'bg-purple-600',
  ) => (
    <button
      onClick={() => onModeChange(m)}
      className={`flex items-center gap-2 px-4 py-2 rounded-lg transition-colors ${
        mode === m
          ? `${activeColor} text-white`
          : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
      }`}
      aria-label={label}
      title={tooltip}
    >
      {icon}
      {label}
    </button>
  );

  return (
    <div className="flex items-start justify-between gap-3 mb-4 flex-wrap">
      <div className="flex gap-2 flex-wrap">
        {modeButton('record', 'Aufnehmen', <Monitor className="w-4 h-4" />, 'Bildschirm, Kamera und Mikrofon aufnehmen', 'bg-red-600')}
        {modeButton('subtitles', 'Untertitel', <Subtitles className="w-4 h-4" />, 'Untertitel direkt hier erstellen und einbetten', 'bg-violet-600')}
        {modeButton('voiceover', 'Voice-Over', <Cloud className="w-4 h-4" />, 'KI-Stimme oder Mikrofon-Aufnahme über das Video legen', 'bg-orange-500')}
      </div>

      <Collapsible open={advancedToolsOpen} onOpenChange={onAdvancedToolsOpenChange}>
        <div className="flex justify-end">
          <CollapsibleTrigger asChild>
            <button
              className={`px-3 py-2 rounded-lg border text-sm transition-colors ${
                isAdvancedMode
                  ? "bg-slate-900 border-slate-900 text-white hover:bg-slate-800"
                  : "bg-white border-slate-200 text-slate-700 hover:bg-slate-50"
              }`}
            >
              Erweitert
            </button>
          </CollapsibleTrigger>
        </div>
        <CollapsibleContent>
          <div className="mt-2 flex gap-2 flex-wrap justify-end">
            <div className="w-full rounded-xl border border-slate-200 bg-white p-3">
              <div className="text-[11px] font-medium text-slate-600 mb-2">
                Manueller Schnitt
              </div>
              <div className="flex gap-2 flex-wrap">
                {modeButton('trim', 'Kürzen', <Scissors className="w-4 h-4" />, 'Anfang und Ende eines Videos abschneiden')}
                {modeButton('cut', 'Schneiden', <MoveVertical className="w-4 h-4" />, 'Mehrere Clips aus einem Video markieren und exportieren')}
                {modeButton('merge', 'Zusammenfügen', <Merge className="w-4 h-4" />, 'Mehrere Videos zu einem zusammensetzen')}
                {modeButton('timeline', 'Timeline', <LayoutList className="w-4 h-4" />, 'Multi-Track Editor mit Drag & Drop', 'bg-indigo-600')}
              </div>
            </div>

            <Collapsible open={regieOpen} onOpenChange={onRegieOpenChange}>
              <CollapsibleTrigger asChild>
                <button className="px-3 py-2 rounded-lg bg-white border border-slate-200 text-sm text-slate-700 hover:bg-slate-50" title="Natürlichsprachliche Befehle an den Editor geben">
                  KI-Befehle
                </button>
              </CollapsibleTrigger>
              <CollapsibleContent>
                <div className="mt-2 bg-white rounded-xl border border-slate-200 p-3 w-[min(560px,90vw)]">
                  <div className="text-xs font-medium text-slate-700 mb-2">Regie-Anweisung</div>
                  <div className="flex gap-2">
                    <Input
                      value={regiePrompt}
                      onChange={(e) => onRegiePromptChange(e.target.value)}
                      placeholder='z.B. "Lösche die ersten 5 Sekunden" oder "Springe zu 1:23"'
                    />
                    <Button
                      className="bg-slate-900 hover:bg-slate-800"
                      onClick={onRunRegie}
                      disabled={regieWorking}
                    >
                      {regieWorking ? <Loader2 className="w-4 h-4 animate-spin" /> : "Anwenden"}
                    </Button>
                  </div>
                  <div className="mt-2 text-[11px] text-slate-500">
                    Trim, Seek und Standbild werden aktuell unterstützt.
                  </div>
                </div>
              </CollapsibleContent>
            </Collapsible>

            <Collapsible open={smartSyncOpen} onOpenChange={onSmartSyncOpenChange}>
              <CollapsibleTrigger asChild>
                <button className="px-3 py-2 rounded-lg bg-white border border-violet-200 text-sm text-violet-800 hover:bg-violet-50" title="Video automatisch nach Skript schneiden">
                  <Zap className="w-4 h-4 inline-block mr-2" />
                  Auto-Pilot (Skript)
                </button>
              </CollapsibleTrigger>
              <CollapsibleContent>
                <SmartSyncPanel
                  sessionId={sessionId}
                  selectedFile={selectedFile}
                  refreshSession={refreshSession}
                  onUseResult={onSmartSyncUseResult}
                />
              </CollapsibleContent>
            </Collapsible>
          </div>
        </CollapsibleContent>
      </Collapsible>
    </div>
  );
}
