var __defProp = Object.defineProperty;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __hasOwnProp = Object.prototype.hasOwnProperty;
function __accessProp(key) {
  return this[key];
}
var __toCommonJS = (from) => {
  var entry = (__moduleCache ??= new WeakMap).get(from), desc;
  if (entry)
    return entry;
  entry = __defProp({}, "__esModule", { value: true });
  if (from && typeof from === "object" || typeof from === "function") {
    for (var key of __getOwnPropNames(from))
      if (!__hasOwnProp.call(entry, key))
        __defProp(entry, key, {
          get: __accessProp.bind(from, key),
          enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable
        });
  }
  __moduleCache.set(from, entry);
  return entry;
};
var __moduleCache;
var __returnValue = (v) => v;
function __exportSetter(name, newValue) {
  this[name] = __returnValue.bind(null, newValue);
}
var __export = (target, all) => {
  for (var name in all)
    __defProp(target, name, {
      get: all[name],
      enumerable: true,
      configurable: true,
      set: __exportSetter.bind(all, name)
    });
};

// gui.ts
var exports_gui = {};
__export(exports_gui, {
  default: () => gui_default
});
module.exports = __toCommonJS(exports_gui);
var import_gui = require("@opencode/plugin/gui");
var import_solid_js = require("solid-js");

// cache.ts
function latestUsage(messages, boundary) {
  const boundaryIndex = boundary ? messages.findIndex((message) => message.id === boundary) : -1;
  if (boundary && boundaryIndex === -1)
    return;
  const end = boundaryIndex === -1 ? messages.length : boundaryIndex;
  const compactionIndex = messages.findLastIndex((message, index) => message.type === "compaction" && message.status === "completed" && index < end);
  return messages.findLast((message, index) => message.type === "assistant" && message.tokens !== undefined && index > compactionIndex && index < end);
}
function duration(ms) {
  const totalMinutes = Math.max(0, Math.round(ms / 60000));
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  return hours > 0 ? `${hours}h ${String(minutes).padStart(2, "0")}m` : `${minutes}m`;
}
function cacheSegment(messages, boundary, ttlMs, now) {
  const last = latestUsage(messages, boundary);
  if (!last)
    return;
  const read = last.tokens.cache.read;
  const write = last.tokens.cache.write;
  const prompt = read + write + last.tokens.input;
  if (prompt <= 0)
    return;
  if (read === 0 && write === 0)
    return { hit: "--", rest: "", remaining: undefined };
  const hit = `${Math.round(read / prompt * 100)}%`;
  const expires = (last.time.completed ?? last.time.created) + ttlMs;
  const remaining = expires - now;
  if (remaining <= 0)
    return { hit, rest: " cold", remaining };
  return { hit, rest: ` ${duration(remaining)}`, remaining };
}

// gui.ts
var gui_default = import_gui.Plugin.define({
  setup(ctx) {
    const ttlMs = (typeof ctx.options.cacheTtlMinutes === "number" ? ctx.options.cacheTtlMinutes : 5) * 60000;
    ctx.add(import_gui.Slot, {
      at: "session.header",
      order: -20,
      render(props) {
        const label = document.createElement("span");
        label.className = "text-12-regular text-text-weak whitespace-nowrap";
        const [now, setNow] = import_solid_js.createSignal(Date.now());
        const [usageVersion, setUsageVersion] = import_solid_js.createSignal(0);
        let version = 0;
        import_solid_js.createEffect(() => {
          const session = props.session;
          if (!props.active || !session.server.connected)
            return;
          const sessionID = session.id;
          let active = true;
          const refreshUsage = (event) => {
            if (event.data.sessionID !== sessionID)
              return;
            queueMicrotask(() => {
              if (!active)
                return;
              setNow(Date.now());
              setUsageVersion(++version);
            });
          };
          const data = session.server.data;
          const stopEnded = data.on("session.step.ended", refreshUsage);
          const stopFailed = data.on("session.step.failed", refreshUsage);
          setNow(Date.now());
          const timer = setInterval(() => setNow(Date.now()), 15000);
          import_solid_js.onCleanup(() => {
            active = false;
            stopEnded();
            stopFailed();
            clearInterval(timer);
          });
        });
        import_solid_js.createEffect(() => {
          usageVersion();
          const session = props.session;
          if (!props.active || !session.server.connected) {
            label.hidden = true;
            return;
          }
          const data = session.server.data;
          const info = data.session.get(session.id);
          const cache = cacheSegment(data.session.message.list(session.id), info?.revert?.messageID, ttlMs, now());
          label.hidden = !cache;
          if (!cache)
            return;
          label.textContent = `· Cache: ${cache.hit}${cache.rest}`;
          label.title = cache.remaining === undefined ? "No cache activity reported for the latest step." : cache.remaining <= 0 ? "Estimated cache lifetime has expired. Provider TTL is not reported by OpenCode." : "Estimated cache lifetime remaining. Provider TTL is not reported by OpenCode.";
        });
        return label;
      }
    });
  }
});
