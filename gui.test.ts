import { expect, test } from "bun:test"
import { readFileSync } from "node:fs"
import { runInNewContext } from "node:vm"

function host(options: Record<string, unknown> = {}) {
  let current: any
  const effects: any[] = []
  function createSignal(initial: any) {
    let value = initial
    const listeners = new Set<any>()
    return [() => { if (current) listeners.add(current); return value }, (next: any) => {
      if (Object.is(next, value)) return
      value = next
      for (const effect of [...listeners]) effect.run()
    }]
  }
  function createEffect(fn: () => void) {
    const effect = { cleanups: [] as (() => void)[], run() {
      for (const cleanup of effect.cleanups.splice(0)) cleanup()
      const previous = current
      current = effect
      try { fn() } finally { current = previous }
    } }
    effects.push(effect)
    effect.run()
  }
  const timers = new Set<() => void>()
  let now = 1_000
  class Clock extends Date { static now() { return now } }
  const [active, setActive] = createSignal(true)
  const [connected, setConnected] = createSignal(true)
  const [messages, setMessages] = createSignal<any[]>([])
  const [boundary, setBoundary] = createSignal<string | undefined>()
  const listeners = new Map<string, Set<(event: any) => void>>()
  const data = {
    on(type: string, listener: (event: any) => void) {
      const handlers = listeners.get(type) ?? new Set()
      listeners.set(type, handlers)
      handlers.add(listener)
      return () => handlers.delete(listener)
    },
    session: { get: () => ({ revert: boundary() ? { messageID: boundary() } : undefined }), message: { list: () => messages() } },
  }
  const server = { get connected() { return connected() }, data }
  const [session, setSession] = createSignal({ id: "a", server })
  const props = { get session() { return session() }, get active() { return active() } }
  let contribution: any
  const module = { exports: {} as any }
  runInNewContext(readFileSync(import.meta.dir + "/gui-experimental.cjs", "utf8"), {
    module, document: { createElement: () => ({}) }, Date: Clock, queueMicrotask,
    setInterval: (fn: () => void) => { timers.add(fn); return fn },
    clearInterval: (fn: () => void) => timers.delete(fn),
    require: (name: string) => name === "solid-js"
      ? { createEffect, createSignal, onCleanup: (fn: () => void) => current.cleanups.push(fn) }
      : { Plugin: { define: (value: any) => value }, Slot: {} },
  })
  module.exports.default.setup({ options, add: (_: any, item: any) => { contribution = item } })
  const label = contribution.render(props)
  return {
    contribution, label, timers, listeners, setActive, setConnected, setMessages, setBoundary, setSession, server,
    emit(type: string, sessionID: string) { for (const listener of listeners.get(type) ?? []) listener({ data: { sessionID } }) },
    setTime(time: number) { now = time },
    tick(time: number) { now = time; for (const timer of [...timers]) timer() },
    dispose() { for (const effect of effects) for (const cleanup of effect.cleanups.splice(0)) cleanup() },
  }
}

const assistant = (id: string, read: number, input = 10, write = 0) => ({
  id, type: "assistant", tokens: { input, cache: { read, write } }, time: { created: 1_000, completed: 1_000 },
})

test("Desktop uses the configured cache lifetime instead of the five-minute default", () => {
  const h = host({ cacheTtlMinutes: 15 })
  h.setMessages([assistant("a", 90)])
  expect(h.label.textContent).toBe("· Cache: 90% 15m")
  h.tick(301_001)
  expect(h.label.textContent).toBe("· Cache: 90% 10m")
  h.tick(901_001)
  expect(h.label.textContent).toBe("· Cache: 90% cold")
  h.dispose()
})

