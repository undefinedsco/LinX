# CLI Status Line

LinX uses Pi's footer component for the TUI shell, but Pi does not expose a
Codex-style generic `status_line` token list. LinX patches the second footer
line with an app-local configurable renderer while keeping the default footer
content unchanged.

## Configuration

Preferred TUI workflow:

```text
/statusline
/statusline tokens
/statusline set model-with-reasoning git-branch context-remaining total-input-tokens total-output-tokens current-dir
/statusline colors off
/statusline reset
```

`/statusline` opens an in-TUI selector with presets and token guidance. The
external CLI remains available for scripts and dotfile setup:

```bash
linx config status-line
linx config status-line tokens
linx config status-line set model-with-reasoning git-branch context-remaining total-input-tokens total-output-tokens current-dir
linx config status-line colors off
linx config status-line reset
```

`statusline` and `footer` are aliases under `linx config`.

Configuration priority:

1. `LINX_STATUS_LINE`
2. `$LINX_HOME/config.json`
3. `$SOLID_HOME/apps/linx/config.json`
4. LinX default status line

`LINX_STATUS_LINE` accepts comma- or space-separated tokens:

```bash
LINX_STATUS_LINE="model-with-reasoning,git-branch,context-remaining,total-input-tokens,total-output-tokens,current-dir" linx
```

The app config file accepts the same shape as Codex's status line setting, using
JSON because LinX app-local config is stored under the Solid app directory:

```json
{
  "status_line": [
    "model-with-reasoning",
    "git-branch",
    "context-remaining",
    "total-input-tokens",
    "total-output-tokens",
    "current-dir"
  ],
  "status_line_use_colors": true
}
```

CamelCase keys are also accepted: `statusLine` and `statusLineUseColors`.

## Tokens

- `total-input-tokens`
- `total-output-tokens`
- `context-usage`
- `context-remaining`
- `cache-rate`
- `model`
- `model-with-reasoning`
- `thinking`
- `provider`
- `current-dir`
- `git-branch`
- `session-name`

Aliases are accepted for common shorthand: `input`, `output`, `context`,
`context-left`, `cache`, `cwd`, `pwd`, `branch`, and `reasoning`.

The default LinX status line is:

```json
[
  "total-input-tokens",
  "total-output-tokens",
  "context-usage",
  "cache-rate",
  "model-with-reasoning"
]
```
