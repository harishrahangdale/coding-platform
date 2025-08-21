import React, { useState, useEffect, useMemo } from "react";
import Editor from "@monaco-editor/react";
import axios from "axios";

// Map Judge0 languageId -> Monaco language id
// Extend as you add more languages in your seed.
const JUDGE0_TO_MONACO = {
  50: "c",            // C (GCC)
  54: "cpp",          // C++ (GCC)
  62: "java",         // Java 17
  63: "javascript",   // Node.js
  71: "python",       // Python 3
  75: "csharp",       // .NET (if you add)
};

export default function Judge0Editor({
  apiBaseUrl,            // e.g., "https://coding-platform-teq9.onrender.com/api"
  selectedQuestion,      // question doc from /api/questions/:id
  onRunStart,
  onRunFinish,
}) {
  const [languageId, setLanguageId] = useState(null);
  const [theme, setTheme] = useState("vs"); // "vs" | "vs-dark"
  const [code, setCode] = useState("");
  const [output, setOutput] = useState("");
  const [isRunning, setIsRunning] = useState(false);

  const monacoLanguage = useMemo(() => {
    if (!languageId) return "plaintext";
    return JUDGE0_TO_MONACO[languageId] || "plaintext";
  }, [languageId]);

  // When a new question is selected, default to its first available language
  useEffect(() => {
    if (!selectedQuestion) return;

    const langs = selectedQuestion.languages || [];
    const defaultLangId = langs.length ? langs[0].languageId : 62; // fallback Java 17
    setLanguageId(defaultLangId);
  }, [selectedQuestion?._id]); // reset when question changes

  // Fetch scaffold whenever question or language changes
  useEffect(() => {
    const fetchScaffold = async () => {
      if (!selectedQuestion?._id || !languageId) return;
      try {
        const { data } = await axios.get(
          `${apiBaseUrl}/questions/${selectedQuestion._id}/scaffold/${languageId}`
        );
        setCode(data?.body || "");
      } catch (err) {
        // If no scaffold exists, start with empty template
        setCode("");
      }
    };
    fetchScaffold();
  }, [selectedQuestion?._id, languageId, apiBaseUrl]);

  const runCode = async () => {
    if (!selectedQuestion?._id) {
      setOutput("Please select a question first.");
      return;
    }
    if (!languageId) {
      setOutput("Please select a language.");
      return;
    }

    setIsRunning(true);
    setOutput("Running...");
    onRunStart && onRunStart();

    try {
      const res = await axios.post(
        `${apiBaseUrl}/run/${selectedQuestion._id}`,
        {
          finalCode: code,
          languageId, // backend accepts camelCase or snake_case
        }
      );

      const { results = [], summary = {} } = res.data || {};
      const text =
        results
          .map(
            (r, i) =>
              `Test Case ${i + 1}: ${r.status}\nInput: ${r.input}\nExpected: ${r.expected}\nGot: ${r.actual || "No output"}\nScore: ${r.score}/${r.maxScore}\n`
          )
          .join("\n") +
        `\nSummary: ${summary.message || `${summary.earnedScore}/${summary.maxScore} points`}`;

      setOutput(text);
      onRunFinish && onRunFinish(res.data);
    } catch (err) {
      setOutput(`Error: ${err.response?.data?.error || err.message}`);
      onRunFinish && onRunFinish(null, err);
    } finally {
      setIsRunning(false);
    }
  };

  const toggleTheme = () => setTheme((prev) => (prev === "vs" ? "vs-dark" : "vs"));
  const isDark = theme === "vs-dark";

  const languages = selectedQuestion?.languages || []; // [{languageId, languageName}]

  return (
    <div className="h-full w-full flex flex-col gap-3">
      {/* Controls */}
      <div className="flex flex-wrap items-center gap-3">
        {/* Language dropdown */}
        <div className="flex items-center gap-2">
          <label className="text-sm font-medium">Language:</label>
          <select
            className="border rounded px-2 py-1"
            value={languageId ?? ""}
            onChange={(e) => setLanguageId(Number(e.target.value))}
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
          disabled={isRunning}
          className={`px-4 py-2 rounded text-white ${
            isRunning ? "bg-gray-400" : "bg-blue-600 hover:bg-blue-700"
          }`}
        >
          {isRunning ? "Running..." : "Run Code"}
        </button>

        <button
          onClick={toggleTheme}
          className="px-3 py-2 rounded border ml-auto"
          title="Toggle Light/Dark Theme"
        >
          {isDark ? "☀ Light Mode" : "🌙 Dark Mode"}
        </button>
      </div>

      {/* Editor */}
      <div className="flex-1 min-h-[300px] border rounded overflow-hidden">
        <Editor
          height="100%"
          language={monacoLanguage}
          theme={theme}
          value={code}
          onChange={(val) => setCode(val ?? "")}
          options={{
            fontSize: 14,
            minimap: { enabled: false },
            wordWrap: "on",
            automaticLayout: true,
          }}
        />
      </div>

      {/* Output */}
      <div className="flex flex-col w-full">
        <label className="font-semibold mb-1">Output:</label>
        <pre
          className={`border rounded p-3 font-mono overflow-auto whitespace-pre-wrap min-h-[184px] transition-colors duration-200 ${
            isDark ? "bg-gray-900 text-white" : "bg-gray-100 text-black"
          }`}
        >
          {output}
        </pre>
      </div>
    </div>
  );
}