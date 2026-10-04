"use client";

import { useMemo, useRef, useState } from "react";
import Link from "next/link";
import { parseAndAnalyzeComfyWorkflow } from "../lib/analyze-comfy-workflow.mjs";

const DEMO_WORKFLOW = {
  "1": {
    class_type: "CheckpointLoaderSimple",
    inputs: { ckpt_name: "example-model.safetensors" },
    _meta: { title: "Load checkpoint" },
  },
  "2": {
    class_type: "CLIPTextEncode",
    inputs: { text: "cinematic portrait", clip: ["1", 1] },
  },
  "3": {
    class_type: "EmptyLatentImage",
    inputs: { width: 1025, height: 1024, batch_size: 6 },
  },
  "4": {
    class_type: "KSampler",
    inputs: {
      model: ["1", 0], positive: ["2", 0], negative: ["99", 0], latent_image: ["3", 0],
      seed: -1, steps: 90, cfg: 24, sampler_name: "euler", scheduler: "normal", denoise: 1.2,
    },
  },
  "5": {
    class_type: "CustomVideoCombine",
    inputs: { images: ["4", 0], filename_prefix: "" },
  },
};

const FILTERS = [
  ["all", "All findings"],
  ["critical", "Blocking"],
  ["warning", "Warnings"],
  ["runtime", "Runtime checks"],
];

function verdictCopy(verdict) {
  if (verdict === "blocked") return "BLOCKED";
  if (verdict === "review") return "NEEDS REVIEW";
  return "READY FOR RUNTIME CHECK";
}

function severityCopy(severity) {
  if (severity === "critical") return "BLOCKING";
  if (severity === "warning") return "WARNING";
  return "CHECK";
}

function reportSummary(report) {
  const lines = [
    `FrameProof inspection: ${report.fileName || "pasted workflow"}`,
    `Readiness: ${report.score}/100 — ${verdictCopy(report.verdict)}`,
    `Format: ${report.format}`,
    `Graph: ${report.summary.nodeCount} nodes, ${report.summary.connectionCount} connections, ${report.summary.outputNodeCount} outputs`,
    `Findings: ${report.counts.critical} blocking, ${report.counts.warning} warnings, ${report.counts.notice} checks`,
    "",
    ...report.findings.map((finding, index) => `${index + 1}. [${severityCopy(finding.severity)}] ${finding.title}\n   ${finding.summary}`),
    "",
    "Static inspection only. Run the workflow in its target ComfyUI installation to confirm nodes, assets, VRAM, and output quality.",
  ];
  return lines.join("\n");
}

