export const MAX_FRAME = 2 << 20
const MAX_REPLY = 2 << 20

export function validateProxyReply(message) {
  if (!Number.isSafeInteger(message?.seq) || message.seq < 1) return null
  if (typeof message.output !== "string" || Buffer.byteLength(message.output) > MAX_REPLY) return null
  if (typeof message.failed !== "boolean") return null
  return {type: "loop-proxy-reply", seq: message.seq, output: message.output, failed: message.failed}
}

export function lineReader(onLine, onError, maxBytes = MAX_FRAME) {
  let pending = []
  let pendingBytes = 0
  let discarding = false
  return chunk => {
    try {
      let offset = 0
      while (offset < chunk.length) {
        const newline = chunk.indexOf(0x0a, offset)
        const end = newline < 0 ? chunk.length : newline
        if (discarding) {
          if (newline < 0) return
          discarding = false
          offset = newline + 1
          continue
        }

        const segment = chunk.subarray(offset, end)
        if (pendingBytes + segment.length > maxBytes) {
          pending = []
          pendingBytes = 0
          discarding = newline < 0
          onError(new Error("Loop Proxy frame exceeds its size limit"))
          if (newline < 0) return
          offset = newline + 1
          continue
        }
        if (segment.length) {
          pending.push(segment)
          pendingBytes += segment.length
        }
        if (newline < 0) return

        const line = pending.length === 1 ? pending[0] : Buffer.concat(pending, pendingBytes)
        pending = []
        pendingBytes = 0
        offset = newline + 1
        onLine(line.toString("utf8"))
      }
    } catch (error) {
      onError(error)
    }
  }
}
