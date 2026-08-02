export type ToastType = 'error' | 'success' | 'info';

type ToastFn = (message: string, type: ToastType) => void;

let _toast: ToastFn | null = null;

export function registerToast(fn: ToastFn): () => void {
  _toast = fn;
  return () => { _toast = null; };
}

export function showToast(message: string, type: ToastType = 'error'): void {
  _toast?.(message, type);
}
