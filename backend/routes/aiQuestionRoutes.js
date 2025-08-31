const express = require("express");
const axios = require("axios");
const Question = require("../models/Question");
const Scaffold = require("../models/Scaffold");

const router = express.Router();

/** ---------- JSON Healing Utils ---------- */
function healJsonString(str) {
  return str
    .replace(/[“”]/g, '"')
    .replace(/[‘’]/g, "'")
    .replace(/[\u0000-\u0019]+/g, " ")
    .replace(/,\s*([}\]])/g, "$1")
    .replace(/([^\\])\n/g, "$1\\n")
    .replace(/\\(?!["\\/bfnrtu])/g, "\\\\");
}

function extractJsonArray(text) {
  if (!text) return [];
  let cleaned = text.replace(/```json/gi, "").replace(/```/g, "").trim();

  // slice between first [ and last ]
  const firstIdx = cleaned.indexOf("[");
  const lastIdx = cleaned.lastIndexOf("]");
  if (firstIdx !== -1 && lastIdx !== -1 && lastIdx > firstIdx) {
    cleaned = cleaned.slice(firstIdx, lastIdx + 1);
  }

  try {
    return JSON.parse(cleaned);
  } catch {
    try {
      return JSON.parse(healJsonString(cleaned));
    } catch (err2) {
      console.error("❌ Healed parse failed:", err2.message);
      return [];
    }
  }
}

/** ---------- Fuzzy Similarity (Levenshtein) ---------- */
function levenshtein(a, b) {
  if (!a || !b) return 1.0;
  const matrix = Array.from({ length: a.length + 1 }, () =>
    Array(b.length + 1).fill(0)
  );
  for (let i = 0; i <= a.length; i++) matrix[i][0] = i;
  for (let j = 0; j <= b.length; j++) matrix[0][j] = j;
  for (let i = 1; i <= a.length; i++) {
    for (let j = 1; j <= b.length; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      matrix[i][j] = Math.min(
        matrix[i - 1][j] + 1,
        matrix[i][j - 1] + 1,
        matrix[i - 1][j - 1] + cost
      );
    }
  }
  return 1 - matrix[a.length][b.length] / Math.max(a.length, b.length);
}

/** ---------- DB Duplicate Check ---------- */
async function isDuplicate(question) {
  const existing = await Question.find({}, { title: 1, description: 1 }).lean();
  for (const ex of existing) {
    const titleSim = levenshtein(question.title, ex.title);
    const descSim = levenshtein(question.description, ex.description);
    if (titleSim > 0.85 || descSim > 0.85) return true;
  }
  return false;
}

/** ---------- Scaffold Placeholder Generator ---------- */
function generatePlaceholderScaffold(lang) {
  if (lang.includes("Java")) {
    return `import java.util.*;\npublic class Main {\n  public static void main(String[] args) {\n    Scanner sc = new Scanner(System.in);\n    // TODO: parse input and call solve()\n  }\n  static void solve() {\n    // TODO: implement\n  }\n}`;
  }
  if (lang.includes("Python")) {
    return `def solve():\n    # TODO: implement\n\nif __name__ == "__main__":\n    solve()`;
  }
  if (lang.includes("C++")) {
    return `#include <bits/stdc++.h>\nusing namespace std;\n\nvoid solve() {\n    // TODO: implement\n}\n\nint main() {\n    ios::sync_with_stdio(false);\n    cin.tie(nullptr);\n    solve();\n    return 0;\n}`;
  }
  return "// TODO: implement scaffold";
}

/** ---------- Prompt Builder ---------- */
function buildPrompt({ jobDescription, seniorityLevels, experienceRange, distribution, languages }) {
  return `
You are an expert coding interview question generator. Generate exactly:
- ${distribution.Easy} Easy
- ${distribution.Medium} Medium
- ${distribution.Hard} Hard

Job Description: ${jobDescription}
Seniority Levels: ${Array.isArray(seniorityLevels) ? seniorityLevels.join(", ") : seniorityLevels}
Experience Range: ${experienceRange?.min ?? 0}–${experienceRange?.max ?? ""} years
Languages required: ${(languages || []).map((l) => l.languageName || l).join(", ")}

Schema (strict, all fields required):
{
  "title": "string (unique, no random IDs)",
  "description": "string (detailed problem statement)",
  "difficulty": "Easy | Medium | Hard",
  "tags": ["string"],
  "sampleInput": "string (must map to a testCase)",
  "sampleOutput": "string (must map to a testCase)",
  "testCases": [
    { "input": "string", "output": "string", "score": 1, "explanation": "string", "visible": true|false }
  ],
  "scaffolds": [
    { "languageId": number, "languageName": "string", "body": "starter code with driver + solve method and I/O parsing" }
  ]
}

Rules:
- ≥5 test cases (normal, edge, boundary). At least 2 visible.
- sampleInput/sampleOutput must always map to a testCase.
- Difficulty split must match distribution exactly.
- Scaffold required for ALL selected languages with driver + I/O (not placeholders).
- Titles must be descriptive but not random IDs.

Return only a valid JSON array, no commentary.
`;
}

/** ---------- AI Caller ---------- */
async function callAI(primaryModel, prompt) {
  const openaiKey = process.env.OPENAI_API_KEY;
  const geminiKey = process.env.GEMINI_API_KEY;

  async function callOpenAI() {
    const res = await axios.post(
      "https://api.openai.com/v1/chat/completions",
      { model: "gpt-4o-mini", messages: [{ role: "user", content: prompt }], temperature: 0.7 },
      { headers: { Authorization: `Bearer ${openaiKey}` } }
    );
    return res.data.choices[0].message.content;
  }
  async function callGemini() {
    const res = await axios.post(
      "https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent",
      { contents: [{ parts: [{ text: prompt }] }] },
      { headers: { "Content-Type": "application/json", "X-goog-api-key": geminiKey } }
    );
    return res.data.candidates?.[0]?.content?.parts?.[0]?.text || "";
  }

  try {
    return primaryModel === "openai" ? await callOpenAI() : await callGemini();
  } catch (err) {
    if (primaryModel === "openai" && geminiKey) return callGemini();
    if (primaryModel === "gemini" && openaiKey) return callOpenAI();
    throw err;
  }
}

/** ---------- Deduplication + Validation ---------- */
async function ensureValid(question, model, basePrompt, languages, seenCache = []) {
  let attempts = 0;
  while (attempts < 3) {
    const inBatchDup = seenCache.some(
      (q) => levenshtein(q.title, question.title) > 0.85 || levenshtein(q.description, question.description) > 0.85
    );
    const dbDup = await isDuplicate(question);

    const hasScaffolds =
      question.scaffolds &&
      question.scaffolds.length === languages.length &&
      question.scaffolds.every((s) => s.body && s.body.includes("solve"));

    const hasTests = question.testCases && question.testCases.length >= 5;
    const hasSample = question.sampleInput && question.sampleOutput;

    if (!inBatchDup && !dbDup && hasScaffolds && hasTests && hasSample) return question;

    attempts++;
    console.warn(`⚠️ Validation failed, regenerating (attempt ${attempts})...`);

    const regenPrompt = basePrompt + `\n\nImportant: Fix missing schema parts (tests, scaffolds with I/O). JSON only.`;
    let aiResponse = await callAI(model, regenPrompt);
    const [regenQ] = extractJsonArray(aiResponse);
    question = regenQ || question;
  }

  // fallback scaffolds if AI fails
  const scaffolds = (languages || []).map((lang) => ({
    languageId: lang.languageId,
    languageName: lang.languageName,
    body: generatePlaceholderScaffold(lang.languageName),
  }));
  return { ...question, scaffolds };
}

/** ---------- Generate Questions ---------- */
router.post("/generate-questions", async (req, res) => {
  const { jobDescription, seniorityLevels, experienceRange, numQuestions, totalTime, model, languages, distributionOverride } = req.body;

  try {
    let distribution = distributionOverride;
    if (!distribution) {
      let easy = Math.floor(numQuestions * 0.3);
      let medium = Math.floor(numQuestions * 0.5);
      let hard = numQuestions - (easy + medium);
      distribution = { Easy: easy, Medium: medium, Hard: hard };
    }

    const prompt = buildPrompt({ jobDescription, seniorityLevels, experienceRange, distribution, languages });
    let aiResponse = await callAI(model, prompt);
    let questions = extractJsonArray(aiResponse);

    // enforce distribution
    const grouped = { Easy: [], Medium: [], Hard: [] };
    for (const q of questions) if (grouped[q.difficulty]) grouped[q.difficulty].push(q);
    const selected = [
      ...grouped.Easy.slice(0, distribution.Easy),
      ...grouped.Medium.slice(0, distribution.Medium),
      ...grouped.Hard.slice(0, distribution.Hard),
    ];

    // distribute totalTime exactly
    const baseTime = Math.floor(totalTime / numQuestions);
    const extra = totalTime - baseTime * numQuestions;

    const uniqueQuestions = [];
    for (let idx = 0; idx < selected.length; idx++) {
      let q = selected[idx];
      const uq = await ensureValid(q, model, prompt, languages, uniqueQuestions);
      uniqueQuestions.push({
        ...uq,
        timeAllowed: baseTime + (idx < extra ? 1 : 0),
      });
    }

    res.json({ questions: uniqueQuestions, distribution });
  } catch (err) {
    res.status(500).json({ error: "Failed to generate questions" });
  }
});

/** ---------- Regenerate Question ---------- */
router.post("/regenerate-question", async (req, res) => {
  const { jobDescription, seniorityLevels, experienceRange, difficulty, model, languages, timeAllowed } = req.body;

  try {
    const prompt = buildPrompt({
      jobDescription,
      seniorityLevels,
      experienceRange,
      distribution: { Easy: difficulty === "Easy" ? 1 : 0, Medium: difficulty === "Medium" ? 1 : 0, Hard: difficulty === "Hard" ? 1 : 0 },
      languages,
    });

    let aiResponse = await callAI(model, prompt);
    let [question] = extractJsonArray(aiResponse);
    question = await ensureValid(question, model, prompt, languages);

    res.json({ question: { ...question, timeAllowed: timeAllowed || 15 } });
  } catch (err) {
    res.status(500).json({ error: "Failed to regenerate question" });
  }
});

/** ---------- Save Questions + Scaffolds ---------- */
router.post("/save-questions", async (req, res) => {
  try {
    const { questions, draft } = req.body;
    let savedQuestions = [];

    for (const q of questions) {
      const { scaffolds, ...questionData } = q;
      const question = new Question({ ...questionData, draft: !!draft });
      await question.save();

      if (scaffolds?.length > 0) {
        const scaffoldDocs = scaffolds.map((s) => ({ ...s, questionId: question._id }));
        await Scaffold.insertMany(scaffoldDocs);
      }
      savedQuestions.push(question);
    }
    res.json(savedQuestions);
  } catch (err) {
    res.status(500).json({ error: "Failed to save questions with scaffolds" });
  }
});

module.exports = router;