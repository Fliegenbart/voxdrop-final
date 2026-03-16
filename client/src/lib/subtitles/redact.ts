export interface RedactionMatch {
  type: "email" | "url" | "phone" | "iban";
  value: string;
}

export interface RedactionResult {
  text: string;
  matches: RedactionMatch[];
  changed: boolean;
}

const EMAIL_RE = /\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/gi;
const URL_RE = /\bhttps?:\/\/[^\s<>"']+\b/gi;
// Conservative: German-ish phone numbers (avoid false positives on timestamps).
const PHONE_RE = /(?:\+?\d{1,3}[\s/-]?)?(?:\(?0\d{2,4}\)?[\s/-]?)\d{2,4}(?:[\s/-]?\d{2,4}){1,3}\b/g;
// IBAN (DE + generic)
const IBAN_RE = /\b[A-Z]{2}\d{2}[A-Z0-9]{10,30}\b/g;

export function redactText(input: string): RedactionResult {
  let text = input;
  const matches: RedactionMatch[] = [];

  const replaceAndCollect = (re: RegExp, type: RedactionMatch["type"], token: string) => {
    text = text.replace(re, (m) => {
      matches.push({ type, value: m });
      return token;
    });
  };

  replaceAndCollect(EMAIL_RE, "email", "[EMAIL]");
  replaceAndCollect(URL_RE, "url", "[URL]");
  replaceAndCollect(IBAN_RE, "iban", "[IBAN]");
  replaceAndCollect(PHONE_RE, "phone", "[TEL]");

  return { text, matches, changed: text !== input };
}

