"use client";

import { useEffect, useState } from "react";
import Link from "next/link";

const STORAGE_KEY = "frameproof-validation-v4";
const emptyProspect = (index) => ({
  id: index + 1,
  name: "",
  channel: "",
  status: "Not contacted",
  recurringPain: "",
  pilotInterest: "Unknown",
  paymentSignal: "Unknown",
  notes: "",
});

const initialProspects = () => Array.from({ length: 10 }, (_, index) => emptyProspect(index));

function csvCell(value) {
  return `"${String(value ?? "").replaceAll('"', '""')}"`;
}

export default function ValidationPage() {
  const [prospects, setProspects] = useState(initialProspects);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    let hydratedProspects = initialProspects();
    try {
      const saved = localStorage.getItem(STORAGE_KEY);
      if (saved) {
        const parsed = JSON.parse(saved);
        if (Array.isArray(parsed) && parsed.length === 10) {
          hydratedProspects = parsed;
        }
      }
    } catch {
      // Keep the blank board if local browser data is unavailable or malformed.
    }
    // localStorage is client-only, so hydration is intentionally applied after mount.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setProspects(hydratedProspects);
    setLoaded(true);
  }, []);

  useEffect(() => {
    if (!loaded) return;
    localStorage.setItem(STORAGE_KEY, JSON.stringify(prospects));
  }, [loaded, prospects]);

  function update(id, field, value) {
    setProspects((current) => current.map((prospect) => prospect.id === id ? { ...prospect, [field]: value } : prospect));
  }

  function exportCsv() {
    const headers = ["Slot", "Creator or studio", "Contact channel", "Status", "Recurring pain", "Pilot interest", "Payment signal", "Notes"];
    const rows = prospects.map((prospect) => [
      prospect.id,
      prospect.name,
      prospect.channel,
      prospect.status,
      prospect.recurringPain,
      prospect.pilotInterest,
      prospect.paymentSignal,
      prospect.notes,
    ]);
    const csv = [headers, ...rows].map((row) => row.map(csvCell).join(",")).join("\r\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
    const link = document.createElement("a");
    link.href = URL.createObjectURL(blob);
    link.download = "frameproof-validation-interviews.csv";
    link.click();
    setTimeout(() => URL.revokeObjectURL(link.href), 1000);
  }

  function clearBoard() {
    if (!window.confirm("Clear all ten local validation records? Export a CSV first if you need a copy.")) return;
    localStorage.removeItem(STORAGE_KEY);
    setProspects(Array.from({ length: 10 }, (_, index) => emptyProspect(index)));
  }

  const completed = prospects.filter((prospect) => prospect.status === "Interview complete").length;
  const pilots = prospects.filter((prospect) => prospect.pilotInterest === "Yes").length;
  const paymentSignals = prospects.filter((prospect) => prospect.paymentSignal === "Yes").length;

  return (
    <main className="shell validationPage">
      <header className="topbar">
        <Link className="wordmark" href="/" aria-label="Back to FrameProof">
          <span className="mark" aria-hidden="true">FP</span>
          <span>FRAMEPROOF</span>
        </Link>
        <Link className="backLink" href="/">← SCREENING TOOL</Link>
      </header>

      <section className="validationHero">
        <div>
          <p className="eyebrow">CUSTOMER EVIDENCE / LOCAL ONLY</p>
          <h1>Ten conversations before a checkout button.</h1>
          <p>
            This board keeps the product honest. Record what creators actually lose time on,
            whether they want a pilot, and whether anyone gives a credible payment signal.
            Data stays in this browser unless you export the CSV.
          </p>
        </div>
        <div className="scoreboard">
          <div><strong>{completed}</strong><span>/ 10 interviews</span></div>
          <div><strong>{pilots}</strong><span>/ 3 pilot interests</span></div>
          <div><strong>{paymentSignals}</strong><span>/ 1 payment signal</span></div>
        </div>
      </section>

      <section className="interviewScript">
        <p className="eyebrow">DO NOT PITCH FIRST</p>
        <h2>Interview prompts</h2>
        <ol>
          <li>Walk me through your final review before an AI-generated video is published.</li>
          <li>What defects do you discover late, and how often does that happen?</li>
          <li>Tell me about the last clip you had to regenerate or re-edit. What did it cost in time or money?</li>
          <li>Which checks must stay local or private?</li>
          <li>Would workflow JSON or prompt evidence help you reproduce a failed shot?</li>
          <li>What would a tool need to catch before you would trust it in your release process?</li>
          <li>Would you test this on a real project? If it solved that problem, how would you expect to buy it?</li>
        </ol>
        <p className="scriptBoundary">
          Do not ask “Would you use this?” Treat a real test, a scheduled pilot, or a concrete price discussion as stronger evidence than praise.
        </p>
      </section>

      <section className="tracker">
        <div className="trackerHeader">
          <div>
            <p className="eyebrow">TEN-PERSON VALIDATION BOARD</p>
            <h2>Evidence, not guesses.</h2>
          </div>
          <div className="trackerActions">
            <button className="clearButton" onClick={clearBoard}>CLEAR BOARD</button>
            <button onClick={exportCsv}>EXPORT CSV</button>
          </div>
        </div>

        <div className="prospectList">
          {prospects.map((prospect) => (
            <article className="prospect" key={prospect.id}>
              <div className="prospectNumber">{String(prospect.id).padStart(2, "0")}</div>
              <div className="prospectFields">
                <label>
                  <span>CREATOR / STUDIO</span>
                  <input value={prospect.name} onChange={(event) => update(prospect.id, "name", event.target.value)} placeholder="Name or handle" />
                </label>
                <label>
                  <span>CONTACT CHANNEL</span>
                  <input value={prospect.channel} onChange={(event) => update(prospect.id, "channel", event.target.value)} placeholder="Email, Discord, community…" />
                </label>
                <label>
                  <span>STATUS</span>
                  <select value={prospect.status} onChange={(event) => update(prospect.id, "status", event.target.value)}>
                    <option>Not contacted</option>
                    <option>Contact drafted</option>
                    <option>Contact sent</option>
                    <option>Interview scheduled</option>
                    <option>Interview complete</option>
                    <option>Declined</option>
                  </select>
                </label>
                <label className="wide">
                  <span>RECURRING PAIN IN THEIR WORDS</span>
                  <textarea value={prospect.recurringPain} onChange={(event) => update(prospect.id, "recurringPain", event.target.value)} placeholder="Record the concrete failure, frequency, and cost." />
                </label>
                <label>
                  <span>SERIOUS PILOT INTEREST</span>
                  <select value={prospect.pilotInterest} onChange={(event) => update(prospect.id, "pilotInterest", event.target.value)}>
                    <option>Unknown</option><option>Yes</option><option>No</option>
                  </select>
                </label>
                <label>
                  <span>PAYMENT SIGNAL</span>
                  <select value={prospect.paymentSignal} onChange={(event) => update(prospect.id, "paymentSignal", event.target.value)}>
                    <option>Unknown</option><option>Yes</option><option>No</option>
                  </select>
                </label>
                <label className="wide">
                  <span>NOTES / NEXT STEP</span>
                  <textarea value={prospect.notes} onChange={(event) => update(prospect.id, "notes", event.target.value)} placeholder="Follow-up, objection, requested feature, or exact next action." />
                </label>
              </div>
            </article>
          ))}
        </div>
        <p className="scriptBoundary">
          Use each status literally. “Contact drafted” means the message has not been sent. “Contact sent” records outreach only; it does not mean the recipient replied or agreed to an interview.
        </p>
      </section>

      <section className="outreach">
        <p className="eyebrow">DRAFT — REVIEW BEFORE SENDING</p>
        <h2>Short interview request</h2>
        <blockquote>
          I’m testing a private release-checking tool for people who make videos with ComfyUI or other AI video workflows.
          I’m trying to understand where frozen shots, reused footage, continuity errors, and other late-stage failures cost creators time.
          I’m not selling anything during the call. Would you be open to a 15-minute conversation about how you review a video before publishing?
        </blockquote>
        <p>No outreach has been sent. Jaylan reviews and sends any external message.</p>
      </section>
    </main>
  );
}
