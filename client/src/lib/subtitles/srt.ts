export interface SrtSegment {
  index: number;
  startTime: string;
  endTime: string;
  startSeconds: number;
  endSeconds: number;
  text: string;
}

export function srtTimeToSeconds(time: string): number {
  const [hours, minutes, rest] = time.split(":");
  const [seconds, ms] = rest.split(",");
  return (
    Number.parseInt(hours, 10) * 3600 +
    Number.parseInt(minutes, 10) * 60 +
    Number.parseInt(seconds, 10) +
    Number.parseInt(ms, 10) / 1000
  );
}

export function secondsToSrtTime(seconds: number): string {
  const hrs = Math.floor(seconds / 3600);
  const mins = Math.floor((seconds % 3600) / 60);
  const secs = Math.floor(seconds % 60);
  const ms = Math.floor((seconds % 1) * 1000);
  return `${hrs.toString().padStart(2, "0")}:${mins.toString().padStart(2, "0")}:${secs.toString().padStart(2, "0")},${ms.toString().padStart(3, "0")}`;
}

export function parseSrt(srtContent: string): SrtSegment[] {
  const segments: SrtSegment[] = [];
  const blocks = srtContent.trim().split(/\n\n+/);

  for (const block of blocks) {
    const lines = block.split("\n");
    if (lines.length < 3) continue;

    const index = Number.parseInt(lines[0], 10);
    const timeLine = lines[1];
    const timeMatch = timeLine.match(
      /(\d{2}:\d{2}:\d{2},\d{3})\s*-->\s*(\d{2}:\d{2}:\d{2},\d{3})/
    );

    if (!timeMatch) continue;
    const startTime = timeMatch[1];
    const endTime = timeMatch[2];
    const text = lines.slice(2).join("\n");

    segments.push({
      index: Number.isFinite(index) ? index : segments.length + 1,
      startTime,
      endTime,
      startSeconds: srtTimeToSeconds(startTime),
      endSeconds: srtTimeToSeconds(endTime),
      text,
    });
  }

  return segments;
}

export function segmentsToSrt(segments: SrtSegment[]): string {
  return (
    segments
      .map((seg, i) => `${i + 1}\n${seg.startTime} --> ${seg.endTime}\n${seg.text}`)
      .join("\n\n") + "\n"
  );
}

export function formatMarkerTime(seconds: number): string {
  return secondsToSrtTime(seconds).replace(",", ".");
}

