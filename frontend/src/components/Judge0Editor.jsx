import React, { useState, useEffect } from "react";
import Editor from "@monaco-editor/react";
import axios from "axios";

const JUDGE0_LANGUAGES = [
  { id: 62, name: "Java (OpenJDK 13)", monaco: "java" }, // Default
];

export default function Judge0Editor({
  selectedQuestion,
  onRunStart,
  onRunFinish,
}) {
  const [languageId, setLanguageId] = useState(62); // default Java
  const [theme, setTheme] = useState("vs"); // "vs" (light) | "vs-dark"
  const [code, setCode] = useState("");
  const [output, setOutput] = useState("");
  const [isRunning, setIsRunning] = useState(false);

  // When a question is selected, inject scaffold
  useEffect(() => {
    if (selectedQuestion) {
      const scaffold = `import java.util.*;

public class Main {
    public static void main(String[] args) {
        Scanner sc = new Scanner(System.in);
        String s = sc.nextLine();
        System.out.println(solve(s));
    }

    // Implement your logic here
    public static int solve(String s) {
        // Write your code below
        return 0;
    }
}`;
      setCode(scaffold);
    }
  }, [selectedQuestion]);

  const runCode = async () => {
    if (!selectedQuestion?._id) {
      setOutput("Please select a question first.");
      return;
    }

    setIsRunning(true);
    setOutput("Running...");
    onRunStart && onRunStart();

    try {
      const res = await axios.post(`http://localhost:5050/api/run/${selectedQuestion._id}`, {
        finalCode: code,          // ✅ send full code
        language_id: languageId,
      });

      let text = res.data.results
        .map(
          (r, i) =>
            `Test Case ${i + 1}: ${r.status}\nInput: ${r.input}\nExpected: ${r.expected}\nGot: ${r.actual || "No output"}\n`
        )
        .join("\n");
      text += `\nSummary: ${res.data.summary}`;
      setOutput(text);

      onRunFinish && onRunFinish(res.data);
    } catch (err) {
      setOutput(`Error: ${err.response?.data?.error || err.message}`);
      onRunFinish && onRunFinish(null, err);
    } finally {
      setIsRunning(false);
    }
  };

  const toggleTheme = () => {
    setTheme((prev) => (prev === "vs" ? "vs-dark" : "vs"));
  };

  const isDark = theme === "vs-dark";

  return (
    <div className="h-full w-full flex flex-col gap-3">
      {/* Controls */}
      <div className="flex items-center gap-3">
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
          language="java"
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