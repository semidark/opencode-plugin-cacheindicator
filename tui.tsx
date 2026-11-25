/** @jsxImportSource @opentui/solid */
import { Plugin } from "@opencode/plugin/tui"
import { createMemo, createSignal, onCleanup, Show } from "solid-js"
import { cacheSegment } from "./cache"

const DEFAULT_CACHE_TTL_MINUTES = 5
const CACHE_WARNING_MS = 60_000

function CacheStatus(props: { context: Plugin.Context; sessionID: string }) {
  const theme = props.context.theme
  const options = props.context.options
  const ttlMs =
    (typeof options.cacheTtlMinutes === "number" ? options.cacheTtlMinutes : DEFAULT_CACHE_TTL_MINUTES) * 60_000
  const [now, setNow] = createSignal(Date.now())
  const timer = setInterval(() => setNow(Date.now()), 15_000)
  onCleanup(() => clearInterval(timer))

  const cache = createMemo(() => {
    const session = props.context.data.session.get(props.sessionID)
    return cacheSegment(props.context.data.session.message.list(props.sessionID), session?.revert?.messageID, ttlMs, now())
  })
  const color = () => {
    const remaining = cache()?.remaining
    if (remaining === undefined) return theme.text.muted
    if (remaining <= 0) return theme.text.feedback.error.base
    return remaining < CACHE_WARNING_MS ? theme.text.feedback.warning.base : theme.text.feedback.success.base
  }

  return (
    <Show when={cache()}>
      {(value) => (
        <text wrapMode="none" truncate flexShrink={1} minWidth={0}>
          <span style={{ fg: theme.text.muted }}>{"· Cache: "}</span>
          <span style={{ fg: theme.text.base }}>{value().hit}</span>
          <span style={{ fg: color() }}>{value().rest}</span>
          <span style={{ fg: theme.text.muted }}>{" ·"}</span>
        </text>
      )}
    </Show>
  )
}

export default Plugin.define({
  id: "statusline",
  setup(context) {
    return context.ui.slot({
      append: "prompt.footer.status",
      render: (input) => (
        <Show when={input.mode === "normal" ? input.sessionID : undefined}>
          {(sessionID) => <CacheStatus context={context} sessionID={sessionID()} />}
        </Show>
      ),
    })
  },
})
