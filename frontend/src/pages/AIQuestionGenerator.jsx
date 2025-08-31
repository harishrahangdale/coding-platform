import React, { useState } from "react";
import axios from "axios";

const availableLanguages = [
  { languageId: 62, languageName: "Java 17" },
  { languageId: 71, languageName: "Python 3.8" },
  { languageId: 54, languageName: "C++ 17" }
];

export default function AIQuestionGenerator() {
  const [step, setStep] = useState(1);
  const [formData, setFormData] = useState({
    jobDescription: "",
    seniorityLevel: "Junior",
    experienceYears: 0,
    numQuestions: 3,
    totalTime: 60,
    model: "openai",
    languages: [],
    distribution: { Easy: 30, Medium: 50, Hard: 20 }
  });

  const [questions, setQuestions] = useState([]);
  const [loading, setLoading] = useState(false);
  const [activeScaffoldTab, setActiveScaffoldTab] = useState({}); // {index: languageId}

  const handleChange = e => setFormData({ ...formData, [e.target.name]: e.target.value });

  const generateQuestions = async () => {
    setLoading(true);
    try {
      const distributionOverride = {
        Easy: Math.round((formData.numQuestions * formData.distribution.Easy) / 100),
        Medium: Math.round((formData.numQuestions * formData.distribution.Medium) / 100),
        Hard: Math.round((formData.numQuestions * formData.distribution.Hard) / 100)
      };
      const res = await axios.post("/api/generate-questions", { ...formData, distributionOverride });
      setQuestions(res.data.questions);
      setStep(3);
    } catch (err) {
      alert("Error generating questions");
    }
    setLoading(false);
  };

  const saveQuestions = async draft => {
    try {
      await axios.post("/api/save-questions", { questions, draft });
      alert(draft ? "Draft saved!" : "Questions saved successfully!");
      setQuestions([]);
      setStep(1);
    } catch (err) {
      alert("Error saving questions");
    }
  };

  const regenerateQuestion = async (i, q) => {
    try {
      const res = await axios.post("/api/regenerate-question", {
        jobDescription: formData.jobDescription,
        seniorityLevel: formData.seniorityLevel,
        experienceYears: formData.experienceYears,
        difficulty: q.difficulty,
        model: formData.model,
        languages: formData.languages
      });
      const newQuestions = [...questions];
      newQuestions[i] = res.data.question;
      setQuestions(newQuestions);
    } catch {
      alert("Failed to regenerate");
    }
  };

  return (
    <div className="p-6 space-y-6 max-w-5xl mx-auto">
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
              <span className={step === stepNum ? "font-semibold" : "text-gray-500"}>{label}</span>
            </div>
          );
        })}
      </div>

      {/* Step 1: JD Input */}
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

      {/* Step 2: Parameters */}
      {step === 2 && (
    <div className="p-6 bg-white rounded shadow space-y-6">
        {/* Seniority & Experience */}
        <div className="grid grid-cols-2 gap-4">
        <div>
            <label className="block text-sm font-medium mb-1">Seniority Level</label>
            <select
            name="seniorityLevel"
            value={formData.seniorityLevel}
            onChange={handleChange}
            className="w-full border p-2 rounded"
            >
            <option>Junior</option>
            <option>Mid</option>
            <option>Senior</option>
            </select>
        </div>

        <div>
            <label className="block text-sm font-medium mb-1">Years of Experience</label>
            <input
            type="number"
            name="experienceYears"
            placeholder="Years of Experience"
            value={formData.experienceYears}
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
            placeholder="Number of Questions"
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
            placeholder="Total Time (mins)"
            value={formData.totalTime}
            onChange={handleChange}
            className="w-full border p-2 rounded"
            />
        </div>
        </div>

        {/* Difficulty sliders */}
        <div>
        <label className="block text-sm font-medium mb-2">Difficulty Distribution (%)</label>
        {["Easy", "Medium", "Hard"].map(d => (
            <div key={d} className="flex items-center gap-2 my-1">
            <label className="w-20">{d}</label>
            <input
                type="number"
                value={formData.distribution[d]}
                onChange={e =>
                setFormData({
                    ...formData,
                    distribution: { ...formData.distribution, [d]: parseInt(e.target.value) }
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
            {availableLanguages.map(lang => (
            <label key={lang.languageId} className="flex items-center gap-1">
                <input
                type="checkbox"
                checked={formData.languages.some(l => l.languageId === lang.languageId)}
                onChange={e => {
                    if (e.target.checked) {
                    setFormData({ ...formData, languages: [...formData.languages, lang] });
                    } else {
                    setFormData({
                        ...formData,
                        languages: formData.languages.filter(l => l.languageId !== lang.languageId)
                    });
                    }
                }}
                />
                {lang.languageName}
            </label>
            ))}
        </div>
        </div>

        {/* Model Selector */}
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


      {/* Step 3: Preview */}
      {step === 3 && (
        <div className="space-y-4">
          <h2 className="font-bold">Generated Questions</h2>
          <div className="space-y-3">
            {questions.map((q, i) => (
              <div key={i} className="border rounded shadow bg-white">
                <button
                  onClick={() =>
                    document.getElementById(`q-content-${i}`).classList.toggle("hidden")
                  }
                  className="w-full text-left px-4 py-2 font-semibold bg-gray-100 border-b"
                >
                  {q.title} <span className="ml-2 text-sm text-gray-600">({q.difficulty})</span>
                </button>
                <div id={`q-content-${i}`} className="hidden p-4 space-y-3">
                  <p>{q.description}</p>
                  <p className="text-sm text-gray-500">Tags: {q.tags?.join(", ")}</p>
                  <div>
                    <p className="font-medium">Sample Test Case:</p>
                    <pre className="bg-gray-100 p-2 rounded">{q.sampleInput} → {q.sampleOutput}</pre>
                  </div>

                  {/* Scaffold Tabs */}
                  {q.scaffolds?.length > 0 && (
                    <div>
                      <div className="flex gap-2 mb-2">
                        {q.scaffolds.map(s => (
                          <button
                            key={s.languageId}
                            onClick={() =>
                              setActiveScaffoldTab({ ...activeScaffoldTab, [i]: s.languageId })
                            }
                            className={`px-3 py-1 rounded border text-sm ${
                              activeScaffoldTab[i] === s.languageId
                                ? "bg-indigo-600 text-white"
                                : "bg-gray-100"
                            }`}
                          >
                            {s.languageName}
                          </button>
                        ))}
                      </div>
                      {q.scaffolds
                        .filter(s => s.languageId === activeScaffoldTab[i] || (!activeScaffoldTab[i] && s === q.scaffolds[0]))
                        .map(s => (
                          <pre
                            key={s.languageId}
                            className="bg-gray-900 text-green-200 p-3 rounded-md overflow-x-auto"
                          >
                            {s.body}
                          </pre>
                        ))}
                    </div>
                  )}

                  <button
                    onClick={() => regenerateQuestion(i, q)}
                    className="px-3 py-1 border rounded text-sm hover:bg-gray-100"
                  >
                    ♻ Regenerate
                  </button>
                </div>
              </div>
            ))}
          </div>

          {/* Summary Card */}
          <div className="p-4 border rounded shadow bg-white">
            <h3 className="font-semibold mb-2">Screening Test Summary</h3>
            <p>Questions: {questions.length}</p>
            <p>
              Distribution:{" "}
              {questions.filter(q => q.difficulty === "Easy").length} Easy,{" "}
              {questions.filter(q => q.difficulty === "Medium").length} Medium,{" "}
              {questions.filter(q => q.difficulty === "Hard").length} Hard
            </p>
            <p>Languages: {formData.languages.map(l => l.languageName).join(", ")}</p>
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