import React, { useState, useEffect, useMemo } from "react";
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

export default function Judge0Editor({
  apiBaseUrl,
  selectedQuestion,
  onRunStart,
  onRunFinish,
}) {
  const [languageId, setLanguageId] = useState(null);
  const [theme, setTheme] = useState("vs");
  const [code, setCode] = useState("");
  const [output, setOutput] = useState("");
  const [isRunning, setIsRunning] = useState(false);

  // attempts UI state
  const [attemptsUsed, setAttemptsUsed] = useState(0);
  const maxAttempts = selectedQuestion?.maxAttempts ?? 3;
  const remaining = Math.max(0, maxAttempts - attemptsUsed);
  const attemptsExhausted = remaining <= 0;

  const monacoLanguage = useMemo(() => {
    if (!languageId) return "plaintext";
    return JUDGE0_TO_MONACO[languageId] || "plaintext";
  }, [languageId]);

  // Reset language & load attempts when question changes
  useEffect(() => {
    if (!selectedQuestion?._id) return;

    const langs = selectedQuestion.languages || [];
    const defaultLangId = langs.length ? langs[0].languageId : 62;
    setLanguageId(defaultLangId);

    // load attempts from localStorage
    const used = Number(localStorage.getItem(attemptsKey(selectedQuestion._id)) || 0);
    setAttemptsUsed(isNaN(used) ? 0 : used);

    // clear editor code until scaffold loads
    setCode("");
    setOutput("");
  }, [selectedQuestion?._id]);

  // Fetch scaffold on question/language change
  useEffect(() => {
    const fetchScaffold = async () => {
      if (!selectedQuestion?._id || !languageId) return;
      try {
        const { data } = await axios.get(
          `${apiBaseUrl}/questions/${selectedQuestion._id}/scaffold/${languageId}`
        );
        setCode(data?.body || "");
      } catch {
        setCode("");
      }
    };
    fetchScaffold();
  }, [selectedQuestion?._id, languageId, apiBaseUrl]);

  const persistAttempts = (qId, next) => {
    localStorage.setItem(attemptsKey(qId), String(next));
  };

  const runCode = async () => {
    if (!selectedQuestion?._id) {
      setOutput("Please select a question first.");
      return;
    }
    if (!languageId) {
      setOutput("Please select a language.");
      return;
    }
    if (attemptsExhausted) {
      setOutput(`You've used all ${maxAttempts} attempts for this question.`);
      return;
    }

    setIsRunning(true);
    setOutput("Running...");
    onRunStart && onRunStart();

    try {
      const res = await axios.post(
        `${apiBaseUrl}/run/${selectedQuestion._id}`,
        { finalCode: code, languageId }
      );

      // Use only publicResults (hidden tests are filtered out by backend)
      const publicResults = res.data.publicResults || res.data.results || [];
      const summary = res.data.summary || {};

      const text =
        (publicResults.length
          ? publicResults
              .map(
                (r, i) =>
                  `Test Case ${r.index ?? i + 1}: ${r.status}\n` +
                  `Input: ${r.input}\nExpected: ${r.expected}\nGot: ${r.actual || "No output"}\n` +
                  `Score: ${r.score}/${r.maxScore}\n`
              )
              .join("\n")
          : "No public test cases to display.") +
        `\nSummary: ${summary.message || ""}`;

      setOutput(text);
      onRunFinish && onRunFinish(res.data);
    } catch (err) {
      setOutput(`Error: ${err.response?.data?.error || err.message}`);
      onRunFinish && onRunFinish(null, err);
    } finally {
      // Count this as an attempt (success or error), then disable if needed
      const next = Math.min(maxAttempts, attemptsUsed + 1);
      setAttemptsUsed(next);
      persistAttempts(selectedQuestion._id, next);

      setIsRunning(false);
    }
  };

  const toggleTheme = () => setTheme((prev) => (prev === "vs" ? "vs-dark" : "vs"));
  const isDark = theme === "vs-dark";
  const languages = selectedQuestion?.languages || [];

  return (
    <div className="h-full w-full flex flex-col gap-3">
      {/* Attempts info */}
      {selectedQuestion?._id && (
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
      )}

      {/* Controls */}
      <div className="flex flex-wrap items-center gap-3">
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
            readOnly: attemptsExhausted,
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