# opencode-plugin-statusline

An [OpenCode](https://opencode.ai) TUI plugin that adds prompt cache status to
the footer, alongside OpenCode's built-in usage and activity indicators.

```
Cache: 88% warm 4m
```

## What it shows

The percentage is the share of prompt tokens reported as cache reads in the
latest step. `warm 4m` is an estimated remaining lifetime, `cold` means the
estimate has expired, and `--` means no cache activity was reported.

The indicator hides itself when there is no assistant step with prompt usage.
Context, cost, activity, and shortcuts remain the built-in footer's responsibility.

## Install

Add the package to `plugins` in `opencode.jsonc`:

```jsonc
// ~/.config/opencode/opencode.jsonc
{
  "$schema": "https://opencode.ai/config.json",
  "plugins": ["opencode-plugin-statusline"]
}
```

When the TUI connects to a remote server, or when you want the plugin to load
only in the terminal, list it in `cli.json` instead:

```jsonc
// ~/.config/opencode/cli.json
{
  "$schema": "https://opencode.ai/v2/cli.json",
  "plugins": ["opencode-plugin-statusline"]
}
```

From a local checkout, point the entry at the **directory**:

```jsonc
{
  "$schema": "https://opencode.ai/config.json",
  "plugins": ["/absolute/path/to/opencode-plugin-statusline"]
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
      "package": "opencode-plugin-statusline",
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
- The line refreshes every 15 seconds and reads no credentials. It sends no
  requests and stores nothing.

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
    "./tui": "./tui.tsx"
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
npm pack --dry-run
```

OpenCode loads the TypeScript sources directly, so the package ships `index.ts`,
`cache.ts`, and `tui.tsx` without a build step.

## License

[MIT](LICENSE)
