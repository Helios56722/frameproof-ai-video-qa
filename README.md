# FrameProof

FrameProof is a local-first release screening tool for AI-generated video. It helps creators catch objective warning signs before a human release review, while keeping the selected source video inside the browser session.

> **Status:** functional validation MVP. FrameProof is a working title, has not been name-cleared, and is not a deployed or payment-enabled SaaS.

## What it checks

- browser decode, duration, dimensions, and file size;
- evenly spaced sampled frames;
- possible near-black frames;
- long low-motion runs;
- possible non-adjacent repeated visuals;
- an optional ComfyUI workflow JSON summary;
- a downloadable JSON evidence report;
- a browser-local customer-validation board with CSV export.

The included four-second demo provides a quick way to test the screening flow without choosing a personal video.

## What it does not check

FrameProof does not verify every frame, audio, lip sync, pronunciation, character identity, wardrobe, story continuity, physical plausibility, copyright, factual accuracy, or creative quality. A warning is a prompt for human review, not proof that a video is defective.

## Privacy model

The current MVP analyzes the selected video in the browser. It has no upload endpoint, account system, cloud storage, analytics, billing, or external AI API. Validation-board entries stay in that browser's local storage unless the user exports a CSV.

## Run locally

Requirements:

- Node.js 20 or newer
- npm

```bash
npm ci
npm run dev
```

Open <http://localhost:3000>. The validation workbench is available at <http://localhost:3000/validation>.

No environment variables are required for the current local MVP.

## Verify a change

```bash
npm run lint
npm run build
```

The optimized build currently contains the screening tool at `/` and the validation workbench at `/validation`.

## Product evidence gate

The next product decision depends on customer evidence:

1. complete ten interviews with AI-video creators;
2. confirm at least three recurring and important release-review problems;
3. record at least one credible willingness-to-pay signal;
4. choose the narrow paid feature from those interviews;
5. approve the product name, privacy model, retention policy, security model, and support boundary before adding accounts or payments.

No interview, pilot, or payment signal should be counted until it actually occurs.

## License

The project retains the MIT license and attribution contained in [LICENSE](LICENSE).
