/**
 * Electron 39 (Chromium 142 in this tree) still lacks Map/WeakMap upsert helpers
 * that pdf.js 6 calls unconditionally. Install before any pdf.js import path
 * that might hit the modern build (or a worker without legacy polyfills).
 */
function installMapUpsert(proto: Map<unknown, unknown> | WeakMap<object, unknown>): void {
  const mapProto = proto as {
    get: (key: never) => unknown
    set: (key: never, value: unknown) => unknown
    has: (key: never) => boolean
    getOrInsert?: (key: never, defaultValue: unknown) => unknown
    getOrInsertComputed?: (key: never, callbackfn: (key: never) => unknown) => unknown
  }
  if (typeof mapProto.getOrInsert !== 'function') {
    mapProto.getOrInsert = function getOrInsert(key, defaultValue) {
      if (this.has(key)) return this.get(key)
      this.set(key, defaultValue)
      return defaultValue
    }
  }
  if (typeof mapProto.getOrInsertComputed !== 'function') {
    mapProto.getOrInsertComputed = function getOrInsertComputed(key, callbackfn) {
      if (this.has(key)) return this.get(key)
      const value = callbackfn(key)
      this.set(key, value)
      return value
    }
  }
}

installMapUpsert(Map.prototype as unknown as Map<unknown, unknown>)
installMapUpsert(WeakMap.prototype as unknown as WeakMap<object, unknown>)
