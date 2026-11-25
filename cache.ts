import type { Plugin } from "@opencode/plugin/tui"

type Message = ReturnType<Plugin.Context["data"]["session"]["message"]["list"]>[number]
type Assistant = Extract<Message, { type: "assistant" }>
type AssistantUsage = Assistant & { tokens: NonNullable<Assistant["tokens"]> }

function latestUsage(messages: ReadonlyArray<Message>, boundary?: string): AssistantUsage | undefined {
  const boundaryIndex = boundary ? messages.findIndex((message) => message.id === boundary) : -1
  if (boundary && boundaryIndex === -1) return undefined
  const end = boundaryIndex === -1 ? messages.length : boundaryIndex
  const compactionIndex = messages.findLastIndex(
    (message, index) => message.type === "compaction" && message.status === "completed" && index < end,
  )
  return messages.findLast(
    (message, index): message is AssistantUsage =>
      message.type === "assistant" && message.tokens !== undefined && index > compactionIndex && index < end,
  )
}

export function duration(ms: number): string {
  const totalMinutes = Math.max(0, Math.round(ms / 60_000))
  const hours = Math.floor(totalMinutes / 60)
  const minutes = totalMinutes % 60
  return hours > 0 ? `${hours}h ${String(minutes).padStart(2, "0")}m` : `${minutes}m`
}

export function cacheSegment(messages: ReadonlyArray<Message>, boundary: string | undefined, ttlMs: number, now: number) {
  const last = latestUsage(messages, boundary)
  if (!last) return
  const read = last.tokens.cache.read
  const write = last.tokens.cache.write
  const prompt = read + write + last.tokens.input
  if (prompt <= 0) return
  if (read === 0 && write === 0) return { hit: "--", rest: "", remaining: undefined }
  const hit = `${Math.round((read / prompt) * 100)}%`
  const expires = (last.time.completed ?? last.time.created) + ttlMs
  const remaining = expires - now
  if (remaining <= 0) return { hit, rest: " cold", remaining }
  return { hit, rest: ` ${duration(remaining)}`, remaining }
}
