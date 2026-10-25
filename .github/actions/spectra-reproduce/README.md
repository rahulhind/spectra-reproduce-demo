# Spectra Reproduce GitHub Action

Replays real users' journeys against your pull request's build, and fails the check only when something your users
do now breaks.

Spectra records real visits to your production site (with the Reproduce script installed), groups them into
journeys, and keeps the best example of each. On every pull request, this action asks Spectra to replay those
journeys against your production build and against the pull request's build, the same way, and compare what each step
leads to. Every journey comes back with one of four verdicts:

| Verdict | Meaning |
|---|---|
| **SAME** | The journey does exactly what it did. |
| **BROKEN** | A step that worked now fails: it can't be done, an answer that succeeded fails, an error appears, or a press does nothing. The check fails. |
| **CHANGED** | It works, but differently: a new page, a different request. Shown for review; the check passes. |
| **COULDN'T REPLAY** | Spectra could not judge it (for example, the build asks for data no recording has). Sent to your Reproduce inbox, never a silent pass. |

## Setup

1. Turn on Reproduce for your site (Dashboard > Reproduce) and install the Reproduce script on production.
2. Create a CI token: Dashboard > Reproduce > Checks > Tokens. Save it as the repository secret
   `SPECTRA_REPRODUCE_TOKEN`, and your site id as the repository variable `SPECTRA_SITE`.
3. Add the workflow:

```yaml
name: Spectra Reproduce
on: pull_request
jobs:
  reproduce:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - run: npm ci && npm run build          # this pull request's build, in dist/
      - uses: spectra-trace/reproduce-action@v1
        with:
          site: ${{ vars.SPECTRA_SITE }}
          token: ${{ secrets.SPECTRA_REPRODUCE_TOKEN }}
          base: https://www.example.com       # production
          candidate: dist
```

`base` and `candidate` each take a URL (a deployment reachable from the internet) or a folder. A folder is uploaded
to Spectra and served privately by Spectra's worker for the length of the check, so a static frontend needs no
preview deployment. Builds are kept for 7 days.

## Inputs

| Input | Required | Default | |
|---|---|---|---|
| `site` | yes | | Your Spectra site id |
| `token` | yes | | A Reproduce CI token for the site |
| `base` | yes | | Production (or the base branch's build): URL or folder |
| `candidate` | yes | | This pull request's build: URL or folder |
| `runs` | no | `3` | Replays per journey on each build |
| `timeout-minutes` | no | `30` | How long to wait for the verdict |
| `server` | no | `https://api.spectra-trace.com` | The Spectra API |

The report goes to the job summary. Exit code 1 when a journey is BROKEN, 0 otherwise.

## Privacy

Reproduce records visits as tests: what visitors type is kept as typed, including emails, so a replay can sign in the
way the visitor did. Passwords, card fields and one-time codes are never recorded (only their shape). Answers from
your API are kept whole. A site can opt out of keeping typed text with `data-inputs-as-typed="false"` on the script tag.
