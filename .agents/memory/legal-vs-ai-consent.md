---
name: Legal acceptance vs AI permission
description: Keep mandatory account terms separate from optional third-party AI data-sharing permission.
---

Account registration must require explicit acceptance of the current Terms of
Service and Privacy Policy. Permission to share analysis data with Anthropic is
a separate choice: it must not be bundled into account creation, and users can
decline or withdraw it while retaining non-AI account functionality.

**Why:** Apple expects informed permission before third-party AI sharing and a
real ability to decline. Bundling that optional data-sharing permission into
mandatory account terms would undermine the disclosure and decline flow.

**How to apply:** Keep separate versions/timestamps and UI controls for legal
acceptance and AI permission. A registration gate may require legal acceptance;
an AI endpoint must independently require current AI permission.