# CLI Status Line / Footer Contract

This document defines the user-facing contract for configuring the LinX TUI
status line. Shell/core boundary rules live in `docs/linx-shell-core-design.md`;
this document only describes the status-line feature surface.

## Surfaces

LinX exposes the same local setting through two shells:

- TUI command: `/statusline`
- Scriptable config command: `linx config status-line`

Aliases are intentionally scoped:

- TUI accepts `/statusline` and `/status-line`.
- `linx config status-line` may expose section aliases such as `statusline` or
  `footer` under the `config` namespace.
- Top-level `linx status-line`, `linx statusline`, and `linx footer` are not
  product commands. Status-line configuration is either interactive TUI control
  or the `linx config` namespace.

## Ownership

The status line is shell rendering state. It may display runtime facts, but it
must not own those facts.

The renderer may read normalized data such as:

- current backend/model/reasoning-effort display labels;
- git branch and current working directory;
- context/token usage summaries supplied by the runtime adapter;
- shell mode indicators such as auto or Symphony.

It must not define or persist:

- backend credential semantics;
- Pod chat/thread/message identities;
- provider aliases or model routing policy;
- session archive identity;
- approval or Symphony control-plane state.

If a displayed value requires shared business semantics, the value must come from
the shared runtime/model contract before reaching the renderer.

## Persistence

Status-line token preferences are app-local shell preferences. They are stored
under `LINX_HOME` and may be overridden by supported environment variables for
local developer workflows.

They are not Pod data, not user memory, and not backend configuration. Do not
write them into Solid resources or use them as cross-device product truth unless
a separate synced preference model is explicitly designed.

## Commands

Interactive TUI:

```text
/statusline
/statusline set <tokens...>
/statusline colors <on|off>
/statusline tokens
/statusline reset
```

Scriptable CLI:

```text
linx config status-line
linx config status-line set <tokens...>
linx config status-line colors <on|off>
linx config status-line tokens
linx config status-line reset
```

The empty TUI command may open an interactive selector. The empty CLI config
command prints the effective config and config file path.

## Boundary tests

Regression tests should protect both behavior and command ownership:

- `/statusline` is consumed by the LinX interactive shell and does not reach the
  backend submit path.
- `linx config status-line ...` reads/writes app-local config.
- top-level `linx status-line` is rejected as an unknown command.
- top-level help does not advertise `linx status-line`, `linx statusline`, or
  `linx footer`.
