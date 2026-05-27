---
name: Attachment storage — filesystem + DB metadata, base64 over the wire
description: Why image/video uploads use disk files referenced from a DB row, and why the upload wire format is base64 JSON rather than multipart.
---

For personal-tool projects with a server that bundles via esbuild and no GCS budget headroom, attachments go to disk under `<api-cwd>/uploads/<uuid><ext>` with an `attachments` row holding metadata (kind, mime, filename, sizeBytes, filePath, conversationId, messageId nullable). Bytes are NOT stored in postgres.

**Why:**
- Object storage (GCS) skill is heavy: presigned URLs + Uppy + codegen + ACL framework. Overkill for a single-user wrapper around an LLM.
- Storing 5–12MB blobs in postgres TEXT/BYTEA bloats every conversation query and trashes query cache.
- Disk persists across dev restarts but is ephemeral on Replit deploys — acceptable tradeoff for a personal tool that lives in dev; document this explicitly if/when the user deploys.

**How to apply:**
- Upload route accepts JSON `{conversationId, kind, mimeType, filename, dataBase64}` (no multipart → no new dep). Bump `express.json({limit})` to cover base64 overhead (~33% bigger than the original file).
- Two-step linking: client uploads first (gets attachment id), then sends chat message with `attachmentIds[]`. Coach route links them to the freshly-inserted user message in a single UPDATE.
- For LLM vision: only the LATEST user turn's image bytes are inlined as base64 image blocks in the Claude payload. Older turns get text placeholders `[earlier image: filename]`. Otherwise you re-encode every image every turn — expensive, and it defeats prompt caching.
- Videos are stored and rendered with `<video controls>` but NEVER sent to Claude (no video vision). Insert a text note in the message content so the coach knows to ask the athlete to describe or take stills.
