const express = require("express");
const axios = require("axios");
const Question = require("../models/Question");
const Scaffold = require("../models/Scaffold");

const router = express.Router();

/** ---------- JSON Healing Utils ---------- */
function healJsonString(str) {
  return str
    .replace(/[\u0000-\u0019]+/g, " ")
    .replace(/,\s*([}\]])/g, "$1")
    .replace(/([^\\])\n/g, "$1\\n")
    .replace(/\\(?!["\\/bfnrtu])/g, "\\\\");
}

function extractJsonArray(text) {
  if (!text) return [];
  let cleaned = text.replace(/```json/gi, "").replace(/```/g, "").trim();

  try {
    const parsed = JSON.parse(cleaned);
    if (Array.isArray(parsed)) return parsed;
  } catch (_) {}

  const firstIdx = cleaned.indexOf("[");
  const lastIdx = cleaned.lastIndexOf("]");
  if (firstIdx !== -1 && lastIdx !== -1 && lastIdx > firstIdx) {
    let jsonSub = cleaned.slice(firstIdx, lastIdx + 1);
    try {
      const parsed = JSON.parse(jsonSub);
      if (Array.isArray(parsed)) return parsed;
    } catch (err) {
      try {
        const healed = healJsonString(jsonSub);
        const parsed = JSON.parse(healed);
        if (Array.isArray(parsed)) {
          console.log("💊 Healed JSON parse succeeded");
          return parsed;
        }
      } catch (err2) {
        console.error("❌ Healed parse failed:", err2.message);
      }
    }
  }
  return [];
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
  const distance = matrix[a.length][b.length];
  return 1 - distance / Math.max(a.length, b.length);
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

/** ---------- Validator & Normalizer ---------- */
function isValidQuestion(q, languages) {
  return (
    q &&
    q.title &&
    q.description &&
    q.sampleInput &&
    q.sampleOutput &&
    Array.isArray(q.testCases) &&
    q.testCases.length >= 5 &&
    Array.isArray(q.scaffolds) &&
    q.scaffolds.length === languages.length &&
    q.scaffolds.every((s) => s.body && s.body.includes("solve"))
  );
}

function normalizeQuestion(q, languages) {
  return {
    title: q?.title || "Untitled Question",
    description: q?.description || "No description provided.",
    difficulty: q?.difficulty || "Easy",
    tags: Array.isArray(q?.tags) ? q.tags : [],
    testCases:
      Array.isArray(q?.testCases) && q.testCases.length >= 5
        ? q.testCases
        : [
            { input: "1", output: "1", score: 1, explanation: "Placeholder", visible: true },
            { input: "2", output: "2", score: 1, explanation: "Placeholder", visible: false },
            { input: "3", output: "3", score: 1, explanation: "Placeholder", visible: false },
            { input: "4", output: "4", score: 1, explanation: "Placeholder", visible: false },
            { input: "5", output: "5", score: 1, explanation: "Placeholder", visible: true },
          ],
    sampleInput: q?.sampleInput || (q?.testCases?.[0]?.input ?? "1"),
    sampleOutput: q?.sampleOutput || (q?.testCases?.[0]?.output ?? "1"),
    scaffolds: (languages || []).map((lang) => {
      const existing = (q?.scaffolds || []).find((s) => s.languageName === lang.languageName);
      return (
        existing || {
          languageId: lang.languageId,
          languageName: lang.languageName,
          body: generatePlaceholderScaffold(lang.languageName),
        }
      );
    }),
  };
}

/** ---------- Prompt Builder ---------- */
function buildPrompt({ jobDescription, seniorityLevels, experienceRange, distribution, languages }) {
  return `
You are an expert coding interview question generator. Generate exactly:
- ${distribution.Easy} Easy questions
- ${distribution.Medium} Medium questions
- ${distribution.Hard} Hard questions

Job Description: ${jobDescription}
Seniority Levels: ${Array.isArray(seniorityLevels) ? seniorityLevels.join(", ") : seniorityLevels}
Experience Range: ${experienceRange?.min ?? 0}–${experienceRange?.max ?? ""} years
Languages required: ${(languages || []).map((l) => l.languageName || l).join(", ")}

Schema (strict, all fields required):
{
  "title": "string (unique, no random IDs)",
  "description": "string",
  "difficulty": "Easy | Medium | Hard",
  "tags": ["string"],
  "sampleInput": "string",
  "sampleOutput": "string",
  "testCases": [
    { "input": "string", "output": "string", "score": 1, "explanation": "string", "visible": true|false }
  ],
  "scaffolds": [
    { "languageId": number, "languageName": "string", "body": "starter code (driver + solve method with I/O)" }
  ]
}

Rules:
- ≥5 test cases, ≥2 visible.
- sampleInput/sampleOutput must map to a testCase.
- Scaffolds must exist for ALL selected languages with full I/O handling.
- Titles must be descriptive but unique, no random tokens.

Return only a valid JSON array of questions, no commentary.
`;
}

/** ---------- AI Caller ---------- */
async function callAI(primaryModel, prompt) {
  const openaiKey = process.env.OPENAI_API_KEY;
  const geminiKey = process.env.GEMINI_API_KEY;

  async function callOpenAI() {
    const res = await axios.post(
      "https://api.openai.com/v1/chat/completions",
      { model: "gpt-4o-mini", messages: [{ role: "user", content: prompt }], temperature: 0.8 },
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

/** ---------- Retry + Normalization ---------- */
async function ensureValid(question, model, basePrompt, languages, seenCache = []) {
  for (let attempt = 0; attempt < 3; attempt++) {
    const inBatchDup = seenCache.some(
      (q) => levenshtein(q.title, question.title) > 0.85 || levenshtein(q.description, question.description) > 0.85
    );
    const dbDup = await isDuplicate(question);

    if (!inBatchDup && !dbDup && isValidQuestion(question, languages)) {
      return question;
    }

    console.warn(`⚠️ Validation failed, regenerating (attempt ${attempt + 1})...`);
    const retryPrompt = basePrompt + "\n\n⚠️ IMPORTANT: Fix schema, regenerate with ALL required fields, no omissions.";
    let aiResponse = await callAI(model, retryPrompt);
    const [retryQ] = extractJsonArray(aiResponse);
    question = retryQ || question;
  }

  console.warn("⚠️ AI failed after retries, applying normalization fallback.");
  return normalizeQuestion(question, languages);
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

    const grouped = { Easy: [], Medium: [], Hard: [] };
    for (const q of questions) {
      if (grouped[q.difficulty]) grouped[q.difficulty].push(q);
    }
    const selected = [
      ...grouped.Easy.slice(0, distribution.Easy),
      ...grouped.Medium.slice(0, distribution.Medium),
      ...grouped.Hard.slice(0, distribution.Hard),
    ];

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
    const prompt = `
Generate exactly 1 **new unique ${difficulty}** coding question.

Job Description: ${jobDescription}
Seniority Levels: ${Array.isArray(seniorityLevels) ? seniorityLevels.join(", ") : seniorityLevels}
Experience Range: ${experienceRange?.min ?? 0}–${experienceRange?.max ?? ""} years
Languages: ${languages.map((l) => l.languageName || l).join(", ")}

Rules:
- Must follow full schema (title, desc, tags, sample, testCases ≥5, scaffolds).
- sampleInput/sampleOutput must map to a testCase.
- Scaffolds required for ALL selected languages, with driver + solve method + I/O.
- Must not duplicate any previous question.
`;

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

      if (scaffolds && scaffolds.length > 0) {
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