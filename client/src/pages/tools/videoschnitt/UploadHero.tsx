import React, { useState, useCallback } from "react";
import { Upload, Video } from "lucide-react";
import { Button } from "@/components/ui/button";

interface UploadHeroProps {
  onDrop: (e: React.DragEvent) => void;
  onFileUpload: (e: React.ChangeEvent<HTMLInputElement>) => void;
}

export function UploadHero({ onDrop, onFileUpload }: UploadHeroProps) {
  const [isDragOver, setIsDragOver] = useState(false);

  const handleDragEnter = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragOver(true);
  }, []);

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragOver(true);
  }, []);

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragOver(false);
  }, []);

  const handleDrop = useCallback((e: React.DragEvent) => {
    setIsDragOver(false);
    onDrop(e);
  }, [onDrop]);

  return (
    <div
      className={`relative rounded-2xl border-2 border-dashed p-12 text-center transition-colors ${
        isDragOver
          ? "border-purple-400 bg-purple-50/70"
          : "border-slate-300 bg-white hover:border-purple-300 hover:bg-purple-50/30"
      }`}
      onDragEnter={handleDragEnter}
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
    >
      <div className="mx-auto mb-6 flex h-20 w-20 items-center justify-center rounded-2xl bg-purple-100">
        {isDragOver ? (
          <Upload className="h-10 w-10 text-purple-600 animate-bounce" />
        ) : (
          <Video className="h-10 w-10 text-purple-600" />
        )}
      </div>
      <h3 className="text-xl font-semibold text-slate-900 mb-2">
        Video hochladen
      </h3>
      <p className="text-slate-500 mb-6 max-w-md mx-auto">
        Zieh ein Video hierher oder klicke auf den Button.
        Unterstützt MP4, MOV, WebM, MKV und weitere Formate.
      </p>
      <label className="cursor-pointer inline-block">
        <input
          type="file"
          accept="video/*,audio/*"
          onChange={onFileUpload}
          className="sr-only"
        />
        <Button asChild className="bg-purple-600 hover:bg-purple-700 text-white pointer-events-none">
          <span>
            <Upload className="w-4 h-4 mr-2" />
            Datei auswählen
          </span>
        </Button>
      </label>
    </div>
  );
}
