"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";

const SAMPLE_WIDTH = 96;
const SAMPLE_HEIGHT = 54;
const MAX_SAMPLES = 96;

function formatBytes(bytes) {
  if (!Number.isFinite(bytes)) return "Unknown";
  const units = ["B", "KB", "MB", "GB"];
  let value = bytes;
  let index = 0;
  while (value >= 1024 && index < units.length - 1) {
    value /= 1024;
    index += 1;
  }
  return `${value.toFixed(index > 1 ? 2 : 1)} ${units[index]}`;
}

function formatDuration(seconds) {
  if (!Number.isFinite(seconds)) return "Unknown";
  const minutes = Math.floor(seconds / 60);
  const remainder = seconds - minutes * 60;
  return `${minutes}:${remainder.toFixed(2).padStart(5, "0")}`;
}

function average(values) {
  return values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : 0;
}

function frameDifference(first, second) {
  let total = 0;
  for (let index = 0; index < first.length; index += 1) {
    total += Math.abs(first[index] - second[index]);
  }
  return total / first.length;
}

function waitForMetadata(video) {
  if (video.readyState >= 1) return Promise.resolve();
  return new Promise((resolve, reject) => {
    video.addEventListener("loadedmetadata", resolve, { once: true });
    video.addEventListener("error", () => reject(new Error("The browser could not read this video.")), { once: true });
  });
}

function seekVideo(video, time) {
  return new Promise((resolve, reject) => {
    const done = () => resolve();
    video.addEventListener("seeked", done, { once: true });
    video.addEventListener("error", () => reject(new Error("A frame could not be sampled.")), { once: true });
    video.currentTime = Math.min(time, Math.max(video.duration - 0.001, 0));
  });
}

function summarizeWorkflow(json) {
  const nodes = Array.isArray(json?.nodes)
    ? json.nodes
    : json && typeof json === "object"
      ? Object.values(json).filter((value) => value && typeof value === "object" && (value.class_type || value.type))
      : [];
  const types = nodes
    .map((node) => node.type || node.class_type)
    .filter(Boolean)
    .map(String);
  const modelNodes = types.filter((type) => /checkpoint|model|lora|vae|clip/i.test(type));
  const outputNodes = types.filter((type) => /save|video|combine|output/i.test(type));
  return {
    nodeCount: nodes.length,
    typeCount: new Set(types).size,
    modelNodes: [...new Set(modelNodes)].slice(0, 8),
    outputNodes: [...new Set(outputNodes)].slice(0, 8),
  };
}

function statusLabel(status) {
  return status === "pass" ? "PASS" : status === "fail" ? "FAIL" : "REVIEW";
}

