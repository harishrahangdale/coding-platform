import React, { useState, useEffect, useMemo } from "react";
import axios from "axios";
import "./App.css";
import Judge0Editor from "./components/Judge0Editor";

const API_BASE_URL = "https://coding-platform-teq9.onrender.com/api";

const DifficultyBadge = ({ level }) => {
  const map = {
    Easy: "bg-green-50 text-green-700 border-green-200",
    Medium: "bg-yellow-50 text-yellow-800 border-yellow-200",
    Hard: "bg-red-50 text-red-700 border-red-200",
  };
  return (
    <span className={`text-xs border rounded px-2 py-0.5 ${map[level] || "bg-gray-50 text-gray-700 border-gray-200"}`}>
      {level}
    </span>
  );
};

function App() {
  const [questions, setQuestions] = useState([]);
  const [loadingList, setLoadingList] = useState(false);
  const [listError, setListError] = useState("");

  const [selectedQuestion, setSelectedQuestion] = useState(null);
  const [loadingDetail, setLoadingDetail] = useState(false);

  const [search, setSearch] = useState("");
  const [difficulty, setDifficulty] = useState("ALL"); // ALL | Easy | Medium | Hard

  // Load list
  useEffect(() => {
    let mounted = true;
    (async () => {
      try {
        setLoadingList(true);
        setListError("");
        const { data } = await axios.get(`${API_BASE_URL}/questions`);
        if (mounted) setQuestions(data || []);
      } catch (e) {
        if (mounted) setListError("Failed to load questions.");
      } finally {
        if (mounted) setLoadingList(false);
      }
    })();
    return () => (mounted = false);
  }, []);

  // Filtered questions
  const filtered = useMemo(() => {
    const q = (questions || []).filter((x) => {
      const okDiff = difficulty === "ALL" || x.difficulty === difficulty;
      const term = search.trim().toLowerCase();
      const okSearch =
        !term ||
        x.title?.toLowerCase().includes(term) ||
        (x.tags || []).some((t) => (t || "").toLowerCase().includes(term));
      return okDiff && okSearch;
    });
    return q;
  }, [questions, search, difficulty]);

  // Load detail on click
  const handleQuestionSelect = async (id) => {
    try {
      setLoadingDetail(true);
      const { data } = await axios.get(`${API_BASE_URL}/questions/${id}`);
      setSelectedQuestion(data);
    } catch (err) {
      // Optional: toast/snackbar
      console.error("Error fetching question:", err);
    } finally {
      setLoadingDetail(false);
    }
  };

  return (
    <div className="flex h-screen bg-gray-50">
      {/* Left Panel */}
      <div className="w-full md:w-1/2 lg:w-[44%] xl:w-[42%] border-r bg-white flex flex-col">
        {/* Header / Filters */}
        <div className="p-4 border-b bg-white sticky top-0 z-10">
          <h1 className="text-2xl font-bold mb-3">Coding Platform</h1>
          <div className="flex gap-2 items-center">
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search by title or tag…"
              className="flex-1 border rounded px-3 py-2 text-sm"
            />
            <select
              value={difficulty}
              onChange={(e) => setDifficulty(e.target.value)}
              className="border rounded px-2 py-2 text-sm"
            >
              <option value="ALL">All</option>
              <option value="Easy">Easy</option>
              <option value="Medium">Medium</option>
              <option value="Hard">Hard</option>
            </select>
          </div>
        </div>

        {/* List */}
        <div className="p-2 overflow-y-auto">
          {loadingList ? (
            <div className="p-4 text-gray-500">Loading questions…</div>
          ) : listError ? (
            <div className="p-4 text-red-600">{listError}</div>
          ) : filtered.length === 0 ? (
            <div className="p-4 text-gray-500">No questions found.</div>
          ) : (
            <ul className="space-y-1">
              {filtered.map((q) => {
                const isSelected = selectedQuestion?._id === q._id;
                return (
                  <li
                    key={q._id}
                    onClick={() => handleQuestionSelect(q._id)}
                    className={`cursor-pointer p-3 rounded border flex items-center gap-3 justify-between hover:bg-gray-50 transition ${
                      isSelected ? "bg-indigo-50 border-indigo-200" : "bg-white border-gray-200"
                    }`}
                  >
                    <div className="flex-1">
                      <div className="font-medium">{q.title}</div>
                      <div className="flex items-center gap-2 mt-1">
                        <DifficultyBadge level={q.difficulty} />
                        {!!q.languages?.length && (
                          <span className="text-xs text-gray-500">
                            {q.languages.length} lang
                          </span>
                        )}
                      </div>
                    </div>
                    <div className="text-xs bg-white border rounded px-2 py-0.5">
                      {q.totalScore ?? 0} pts
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </div>

        {/* Details */}
        <div className="border-t bg-gray-50 overflow-y-auto p-4">
          {loadingDetail && <div className="text-gray-500">Loading question…</div>}

          {selectedQuestion && !loadingDetail && (
            <div className="space-y-3">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <h3 className="text-lg font-semibold">{selectedQuestion.title}</h3>
                  <div className="mt-1 flex items-center gap-2">
                    <DifficultyBadge level={selectedQuestion.difficulty} />
                    {selectedQuestion.tags?.length ? (
                      <div className="flex flex-wrap gap-1">
                        {selectedQuestion.tags.slice(0, 4).map((t) => (
                          <span
                            key={t}
                            className="text-[11px] bg-gray-100 border border-gray-200 text-gray-700 rounded px-1.5 py-0.5"
                          >
                            {t}
                          </span>
                        ))}
                        {selectedQuestion.tags.length > 4 && (
                          <span className="text-[11px] text-gray-500">
                            +{selectedQuestion.tags.length - 4}
                          </span>
                        )}
                      </div>
                    ) : null}
                  </div>
                </div>
                <div className="text-right">
                  <div className="text-xs text-gray-500">Total Points</div>
                  <div className="text-sm font-semibold">
                    {selectedQuestion.totalScore ?? 0}
                  </div>
                </div>
              </div>

              <p className="whitespace-pre-wrap text-sm bg-white border rounded p-3">
                {selectedQuestion.description || "—"}
              </p>

              {/* Sample I/O */}
              {(selectedQuestion.sampleInput || selectedQuestion.sampleOutput) && (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  {selectedQuestion.sampleInput && (
                    <div>
                      <div className="font-semibold text-sm mb-1">Sample Input</div>
                      <pre className="bg-white border rounded p-2 whitespace-pre-wrap text-sm">
                        {selectedQuestion.sampleInput}
                      </pre>
                    </div>
                  )}
                  {selectedQuestion.sampleOutput && (
                    <div>
                      <div className="font-semibold text-sm mb-1">Sample Output</div>
                      <pre className="bg-white border rounded p-2 whitespace-pre-wrap text-sm">
                        {selectedQuestion.sampleOutput}
                      </pre>
                    </div>
                  )}
                </div>
              )}

              {/* Limits & meta */}
              <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
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
                <div className="bg-white border rounded p-2 text-sm">
                  <div className="font-semibold">Time Allowed</div>
                  <div>{selectedQuestion.timeAllowed} min</div>
                </div>
              </div>

              <div className="bg-white border rounded p-2 text-sm">
                <div className="font-semibold">Max Attempts</div>
                <div>{selectedQuestion.maxAttempts}</div>
              </div>

              {/* Languages */}
              {selectedQuestion.languages?.length ? (
                <div>
                  <div className="font-semibold mb-1">Available Languages</div>
                  <div className="flex flex-wrap gap-2">
                    {selectedQuestion.languages.map((l) => (
                      <span
                        key={l.languageId}
                        className="bg-indigo-50 border border-indigo-200 text-indigo-700 text-xs rounded px-2 py-1"
                      >
                        {l.languageName}
                      </span>
                    ))}
                  </div>
                </div>
              ) : null}
            </div>
          )}

          {!selectedQuestion && !loadingDetail && (
            <div className="text-gray-500">Select a question to view details.</div>
          )}
        </div>
      </div>

      {/* Right Panel: Editor */}
      <div className="hidden md:flex md:w-1/2 lg:w-[56%] xl:w-[58%] p-4">
        <div className="w-full h-full">
          <Judge0Editor apiBaseUrl={API_BASE_URL} selectedQuestion={selectedQuestion} />
        </div>
      </div>

      {/* On small screens, stack editor below (optional) */}
      <div className="md:hidden p-4 border-t">
        <Judge0Editor apiBaseUrl={API_BASE_URL} selectedQuestion={selectedQuestion} />
      </div>
    </div>
  );
}

export default App;