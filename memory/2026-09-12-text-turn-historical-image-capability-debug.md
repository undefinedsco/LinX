# Text turn blocked by historical image capability check

## Symptom

A text-only message such as `你好啊` was rejected with `custom 未声明 图片输入 能力` when an older turn in the same conversation contained an image.

## Root cause

`LocalChatKitService.respond()` rebuilt the full retained conversation, including historical image attachments, and then checked the entire outgoing message array for image parts. The capability guard therefore treated a historical image as if it belonged to the current user turn.

## Fix

- Decide whether to block from the current user message attachments only.
- Reject unsupported image files during `attachments.create`, so paste, drag/drop, and file selection receive an immediate ChatKit upload error before the image enters the composer.
- When the current turn has an image and the provider lacks `imageInput`, fail before any upstream request.
- When only historical turns contain images, keep their text but strip historical `image_url` parts from the payload sent to a non-vision provider.
- Do not mutate or delete stored conversation history.

## Verification

- Added regression coverage for historical-image/current-text and current-image/unsupported-provider cases.
- Targeted ChatKit service suites: 73 tests passed.
- Web typecheck and production build passed.
- Live browser verification was temporarily blocked by the selected legacy QA thread failing to restore after HMR; the local Xpod container itself remained healthy.

## Status

Fixed locally. Unsupported images are rejected at attachment time with `此模型不支持图像输入。请尝试其他模型`, while the send-time capability check remains as a defense-in-depth fallback. The capability decision now matches the current request instead of unrelated historical attachments.