export default function Home() {
  const [sourceText, setSourceText] = useState("");
  const [fileName, setFileName] = useState("");
  const [report, setReport] = useState(null);
  const [error, setError] = useState("");
  const [isDragging, setIsDragging] = useState(false);
  const [filter, setFilter] = useState("all");
  const [copied, setCopied] = useState(false);
  const fileInputRef = useRef(null);

  const filteredFindings = useMemo(() => {
    if (!report) return [];
    if (filter === "all") return report.findings;
    if (filter === "runtime") return report.findings.filter((finding) => finding.confidence === "runtime");
    return report.findings.filter((finding) => finding.severity === filter);
  }, [filter, report]);

  async function readFile(file) {
    if (!file) return;
    setError("");
    setReport(null);
    if (!file.name.toLowerCase().endsWith(".json") && !/json/i.test(file.type || "")) {
      setError("Choose a .json workflow exported from ComfyUI.");
      return;
    }
    try {
      const text = await file.text();
      setSourceText(text);
      setFileName(file.name);
    } catch {
      setError("The browser could not read this file. Try exporting the workflow again.");
    }
  }

  function inspect(text = sourceText, name = fileName) {
    setError("");
    setReport(null);
    setCopied(false);
    if (!text.trim()) {
      setError("Drop a ComfyUI workflow JSON file or paste its JSON first.");
      return;
    }
    try {
      const nextReport = parseAndAnalyzeComfyWorkflow(text, { fileName: name || "pasted-workflow.json" });
      setReport(nextReport);
      setFilter("all");
      requestAnimationFrame(() => document.getElementById("inspection-results")?.scrollIntoView({ behavior: "smooth", block: "start" }));
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "The workflow could not be inspected.");
    }
  }

  function loadDemo() {
    const text = JSON.stringify(DEMO_WORKFLOW, null, 2);
    setSourceText(text);
    setFileName("frameproof-example-with-issues.json");
    setError("");
    setReport(null);
    requestAnimationFrame(() => inspect(text, "frameproof-example-with-issues.json"));
  }

  function downloadReport() {
    if (!report) return;
    const blob = new Blob([JSON.stringify(report, null, 2)], { type: "application/json" });
    const href = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = href;
    link.download = `${(report.fileName || "workflow").replace(/\.json$/i, "")}-frameproof-report.json`;
    link.click();
    setTimeout(() => URL.revokeObjectURL(href), 1000);
  }

  async function copySummary() {
    if (!report) return;
    await navigator.clipboard.writeText(reportSummary(report));
    setCopied(true);
    setTimeout(() => setCopied(false), 1800);
  }

  return (
    <main className="shell inspectorShell">
      <header className="topbar">
        <a className="wordmark" href="#top" aria-label="FrameProof workflow inspector home">
          <span className="mark" aria-hidden="true">FP</span>
          <span>FRAMEPROOF</span>
        </a>
        <nav className="toolNav" aria-label="FrameProof tools">
          <Link className="active" href="/">WORKFLOW INSPECTOR</Link>
          <Link href="/video">VIDEO QA</Link>
          <Link href="/validation">VALIDATION KIT</Link>
        </nav>
        <div className="privacy"><span aria-hidden="true" /> Browser-local</div>
      </header>

      <section className="inspectorHero" id="top">
        <div>
          <p className="eyebrow">COMFYUI WORKFLOW DIAGNOSTICS</p>
          <h1>Know what breaks <em>before</em> you queue it.</h1>
          <p className="lede">
            Drop in a ComfyUI workflow. FrameProof maps the graph, flags likely failures,
            explains the evidence, and gives you a practical repair path.
          </p>
          <div className="heroBadges" aria-label="Supported workflow formats">
            <span>SAVED WORKFLOW JSON</span>
            <span>API PROMPT JSON</span>
            <span>NO UPLOAD</span>
          </div>
        </div>
        <aside className="heroPromise">
          <p className="eyebrow">WHAT YOU GET</p>
          <div><b>01</b><span><strong>Find the problem</strong><small>Broken links, missing inputs, risky settings, and incomplete outputs.</small></span></div>
          <div><b>02</b><span><strong>Understand it</strong><small>Evidence, impact, affected nodes, and confidence are shown separately.</small></span></div>
          <div><b>03</b><span><strong>Fix it</strong><small>Each finding includes clear steps you can follow in ComfyUI.</small></span></div>
        </aside>
      </section>

      <section className="inspectorInput" aria-label="ComfyUI workflow input">
        <div
          className={`workflowDrop ${isDragging ? "dragging" : ""}`}
          role="button"
          tabIndex={0}
          onClick={() => fileInputRef.current?.click()}
          onKeyDown={(event) => { if (event.key === "Enter" || event.key === " ") fileInputRef.current?.click(); }}
          onDragOver={(event) => { event.preventDefault(); setIsDragging(true); }}
          onDragLeave={() => setIsDragging(false)}
          onDrop={(event) => {
            event.preventDefault();
            setIsDragging(false);
            readFile(event.dataTransfer.files?.[0]);
          }}
        >
          <input ref={fileInputRef} type="file" accept=".json,application/json" onChange={(event) => readFile(event.target.files?.[0])} />
          <span className="inputNumber">INPUT / 01</span>
          <span className="workflowGlyph" aria-hidden="true">{"{}"}</span>
          <strong>{fileName || "Drop a ComfyUI workflow here"}</strong>
          <small>{fileName ? "Workflow loaded. Inspect it below or replace the file." : "or click to choose a .json file"}</small>
        </div>

        <div className="pastePanel">
          <div className="pasteHeader">
            <span><b>INPUT / 02</b><strong>Paste workflow JSON</strong></span>
            <button type="button" onClick={loadDemo}>LOAD EXAMPLE WITH ISSUES</button>
          </div>
          <textarea
            aria-label="Paste ComfyUI workflow JSON"
            value={sourceText}
            placeholder={'{\n  "1": {\n    "class_type": "CheckpointLoaderSimple",\n    "inputs": { ... }\n  }\n}'}
            spellCheck="false"
            onChange={(event) => { setSourceText(event.target.value); if (!event.target.value) setFileName(""); }}
          />
          <p className="localNote"><span aria-hidden="true" /> Your workflow stays in this browser. FrameProof does not send it to a server.</p>
        </div>

        {error && <p className="inspectorError" role="alert"><strong>INPUT PROBLEM</strong><span>{error}</span></p>}

        <button className="inspectButton" type="button" onClick={() => inspect()}>
          <span>INSPECT WORKFLOW</span><span aria-hidden="true">→</span>
        </button>
      </section>

      <section className="inspectionScope" aria-label="Inspection scope">
        <article><span>GRAPH</span><strong>Connections and structure</strong><p>Finds missing nodes, broken references, cycles, orphaned branches, and missing outputs.</p></article>
        <article><span>SETTINGS</span><strong>Risky generation values</strong><p>Reviews dimensions, sampling settings, batch size, seeds, and known video alignment rules.</p></article>
        <article><span>RUNTIME</span><strong>What still needs ComfyUI</strong><p>Separates static evidence from checks that require installed nodes, models, VRAM, and a real run.</p></article>
      </section>

      {report && (
        <section className="inspectionResults" id="inspection-results" aria-live="polite">
          <div className="resultOverview">
            <div className={`scoreDial ${report.verdict}`}>
              <span>READINESS</span>
              <strong>{report.score}</strong>
              <small>/ 100</small>
            </div>
            <div className="resultIdentity">
              <p className="eyebrow">INSPECTION REPORT</p>
              <h2>{report.fileName || "Pasted workflow"}</h2>
              <div className={`reportVerdict ${report.verdict}`}>{verdictCopy(report.verdict)}</div>
              <p>
                Static checks are complete. The score measures workflow readiness; it does not prove the graph will run on a specific ComfyUI installation.
              </p>
            </div>
            <dl className="reportStats">
              <div><dt>FORMAT</dt><dd>{report.format}</dd></div>
              <div><dt>NODES</dt><dd>{report.summary.nodeCount}</dd></div>
              <div><dt>CONNECTIONS</dt><dd>{report.summary.connectionCount}</dd></div>
              <div><dt>OUTPUTS</dt><dd>{report.summary.outputNodeCount}</dd></div>
              <div><dt>ASSET REFERENCES</dt><dd>{report.summary.assetReferenceCount}</dd></div>
            </dl>
          </div>

          <div className="findingToolbar">
            <div>
              <p className="eyebrow">PRIORITIZED FINDINGS</p>
              <h2>Fix the blockers first.</h2>
            </div>
            <div className="reportButtons">
              <button type="button" onClick={copySummary}>{copied ? "COPIED" : "COPY SUMMARY"}</button>
              <button type="button" onClick={downloadReport}>DOWNLOAD REPORT</button>
            </div>
          </div>

          <div className="filterBar" aria-label="Filter findings">
            {FILTERS.map(([value, label]) => {
              const count = value === "all" ? report.findings.length : value === "runtime" ? report.counts.runtime : report.counts[value] || 0;
              return <button className={filter === value ? "active" : ""} key={value} onClick={() => setFilter(value)}>{label}<span>{count}</span></button>;
            })}
          </div>

          <div className="diagnosticList">
            {filteredFindings.length ? filteredFindings.map((finding, index) => (
              <article className={`diagnosticCard ${finding.severity}`} key={finding.id}>
                <div className="diagnosticRail">
                  <span>{String(index + 1).padStart(2, "0")}</span>
                  <i aria-hidden="true" />
                </div>
                <div className="diagnosticBody">
                  <div className="diagnosticMeta">
                    <span>{severityCopy(finding.severity)}</span>
                    <span>{finding.category}</span>
                    <span>{finding.confidence === "runtime" ? "REQUIRES RUNTIME" : `${finding.confidence.toUpperCase()} CONFIDENCE`}</span>
                  </div>
                  <h3>{finding.title}</h3>
                  <p className="diagnosticSummary">{finding.summary}</p>

                  <div className="diagnosticGrid">
                    <div>
                      <h4>WHY IT MATTERS</h4>
                      <p>{finding.why}</p>
                      {finding.evidence.length > 0 && <><h4>EVIDENCE</h4><ul className="evidenceList">{finding.evidence.map((item) => <li key={item}>{item}</li>)}</ul></>}
                    </div>
                    <div className="fixPanel">
                      <h4>HOW TO FIX IT</h4>
                      <ol>{finding.fix.map((step) => <li key={step}>{step}</li>)}</ol>
                    </div>
                  </div>

                  {finding.nodes.length > 0 && <p className="affectedNodes"><b>AFFECTED NODES</b> {finding.nodes.slice(0, 16).join(", ")}</p>}
                </div>
              </article>
            )) : (
              <div className="emptyFindings"><strong>No findings in this filter.</strong><span>Choose another category to see the rest of the report.</span></div>
            )}
          </div>

          <div className="inventoryGrid">
            <article>
              <p className="eyebrow">NODE INVENTORY</p>
              <h3>{report.summary.nodeTypeCount} recognized types</h3>
              <div className="tokenList">{report.nodeTypes.map((type) => <span key={type}>{type}</span>)}</div>
            </article>
            <article>
              <p className="eyebrow">ASSET INVENTORY</p>
              <h3>{report.assets.length ? `${report.assets.length} references to verify` : "No named assets found"}</h3>
              {report.assets.length ? <ul className="assetList">{report.assets.map((asset, index) => <li key={`${asset.nodeId}-${asset.input}-${index}`}><b>{asset.input}</b><span>{asset.value}</span><small>Node {asset.nodeId} · {asset.nodeType}</small></li>)}</ul> : <p className="inventoryEmpty">Some saved-workflow files keep widget values in a positional list, so named assets may require a live ComfyUI check.</p>}
            </article>
          </div>

          <div className="runtimeBoundary">
            <p className="eyebrow">THE HONEST BOUNDARY</p>
            <h2>FrameProof can inspect the file. ComfyUI must prove the run.</h2>
            <ul>{report.boundaries.map((boundary) => <li key={boundary}>{boundary}</li>)}</ul>
          </div>
        </section>
      )}

      <section className="nextTool">
        <div><p className="eyebrow">AFTER THE WORKFLOW RUNS</p><h2>Check the output, too.</h2><p>Use FrameProof Video QA for sampled black-frame, freeze, and repeated-visual screening before release.</p></div>
        <Link href="/video">OPEN VIDEO QA <span aria-hidden="true">→</span></Link>
      </section>

      <footer>
        <p><strong>FrameProof</strong> is a working title and has not been name-cleared.</p>
        <p>Local inspection · No account · No upload · No payment</p>
      </footer>
    </main>
  );
}
