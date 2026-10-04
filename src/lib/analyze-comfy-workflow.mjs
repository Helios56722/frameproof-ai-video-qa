const CORE_NODE_TYPES = new Set([
  "CheckpointLoaderSimple", "CLIPTextEncode", "CLIPSetLastLayer", "VAELoader",
  "VAEDecode", "VAEEncode", "EmptyLatentImage", "EmptySD3LatentImage", "KSampler",
  "KSamplerAdvanced", "SaveImage", "PreviewImage", "LoadImage", "LoadImageMask",
  "LoraLoader", "ControlNetLoader", "ControlNetApply", "ControlNetApplyAdvanced",
  "ImageScale", "ImageScaleBy", "ImageInvert", "ImageBatch", "ImageBlend",
  "LatentUpscale", "LatentUpscaleBy", "RepeatLatentBatch", "SetLatentNoiseMask",
  "CLIPLoader", "DualCLIPLoader", "UNETLoader", "ModelSamplingFlux", "ModelSamplingSD3",
  "ModelSamplingDiscrete", "CFGGuider", "BasicGuider", "DualCFGGuider", "RandomNoise",
  "BasicScheduler", "KSamplerSelect", "SamplerCustom", "SamplerCustomAdvanced",
  "EmptyLatentAudio", "SaveAudio", "PreviewAudio", "LoadAudio", "Note", "PrimitiveNode",
]);

const OUTPUT_PATTERN = /(save|preview|output|combine|video.*(?:save|output)|audio.*(?:save|output))/i;
const ASSET_KEY_PATTERN = /(?:^|_)(?:ckpt|checkpoint|model|unet|lora|vae|clip|controlnet|upscale_model|style_model|gligen|audio_encoder|text_encoder)(?:_name)?$/i;
const LINK_INPUT_NAMES = new Set([
  "model", "clip", "vae", "positive", "negative", "latent_image", "latent", "samples",
  "image", "images", "mask", "conditioning", "control_net", "upscale_model", "audio",
  "guider", "sampler", "sigmas", "noise", "latent_image", "pixels",
]);

const REQUIRED_API_INPUTS = {
  CheckpointLoaderSimple: ["ckpt_name"],
  CLIPTextEncode: ["text", "clip"],
  EmptyLatentImage: ["width", "height", "batch_size"],
  KSampler: ["model", "positive", "negative", "latent_image", "seed", "steps", "cfg", "sampler_name", "scheduler", "denoise"],
  KSamplerAdvanced: ["model", "positive", "negative", "latent_image", "noise_seed", "steps", "cfg", "sampler_name", "scheduler"],
  VAEDecode: ["samples", "vae"],
  VAEEncode: ["pixels", "vae"],
  SaveImage: ["images"],
  PreviewImage: ["images"],
  UNETLoader: ["unet_name"],
  VAELoader: ["vae_name"],
  LoraLoader: ["model", "clip", "lora_name"],
};

const SAVED_WIDGET_FIELDS = {
  CheckpointLoaderSimple: ["ckpt_name"],
  CLIPTextEncode: ["text"],
  CLIPLoader: ["clip_name", "type", "device"],
  DualCLIPLoader: ["clip_name1", "clip_name2", "type", "device"],
  EmptyLatentImage: ["width", "height", "batch_size"],
  EmptySD3LatentImage: ["width", "height", "batch_size"],
  KSampler: ["seed", "control_after_generate", "steps", "cfg", "sampler_name", "scheduler", "denoise"],
  KSamplerAdvanced: ["add_noise", "noise_seed", "control_after_generate", "steps", "cfg", "sampler_name", "scheduler", "start_at_step", "end_at_step", "return_with_leftover_noise"],
  LoraLoader: ["lora_name", "strength_model", "strength_clip"],
  SaveImage: ["filename_prefix"],
  UNETLoader: ["unet_name", "weight_dtype"],
  VAELoader: ["vae_name"],
};

