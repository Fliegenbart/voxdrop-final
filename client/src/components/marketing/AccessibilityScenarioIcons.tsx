import type { ReactNode, SVGProps } from "react";

type IllustrationProps = SVGProps<SVGSVGElement>;

function IconFrame({ children, className, ...props }: IllustrationProps & { children: ReactNode }) {
  return (
    <svg
      viewBox="0 0 96 96"
      fill="none"
      aria-hidden="true"
      className={className}
      {...props}
    >
      <rect x="6" y="8" width="84" height="80" rx="26" fill="#F5F3FF" />
      <rect x="14" y="16" width="68" height="64" rx="20" fill="#FFFFFF" stroke="#DDD6FE" strokeWidth="2" />
      {children}
    </svg>
  );
}

export function CaptionTranscriptionIcon(props: IllustrationProps) {
  return (
    <IconFrame {...props}>
      <rect x="24" y="24" width="48" height="28" rx="8" fill="#EEF2FF" stroke="#C4B5FD" strokeWidth="2" />
      <circle cx="31" cy="31" r="2.5" fill="#7C3AED" />
      <circle cx="38" cy="31" r="2.5" fill="#C4B5FD" />
      <path d="M44 36L53 41.5L44 47V36Z" fill="#7C3AED" />
      <rect x="26" y="57" width="44" height="13" rx="6.5" fill="#F8FAFC" stroke="#E2E8F0" strokeWidth="2" />
      <rect x="31" y="61" width="10" height="4" rx="2" fill="#7C3AED" />
      <rect x="44" y="61" width="8" height="4" rx="2" fill="#A78BFA" />
      <rect x="55" y="61" width="10" height="4" rx="2" fill="#7C3AED" opacity="0.85" />
      <path d="M22 69C26 65.5 28.5 63.5 31.5 63.5" stroke="#6366F1" strokeWidth="2.5" strokeLinecap="round" />
      <path d="M74 69C70 65.5 67.5 63.5 64.5 63.5" stroke="#6366F1" strokeWidth="2.5" strokeLinecap="round" />
    </IconFrame>
  );
}

export function ScreenReaderAltTextIcon(props: IllustrationProps) {
  return (
    <IconFrame {...props}>
      <path d="M28 24H56L67 35V70C67 72.7614 64.7614 75 62 75H28C25.2386 75 23 72.7614 23 70V29C23 26.2386 25.2386 24 28 24Z" fill="#FFFFFF" stroke="#C4B5FD" strokeWidth="2" />
      <path d="M56 24V31C56 33.2091 57.7909 35 60 35H67" fill="#EEF2FF" />
      <path d="M56 24V31C56 33.2091 57.7909 35 60 35H67" stroke="#C4B5FD" strokeWidth="2" />
      <rect x="30" y="39" width="19" height="14" rx="4" fill="#E0E7FF" />
      <circle cx="36" cy="44" r="2.5" fill="#6366F1" />
      <path d="M32 51L38 46L43 50L49 44V53H30V51Z" fill="#7C3AED" opacity="0.8" />
      <rect x="30" y="58" width="30" height="4" rx="2" fill="#C4B5FD" />
      <rect x="30" y="65" width="24" height="4" rx="2" fill="#DDD6FE" />
      <path d="M73 39C73 44.5228 68.5228 49 63 49C57.4772 49 53 44.5228 53 39C53 33.4772 57.4772 29 63 29C68.5228 29 73 33.4772 73 39Z" fill="#312E81" />
      <path d="M58 39C59.7 36.5 61.4 35.2 63 35.2C64.6 35.2 66.3 36.5 68 39C66.3 41.5 64.6 42.8 63 42.8C61.4 42.8 59.7 41.5 58 39Z" fill="#FFFFFF" />
      <circle cx="63" cy="39" r="2.2" fill="#312E81" />
      <path d="M71.5 55C74.5 52.8 76 50 76 46.5" stroke="#7C3AED" strokeWidth="2.5" strokeLinecap="round" />
      <path d="M68 52C70 50.3 71 48.4 71 46.4" stroke="#A78BFA" strokeWidth="2.5" strokeLinecap="round" />
    </IconFrame>
  );
}

export function KeyboardFocusIcon(props: IllustrationProps) {
  return (
    <IconFrame {...props}>
      <rect x="23" y="24" width="50" height="18" rx="6" fill="#FFFFFF" stroke="#7C3AED" strokeWidth="2.5" />
      <rect x="28" y="29" width="22" height="4" rx="2" fill="#A78BFA" />
      <rect x="28" y="35" width="16" height="3" rx="1.5" fill="#DDD6FE" />
      <rect x="58" y="28.5" width="10" height="9" rx="2.5" fill="#EEF2FF" stroke="#C4B5FD" strokeWidth="1.8" />
      <rect x="20" y="51" width="56" height="20" rx="7" fill="#F8FAFC" stroke="#CBD5E1" strokeWidth="2" />
      <rect x="25" y="56" width="12" height="5" rx="2.5" fill="#E2E8F0" />
      <rect x="40" y="56" width="12" height="5" rx="2.5" fill="#7C3AED" />
      <rect x="55" y="56" width="16" height="5" rx="2.5" fill="#E2E8F0" />
      <rect x="25" y="64" width="28" height="3.5" rx="1.75" fill="#CBD5E1" />
      <rect x="56" y="64" width="15" height="3.5" rx="1.75" fill="#CBD5E1" />
      <path d="M43 75L38 80" stroke="#6366F1" strokeWidth="2.5" strokeLinecap="round" />
      <path d="M53 75L58 80" stroke="#6366F1" strokeWidth="2.5" strokeLinecap="round" />
    </IconFrame>
  );
}

export function PlainLanguageStructureIcon(props: IllustrationProps) {
  return (
    <IconFrame {...props}>
      <rect x="22" y="24" width="18" height="48" rx="8" fill="#EEF2FF" />
      <rect x="27" y="31" width="8" height="3.5" rx="1.75" fill="#A78BFA" />
      <rect x="27" y="39" width="8" height="3.5" rx="1.75" fill="#C4B5FD" />
      <rect x="27" y="47" width="8" height="3.5" rx="1.75" fill="#DDD6FE" />
      <path d="M45 39H58" stroke="#C4B5FD" strokeWidth="3" strokeLinecap="round" />
      <path d="M45 48H62" stroke="#C4B5FD" strokeWidth="3" strokeLinecap="round" />
      <path d="M45 57H55" stroke="#C4B5FD" strokeWidth="3" strokeLinecap="round" />
      <path d="M58 31L70 31" stroke="#7C3AED" strokeWidth="3.5" strokeLinecap="round" />
      <path d="M58 40L66 40" stroke="#7C3AED" strokeWidth="3.5" strokeLinecap="round" />
      <path d="M58 49L72 49" stroke="#7C3AED" strokeWidth="3.5" strokeLinecap="round" />
      <path d="M58 58L68 58" stroke="#7C3AED" strokeWidth="3.5" strokeLinecap="round" />
      <circle cx="70" cy="69" r="9" fill="#312E81" />
      <path d="M65.5 69L68.5 72L74.5 66" stroke="#FFFFFF" strokeWidth="2.8" strokeLinecap="round" strokeLinejoin="round" />
    </IconFrame>
  );
}
