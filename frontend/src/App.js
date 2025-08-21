import React, { useState, useEffect } from "react";
import axios from "axios";
import "./App.css";
import Judge0Editor from "./components/Judge0Editor";

function App() {
  const [questions, setQuestions] = useState([]);
  const [selectedQuestion, setSelectedQuestion] = useState(null);

  // Base URL for backend API (deployed on Render)
  const API_BASE_URL = "https://coding-platform-teq9.onrender.com/api";

  // Load list
  useEffect(() => {
    axios
      .get(`${API_BASE_URL}/questions`)
      .then((res) => setQuestions(res.data))
      .catch((err) => console.error("Error fetching questions:", err));
  }, []);

  // Load detail on click
  const handleQuestionSelect = async (id) => {
    try {
      const { data } = await axios.get(`${API_BASE_URL}/questions/${id}`);
      setSelectedQuestion(data);
      // Editor component will fetch the scaffold for its default language
    } catch (err) {
      console.error("Error fetching question:", err);
    }
  };

  return (
    <div className="flex h-screen">
      {/* Left Panel: Question List + Details */}
      <div className="w-1/2 p-4 overflow-y-auto bg-gray-100">
        <h1 className="text-2xl font-bold mb-4">Coding Platform</h1>

        <h2 className="text-xl font-semibold">Questions</h2>
        <ul className="mb-4">
          {questions.map((q) => (
            <li
              key={q._id}
              className="cursor-pointer p-2 hover:bg-gray-200 rounded flex items-center justify-between"
              onClick={() => handleQuestionSelect(q._id)}
            >
              <span>{q.title}</span>
              {typeof q.totalScore === "number" && (
                <span className="text-xs bg-white border rounded px-2 py-0.5">
                  {q.totalScore} pts
                </span>
              )}
            </li>
          ))}
        </ul>

        {selectedQuestion && (
          <div className="mt-4 space-y-2">
            <h3 className="text-lg font-semibold">{selectedQuestion.title}</h3>
            <p>
              <strong>Difficulty:</strong> {selectedQuestion.difficulty}
            </p>
            {selectedQuestion.tags?.length ? (
              <p>
                <strong>Tags:</strong> {selectedQuestion.tags.join(", ")}
              </p>
            ) : null}
            <p className="whitespace-pre-wrap">
              <strong>Description:</strong>{" "}
              {selectedQuestion.description || "—"}
            </p>

            {/* Sample I/O (display only) */}
            {(selectedQuestion.sampleInput || selectedQuestion.sampleOutput) && (
              <div className="mt-2">
                {selectedQuestion.sampleInput && (
                  <>
                    <div className="font-semibold">Sample Input</div>
                    <pre className="bg-white border rounded p-2 whitespace-pre-wrap">
                      {selectedQuestion.sampleInput}
                    </pre>
                  </>
                )}
                {selectedQuestion.sampleOutput && (
                  <>
                    <div className="font-semibold mt-2">Sample Output</div>
                    <pre className="bg-white border rounded p-2 whitespace-pre-wrap">
                      {selectedQuestion.sampleOutput}
                    </pre>
                  </>
                )}
              </div>
            )}

            {/* Execution limits */}
            <div className="grid grid-cols-3 gap-2 mt-2">
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

            {/* Languages */}
            {selectedQuestion.languages?.length ? (
              <div className="mt-2">
                <div className="font-semibold mb-1">Available Languages:</div>
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
      </div>

      {/* Right Panel: Judge0-powered Editor */}
      <div className="w-1/2 p-4 flex flex-col">
        <Judge0Editor
          apiBaseUrl={API_BASE_URL}
          selectedQuestion={selectedQuestion}
        />
      </div>
    </div>
  );
}

export default App;