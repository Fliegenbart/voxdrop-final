import { useState } from "react";
import { Share2, Check } from "lucide-react";
import { Button } from "@/components/ui/button";

export function ShareButton({
  url,
  title,
  text,
  onShare,
}: {
  url: string;
  title: string;
  text: string;
  onShare?: (mode: "native" | "copy") => void;
}) {
  const [copied, setCopied] = useState(false);

  async function handleShare() {
    const payload = { title, text, url };

    try {
      if (typeof navigator !== "undefined" && "share" in navigator) {
        await navigator.share(payload);
        onShare?.("native");
        return;
      }
    } catch {
      // Fall through to copy.
    }

    try {
      await navigator.clipboard.writeText(url);
      onShare?.("copy");
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1400);
    } catch {
      // If clipboard fails (permissions), do nothing silently.
    }
  }

  return (
    <Button variant="outline" type="button" onClick={handleShare} aria-label="Ergebnis teilen">
      {copied ? <Check className="h-4 w-4" /> : <Share2 className="h-4 w-4" />}
      {copied ? "Link kopiert" : "Ergebnis teilen"}
    </Button>
  );
}
