// App.js
import React, { useState, useEffect, useMemo, useRef } from "react";
import { BrowserRouter, Routes, Route, Link, useLocation } from "react-router-dom";
import axios from "axios";
import "./App.css";
import Judge0Editor from "./components/Judge0Editor";
import SessionReplay from "./components/SessionReplay";

const LS_KEY = "ui:leftWidth";
const API_BASE_URL = "https://coding-platform-teq9.onrender.com/api";

// ---------------------- Top Nav ----------------------
function TopNav() {
  const loc = useLocation();
  const atReplay = loc.pathname.startsWith("/replay");
  return (
    <div className="w-full border-b bg-white">
      <div className="mx-auto max-w-screen-2xl px-4 py-2 flex items-center gap-3">
        <div className="text-xl font-semibold">Coding Platform</div>
        <Link
          to="/"
          className={`px-3 py-1 rounded border text-sm ${
            !atReplay ? "bg-indigo-50 border-indigo-200 text-indigo-700" : "bg-gray-100"
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
  const [difficulty, setDifficulty] = useState("All");

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
      const dOk = difficulty === "All" || it.difficulty === difficulty;
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
        className="h-full bg-gray-50 border-r flex flex-col"
        style={{ width: leftWidth, minWidth: 280 }}
      >
        {/* Tabs Header (sticky) */}
        <div className="px-3 pt-3 bg-gray-50 border-b sticky top-0 z-10">
          <div className="flex items-center gap-2">
            {["list", "details"].map((key) => (
              <button
                key={key}
                onClick={() => setActiveTab(key)}
                className={`px-3 py-1.5 rounded-t border-b-0 border ${
                  activeTab === key
                    ? "bg-white border-gray-300 text-indigo-700"
                    : "bg-gray-100 border-transparent text-gray-700 hover:bg-gray-200"
                }`}
              >
                {key === "list" ? "Questions" : "Details"}
              </button>
            ))}
            <div className="ml-auto text-sm text-gray-500">
              {questions.length} total
            </div>
          </div>
        </div>

        {/* Tab: List */}
        {activeTab === "list" && (
          <div className="flex-1 flex flex-col overflow-hidden">
            {/* Controls */}
            <div className="p-3 border-b bg-white">
              <div className="flex gap-2">
                <input
                  className="flex-1 border rounded px-2 py-1"
                  placeholder="Search title or tags…"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                />
                <select
                  className="border rounded px-2 py-1"
                  value={difficulty}
                  onChange={(e) => setDifficulty(e.target.value)}
                >
                  <option>All</option>
                  <option>Easy</option>
                  <option>Medium</option>
                  <option>Hard</option>
                </select>
              </div>
            </div>

            {/* List */}
            <div className="flex-1 overflow-auto p-3">
              {filtered.length === 0 ? (
                <div className="text-sm text-gray-500">No matches.</div>
              ) : (
                <ul className="space-y-2">
                  {filtered.map((q) => (
                    <li
                      key={q._id}
                      className="p-3 bg-white border rounded hover:shadow-sm cursor-pointer transition flex items-center justify-between"
                      onClick={() => handleQuestionSelect(q._id)}
                    >
                      <div className="min-w-0">
                        <div className="font-medium truncate">{q.title}</div>
                        <div className="mt-1 text-xs text-gray-500 flex items-center gap-2">
                          <span
                            className={`px-2 py-0.5 rounded border ${
                              q.difficulty === "Easy"
                                ? "bg-green-50 border-green-200 text-green-700"
                                : q.difficulty === "Medium"
                                ? "bg-yellow-50 border-yellow-200 text-yellow-700"
                                : "bg-red-50 border-red-200 text-red-700"
                            }`}
                          >
                            {q.difficulty}
                          </span>
                          {typeof q.totalScore === "number" && (
                            <span className="px-2 py-0.5 rounded border bg-gray-50 text-gray-700">
                              {q.totalScore} pts
                            </span>
                          )}
                        </div>
                      </div>
                      <div className="flex-shrink-0 ml-3">
                        <svg
                          className="w-5 h-5 text-gray-400"
                          fill="none"
                          stroke="currentColor"
                          strokeWidth="2"
                          viewBox="0 0 24 24"
                        >
                          <path d="M9 5l7 7-7 7" />
                        </svg>
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>
        )}

        {/* Tab: Details (full-height) */}
        {activeTab === "details" && (
          <div className="flex-1 overflow-auto">
            {selectedQuestion ? (
              <div className="p-4 space-y-3">
                <div className="flex items-start justify-between gap-3">
                  <h3 className="text-lg font-semibold">{selectedQuestion.title}</h3>
                  <span
                    className={`px-2 py-0.5 text-sm rounded border ${
                      selectedQuestion.difficulty === "Easy"
                        ? "bg-green-50 border-green-200 text-green-700"
                        : selectedQuestion.difficulty === "Medium"
                        ? "bg-yellow-50 border-yellow-200 text-yellow-700"
                        : "bg-red-50 border-red-200 text-red-700"
                    }`}
                  >
                    {selectedQuestion.difficulty}
                  </span>
                </div>

                {selectedQuestion.tags?.length ? (
                  <div className="flex flex-wrap gap-2">
                    {selectedQuestion.tags.map((t) => (
                      <span
                        key={t}
                        className="text-xs px-2 py-0.5 rounded border bg-indigo-50 border-indigo-200 text-indigo-700"
                      >
                        {t}
                      </span>
                    ))}
                  </div>
                ) : null}

                <div className="whitespace-pre-wrap text-sm bg-white border rounded p-3">
                  {selectedQuestion.description || "—"}
                </div>

                {(selectedQuestion.sampleInput || selectedQuestion.sampleOutput) && (
                  <div className="grid grid-cols-2 gap-3">
                    {selectedQuestion.sampleInput && (
                      <div>
                        <div className="font-semibold mb-1 text-sm">Sample Input</div>
                        <pre className="bg-white border rounded p-2 whitespace-pre-wrap text-sm">
                          {selectedQuestion.sampleInput}
                        </pre>
                      </div>
                    )}
                    {selectedQuestion.sampleOutput && (
                      <div>
                        <div className="font-semibold mb-1 text-sm">Sample Output</div>
                        <pre className="bg-white border rounded p-2 whitespace-pre-wrap text-sm">
                          {selectedQuestion.sampleOutput}
                        </pre>
                      </div>
                    )}
                  </div>
                )}

                <div className="grid grid-cols-3 gap-2">
                  <div className="bg-white border rounded p-2 text-sm">
                    <div className="font-semibold">Time Limit</div>
                    <div>{selectedQuestion.timeLimit}s</div>
                  </div>
                  <div className="bg-white border rounded p-2 text-sm">
                    <div className="font-semibold">Memory Limit</div>
                    <div>{selectedQuestion.memoryLimit} MB</div>
                  </div>
                  <div className="bg-white border rounded p-2 text-sm">
                    <div className="font-semibold">Max Code Size</div>
                    <div>{selectedQuestion.maxCodeSize} KB</div>
                  </div>
                </div>

                {selectedQuestion.languages?.length ? (
                  <div>
                    <div className="font-semibold mb-1 text-sm">Available Languages</div>
                    <div className="flex flex-wrap gap-2">
                      {selectedQuestion.languages.map((l) => (
                        <span
                          key={l.languageId}
                          className="bg-gray-100 border border-gray-200 text-gray-700 text-xs rounded px-2 py-1"
                        >
                          {l.languageName}
                        </span>
                      ))}
                    </div>
                  </div>
                ) : null}

                <div className="text-xs text-gray-500">
                  Tip: Use the “Questions” tab to switch problems quickly.
                </div>
              </div>
            ) : (
              <div className="h-full flex items-center justify-center text-gray-500">
                Select a question from the “Questions” tab.
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
        <Route path="/replay" element={<SessionReplay apiBaseUrl={API_BASE_URL} />} />
      </Routes>
    </BrowserRouter>
  );
}