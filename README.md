# FrameProof

FrameProof is a browser-local ComfyUI workflow inspector. It reads a saved workflow or API prompt, maps its graph, prioritizes likely problems, explains the evidence, and gives practical repair steps before a user spends time on a render.

> **Status:** functional local product prototype. FrameProof is a working title, has not been name-cleared, and is not payment-enabled.

## Workflow inspection

The main inspector at `/` accepts both common ComfyUI JSON shapes:

- saved workflow JSON with `nodes` and `links`;
- API prompt JSON keyed by node ID with `class_type` and `inputs`.

It checks:

- graph structure, duplicate IDs, broken references, cycles, disconnected nodes, and output nodes;
- required inputs for common core nodes;
- dimensions, batch size, denoise, steps, CFG, and seed reproducibility;
- selected video-profile alignment rules, including common Wan and MiniMax H3 frame grids;
- referenced checkpoints, LoRAs, VAEs, and other named assets;
- node types that need a custom-node availability check in the target runtime.

Every finding includes severity, confidence, affected nodes, evidence, impact, and ordered repair steps. Reports can be copied as plain text or downloaded as JSON.

## Runtime boundary

Static JSON inspection does not execute a ComfyUI graph. It cannot prove that custom nodes import correctly, model files exist in the required folders, output-slot types match a particular node-pack version, the target GPU has enough VRAM, or the final output is good. FrameProof labels those items as runtime checks instead of presenting guesses as confirmed failures.

## Video output screening

The existing generated-video checker remains at `/video`. It performs browser-local sampled checks for:

- decode, duration, dimensions, and file size;
- possible near-black frames;
- long low-motion runs;
- possible non-adjacent repeated visuals;
- optional workflow evidence in the video report.

The included four-second demo exercises the video flow without choosing a personal file. Creative quality, audio, lip sync, identity, story continuity, hands, text, and physical plausibility still need human review.

## Privacy model

Workflow and video analysis runs in the browser. The app has no upload endpoint, account system, cloud storage, analytics, billing, or external AI API. Validation-board entries stay in that browser's local storage unless the user exports a CSV.

## Run locally

Requirements:

- Node.js 20 or newer;
- npm.

```bash
npm ci
npm run dev
```

Open <http://localhost:3000>.

- Workflow inspector: `/`
- Video QA: `/video`
- Customer validation workbench: `/validation`

No environment variables are required.

## Verify a change

```bash
npm test
npm run lint
npm run build
```

The automated tests cover both ComfyUI JSON shapes, graph extraction, broken connection detection, invalid sampling settings, invalid JSON, and unrelated JSON rejection.

## Product evidence gate

The next product decision still depends on customer evidence:

1. complete ten interviews with ComfyUI and AI-video creators;
2. confirm at least three recurring and important workflow or release-review problems;
3. record at least one credible willingness-to-pay signal;
4. choose the narrow paid feature from those interviews;
5. approve the product name, privacy model, retention policy, security model, and support boundary before adding accounts or payments.

No interview, pilot, or payment signal should be counted until it actually occurs.

## License

The project retains the MIT license and attribution contained in [LICENSE](LICENSE).
