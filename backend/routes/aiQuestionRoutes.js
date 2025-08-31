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
  "description": "string (detailed problem statement)",
  "difficulty": "Easy | Medium | Hard",
  "tags": ["string"],
  "sampleInput": "string (must map to one of testCases)",
  "sampleOutput": "string (must map to one of testCases)",
  "testCases": [
    { "input": "string", "output": "string", "score": 1, "explanation": "string", "visible": true|false }
  ],
  "scaffolds": [
    { "languageId": number, "languageName": "string", "body": "starter code" }
  ]
}

Rules:
- At least 5 test cases (normal + edge + boundary). At least 2 visible.
- sampleInput/sampleOutput must never be empty or N/A.
- Each difficulty must match exactly the requested distribution.
- Scaffolds required for ALL selected languages.
- Scaffold must include driver + a single solve method with TODO.
- Always include imports/wrappers Judge0 expects:
  - Java → public class Main
  - Python → def solve()
  - C++ → #include <bits/stdc++.h>
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

/** ---------- Deduplication Utility ---------- */
async function ensureUnique(question, model, basePrompt, seenCache = []) {
  let attempts = 0;
  while (attempts < 2) {
    const inBatchDup = seenCache.some(
      (q) => levenshtein(q.title, question.title) > 0.85 || levenshtein(q.description, question.description) > 0.85
    );
    const dbDup = await isDuplicate(question);

    const hasScaffolds = question.scaffolds && question.scaffolds.length > 0;
    const hasTests = question.testCases && question.testCases.length >= 5;
    const hasSample = question.sampleInput && question.sampleOutput;

    if (!inBatchDup && !dbDup && hasScaffolds && hasTests && hasSample) return question;

    attempts++;
    const regenPrompt = basePrompt + `\n\nRegenerate with full schema, avoid duplicates, enforce difficulty.`;
    let aiResponse = await callAI(model, regenPrompt);
    const [regenQ] = extractJsonArray(aiResponse);
    question = regenQ || question;
  }
  return question;
}

/** ---------- Generate Questions ---------- */
router.post("/generate-questions", async (req, res) => {
  const { jobDescription, seniorityLevels, experienceRange, numQuestions, totalTime, model, languages } = req.body;

  try {
    let easy = Math.floor(numQuestions * 0.3);
    let medium = Math.floor(numQuestions * 0.5);
    let hard = numQuestions - (easy + medium);
    const distribution = { Easy: easy, Medium: medium, Hard: hard };

    const prompt = buildPrompt({ jobDescription, seniorityLevels, experienceRange, distribution, languages });
    let aiResponse = await callAI(model, prompt);
    let questions = extractJsonArray(aiResponse);

    // enforce per-difficulty count
    const grouped = { Easy: [], Medium: [], Hard: [] };
    for (const q of questions) {
      if (grouped[q.difficulty]) grouped[q.difficulty].push(q);
    }
    const selected = [
      ...grouped.Easy.slice(0, distribution.Easy),
      ...grouped.Medium.slice(0, distribution.Medium),
      ...grouped.Hard.slice(0, distribution.Hard),
    ];

    const uniqueQuestions = [];
    for (const q of selected) {
      const uq = await ensureUnique(q, model, prompt, uniqueQuestions);
      const scaffolds = (languages || []).map((lang) => {
        const existing = (uq.scaffolds || []).find((s) => s.languageName === lang.languageName);
        return existing || { languageId: lang.languageId, languageName: lang.languageName, body: generatePlaceholderScaffold(lang.languageName) };
      });
      uniqueQuestions.push({ ...uq, scaffolds, timeAllowed: Math.floor(totalTime / numQuestions) || 15 });
    }

    res.json({ questions: uniqueQuestions, distribution });
  } catch (err) {
    res.status(500).json({ error: "Failed to generate questions" });
  }
});

/** ---------- Regenerate Question ---------- */
router.post("/regenerate-question", async (req, res) => {
  const { jobDescription, seniorityLevels, experienceRange, difficulty, model, languages } = req.body;

  try {
    const prompt = `
Generate exactly 1 **new unique ${difficulty}** coding question.

Job Description: ${jobDescription}
Seniority Levels: ${Array.isArray(seniorityLevels) ? seniorityLevels.join(", ") : seniorityLevels}
Experience Range: ${experienceRange?.min ?? 0}–${experienceRange?.max ?? ""} years
Languages: ${languages.map((l) => l.languageName || l).join(", ")}

Schema (strict, all fields required):
{
  "title": "string (unique)",
  "description": "string",
  "difficulty": "${difficulty}",
  "tags": ["string"],
  "sampleInput": "string",
  "sampleOutput": "string",
  "testCases": [
    { "input": "string", "output": "string", "score": 1, "explanation": "string", "visible": true|false }
  ],
  "scaffolds": [
    { "languageId": number, "languageName": "string", "body": "starter code" }
  ]
}

Rules:
- Must include ≥5 test cases (2 visible).
- sampleInput/sampleOutput must map to a testCase.
- Scaffolds required for all selected languages.
- Must not duplicate any previous question.
`;

    let aiResponse = await callAI(model, prompt);
    let [question] = extractJsonArray(aiResponse);
    question = await ensureUnique(question, model, prompt);

    const scaffolds = (languages || []).map((lang) => {
      const existing = (question.scaffolds || []).find((s) => s.languageName === lang.languageName);
      return existing || { languageId: lang.languageId, languageName: lang.languageName, body: generatePlaceholderScaffold(lang.languageName) };
    });

    res.json({ question: { ...question, scaffolds } });
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