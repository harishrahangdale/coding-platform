import React, { useEffect, useMemo, useRef, useState } from "react";
import Editor from "@monaco-editor/react";
import axios from "axios";

const JUDGE0_TO_MONACO = { 50: "c", 54: "cpp", 62: "java", 63: "javascript", 71: "python" };

function fmt(ms) {
  if (ms == null || Number.isNaN(ms)) return "0:00";
  const totalSec = Math.max(0, Math.floor(ms / 1000));
  const m = Math.floor(totalSec / 60);
  const s = totalSec % 60;
  return `${m}:${s.toString().padStart(2, "0")}`;
}

export default function SessionReplay({ apiBaseUrl, sessionId: propSessionId, filters = {} }) {
  // Data
  const [session, setSession] = useState(null);
  const [sessions, setSessions] = useState([]);
  const [loading, setLoading] = useState(false);
  const [selSessionId, setSelSessionId] = useState(propSessionId || "");

  // Playback
  const [speed, setSpeed] = useState(1);
  const [isPlaying, setIsPlaying] = useState(false);
  const [ended, setEnded] = useState(false);

  const [progressMs, setProgressMs] = useState(0);
  const [durationMs, setDurationMs] = useState(0);

  // Scrubber
  const [dragging, setDragging] = useState(false);
  const [dragMs, setDragMs] = useState(0);

  // Monaco
  const editorRef = useRef(null);
  const monacoRef = useRef(null);

  // Playback engine refs
  const isPlayingRef = useRef(false);
  const speedRef = useRef(1);
  const rAFRef = useRef(null);
  const nextTimerRef = useRef(null);

  // Timeline refs
  const timesRef = useRef([]);
  const eventsRef = useRef([]);
  const playIdxRef = useRef(0);
  const baseMsRef = useRef(0);
  const startWallRef = useRef(0);

  // Marker state
  const [pauseMarkers, setPauseMarkers] = useState([]);
  const [runMarkers, setRunMarkers] = useState([]);

  const monacoLanguage = useMemo(() => {
    if (!session?.languageId) return "plaintext";
    return JUDGE0_TO_MONACO[session.languageId] || "plaintext";
  }, [session?.languageId]);

  // ---------- Data load ----------
  const fetchList = async () => {
    const params = new URLSearchParams(filters).toString();
    const url = `${apiBaseUrl}/editor-sessions${params ? `?${params}` : ""}`;
    const { data } = await axios.get(url);
    setSessions(data.sessions || []);
  };

  const fetchOne = async (sid) => {
    setLoading(true);
    try {
      const { data } = await axios.get(`${apiBaseUrl}/editor-sessions/${sid}`);
      const ses = data.session;
      setSession(ses);

      const evts = ses?.events || [];
      eventsRef.current = evts;

      if (evts.length) {
        const t0 = evts[0].t;
        const times = evts.map((e) => e.t - t0);
        timesRef.current = times;
        setDurationMs(times[times.length - 1] || 0);

        // build pause markers from pause events
        const pauseEvts = evts.filter((e) => e.type === "pause");
        setPauseMarkers(
          pauseEvts.map((e) => ({
            start: e.t - t0,
            end: (e.t - t0) + (Number(e.dur) || 0),
            dur: Number(e.dur) || 0,
          }))
        );

        // build run markers from run_result events
        const runEvts = evts.filter((e) => e.type === "run_result");
        setRunMarkers(
          runEvts.map((e) => {
            const dt = e.t - t0;
            let kind = "fail";
            if (e.status === "passed") kind = "pass";
            else if (e.status === "compile_error") kind = "compile";
            else if (e.status === "runtime_error") kind = "fail";
            else if (e.status === "failed") kind = "fail";
            return { t: dt, kind, meta: e.message || null };
          })
        );
      } else {
        timesRef.current = [];
        setDurationMs(0);
        setPauseMarkers([]);
        setRunMarkers([]);
      }

      resetToStart();
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetchList(); }, []); // eslint-disable-line
  useEffect(() => {
    if (propSessionId) {
      setSelSessionId(propSessionId);
      fetchOne(propSessionId);
    }
  }, [propSessionId]); // eslint-disable-line

  // ---------- Monaco apply ----------
  const applyEvent = (e) => {
    if (!editorRef.current) return;
    const model = editorRef.current.getModel();
    if (!model) return;

    if (e.type === "change") {
      model.applyEdits([{ range: e.range, text: e.text || "", forceMoveMarkers: true }]);
    } else if (e.type === "cursor" && e.position) {
      editorRef.current.setPosition(e.position);
      editorRef.current.revealPositionInCenter(e.position);
    } else if (e.type === "selection" && e.selection) {
      editorRef.current.setSelection(e.selection);
      editorRef.current.revealRangeInCenter(e.selection);
    }
  };

  // ---------- Playback engine ----------
  const clearTimers = () => {
    if (rAFRef.current) cancelAnimationFrame(rAFRef.current);
    rAFRef.current = null;
    if (nextTimerRef.current) clearTimeout(nextTimerRef.current);
    nextTimerRef.current = null;
  };

  const resetToStart = () => {
    clearTimers();
    isPlayingRef.current = false;
    setIsPlaying(false);
    setEnded(false);
    baseMsRef.current = 0;
    startWallRef.current = 0;
    playIdxRef.current = 0;
    setProgressMs(0);
    setDragMs(0);
    if (editorRef.current) editorRef.current.setValue("");
  };

  const tickProgress = () => {
    if (!isPlayingRef.current) return;
    const elapsedWall = Date.now() - startWallRef.current;
    const currentVirtual = baseMsRef.current + elapsedWall * (speedRef.current || 1);
    setProgressMs(Math.min(currentVirtual, durationMs));
    rAFRef.current = requestAnimationFrame(tickProgress);
  };

  const scheduleNextEvent = () => {
    const times = timesRef.current;
    const evts = eventsRef.current;
    const i = playIdxRef.current;

    if (!isPlayingRef.current || !evts.length) {
      isPlayingRef.current = false;
      setIsPlaying(false);
      return;
    }

    if (i >= evts.length) {
      isPlayingRef.current = false;
      setIsPlaying(false);
      setEnded(true);
      resetToStart();
      return;
    }

    const elapsedWall = Date.now() - startWallRef.current;
    const nowVirtual = baseMsRef.current + elapsedWall * (speedRef.current || 1);

    while (playIdxRef.current < evts.length && times[playIdxRef.current] <= nowVirtual + 1) {
      applyEvent(evts[playIdxRef.current]);
      playIdxRef.current += 1;
    }
    if (playIdxRef.current >= evts.length) {
      isPlayingRef.current = false;
      setIsPlaying(false);
      setEnded(true);
      resetToStart();
      return;
    }

    const nextTarget = times[playIdxRef.current];
    const deltaVirtual = Math.max(0, nextTarget - nowVirtual);
    const realDelay = Math.max(0, deltaVirtual / (speedRef.current || 1));
    nextTimerRef.current = setTimeout(() => {
      if (playIdxRef.current < evts.length) {
        applyEvent(evts[playIdxRef.current]);
        playIdxRef.current += 1;
      }
      scheduleNextEvent();
    }, realDelay);
  };

  const play = () => {
    if (!eventsRef.current.length) return;
    if (ended) resetToStart();
    if (playIdxRef.current === 0 && editorRef.current) editorRef.current.setValue("");
    isPlayingRef.current = true;
    setIsPlaying(true);
    setEnded(false);
    startWallRef.current = Date.now();
    tickProgress();
    scheduleNextEvent();
  };

  const pause = () => {
    if (!isPlayingRef.current) return;
    const elapsedWall = Date.now() - startWallRef.current;
    baseMsRef.current = baseMsRef.current + elapsedWall * (speedRef.current || 1);
    clearTimers();
    isPlayingRef.current = false;
    setIsPlaying(false);
  };

  const stop = () => resetToStart();

  useEffect(() => {
    speedRef.current = speed;
    if (isPlayingRef.current) {
      const elapsedWall = Date.now() - startWallRef.current;
      baseMsRef.current = baseMsRef.current + elapsedWall * (speedRef.current || 1);
      startWallRef.current = Date.now();
      clearTimers();
      tickProgress();
      scheduleNextEvent();
    }
  }, [speed, durationMs]);

  useEffect(() => () => clearTimers(), []);

  // ---------- Seeking ----------
  const binarySearchIndexForTime = (tms) => {
    const times = timesRef.current;
    if (!times.length) return 0;
    let lo = 0, hi = times.length - 1, ans = 0;
    while (lo <= hi) {
      const mid = (lo + hi) >> 1;
      if (times[mid] <= tms) { ans = mid; lo = mid + 1; } else { hi = mid - 1; }
    }
    return ans;
  };

  const rebuildToIndex = (idx) => {
    if (!editorRef.current) return;
    const model = editorRef.current.getModel();
    if (!model) return;
    model.pushEditOperations([], [{ range: model.getFullModelRange(), text: "" }], () => null);
    const evts = eventsRef.current;
    for (let i = 0; i <= idx && i < evts.length; i++) {
      const e = evts[i];
      if (e.type === "change") model.applyEdits([{ range: e.range, text: e.text || "", forceMoveMarkers: true }]);
    }
    if (idx < evts.length && evts[idx].type !== "change") applyEvent(evts[idx]);
  };

  const doSeek = (tms) => {
    const clamped = Math.min(Math.max(tms, 0), durationMs);
    const idx = binarySearchIndexForTime(clamped);
    rebuildToIndex(idx);
    playIdxRef.current = idx + 1;
    baseMsRef.current = clamped;
    startWallRef.current = Date.now();
    setProgressMs(clamped);
    setEnded(false);
  };

  const onScrubMouseDown = () => {
    setDragging(true);
    if (isPlayingRef.current) pause();
  };
  const onScrubChange = (e) => setDragMs(Number(e.target.value));
  const onScrubMouseUp = () => {
    setDragging(false);
    doSeek(dragMs);
  };

  useEffect(() => { setDragMs(0); }, [durationMs]);

  // ---------- Keyboard shortcuts ----------
  const seekBy = (deltaMs) => {
    if (!eventsRef.current.length) return;
    const current = dragging ? dragMs : progressMs;
    doSeek(current + deltaMs);
  };
  const togglePlay = () => { isPlaying ? pause() : play(); };
  const seekToPercent = (p) => { if (eventsRef.current.length) doSeek(Math.round(durationMs * p)); };

  useEffect(() => {
    const isTypingElement = (el) => {
      if (!el) return false;
      const tag = el.tagName?.toLowerCase();
      return tag === "input" || tag === "textarea" || el.isContentEditable || tag === "select";
    };

    const onKeyDown = (e) => {
      if (isTypingElement(document.activeElement)) return;

      const k = e.key.toLowerCase();

      if (e.code === "Space" || k === "k") { e.preventDefault(); togglePlay(); return; }
      if (k === "j" || e.key === "ArrowLeft") { e.preventDefault(); seekBy(e.shiftKey ? -10000 : -5000); return; }
      if (k === "l" || e.key === "ArrowRight") { e.preventDefault(); seekBy(e.shiftKey ? 10000 : 5000); return; }
      if (e.key === "Home") { e.preventDefault(); doSeek(0); return; }
      if (e.key === "End") { e.preventDefault(); doSeek(durationMs); return; }
      if (/^[0-9]$/.test(e.key)) { e.preventDefault(); seekToPercent(Number(e.key) / 10); return; }
    };

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [isPlaying, progressMs, durationMs, dragging]);

  // ---------- UI helpers: markers ----------
  const pct = (t) => (durationMs > 0 ? (t / durationMs) * 100 : 0);

  const runColor = (kind) =>
    kind === "pass" ? "bg-green-500" : kind === "compile" ? "bg-red-500" : "bg-orange-400";

  return (
    <div className="h-screen w-full flex bg-gradient-to-br from-slate-50 via-white to-indigo-50">
      {/* Sidebar */}
      {/* Sidebar */}
      <div className="w-84 max-w-[22rem] border-r bg-white/80 backdrop-blur-sm">
        <div className="p-5 border-b bg-white">
          <div className="flex items-center justify-between">
            <div className="text-lg font-semibold text-slate-800">Session Replay</div>
            <span className="text-xs text-slate-500">{sessions.length} sessions</span>
          </div>
        </div>

        <div className="p-5 space-y-5">
          <div className="space-y-2">
            <label className="text-sm font-medium text-slate-700">Select session</label>
            <select
              className="w-full border rounded-lg px-3 py-2 bg-white focus:outline-none focus:ring-2 focus:ring-indigo-200"
              value={selSessionId}
              onChange={(e) => setSelSessionId(e.target.value)}
            >
              <option value="">— choose —</option>
              {sessions.map((s) => (
                <option key={s.sessionId} value={s.sessionId}>
                  {s.sessionId} • {new Date(s.createdAt).toLocaleString()}
                </option>
              ))}
            </select>
            <div className="flex gap-2">
              <button
                onClick={() => selSessionId && fetchOne(selSessionId)}
                className="flex-1 bg-indigo-600 text-white rounded-lg px-3 py-2 disabled:bg-gray-400 hover:bg-indigo-700 transition"
                disabled={!selSessionId || loading}
              >
                {loading ? "Loading…" : "Load"}
              </button>
              <button
                onClick={fetchList}
                className="border rounded-lg px-3 py-2 hover:bg-slate-50 transition"
              >
                Refresh
              </button>
            </div>
          </div>

          {session && (
            <>
              <div className="rounded-xl border bg-white p-4 shadow-sm">
                <div className="text-sm font-medium text-slate-800 mb-2">Details</div>
                <div className="text-xs space-y-1 text-slate-600">
                  <div><b>Candidate:</b> {session.candidate_id}</div>
                  <div><b>Test:</b> {session.screening_test_id}</div>
                  <div><b>Question:</b> {session.questionId}</div>
                  <div><b>LanguageId:</b> {session.languageId}</div>
                  <div><b>Events:</b> {session.events?.length || 0}</div>
                  <div><b>Duration:</b> {fmt(durationMs)}</div>
                  <div><b>Created:</b> {new Date(session.createdAt).toLocaleString()}</div>
                </div>
              </div>

              <div className="rounded-xl border bg-white p-4 shadow-sm space-y-1">
                <div className="text-sm font-medium text-slate-800 mb-2">Legend</div>
                <div className="text-xs text-slate-600 flex flex-wrap gap-3">
                  <span className="inline-flex items-center gap-1">
                    <span className="w-3 h-3 rounded bg-orange-300"></span> Long pause (≥10s)
                  </span>
                  <span className="inline-flex items-center gap-1">
                    <span className="w-3 h-3 rounded bg-green-500"></span> Run passed
                  </span>
                  <span className="inline-flex items-center gap-1">
                    <span className="w-3 h-3 rounded bg-red-500"></span> Compile error
                  </span>
                  <span className="inline-flex items-center gap-1">
                    <span className="w-3 h-3 rounded bg-orange-400"></span> Runtime/failed
                  </span>
                </div>
              </div>
            </>
          )}

          <div className="rounded-xl border bg-white p-4 shadow-sm">
            <div className="text-sm font-medium text-slate-800 mb-2">Shortcuts</div>
            <div className="text-xs text-slate-600">
              Space/K = Play/Pause • J/← = −5s • L/→ = +5s • Shift+←/→ = ±10s • 0–9 = jump • Home/End
            </div>
          </div>
        </div>
      </div>
      {/* Player area */}
      <div className="flex-1 flex flex-col p-6">
        <div className="relative flex-1 rounded-2xl overflow-hidden shadow-xl ring-1 ring-slate-200 bg-black">
          <Editor
            height="100%"
            language={monacoLanguage}
            theme="vs-dark"
            value=""
            options={{ readOnly: true, minimap: { enabled: false }, wordWrap: "on", fontSize: 14, automaticLayout: true }}
            onMount={(editor, monaco) => { editorRef.current = editor; monacoRef.current = monaco; }}
          />

          <div className="pointer-events-none absolute inset-x-0 bottom-0 h-28 bg-gradient-to-t from-black/70 to-transparent" />

          <div className="absolute inset-x-0 bottom-0 px-4 pb-4 pt-2 flex flex-col gap-3">
            {/* Marker Track */}
            <div className="relative w-full h-3 mb-0.5">
              <div className="absolute inset-0 rounded-full bg-white/15" />

              {pauseMarkers.map((m, i) => (
                <div key={`pause-${i}`} className="absolute top-[2px] h-[8px] rounded bg-orange-300/80"
                  style={{ left: `${pct(m.start)}%`, width: `${pct(m.dur)}%` }}
                  title={`Pause ${fmt(m.dur)} at ${fmt(m.start)}–${fmt(m.end)}`} />
              ))}

              {runMarkers.map((r, i) => (
                <div key={`run-${i}`} className={`absolute top-0 h-3 w-[3px] ${runColor(r.kind)} rounded-sm`}
                  style={{ left: `${pct(r.t)}%` }}
                  title={
                    r.kind === "pass"
                      ? `Run passed @ ${fmt(r.t)}`
                      : r.kind === "compile"
                      ? `Compilation error @ ${fmt(r.t)}`
                      : `Run failed @ ${fmt(r.t)}`
                  } />
              ))}

              <div className="absolute top-0 h-3 w-[2px] bg-white rounded-sm shadow-[0_0_6px_rgba(255,255,255,0.8)]"
                style={{ left: `${pct(dragging ? dragMs : progressMs)}%` }} />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
