import path from "path";
import { detectFileType } from "../utils/file-type";

export type UploadGuardRule<TType extends string> = {
  type: TType;
  exts: string[];
  mimeTypes: string[];
};

export type UploadValidationResult<TType extends string> = {
  inputType: TType | null;
  ext: string;
  detectedMime: string | null;
  error?: string;
};

export async function validateUploadByMagic<TType extends string>(
  filePath: string,
  originalName: string,
  rules: UploadGuardRule<TType>[],
): Promise<UploadValidationResult<TType>> {
  const ext = path.extname(originalName).toLowerCase();
  const detected = await detectFileType(filePath);
  const detectedMime = detected?.mime || null;

  const matched = rules.find((rule) => {
    if (!rule.exts.includes(ext)) return false;
    if (!detectedMime) return false;
    return rule.mimeTypes.includes(detectedMime);
  });

  if (matched) {
    return {
      inputType: matched.type,
      ext,
      detectedMime,
    };
  }

  // Legacy Office fallbacks: extension is known but magic-byte detection often reports generic zip.
  const extOnlyMatch = rules.find((rule) => rule.exts.includes(ext));
  if (extOnlyMatch && detectedMime === "application/zip") {
    return {
      inputType: extOnlyMatch.type,
      ext,
      detectedMime,
    };
  }

  return {
    inputType: null,
    ext,
    detectedMime,
    error: "Ungültiger Dateityp. Nur PPTX, PDF oder Word (DOCX) erlaubt.",
  };
}

