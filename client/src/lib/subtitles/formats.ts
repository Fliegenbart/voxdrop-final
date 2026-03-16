import { secondsToSrtTime, type SrtSegment } from "./srt";

function secondsToVttTime(seconds: number): string {
  return secondsToSrtTime(seconds).replace(",", ".");
}

function escapeXml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/\"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

export function segmentsToVtt(segments: SrtSegment[]): string {
  const cues = segments.map((seg) => {
    const start = secondsToVttTime(seg.startSeconds);
    const end = secondsToVttTime(seg.endSeconds);
    return `${start} --> ${end}\n${seg.text}`;
  });
  return `WEBVTT\n\n${cues.join("\n\n")}\n`;
}

export function segmentsToTtml(segments: SrtSegment[]): string {
  const cues = segments.map((seg) => {
    const start = secondsToVttTime(seg.startSeconds);
    const end = secondsToVttTime(seg.endSeconds);
    const text = escapeXml(seg.text).replace(/\n/g, "<br/>");
    return `    <p begin="${start}" end="${end}">${text}</p>`;
  });

  return `<?xml version="1.0" encoding="UTF-8"?>\n<tt xmlns="http://www.w3.org/ns/ttml" xml:lang="de">\n  <body>\n    <div>\n${cues.join("\n")}\n    </div>\n  </body>\n</tt>\n`;
}

