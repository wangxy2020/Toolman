const ALPHABET = '123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz'

export function base58Encode(input: Uint8Array): string {
  if (input.length === 0) return ''

  let zeros = 0
  while (zeros < input.length && input[zeros] === 0) zeros += 1

  const size = (((input.length - zeros) * 138) / 100 + 1) | 0
  const encoded = new Uint8Array(size)
  let length = 0

  for (let i = zeros; i < input.length; i += 1) {
    let carry = input[i] ?? 0
    let j = 0
    for (let k = size - 1; k >= 0 && (carry !== 0 || j < length); k -= 1, j += 1) {
      carry += 256 * (encoded[k] ?? 0)
      encoded[k] = carry % 58
      carry = (carry / 58) | 0
    }
    length = j
  }

  let it = size - length
  while (it < size && encoded[it] === 0) it += 1

  let result = '1'.repeat(zeros)
  while (it < size) {
    result += ALPHABET[encoded[it] ?? 0]
    it += 1
  }
  return result
}
