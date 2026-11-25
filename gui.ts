import { Plugin, Slot } from "@opencode/plugin/gui"
import { createEffect, createSignal, onCleanup } from "solid-js"
import { cacheSegment } from "./cache"

export default Plugin.define({
  setup(ctx) {
    const ttlMs = (typeof ctx.options.cacheTtlMinutes === "number" ? ctx.options.cacheTtlMinutes : 5) * 60_000
    ctx.add(Slot, {
      at: "session.header",
      order: -20,
      render(props) {
        const label = document.createElement("span")
        label.className = "text-12-regular text-text-weak whitespace-nowrap"
        const [now, setNow] = createSignal(Date.now())
        const [usageVersion, setUsageVersion] = createSignal(0)
        let version = 0

        createEffect(() => {
          const session = props.session
          if (!props.active || !session.server.connected) return
          const sessionID = session.id
          let active = true
          const refreshUsage = (event: { data: { sessionID: string } }) => {
            if (event.data.sessionID !== sessionID) return
            // Event listeners can run before the host finishes publishing its store update.
            queueMicrotask(() => {
              if (!active) return
              setNow(Date.now())
              setUsageVersion(++version)
            })
          }
          const data = session.server.data
          const stopEnded = data.on("session.step.ended", refreshUsage)
          const stopFailed = data.on("session.step.failed", refreshUsage)
          setNow(Date.now())
          const timer = setInterval(() => setNow(Date.now()), 15_000)
          onCleanup(() => {
            active = false
            stopEnded()
            stopFailed()
            clearInterval(timer)
          })
        })

        createEffect(() => {
          usageVersion()
          const session = props.session
          if (!props.active || !session.server.connected) {
            label.hidden = true
            return
          }
          const data = session.server.data
          const info = data.session.get(session.id)
          const cache = cacheSegment(data.session.message.list(session.id), info?.revert?.messageID, ttlMs, now())
          label.hidden = !cache
          if (!cache) return
          label.textContent = `· Cache: ${cache.hit}${cache.rest}`
          label.title = cache.remaining === undefined
            ? "No cache activity reported for the latest step."
            : cache.remaining <= 0
              ? "Estimated cache lifetime has expired. Provider TTL is not reported by OpenCode."
              : "Estimated cache lifetime remaining. Provider TTL is not reported by OpenCode."
        })
        return label
      },
    })
  },
})