const severityRank = { critical: 0, warning: 1, notice: 2 };

function isObject(value) {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function textValue(value) {
  if (typeof value === "string") return value;
  if (typeof value === "number" || typeof value === "boolean") return String(value);
  return "";
}

function addFinding(findings, finding) {
  findings.push({
    confidence: "certain",
    nodes: [],
    evidence: [],
    fix: [],
    ...finding,
  });
}

function readWidgetInputs(node) {
  const values = Array.isArray(node.widgets_values) ? node.widgets_values : [];
  const inputs = {};
  const knownFields = SAVED_WIDGET_FIELDS[node.type];
  if (knownFields) {
    knownFields.forEach((name, index) => {
      if (values[index] !== undefined) inputs[name] = values[index];
    });
  } else if (Array.isArray(node.inputs)) {
    const widgetInputs = node.inputs.filter((input) => input?.widget?.name || input?.widget?.config);
    widgetInputs.forEach((input, index) => {
      const name = input.widget?.name || input.name;
      if (name && values[index] !== undefined) inputs[name] = values[index];
    });
  }
  return inputs;
}

function normalizeUiWorkflow(json) {
  const nodes = json.nodes.map((node, index) => ({
    id: String(node.id ?? `index-${index}`),
    type: String(node.type || "Unknown"),
    title: String(node.title || node.type || `Node ${node.id ?? index}`),
    mode: Number(node.mode || 0),
    inputs: readWidgetInputs(node),
    raw: node,
  }));

  const edges = [];
  const malformedLinks = [];
  for (const link of Array.isArray(json.links) ? json.links : []) {
    if (Array.isArray(link) && link.length >= 5) {
      edges.push({
        id: String(link[0]),
        source: String(link[1]),
        sourceSlot: Number(link[2]),
        target: String(link[3]),
        targetSlot: Number(link[4]),
        type: textValue(link[5]),
      });
    } else if (isObject(link) && link.origin_id !== undefined && link.target_id !== undefined) {
      edges.push({
        id: String(link.id ?? `${link.origin_id}-${link.target_id}`),
        source: String(link.origin_id),
        sourceSlot: Number(link.origin_slot || 0),
        target: String(link.target_id),
        targetSlot: Number(link.target_slot || 0),
        type: textValue(link.type),
      });
    } else {
      malformedLinks.push(link);
    }
  }
  return { format: "ComfyUI saved workflow", nodes, edges, malformedLinks };
}

function normalizeApiWorkflow(json) {
  const entries = Object.entries(json).filter(([, value]) => isObject(value) && typeof value.class_type === "string");
  const ids = new Set(entries.map(([id]) => String(id)));
  const nodes = entries.map(([id, node]) => ({
    id: String(id),
    type: String(node.class_type),
    title: String(node._meta?.title || node.class_type),
    mode: 0,
    inputs: isObject(node.inputs) ? node.inputs : {},
    raw: node,
  }));
  const edges = [];
  const danglingInputReferences = [];

  for (const node of nodes) {
    for (const [inputName, value] of Object.entries(node.inputs)) {
      const looksLikeLink = Array.isArray(value)
        && value.length === 2
        && ["string", "number"].includes(typeof value[0])
        && Number.isInteger(Number(value[1]));
      if (!looksLikeLink) continue;
      const source = String(value[0]);
      if (ids.has(source)) {
        edges.push({
          id: `${source}:${value[1]}-${node.id}:${inputName}`,
          source,
          sourceSlot: Number(value[1]),
          target: node.id,
          targetSlot: inputName,
          type: "",
        });
      } else if (LINK_INPUT_NAMES.has(inputName)) {
        danglingInputReferences.push({ nodeId: node.id, inputName, source, outputIndex: value[1] });
      }
    }
  }
  return { format: "ComfyUI API prompt", nodes, edges, malformedLinks: [], danglingInputReferences };
}

function normalizeWorkflow(json) {
  if (isObject(json) && Array.isArray(json.nodes)) return normalizeUiWorkflow(json);
  if (isObject(json)) {
    const entries = Object.values(json);
    if (entries.some((value) => isObject(value) && typeof value.class_type === "string")) {
      return normalizeApiWorkflow(json);
    }
  }
  throw new Error("This JSON is not a recognizable ComfyUI saved workflow or API prompt.");
}

function detectCycle(nodes, edges) {
  const adjacency = new Map(nodes.map((node) => [node.id, []]));
  for (const edge of edges) {
    if (adjacency.has(edge.source) && adjacency.has(edge.target)) adjacency.get(edge.source).push(edge.target);
  }
  const visiting = new Set();
  const visited = new Set();
  const stack = [];
  function visit(id) {
    if (visiting.has(id)) {
      const start = stack.indexOf(id);
      return [...stack.slice(start), id];
    }
    if (visited.has(id)) return null;
    visiting.add(id);
    stack.push(id);
    for (const next of adjacency.get(id) || []) {
      const cycle = visit(next);
      if (cycle) return cycle;
    }
    stack.pop();
    visiting.delete(id);
    visited.add(id);
    return null;
  }
  for (const node of nodes) {
    const cycle = visit(node.id);
    if (cycle) return cycle;
  }
  return null;
}

function collectAssets(nodes) {
  const assets = [];
  for (const node of nodes) {
    for (const [key, value] of Object.entries(node.inputs || {})) {
      if (!ASSET_KEY_PATTERN.test(key) || typeof value !== "string" || !value.trim()) continue;
      assets.push({ nodeId: node.id, nodeType: node.type, input: key, value: value.trim() });
    }
  }
  return assets;
}

function numericInputs(nodes, key) {
  return nodes
    .filter((node) => Number.isFinite(Number(node.inputs?.[key])))
    .map((node) => ({ node, value: Number(node.inputs[key]) }));
}

function findNodeIds(nodes, pattern) {
  return nodes.filter((node) => pattern.test(node.type)).map((node) => node.id);
}

export function analyzeComfyWorkflow(json, options = {}) {
  const normalized = normalizeWorkflow(json);
  const { format, nodes, edges } = normalized;
  const findings = [];
  const nodeIds = new Set(nodes.map((node) => node.id));
  const nodeTypes = [...new Set(nodes.map((node) => node.type))].sort((a, b) => a.localeCompare(b));
  const outputNodes = nodes.filter((node) => OUTPUT_PATTERN.test(node.type));
  const assets = collectAssets(nodes);

  if (!nodes.length) {
    addFinding(findings, {
      id: "no-nodes", severity: "critical", category: "Structure", title: "The workflow contains no nodes",
      summary: "FrameProof found the workflow container but no runnable node definitions.",
      why: "ComfyUI has nothing to execute without nodes.",
      fix: ["Open the intended workflow in ComfyUI.", "Save or export it again, then inspect the new JSON file."],
    });
  }

  const duplicateIds = [...new Set(nodes.map((node) => node.id).filter((id, index, all) => all.indexOf(id) !== index))];
  if (duplicateIds.length) {
    addFinding(findings, {
      id: "duplicate-node-ids", severity: "critical", category: "Structure", title: "Duplicate node IDs can make links ambiguous",
      summary: `${duplicateIds.length} node ID${duplicateIds.length === 1 ? " is" : "s are"} reused.`,
      why: "Connections identify nodes by ID, so duplicate IDs can route data to the wrong node or prevent loading.",
      evidence: duplicateIds.map((id) => `Duplicate ID ${id}`), nodes: duplicateIds,
      fix: ["Open the workflow in ComfyUI and save a fresh copy.", "If the file was edited by hand, assign every node a unique ID and update its links."],
    });
  }

  const danglingEdges = edges.filter((edge) => !nodeIds.has(edge.source) || !nodeIds.has(edge.target));
  const danglingInputs = normalized.danglingInputReferences || [];
  if (danglingEdges.length || danglingInputs.length) {
    const evidence = [
      ...danglingEdges.slice(0, 8).map((edge) => `Link ${edge.id}: ${edge.source} → ${edge.target}`),
      ...danglingInputs.slice(0, 8).map((input) => `Node ${input.nodeId}.${input.inputName} points to missing node ${input.source}`),
    ];
    addFinding(findings, {
      id: "dangling-links", severity: "critical", category: "Connections", title: "One or more connections point to missing nodes",
      summary: `${danglingEdges.length + danglingInputs.length} broken connection reference${danglingEdges.length + danglingInputs.length === 1 ? " was" : "s were"} found.`,
      why: "A required input cannot receive data when its source node is absent.",
      evidence, nodes: [...new Set([...danglingEdges.flatMap((edge) => [edge.source, edge.target]), ...danglingInputs.map((item) => item.nodeId)])],
      fix: ["Open the workflow and locate the affected node IDs listed below.", "Reconnect each missing input to the intended source node.", "Export the workflow again and rerun FrameProof."],
    });
  }

  if (normalized.malformedLinks?.length) {
    addFinding(findings, {
      id: "malformed-links", severity: "critical", category: "Connections", title: "Some saved links have an unreadable shape",
      summary: `${normalized.malformedLinks.length} link record${normalized.malformedLinks.length === 1 ? " does" : "s do"} not match the saved-workflow link structure.`,
      why: "FrameProof cannot verify the source and target of those records, and ComfyUI may not be able to restore them.",
      fix: ["Load the workflow in ComfyUI if possible.", "Remove and reconnect the affected wires, then save a fresh copy."],
    });
  }

  const cycle = detectCycle(nodes, edges.filter((edge) => nodeIds.has(edge.source) && nodeIds.has(edge.target)));
  if (cycle) {
    addFinding(findings, {
      id: "cycle", severity: "critical", category: "Connections", title: "The graph contains a dependency cycle",
      summary: `The path ${cycle.join(" → ")} returns to its starting node.`,
      why: "ComfyUI workflows are evaluated as dependency graphs. A circular dependency has no valid starting order.",
      evidence: [`Cycle: ${cycle.join(" → ")}`], nodes: [...new Set(cycle)],
      fix: ["Inspect the listed nodes in ComfyUI.", "Remove the wire that feeds a downstream result back into its own dependency chain."],
    });
  }

  if (nodes.length && !outputNodes.length) {
    addFinding(findings, {
      id: "no-output", severity: "warning", category: "Output", title: "No save or preview output node was recognized",
      summary: "The graph may calculate data without exposing a result.",
      why: "A workflow normally needs a save, preview, combine, or other output node so the result can be reviewed.",
      confidence: "heuristic", evidence: [`Recognized node types: ${nodeTypes.join(", ")}`],
      fix: ["Add the appropriate Save, Preview, Video Combine, or output node.", "Connect the final image, video, or audio result to that node."],
    });
  }

  const degree = new Map(nodes.map((node) => [node.id, 0]));
  for (const edge of edges) {
    if (degree.has(edge.source)) degree.set(edge.source, degree.get(edge.source) + 1);
    if (degree.has(edge.target)) degree.set(edge.target, degree.get(edge.target) + 1);
  }
  const isolated = nodes.filter((node) => degree.get(node.id) === 0 && !/(note|primitive)/i.test(node.type));
  if (nodes.length > 1 && isolated.length) {
    addFinding(findings, {
      id: "isolated-nodes", severity: "warning", category: "Connections", title: "Some nodes are disconnected from the graph",
      summary: `${isolated.length} node${isolated.length === 1 ? " has" : "s have"} no incoming or outgoing connection.`,
      why: "Disconnected processing nodes usually do not contribute to an output and can hide an unfinished branch.",
      confidence: "heuristic", nodes: isolated.map((node) => node.id),
      evidence: isolated.slice(0, 10).map((node) => `Node ${node.id}: ${node.type}`),
      fix: ["Decide whether each listed node belongs in the workflow.", "Connect needed nodes to the intended branch, or remove abandoned nodes."],
    });
  }

  const inactive = nodes.filter((node) => node.mode !== 0);
  if (inactive.length) {
    addFinding(findings, {
      id: "inactive-nodes", severity: "warning", category: "Execution", title: "Some nodes use a non-default execution mode",
      summary: `${inactive.length} node${inactive.length === 1 ? " is" : "s are"} saved with a mode other than 0.`,
      why: "Bypassed, muted, or disabled nodes can change which model path actually runs.",
      confidence: "certain", nodes: inactive.map((node) => node.id),
      evidence: inactive.slice(0, 10).map((node) => `Node ${node.id}: ${node.type}, mode ${node.mode}`),
      fix: ["Review each listed node in ComfyUI.", "Restore the intended execution mode or confirm the bypass is deliberate."],
    });
  }

  if (format === "ComfyUI API prompt") {
    for (const node of nodes) {
      const required = REQUIRED_API_INPUTS[node.type];
      if (!required) continue;
      const missing = required.filter((name) => node.inputs[name] === undefined || node.inputs[name] === null || node.inputs[name] === "");
      if (!missing.length) continue;
      addFinding(findings, {
        id: `missing-inputs-${node.id}`, severity: "critical", category: "Inputs", title: `${node.type} is missing required inputs`,
        summary: `Node ${node.id} is missing: ${missing.join(", ")}.`,
        why: "The node cannot execute its core operation without these values or connections.",
        nodes: [node.id], evidence: missing.map((name) => `Missing ${name}`),
        fix: ["Open the workflow in ComfyUI.", `Connect or set ${missing.join(", ")} on node ${node.id}.`, "Export the API workflow again and rerun FrameProof."],
      });
    }
  }

  for (const key of ["width", "height"]) {
    const invalid = numericInputs(nodes, key).filter(({ value }) => value <= 0 || !Number.isInteger(value));
    if (invalid.length) {
      addFinding(findings, {
        id: `invalid-${key}`, severity: "critical", category: "Dimensions", title: `Invalid ${key} value`,
        summary: `${invalid.length} node${invalid.length === 1 ? " has" : "s have"} a non-positive or non-integer ${key}.`,
        why: "Latent and image dimensions must be positive whole numbers.",
        nodes: invalid.map(({ node }) => node.id), evidence: invalid.map(({ node, value }) => `Node ${node.id}: ${key} ${value}`),
        fix: [`Set ${key} to a positive whole number supported by the selected model.`, "Rerun FrameProof before queueing."],
      });
    }
    const unusual = numericInputs(nodes, key).filter(({ value }) => value > 0 && Number.isInteger(value) && value % 8 !== 0);
    if (unusual.length) {
      addFinding(findings, {
        id: `unaligned-${key}`, severity: "warning", category: "Dimensions", title: `${key[0].toUpperCase() + key.slice(1)} is not divisible by 8`,
        summary: `${unusual.length} value${unusual.length === 1 ? " is" : "s are"} outside a common latent-size alignment.`,
        why: "Many diffusion pipelines expect dimensions aligned to their latent scale. Unsupported sizes can be rounded, rejected, or produce shape errors.",
        confidence: "heuristic", nodes: unusual.map(({ node }) => node.id), evidence: unusual.map(({ node, value }) => `Node ${node.id}: ${key} ${value}`),
        fix: [`Choose a nearby ${key} divisible by 8.`, "Confirm the exact grid required by the checkpoint or video model you use."],
      });
    }
  }

  const widthByNode = new Map(numericInputs(nodes, "width").map(({ node, value }) => [node.id, value]));
  const highResolution = numericInputs(nodes, "height")
    .filter(({ node, value }) => widthByNode.has(node.id) && widthByNode.get(node.id) * value > 2_200_000)
    .map(({ node, value }) => ({ node, height: value, width: widthByNode.get(node.id) }));
  if (highResolution.length) {
    addFinding(findings, {
      id: "high-resolution", severity: "notice", category: "Performance", title: "Large generation dimensions may require substantial VRAM",
      summary: `${highResolution.length} latent size${highResolution.length === 1 ? " exceeds" : "s exceed"} 2.2 million pixels.`,
      why: "Larger latent areas increase memory use and generation time, especially with video batches.",
      confidence: "heuristic", nodes: highResolution.map(({ node }) => node.id),
      evidence: highResolution.map(({ node, width, height }) => `Node ${node.id}: ${width} × ${height}`),
      fix: ["Test a shorter or lower-resolution draft first.", "Use tiled or staged upscaling when the model and node pack support it."],
    });
  }

  const batchInputs = numericInputs(nodes, "batch_size").filter(({ value }) => value > 4);
  if (batchInputs.length) {
    addFinding(findings, {
      id: "large-batch", severity: "notice", category: "Performance", title: "Large batch size may exhaust memory",
      summary: `${batchInputs.length} node${batchInputs.length === 1 ? " requests" : "s request"} more than four outputs in one batch.`,
      why: "Batching multiplies the tensors held in memory.",
      confidence: "heuristic", nodes: batchInputs.map(({ node }) => node.id), evidence: batchInputs.map(({ node, value }) => `Node ${node.id}: batch_size ${value}`),
      fix: ["Run a batch of one first.", "Increase the batch only after measuring VRAM use on the target machine."],
    });
  }

  const invalidDenoise = numericInputs(nodes, "denoise").filter(({ value }) => value < 0 || value > 1);
  if (invalidDenoise.length) {
    addFinding(findings, {
      id: "invalid-denoise", severity: "critical", category: "Sampling", title: "Denoise is outside the supported 0 to 1 range",
      summary: `${invalidDenoise.length} sampler value${invalidDenoise.length === 1 ? " is" : "s are"} invalid.`,
      why: "KSampler denoise is a normalized strength value.",
      nodes: invalidDenoise.map(({ node }) => node.id), evidence: invalidDenoise.map(({ node, value }) => `Node ${node.id}: denoise ${value}`),
      fix: ["Set denoise between 0 and 1.", "Use a lower value to preserve more of an input latent, or 1 for full denoising."],
    });
  }

  const stepValues = numericInputs(nodes, "steps");
  const lowSteps = stepValues.filter(({ value }) => value > 0 && value < 4);
  const extremeSteps = stepValues.filter(({ value }) => value > 80);
  if (lowSteps.length) {
    addFinding(findings, {
      id: "low-steps", severity: "warning", category: "Sampling", title: "Very low sampling steps deserve a quality check",
      summary: `${lowSteps.length} sampler${lowSteps.length === 1 ? " uses" : "s use"} fewer than four steps.`,
      why: "Some distilled models support very few steps, but ordinary checkpoints may produce weak or unfinished results.",
      confidence: "heuristic", nodes: lowSteps.map(({ node }) => node.id), evidence: lowSteps.map(({ node, value }) => `Node ${node.id}: ${value} steps`),
      fix: ["Confirm the checkpoint is designed for low-step sampling.", "Compare a small test at the model author's recommended step count."],
    });
  }
  if (extremeSteps.length) {
    addFinding(findings, {
      id: "high-steps", severity: "notice", category: "Performance", title: "Very high sampling steps may waste render time",
      summary: `${extremeSteps.length} sampler${extremeSteps.length === 1 ? " uses" : "s use"} more than 80 steps.`,
      why: "Past a model-dependent point, more steps often add time without a useful quality gain.",
      confidence: "heuristic", nodes: extremeSteps.map(({ node }) => node.id), evidence: extremeSteps.map(({ node, value }) => `Node ${node.id}: ${value} steps`),
      fix: ["Check the model author's recommended step range.", "Run an A/B test at a lower value before a long queue."],
    });
  }

  const invalidCfg = numericInputs(nodes, "cfg").filter(({ value }) => value <= 0 || value > 20);
  if (invalidCfg.length) {
    addFinding(findings, {
      id: "cfg-range", severity: "warning", category: "Sampling", title: "CFG is outside a common working range",
      summary: `${invalidCfg.length} sampler value${invalidCfg.length === 1 ? " needs" : "s need"} review.`,
      why: "Zero or negative CFG is invalid for common samplers, while very high CFG can burn detail or destabilize results.",
      confidence: "heuristic", nodes: invalidCfg.map(({ node }) => node.id), evidence: invalidCfg.map(({ node, value }) => `Node ${node.id}: cfg ${value}`),
      fix: ["Use the checkpoint author's recommended CFG.", "Test the change on a short, low-cost generation before the full run."],
    });
  }

  const wanNodes = nodes.filter((node) => /\bwan\b/i.test(node.type) || Object.values(node.inputs || {}).some((value) => typeof value === "string" && /\bwan\b/i.test(value)));
  const lengthValues = numericInputs(nodes, "length");
  const badWanLengths = wanNodes.length ? lengthValues.filter(({ value }) => value > 0 && (value - 1) % 4 !== 0) : [];
  if (badWanLengths.length) {
    addFinding(findings, {
      id: "wan-length", severity: "warning", category: "Video profile", title: "Wan frame length does not match the common 4k + 1 rule",
      summary: `${badWanLengths.length} length value${badWanLengths.length === 1 ? " needs" : "s need"} review for this Wan workflow.`,
      why: "Wan video pipelines commonly use lengths such as 49, 81, or 121 so temporal compression aligns cleanly.",
      confidence: "heuristic", nodes: badWanLengths.map(({ node }) => node.id), evidence: badWanLengths.map(({ node, value }) => `Node ${node.id}: length ${value}`),
      fix: ["Choose a nearby value where length = 4k + 1.", "Confirm the exact rule in the custom node or model documentation."],
    });
  }

  const minimaxNodes = nodes.filter((node) => /minimax.*h3|h3.*minimax/i.test(node.type) || Object.values(node.inputs || {}).some((value) => typeof value === "string" && /minimax.*h3|h3.*minimax/i.test(value)));
  const badH3Lengths = minimaxNodes.length ? lengthValues.filter(({ value }) => value >= 5 && (value - 5) % 17 !== 0) : [];
  if (badH3Lengths.length) {
    addFinding(findings, {
      id: "h3-length", severity: "warning", category: "Video profile", title: "MiniMax H3 frame length does not match the common 17k + 5 rule",
      summary: `${badH3Lengths.length} length value${badH3Lengths.length === 1 ? " needs" : "s need"} review for this H3 workflow.`,
      why: "Known H3 workflows use temporal lengths aligned to the model's compression grid.",
      confidence: "heuristic", nodes: badH3Lengths.map(({ node }) => node.id), evidence: badH3Lengths.map(({ node, value }) => `Node ${node.id}: length ${value}`),
      fix: ["Choose a nearby value where length = 17k + 5.", "Confirm the current requirement in the node pack documentation."],
    });
  }

  const samplerNodes = nodes.filter((node) => /sampler/i.test(node.type));
  const seedInputs = nodes.flatMap((node) => ["seed", "noise_seed"].filter((key) => node.inputs?.[key] !== undefined).map((key) => ({ node, key, value: node.inputs[key] })));
  const randomSeeds = seedInputs.filter(({ value }) => Number(value) === -1);
  if (samplerNodes.length && (!seedInputs.length || randomSeeds.length)) {
    addFinding(findings, {
      id: "reproducibility", severity: "notice", category: "Reproducibility", title: "The result may be difficult to reproduce exactly",
      summary: !seedInputs.length ? "No explicit seed was found on the recognized sampler nodes." : `${randomSeeds.length} seed value${randomSeeds.length === 1 ? " uses" : "s use"} -1 for randomization.`,
      why: "A recorded seed makes it easier to reproduce, compare, and debug a generation.",
      confidence: "heuristic", nodes: randomSeeds.map(({ node }) => node.id),
      evidence: randomSeeds.map(({ node, key, value }) => `Node ${node.id}: ${key} ${value}`),
      fix: ["Use a fixed seed while diagnosing the workflow.", "Record the seed with the output or in the exported report."],
    });
  }

  const customTypes = nodeTypes.filter((type) => !CORE_NODE_TYPES.has(type));
  if (customTypes.length) {
    addFinding(findings, {
      id: "custom-node-runtime", severity: "notice", category: "Runtime check", title: "Confirm custom node availability on the target ComfyUI install",
      summary: `${customTypes.length} node type${customTypes.length === 1 ? " is" : "s are"} outside FrameProof's built-in core-node reference list.`,
      why: "A JSON file can name a node class without proving that its extension is installed, compatible, or importable.",
      confidence: "runtime", nodes: findNodeIds(nodes, new RegExp(customTypes.map((type) => type.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")).join("|"))),
      evidence: customTypes.slice(0, 20),
      fix: ["Open ComfyUI Manager and confirm the matching node packs are installed.", "Restart ComfyUI and check the console for import errors.", "Load the workflow and confirm that no nodes appear red or missing."],
    });
  }

  if (assets.length) {
    addFinding(findings, {
      id: "asset-runtime", severity: "notice", category: "Runtime check", title: "Confirm referenced models and assets on the target machine",
      summary: `${assets.length} model or asset reference${assets.length === 1 ? " was" : "s were"} found, but browser-only analysis cannot confirm the files exist.`,
      why: "A valid workflow still fails when a checkpoint, LoRA, VAE, ControlNet, or other asset is missing or placed in the wrong model folder.",
      confidence: "runtime", nodes: [...new Set(assets.map((asset) => asset.nodeId))],
      evidence: assets.slice(0, 20).map((asset) => `${asset.input}: ${asset.value}`),
      fix: ["Compare each listed asset with the target ComfyUI model folders.", "Install missing assets from their trusted source.", "Refresh or restart ComfyUI, then select the installed file in the loader node."],
    });
  }

  const counts = findings.reduce((total, finding) => {
    total[finding.severity] += 1;
    if (finding.confidence === "runtime") total.runtime += 1;
    return total;
  }, { critical: 0, warning: 0, notice: 0, runtime: 0 });
  const score = Math.max(0, Math.min(100, 100 - counts.critical * 20 - counts.warning * 8 - counts.notice * 2));
  const verdict = counts.critical ? "blocked" : counts.warning ? "review" : "ready-for-runtime-check";

  findings.sort((a, b) => severityRank[a.severity] - severityRank[b.severity] || a.title.localeCompare(b.title));

  return {
    schema: "frameproof.comfy-inspection.v1",
    createdAt: options.createdAt || new Date().toISOString(),
    fileName: options.fileName || null,
    format,
    verdict,
    score,
    counts,
    summary: {
      nodeCount: nodes.length,
      connectionCount: edges.length,
      nodeTypeCount: nodeTypes.length,
      outputNodeCount: outputNodes.length,
      assetReferenceCount: assets.length,
    },
    nodeTypes,
    outputNodes: outputNodes.map((node) => ({ id: node.id, type: node.type, title: node.title })),
    assets,
    findings,
    boundaries: [
      "Static JSON inspection does not execute the graph.",
      "Custom node installation, model files, output-slot compatibility, VRAM capacity, and render quality require the target ComfyUI runtime.",
      "A high readiness score is a screening result, not proof that the workflow will run or produce a good image, video, or audio file.",
    ],
  };
}

export function parseAndAnalyzeComfyWorkflow(text, options = {}) {
  let json;
  try {
    json = JSON.parse(text);
  } catch {
    throw new Error("The file is not valid JSON. Check for missing commas, quotes, or braces, then export it again.");
  }
  return analyzeComfyWorkflow(json, options);
}
