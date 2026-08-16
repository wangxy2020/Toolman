/** DOM `BufferSource` rejects `Uint8Array<ArrayBufferLike>` under TS 5.7+ / DOM lib. */
export function toBufferSource(bytes: Uint8Array): ArrayBuffer {
  return bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer
}
