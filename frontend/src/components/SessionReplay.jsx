import React, { useEffect, useMemo, useRef, useState } from "react";
import Editor from "@monaco-editor/react";
import axios from "axios";

const JUDGE0_TO_MONACO = { 50: "c", 54: "cpp", 62: "java", 63: "javascript", 71: "python" };

export default function SessionReplay({ apiBaseUrl, sessionId: propSessionId, filters = {} }) {
  const [session, setSession] = useState(null);
  const [sessions, setSessions] = useState([]);
  const [loading, setLoading] = useState(false);
  const [selSessionId, setSelSessionId] = useState(propSessionId || "");
  const [speed, setSpeed] = useState(1); // 0.5 | 1 | 2
  const [isPlaying, setIsPlaying] = useState(false);
  const [progressIdx, setProgressIdx] = useState(0);

  const editorRef = useRef(null);
  const monacoRef = useRef(null);
  const timerRef = useRef(null);
  const startTsRef = useRef(null);
  const pauseTsRef = useRef(null);

  const monacoLanguage = useMemo(() => {
    if (!session?.languageId) return "plaintext";
    return JUDGE0_TO_MONACO[session.languageId] || "plaintext";
  }, [session?.languageId]);

  // load a specific session
  const fetchOne = async (sid) => {
    setLoading(true);
    try {
      const { data } = await axios.get(`${apiBaseUrl}/editor-sessions/${sid}`);
      setSession(data.session);
      setProgressIdx(0);
      setIsPlaying(false);
      // reset editor
      if (editorRef.current) {
        editorRef.current.setValue("");
      }
    } finally {
      setLoading(false);
    }
  };

  // list sessions for quick selection
  const fetchList = async () => {
    const params = new URLSearchParams(filters).toString();
    const url = `${apiBaseUrl}/editor-sessions${params ? `?${params}` : ""}`;
    const { data } = await axios.get(url);
    setSessions(data.sessions || []);
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

  // apply one event to monaco model
  const applyEvent = (e) => {
    if (!editorRef.current) return;
    const model = editorRef.current.getModel();
    if (!model) return;

    if (e.type === "change") {
      // translate event to edit
      model.applyEdits([{
        range: e.range,
        text: e.text || "",
        forceMoveMarkers: true,
      }]);
    } else if (e.type === "cursor" && e.position) {
      editorRef.current.setPosition(e.position);
      editorRef.current.revealPositionInCenter(e.position);
    } else if (e.type === "selection" && e.selection) {
      editorRef.current.setSelection(e.selection);
      editorRef.current.revealRangeInCenter(e.selection);
    }
  };

  // play loop using event timestamps
  const playFrom = (startIdx = 0) => {
    if (!session?.events?.length) return;
    setIsPlaying(true);
    const evts = session.events;
    startTsRef.current = evts[startIdx]?.t ?? Date.now();
    pauseTsRef.current = null;

    const tick = (i) => {
      if (!isPlaying || i >= evts.length) {
        setIsPlaying(false);
        return;
      }
      const now = Date.now();
      const base = evts[i].t - startTsRef.current; // elapsed (recorded)
      const nextAt = Date.now() + Math.max(0, base / speed - (now - (timerRef.current?.startedAt || now)));

      // schedule this event
      const delay = Math.max(0, nextAt - now);
      timerRef.current = { id: setTimeout(() => {
        applyEvent(evts[i]);
        setProgressIdx(i + 1);
        tick(i + 1);
      }, delay), startedAt: now };
    };
    // kick
    timerRef.current = { id: setTimeout(() => {
      applyEvent(evts[startIdx]);
      setProgressIdx(startIdx + 1);
      tick(startIdx + 1);
    }, 0), startedAt: Date.now() };
  };

  const pause = () => {
    setIsPlaying(false);
    if (timerRef.current?.id) clearTimeout(timerRef.current.id);
    pauseTsRef.current = Date.now();
  };

  const stop = () => {
    setIsPlaying(false);
    if (timerRef.current?.id) clearTimeout(timerRef.current.id);
    setProgressIdx(0);
    if (editorRef.current) editorRef.current.setValue("");
  };

  const handleSeek = (idx) => {
    // Rebuild document to the given index quickly
    if (!session?.events?.length || !editorRef.current) return;
    const model = editorRef.current.getModel();
    model.pushEditOperations([], [{ range: model.getFullModelRange(), text: "" }], () => null);
    setIsPlaying(false);
    if (timerRef.current?.id) clearTimeout(timerRef.current.id);

    // naive fast-forward: apply changes up to idx
    for (let i = 0; i < idx; i++) {
      applyEvent(session.events[i]);
    }
    setProgressIdx(idx);
  };

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
          <button
            onClick={fetchList}
            className="w-full border rounded p-2"
          >
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
          </div>
        )}
      </div>

      {/* Right: editor & controls */}
      <div className="flex-1 flex flex-col">
        <div className="p-3 border-b flex items-center gap-2">
          <button
            onClick={() => {
              if (!session?.events?.length) return;
              if (isPlaying) pause(); else playFrom(progressIdx);
            }}
            className={`px-3 py-1 rounded text-white ${isPlaying ? "bg-orange-600" : "bg-green-600"}`}
            disabled={!session?.events?.length}
          >
            {isPlaying ? "Pause" : "Play"}
          </button>
          <button
            onClick={stop}
            className="px-3 py-1 rounded border"
            disabled={!session?.events?.length}
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

          <div className="ml-4 flex items-center gap-2">
            <span className="text-sm">Seek</span>
            <input
              type="range"
              min={0}
              max={Math.max(0, (session?.events?.length || 1) - 1)}
              value={progressIdx}
              onChange={(e) => handleSeek(Number(e.target.value))}
              className="w-64"
              disabled={!session?.events?.length}
            />
            <span className="text-xs">
              {progressIdx}/{Math.max(0, (session?.events?.length || 1) - 1)}
            </span>
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