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
  const [session, setSession] = useState(null);
  const [sessions, setSessions] = useState([]);
  const [loading, setLoading] = useState(false);
  const [selSessionId, setSelSessionId] = useState(propSessionId || "");

  const [speed, setSpeed] = useState(1); // 0.5 | 1 | 2
  const [isPlaying, setIsPlaying] = useState(false);
  const [ended, setEnded] = useState(false);

  // Progress (ms) relative to first event timestamp
  const [progressMs, setProgressMs] = useState(0);
  const [durationMs, setDurationMs] = useState(0);

  // Scrubber drag
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

  // timeline
  const timesRef = useRef([]); // relative ms timeline
  const eventsRef = useRef([]); // events array
  const playIdxRef = useRef(0); // next event index to apply
  const baseMsRef = useRef(0);  // virtual ms at (re)start
  const startWallRef = useRef(0); // wall-clock ms when started

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

      // build relative timeline
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

      // reset player/editor
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
      model.applyEdits([
        {
          range: e.range,
          text: e.text || "",
          forceMoveMarkers: true,
        },
      ]);
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

  // schedule next event application based on timeline
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
      // finished
      isPlayingRef.current = false;
      setIsPlaying(false);
      setEnded(true);
      // auto-reset so Play starts from beginning
      resetToStart();
      return;
    }

    // current virtual time
    const elapsedWall = Date.now() - startWallRef.current;
    const nowVirtual = baseMsRef.current + elapsedWall * (speedRef.current || 1);

    // Apply any overdue events (catch up)
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

    // Next event delay in REAL ms: (targetVirtual - currentVirtual) / speed
    const nextTarget = times[playIdxRef.current];
    const deltaVirtual = Math.max(0, nextTarget - nowVirtual);
    const realDelay = Math.max(0, deltaVirtual / (speedRef.current || 1));

    nextTimerRef.current = setTimeout(() => {
      // apply the event (in case it’s exactly due)
      if (playIdxRef.current < evts.length) {
        applyEvent(evts[playIdxRef.current]);
        playIdxRef.current += 1;
      }
      scheduleNextEvent();
    }, realDelay);
  };

  const play = () => {
    if (!eventsRef.current.length) return;

    // If we just ended and auto-reset to start, ensure editor is empty
    if (ended) {
      resetToStart();
    }

    // If starting from scratch, clear editor so events reconstruct content
    if (playIdxRef.current === 0 && editorRef.current) {
      editorRef.current.setValue("");
    }

    isPlayingRef.current = true;
    setIsPlaying(true);
    setEnded(false);
    startWallRef.current = Date.now();
    tickProgress();
    scheduleNextEvent();
  };

  const pause = () => {
    if (!isPlayingRef.current) return;
    // capture current progress as new base
    const elapsedWall = Date.now() - startWallRef.current;
    baseMsRef.current = baseMsRef.current + elapsedWall * (speedRef.current || 1);
    clearTimers();
    isPlayingRef.current = false;
    setIsPlaying(false);
  };

  const stop = () => {
    resetToStart();
  };

  // Keep speed ref in sync; if playing, restart timers with new speed baseline
  useEffect(() => {
    speedRef.current = speed;
    if (isPlayingRef.current) {
      const elapsedWall = Date.now() - startWallRef.current;
      // recompute base so progress remains continuous
      baseMsRef.current = baseMsRef.current + elapsedWall * (speedRef.current || 1);
      startWallRef.current = Date.now();
      clearTimers();
      tickProgress();
      scheduleNextEvent();
    }
  }, [speed, durationMs]);

  // Cleanup on unmount
  useEffect(() => () => clearTimers(), []);

  // ---------- Seeking ----------
  const binarySearchIndexForTime = (tms) => {
    const times = timesRef.current;
    if (!times.length) return 0;
    let lo = 0, hi = times.length - 1, ans = 0;
    while (lo <= hi) {
      const mid = (lo + hi) >> 1;
      if (times[mid] <= tms) {
        ans = mid;
        lo = mid + 1;
      } else hi = mid - 1;
    }
    return ans;
  };

  const rebuildToIndex = (idx) => {
    if (!editorRef.current) return;
    const model = editorRef.current.getModel();
    if (!model) return;
    // clear
    model.pushEditOperations([], [{ range: model.getFullModelRange(), text: "" }], () => null);

    const evts = eventsRef.current;
    for (let i = 0; i <= idx && i < evts.length; i++) {
      const e = evts[i];
      if (e.type === "change") {
        model.applyEdits([{ range: e.range, text: e.text || "", forceMoveMarkers: true }]);
      }
    }
    // apply last non-change UX event if any
    if (idx < evts.length && evts[idx].type !== "change") {
      applyEvent(evts[idx]);
    }
  };

  const doSeek = (tms) => {
    const idx = binarySearchIndexForTime(tms);
    rebuildToIndex(idx);
    playIdxRef.current = idx + 1;
    baseMsRef.current = tms;
    startWallRef.current = Date.now();
    setProgressMs(tms);
  };

  const onScrubMouseDown = () => {
    setDragging(true);
    if (isPlayingRef.current) pause(); // pause while dragging
  };
  const onScrubChange = (e) => setDragMs(Number(e.target.value));
  const onScrubMouseUp = () => {
    setDragging(false);
    doSeek(dragMs);
    // do not auto-play; mimic typical players: press Play to continue
  };

  // When a new session loads, set drag to 0
  useEffect(() => { setDragMs(0); }, [durationMs]);

  // ---------- UI ----------
  return (
    <div className="h-screen w-full flex bg-gray-50">
      {/* Sidebar */}
      <div className="w-80 border-r p-4 space-y-4 bg-white">
        <div className="flex items-center justify-between">
          <div className="font-semibold text-lg">Session Replay</div>
          <span className="text-xs text-gray-500">{sessions.length} sessions</span>
        </div>

        <div className="space-y-2">
          <label className="text-sm font-medium text-gray-700">Select session</label>
          <select
            className="w-full border rounded px-2 py-2 bg-white"
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
              className="flex-1 bg-indigo-600 text-white rounded px-3 py-2 disabled:bg-gray-400 hover:bg-indigo-700 transition"
              disabled={!selSessionId || loading}
            >
              {loading ? "Loading…" : "Load"}
            </button>
            <button
              onClick={fetchList}
              className="border rounded px-3 py-2 hover:bg-gray-100 transition"
            >
              Refresh
            </button>
          </div>
        </div>

        {session && (
          <div className="text-xs space-y-1 bg-gray-50 border rounded p-3">
            <div><b>Candidate:</b> {session.candidate_id}</div>
            <div><b>Test:</b> {session.screening_test_id}</div>
            <div><b>Question:</b> {session.questionId}</div>
            <div><b>LanguageId:</b> {session.languageId}</div>
            <div><b>Events:</b> {session.events?.length || 0}</div>
            <div><b>Duration:</b> {fmt(durationMs)}</div>
            <div><b>Created:</b> {new Date(session.createdAt).toLocaleString()}</div>
          </div>
        )}
      </div>

      {/* Player area */}
      <div className="flex-1 flex flex-col p-6">
        <div className="flex items-center justify-between mb-3">
          <div className="text-lg font-medium text-gray-800">Playback</div>
        </div>

        {/* Video frame (editor + overlay controls) */}
        <div className="relative flex-1 rounded-xl overflow-hidden shadow ring-1 ring-gray-200 bg-black">
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

          {/* Gradient overlay at bottom */}
          <div className="pointer-events-none absolute inset-x-0 bottom-0 h-24 bg-gradient-to-t from-black/60 to-transparent" />

          {/* Controls bar (inside frame) */}
          <div className="absolute inset-x-0 bottom-0 px-4 pb-3 pt-2 flex flex-col gap-2">
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

            {/* Buttons */}
            <div className="flex items-center gap-2">
              <button
                onClick={() => {
                  if (!eventsRef.current.length) return;
                  if (isPlaying) pause();
                  else play();
                }}
                className={`px-3 py-1.5 rounded text-white ${
                  isPlaying ? "bg-orange-500 hover:bg-orange-600" : "bg-green-600 hover:bg-green-700"
                } transition`}
                disabled={!eventsRef.current.length}
              >
                {ended ? "Replay" : isPlaying ? "Pause" : "Play"}
              </button>
              <button
                onClick={stop}
                className="px-3 py-1.5 rounded bg-white/10 text-white border border-white/20 hover:bg-white/20 transition"
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

        {/* Help text */}
        <div className="mt-3 text-xs text-gray-500">
          Tip: Drag the timeline to seek; press Play to resume from any point.
        </div>
      </div>
    </div>
  );
}