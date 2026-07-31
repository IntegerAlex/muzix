import * as Sentry from '@sentry/react-native';

export function apiResponseTime(path: string, ms: number) {
  Sentry.metrics.distribution('api_response_time', ms, {
    unit: 'millisecond',
    attributes: { path },
  });
}

export function apiError(path: string, status: number) {
  Sentry.metrics.count('api_error', 1, {
    unit: 'request',
    attributes: { path, status: String(status) },
  });
}

export function queueDepth(depth: number) {
  Sentry.metrics.gauge('queue_depth', depth);
}

export function trackPlay() {
  Sentry.metrics.count('track_play', 1);
}

export function searchDuration(ms: number) {
  Sentry.metrics.distribution('search_duration', ms, { unit: 'millisecond' });
}

export function flushTime(ms: number) {
  Sentry.metrics.distribution('play_flush_ms', ms, { unit: 'millisecond' });
}
