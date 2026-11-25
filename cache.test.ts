import { expect, test } from "bun:test"
import { cacheSegment, duration } from "./cache"

type Messages = Parameters<typeof cacheSegment>[0]
function assistant(id: string, input: number, read: number, write: number, completed = 1_000): Messages[number] {
  return { id, type: "assistant", tokens: { input, cache: { read, write } }, time: { created: completed, completed } } as Messages[number]
}
const compaction = (id: string): Messages[number] => ({ id, type: "compaction", status: "completed" }) as Messages[number]

test("reports the latest step's cache share and estimated warmth", () => {
  const messages = [assistant("old", 100, 0, 0), assistant("new", 10, 90, 0)]
  expect(cacheSegment(messages, undefined, 300_000, 61_000)).toEqual({ hit: "90%", rest: " warm 4m", remaining: 240_000 })
  expect(cacheSegment(messages, undefined, 300_000, 301_001)).toEqual({ hit: "90%", rest: " cold", remaining: -1 })
})

test("handles no cache activity and empty prompt usage", () => {
  expect(cacheSegment([assistant("a", 20, 0, 0)], undefined, 300_000, 0)).toEqual({ hit: "--", rest: "", remaining: undefined })
  expect(cacheSegment([assistant("a", 0, 0, 0)], undefined, 300_000, 0)).toBeUndefined()
  expect(cacheSegment([], undefined, 300_000, 0)).toBeUndefined()
})

test("respects revert and completed compaction boundaries", () => {
  const messages = [assistant("a", 10, 90, 0), compaction("c"), assistant("b", 50, 0, 50), assistant("reverted", 1, 99, 0)]
  expect(cacheSegment(messages, "reverted", 300_000, 1_000)?.hit).toBe("0%")
  expect(cacheSegment(messages, "b", 300_000, 1_000)).toBeUndefined()
  expect(cacheSegment(messages, "missing", 300_000, 1_000)).toBeUndefined()
})

test("formats durations", () => {
  expect(duration(3_900_000)).toBe("1h 05m")
  expect(duration(-1)).toBe("0m")
})
