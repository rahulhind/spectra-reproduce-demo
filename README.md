# Spectra Reproduce demo

**Your real users' journeys, replayed against every pull request.** This repository is a working example: a real app
in production, its visitors' journeys recorded by [Spectra](https://spectra-trace.com), and a pull-request check that
replays those journeys against each pull request and fails only when something people actually do now breaks.

The app is the Vue 3 implementation of [RealWorld](https://github.com/gothinkster/realworld) ("Conduit", a Medium-like
blog), by [mutoe](https://github.com/mutoe/vue3-realworld-example-app) (MIT), talking to the public RealWorld API.

## How it works

1. **Production** (`main`) is deployed to GitHub Pages with the Spectra Reproduce script installed
   ([`production.yml`](.github/workflows/production.yml)). Real visits to it are recorded: what each visitor did,
   the answers the API gave them, the state their browser started in.
2. **Spectra groups visits into journeys** (sign in, read an article, favorite it, comment, follow an author, …) and
   keeps the best example of each as a test. No test is written by hand.
3. **Every pull request** builds the app and asks Spectra to check it ([`reproduce.yml`](.github/workflows/reproduce.yml)).
   The build is uploaded and served privately by Spectra's worker; no preview deployment is needed. Spectra replays
   every journey on production and on the pull request's build, deterministically (each visit's API answers, clock
   and randomness), and compares what each step leads to.

Each journey comes back **Same**, **Broken** (a step that worked now fails: the check fails), **Changed** (it works,
differently: shown for review) or **Couldn't replay** (Spectra says why, and asks you; never a silent pass).

## The two pull requests to look at

| Pull request | The change | What Spectra says |
|---|---|---|
| **Favorite button refactor** (`demo/broken-favorite`) | One character: the favorite button's `disabled` condition is inverted, so the button never responds. Type-checks, lints, and passes the unit tests. | **Broken**: "step 6 (click) now does nothing", naming the journey. The check fails. |
| **Tidy the favorite logic** (`demo/harmless-refactor`) | The same feature reorganised, behaviour unchanged. | **Same** on every journey. The check passes. |

## Running it on your own fork

1. In Spectra: create a site, have Reproduce switched on for it, and create a CI token (Reproduce > Checks > Tokens).
2. In the fork's settings: the variable `SPECTRA_SITE` (your site id), and the secrets `SPECTRA_KEY` (the site's
   ingest key) and `SPECTRA_REPRODUCE_TOKEN` (the CI token). Enable GitHub Pages with "GitHub Actions" as the source.
3. Push to `main`, visit the deployed site and use it for a while (or have a few people do so).
4. Open a pull request.

## Attribution and licence

The application code is © 2021 Dongsen and contributors, MIT licence ([LICENSE](LICENSE)). The Spectra Reproduce
workflow, the action in `.github/actions/spectra-reproduce` and `scripts/add-spectra-tag.mjs` are © Spectra.
