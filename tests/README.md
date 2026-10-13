# Browser tests

The `run.mjs` suite was carried over from the supplied reference repository as a starting point. The canonical app in this repository is the newer `index.html` copied from `ORBIT2.html`, so **these tests have not yet been confirmed against this version**. Review/update selectors and expectations before treating the suite as a reliable release gate.

To try the suite locally:

```bash
npm install
npx playwright install chromium
npm test
```

A passing syntax check or a successful GitHub Pages deployment does not mean the app has passed browser tests.
