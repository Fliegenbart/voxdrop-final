// Queue module exports
export { redisConnection, redisPubSub, isRedisAvailable } from './connection';
export {
  videoConversionQueue,
  transcriptionQueue,
  chapterSplittingQueue,
  pdfuaQueue,
  ollamaQueue,
  pptxSummaryQueue,
  podcastQueue,
  subtitleEmbedQueue,
  getPriorityForSubscription,
  JobPriority,
  AVG_JOB_DURATION,
  getQueueStats,
  getJobPosition,
  getQueueLane,
} from './queues';
export * from './job-store';
export { sseManager, publishJobEvent } from './sse-manager';
export { startVideoWorker } from './video-worker';
export { startChapterWorker } from './chapter-worker';
export { startTranscriptionWorker } from './transcription-worker';
export { startPDFUAWorker } from './pdfua-worker';
export { startOllamaWorker } from './ollama-worker';
export { startPPTXWorker } from './pptx-worker';
export { startPodcastWorker } from './podcast-worker';
export { startEmbedSubtitlesWorker } from './embed-subtitles-worker';