export default function Home() {
  const [videoFile, setVideoFile] = useState(null);
  const [videoUrl, setVideoUrl] = useState("");
  const [workflowFile, setWorkflowFile] = useState(null);
  const [workflowSummary, setWorkflowSummary] = useState(null);
  const [workflowError, setWorkflowError] = useState("");
  const [report, setReport] = useState(null);
  const [error, setError] = useState("");
  const [progress, setProgress] = useState(0);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [isDragging, setIsDragging] = useState(false);
  const videoRef = useRef(null);
  const canvasRef = useRef(null);

  useEffect(() => {
    return () => {
      if (videoUrl) URL.revokeObjectURL(videoUrl);
    };
  }, [videoUrl]);

  const ready = useMemo(() => Boolean(videoFile && videoUrl && !isAnalyzing), [videoFile, videoUrl, isAnalyzing]);

  function acceptVideo(file) {
    setError("");
    setReport(null);
    if (!file || !file.type.startsWith("video/")) {
      setError("Choose a video file your browser can decode, such as MP4 or WebM.");
      return;
    }
    setVideoFile(file);
    setVideoUrl(URL.createObjectURL(file));
  }

  async function loadDemo() {
    setError("");
    try {
      const response = await fetch("/qa-smoke.mp4");
      if (!response.ok) throw new Error("The demo file could not be loaded.");
      const blob = await response.blob();
      acceptVideo(new File([blob], "frameproof-motion-demo.mp4", { type: "video/mp4" }));
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "The demo file could not be loaded.");
    }
  }

  async function acceptWorkflow(file) {
    setWorkflowError("");
    setWorkflowSummary(null);
    setWorkflowFile(file || null);
    if (!file) return;
    try {
      const json = JSON.parse(await file.text());
      const summary = summarizeWorkflow(json);
      if (!summary.nodeCount) {
        throw new Error("No recognizable ComfyUI nodes were found.");
      }
      setWorkflowSummary(summary);
    } catch (caught) {
      setWorkflowError(caught instanceof Error ? caught.message : "The workflow JSON could not be read.");
    }
  }

  async function analyzeVideo() {
    if (!ready || !videoRef.current || !canvasRef.current) return;
    setError("");
    setReport(null);
    setProgress(0);
    setIsAnalyzing(true);

    try {
      const video = videoRef.current;
      video.src = videoUrl;
      video.load();
      await waitForMetadata(video);
      if (!Number.isFinite(video.duration) || video.duration <= 0) {
        throw new Error("The browser did not report a usable video duration.");
      }

      const canvas = canvasRef.current;
      canvas.width = SAMPLE_WIDTH;
      canvas.height = SAMPLE_HEIGHT;
      const context = canvas.getContext("2d", { willReadFrequently: true });
      const sampleCount = Math.min(MAX_SAMPLES, Math.max(20, Math.ceil(video.duration * 1.25)));
      const frames = [];
      const times = [];
      const brightness = [];

      for (let index = 0; index < sampleCount; index += 1) {
        const time = sampleCount === 1 ? 0 : (video.duration * index) / (sampleCount - 1);
        await seekVideo(video, time);
        context.drawImage(video, 0, 0, SAMPLE_WIDTH, SAMPLE_HEIGHT);
        const pixels = context.getImageData(0, 0, SAMPLE_WIDTH, SAMPLE_HEIGHT).data;
        const grayscale = new Uint8Array(SAMPLE_WIDTH * SAMPLE_HEIGHT);
        let lumaTotal = 0;
        for (let pixel = 0, grayIndex = 0; pixel < pixels.length; pixel += 4, grayIndex += 1) {
          const luma = Math.round(0.2126 * pixels[pixel] + 0.7152 * pixels[pixel + 1] + 0.0722 * pixels[pixel + 2]);
          grayscale[grayIndex] = luma;
          lumaTotal += luma;
        }
        frames.push(grayscale);
        times.push(time);
        brightness.push(lumaTotal / grayscale.length);
        setProgress(Math.round(((index + 1) / sampleCount) * 84));
      }

      const adjacent = [];
      for (let index = 1; index < frames.length; index += 1) {
        adjacent.push(frameDifference(frames[index - 1], frames[index]));
      }

      const blackSamples = brightness
        .map((value, index) => ({ value, time: times[index] }))
        .filter((sample) => sample.value < 5);

      const frozenRuns = [];
      let runStart = null;
      for (let index = 0; index < adjacent.length; index += 1) {
        if (adjacent[index] < 1.8 && runStart === null) runStart = index;
        const runEnded = adjacent[index] >= 1.8 || index === adjacent.length - 1;
        if (runStart !== null && runEnded) {
          const endIndex = adjacent[index] >= 1.8 ? index : index + 1;
          const duration = times[endIndex] - times[runStart];
          if (duration >= 1.5) {
            frozenRuns.push({ start: times[runStart], end: times[endIndex], duration });
          }
          runStart = null;
        }
      }

      const repeatedPairs = [];
      const stride = Math.max(2, Math.floor(frames.length / 24));
      for (let first = 0; first < frames.length; first += stride) {
        for (let second = first + Math.max(3, stride * 2); second < frames.length; second += stride) {
          if (times[second] - times[first] < Math.max(3, video.duration * 0.08)) continue;
          const difference = frameDifference(frames[first], frames[second]);
          if (difference < 0.72) {
            repeatedPairs.push({ first: times[first], second: times[second], difference });
          }
        }
      }

      const findings = [
        {
          id: "decode",
          title: "Browser decode and metadata",
          status: "pass",
          detail: `${video.videoWidth} × ${video.videoHeight}, ${formatDuration(video.duration)}, ${formatBytes(videoFile.size)}.`,
        },
        {
          id: "black",
          title: "Near-black sampled frames",
          status: blackSamples.length > 2 ? "review" : "pass",
          detail: blackSamples.length
            ? `${blackSamples.length} of ${sampleCount} samples were near black. First seen at ${blackSamples[0].time.toFixed(2)}s.`
            : `No near-black frames appeared in ${sampleCount} evenly spaced samples.`,
        },
        {
          id: "motion",
          title: "Long low-motion runs",
          status: frozenRuns.some((run) => run.duration >= 3) ? "fail" : frozenRuns.length ? "review" : "pass",
          detail: frozenRuns.length
            ? frozenRuns.slice(0, 3).map((run) => `${run.start.toFixed(2)}–${run.end.toFixed(2)}s (${run.duration.toFixed(2)}s)`).join("; ")
            : "No sampled low-motion run lasted 1.5 seconds or longer.",
        },
        {
          id: "repeat",
          title: "Possible reused visuals",
          status: repeatedPairs.length ? "review" : "pass",
          detail: repeatedPairs.length
            ? `${repeatedPairs.length} possible non-adjacent visual match${repeatedPairs.length === 1 ? "" : "es"} found. Human review is required because static compositions can be false positives.`
            : "No strong non-adjacent match appeared in the sampled frames.",
        },
        {
          id: "workflow",
          title: "ComfyUI workflow evidence",
          status: workflowSummary ? "pass" : "review",
          detail: workflowSummary
            ? `${workflowSummary.nodeCount} nodes across ${workflowSummary.typeCount} node types; ${workflowSummary.outputNodes.length} output-related node type(s) recognized.`
            : "No workflow JSON was attached. The video can still be screened, but its generation recipe is not evidenced.",
        },
      ];

      const overall = findings.some((finding) => finding.status === "fail")
        ? "fail"
        : findings.some((finding) => finding.status === "review")
          ? "review"
          : "pass";

      setProgress(96);
      setReport({
        schema: "frameproof.local-report.v1",
        createdAt: new Date().toISOString(),
        overall,
        file: {
          name: videoFile.name,
          type: videoFile.type,
          bytes: videoFile.size,
          durationSeconds: video.duration,
          width: video.videoWidth,
          height: video.videoHeight,
        },
        sampling: {
          count: sampleCount,
          frameSize: `${SAMPLE_WIDTH}x${SAMPLE_HEIGHT}`,
          averageBrightness: Number(average(brightness).toFixed(3)),
          averageAdjacentDifference: Number(average(adjacent).toFixed(3)),
          limitation: "Evenly spaced sampled-frame screening can miss short defects between samples.",
        },
        metrics: {
          blackSamples,
          frozenRuns,
          repeatedPairs: repeatedPairs.slice(0, 12),
        },
        workflow: workflowFile
          ? { name: workflowFile.name, summary: workflowSummary, parseError: workflowError || null }
          : null,
        findings,
        humanReviewRequired: [
          "Character and wardrobe consistency",
          "Story-state continuity and scene order",
          "Audio quality, dialogue correctness, and lip sync",
          "Hands, faces, props, text, and physical plausibility",
          "Creative quality and audience suitability",
        ],
      });
      setProgress(100);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "The analysis did not complete.");
    } finally {
      setIsAnalyzing(false);
    }
  }

  function exportReport() {
    if (!report) return;
    const blob = new Blob([JSON.stringify(report, null, 2)], { type: "application/json" });
    const link = document.createElement("a");
    link.href = URL.createObjectURL(blob);
    link.download = `${videoFile.name.replace(/\.[^.]+$/, "")}-frameproof-report.json`;
    link.click();
    setTimeout(() => URL.revokeObjectURL(link.href), 1000);
  }

  return (
    <main className="shell">
      <header className="topbar">
        <a className="wordmark" href="#top" aria-label="FrameProof home">
          <span className="mark" aria-hidden="true">FP</span>
          <span>FRAMEPROOF</span>
        </a>
        <div className="topActions">
          <Link href="/">WORKFLOW INSPECTOR</Link>
          <a href="/validation">VALIDATION KIT</a>
          <div className="privacy"><span aria-hidden="true" /> Browser-local MVP</div>
        </div>
      </header>

      <section className="hero" id="top">
        <div>
          <p className="eyebrow">RELEASE CONTROL / AI VIDEO</p>
          <h1>Catch obvious failures <em>before</em> you publish.</h1>
          <p className="lede">
            Screen a generated video for frozen sections, near-black frames, and possible reused visuals.
            Your source file stays in this browser session.
          </p>
        </div>
        <div className="scope">
          <span>01</span>
          <p><strong>Useful now.</strong> Deterministic first-pass checks and an exportable evidence report.</p>
          <span>02</span>
          <p><strong>Human gate remains.</strong> Identity, story continuity, lip sync, and taste still require review.</p>
        </div>
      </section>

      <section className="workspace" aria-label="Video release screening workspace">
        <div className="inputPanel">
          <label
            className={`dropzone ${isDragging ? "dragging" : ""}`}
            onDragOver={(event) => { event.preventDefault(); setIsDragging(true); }}
            onDragLeave={() => setIsDragging(false)}
            onDrop={(event) => {
              event.preventDefault();
              setIsDragging(false);
              acceptVideo(event.dataTransfer.files?.[0]);
            }}
          >
            <input type="file" accept="video/*" onChange={(event) => acceptVideo(event.target.files?.[0])} />
            <span className="dropIndex">INPUT 01</span>
            <span className="dropIcon" aria-hidden="true">↳</span>
            <strong>{videoFile ? videoFile.name : "Drop a video here"}</strong>
            <small>{videoFile ? `${videoFile.type || "video"} · ${formatBytes(videoFile.size)}` : "or click to choose an MP4 or WebM"}</small>
          </label>
          <button className="demoButton" type="button" onClick={loadDemo}>
            Load the built-in 4-second motion demo
          </button>

          <label className="workflowInput">
            <input type="file" accept=".json,application/json" onChange={(event) => acceptWorkflow(event.target.files?.[0])} />
            <span>
              <b>OPTIONAL INPUT 02</b>
              <strong>{workflowFile ? workflowFile.name : "Attach ComfyUI workflow JSON"}</strong>
            </span>
            <span className="attach">{workflowFile ? "REPLACE" : "ATTACH"}</span>
          </label>
          {workflowSummary && (
            <p className="workflowNote">
              Recognized {workflowSummary.nodeCount} nodes, {workflowSummary.typeCount} types, and {workflowSummary.outputNodes.length} output-related type(s).
            </p>
          )}
          {workflowError && <p className="error">{workflowError}</p>}
          {error && <p className="error" role="alert">{error}</p>}

          <button className="analyzeButton" disabled={!ready} onClick={analyzeVideo}>
            <span>{isAnalyzing ? "SCREENING VIDEO" : "RUN LOCAL SCREEN"}</span>
            <span aria-hidden="true">→</span>
          </button>

          {(isAnalyzing || progress > 0) && (
            <div className="progress" aria-label={`Analysis progress ${progress}%`}>
              <div style={{ width: `${progress}%` }} />
              <span>{progress}%</span>
            </div>
          )}
        </div>

        <aside className="gate">
          <p className="eyebrow">THE RELEASE GATE</p>
          <ol>
            <li><span>1</span><div><strong>Screen</strong><small>Fast browser checks</small></div></li>
            <li><span>2</span><div><strong>Review</strong><small>Creative and continuity pass</small></div></li>
            <li><span>3</span><div><strong>Approve</strong><small>Named human decision</small></div></li>
          </ol>
          <p className="boundary">
            This tool does not upload, render, repair, or publish media. It does not claim full continuity or lip-sync verification.
          </p>
        </aside>
      </section>

      {report && (
        <section className="results" aria-live="polite">
          <div className="resultsHeader">
            <div>
              <p className="eyebrow">SCREENING REPORT</p>
              <h2>{videoFile.name}</h2>
            </div>
            <div className={`verdict ${report.overall}`}>
              <small>RELEASE STATUS</small>
              <strong>{statusLabel(report.overall)}</strong>
            </div>
          </div>

          <div className="findings">
            {report.findings.map((finding) => (
              <article className="finding" key={finding.id}>
                <span className={`statusDot ${finding.status}`} aria-hidden="true" />
                <div>
                  <p>{statusLabel(finding.status)}</p>
                  <h3>{finding.title}</h3>
                  <span>{finding.detail}</span>
                </div>
              </article>
            ))}
          </div>

          <div className="reportActions">
            <p>
              The report records what was sampled and what still needs a person. A “pass” here is a screening result, not final creative approval.
            </p>
            <button onClick={exportReport}>DOWNLOAD JSON REPORT</button>
          </div>
        </section>
      )}

      <section className="roadmap">
        <div>
          <p className="eyebrow">VALIDATION BEFORE SCALE</p>
          <h2>Built from real production failures.</h2>
        </div>
        <div className="roadmapGrid">
          <article><b>NOW</b><strong>Local screening</strong><p>Decode, sampled freeze, black-frame, and repeated-visual checks.</p></article>
          <article><b>NEXT</b><strong>Creator interviews</strong><p>Confirm which failures cost creators the most time and which evidence they will pay to automate.</p></article>
          <article><b>LATER</b><strong>Deeper QA</strong><p>Audio, lip sync, character identity, scene state, and team approvals only after measurable validation.</p></article>
        </div>
      </section>

      <footer>
        <p><strong>FrameProof</strong> is a working title and has not been name-cleared.</p>
        <p>Local video screening · No account · No upload · No payment</p>
      </footer>

      <video ref={videoRef} className="hiddenMedia" muted playsInline preload="metadata" />
      <canvas ref={canvasRef} className="hiddenMedia" />
    </main>
  );
}
