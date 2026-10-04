import test from "node:test";
import assert from "node:assert/strict";
import { analyzeComfyWorkflow, parseAndAnalyzeComfyWorkflow } from "../src/lib/analyze-comfy-workflow.mjs";

const healthyApiWorkflow = {
  "1": { class_type: "CheckpointLoaderSimple", inputs: { ckpt_name: "model.safetensors" } },
  "2": { class_type: "CLIPTextEncode", inputs: { text: "a lighthouse", clip: ["1", 1] } },
  "3": { class_type: "CLIPTextEncode", inputs: { text: "blur", clip: ["1", 1] } },
  "4": { class_type: "EmptyLatentImage", inputs: { width: 1024, height: 1024, batch_size: 1 } },
  "5": {
    class_type: "KSampler",
    inputs: {
      model: ["1", 0], positive: ["2", 0], negative: ["3", 0], latent_image: ["4", 0],
      seed: 42, steps: 24, cfg: 7, sampler_name: "euler", scheduler: "normal", denoise: 1,
    },
  },
  "6": { class_type: "VAEDecode", inputs: { samples: ["5", 0], vae: ["1", 2] } },
  "7": { class_type: "SaveImage", inputs: { images: ["6", 0], filename_prefix: "FrameProof" } },
};

test("recognizes a ComfyUI API prompt and maps its graph", () => {
  const report = analyzeComfyWorkflow(healthyApiWorkflow, { createdAt: "2026-10-04T00:00:00.000Z" });
  assert.equal(report.format, "ComfyUI API prompt");
  assert.equal(report.summary.nodeCount, 7);
  assert.equal(report.summary.connectionCount, 9);
  assert.equal(report.summary.outputNodeCount, 1);
  assert.equal(report.counts.critical, 0);
  assert.ok(report.assets.some((asset) => asset.value === "model.safetensors"));
});

test("prioritizes broken references and invalid sampler settings", () => {
  const broken = structuredClone(healthyApiWorkflow);
  broken["5"].inputs.negative = ["99", 0];
  broken["5"].inputs.denoise = 1.4;
  const report = analyzeComfyWorkflow(broken);
  assert.equal(report.verdict, "blocked");
  assert.ok(report.findings.some((finding) => finding.id === "dangling-links" && finding.severity === "critical"));
  assert.ok(report.findings.some((finding) => finding.id === "invalid-denoise" && finding.severity === "critical"));
});

test("recognizes the saved workflow graph shape", () => {
  const saved = {
    version: 1,
    state: { lastNodeId: 2, lastLinkId: 1, lastGroupId: 0, lastRerouteId: 0 },
    nodes: [
      { id: 1, type: "LoadImage", pos: [0, 0], size: [200, 200], mode: 0, inputs: [], outputs: [] },
      { id: 2, type: "PreviewImage", pos: [300, 0], size: [200, 200], mode: 0, inputs: [], outputs: [] },
    ],
    links: [[1, 1, 0, 2, 0, "IMAGE"]],
  };
  const report = analyzeComfyWorkflow(saved);
  assert.equal(report.format, "ComfyUI saved workflow");
  assert.equal(report.summary.connectionCount, 1);
  assert.equal(report.summary.outputNodeCount, 1);
  assert.equal(report.counts.critical, 0);
});

test("reads common saved-workflow widget values by node type", () => {
  const saved = {
    version: 1,
    state: { lastNodeId: 2, lastLinkId: 0, lastGroupId: 0, lastRerouteId: 0 },
    nodes: [
      { id: 1, type: "EmptyLatentImage", mode: 0, inputs: [], outputs: [], widgets_values: [1025, 512, 1] },
      { id: 2, type: "SaveImage", mode: 0, inputs: [], outputs: [], widgets_values: ["FrameProof"] },
    ],
    links: [],
  };
  const report = analyzeComfyWorkflow(saved);
  assert.ok(report.findings.some((finding) => finding.id === "unaligned-width"));
});

test("returns a useful error for invalid JSON", () => {
  assert.throws(
    () => parseAndAnalyzeComfyWorkflow('{ "1": '),
    /not valid JSON/,
  );
});

test("rejects arbitrary JSON that is not a ComfyUI workflow", () => {
  assert.throws(
    () => analyzeComfyWorkflow({ hello: "world" }),
    /not a recognizable ComfyUI/,
  );
});
