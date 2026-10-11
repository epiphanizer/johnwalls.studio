declare global {
  interface Window {
    __JWS_TELEMETRY_BASE_URL__?: string;
    __JWS_SP404_NATIVE_STATE__?: import('../components/SP404AudioEngine').NativeSP404State;
    __JWS_RECEIVE_SP404_NATIVE_STATE__?: (state: unknown) => void;
    __JUCE_INVOKE_NATIVE__?: (fnName: string, payload: any) => boolean;
  }
}

export function getTelemetryBaseUrl(): string {
  if (typeof window !== 'undefined' && window.__JWS_TELEMETRY_BASE_URL__) {
    return window.__JWS_TELEMETRY_BASE_URL__.replace(/\/$/, '');
  }
  return 'http://127.0.0.1:3012';
}

export function getTelemetryUrl(path: string): string {
  return `${getTelemetryBaseUrl()}${path.startsWith('/') ? path : `/${path}`}`;
}

export function hasJuceNativeHost(): boolean {
  if (typeof window === 'undefined') return false;
  return typeof window.__JUCE_INVOKE_NATIVE__ === 'function'
    || Boolean((window as any).__JUCE__?.backend?.emitEvent);
}
