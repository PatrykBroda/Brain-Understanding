---
name: SSRF guard must check IP-literal hosts explicitly
description: Node skips the https/http `lookup` option when the host is an IP literal, so DNS-based SSRF guards silently miss IP-literal URLs and redirects to them.
---

A custom `lookup` passed to `https.request`/`http.request` is the usual way to
validate resolved addresses against a blocklist (private/loopback/link-local/
metadata ranges) for SSRF defence. But Node's `net.lookupAndConnect`
short-circuits on `net.isIP(host)` and **never calls `lookup` when the hostname
is already an IP literal** (e.g. `https://10.0.0.5/x.mp4`, `https://[::1]/x`).

So a DNS-based guard alone leaves two holes:
1. A direct IP-literal URL connects with zero validation.
2. A public host that 302-redirects to an IP-literal URL connects unvalidated on
   the redirect hop.

**Why:** even https-only + cert verification doesn't fully close this — it still
gives an authed user an internal port-scanning oracle (distinct 422/502/timeout
responses reveal open vs closed ports) and breaks the "validate every hop"
contract.

**How to apply:** in the redirect-following loop, on EVERY hop, strip brackets
from `url.hostname` and if `net.isIP(bare)` also run it through the same IP
blocklist (`ipIsBlocked`) used by the `lookup`. Test the enforcement path, not
just the blocklist predicate in isolation: assert a direct IP-literal URL is
rejected AND that a scripted redirect-to-IP-literal is rejected (mock
`node:https` so no real network is touched). A network probe that "passes" by
getting ECONNREFUSED in the sandbox is a false positive — it failed to connect,
the guard never fired.
