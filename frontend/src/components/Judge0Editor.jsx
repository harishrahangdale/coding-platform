import React, { useState, useEffect, useMemo, useRef } from "react";
import Editor from "@monaco-editor/react";
import axios from "axios";

const JUDGE0_TO_MONACO = {
  50: "c",
  54: "cpp",
  62: "java",
  63: "javascript",
  71: "python",
};

const attemptsKey = (questionId) => `attempts:${questionId}`;
const CAND_ID_KEY = "ctx:candidate_id";
const TEST_ID_KEY = "ctx:screening_test_id";

// ---------- helpers: diagnostics ----------
function parseErrorToMarkers(msg = "", language = "plaintext") {
  const markers = [];
  const text = String(msg);

  const push = (line = 1, column = 1, message = text) =>
    markers.push({
      startLineNumber: Math.max(1, Number(line) || 1),
      startColumn: Math.max(1, Number(column) || 1),
      endLineNumber: Math.max(1, Number(line) || 1),
      endColumn: Math.max(2, Number(column) || 1) + 1,
      message,
      severity: 8, // monaco.MarkerSeverity.Error
    });

  // Java/C/C++: "...:12: error: ..."
  let m = text.match(/:[ ]?(\d+):/);
  if (m) { push(Number(m[1]), 1, text); return markers; }

  // Java stack: "(Class.java:123)"
  m = text.match(/\((.+?):(\d+)\)/);
  if (m) { push(Number(m[2]), 1, text); return markers; }

  // Python: File "stdin", line 5
  m = text.match(/File ".*?", line (\d+)/);
  if (m) { push(Number(m[1]), 1, text); return markers; }

  // Node: <anonymous>:12:5
  m = text.match(/<anonymous>:(\d+):(\d+)/);
  if (m) { push(Number(m[1]), Number(m[2]), text); return markers; }

  push(1, 1, text);
  return markers;
}

// ---------- helpers: ids (stable randoms) ----------
function getOrCreate(ctxKey, prefix) {
  let v = localStorage.getItem(ctxKey);
  if (!v) {
    v = `${prefix}_${Math.random().toString(36).slice(2, 10)}${Date.now().toString(36)}`;
    localStorage.setItem(ctxKey, v);
  }
  return v;
}
function newSessionId() {
  return `sess_${Math.random().toString(36).slice(2)}_${Date.now()}`;
}

