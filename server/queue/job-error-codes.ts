export type JobErrorCode =
  | 'gpu_slot_timeout'
  | 'input_missing'
  | 'llm_context_overflow'
  | 'provider_timeout'
  | 'ffmpeg_oom'
  | 'file_too_large'
  | 'provider_5xx'
  | 'network_error'
  | 'unsupported_input'
  | 'validation_error'
  | 'unknown';

const RETRYABLE_CODES = new Set<JobErrorCode>([
  'gpu_slot_timeout',
  'provider_timeout',
  'provider_5xx',
  'network_error',
  'ffmpeg_oom',
]);

export function isRetryableErrorCode(code: JobErrorCode): boolean {
  return RETRYABLE_CODES.has(code);
}

export function inferJobErrorCode(raw: unknown): JobErrorCode {
  const message = String(raw || '').toLowerCase();
  if (!message) return 'unknown';

  if (message.includes('gpu_slot_timeout')) return 'gpu_slot_timeout';
  if (
    message.includes('enoent') ||
    message.includes('input_missing') ||
    message.includes('input_empty') ||
    message.includes('upload-datei nicht gefunden')
  ) {
    return 'input_missing';
  }
  if (message.includes('input_checksum_mismatch')) return 'validation_error';
  if (message.includes('context length') || message.includes('max_tokens') || message.includes('context') && message.includes('overflow')) {
    return 'llm_context_overflow';
  }
  if (message.includes('timed out') || message.includes('timeout') || message.includes('provider_timeout')) {
    return 'provider_timeout';
  }
  if (message.includes('cuda_error_out_of_memory') || message.includes('out of memory') || message.includes('oom')) {
    return 'ffmpeg_oom';
  }
  if (message.includes('file too large') || message.includes('datei ist zu groß') || message.includes('datei ist zu gross') || message.includes('file_too_large')) {
    return 'file_too_large';
  }
  if (
    (message.includes('status') && message.includes('5')) ||
    message.includes('provider_5xx') ||
    message.includes('http 5')
  ) {
    return 'provider_5xx';
  }
  if (message.includes('econnrefused') || message.includes('socket hang up') || message.includes('fetch failed') || message.includes('network')) {
    return 'network_error';
  }
  if (message.includes('invalid') || message.includes('unsupported')) {
    return message.includes('unsupported') ? 'unsupported_input' : 'validation_error';
  }

  return 'unknown';
}

export function sanitizeErrorMessage(error: unknown, fallback = 'Job failed'): string {
  const raw = String((error as any)?.message || error || '').trim();
  if (!raw) return fallback;
  return raw.length > 4000 ? raw.slice(0, 4000) : raw;
}
