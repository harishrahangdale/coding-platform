const express = require("express");
const axios = require("axios");
const Question = require("../models/Question");
const Scaffold = require("../models/Scaffold");

const router = express.Router();

/** ---------- JSON Healing Utils ---------- */
function healJsonString(str) {
  return str
    .replace(/[\u0000-\u0019]+/g, " ")        // remove control chars
    .replace(/,\s*([}\]])/g, "$1")            // strip trailing commas
    .replace(/([^\\])\n/g, "$1\\n")           // escape unescaped newlines
    .replace(/\\(?!["\\/bfnrtu])/g, "\\\\")   // fix bad backslashes
    .replace(/“|”/g, '"')                     // curly quotes → straight
    .replace(/‘|’/g, "'")                     // curly apostrophes → straight
    .replace(/：/g, ":")                      // full-width colon → ASCII
    .replace(/，/g, ",")                      // full-width comma → ASCII
    .replace(/\s+/g, " ")                     // collapse weird spacing
    .trim();
}

function extractJsonArray(text) {
  if (!text) return [];

  // Strip markdown fences or explanations
  let cleaned = text
    .replace(/```json/gi, "")
    .replace(/```/g, "")
    .replace(/^\s*Schema.*?\{[\s\S]*?\}\s*/i, "") // drop echoed schema object at top
    .trim();

  // Attempt direct parse first
  try {
    const parsed = JSON.parse(cleaned);
    if (Array.isArray(parsed)) return parsed;
  } catch (_) {}

  // Try slicing [ ... ]
  const firstIdx = cleaned.indexOf("[");
  const lastIdx = cleaned.lastIndexOf("]");
  if (firstIdx !== -1 && lastIdx !== -1 && lastIdx > firstIdx) {
    let jsonSub = cleaned.slice(firstIdx, lastIdx + 1);

    // Direct parse attempt
    try {
      return JSON.parse(jsonSub);
    } catch (err) {
      console.warn("⚠️ Direct parse failed, healing JSON...");
      try {
        const healed = healJsonString(jsonSub);
        return JSON.parse(healed);
      } catch (err2) {
        console.error("❌ Healed parse failed:", err2.message);
      }
    }
  }

  console.error("❌ extractJsonArray failed, raw snippet:", cleaned.slice(0, 500));
  return [];
}

/** ---------- Levenshtein ---------- */
function levenshtein(a, b) {
  if (!a || !b) return 1.0;
  const matrix = Array.from({ length: a.length + 1 }, () => Array(b.length + 1).fill(0));
  for (let i = 0; i <= a.length; i++) matrix[i][0] = i;
  for (let j = 0; j <= b.length; j++) matrix[0][j] = j;
  for (let i = 1; i <= a.length; i++) {
    for (let j = 1; j <= b.length; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      matrix[i][j] = Math.min(matrix[i - 1][j] + 1, matrix[i][j - 1] + 1, matrix[i - 1][j - 1] + cost);
    }
  }
  const distance = matrix[a.length][b.length];
  return 1 - distance / Math.max(a.length, b.length);
}

async function isDuplicate(question) {
  const existing = await Question.find({}, { title: 1, description: 1 }).lean();
  for (const ex of existing) {
    if (levenshtein(question.title, ex.title) > 0.85 || levenshtein(question.description, ex.description) > 0.85)
      return true;
  }
  return false;
}

/** ---------- Scaffold Placeholder ---------- */
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

/** ---------- Schema Validator ---------- */
function isValidQuestion(q, languages) {
  if (!q?.title || !q?.description) return false;
  if (!q.sampleInput || !q.sampleOutput) return false;
  if (!Array.isArray(q.testCases) || q.testCases.length < 5) return false;
  if (!Array.isArray(q.scaffolds) || q.scaffolds.length !== languages.length) return false;
  if (!q.scaffolds.every((s) => s.body && s.body.includes("solve"))) return false;
  return true;
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
    sampleInput: q?.sampleInput || "1",
    sampleOutput: q?.sampleOutput || "1",
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
    You are an expert coding interview question generator. Your job is to generate coding questions strictly following the schema and rules below.

    IMPORTANT: First, repeat the schema object exactly as shown, then output only valid JSON array of questions (no commentary, no markdown).

    Strict Schema (all fields required):
    {
    "title": "string (clear, descriptive, unique, NO random IDs)",
    "description": "string (detailed problem statement)",
    "difficulty": "Easy | Medium | Hard",
    "tags": ["string"],
    "sampleInput": "string (must match exactly one testCase input)",
    "sampleOutput": "string (must match the output of that testCase)",
    "testCases": [
        { "input": "string", "output": "string", "score": 1, "explanation": "string", "visible": true|false }
    ],
    "scaffolds": [
        { "languageId": number, "languageName": "string", "body": "starter code with driver + solve() + I/O handling" }
    ]
    }

    Requirements:
    - Exactly ${distribution.Easy} Easy, ${distribution.Medium} Medium, ${distribution.Hard} Hard questions.
    - Job: ${jobDescription}
    - Seniority Levels: ${Array.isArray(seniorityLevels) ? seniorityLevels.join(", ") : seniorityLevels}
    - Experience Range: ${experienceRange?.min ?? 0}-${experienceRange?.max ?? ""} years
    - Supported Languages: ${(languages || []).map((l) => l.languageName || l).join(", ")}

    Test Case Rules:
    - Always at least 5 test cases covering normal, edge, and boundary conditions.
    - At least 2 test cases must be marked visible.
    - Each testCase must have an explanation.
    - sampleInput/sampleOutput must never be empty or "N/A" and must directly map to a real testCase.

    Scaffold Rules:
    - Scaffolds are required for ALL selected languages.
    - Each scaffold must include:
    - Proper imports/wrappers for Judge0.
        - Java → must be inside "public class Main" with a static solve method.
        - Python → must define "def solve(...):" and call it inside main block.
        - C++ → must include "#include <bits/stdc++.h>" and have a solve() + main() driver.
    - A driver/main method that parses stdin and prints result to stdout (Hackerrank/Hackerearth style).
    - A single public solve() method/function with only a TODO comment (user writes logic).
    - Scaffold must NOT be left blank or as a placeholder.

    Additional Rules:
    - Titles must be descriptive and unique (avoid repetition, synonyms count as duplicates).
    - Difficulty must match exactly the requested distribution.
    - Return only a valid JSON array of question objects.
    - Do not include explanations, commentary, markdown fences, or any extra text outside JSON.
    `;
}


/** ---------- AI Caller ---------- */
async function callAI(primaryModel, prompt) {
  const openaiKey = process.env.OPENAI_API_KEY;
  const geminiKey = process.env.GEMINI_API_KEY;

  async function callOpenAI() {
    console.log("⚡ Calling OpenAI GPT...");
    console.log("📝 Prompt snippet:", prompt.slice(0, 500));
    const res = await axios.post(
      "https://api.openai.com/v1/chat/completions",
      { model: "gpt-4o-mini", messages: [{ role: "user", content: prompt }], temperature: 0.8 },
      { headers: { Authorization: `Bearer ${openaiKey}` } }
    );
    const txt = res.data.choices[0].message.content;
    console.log("🤖 OpenAI resp snippet:", txt.slice(0, 500));
    return txt;
  }

  async function callGemini() {
    console.log("⚡ Calling Gemini...");
    console.log("📝 Prompt snippet:", prompt.slice(0, 500));
    const res = await axios.post(
      "https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent",
      { contents: [{ parts: [{ text: prompt }] }] },
      { headers: { "Content-Type": "application/json", "X-goog-api-key": geminiKey } }
    );
    const txt = res.data.candidates?.[0]?.content?.parts?.[0]?.text || "";
    console.log("🤖 Gemini resp snippet:", txt.slice(0, 500));
    return txt;
  }

  try {
    return primaryModel === "openai" ? await callOpenAI() : await callGemini();
  } catch (err) {
    if (primaryModel === "openai" && geminiKey) return callGemini();
    if (primaryModel === "gemini" && openaiKey) return callOpenAI();
    throw err;
  }
}

/** ---------- Retry + Normalize ---------- */
async function ensureValid(question, model, basePrompt, languages, seenCache = []) {
  for (let attempt = 0; attempt < 3; attempt++) {
    const inBatchDup = seenCache.some(
      (q) => levenshtein(q.title, question.title) > 0.85 || levenshtein(q.description, question.description) > 0.85
    );
    const dbDup = await isDuplicate(question);

    if (!inBatchDup && !dbDup && isValidQuestion(question, languages)) return question;

    console.warn("⚠️ Validation failed attempt", attempt + 1, {
      inBatchDup,
      dbDup,
      title: question.title,
      hasTests: question.testCases?.length,
      hasScaffolds: question.scaffolds?.length,
    });

    const retryPrompt = basePrompt + "\n\nIMPORTANT: regenerate strictly with all schema fields.";
    const retryResp = await callAI(model, retryPrompt);
    const [retryQ] = extractJsonArray(retryResp);
    question = retryQ || question;
  }
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
    const aiResp = await callAI(model, prompt);
    let questions = extractJsonArray(aiResp);

    const grouped = { Easy: [], Medium: [], Hard: [] };
    for (const q of questions) if (grouped[q.difficulty]) grouped[q.difficulty].push(q);

    const selected = [
      ...grouped.Easy.slice(0, distribution.Easy),
      ...grouped.Medium.slice(0, distribution.Medium),
      ...grouped.Hard.slice(0, distribution.Hard),
    ];

    const baseTime = Math.floor(totalTime / numQuestions);
    const extra = totalTime - baseTime * numQuestions;

    const finalQs = [];
    for (let idx = 0; idx < selected.length; idx++) {
      let uq = await ensureValid(selected[idx], model, prompt, languages, finalQs);
      finalQs.push({ ...uq, timeAllowed: baseTime + (idx < extra ? 1 : 0) });
    }

    res.json({ questions: finalQs, distribution });
  } catch (err) {
    console.error("❌ Generation error:", err.response?.data || err.message);
    res.status(500).json({ error: "Failed to generate questions" });
  }
});

/** ---------- Regenerate Question ---------- */
router.post("/regenerate-question", async (req, res) => {
  const { jobDescription, seniorityLevels, experienceRange, difficulty, model, languages, timeAllowed } = req.body;

  try {
    // Build strict schema-first prompt with exactly 1 question of the requested difficulty
    const prompt = `
    You are an expert coding interview question generator. Your job is to regenerate exactly 1 unique ${difficulty} coding question strictly following the schema and rules below.

    IMPORTANT: First, repeat the schema object exactly as shown, then output only valid JSON array with exactly 1 question object (no commentary, no markdown).

    Strict Schema (all fields required):
    {
    "title": "string (clear, descriptive, unique, NO random IDs)",
    "description": "string (detailed problem statement)",
    "difficulty": "Easy | Medium | Hard",
    "tags": ["string"],
    "sampleInput": "string (must match exactly one testCase input)",
    "sampleOutput": "string (must match the output of that testCase)",
    "testCases": [
        { "input": "string", "output": "string", "score": 1, "explanation": "string", "visible": true|false }
    ],
    "scaffolds": [
        { "languageId": number, "languageName": "string", "body": "starter code with driver + solve() + I/O handling" }
    ]
    }

    Requirements:
    - Exactly 1 ${difficulty} question.
    - Job: ${jobDescription}
    - Seniority Levels: ${Array.isArray(seniorityLevels) ? seniorityLevels.join(", ") : seniorityLevels}
    - Experience Range: ${experienceRange?.min ?? 0}-${experienceRange?.max ?? ""} years
    - Supported Languages: ${(languages || []).map((l) => l.languageName || l).join(", ")}

    Test Case Rules:
    - Always at least 5 test cases covering normal, edge, and boundary conditions.
    - At least 2 test cases must be marked visible.
    - Each testCase must have an explanation.
    - sampleInput/sampleOutput must never be empty or "N/A" and must directly map to a real testCase.

    Scaffold Rules:
    - Scaffolds are required for ALL selected languages.
    - Each scaffold must include:
    - Proper imports/wrappers for Judge0.
        - Java → "public class Main" with static solve method.
        - Python → "def solve(...)" + main block call.
        - C++ → "#include <bits/stdc++.h>", solve() + main() driver.
    - A driver/main method that parses stdin and prints result to stdout (Hackerrank/Hackerearth style).
    - A single public solve() function/method with only a TODO comment (user writes logic).
    - Scaffold must NOT be blank or placeholder.

    Additional Rules:
    - Title must be descriptive and unique, not repeating earlier ones.
    - Return only a valid JSON array with exactly 1 question object.
    - Do not include explanations, commentary, markdown fences, or extra text outside JSON.
    `;

        // Call AI + enforce validation
        const aiResp = await callAI(model, prompt);
        let [question] = extractJsonArray(aiResp);
        question = await ensureValid(question, model, prompt, languages);

        res.json({ question: { ...question, timeAllowed: timeAllowed || 15 } });
    } catch (err) {
        console.error("❌ Regen error:", err.response?.data || err.message);
        res.status(500).json({ error: "Failed to regenerate question" });
    }
});


/** ---------- Save Questions ---------- */
router.post("/save-questions", async (req, res) => {
  try {
    const { questions, draft } = req.body;
    let saved = [];
    for (const q of questions) {
      const { scaffolds, ...qData } = q;
      const question = new Question({ ...qData, draft: !!draft });
      await question.save();
      if (scaffolds?.length > 0) {
        const docs = scaffolds.map((s) => ({ ...s, questionId: question._id }));
        await Scaffold.insertMany(docs);
      }
      saved.push(question);
    }
    res.json(saved);
  } catch (err) {
    res.status(500).json({ error: "Failed to save" });
  }
});

module.exports = router;