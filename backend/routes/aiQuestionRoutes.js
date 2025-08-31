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
  if (firstIdx !== -1 && lastIdx > firstIdx) {
    let jsonSub = cleaned.slice(firstIdx, lastIdx + 1);
    try {
      return JSON.parse(jsonSub);
    } catch (err) {
      try {
        return JSON.parse(healJsonString(jsonSub));
      } catch (err2) {
        console.error("❌ extractJsonArray failed:", err2.message);
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

/** ---------- Default Scaffold Generator ---------- */
function defaultScaffold(languageId, languageName) {
  if (languageName.toLowerCase().includes("java")) {
    return `import java.util.*;\npublic class Main {\n  static void solve() {\n    // TODO: implement\n  }\n  public static void main(String[] args) {\n    Scanner sc = new Scanner(System.in);\n    // TODO: parse input and call solve()\n  }\n}`;
  }
  if (languageName.toLowerCase().includes("python")) {
    return `def solve():\n    # TODO: implement\n    pass\n\nif __name__ == "__main__":\n    solve()`;
  }
  if (languageName.toLowerCase().includes("c++")) {
    return `#include <bits/stdc++.h>\nusing namespace std;\n\nvoid solve() {\n    // TODO: implement\n}\n\nint main() {\n    ios::sync_with_stdio(false);\n    cin.tie(nullptr);\n    solve();\n    return 0;\n}`;
  }
  return "// TODO: implement";
}

/** ---------- Prompt Builder ---------- */
function buildPrompt({
  jobDescription,
  seniorityLevels,
  experienceRange,
  numQuestions,
  distribution,
  languages,
}) {
  return `
You are an expert coding interview question generator. Generate ${numQuestions} **unique and complete** coding questions.

Job Description: ${jobDescription}
Seniority Levels: ${
    Array.isArray(seniorityLevels) ? seniorityLevels.join(", ") : seniorityLevels
  }
Experience Range: ${experienceRange?.min ?? 0}–${experienceRange?.max ?? ""} years

Difficulty Distribution:
- Easy: ${distribution.Easy}
- Medium: ${distribution.Medium}
- Hard: ${distribution.Hard}

Languages required (ONLY these): ${(languages || [])
    .map((l) => l.languageName || l)
    .join(", ")}

Schema (must include ALL fields, no omissions):
{
  "title": "string (unique)",
  "description": "string (detailed problem statement)",
  "difficulty": "Easy | Medium | Hard",
  "tags": ["string"],
  "sampleInput": "string (must map to a test case)",
  "sampleOutput": "string (must map to a test case)",
  "testCases": [
    { "input": "string", "output": "string", "score": 1, "explanation": "string", "visible": true|false }
  ],
  "scaffolds": [
    { "languageId": number, "languageName": "string", "body": "starter code with driver + TODO method" }
  ]
}

Rules:
- At least 5 test cases (cover normal, edge, boundary). ≥2 visible.
- sampleInput/sampleOutput must match one of the test cases (never blank/N/A).
- Generate scaffolds ONLY for the selected languages.
- Each scaffold must include:
  - Judge0-safe imports/wrappers.
  - A single TODO method.
  - Driver parsing stdin/stdout.
- Java: public class Main + static method.
- Python: def solve().
- C++: #include <bits/stdc++.h> + int main().

Add randomness, avoid duplicates. Append hidden uniqueness token: ${Date.now()}.

Return only a **valid JSON array** of questions, no commentary.
`;
}

/** ---------- AI Caller ---------- */
async function callAI(primaryModel, prompt) {
  const openaiKey = process.env.OPENAI_API_KEY;
  const geminiKey = process.env.GEMINI_API_KEY;
  async function callOpenAI() {
    const res = await axios.post(
      "https://api.openai.com/v1/chat/completions",
      { model: "gpt-4o-mini", messages: [{ role: "user", content: prompt }], temperature: 0.9 },
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
  while (attempts < 3) {
    const inBatchDup = seenCache.some(
      (q) =>
        levenshtein(q.title, question.title) > 0.85 ||
        levenshtein(q.description, question.description) > 0.85
    );
    const dbDup = await isDuplicate(question);
    if (!inBatchDup && !dbDup) return question;
    attempts++;
    const regenPrompt =
      basePrompt +
      `\n\nImportant: avoid duplicates. Do NOT reuse:\n- ${question.title}\n- ${question.description}\n`;
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

    const prompt = buildPrompt({ jobDescription, seniorityLevels, experienceRange, numQuestions, distribution, languages });
    let aiResponse = await callAI(model, prompt);
    let questions = extractJsonArray(aiResponse);

    const uniqueQuestions = [];
    for (const q of questions) {
      let uq = await ensureUnique(q, model, prompt, uniqueQuestions);
      // Ensure scaffolds exist for all selected languages
      const requiredLangs = languages.map(l => l.languageName);
      const scaffolded = requiredLangs.map(langName => {
        let existing = uq.scaffolds?.find(s => s.languageName === langName);
        if (!existing || !existing.body?.trim()) {
          const langObj = languages.find(l => l.languageName === langName);
          return { languageId: langObj.languageId, languageName: langObj.languageName, body: defaultScaffold(langObj.languageId, langObj.languageName) };
        }
        return existing;
      });
      uq = { ...uq, scaffolds: scaffolded, timeAllowed: Math.floor(totalTime / numQuestions) || 15 };
      uniqueQuestions.push(uq);
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
    const prompt = buildPrompt({ jobDescription, seniorityLevels, experienceRange, numQuestions: 1, distribution: { [difficulty]: 1 }, languages });
    let aiResponse = await callAI(model, prompt);
    let [question] = extractJsonArray(aiResponse);
    question = await ensureUnique(question, model, prompt);
    // Ensure scaffolds for all selected languages
    const requiredLangs = languages.map(l => l.languageName);
    const scaffolded = requiredLangs.map(langName => {
      let existing = question.scaffolds?.find(s => s.languageName === langName);
      if (!existing || !existing.body?.trim()) {
        const langObj = languages.find(l => l.languageName === langName);
        return { languageId: langObj.languageId, languageName: langObj.languageName, body: defaultScaffold(langObj.languageId, langObj.languageName) };
      }
      return existing;
    });
    question = { ...question, scaffolds: scaffolded };
    res.json({ question });
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
        const scaffoldDocs = scaffolds.map(s => ({ ...s, questionId: question._id }));
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