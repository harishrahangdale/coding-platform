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
  const [speed, setSpeed] = useState(1); // 0.5 | 1 | 2
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

  // Playback engine refs (not triggering re-renders)
  const isPlayingRef = useRef(false);
  const speedRef = useRef(1);
  const rAFRef = useRef(null);
  const nextTimerRef = useRef(null);

  // Timeline refs
  const timesRef = useRef([]);       // relative times (ms) for each event
  const eventsRef = useRef([]);      // events array
  const playIdxRef = useRef(0);      // next event index to apply
  const baseMsRef = useRef(0);       // virtual time at (re)start
  const startWallRef = useRef(0);    // wall time at (re)start

  const monacoLanguage = useMemo(() => {
    if (!session?.languageId) return "plaintext";
    return JUDGE0_TO_MONACO[session.languageId] || "plaintext";
  }, [session?.languageId]);

  // ---------- Load data ----------
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
      } else {
        timesRef.current = [];
        setDurationMs(0);
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
    const currentVirtual = baseMsRef.current + elapsedWall * (speedRef.current || 1); // <- correct
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
      // finished -> reset so Replay starts from beginning
      isPlayingRef.current = false;
      setIsPlaying(false);
      setEnded(true);
      resetToStart();
      return;
    }

    // current virtual time
    const elapsedWall = Date.now() - startWallRef.current;
    const nowVirtual = baseMsRef.current + elapsedWall * (speedRef.current || 1);

    // catch up overdue events
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

    // next event in REAL ms: (deltaVirtual / speed)
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

  // speed updates while playing
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
    if (isPlayingRef.current) pause(); // pause while dragging, resume with Play
  };
  const onScrubChange = (e) => setDragMs(Number(e.target.value));
  const onScrubMouseUp = () => {
    setDragging(false);
    doSeek(dragMs);
    // Do not auto-play; press Play to resume (like YouTube)
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

  // ---------- UI ----------
  return (
    <div className="h-screen w-full flex bg-gradient-to-br from-slate-50 via-white to-indigo-50">
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
        {/* Frame */}
        <div className="relative flex-1 rounded-2xl overflow-hidden shadow-xl ring-1 ring-slate-200 bg-black">
          <Editor
            height="100%"
            language={monacoLanguage}
            theme="vs-dark"
            value=""
            options={{
              readOnly: true,
              minimap: { enabled: false },
              wordWrap: "on",
              fontSize: 14,
              automaticLayout: true,
            }}
            onMount={(editor, monaco) => {
              editorRef.current = editor;
              monacoRef.current = monaco;
            }}
          />

          {/* Bottom gradient */}
          <div className="pointer-events-none absolute inset-x-0 bottom-0 h-28 bg-gradient-to-t from-black/70 to-transparent" />

          {/* Controls overlay */}
          <div className="absolute inset-x-0 bottom-0 px-4 pb-4 pt-2 flex flex-col gap-3">
            {/* Scrubber */}
            <div className="flex items-center gap-2">
              <span className="text-xs text-white/90 w-12 text-right">
                {fmt(dragging ? dragMs : progressMs)}
              </span>
              <input
                type="range"
                min={0}
                max={Math.max(0, durationMs)}
                step={50}
                value={dragging ? dragMs : progressMs}
                onMouseDown={onScrubMouseDown}
                onChange={onScrubChange}
                onMouseUp={onScrubMouseUp}
                className="w-full accent-indigo-500"
                disabled={!eventsRef.current.length}
              />
              <span className="text-xs text-white/90 w-12">{fmt(durationMs)}</span>
            </div>

            {/* Buttons + Speed */}
            <div className="flex items-center gap-2">
              <button
                onClick={() => {
                  if (!eventsRef.current.length) return;
                  if (ended) { resetToStart(); play(); return; }
                  isPlaying ? pause() : play();
                }}
                className={`px-4 py-2 rounded-lg text-white font-medium ${
                  ended
                    ? "bg-indigo-600 hover:bg-indigo-700"
                    : isPlaying
                    ? "bg-orange-500 hover:bg-orange-600"
                    : "bg-green-600 hover:bg-green-700"
                } transition`}
                disabled={!eventsRef.current.length}
              >
                {ended ? "Replay" : isPlaying ? "Pause" : "Play"}
              </button>

              <button
                onClick={stop}
                className="px-4 py-2 rounded-lg bg-white/10 text-white border border-white/20 hover:bg-white/20 transition"
                disabled={!eventsRef.current.length}
              >
                Stop
              </button>

              <div className="ml-auto flex items-center gap-2 text-white/90 text-sm">
                <span>Speed</span>
                <select
                  className="bg-white/10 text-white rounded px-2 py-1 border border-white/20"
                  value={speed}
                  onChange={(e) => setSpeed(Number(e.target.value))}
                >
                  <option value={0.5}>0.5×</option>
                  <option value={1}>1×</option>
                  <option value={2}>2×</option>
                </select>
              </div>
            </div>
          </div>
        </div>

        {/* Footer hint */}
        <div className="mt-3 text-[11px] text-slate-500">
          Drag the timeline to seek. Press Play to resume from any point.
        </div>
      </div>
    </div>
  );
}