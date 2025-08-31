import React, { useState } from "react";
import axios from "axios";
import toast, { Toaster } from "react-hot-toast";
import Editor from "@monaco-editor/react";

const API_BASE_URL =
  process.env.REACT_APP_API_BASE_URL || "https://coding-platform-teq9.onrender.com/api";

const availableLanguages = [
  { languageId: 62, languageName: "Java 17" },
  { languageId: 71, languageName: "Python 3.8" },
  { languageId: 54, languageName: "C++ 17" },
];

const availableSeniorities = ["Junior", "Mid", "Senior"];

function detectLanguage(langName) {
  if (!langName) return "plaintext";
  const lower = langName.toLowerCase();
  if (lower.includes("java")) return "java";
  if (lower.includes("python")) return "python";
  if (lower.includes("c++")) return "cpp";
  return "plaintext";
}

export default function AIQuestionGenerator() {
  const [step, setStep] = useState(1);
  const [formData, setFormData] = useState({
    jobDescription: "",
    seniorityLevels: [], // multiple
    experienceMin: 0,
    experienceMax: 5,
    numQuestions: 3,
    totalTime: 60,
    model: "openai",
    languages: [],
    distribution: { Easy: 30, Medium: 50, Hard: 20 },
  });

  const [questions, setQuestions] = useState([]);
  const [loading, setLoading] = useState(false);
  const [activeScaffoldTab, setActiveScaffoldTab] = useState({});

  const handleChange = (e) =>
    setFormData({ ...formData, [e.target.name]: e.target.value });

  const toggleSeniority = (level) => {
    setFormData((prev) => ({
      ...prev,
      seniorityLevels: prev.seniorityLevels.includes(level)
        ? prev.seniorityLevels.filter((s) => s !== level)
        : [...prev.seniorityLevels, level],
    }));
  };

  const generateQuestions = async () => {
    setLoading(true);
    toast.loading("Generating questions...");
    try {
      const distributionOverride = {
        Easy: Math.round((formData.numQuestions * formData.distribution.Easy) / 100),
        Medium: Math.round((formData.numQuestions * formData.distribution.Medium) / 100),
        Hard: Math.round((formData.numQuestions * formData.distribution.Hard) / 100),
      };
      const res = await axios.post(`${API_BASE_URL}/generate-questions`, {
        ...formData,
        distributionOverride,
      });
      setQuestions(res.data.questions);
      setStep(3);
      toast.dismiss();
      toast.success("Questions generated successfully!");
    } catch (err) {
      console.error("Error generating questions:", err.response?.data || err.message);
      toast.dismiss();
      toast.error("Failed to generate questions. Please try again.");
    }
    setLoading(false);
  };

  const saveQuestions = async (draft) => {
    toast.loading("Saving questions...");
    try {
      await axios.post(`${API_BASE_URL}/save-questions`, { questions, draft });
      setQuestions([]);
      setStep(1);
      toast.dismiss();
      toast.success(draft ? "Draft saved!" : "Questions saved successfully!");
    } catch (err) {
      console.error("Error saving questions:", err.response?.data || err.message);
      toast.dismiss();
      toast.error("Error saving questions. Try again.");
    }
  };

  const regenerateQuestion = async (i, q) => {
    toast.loading(`Regenerating ${q.difficulty} question...`);
    try {
      const res = await axios.post(`${API_BASE_URL}/regenerate-question`, {
        jobDescription: formData.jobDescription,
        seniorityLevels: formData.seniorityLevels,
        experienceMin: formData.experienceMin,
        experienceMax: formData.experienceMax,
        difficulty: q.difficulty,
        model: formData.model,
        languages: formData.languages,
      });
      const newQuestions = [...questions];
      newQuestions[i] = res.data.question;
      setQuestions(newQuestions);
      toast.dismiss();
      toast.success("Question regenerated!");
    } catch (err) {
      console.error("Failed to regenerate:", err.response?.data || err.message);
      toast.dismiss();
      toast.error("Failed to regenerate question.");
    }
  };

  const updateScaffold = (qi, langId, newCode) => {
    setQuestions((prev) =>
      prev.map((q, idx) =>
        idx === qi
          ? {
              ...q,
              scaffolds: q.scaffolds.map((s) =>
                s.languageId === langId ? { ...s, body: newCode } : s
              ),
            }
          : q
      )
    );
  };

  return (
    <div className="p-6 space-y-6 max-w-5xl mx-auto">
      <Toaster position="top-right" />
      <h1 className="text-2xl font-bold">AI Question Generator</h1>

      {/* Stepper */}
      <div className="flex items-center gap-4 mb-4">
        {["Job Description", "Parameters", "Preview"].map((label, idx) => {
          const stepNum = idx + 1;
          return (
            <div key={label} className="flex items-center gap-2">
              <div
                className={`w-8 h-8 flex items-center justify-center rounded-full border font-bold ${
                  step === stepNum ? "bg-indigo-600 text-white" : "bg-gray-200 text-gray-700"
                }`}
              >
                {stepNum}
              </div>
              <span className={step === stepNum ? "font-semibold" : "text-gray-500"}>
                {label}
              </span>
            </div>
          );
        })}
      </div>

      {/* Step 1 */}
      {step === 1 && (
        <div className="p-6 bg-white rounded shadow space-y-4">
          <textarea
            name="jobDescription"
            placeholder="Paste Job Description..."
            value={formData.jobDescription}
            onChange={handleChange}
            className="w-full p-3 border rounded h-48"
          />
          <button
            onClick={() => setStep(2)}
            className="px-4 py-2 bg-indigo-600 text-white rounded hover:bg-indigo-700"
          >
            Next →
          </button>
        </div>
      )}

      {/* Step 2 */}
      {step === 2 && (
        <div className="p-6 bg-white rounded shadow space-y-6">
          {/* Seniority (multiple) */}
          <div>
            <label className="block text-sm font-medium mb-2">Seniority Levels</label>
            <div className="flex gap-4">
              {availableSeniorities.map((level) => (
                <label key={level} className="flex items-center gap-1">
                  <input
                    type="checkbox"
                    checked={formData.seniorityLevels.includes(level)}
                    onChange={() => toggleSeniority(level)}
                  />
                  {level}
                </label>
              ))}
            </div>
          </div>

          {/* Experience Range */}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium mb-1">Experience Min (years)</label>
              <input
                type="number"
                name="experienceMin"
                value={formData.experienceMin}
                onChange={handleChange}
                className="w-full border p-2 rounded"
              />
            </div>
            <div>
              <label className="block text-sm font-medium mb-1">Experience Max (years)</label>
              <input
                type="number"
                name="experienceMax"
                value={formData.experienceMax}
                onChange={handleChange}
                className="w-full border p-2 rounded"
              />
            </div>
          </div>

          {/* Questions & Time */}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium mb-1">Number of Questions</label>
              <input
                type="number"
                name="numQuestions"
                value={formData.numQuestions}
                onChange={handleChange}
                className="w-full border p-2 rounded"
              />
            </div>
            <div>
              <label className="block text-sm font-medium mb-1">Total Time (minutes)</label>
              <input
                type="number"
                name="totalTime"
                value={formData.totalTime}
                onChange={handleChange}
                className="w-full border p-2 rounded"
              />
            </div>
          </div>

          {/* Difficulty */}
          <div>
            <label className="block text-sm font-medium mb-2">Difficulty Distribution (%)</label>
            {["Easy", "Medium", "Hard"].map((d) => (
              <div key={d} className="flex items-center gap-2 my-1">
                <label className="w-20">{d}</label>
                <input
                  type="number"
                  value={formData.distribution[d]}
                  onChange={(e) =>
                    setFormData({
                      ...formData,
                      distribution: {
                        ...formData.distribution,
                        [d]: parseInt(e.target.value),
                      },
                    })
                  }
                  className="border p-1 w-20 rounded"
                />
              </div>
            ))}
          </div>

          {/* Languages */}
          <div className="border p-3 rounded">
            <label className="block text-sm font-medium mb-2">Allowed Languages</label>
            <div className="flex gap-2 flex-wrap mt-2">
              {availableLanguages.map((lang) => (
                <label key={lang.languageId} className="flex items-center gap-1">
                  <input
                    type="checkbox"
                    checked={formData.languages.some((l) => l.languageId === lang.languageId)}
                    onChange={(e) => {
                      if (e.target.checked) {
                        setFormData({ ...formData, languages: [...formData.languages, lang] });
                      } else {
                        setFormData({
                          ...formData,
                          languages: formData.languages.filter((l) => l.languageId !== lang.languageId),
                        });
                      }
                    }}
                  />
                  {lang.languageName}
                </label>
              ))}
            </div>
          </div>

          {/* Model */}
          <div>
            <label className="block text-sm font-medium mb-1">AI Model</label>
            <select
              name="model"
              value={formData.model}
              onChange={handleChange}
              className="w-full border p-2 rounded"
            >
              <option value="openai">OpenAI GPT</option>
              <option value="gemini">Google Gemini</option>
            </select>
          </div>

          {/* Buttons */}
          <div className="flex gap-4">
            <button
              onClick={generateQuestions}
              disabled={loading}
              className="px-4 py-2 bg-green-600 text-white rounded hover:bg-green-700"
            >
              {loading ? "Generating..." : "Generate Questions"}
            </button>
            <button
              onClick={() => setStep(1)}
              className="px-4 py-2 border rounded hover:bg-gray-100"
            >
              ← Back
            </button>
          </div>
        </div>
      )}

      {/* Step 3 */}
      {step === 3 && (
        <div className="space-y-4">
          <h2 className="font-bold text-lg">Generated Questions</h2>
          <div className="space-y-4">
            {questions.map((q, i) => (
              <div key={i} className="rounded-lg border shadow bg-white overflow-hidden">
                {/* Header */}
                <button
                  onClick={() =>
                    document.getElementById(`q-content-${i}`).classList.toggle("hidden")
                  }
                  className="w-full flex justify-between items-center px-4 py-3 bg-gray-50 border-b hover:bg-gray-100"
                >
                  <div>
                    <h3 className="font-semibold">{q.title}</h3>
                    <div className="flex gap-2 mt-1 text-xs">
                      <span
                        className={`px-2 py-0.5 rounded-full border ${
                          q.difficulty === "Easy"
                            ? "bg-green-50 border-green-200 text-green-700"
                            : q.difficulty === "Medium"
                            ? "bg-yellow-50 border-yellow-200 text-yellow-700"
                            : "bg-red-50 border-red-200 text-red-700"
                        }`}
                      >
                        {q.difficulty}
                      </span>
                      {q.tags?.map((tag) => (
                        <span
                          key={tag}
                          className="px-2 py-0.5 rounded-full bg-indigo-50 border border-indigo-200 text-indigo-700"
                        >
                          {tag}
                        </span>
                      ))}
                    </div>
                  </div>
                  <span className="text-gray-500">▼</span>
                </button>

                {/* Content */}
                <div id={`q-content-${i}`} className="hidden p-4 space-y-4">
                  <p className="text-sm">{q.description}</p>

                  {/* Sample Case */}
                  <div>
                    <p className="font-medium text-sm mb-1">Sample Test Case</p>
                    <pre className="bg-gray-100 border rounded p-2 text-sm max-h-32 overflow-auto">
                      {q.sampleInput} → {q.sampleOutput}
                    </pre>
                  </div>

                  {/* Scaffolds */}
                  {q.scaffolds?.length > 0 && (
                    <div>
                      <div className="flex gap-2 mb-2">
                        {q.scaffolds.map((s) => (
                          <button
                            key={s.languageId}
                            onClick={() =>
                              setActiveScaffoldTab({ ...activeScaffoldTab, [i]: s.languageId })
                            }
                            className={`px-3 py-1 text-sm rounded border ${
                              activeScaffoldTab[i] === s.languageId
                                ? "bg-indigo-600 text-white"
                                : "bg-gray-100 hover:bg-gray-200"
                            }`}
                          >
                            {s.languageName}
                          </button>
                        ))}
                      </div>
                      {q.scaffolds
                        .filter(
                          (s) =>
                            s.languageId === activeScaffoldTab[i] ||
                            (!activeScaffoldTab[i] && s === q.scaffolds[0])
                        )
                        .map((s) => (
                          <Editor
                            key={s.languageId}
                            height="250px"
                            defaultLanguage={detectLanguage(s.languageName)}
                            value={s.body}
                            onChange={(newValue) => updateScaffold(i, s.languageId, newValue)}
                            theme="vs-dark"
                            options={{
                              minimap: { enabled: false },
                              fontSize: 13,
                              scrollBeyondLastLine: false,
                            }}
                          />
                        ))}
                    </div>
                  )}

                  <button
                    onClick={() => regenerateQuestion(i, q)}
                    className="px-3 py-1 text-sm border rounded hover:bg-gray-100"
                  >
                    ♻ Regenerate
                  </button>
                </div>
              </div>
            ))}
          </div>

          {/* Summary */}
          <div className="p-4 border rounded shadow bg-white">
            <h3 className="font-semibold mb-2">Screening Test Summary</h3>
            <p>Questions: {questions.length}</p>
            <p>
              Distribution: {questions.filter((q) => q.difficulty === "Easy").length} Easy,{" "}
              {questions.filter((q) => q.difficulty === "Medium").length} Medium,{" "}
              {questions.filter((q) => q.difficulty === "Hard").length} Hard
            </p>
            <p>Languages: {formData.languages.map((l) => l.languageName).join(", ")}</p>
            <p>Total Duration: {formData.totalTime} mins</p>
          </div>

          <div className="flex gap-4">
            <button
              onClick={() => saveQuestions(true)}
              className="px-4 py-2 border rounded hover:bg-gray-100"
            >
              💾 Save as Draft
            </button>
            <button
              onClick={() => saveQuestions(false)}
              className="px-4 py-2 bg-green-600 text-white rounded hover:bg-green-700"
            >
              ✅ Confirm & Save
            </button>
          </div>
        </div>
      )}
    </div>
  );
}