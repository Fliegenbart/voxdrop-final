import { useEffect, useRef, useId, useCallback } from "react";
import { X, Zap, Check, Crown, Sparkles } from "lucide-react";
import { Link } from "wouter";

interface UpgradeModalProps {
  isOpen: boolean;
  onClose: () => void;
  usedCount?: number;
  limitCount?: number;
  type?: "transcriptions" | "videos" | "podcast" | "simplify";
}

export function UpgradeModal({
  isOpen,
  onClose,
  usedCount = 5,
  limitCount = 5,
  type = "transcriptions"
}: UpgradeModalProps) {
  const modalRef = useRef<HTMLDivElement>(null);
  const closeButtonRef = useRef<HTMLButtonElement>(null);
  const previousActiveElement = useRef<HTMLElement | null>(null);

  // Unique IDs for ARIA
  const modalId = useId();
  const titleId = `${modalId}-title`;
  const descId = `${modalId}-desc`;

  const typeLabels: Record<NonNullable<UpgradeModalProps["type"]>, string> = {
    transcriptions: "Transkriptionen",
    videos: "Videos",
    podcast: "Podcasts",
    simplify: "Vereinfachungen",
  };
  const typeLabel = typeLabels[type] ?? "Nutzungen";

  // Focus trap implementation
  const handleKeyDown = useCallback((event: KeyboardEvent) => {
    if (event.key === 'Escape') {
      event.preventDefault();
      onClose();
      return;
    }

    if (event.key !== 'Tab') return;

    const modal = modalRef.current;
    if (!modal) return;

    const focusableElements = modal.querySelectorAll<HTMLElement>(
      'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'
    );

    const firstFocusable = focusableElements[0];
    const lastFocusable = focusableElements[focusableElements.length - 1];

    if (event.shiftKey) {
      // Shift + Tab
      if (document.activeElement === firstFocusable) {
        event.preventDefault();
        lastFocusable?.focus();
      }
    } else {
      // Tab
      if (document.activeElement === lastFocusable) {
        event.preventDefault();
        firstFocusable?.focus();
      }
    }
  }, [onClose]);

  // Setup focus trap and body scroll lock
  useEffect(() => {
    if (!isOpen) return;

    // Store current active element to restore focus later
    previousActiveElement.current = document.activeElement as HTMLElement;

    // Focus the close button when modal opens
    requestAnimationFrame(() => {
      closeButtonRef.current?.focus();
    });

    // Prevent body scroll
    const originalOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';

    // Add keyboard listener
    document.addEventListener('keydown', handleKeyDown);

    return () => {
      document.body.style.overflow = originalOverflow;
      document.removeEventListener('keydown', handleKeyDown);

      // Restore focus to previous element
      previousActiveElement.current?.focus();
    };
  }, [isOpen, handleKeyDown]);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/50 backdrop-blur-sm"
        onClick={onClose}
        aria-hidden="true"
      />

      {/* Modal */}
      <div
        ref={modalRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={descId}
        className="relative bg-white rounded-2xl shadow-2xl max-w-lg w-full overflow-hidden animate-fade-in"
      >
        {/* Close Button */}
        <button
          ref={closeButtonRef}
          onClick={onClose}
          aria-label="Dialog schliessen"
          className="absolute top-4 right-4 p-2 text-slate-400 hover:text-slate-600 transition-colors z-10 focus:outline-none focus-visible:ring-2 focus-visible:ring-violet-500 rounded-lg"
        >
          <X className="w-5 h-5" aria-hidden="true" />
        </button>

        {/* Header */}
        <div className="bg-gradient-to-br from-violet-600 to-purple-700 px-8 pt-10 pb-16 text-center text-white">
          <div className="w-16 h-16 bg-white/20 rounded-2xl flex items-center justify-center mx-auto mb-4" aria-hidden="true">
            <Zap className="w-8 h-8" />
          </div>
          <h2 id={titleId} className="text-2xl font-semibold mb-2">
            Limit erreicht
          </h2>
          <p id={descId} className="text-white/80">
            Sie haben {usedCount} von {limitCount} kostenlosen {typeLabel} diesen Monat verbraucht.
          </p>
        </div>

        {/* Content */}
        <div className="px-8 py-8 -mt-8">
          {/* Upgrade Card */}
          <div className="bg-gradient-to-br from-amber-50 to-yellow-50 border-2 border-amber-200 rounded-xl p-6 mb-6">
            <div className="flex items-center gap-3 mb-4">
              <div className="w-10 h-10 bg-gradient-to-br from-amber-400 to-yellow-500 rounded-lg flex items-center justify-center" aria-hidden="true">
                <Crown className="w-5 h-5 text-white" />
              </div>
              <div>
                <h3 className="font-semibold text-slate-900">VoxDrop Pro</h3>
                <p className="text-sm text-slate-600">Für professionelle Nutzer</p>
              </div>
            </div>

            <ul className="space-y-3 mb-6" aria-label="Pro-Vorteile">
              <li className="flex items-center gap-3 text-sm">
                <div className="w-5 h-5 rounded-full bg-green-100 flex items-center justify-center flex-shrink-0" aria-hidden="true">
                  <Check className="w-3 h-3 text-green-600" />
                </div>
                <span className="text-slate-700">100 Transkriptionen pro Monat</span>
              </li>
              <li className="flex items-center gap-3 text-sm">
                <div className="w-5 h-5 rounded-full bg-green-100 flex items-center justify-center flex-shrink-0" aria-hidden="true">
                  <Check className="w-3 h-3 text-green-600" />
                </div>
                <span className="text-slate-700">100 Video-Untertitelungen pro Monat</span>
              </li>
              <li className="flex items-center gap-3 text-sm">
                <div className="w-5 h-5 rounded-full bg-green-100 flex items-center justify-center flex-shrink-0" aria-hidden="true">
                  <Check className="w-3 h-3 text-green-600" />
                </div>
                <span className="text-slate-700">Prioritäts-Support</span>
              </li>
              <li className="flex items-center gap-3 text-sm">
                <div className="w-5 h-5 rounded-full bg-green-100 flex items-center justify-center flex-shrink-0" aria-hidden="true">
                  <Check className="w-3 h-3 text-green-600" />
                </div>
                <span className="text-slate-700">Längere Dateien (bis 2 Stunden)</span>
              </li>
            </ul>

            <Link href="/preise" onClick={onClose} className="block focus:outline-none focus-visible:ring-2 focus-visible:ring-violet-500 rounded-xl">
              <button className="w-full py-3 bg-gradient-to-r from-amber-500 to-yellow-500 text-white font-semibold rounded-xl hover:from-amber-600 hover:to-yellow-600 transition-all shadow-lg shadow-amber-500/25 focus:outline-none">
                Jetzt upgraden
              </button>
            </Link>
          </div>

          {/* Alternative */}
          <div className="text-center">
            <p className="text-sm text-slate-600 mb-3">
              Oder warten Sie bis nächsten Monat für 5 neue kostenlose {typeLabel}.
            </p>
            <button
              onClick={onClose}
              className="text-sm text-slate-600 hover:text-slate-900 transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-violet-500 rounded-lg px-2 py-1"
            >
              Später erinnern
            </button>
          </div>
        </div>

        {/* Footer */}
        <div className="px-8 py-4 bg-slate-50 border-t border-slate-100">
          <div className="flex items-center justify-center gap-2 text-sm text-slate-600">
            <Sparkles className="w-4 h-4" aria-hidden="true" />
            <span>Jederzeit kündbar • Keine versteckten Kosten</span>
          </div>
        </div>
      </div>
    </div>
  );
}