test("Desktop cache indicator updates, handles boundaries and expires", () => {
  const h = host()
  expect(h.contribution.at).toBe("session.header")
  expect(h.contribution.order).toBe(-20)
  expect(h.label.hidden).toBe(true)
  expect(h.timers.size).toBe(1)
  h.setMessages([assistant("a", 90)])
  expect(h.label.hidden).toBe(false)
  expect(h.label.textContent).toBe("· Cache: 90% 5m")
  expect(h.label.title).toContain("Estimated")
  h.tick(301_001)
  expect(h.label.textContent).toBe("· Cache: 90% cold")
  h.setMessages([assistant("a", 90), { id: "c", type: "compaction", status: "completed" }])
  expect(h.label.hidden).toBe(true)
  h.setMessages([assistant("a", 90), assistant("b", 0, 10)])
  expect(h.label.textContent).toBe("· Cache: --")
  h.setBoundary("b")
  expect(h.label.textContent).toBe("· Cache: 90% cold")
  h.setBoundary("missing")
  expect(h.label.hidden).toBe(true)
  h.dispose()
  expect(h.timers.size).toBe(0)
})

test("Desktop widget hides for inactive or disconnected sessions and resumes", () => {
  const h = host()
  h.setMessages([assistant("a", 90)])
  h.setActive(false)
  expect(h.label.hidden).toBe(true)
  expect(h.timers.size).toBe(0)
  h.setActive(true)
  expect(h.label.hidden).toBe(false)
  h.setConnected(false)
  expect(h.label.hidden).toBe(true)
  expect(h.timers.size).toBe(0)
  h.setConnected(true)
  expect(h.label.textContent).toBe("· Cache: 90% 5m")
  h.setSession({ id: "b", server: { connected: true, data: { on: h.server.data.on, session: { get: () => ({}), message: { list: () => [assistant("b", 0, 10, 10)] } } } } })
  expect(h.label.textContent).toBe("· Cache: 0% 5m")
  h.dispose()
  expect(h.timers.size).toBe(0)
})

test("Desktop refreshes completed model steps immediately, without a timer tick", async () => {
  const h = host()
  const messages = [assistant("a", 90)]
  h.setMessages(messages)
  h.tick(61_000)
  expect(h.label.textContent).toBe("· Cache: 90% 4m")
  // Mimic an in-place host update: no signal setter or timer tick notifies the widget.
  h.setTime(62_000)
  h.emit("session.step.ended", "a")
  messages.push({ ...assistant("tool-step", 90), time: { created: 61_000, completed: 62_000 }, finish: "tool-calls" } as any)
  await Promise.resolve()
  expect(h.label.textContent).toBe("· Cache: 90% 5m")
  h.tick(362_001)
  expect(h.label.textContent).toBe("· Cache: 90% cold")
  h.setTime(363_000)
  h.emit("session.step.ended", "a")
  messages.push({ ...assistant("reply", 80, 20), time: { created: 362_001, completed: 363_000 }, finish: "stop" } as any)
  await Promise.resolve()
  expect(h.label.textContent).toBe("· Cache: 80% 5m")
  h.dispose()
  expect([...h.listeners.values()].every((handlers) => handlers.size === 0)).toBe(true)
})

test("Desktop step refresh ignores other sessions and queued callbacks after cleanup", async () => {
  const h = host()
  const messages = [assistant("a", 90)]
  h.setMessages(messages)
  messages.push({ ...assistant("b", 50, 50), time: { created: 1_000, completed: 1_000 } })
  h.emit("session.step.ended", "other")
  await Promise.resolve()
  expect(h.label.textContent).toBe("· Cache: 90% 5m")
  h.emit("session.step.ended", "a")
  h.setActive(false)
  await Promise.resolve()
  expect(h.label.hidden).toBe(true)
  expect(h.label.textContent).toBe("· Cache: 90% 5m")
  expect([...h.listeners.values()].every((handlers) => handlers.size === 0)).toBe(true)
  h.dispose()
})

test("Desktop refreshes reported usage on failed steps but does not manufacture warmth", async () => {
  const h = host()
  const messages = [assistant("a", 90)]
  h.setMessages(messages)
  h.tick(301_001)
  expect(h.label.textContent).toBe("· Cache: 90% cold")
  h.emit("session.step.failed", "a")
  await Promise.resolve()
  expect(h.label.textContent).toBe("· Cache: 90% cold")
  messages.push({ ...assistant("failed-with-usage", 80, 20), time: { created: 301_001, completed: 301_001 } })
  h.emit("session.step.failed", "a")
  await Promise.resolve()
  expect(h.label.textContent).toBe("· Cache: 80% 5m")
  h.dispose()
})
