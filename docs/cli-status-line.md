# CLI Status Line

LinX exposes a Codex-style configurable TUI status line: the bottom-most line in
the interactive shell. `/statusline` changes only that status line. It must not
rewrite prompt hints, selector footers, or transient extension notices.

## Configuration

Preferred TUI workflow:

```text
/statusline
/statusline tokens
/statusline set mode model-with-reasoning git-branch context-remaining total-input-tokens total-output-tokens current-dir
/statusline colors off
/statusline reset
```

`/statusline` opens an in-TUI selector with presets and token guidance. The
external CLI remains available for scripts and dotfile setup:

```bash
linx config status-line
linx config status-line tokens
linx config status-line set mode model-with-reasoning git-branch context-remaining total-input-tokens total-output-tokens current-dir
linx config status-line colors off
linx config status-line reset
```

`statusline` is accepted as an alias under `linx config`.

Configuration priority:

1. `LINX_STATUS_LINE`
2. `$LINX_HOME/config.json`
3. `$SOLID_HOME/apps/linx/config.json`
4. LinX default status line

`LINX_STATUS_LINE` accepts comma- or space-separated tokens:

```bash
LINX_STATUS_LINE="mode,model-with-reasoning,git-branch,context-remaining,total-input-tokens,total-output-tokens,current-dir" linx
```

The app config file accepts the same shape as Codex's status line setting, using
JSON because LinX app-local config is stored under the Solid app directory:

```json
{
  "status_line": [
    "mode",
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

- `mode`
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
`context-left`, `cache`, `cwd`, `pwd`, `workspace`, `branch`, `reasoning`,
`peer`, and `state`.

The default LinX status line is:

```json
[
  "mode",
  "total-input-tokens",
  "total-output-tokens",
  "context-usage",
  "cache-rate",
  "model-with-reasoning"
]
```
