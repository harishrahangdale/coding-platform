import React, { useState, useEffect, useMemo, useRef } from "react";
import Editor from "@monaco-editor/react";
import axios from "axios";
import Modal from "./Modal";

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
  const [activeTab, setActiveTab] = useState("visible"); // 'visible' | 'custom' | 'results' | 'analysis'

  // data for footer tabs
  const [visibleTests, setVisibleTests] = useState([]); // {index,input,expected,score}
  const [vtLoading, setVtLoading] = useState(false);

  const [customInput, setCustomInput] = useState("");
  const [customResult, setCustomResult] = useState(null); // {stdout, stderr, time, memory, status}
  const [customLoading, setCustomLoading] = useState(false);

  const [results, setResults] = useState([]); // from /run (all cases)
  const [publicResults, setPublicResults] = useState([]); // visible only
  const [summary, setSummary] = useState(null);

  // Timer and session management
  const [timeRemaining, setTimeRemaining] = useState(0);
  const [isTimerActive, setIsTimerActive] = useState(false);
  const [sessionStarted, setSessionStarted] = useState(false);
  const [sessionEnded, setSessionEnded] = useState(false);
  const [sessionId, setSessionId] = useState(null);
  const timerRef = useRef(null);
  const autoSaveRef = useRef(null);
  const lastAutoSaveRef = useRef(0);
  
  // Session replay data capture
  const [sessionEvents, setSessionEvents] = useState([]);
  const sessionStartTimeRef = useRef(null);

  // Code analysis state (background only)
  const [codeAnalysis, setCodeAnalysis] = useState(null);
  const [analysisLoading, setAnalysisLoading] = useState(false);
  
  // Separate loading states for buttons
  const [isRunningCode, setIsRunningCode] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  
  // Modal state
  const [modal, setModal] = useState({ isOpen: false, title: '', message: '', type: 'info' });

  // Helper function to show modal
  const showModal = (title, message, type = 'info') => {
    setModal({ isOpen: true, title, message, type });
  };

  const closeModal = () => {
    setModal({ isOpen: false, title: '', message: '', type: 'info' });
  };

  // Session management functions
  const startSession = (duration) => {
    const newId = newSessionId();
    setSessionId(newId);
    setSessionStarted(true);
    setSessionEnded(false);
    setSessionEvents([]);
    sessionStartTimeRef.current = Date.now();
    
    startTimer(duration);
  };

  const endSession = async (isAutoSubmit = false) => {
    if (sessionEnded) return; // Prevent duplicate submissions
    
    setSessionEnded(true);
    stopTimer();
    
    
    // Auto-save final code
    await autoSaveCode();
    
    // Run the final code through Judge0 API to get test results
    if (code && selectedQuestion && languageId && sessionId) {
      try {
        setIsSubmitting(true);
        
        // Show progress message
        if (!isAutoSubmit) {
          showModal('Submitting Code', 'Please wait while we evaluate your solution...', 'loading');
        }
        
        const res = await axios.post(
          `${apiBaseUrl}/run/${selectedQuestion._id}`,
          {
            finalCode: code,
            languageId,
            candidate_id: candidateId,
            screening_test_id: screeningTestId,
            sessionId,
            isFinalSubmission: true,
            sessionEvents: sessionEvents // Include session replay data
          }
        );

        setResults(res.data?.results || []);
        setPublicResults(res.data?.publicResults || []);
        setSummary(res.data?.summary || null);

        // Trigger background code analysis for final submission
        analyzeCodeBackground();

        // Show completion message
        if (isAutoSubmit) {
          showModal('Time Up!', `Your final code has been submitted and evaluated. Score: ${res.data?.summary?.earnedScore || 0}/${res.data?.summary?.maxScore || 0}`, 'success');
        } else {
          showModal('Submission Successful!', `Score: ${res.data?.summary?.earnedScore || 0}/${res.data?.summary?.maxScore || 0}`, 'success');
        }
      } catch (err) {
        console.error('Final submission failed:', err);
        showModal('Submission Failed', isAutoSubmit ? 'Time is up! Your code has been auto-saved, but final evaluation failed.' : 'Please try again.', 'error');
      } finally {
        setIsSubmitting(false);
      }
    }
  };

  // Timer functions
  const startTimer = (duration) => {
    setTimeRemaining(duration);
    setIsTimerActive(true);
    
    timerRef.current = setInterval(() => {
      setTimeRemaining((prev) => {
        if (prev <= 1) {
          handleTimerExpired();
          return 0;
        }
        return prev - 1;
      });
    }, 1000);
  };

  const stopTimer = () => {
    if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }
    setIsTimerActive(false);
  };

  const handleTimerExpired = () => {
    endSession(true); // Auto-submit when timer expires
  };

  const formatTime = (seconds) => {
    const hours = Math.floor(seconds / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    const secs = seconds % 60;
    
    if (hours > 0) {
      return `${hours}:${minutes.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
    }
    return `${minutes}:${secs.toString().padStart(2, '0')}`;
  };

  // Auto-save functionality
  const autoSaveCode = async (showNotification = false) => {
    if (!code || !selectedQuestion || !sessionId) return;

    const now = Date.now();
    // Prevent duplicate auto-save notifications within 5 seconds
    if (showNotification && now - lastAutoSaveRef.current < 5000) return;
    
    try {
      // Save draft
      await axios.post(`${apiBaseUrl}/draft`, {
        candidate_id: candidateId,
        screening_test_id: screeningTestId,
        questionId: selectedQuestion._id,
        languageId,
        code: String(code),
        sessionId,
        timestamp: new Date().toISOString()
      });

      // Save editor session events
      await axios.post(`${apiBaseUrl}/editor-sessions`, {
        sessionId,
        candidate_id: candidateId,
        screening_test_id: screeningTestId,
        questionId: selectedQuestion._id,
        languageId,
        events: sessionEvents
      });
      
      if (showNotification) {
        lastAutoSaveRef.current = now;
        setSaveState("saved");
        setLastSavedAt(new Date());
      }
    } catch (error) {
      console.error('Auto-save failed:', error);
      if (showNotification) {
        setSaveState("error");
      }
    }
  };

  // Background code analysis (no UI)
  const analyzeCodeBackground = async () => {
    if (!code || !selectedQuestion) return;

    try {
      const response = await axios.post(`${apiBaseUrl}/analyze-code`, {
        code,
        questionTitle: selectedQuestion.title,
        questionDescription: selectedQuestion.description,
        language: selectedQuestion.languages?.find(l => l.languageId === languageId)?.languageName || 'Unknown',
        testCases: selectedQuestion.testCases || []
      });

      if (response.data.success) {
        setCodeAnalysis(response.data.analysis);
        // Save analysis to submission if available
        if (sessionId) {
          try {
            // Find the submission ID for this session
            const submissionResponse = await axios.get(`${apiBaseUrl}/submissions?sessionId=${sessionId}`);
            if (submissionResponse.data.submissions && submissionResponse.data.submissions.length > 0) {
              const submissionId = submissionResponse.data.submissions[0]._id;
              await axios.post(`${apiBaseUrl}/submissions/${submissionId}/analysis`, {
                analysis: response.data.analysis
              });
            }
          } catch (error) {
            console.error('Failed to save analysis to submission:', error);
          }
        }
      }
    } catch (error) {
      console.error('Background code analysis failed:', error);
    }
  };

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

    // Stop any existing session and reset session state
    stopTimer();
    setSessionStarted(false);
    setSessionEnded(false);
    setSessionId(null);
    setSessionEvents([]);

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
    setSessionStarted(false);
    setCodeAnalysis(null);
    setSessionEvents([]);

    // Clear any stale diagnostics when switching questions
    if (editorRef.current && monacoRef.current) {
      monacoRef.current.editor.setModelMarkers(editorRef.current.getModel(), "judge", []);
    }
  }, [selectedQuestion?._id]);

  // Start session when question is selected
  useEffect(() => {
    if (selectedQuestion?.timeAllowed && !sessionStarted) {
      const timeInSeconds = selectedQuestion.timeAllowed * 60; // Convert minutes to seconds
      startSession(timeInSeconds);
    }
  }, [selectedQuestion?.timeAllowed, sessionStarted]);

  // Synchronize sessionIdRef with sessionId state
  useEffect(() => {
    sessionIdRef.current = sessionId;
  }, [sessionId]);

  // Auto-save code every 30 seconds
  useEffect(() => {
    if (sessionStarted && !sessionEnded && code) {
      autoSaveRef.current = setInterval(() => {
        autoSaveCode(true); // Show notification for periodic auto-save
      }, 30000); // 30 seconds

      return () => {
        if (autoSaveRef.current) {
          clearInterval(autoSaveRef.current);
        }
      };
    }
  }, [sessionStarted, sessionEnded, code]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      stopTimer();
      if (autoSaveRef.current) {
        clearInterval(autoSaveRef.current);
      }
    };
  }, []);

  // Load DRAFT first; if none, load SCAFFOLD (on question/language change)
  useEffect(() => {
    const loadDraftOrScaffold = async () => {
      if (!selectedQuestion?._id || !languageId) return;

      // Clear event buffer for new question/language
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
    if (!sessionStarted || sessionEnded) return; // Can't run if session hasn't started or has ended

    setIsRunningCode(true);
    onRunStart && onRunStart();
    clearDiagnostics();

    try {
      // Use a different endpoint for run-only (no submission creation)
      const res = await axios.post(
        `${apiBaseUrl}/run-only/${selectedQuestion._id}`,
        {
          finalCode: code,
          languageId,
          candidate_id: candidateId,
          screening_test_id: screeningTestId,
          sessionId,
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
      setIsRunningCode(false);
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
    <div className="h-full w-full flex flex-col bg-gradient-to-br from-slate-50 to-slate-100">
      {/* Modern Header */}
      {selectedQuestion?._id && (
        <div className="bg-white/80 backdrop-blur-sm border-b border-slate-200 shadow-sm">
          <div className="px-6 py-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-6">
                <div className="flex items-center gap-3">
                  <div className="w-2 h-8 bg-gradient-to-b from-blue-500 to-purple-600 rounded-full"></div>
                  <h2 className="text-2xl font-bold text-slate-800">
                    {selectedQuestion.title}
                  </h2>
                </div>
                
                <div className="flex items-center gap-3">
                  {/* Timer */}
                  {isTimerActive && (
                    <div className={`inline-flex items-center gap-2 px-3 py-1.5 rounded-full text-sm font-medium ${
                      timeRemaining < 300 
                        ? "bg-red-100 text-red-700 border border-red-200" 
                        : timeRemaining < 600 
                        ? "bg-amber-100 text-amber-700 border border-amber-200"
                        : "bg-green-100 text-green-700 border border-green-200"
                    }`}>
                      <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20">
                        <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm1-12a1 1 0 10-2 0v4a1 1 0 00.293.707l2.828 2.829a1 1 0 101.415-1.415L11 9.586V6z" clipRule="evenodd" />
                      </svg>
                      {formatTime(timeRemaining)}
                    </div>
                  )}
                  
                  {/* Session Status */}
                  {sessionStarted && !sessionEnded && (
                    <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-blue-100 text-blue-700 text-sm font-medium border border-blue-200">
                      <div className="w-2 h-2 bg-blue-500 rounded-full animate-pulse"></div>
                      Session Active
                    </div>
                  )}
                  
                  {sessionEnded && (
                    <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-green-100 text-green-700 text-sm font-medium border border-green-200">
                      <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20">
                        <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                      </svg>
                      Session Completed
                    </div>
                  )}
                  
                  {/* Attempts info */}
                  <div
                    className={`inline-flex items-center gap-2 px-3 py-1.5 rounded-full text-sm font-medium ${
                      attemptsExhausted
                        ? "bg-red-100 text-red-700 border border-red-200"
                        : "bg-amber-100 text-amber-700 border border-amber-200"
                    }`}
                  >
                    <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20">
                      <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm1-12a1 1 0 10-2 0v4a1 1 0 00.293.707l2.828 2.829a1 1 0 101.415-1.415L11 9.586V6z" clipRule="evenodd" />
                    </svg>
                    {attemptsUsed}/{maxAttempts} Attempts
                  </div>
                  
                  {/* Question Info */}
                  {selectedQuestion?.timeAllowed && (
                    <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-slate-100 text-slate-700 text-sm font-medium border border-slate-200">
                      <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20">
                        <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm1-12a1 1 0 10-2 0v4a1 1 0 00.293.707l2.828 2.829a1 1 0 101.415-1.415L11 9.586V6z" clipRule="evenodd" />
                      </svg>
                      {selectedQuestion.timeAllowed} min
                    </div>
                  )}
                </div>
              </div>
              
              <div className="flex items-center gap-3">
                <SavedBadge />
                <button
                  onClick={toggleTheme}
                  className="p-2 rounded-lg border border-slate-300 hover:bg-slate-50 transition-colors"
                  title="Toggle Light/Dark Theme"
                >
                  {isDark ? (
                    <svg className="w-5 h-5 text-slate-600" fill="currentColor" viewBox="0 0 20 20">
                      <path fillRule="evenodd" d="M10 2a1 1 0 011 1v1a1 1 0 11-2 0V3a1 1 0 011-1zm4 8a4 4 0 11-8 0 4 4 0 018 0zm-.464 4.95l.707.707a1 1 0 001.414-1.414l-.707-.707a1 1 0 00-1.414 1.414zm2.12-10.607a1 1 0 010 1.414l-.706.707a1 1 0 11-1.414-1.414l.707-.707a1 1 0 011.414 0zM17 11a1 1 0 100-2h-1a1 1 0 100 2h1zm-7 4a1 1 0 011 1v1a1 1 0 11-2 0v-1a1 1 0 011-1zM5.05 6.464A1 1 0 106.465 5.05l-.708-.707a1 1 0 00-1.414 1.414l.707.707zm1.414 8.486l-.707.707a1 1 0 01-1.414-1.414l.707-.707a1 1 0 011.414 1.414zM4 11a1 1 0 100-2H3a1 1 0 000 2h1z" clipRule="evenodd" />
                    </svg>
                  ) : (
                    <svg className="w-5 h-5 text-slate-600" fill="currentColor" viewBox="0 0 20 20">
                      <path d="M17.293 13.293A8 8 0 016.707 2.707a8.001 8.001 0 1010.586 10.586z" />
                    </svg>
                  )}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Modern Controls */}
      <div className="px-6 py-4 bg-white/60 backdrop-blur-sm border-b border-slate-200">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-4">
            {/* Language Selector */}
            <div className="flex items-center gap-3">
              <label className="text-sm font-semibold text-slate-700">Language:</label>
              <div className="relative">
                <select
                  className="appearance-none bg-white border border-slate-300 rounded-lg px-4 py-2 pr-8 text-sm font-medium text-slate-700 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all"
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
                <div className="absolute inset-y-0 right-0 flex items-center pr-2 pointer-events-none">
                  <svg className="w-4 h-4 text-slate-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                  </svg>
                </div>
              </div>
            </div>
          </div>

          <div className="flex items-center gap-3">
            {/* Run Button */}
            <button
              onClick={runCode}
              disabled={isRunningCode || isSubmitting || attemptsExhausted || !sessionStarted || sessionEnded}
              className={`inline-flex items-center gap-2 px-6 py-2.5 rounded-lg font-semibold text-sm transition-all duration-200 ${
                isRunningCode || isSubmitting || attemptsExhausted || !sessionStarted || sessionEnded
                  ? "bg-slate-200 text-slate-500 cursor-not-allowed"
                  : "bg-blue-600 hover:bg-blue-700 text-white shadow-lg hover:shadow-xl transform hover:-translate-y-0.5"
              }`}
              title={
                !sessionStarted ? "Session not started" :
                sessionEnded ? "Session ended" :
                attemptsExhausted ? "No attempts left" : 
                isSubmitting ? "Please wait for submission to complete" :
                "Run your code for instant feedback"
              }
            >
              {isRunningCode ? (
                <>
                  <svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                  </svg>
                  Running...
                </>
              ) : !sessionStarted ? (
                <>
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M14.828 14.828a4 4 0 01-5.656 0M9 10h1m4 0h1m-6 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                  Start Session
                </>
              ) : sessionEnded ? (
                <>
                  <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20">
                    <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                  </svg>
                  Session Ended
                </>
              ) : attemptsExhausted ? (
                <>
                  <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20">
                    <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7 4a1 1 0 11-2 0 1 1 0 012 0zm-1-9a1 1 0 00-1 1v4a1 1 0 102 0V6a1 1 0 00-1-1z" clipRule="evenodd" />
                  </svg>
                  No Attempts Left
                </>
              ) : isSubmitting ? (
                <>
                  <svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                  </svg>
                  Submitting...
                </>
              ) : (
                <>
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M14.828 14.828a4 4 0 01-5.656 0M9 10h1m4 0h1m-6 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                  Run Code
                </>
              )}
            </button>

            {/* Submit Button */}
            <button
              onClick={() => endSession(false)}
              disabled={!sessionStarted || sessionEnded || isRunningCode || isSubmitting}
              className={`inline-flex items-center gap-2 px-6 py-2.5 rounded-lg font-semibold text-sm transition-all duration-200 ${
                !sessionStarted || sessionEnded || isRunningCode || isSubmitting
                  ? "bg-slate-200 text-slate-500 cursor-not-allowed"
                  : "bg-green-600 hover:bg-green-700 text-white shadow-lg hover:shadow-xl transform hover:-translate-y-0.5"
              }`}
              title={
                !sessionStarted ? "Session not started" :
                sessionEnded ? "Session already ended" :
                isRunningCode ? "Please wait for run to complete" :
                isSubmitting ? "Submitting..." :
                "Submit your final code"
              }
            >
              {!sessionStarted ? (
                <>
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8" />
                  </svg>
                  Submit
                </>
              ) : sessionEnded ? (
                <>
                  <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20">
                    <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                  </svg>
                  Submitted
                </>
              ) : isSubmitting ? (
                <>
                  <svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                  </svg>
                  Submitting...
                </>
              ) : (
                <>
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8" />
                  </svg>
                  Submit
                </>
              )}
            </button>
          </div>
        </div>
      </div>

      {/* Modern Editor Container */}
      <div className="relative flex-1 mx-6 mb-6 bg-white rounded-xl shadow-lg border border-slate-200 overflow-hidden">
        <Editor
          height="100%"
          language={monacoLanguage}
          theme={theme}
          value={code}
          onChange={(val) => setCode(val ?? "")}
          onMount={(editor, monaco) => {
            editorRef.current = editor;
            monacoRef.current = monaco;

            // SESSION REPLAY listeners - following original pattern
            editor.onDidChangeModelContent((e) => {
              if (!sessionStarted || sessionEnded) return;
              
              const ts = Date.now();
              const relativeTime = sessionStartTimeRef.current ? ts - sessionStartTimeRef.current : 0;
              
              for (const c of e.changes) {
                const event = {
                  t: relativeTime,
                  type: "change",
                  range: c.range,
                  text: c.text,
                  rangeLength: c.rangeLength,
                  versionId: editor.getModel()?.getVersionId(),
                };
                
                setSessionEvents(prev => [...prev, event]);
              }
            });

            editor.onDidChangeCursorPosition((e) => {
              if (!sessionStarted || sessionEnded) return;
              
              const ts = Date.now();
              const relativeTime = sessionStartTimeRef.current ? ts - sessionStartTimeRef.current : 0;
              
              const event = {
                t: relativeTime,
                type: "cursor",
                position: e.position,
              };
              
              setSessionEvents(prev => [...prev, event]);
            });

            editor.onDidChangeCursorSelection((e) => {
              if (!sessionStarted || sessionEnded) return;
              
              const ts = Date.now();
              const relativeTime = sessionStartTimeRef.current ? ts - sessionStartTimeRef.current : 0;
              
              const event = {
                t: relativeTime,
                type: "selection",
                selection: e.selection,
              };
              
              setSessionEvents(prev => [...prev, event]);
            });

          }}
          options={{
            fontSize: 14,
            minimap: { enabled: false },
            wordWrap: "on",
            automaticLayout: true,
            readOnly: attemptsExhausted,
            padding: { top: 16, bottom: 16 },
            scrollBeyondLastLine: false,
            scrollbar: {
              vertical: 'auto',
              horizontal: 'auto',
              verticalScrollbarSize: 8,
              horizontalScrollbarSize: 8,
            },
          }}
        />

        {/* Removed the inline absolute footer toggle button from here.
            The toggle button is now placed below the editor (left-aligned). */}

        {/* Modern Footer drawer - expands upwards */}
        <div
          className={`absolute left-0 right-0 bottom-0 bg-white/95 backdrop-blur-sm border-t border-slate-200 transition-all duration-300 rounded-t-xl
                      ${footerOpen ? "h-[45%]" : "h-0"} overflow-hidden transform origin-bottom shadow-2xl`}
        >
          {/* Modern Tabs */}
          <div className="flex items-center gap-1 px-4 py-3 border-b border-slate-200 bg-slate-50/50">
            {[
              { key: "visible", label: "Test Cases", icon: "🧪" },
              { key: "custom", label: "Custom Input", icon: "⚡" },
              { key: "results", label: "Results", icon: "📊" },
            ].map((t) => (
              <button
                key={t.key}
                onClick={() => setActiveTab(t.key)}
                className={`inline-flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-all duration-200 ${
                  activeTab === t.key
                    ? "bg-white text-slate-700 shadow-sm border border-slate-200"
                    : "text-slate-500 hover:text-slate-700 hover:bg-white/50"
                }`}
              >
                <span>{t.icon}</span>
                {t.label}
              </button>
            ))}
          </div>

          {/* Modern Tab contents */}
          <div className="p-6 h-[calc(100%-60px)] overflow-auto">
            {/* Visible Tests */}
            {activeTab === "visible" && (
              <div>
                {vtLoading ? (
                  <div className="flex items-center justify-center py-8">
                    <div className="flex items-center gap-3 text-slate-500">
                      <svg className="w-5 h-5 animate-spin" fill="none" viewBox="0 0 24 24">
                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                      </svg>
                      Loading visible test cases…
                    </div>
                  </div>
                ) : visibleTests.length ? (
                  <div className="space-y-4">
                    {visibleTests.map((t) => (
                      <div key={t.index} className="bg-slate-50 rounded-lg p-4 border border-slate-200">
                        <div className="flex items-center justify-between mb-3">
                          <div className="flex items-center gap-2">
                            <div className="w-6 h-6 bg-blue-100 text-blue-700 rounded-full flex items-center justify-center text-sm font-semibold">
                              {t.index}
                            </div>
                            <span className="font-medium text-slate-700">Test Case {t.index}</span>
                          </div>
                          <div className="px-2 py-1 bg-blue-100 text-blue-700 rounded-full text-xs font-medium">
                            {t.score} pts
                          </div>
                        </div>
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                          <div>
                            <label className="text-xs font-semibold text-slate-500 uppercase tracking-wide">Input</label>
                            <div className="mt-1 p-3 bg-white rounded border border-slate-200 font-mono text-sm whitespace-pre-wrap">
                              {t.input || "No input"}
                            </div>
                          </div>
                          <div>
                            <label className="text-xs font-semibold text-slate-500 uppercase tracking-wide">Expected Output</label>
                            <div className="mt-1 p-3 bg-white rounded border border-slate-200 font-mono text-sm whitespace-pre-wrap">
                              {t.expected || "No expected output"}
                            </div>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="flex items-center justify-center py-8">
                    <div className="text-center">
                      <div className="w-16 h-16 bg-slate-100 rounded-full flex items-center justify-center mx-auto mb-4">
                        <svg className="w-8 h-8 text-slate-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                        </svg>
                      </div>
                      <p className="text-slate-500 font-medium">No visible test cases available</p>
                    </div>
                  </div>
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

      {/* New: Footer toggle button below the editor, left-aligned */}
      <div className="px-6 mx-6 mb-6">
        <div className="flex items-start">
          <button
            onClick={() => setFooterOpen((v) => !v)}
            className="bg-white/95 backdrop-blur-sm border border-slate-300 rounded-xl px-4 py-3 flex items-center gap-2 shadow-lg hover:bg-white hover:border-slate-400 transition-all duration-200 font-semibold text-sm text-slate-700 hover:shadow-xl"
            title={footerOpen ? "Collapse output panel" : "Expand output panel"}
          >
            {footerOpen ? (
              <>
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                </svg>
                Hide Output
              </>
            ) : (
              <>
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 15l7-7 7 7" />
                </svg>
                Show Output
              </>
            )}
          </button>
        </div>
      </div>

      {/* Modern Modal */}
      <Modal
        isOpen={modal.isOpen}
        onClose={closeModal}
        title={modal.title}
        type={modal.type}
      >
        <p className="text-sm text-gray-500">{modal.message}</p>
      </Modal>
    </div>
  );
}