export default function Judge0Editor({
  apiBaseUrl,
  selectedQuestion,
  onRunStart,
  onRunFinish,
}) {
  // Demo context IDs (persisted); replace with real IDs when integrated
  const candidateId = useRef(getOrCreate(CAND_ID_KEY, "cand")).current;
  const screeningTestId = useRef(getOrCreate(TEST_ID_KEY, "test")).current;

  const [languageId, setLanguageId] = useState(null);
  const [theme, setTheme] = useState("vs");
  const [code, setCode] = useState("");
  const [isRunning, setIsRunning] = useState(false);

  // attempts UI state
  const [attemptsUsed, setAttemptsUsed] = useState(0);
  const maxAttempts = selectedQuestion?.maxAttempts ?? 3;
  const remaining = Math.max(0, maxAttempts - attemptsUsed);
  const attemptsExhausted = remaining <= 0;

  // footer panel (output) ui
  const [footerOpen, setFooterOpen] = useState(false);
  const [activeTab, setActiveTab] = useState("visible"); // 'visible' | 'custom' | 'results'

  // data for footer tabs
  const [visibleTests, setVisibleTests] = useState([]); // {index,input,expected,score}
  const [vtLoading, setVtLoading] = useState(false);

  const [customInput, setCustomInput] = useState("");
  const [customResult, setCustomResult] = useState(null); // {stdout, stderr, time, memory, status}
  const [customLoading, setCustomLoading] = useState(false);

  const [results, setResults] = useState([]); // from /run (all cases)
  const [publicResults, setPublicResults] = useState([]); // visible only
  const [summary, setSummary] = useState(null);

  // Monaco/editor refs for diagnostics
  const editorRef = useRef(null);
  const monacoRef = useRef(null);

  // AUTOSAVE state
  const [saveState, setSaveState] = useState("idle"); // idle | saving | saved | error
  const [lastSavedAt, setLastSavedAt] = useState(null);
  const saveTimerRef = useRef(null);
  const lastSavedPayloadRef = useRef("");

  // SESSION REPLAY (Option A) state/refs
  const sessionIdRef = useRef(null);
  const eventBufferRef = useRef([]);
  const flushTimerRef = useRef(null);

  const monacoLanguage = useMemo(() => {
    if (!languageId) return "plaintext";
    return JUDGE0_TO_MONACO[languageId] || "plaintext";
  }, [languageId]);

  // Reset language, attempts, output data when question changes
  useEffect(() => {
    if (!selectedQuestion?._id) return;

    const langs = selectedQuestion.languages || [];
    const defaultLangId = langs.length ? langs[0].languageId : 62;
    setLanguageId(defaultLangId);

    const used = Number(localStorage.getItem(attemptsKey(selectedQuestion._id)) || 0);
    setAttemptsUsed(isNaN(used) ? 0 : used);

    setCode("");
    setFooterOpen(false);
    setActiveTab("visible");
    setVisibleTests([]);
    setCustomInput("");
    setCustomResult(null);
    setResults([]);
    setPublicResults([]);
    setSummary(null);
    setSaveState("idle");
    setLastSavedAt(null);

    // Clear any stale diagnostics when switching questions
    if (editorRef.current && monacoRef.current) {
      monacoRef.current.editor.setModelMarkers(editorRef.current.getModel(), "judge", []);
    }
  }, [selectedQuestion?._id]);

  // Load DRAFT first; if none, load SCAFFOLD (on question/language change)
  useEffect(() => {
    const loadDraftOrScaffold = async () => {
      if (!selectedQuestion?._id || !languageId) return;

      // Start a fresh editor session for replay logging
      sessionIdRef.current = newSessionId();
      eventBufferRef.current = [];

      // Try draft first
      try {
        const { data } = await axios.get(`${apiBaseUrl}/draft`, {
          params: {
            candidate_id: candidateId,
            screening_test_id: screeningTestId,
            questionId: selectedQuestion._id,
            languageId,
          },
        });
        if (data?.draft?.code != null) {
          setCode(data.draft.code);
        } else {
          // Fallback to scaffold
          const { data: s } = await axios.get(
            `${apiBaseUrl}/questions/${selectedQuestion._id}/scaffold/${languageId}`
          );
          setCode(s?.body || "");
        }
      } catch {
        // Fallback to scaffold on any error
        try {
          const { data: s } = await axios.get(
            `${apiBaseUrl}/questions/${selectedQuestion._id}/scaffold/${languageId}`
          );
          setCode(s?.body || "");
        } catch {
          setCode("");
        }
      }

      // Clear markers when language changes
      if (editorRef.current && monacoRef.current) {
        monacoRef.current.editor.setModelMarkers(editorRef.current.getModel(), "judge", []);
      }
    };
    loadDraftOrScaffold();
  }, [selectedQuestion?._id, languageId, apiBaseUrl, candidateId, screeningTestId]);

  // Start/stop periodic FLUSH for session replay buffer (every 3s)
  useEffect(() => {
    if (!selectedQuestion?._id || !languageId) return;

    if (flushTimerRef.current) clearInterval(flushTimerRef.current);
    flushTimerRef.current = setInterval(async () => {
      const buf = eventBufferRef.current;
      if (!buf.length) return;
      eventBufferRef.current = [];
      try {
        await axios.post(`${apiBaseUrl}/editor-events`, {
          sessionId: sessionIdRef.current,
          candidate_id: candidateId,
          screening_test_id: screeningTestId,
          questionId: selectedQuestion._id,
          languageId,
          events: buf,
        });
      } catch (e) {
        // Re-queue events on failure so we don't lose them
        eventBufferRef.current.unshift(...buf);
      }
    }, 3000);

    return () => {
      if (flushTimerRef.current) clearInterval(flushTimerRef.current);
    };
  }, [selectedQuestion?._id, languageId, apiBaseUrl, candidateId, screeningTestId]);

  // Flush remaining events on unload
  useEffect(() => {
    const handler = () => {
      const buf = eventBufferRef.current;
      if (!buf.length) return;
      try {
        navigator.sendBeacon?.(
          `${apiBaseUrl}/editor-events`,
          new Blob([JSON.stringify({
            sessionId: sessionIdRef.current,
            candidate_id: candidateId,
            screening_test_id: screeningTestId,
            questionId: selectedQuestion?._id,
            languageId,
            events: buf,
          })], { type: "application/json" })
        );
      } catch {}
    };
    window.addEventListener("beforeunload", handler);
    return () => window.removeEventListener("beforeunload", handler);
  }, [apiBaseUrl, candidateId, screeningTestId, selectedQuestion?._id, languageId]);

  const persistAttempts = (qId, next) => {
    localStorage.setItem(attemptsKey(qId), String(next));
  };

  // Apply diagnostics to Monaco
  const applyDiagnostics = (messages = []) => {
    if (!editorRef.current || !monacoRef.current) return;
    const model = editorRef.current.getModel();
    const markers = messages.flatMap((msg) =>
      parseErrorToMarkers(msg, monacoLanguage)
    );
    monacoRef.current.editor.setModelMarkers(model, "judge", markers.slice(0, 200)); // safety cap
  };

  const clearDiagnostics = () => {
    if (!editorRef.current || !monacoRef.current) return;
    monacoRef.current.editor.setModelMarkers(editorRef.current.getModel(), "judge", []);
  };

  // ---------------- AUTOSAVE (debounced) ----------------
  useEffect(() => {
    if (!selectedQuestion?._id || !languageId) return;

    const payloadKey = `${selectedQuestion._id}|${languageId}|${code}`;
    if (lastSavedPayloadRef.current === payloadKey) return; // no-op if same content

    if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    setSaveState("idle");

    saveTimerRef.current = setTimeout(async () => {
      try {
        setSaveState("saving");
        await axios.post(`${apiBaseUrl}/save-draft`, {
          candidate_id: candidateId,
          screening_test_id: screeningTestId,
          questionId: selectedQuestion._id,
          languageId,
          code,
        });
        lastSavedPayloadRef.current = payloadKey;
        setSaveState("saved");
        setLastSavedAt(new Date());
      } catch {
        setSaveState("error");
      }
    }, 1200); // 1.2s after typing stops

    return () => {
      if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    };
  }, [code, selectedQuestion?._id, languageId, apiBaseUrl, candidateId, screeningTestId]);

  const runCode = async () => {
    if (!selectedQuestion?._id) return;
    if (!languageId) return;
    if (attemptsExhausted) return;

    setIsRunning(true);
    onRunStart && onRunStart();
    clearDiagnostics();

    try {
      const res = await axios.post(
        `${apiBaseUrl}/run/${selectedQuestion._id}`,
        {
          finalCode: code,
          languageId,
          candidate_id: candidateId,
          screening_test_id: screeningTestId,
        }
      );

      setResults(res.data?.results || []);
      setPublicResults(res.data?.publicResults || []);
      setSummary(res.data?.summary || null);

      // collect compile/runtime errors from results to mark in editor
      const errorMessages = [];
      for (const r of res.data?.results || []) {
        if (r.status !== "Passed" && typeof r.actual === "string" && r.actual.length) {
          errorMessages.push(r.actual);
        }
      }
      if (errorMessages.length) applyDiagnostics(errorMessages);

      // auto open footer and switch to Results tab
      setFooterOpen(true);
      setActiveTab("results");

      onRunFinish && onRunFinish(res.data);
    } catch (err) {
      setResults([]);
      setPublicResults([]);
      setSummary({ message: `Error: ${err.response?.data?.error || err.message}` });
      applyDiagnostics([err.response?.data?.error || err.message]);
    } finally {
      const next = Math.min(maxAttempts, attemptsUsed + 1);
      setAttemptsUsed(next);
      persistAttempts(selectedQuestion._id, next);
      setIsRunning(false);
    }
  };

  const runCustom = async () => {
    if (!selectedQuestion?._id || !languageId) return;
    setCustomLoading(true);
    setCustomResult(null);
    clearDiagnostics();
    try {
      const { data } = await axios.post(
        `${apiBaseUrl}/run/${selectedQuestion._id}/custom`,
        {
          finalCode: code,
          languageId,
          stdin: customInput,
          candidate_id: candidateId,
          screening_test_id: screeningTestId,
        }
      );
      setCustomResult(data);

      const diag = [];
      if (data?.stderr) diag.push(String(data.stderr));
      if (data?.status && /error/i.test(data.status) && !data.stderr) {
        diag.push(String(data.status));
      }
      if (diag.length) applyDiagnostics(diag);

      setFooterOpen(true);
      setActiveTab("custom");
    } catch (err) {
      const message = err.response?.data?.error || err.message;
      setCustomResult({
        status: "Error",
        stdout: "",
        stderr: message,
        time: null,
        memory: null,
      });
      applyDiagnostics([message]);
    } finally {
      setCustomLoading(false);
    }
  };

  const toggleTheme = () => setTheme((prev) => (prev === "vs" ? "vs-dark" : "vs"));
  const isDark = theme === "vs-dark";
  const languages = selectedQuestion?.languages || [];

  const SavedBadge = () => {
    if (saveState === "saving") return <span className="text-xs text-gray-500">Saving…</span>;
    if (saveState === "saved")
      return (
        <span className="text-xs text-green-700">
          Saved{lastSavedAt ? ` · ${lastSavedAt.toLocaleTimeString()}` : ""}
        </span>
      );
    if (saveState === "error")
      return <span className="text-xs text-red-600">Save failed</span>;
    return null;
  };

  return (
    <div className="h-full w-full flex flex-col">
      {/* Attempts info + autosave status */}
      {selectedQuestion?._id && (
        <div className="flex items-center justify-between mb-2">
          <div
            className={`text-sm p-2 rounded border ${
              attemptsExhausted
                ? "bg-red-50 border-red-200 text-red-700"
                : "bg-yellow-50 border-yellow-200 text-yellow-800"
            }`}
          >
            Attempts used: <b>{attemptsUsed}</b> / {maxAttempts}{" "}
            {attemptsExhausted && "• No more attempts left."}
          </div>
          <div className="px-2">
            <SavedBadge />
          </div>
        </div>
      )}

      {/* Controls */}
      <div className="flex items-center gap-3 mb-2">
        {/* Language dropdown */}
        <div className="flex items-center gap-2">
          <label className="text-sm font-medium">Language:</label>
          <select
            className="border rounded px-2 py-1"
            value={languageId ?? ""}
            onChange={(e) => setLanguageId(Number(e.target.value))}
            disabled={attemptsExhausted}
          >
            {languages.map((l) => (
              <option key={l.languageId} value={l.languageId}>
                {l.languageName}
              </option>
            ))}
          </select>
        </div>

        <button
          onClick={runCode}
          disabled={isRunning || attemptsExhausted}
          className={`px-4 py-2 rounded text-white ${
            isRunning || attemptsExhausted
              ? "bg-gray-400 cursor-not-allowed"
              : "bg-blue-600 hover:bg-blue-700"
          }`}
          title={attemptsExhausted ? "No attempts left" : "Run your code"}
        >
          {isRunning ? "Running..." : attemptsExhausted ? "No Attempts Left" : "Run Code"}
        </button>

        <button
          onClick={toggleTheme}
          className="px-3 py-2 rounded border ml-auto"
          title="Toggle Light/Dark Theme"
        >
          {isDark ? "☀ Light Mode" : "🌙 Dark Mode"}
        </button>
      </div>

      {/* Editor fills available space; footer overlays at bottom */}
      <div className="relative flex-1 border rounded overflow-hidden">
        <Editor
          height="100%"
          language={monacoLanguage}
          theme={theme}
          value={code}
          onChange={(val) => setCode(val ?? "")}
          onMount={(editor, monaco) => {
            editorRef.current = editor;
            monacoRef.current = monaco;

            // SESSION REPLAY listeners
            editor.onDidChangeModelContent((e) => {
              const ts = Date.now();
              for (const c of e.changes) {
                eventBufferRef.current.push({
                  t: ts,
                  type: "change",
                  range: c.range,        // {startLineNumber, startColumn, endLineNumber, endColumn}
                  text: c.text,          // inserted text
                  rangeLength: c.rangeLength, // deleted chars count
                  versionId: editor.getModel()?.getVersionId(),
                });
              }
            });

            editor.onDidChangeCursorPosition((e) => {
              eventBufferRef.current.push({
                t: Date.now(),
                type: "cursor",
                position: e.position, // { lineNumber, column }
              });
            });

            editor.onDidChangeCursorSelection((e) => {
              eventBufferRef.current.push({
                t: Date.now(),
                type: "selection",
                selection: e.selection, // { startLineNumber, startColumn, endLineNumber, endColumn }
              });
            });
          }}
          options={{
            fontSize: 14,
            minimap: { enabled: false },
            wordWrap: "on",
            automaticLayout: true,
            readOnly: attemptsExhausted,
          }}
        />

        {/* Footer handle */}
        <button
          onClick={() => setFooterOpen((v) => !v)}
          className="absolute left-1/2 -translate-x-1/2 -top-0 translate-y-[-50%] z-10
                     bg-white border rounded-full w-8 h-8 flex items-center justify-center shadow"
          title={footerOpen ? "Collapse output" : "Expand output"}
        >
          {footerOpen ? "▾" : "▴"}
        </button>

        {/* Footer drawer */}
        <div
          className={`absolute left-0 right-0 bottom-0 bg-white border-t transition-all duration-300
                      ${footerOpen ? "h-[45%]" : "h-0"} overflow-hidden`}
        >
          {/* Tabs */}
          <div className="flex items-center gap-2 px-3 py-2 border-b bg-gray-50">
            {[
              { key: "visible", label: "Visible Test Cases" },
              { key: "custom", label: "Custom Input" },
              { key: "results", label: "Results" },
            ].map((t) => (
              <button
                key={t.key}
                onClick={() => setActiveTab(t.key)}
                className={`px-3 py-1 rounded text-sm border ${
                  activeTab === t.key
                    ? "bg-white shadow-sm"
                    : "bg-gray-100 hover:bg-gray-200"
                }`}
              >
                {t.label}
              </button>
            ))}
          </div>

          {/* Tab contents */}
          <div className="p-3 h-[calc(100%-40px)] overflow-auto text-sm">
            {/* Visible Tests */}
            {activeTab === "visible" && (
              <div>
                {vtLoading ? (
                  <div className="text-gray-500">Loading visible test cases…</div>
                ) : visibleTests.length ? (
                  <table className="w-full text-left border">
                    <thead className="bg-gray-100">
                      <tr>
                        <th className="p-2 border">#</th>
                        <th className="p-2 border">Input</th>
                        <th className="p-2 border">Expected</th>
                        <th className="p-2 border">Score</th>
                      </tr>
                    </thead>
                    <tbody>
                      {visibleTests.map((t) => (
                        <tr key={t.index} className="align-top">
                          <td className="p-2 border">{t.index}</td>
                          <td className="p-2 border whitespace-pre-wrap">{t.input}</td>
                          <td className="p-2 border whitespace-pre-wrap">{t.expected}</td>
                          <td className="p-2 border">{t.score}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                ) : (
                  <div className="text-gray-500">No public test cases to display.</div>
                )}
              </div>
            )}

            {/* Custom Input */}
            {activeTab === "custom" && (
              <div className="flex flex-col gap-2 h-full">
                <textarea
                  className="border rounded p-2 font-mono min-h-[120px] flex-1"
                  placeholder="Enter custom input (stdin)…"
                  value={customInput}
                  onChange={(e) => setCustomInput(e.target.value)}
                />
                <div className="flex items-center gap-2">
                  <button
                    onClick={runCustom}
                    disabled={customLoading}
                    className={`px-3 py-2 rounded text-white ${
                      customLoading ? "bg-gray-400" : "bg-green-600 hover:bg-green-700"
                    }`}
                  >
                    {customLoading ? "Running…" : "Test Input"}
                  </button>
                </div>

                {customResult && (
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <div className="font-semibold mb-1">Stdout</div>
                      <pre className="border rounded p-2 bg-gray-50 whitespace-pre-wrap">
                        {customResult.stdout || "—"}
                      </pre>
                    </div>
                    <div>
                      <div className="font-semibold mb-1">Stderr</div>
                      <pre className="border rounded p-2 bg-gray-50 whitespace-pre-wrap text-red-700">
                        {customResult.stderr || "—"}
                      </pre>
                    </div>
                    <div>
                      <div className="font-semibold mb-1">Status</div>
                      <div>{customResult.status || "—"}</div>
                    </div>
                    <div>
                      <div className="font-semibold mb-1">Time / Memory</div>
                      <div>
                        {customResult.time ?? "—"} s &nbsp;/&nbsp; {customResult.memory ?? "—"} KB
                      </div>
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* Results Table */}
            {activeTab === "results" && (
              <div className="flex flex-col gap-2">
                {summary?.message && (
                  <div className="p-2 rounded border bg-indigo-50 text-indigo-800">
                    {summary.message}
                  </div>
                )}
                {results?.length ? (
                  <table className="w-full text-left border">
                    <thead className="bg-gray-100">
                      <tr>
                        <th className="p-2 border">#</th>
                        <th className="p-2 border">Status</th>
                        <th className="p-2 border">Time (s)</th>
                        <th className="p-2 border">Memory (KB)</th>
                        <th className="p-2 border">Score</th>
                        <th className="p-2 border">Max</th>
                      </tr>
                    </thead>
                    <tbody>
                      {results.map((r) => (
                        <tr key={r.index}>
                          <td className="p-2 border">{r.index}</td>
                          <td className={`p-2 border ${r.status === "Passed" ? "text-green-700" : "text-red-700"}`}>
                            {r.status}
                          </td>
                          <td className="p-2 border">{r.time ?? "—"}</td>
                          <td className="p-2 border">{r.memory ?? "—"}</td>
                          <td className="p-2 border">{r.score}</td>
                          <td className="p-2 border">{r.maxScore}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                ) : (
                  <div className="text-gray-500">Run your code to see results.</div>
                )}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}