import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

interface ExportSettingsProps {
  exportProfileEnabled: boolean;
  onExportProfileEnabledChange: (v: boolean) => void;
  exportSettingsOpen: boolean;
  onExportSettingsOpenChange: (v: boolean) => void;
  exportAspect: 'original' | '16:9' | '4:3' | '9:16';
  onExportAspectChange: (v: 'original' | '16:9' | '4:3' | '9:16') => void;
  exportNormalizeAudio: boolean;
  onExportNormalizeAudioChange: (v: boolean) => void;
  exportCleanAudio: boolean;
  onExportCleanAudioChange: (v: boolean) => void;
  exportFastModeEnabled: boolean;
  onExportFastModeEnabledChange: (v: boolean) => void;
}

export function ExportSettings({
  exportProfileEnabled,
  onExportProfileEnabledChange,
  exportSettingsOpen,
  onExportSettingsOpenChange,
  exportAspect,
  onExportAspectChange,
  exportNormalizeAudio,
  onExportNormalizeAudioChange,
  exportCleanAudio,
  onExportCleanAudioChange,
  exportFastModeEnabled,
  onExportFastModeEnabledChange,
}: ExportSettingsProps) {
  return (
    <div className="flex items-center justify-between mb-4">
      <div className="flex-1">
        <div className="bg-white rounded-2xl border border-slate-200 p-4">
          <div className="flex items-start justify-between gap-4 flex-wrap">
            <label className="flex items-center gap-2 text-sm text-slate-800 select-none">
              <input
                type="checkbox"
                checked={exportProfileEnabled}
                onChange={(e) => onExportProfileEnabledChange(e.target.checked)}
                className="h-4 w-4 rounded border-slate-300 text-purple-600 focus:ring-purple-500"
              />
              Intranet-Profil (max. 125 MB, 720p)
            </label>

            <Collapsible open={exportSettingsOpen} onOpenChange={onExportSettingsOpenChange}>
              <CollapsibleTrigger asChild>
                <button className="text-xs text-slate-600 hover:text-slate-900 underline underline-offset-4">
                  Export-Einstellungen
                </button>
              </CollapsibleTrigger>
              <CollapsibleContent>
                <div className="mt-3 grid grid-cols-1 md:grid-cols-4 gap-3">
                  <div>
                    <div className="text-xs font-medium text-slate-700 mb-1">Seitenverhältnis</div>
                    <Select value={exportAspect} onValueChange={(v) => onExportAspectChange(v as any)}>
                      <SelectTrigger>
                        <SelectValue placeholder="Original" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="original">Original</SelectItem>
                        <SelectItem value="16:9">16:9</SelectItem>
                        <SelectItem value="4:3">4:3</SelectItem>
                        <SelectItem value="9:16">9:16</SelectItem>
                      </SelectContent>
                    </Select>
                    <div className="mt-1 text-[11px] text-slate-500">
                      Kein Crop: wir füllen mit Balken auf.
                    </div>
                  </div>

                  <div className="flex items-start gap-2 pt-5">
                    <input
                      id="export-normalize-audio"
                      type="checkbox"
                      checked={exportNormalizeAudio}
                      onChange={(e) => onExportNormalizeAudioChange(e.target.checked)}
                      className="h-4 w-4 rounded border-slate-300 text-purple-600 focus:ring-purple-500"
                    />
                    <label htmlFor="export-normalize-audio" className="text-xs text-slate-700 select-none">
                      Audio normalisieren (Lautstärke)
                    </label>
                  </div>

                  <div className="flex items-start gap-2 pt-5">
                    <input
                      id="export-clean-audio"
                      type="checkbox"
                      checked={exportCleanAudio}
                      onChange={(e) => onExportCleanAudioChange(e.target.checked)}
                      className="h-4 w-4 rounded border-slate-300 text-purple-600 focus:ring-purple-500"
                    />
                    <label htmlFor="export-clean-audio" className="text-xs text-slate-700 select-none">
                      Clean Audio (Rauschen reduzieren)
                    </label>
                  </div>

                  <div className="flex items-start gap-2 pt-5">
                    <input
                      id="export-fast-mode"
                      type="checkbox"
                      checked={exportFastModeEnabled}
                      onChange={(e) => onExportFastModeEnabledChange(e.target.checked)}
                      className="h-4 w-4 rounded border-slate-300 text-purple-600 focus:ring-purple-500"
                    />
                    <label htmlFor="export-fast-mode" className="text-xs text-slate-700 select-none">
                      Schneller Export (wenn möglich)
                    </label>
                  </div>
                </div>
              </CollapsibleContent>
            </Collapsible>
          </div>
          <div className="mt-2 text-xs text-slate-500">
            empfohlen für Intranet Upload-Limits
          </div>
        </div>
      </div>
    </div>
  );
}
