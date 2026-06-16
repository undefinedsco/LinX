---
name: basic
description: Use when LinX Secretary needs default runtime capabilities such as web research, URL fetching, source lookup, shell/file inspection, or other common tool use that is not a domain-specific product workflow.
---

# Basic

This is LinX's default runtime capability bundle for Secretary. It is the
user-facing umbrella for common runtime tools. Do not expose upstream package or
internal skill names such as `pi-web-access` or `librarian` to the user.

Use domain-specific skills first when they apply:

- `symphony` for system-evolution control-plane judgment, work coordination,
  and evidence feedback.
- `xpod-cli` for Solid Pod inspection, object operations, secrets, and durable
  product data.

Use Basic for ordinary runtime capabilities that do not need a domain control
skill.

## Current Capabilities

### Web Research And Fetching

When web access tools are available, use them for current facts, official docs,
source pages, repositories, PDFs, and other external evidence. Prefer official
or primary sources. Cite the source used in the final answer when external
facts materially affect the response.

For open-source implementation questions, prefer source-backed answers: inspect
repository files when available, identify the relevant implementation, and cite
stable source links or file references instead of relying on summaries alone.

### Workspace Inspection

Use shell and file tools for local, non-destructive inspection of the current
workspace. Follow repository instructions, prefer precise searches, and avoid
large raw dumps when a focused read is enough.

### Future Basic Capabilities

Additional low-level runtime tools may be grouped here later. Keep Basic as a
capability umbrella, not a product workflow. If a capability gains product
state, authority rules, or durable Pod semantics, move that guidance into a
specific skill or shared model contract instead of expanding Basic indefinitely.
