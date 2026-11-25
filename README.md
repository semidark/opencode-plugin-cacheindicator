# opencode-plugin-cacheindicator

An [OpenCode](https://opencode.ai) TUI plugin that adds prompt cache status to
the footer, alongside OpenCode's built-in usage and activity indicators.
This is a cache-only fork of [opencode-plugin-statusline](https://github.com/Zorato/opencode-plugin-statusline).

```
Cache: 88% 4m
```

## What it shows

The percentage is the share of prompt tokens reported as cache reads in the
latest step. `4m` is an estimated remaining lifetime, `cold` means the
estimate has expired, and `--` means no cache activity was reported.

The indicator hides itself when there is no assistant step with prompt usage.
Context, cost, activity, and shortcuts remain the built-in footer's responsibility.

The experimental Desktop widget shows the same cache status in the session
header, using that session's server data. It hides when the session is inactive,
disconnected, or has no prompt usage. Desktop compatibility still needs
verification in the actual app; browser-only web clients do not load this entry.

## Install

Add the GitHub repository to `plugins` in `opencode.jsonc`:

```jsonc
// ~/.config/opencode/opencode.jsonc
{
  "$schema": "https://opencode.ai/config.json",
  "plugins": ["github:semidark/opencode-plugin-cacheindicator#main"]
}
```

To load the plugin locally in the terminal, including when connected to a
remote server, list it in `cli.json` instead:

```jsonc
// ~/.config/opencode/cli.json
{
  "$schema": "https://opencode.ai/v2/cli.json",
  "plugins": ["github:semidark/opencode-plugin-cacheindicator#main"]
}
```

From a local checkout, point the entry at the **directory**:

```jsonc
{
  "$schema": "https://opencode.ai/config.json",
  "plugins": ["/absolute/path/to/opencode-plugin-cacheindicator"]
}
```

A `.tsx` entry that renders JSX has to be a package: a single file path fails
with `configured plugin path must be a directory`.

## Options

Pass options in the object form of `opencode.jsonc`:

```jsonc
// ~/.config/opencode/opencode.jsonc
{
  "plugins": [
    {
      "package": "github:semidark/opencode-plugin-cacheindicator#main",
      "options": {
        "cacheTtlMinutes": 5
      }
    }
  ]
}
```

| Option | Default | Meaning |
| --- | --- | --- |
| `cacheTtlMinutes` | `5` | How long a prompt cache entry lives after the last step. Raise it for providers with a longer cache lifetime. |

## How it works

- The cache segment reads the latest assistant step with token usage after the
  last completed compaction and before the revert boundary.
- The cache share is `cache.read / (cache.read + cache.write + input)` of that
  step. The warm window starts at the completion time of the step and lasts
  `cacheTtlMinutes`.
- The line refreshes every 15 seconds. Desktop also re-reads usage immediately
  after a model step completes or fails, including steps that request tools.
  Tool execution and new user messages alone do not reset the cache estimate.
  The plugin reads no credentials, sends no requests, and stores nothing.

## Limitations

- OpenCode does not report the provider cache TTL. The warm timer is an
  estimate from the last step and `cacheTtlMinutes`; a provider that keeps the
  cache longer than the configured TTL shows `cold` early. OpenCode sends no
  explicit TTL for Anthropic, whose default is 5 minutes.
- Provider usage allowance (rolling 5-hour and weekly windows) is not part of
  this line. OpenCode does not expose the allowance to plugins yet.

## Troubleshooting

| Symptom | Cause |
| --- | --- |
| Nothing rendered | The session has no completed assistant step yet, or the terminal is too narrow to show the line. |
| Plugin does not load | Check `/plugins` in the TUI. The configured path must be a directory containing `package.json`. |
| `Cache: --` | The model reported no cache read or cache write on the latest step. |
| `Cache: 0% cold` | The provider reported a cache write but no read, and the warm window has passed. |

## Plugin package layout

The package follows the OpenCode v2 CLI plugin contract:

```jsonc
{
  "exports": {
    ".": "./index.ts",
    "./tui": "./tui.tsx",
    "./gui-experimental": "./gui-experimental.cjs"
  },
  "dependencies": {
    "@opencode/plugin": "latest"
  },
  "peerDependencies": {
    "@opentui/core": ">=0.6.8",
    "@opentui/solid": ">=0.6.8",
    "solid-js": ">=1.9.0"
  }
}
```

- `"."` is the server entry. It must export `{ id, setup }`. Keep it free of
  TUI imports: loading `@opentui/solid` outside the renderer fails with
  `OPENTUI_FORCE_WCWIDTH is already registered`.
- `"./tui"` is the TUI entry, built with `Plugin.define` from
  `@opencode/plugin/tui`.

## Development

```sh
npm install
npm run typecheck
bun run build:gui
bun test
npm pack --dry-run
```

OpenCode loads the TypeScript sources directly, so the package ships `index.ts`,
`cache.ts`, and `tui.tsx` without a build step. The Desktop entry is a prebuilt
CommonJS bundle; rebuild and commit `gui-experimental.cjs` after changing
`gui.ts` or `cache.ts`.

## License

[MIT](LICENSE)
