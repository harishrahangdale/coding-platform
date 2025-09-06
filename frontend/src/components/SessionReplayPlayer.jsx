import React, { useEffect, useMemo, useRef, useState } from "react";
import Editor from "@monaco-editor/react";
import axios from "axios";

const JUDGE0_TO_MONACO = { 50: "c", 54: "cpp", 62: "java", 63: "javascript", 71: "python" };
const PAUSE_THRESHOLD_MS = 10_000; // >= 10s -> show pause band

function fmt(ms) {
  if (ms == null || Number.isNaN(ms)) return "0:00";
  const totalSec = Math.max(0, Math.floor(ms / 1000));
  const m = Math.floor(totalSec / 60);
  const s = totalSec % 60;
  return `${m}:${s.toString().padStart(2, "0")}`;
}

export default function SessionReplayPlayer({ sessionId, apiBaseUrl }) {
  
  // Data
  const [session, setSession] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

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

  // Playback engine refs
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

  // Marker state
  const [pauseMarkers, setPauseMarkers] = useState([]); // [{start, end, mid, dur}]
  const [runMarkers, setRunMarkers] = useState([]);     // [{t, kind}] kind: pass|compile|fail

  const monacoLanguage = useMemo(() => {
    if (!session?.languageId) return "plaintext";
    return JUDGE0_TO_MONACO[session.languageId] || "plaintext";
  }, [session?.languageId]);

  // ---------- Data load ----------
  const fetchSession = async () => {
    if (!sessionId) return;
    
    setLoading(true);
    try {
      // sessionId is actually a submissionId, so we need to get the submission first
      const submissionResponse = await axios.get(`${apiBaseUrl}/submissions/${sessionId}`);
      const submission = submissionResponse.data;
      
      if (!submission || !submission.candidate_id || !submission.questionId) {
        throw new Error('Invalid submission data');
      }
      
      // Find matching session by candidate_id and questionId
      const sessionsResponse = await axios.get(`${apiBaseUrl}/editor-sessions`, {
        params: {
          candidate_id: submission.candidate_id,
          questionId: submission.questionId._id
        }
      });
      
      console.log('Looking for session with:', {
        candidate_id: submission.candidate_id,
        questionId: submission.questionId._id
      });
      console.log('Available sessions:', sessionsResponse.data.sessions);
      
      const matchingSession = sessionsResponse.data.sessions.find(s => 
        s.candidate_id === submission.candidate_id && 
        s.questionId === submission.questionId._id
      );
      
      if (!matchingSession) {
        console.error('No matching session found. Available sessions:', sessionsResponse.data.sessions);
        throw new Error('No matching session found');
      }
      
      console.log('Found matching session:', matchingSession);
      
      const ses = matchingSession;
      setSession(ses);

      const evts = ses?.events || [];
      eventsRef.current = evts;
      
      if (evts.length) {
        // Events should have relative timestamps already
        const times = evts.map((e) => e.t);
        timesRef.current = times;
        setDurationMs(times[times.length - 1] || 0);
        computePauseMarkers(evts, times);
      } else {
        timesRef.current = [];
        setDurationMs(0);
        setPauseMarkers([]);
      }

      setRunMarkers([]);
      fetchSubmissionMarkers(ses);
      resetToStart();
      
      // Apply events to show initial state
      setTimeout(() => {
        if (editorRef.current && eventsRef.current.length > 0) {
          const times = timesRef.current;
          const evts = eventsRef.current;
          const currentTime = progressMs;
          
          // Apply all events up to current time (or all events if currentTime is 0)
          const maxTime = currentTime > 0 ? currentTime : times[times.length - 1];
          for (let i = 0; i < evts.length && times[i] <= maxTime; i++) {
            applyEvent(evts[i]);
          }
        }
      }, 100);
    } catch (error) {
      console.error('Failed to fetch session:', error);
      console.error('Error details:', error.response?.data || error.message);
      setError(error.message);
    } finally {
      setLoading(false);
    }
  };

  const fetchSubmissionMarkers = async (ses) => {
    try {
      const params = new URLSearchParams({
        candidate_id: ses.candidate_id || "",
        screening_test_id: ses.screening_test_id || "",
        questionId: ses.questionId || "",
        sessionId: ses.sessionId || "",
      }).toString();
      const url = `${apiBaseUrl}/submissions/markers?${params}`;
      const { data } = await axios.get(url);
      const arr = Array.isArray(data?.markers) ? data.markers : [];
      setRunMarkers(arr.map(m => ({ t: Number(m.t) || 0, kind: m.kind || "fail", meta: m.meta || null })));
    } catch {
      setRunMarkers([]);
    }
  };

  const computePauseMarkers = (evts, relTimes) => {
    // Use only "change" events to detect idle gaps
    const idxs = [];
    for (let i = 0; i < evts.length; i++) {
      if (evts[i].type === "change") idxs.push(i);
    }
    const out = [];
    for (let j = 0; j < idxs.length - 1; j++) {
      const a = relTimes[idxs[j]];
      const b = relTimes[idxs[j + 1]];
      const gap = b - a;
      if (gap >= PAUSE_THRESHOLD_MS) {
        out.push({ start: a, end: b, dur: gap, mid: a + gap / 2 });
      }
    }
    setPauseMarkers(out);
  };

  useEffect(() => {
    fetchSession();
  }, [sessionId]);

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
    if (editorRef.current) {
      editorRef.current.setValue("");
      // Apply events up to current progress position
      if (eventsRef.current.length > 0) {
        const times = timesRef.current;
        const evts = eventsRef.current;
        const currentTime = progressMs;
        
        // Apply all events up to current time
        for (let i = 0; i < evts.length && times[i] <= currentTime; i++) {
          applyEvent(evts[i]);
        }
      }
    }
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

  // Color for run markers
  const runColor = (kind) =>
    kind === "pass" ? "bg-green-500" : kind === "compile" ? "bg-red-500" : "bg-orange-500";

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-lg text-gray-600">Loading session replay...</div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-lg text-red-600">Error: {error}</div>
      </div>
    );
  }

  if (!session) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-lg text-gray-600">No session data available</div>
      </div>
    );
  }

  if (!eventsRef.current.length) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-lg text-gray-600">No events recorded for this session</div>
      </div>
    );
  }

  return (
    <div className="w-full h-full flex flex-col bg-gradient-to-br from-slate-50 via-white to-indigo-50">
      {/* Player area */}
      <div className="flex-1 flex flex-col p-6">
        {/* Frame */}
        <div className="relative flex-1 rounded-2xl overflow-hidden shadow-xl ring-1 ring-slate-200 bg-black" style={{ height: '500px' }}>
          <Editor
            height="500px"
            language={monacoLanguage}
            theme="vs-dark"
            value=""
            options={{
              readOnly: true,
              minimap: { enabled: false },
              wordWrap: "on",
              fontSize: 14,
              automaticLayout: true,
              scrollBeyondLastLine: false,
              scrollbar: {
                vertical: 'auto',
                horizontal: 'auto',
                verticalScrollbarSize: 8,
                horizontalScrollbarSize: 8,
              },
            }}
            onMount={(editor, monaco) => {
              editorRef.current = editor;
              monacoRef.current = monaco;
              
              // Wait for editor to be fully ready
              setTimeout(() => {
                // Apply events up to current progress position
                if (eventsRef.current.length > 0) {
                  const times = timesRef.current;
                  const evts = eventsRef.current;
                  const currentTime = progressMs;
                  
                  // Apply all events up to current time
                  for (let i = 0; i < evts.length && times[i] <= currentTime; i++) {
                    applyEvent(evts[i]);
                  }
                }
              }, 100);
            }}
          />

          {/* Bottom gradient */}
          <div className="pointer-events-none absolute inset-x-0 bottom-0 h-28 bg-gradient-to-t from-black/70 to-transparent" />

          {/* Controls overlay */}
          <div className="absolute inset-x-0 bottom-0 px-4 pb-4 pt-2 flex flex-col gap-3">

            {/* --- Unified Timeline with Markers --- */}
            <div className="relative w-full h-6 group">
              {/* Background track */}
              <div className="absolute inset-0 rounded-full bg-white/15" />

              {/* Pause markers as bands */}
              {pauseMarkers.map((m, i) => (
                <div
                  key={`pause-${i}`}
                  className="absolute top-[2px] h-[4px] rounded-full bg-yellow-400/80 border border-yellow-300/60"
                  style={{
                    left: `${Math.min(98, Math.max(0, pct(m.start)))}%`,
                    width: `${Math.max(0.5, pct(m.dur))}%`,
                  }}
                  title={`Long Pause: ${fmt(m.dur)} at ${fmt(m.start)}–${fmt(m.end)}`}
                />
              ))}

              {/* Run markers (colored dots) */}
              {runMarkers.map((r, i) => (
                <div
                  key={`run-${i}`}
                  className={`absolute top-1 h-3 w-3 rounded-full border-2 border-white shadow-sm ${runColor(r.kind)}`}
                  style={{ left: `${Math.min(99, Math.max(0, pct(Math.min(r.t, durationMs))))}%` }}
                  title={
                    r.kind === "pass"
                      ? `✓ Run Passed @ ${fmt(r.t)} (Score: ${r.meta?.score || 0}/${r.meta?.maxScore || 0})`
                      : r.kind === "compile"
                      ? `✗ Compilation Error @ ${fmt(r.t)}`
                      : `⚠ Run Failed @ ${fmt(r.t)} (Score: ${r.meta?.score || 0}/${r.meta?.maxScore || 0})`
                  }
                />
              ))}

              {/* Progress fill */}
              <div
                className="absolute top-0 left-0 h-6 rounded-full bg-gradient-to-r from-blue-500 to-cyan-400 transition-all duration-75"
                style={{ width: `${Math.min(100, Math.max(0, pct(progressMs)))}%` }}
              />

              {/* Hover preview */}
              {dragging && (
                <div
                  className="absolute top-0 h-6 rounded-full bg-white/30 border-2 border-white/50"
                  style={{ width: `${Math.min(100, Math.max(0, pct(dragMs)))}%` }}
                />
              )}

              {/* Current position indicator */}
              <div
                className="absolute top-0 h-6 w-1 bg-white rounded-full shadow-lg border border-gray-300"
                style={{ left: `${Math.min(99.5, Math.max(0, pct(dragging ? dragMs : progressMs)))}%` }}
              />

              {/* Interactive area */}
              <div
                className="absolute inset-0 cursor-pointer"
                onMouseDown={onScrubMouseDown}
                onMouseUp={onScrubMouseUp}
              />
            </div>

            {/* Time Display */}
            <div className="flex items-center justify-between text-xs text-white/90 px-1">
              <span>{fmt(dragging ? dragMs : progressMs)}</span>
              <span className="text-white/70">Drag timeline to seek • Space/K to play-pause • J/L or ←/→ to seek</span>
              <span>{fmt(durationMs)}</span>
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

      </div>

      {/* Legend Section */}
      <div className="bg-white/95 backdrop-blur-sm border-t border-gray-200 p-4">
        <div className="max-w-4xl mx-auto">
          <h4 className="text-sm font-semibold text-gray-800 mb-3 flex items-center">
            <svg className="w-4 h-4 mr-2 text-indigo-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
            Timeline Legend
          </h4>
          
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
            {/* Pause Markers */}
            <div className="flex items-center space-x-3">
              <div className="w-4 h-2 rounded-full bg-yellow-400 border border-yellow-300"></div>
              <div>
                <div className="text-sm font-medium text-gray-700">Long Pause</div>
                <div className="text-xs text-gray-500">≥10 seconds of inactivity</div>
              </div>
            </div>

            {/* Run Passed */}
            <div className="flex items-center space-x-3">
              <div className="w-3 h-3 rounded-full bg-green-500 border-2 border-white shadow-sm"></div>
              <div>
                <div className="text-sm font-medium text-gray-700">Run Passed</div>
                <div className="text-xs text-gray-500">✓ All test cases passed</div>
              </div>
            </div>

            {/* Compilation Error */}
            <div className="flex items-center space-x-3">
              <div className="w-3 h-3 rounded-full bg-red-500 border-2 border-white shadow-sm"></div>
              <div>
                <div className="text-sm font-medium text-gray-700">Compilation Error</div>
                <div className="text-xs text-gray-500">✗ Code failed to compile</div>
              </div>
            </div>

            {/* Run Failed */}
            <div className="flex items-center space-x-3">
              <div className="w-3 h-3 rounded-full bg-orange-500 border-2 border-white shadow-sm"></div>
              <div>
                <div className="text-sm font-medium text-gray-700">Run Failed</div>
                <div className="text-xs text-gray-500">⚠ Some test cases failed</div>
              </div>
            </div>
          </div>

          {/* Additional Info */}
          <div className="mt-3 pt-3 border-t border-gray-200">
            <div className="flex flex-wrap items-center gap-4 text-xs text-gray-600">
              <div className="flex items-center space-x-1">
                <div className="w-2 h-2 rounded-full bg-blue-500"></div>
                <span>Progress bar shows playback position</span>
              </div>
              <div className="flex items-center space-x-1">
                <div className="w-1 h-4 bg-white rounded-full border border-gray-300"></div>
                <span>White line indicates current time</span>
              </div>
              <div className="flex items-center space-x-1">
                <span className="text-indigo-600 font-medium">Hover</span>
                <span>over markers for detailed information</span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}