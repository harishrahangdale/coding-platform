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
  const baseMsRef = useRef(0);  // playback time when (re)starting
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
      stopInternal(true);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchList();
  }, []); // eslint-disable-line

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

  const stopInternal = (keepSession = false) => {
    clearTimers();
    isPlayingRef.current = false;
    setIsPlaying(false);
    baseMsRef.current = 0;
    startWallRef.current = 0;
    playIdxRef.current = 0;
    setProgressMs(0);
    if (!keepSession && editorRef.current) editorRef.current.setValue("");
    if (keepSession && editorRef.current) editorRef.current.setValue("");
  };

  const tickProgress = () => {
    if (!isPlayingRef.current) return;
    const elapsedWall = Date.now() - startWallRef.current;
    const curr = baseMsRef.current + elapsedWall * (1 / (speedRef.current || 1));
    setProgressMs(Math.min(curr, durationMs));
    rAFRef.current = requestAnimationFrame(tickProgress);
  };

  // schedule next event application based on timeline
  const scheduleNextEvent = () => {
    const times = timesRef.current;
    const evts = eventsRef.current;
    const i = playIdxRef.current;
    if (!isPlayingRef.current || i >= evts.length) {
      isPlayingRef.current = false;
      setIsPlaying(false);
      return;
    }

    // apply current immediately if we're "behind"
    const currentTargetMs = times[i];
    const currentMs = baseMsRef.current + (Date.now() - startWallRef.current) * (1 / (speedRef.current || 1));
    const deltaNow = currentTargetMs - currentMs;

    const run = () => {
      // we may have skipped multiple events; apply all that are due
      let idx = playIdxRef.current;
      let nowMs = baseMsRef.current + (Date.now() - startWallRef.current) * (1 / (speedRef.current || 1));
      while (idx < evts.length && times[idx] <= nowMs + 1) { // +1ms tolerance
        applyEvent(evts[idx]);
        idx++;
      }
      playIdxRef.current = idx;

      // done?
      if (idx >= evts.length) {
        isPlayingRef.current = false;
        setIsPlaying(false);
        return;
      }

      // schedule next
      const nextTarget = times[idx];
      nowMs = baseMsRef.current + (Date.now() - startWallRef.current) * (1 / (speedRef.current || 1));
      const delay = Math.max(0, (nextTarget - nowMs));
      nextTimerRef.current = setTimeout(scheduleNextEvent, delay);
    };

    if (deltaNow <= 0) {
      // we're already past target — apply immediately
      run();
    } else {
      nextTimerRef.current = setTimeout(run, deltaNow);
    }
  };

  const play = () => {
    if (!eventsRef.current.length) return;
    if (isPlayingRef.current) return;

    // initialize editor if at start
    if (playIdxRef.current === 0 && editorRef.current) {
      editorRef.current.setValue("");
    }

    isPlayingRef.current = true;
    setIsPlaying(true);
    startWallRef.current = Date.now();
    tickProgress();
    scheduleNextEvent();
  };

  const pause = () => {
    if (!isPlayingRef.current) return;
    // capture current progress as new base
    const elapsedWall = Date.now() - startWallRef.current;
    baseMsRef.current = baseMsRef.current + elapsedWall * (1 / (speedRef.current || 1));
    clearTimers();
    isPlayingRef.current = false;
    setIsPlaying(false);
  };

  const stop = () => {
    stopInternal(false);
  };

  // Keep speed ref in sync; if playing, restart timers with new speed baseline
  useEffect(() => {
    speedRef.current = speed;
    if (isPlayingRef.current) {
      // recompute base: current progress becomes new base
      const elapsedWall = Date.now() - startWallRef.current;
      baseMsRef.current = baseMsRef.current + elapsedWall * (1 / (speedRef.current || 1));
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
    // naive rebuild (fast and simple): clear and apply all changes up to idx
    if (!editorRef.current) return;
    const model = editorRef.current.getModel();
    if (!model) return;
    model.pushEditOperations([], [{ range: model.getFullModelRange(), text: "" }], () => null);

    const evts = eventsRef.current;
    const times = timesRef.current;
    // Apply all "change" events up to idx quickly (cursor/selection only for last few for UX)
    for (let i = 0; i <= idx && i < evts.length; i++) {
      const e = evts[i];
      if (e.type === "change") {
        model.applyEdits([{ range: e.range, text: e.text || "", forceMoveMarkers: true }]);
      }
    }
    // Apply cursor/selection for the target idx if present
    if (idx < evts.length && evts[idx].type !== "change") {
      applyEvent(evts[idx]);
    }
  };

  const doSeek = (tms) => {
    const idx = binarySearchIndexForTime(tms);
    rebuildToIndex(idx);
    playIdxRef.current = idx + 1; // next to apply
    baseMsRef.current = tms;
    startWallRef.current = Date.now();
    setProgressMs(tms);
    if (isPlayingRef.current) {
      clearTimers();
      tickProgress();
      scheduleNextEvent();
    }
  };

  const onScrubMouseDown = () => {
    setDragging(true);
    if (isPlayingRef.current) pause(); // pause while dragging
  };
  const onScrubChange = (e) => {
    const v = Number(e.target.value);
    setDragMs(v);
  };
  const onScrubMouseUp = () => {
    setDragging(false);
    doSeek(dragMs);
    // auto-resume after seek if it was playing before drag
    play();
  };

  // When a new session loads, set drag to 0
  useEffect(() => {
    setDragMs(0);
  }, [durationMs]);

  return (
    <div className="h-screen w-full flex">
      {/* Left: session picker */}
      <div className="w-80 border-r p-3 space-y-3 overflow-auto">
        <div className="font-semibold text-lg">Session Replay</div>

        <div className="space-y-2">
          <label className="text-sm">Select session:</label>
          <select
            className="w-full border rounded p-2"
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
          <button
            onClick={() => selSessionId && fetchOne(selSessionId)}
            className="w-full bg-blue-600 text-white rounded p-2 disabled:bg-gray-400"
            disabled={!selSessionId || loading}
          >
            {loading ? "Loading…" : "Load"}
          </button>
          <button onClick={fetchList} className="w-full border rounded p-2">
            Refresh List
          </button>
        </div>

        {session && (
          <div className="text-xs space-y-1">
            <div><b>Candidate:</b> {session.candidate_id}</div>
            <div><b>Test:</b> {session.screening_test_id}</div>
            <div><b>Question:</b> {session.questionId}</div>
            <div><b>LanguageId:</b> {session.languageId}</div>
            <div><b>Events:</b> {session.events?.length || 0}</div>
            <div><b>Created:</b> {new Date(session.createdAt).toLocaleString()}</div>
            <div><b>Duration:</b> {fmt(durationMs)}</div>
          </div>
        )}
      </div>

      {/* Right: player */}
      <div className="flex-1 flex flex-col">
        <div className="p-3 border-b flex items-center gap-3">
          <button
            onClick={() => {
              if (!eventsRef.current.length) return;
              if (isPlaying) pause(); else play();
            }}
            className={`px-3 py-1 rounded text-white ${isPlaying ? "bg-orange-600" : "bg-green-600"}`}
            disabled={!eventsRef.current.length}
          >
            {isPlaying ? "Pause" : "Play"}
          </button>

          <button
            onClick={stop}
            className="px-3 py-1 rounded border"
            disabled={!eventsRef.current.length}
          >
            Stop
          </button>

          <div className="ml-4 flex items-center gap-2">
            <span className="text-sm">Speed</span>
            <select
              className="border rounded px-2 py-1"
              value={speed}
              onChange={(e) => setSpeed(Number(e.target.value))}
            >
              <option value={0.5}>0.5×</option>
              <option value={1}>1×</option>
              <option value={2}>2×</option>
            </select>
          </div>

          <div className="ml-6 flex items-center gap-2 flex-1">
            <span className="text-xs text-gray-600 w-12 text-right">
              {fmt(dragging ? dragMs : progressMs)}
            </span>
            <input
              type="range"
              min={0}
              max={Math.max(0, durationMs)}
              step={50} // 50ms steps
              value={dragging ? dragMs : progressMs}
              onMouseDown={onScrubMouseDown}
              onChange={onScrubChange}
              onMouseUp={onScrubMouseUp}
              className="w-full"
              disabled={!eventsRef.current.length}
            />
            <span className="text-xs text-gray-600 w-12">{fmt(durationMs)}</span>
          </div>
        </div>

        <div className="flex-1">
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
        </div>
      </div>
    </div>
  );
}