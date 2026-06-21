# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: mobile-smoke.spec.ts >> home screen renders — no JS crash
- Location: e2e/mobile-smoke.spec.ts:63:5

# Error details

```
Error: "e.filter" TypeError detected — facts API likely returned wrong shape.
  Errors: TypeError: e.filter is not a function
    at j (http://localhost/mobile/_expo/static/js/web/entry-40f67455557abfb8e41a0532840e0008.js:1484:427)
    at v (http://localhost/mobile/_expo/static/js/web/entry-40f67455557abfb8e41a0532840e0008.js:1484:1558)
    at Ha (http://localhost/mobile/_expo/static/js/web/entry-40f67455557abfb8e41a0532840e0008.js:549:45858)
    at Ku (http://localhost/mobile/_expo/static/js/web/entry-40f67455557abfb8e41a0532840e0008.js:549:73867)
    at fi (http://localhost/mobile/_expo/static/js/web/entry-40f67455557abfb8e41a0532840e0008.js:549:84286)
    at mc (http://localhost/mobile/_expo/static/js/web/entry-40f67455557abfb8e41a0532840e0008.js:549:117767)
    at fc (http://localhost/mobile/_expo/static/js/web/entry-40f67455557abfb8e41a0532840e0008.js:549:116838)
    at cc (http://localhost/mobile/_expo/static/js/web/entry-40f67455557abfb8e41a0532840e0008.js:549:116680)
    at Js (http://localhost/mobile/_expo/static/js/web/entry-40f67455557abfb8e41a0532840e0008.js:549:113812)
    at Bc (http://localhost/mobile/_expo/static/js/web/entry-40f67455557abfb8e41a0532840e0008.js:549:125226)

expect(received).toBeUndefined()

Received: "TypeError: e.filter is not a function
    at j (http://localhost/mobile/_expo/static/js/web/entry-40f67455557abfb8e41a0532840e0008.js:1484:427)
    at v (http://localhost/mobile/_expo/static/js/web/entry-40f67455557abfb8e41a0532840e0008.js:1484:1558)
    at Ha (http://localhost/mobile/_expo/static/js/web/entry-40f67455557abfb8e41a0532840e0008.js:549:45858)
    at Ku (http://localhost/mobile/_expo/static/js/web/entry-40f67455557abfb8e41a0532840e0008.js:549:73867)
    at fi (http://localhost/mobile/_expo/static/js/web/entry-40f67455557abfb8e41a0532840e0008.js:549:84286)
    at mc (http://localhost/mobile/_expo/static/js/web/entry-40f67455557abfb8e41a0532840e0008.js:549:117767)
    at fc (http://localhost/mobile/_expo/static/js/web/entry-40f67455557abfb8e41a0532840e0008.js:549:116838)
    at cc (http://localhost/mobile/_expo/static/js/web/entry-40f67455557abfb8e41a0532840e0008.js:549:116680)
    at Js (http://localhost/mobile/_expo/static/js/web/entry-40f67455557abfb8e41a0532840e0008.js:549:113812)
    at Bc (http://localhost/mobile/_expo/static/js/web/entry-40f67455557abfb8e41a0532840e0008.js:549:125226)"
```

# Page snapshot

```yaml
- generic [ref=e6]:
  - generic [ref=e7]: Something went wrong
  - generic [ref=e8]: Please reload the app to continue.
  - generic [ref=e10] [cursor=pointer]: Try Again
```