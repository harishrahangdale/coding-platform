// App.js
import React, { useState, useEffect, useMemo, useRef } from "react";
import { BrowserRouter, Routes, Route, Link, useLocation } from "react-router-dom";
import axios from "axios";
import "./App.css";
import Judge0Editor from "./components/Judge0Editor";
import EnhancedSessionReplay from "./components/EnhancedSessionReplay";
import AIQuestionsManager from "./components/AIQuestionsManager";

const LS_KEY = "ui:leftWidth";
const API_BASE_URL = process.env.REACT_APP_API_BASE_URL || "http://localhost:5050/api";

// ---------------------- Top Nav ----------------------
function TopNav() {
  const loc = useLocation();
  const atReplay = loc.pathname.startsWith("/replay");
  const atAIQuestions = loc.pathname.startsWith("/ai-questions");
  const atMain = loc.pathname === "/";
  
  return (
    <div className="w-full border-b bg-white">
      <div className="mx-auto max-w-screen-2xl px-4 py-2 flex items-center gap-3">
        <div className="text-xl font-semibold">Coding Platform</div>
        <Link
          to="/"
          className={`px-3 py-1 rounded border text-sm ${
            atMain ? "bg-indigo-50 border-indigo-200 text-indigo-700" : "bg-gray-100"
          }`}
        >
          Solve
        </Link>
        <Link
          to="/replay"
          className={`px-3 py-1 rounded border text-sm ${
            atReplay ? "bg-indigo-50 border-indigo-200 text-indigo-700" : "bg-gray-100"
          }`}
        >
          Session Replay
        </Link>
        <Link
          to="/ai-questions"
          className={`px-3 py-1 rounded border text-sm ${
            atAIQuestions ? "bg-indigo-50 border-indigo-200 text-indigo-700" : "bg-gray-100"
          }`}
        >
          AI Questions
        </Link>
        <div className="ml-auto text-xs text-gray-500">
          API: <code>{API_BASE_URL.replace(/^https?:\/\//, "")}</code>
        </div>
      </div>
    </div>
  );
}

// ---------------------- Main Coding App (your original UI) ----------------------
function MainCodingApp() {
  const [questions, setQuestions] = useState([]);
  const [selectedQuestion, setSelectedQuestion] = useState(null);
  const [activeTab, setActiveTab] = useState("list"); // 'list' | 'details'
  const [search, setSearch] = useState("");
  const [difficulty, setDifficulty] = useState("All Difficulties");

  // ----- Resizable split state -----
  const [leftWidth, setLeftWidth] = useState(() => {
    const saved = Number(localStorage.getItem(LS_KEY));
    return Number.isFinite(saved) && saved > 0 ? saved : 520; // default ~40% on 1440px
  });
  const draggingRef = useRef(false);

  // Clamp and persist when leftWidth changes
  useEffect(() => {
    const min = 300;
    const max = Math.max(480, window.innerWidth * 0.7);
    const clamped = Math.min(Math.max(leftWidth, min), max);
    if (clamped !== leftWidth) setLeftWidth(clamped);
    localStorage.setItem(LS_KEY, String(clamped));
  }, [leftWidth]);

  // Global mouse handlers for drag
  useEffect(() => {
    const onMove = (e) => {
      if (!draggingRef.current) return;
      const minLeft = 280;
      const minRight = 420;
      const maxLeft = Math.max(minLeft, window.innerWidth - minRight);
      const next = Math.min(Math.max(e.clientX, minLeft), maxLeft);
      setLeftWidth(next);
    };
    const onUp = () => {
      if (!draggingRef.current) return;
      draggingRef.current = false;
      document.body.style.userSelect = "";
      document.body.style.cursor = "";
    };
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
    return () => {
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);
    };
  }, []);

  const startDrag = (e) => {
    e.preventDefault();
    draggingRef.current = true;
    document.body.style.userSelect = "none";
    document.body.style.cursor = "col-resize";
  };

  // Load questions
  useEffect(() => {
    axios
      .get(`${API_BASE_URL}/questions`)
      .then((res) => setQuestions(res.data))
      .catch((err) => console.error("Error fetching questions:", err));
  }, []);

  // Filtered list (client-side)
  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return questions.filter((it) => {
      const dOk = difficulty === "All Difficulties" || it.difficulty === difficulty;
      const sOk =
        !q ||
        it.title?.toLowerCase().includes(q) ||
        (it.tags || []).some((t) => t.toLowerCase().includes(q));
      return dOk && sOk;
    });
  }, [questions, search, difficulty]);

  // Load a question details
  const handleQuestionSelect = async (id) => {
    try {
      const { data } = await axios.get(`${API_BASE_URL}/questions/${id}`);
      setSelectedQuestion(data);
      setActiveTab("details");
    } catch (err) {
      console.error("Error fetching question:", err);
    }
  };

  return (
    <div className="h-[calc(100vh-49px)] w-screen overflow-hidden flex">
      {/* LEFT PANE (resizable) */}
      <div
        className="h-full bg-slate-50 border-r border-slate-200 flex flex-col"
        style={{ width: leftWidth, minWidth: 320 }}
      >
        {/* Modern Header */}
        <div className="px-6 py-4 bg-white border-b border-slate-200 sticky top-0 z-10">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-8 h-8 bg-gradient-to-br from-indigo-500 to-purple-600 rounded-lg flex items-center justify-center">
                <svg className="w-5 h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 20l4-16m4 4l4 4-4 4M6 16l-4-4 4-4" />
                </svg>
              </div>
              <div>
                <h2 className="text-lg font-semibold text-slate-900">Questions</h2>
                <p className="text-sm text-slate-500">{questions.length} available</p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              {["list", "details"].map((key) => (
                <button
                  key={key}
                  onClick={() => setActiveTab(key)}
                  className={`px-4 py-2 rounded-lg text-sm font-medium transition-all duration-200 ${
                    activeTab === key
                      ? "bg-indigo-100 text-indigo-700 shadow-sm"
                      : "text-slate-600 hover:bg-slate-100 hover:text-slate-900"
                  }`}
                >
                  {key === "list" ? "Browse" : "Details"}
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* Tab: List */}
        {activeTab === "list" && (
          <div className="flex-1 flex flex-col overflow-hidden">
            {/* Modern Search & Filters */}
            <div className="p-6 bg-white border-b border-slate-200">
              <div className="space-y-4">
                <div className="relative">
                  <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                    <svg className="h-5 w-5 text-slate-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                    </svg>
                  </div>
                  <input
                    className="w-full pl-10 pr-4 py-3 border border-slate-300 rounded-xl focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 transition-colors"
                    placeholder="Search questions by title or tags..."
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                  />
                </div>
                <div className="flex items-center gap-4">
                  <div className="relative">
                    <select
                      className="appearance-none px-4 py-3 pr-10 border border-slate-300 rounded-xl focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 transition-all duration-200 bg-white text-slate-700 font-medium cursor-pointer hover:border-slate-400 shadow-sm"
                      value={difficulty}
                      onChange={(e) => setDifficulty(e.target.value)}
                    >
                      <option value="All Difficulties">All Difficulties</option>
                      <option value="Easy">Easy</option>
                      <option value="Medium">Medium</option>
                      <option value="Hard">Hard</option>
                    </select>
                    <div className="absolute inset-y-0 right-0 flex items-center pr-3 pointer-events-none">
                      <svg className="w-5 h-5 text-slate-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                      </svg>
                    </div>
                  </div>
                  <div className="flex items-center gap-2 text-sm text-slate-500">
                    <div className="w-2 h-2 bg-indigo-500 rounded-full"></div>
                    <span>{filtered.length} of {questions.length} questions</span>
                  </div>
                </div>
              </div>
            </div>

            {/* Modern Question List */}
            <div className="flex-1 overflow-auto p-6">
              {filtered.length === 0 ? (
                <div className="flex flex-col items-center justify-center h-full text-center">
                  <div className="w-16 h-16 bg-slate-100 rounded-full flex items-center justify-center mb-4">
                    <svg className="w-8 h-8 text-slate-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9.172 16.172a4 4 0 015.656 0M9 12h6m-6-4h6m2 5.291A7.962 7.962 0 0112 15c-2.34 0-4.29-1.009-5.824-2.709" />
                    </svg>
                  </div>
                  <h3 className="text-lg font-medium text-slate-900 mb-2">No questions found</h3>
                  <p className="text-slate-500">Try adjusting your search or filter criteria</p>
                </div>
              ) : (
                <div className="space-y-3">
                  {filtered.map((q) => (
                    <div
                      key={q._id}
                      className="group p-5 bg-white rounded-xl border border-slate-200 hover:border-indigo-300 hover:shadow-lg cursor-pointer transition-all duration-200"
                      onClick={() => handleQuestionSelect(q._id)}
                    >
                      <div className="flex items-start justify-between">
                        <div className="flex-1 min-w-0">
                          <h3 className="text-base font-semibold text-slate-900 group-hover:text-indigo-700 transition-colors line-clamp-2">
                            {q.title}
                          </h3>
                          <div className="mt-3 flex items-center gap-2 flex-wrap">
                            <span
                              className={`inline-flex items-center px-3 py-1 rounded-full text-xs font-medium ${
                                q.difficulty === "Easy"
                                  ? "bg-emerald-100 text-emerald-700"
                                  : q.difficulty === "Medium"
                                  ? "bg-amber-100 text-amber-700"
                                  : "bg-red-100 text-red-700"
                              }`}
                            >
                              {q.difficulty}
                            </span>
                            {typeof q.totalScore === "number" && (
                              <span className="inline-flex items-center px-3 py-1 rounded-full text-xs font-medium bg-slate-100 text-slate-700">
                                {q.totalScore} points
                              </span>
                            )}
                            {q.tags && q.tags.length > 0 && (
                              <div className="flex items-center gap-1">
                                {q.tags.slice(0, 2).map((tag, idx) => (
                                  <span
                                    key={idx}
                                    className="inline-flex items-center px-2 py-1 rounded text-xs bg-indigo-50 text-indigo-600"
                                  >
                                    {tag}
                                  </span>
                                ))}
                                {q.tags.length > 2 && (
                                  <span className="text-xs text-slate-500">+{q.tags.length - 2} more</span>
                                )}
                              </div>
                            )}
                          </div>
                        </div>
                        <div className="flex-shrink-0 ml-4">
                          <div className="w-8 h-8 rounded-full bg-slate-100 group-hover:bg-indigo-100 flex items-center justify-center transition-colors">
                            <svg
                              className="w-4 h-4 text-slate-400 group-hover:text-indigo-600 transition-colors"
                              fill="none"
                              stroke="currentColor"
                              viewBox="0 0 24 24"
                            >
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                            </svg>
                          </div>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}

        {/* Tab: Details (full-height) */}
        {activeTab === "details" && (
          <div className="flex-1 overflow-auto">
            {selectedQuestion ? (
              <div className="p-6 space-y-6">
                {/* Question Header */}
                <div className="space-y-4">
                  <div className="flex items-start justify-between gap-4">
                    <h3 className="text-xl font-bold text-slate-900 leading-tight">{selectedQuestion.title}</h3>
                    <div className="flex items-center gap-2">
                      <span
                        className={`inline-flex items-center px-3 py-1 rounded-full text-sm font-medium ${
                          selectedQuestion.difficulty === "Easy"
                            ? "bg-emerald-100 text-emerald-700"
                            : selectedQuestion.difficulty === "Medium"
                            ? "bg-amber-100 text-amber-700"
                            : "bg-red-100 text-red-700"
                        }`}
                      >
                        {selectedQuestion.difficulty}
                      </span>
                      {typeof selectedQuestion.totalScore === "number" && (
                        <span className="inline-flex items-center px-3 py-1 rounded-full text-sm font-medium bg-slate-100 text-slate-700">
                          {selectedQuestion.totalScore} points
                        </span>
                      )}
                    </div>
                  </div>

                  {selectedQuestion.tags?.length ? (
                    <div className="flex flex-wrap gap-2">
                      {selectedQuestion.tags.map((t) => (
                        <span
                          key={t}
                          className="inline-flex items-center px-3 py-1 rounded-full text-sm bg-indigo-50 text-indigo-600"
                        >
                          {t}
                        </span>
                      ))}
                    </div>
                  ) : null}
                </div>

                {/* Question Description */}
                <div className="bg-white rounded-xl border border-slate-200 p-6">
                  <h4 className="text-lg font-semibold text-slate-900 mb-3">Problem Description</h4>
                  <div className="whitespace-pre-wrap text-slate-700 leading-relaxed">
                    {selectedQuestion.description || "No description available."}
                  </div>
                </div>

                {/* Sample Input/Output */}
                {(selectedQuestion.sampleInput || selectedQuestion.sampleOutput) && (
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    {selectedQuestion.sampleInput && (
                      <div className="bg-white rounded-xl border border-slate-200 p-6">
                        <div className="flex items-center gap-2 mb-3">
                          <div className="w-2 h-2 bg-green-500 rounded-full"></div>
                          <h4 className="font-semibold text-slate-900">Sample Input</h4>
                        </div>
                        <pre className="bg-slate-50 rounded-lg p-4 whitespace-pre-wrap text-sm text-slate-700 font-mono border">
                          {selectedQuestion.sampleInput}
                        </pre>
                      </div>
                    )}
                    {selectedQuestion.sampleOutput && (
                      <div className="bg-white rounded-xl border border-slate-200 p-6">
                        <div className="flex items-center gap-2 mb-3">
                          <div className="w-2 h-2 bg-blue-500 rounded-full"></div>
                          <h4 className="font-semibold text-slate-900">Sample Output</h4>
                        </div>
                        <pre className="bg-slate-50 rounded-lg p-4 whitespace-pre-wrap text-sm text-slate-700 font-mono border">
                          {selectedQuestion.sampleOutput}
                        </pre>
                      </div>
                    )}
                  </div>
                )}

                {/* Constraints & Limits */}
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  <div className="bg-white rounded-xl border border-slate-200 p-4">
                    <div className="flex items-center gap-2 mb-2">
                      <svg className="w-4 h-4 text-slate-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                      </svg>
                      <span className="font-semibold text-slate-900">Time Limit</span>
                    </div>
                    <div className="text-slate-700">{selectedQuestion.timeLimit || selectedQuestion.timeAllowed || "N/A"}s</div>
                  </div>
                  <div className="bg-white rounded-xl border border-slate-200 p-4">
                    <div className="flex items-center gap-2 mb-2">
                      <svg className="w-4 h-4 text-slate-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 7v10c0 2.21 3.582 4 8 4s8-1.79 8-4V7M4 7c0 2.21 3.582 4 8 4s8-1.79 8-4M4 7c0-2.21 3.582-4 8-4s8 1.79 8 4" />
                      </svg>
                      <span className="font-semibold text-slate-900">Memory Limit</span>
                    </div>
                    <div className="text-slate-700">{selectedQuestion.memoryLimit || "N/A"} MB</div>
                  </div>
                  <div className="bg-white rounded-xl border border-slate-200 p-4">
                    <div className="flex items-center gap-2 mb-2">
                      <svg className="w-4 h-4 text-slate-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                      </svg>
                      <span className="font-semibold text-slate-900">Max Code Size</span>
                    </div>
                    <div className="text-slate-700">{selectedQuestion.maxCodeSize || "N/A"} KB</div>
                  </div>
                </div>

                {/* Available Languages */}
                {selectedQuestion.languages?.length ? (
                  <div className="bg-white rounded-xl border border-slate-200 p-6">
                    <h4 className="text-lg font-semibold text-slate-900 mb-3">Available Languages</h4>
                    <div className="flex flex-wrap gap-2">
                      {selectedQuestion.languages.map((l) => (
                        <span
                          key={l.languageId}
                          className="inline-flex items-center px-3 py-1 rounded-full text-sm bg-slate-100 text-slate-700"
                        >
                          {l.languageName}
                        </span>
                      ))}
                    </div>
                  </div>
                ) : null}

                {/* Time Limit Warning */}
                {selectedQuestion.timeAllowed && (
                  <div className="bg-amber-50 border border-amber-200 rounded-xl p-4">
                    <div className="flex items-center gap-2">
                      <svg className="w-5 h-5 text-amber-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                      </svg>
                      <span className="text-sm font-medium text-amber-800">
                        Time Limit: {selectedQuestion.timeAllowed} minutes
                      </span>
                    </div>
                  </div>
                )}
              </div>
            ) : (
              <div className="flex flex-col items-center justify-center h-full text-center p-6">
                <div className="w-16 h-16 bg-slate-100 rounded-full flex items-center justify-center mb-4">
                  <svg className="w-8 h-8 text-slate-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                  </svg>
                </div>
                <h3 className="text-lg font-medium text-slate-900 mb-2">Select a Question</h3>
                <p className="text-slate-500">Choose a question from the list to view its details</p>
              </div>
            )}
          </div>
        )}
      </div>

      {/* RESIZER HANDLE */}
      <div
        onMouseDown={startDrag}
        role="separator"
        aria-orientation="vertical"
        aria-label="Resize panels"
        className={`h-full w-[6px] cursor-col-resize bg-transparent hover:bg-indigo-300 transition-colors
                    ${draggingRef.current ? "bg-indigo-400" : ""}`}
        title="Drag to resize"
      />

      {/* RIGHT PANE (editor flexes) */}
      <div className="flex-1 min-w-[360px] p-4 flex flex-col">
        <Judge0Editor apiBaseUrl={API_BASE_URL} selectedQuestion={selectedQuestion} />
      </div>
    </div>
  );
}

// ---------------------- App with Routes ----------------------
export default function App() {
  return (
    <BrowserRouter>
      <TopNav />
      <Routes>
        <Route path="/" element={<MainCodingApp />} />
        <Route path="/replay" element={<EnhancedSessionReplay apiBaseUrl={API_BASE_URL} />} />
        <Route path="/ai-questions" element={<AIQuestionsManager />} />
      </Routes>
    </BrowserRouter>
  );
}