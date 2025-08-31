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
      console.warn("⚠️ extractJsonArray fallback parse failed:", err.message);
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
  console.error("❌ extractJsonArray failed, raw snippet:", text.slice(0, 300));
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
    if (titleSim > 0.85 || descSim > 0.85) {
      console.warn(
        `⚠️ Fuzzy DB duplicate found (titleSim=${titleSim.toFixed(
          2
        )}, descSim=${descSim.toFixed(2)})`
      );
      return true;
    }
  }
  return false;
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
  const langs = (languages || [])
    .map((l) => l.languageName || l)
    .join(", ");
  return `
You are an expert coding interview question generator. Generate ${numQuestions} **unique** coding questions.

Job Description: ${jobDescription}
Seniority Levels: ${Array.isArray(seniorityLevels) ? seniorityLevels.join(", ") : seniorityLevels}
Experience Range: ${experienceRange?.min ?? 0}–${experienceRange?.max ?? ""} years

Difficulty Distribution:
- Easy: ${distribution.Easy}
- Medium: ${distribution.Medium}
- Hard: ${distribution.Hard}

Languages required: ${langs}

Rules for each generated question:
- Must strictly follow this schema:
{
  "title": "string (must be unique)",
  "description": "string",
  "difficulty": "Easy | Medium | Hard",
  "tags": ["string"],
  "sampleInput": "string (must exactly match the input of the first visible test case)",
  "sampleOutput": "string (must exactly match the output of the first visible test case)",
  "testCases": [
    { "input": "string", "output": "string", "score": 1, "explanation": "string", "visible": true|false }
  ],
  "scaffolds": [
    { "languageId": number, "languageName": "string", "body": "starter code" }
  ]
}

Test Case Guidelines:
- Always provide ≥ 5 test cases (normal + edge + boundary).
- At least 2 must be visible.
- Each must have an explanation.
- sampleInput/sampleOutput must never be blank or "N/A" — must map to the first visible test case.

Scaffold Guidelines:
- Generate scaffolds **only** for: ${langs}.
- Each scaffold must include:
  - One public method/function with TODO.
  - Driver code (stdin/stdout like HackerRank/HackerEarth).
  - Proper Judge0 wrappers:
    - Java: public class Main { ... }
    - Python: def solve(...)
    - C++: #include <bits/stdc++.h> with int main()

Additional:
- Questions must be unique (no duplicates).
- Add randomness so same inputs produce different outputs.
- Hidden uniqueness token: ${Date.now()}.

Return only a JSON array of questions.
`;
}

/** ---------- AI Caller ---------- */
async function callAI(primaryModel, prompt) {
  const openaiKey = process.env.OPENAI_API_KEY;
  const geminiKey = process.env.GEMINI_API_KEY;
  console.log("📡 callAI invoked:", {
    model: primaryModel,
    openaiKey: !!openaiKey,
    geminiKey: !!geminiKey,
  });

  async function callOpenAI() {
    const res = await axios.post(
      "https://api.openai.com/v1/chat/completions",
      {
        model: "gpt-4o-mini",
        messages: [{ role: "user", content: prompt }],
        temperature: 0.9,
      },
      { headers: { Authorization: `Bearer ${openaiKey}` } }
    );
    return res.data.choices[0].message.content;
  }

  async function callGemini() {
    const res = await axios.post(
      "https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent",
      { contents: [{ parts: [{ text: prompt }] }] },
      {
        headers: { "Content-Type": "application/json", "X-goog-api-key": geminiKey },
      }
    );
    return res.data.candidates?.[0]?.content?.parts?.[0]?.text || "";
  }

  try {
    return primaryModel === "openai" ? await callOpenAI() : await callGemini();
  } catch (err) {
    console.error(`❌ ${primaryModel} call failed:`, err.response?.data || err.message);
    if (primaryModel === "openai" && geminiKey) return callGemini();
    if (primaryModel === "gemini" && openaiKey) return callOpenAI();
    throw err;
  }
}

/** ---------- Deduplication ---------- */
async function ensureUnique(question, model, basePrompt, seenCache = []) {
  let attempts = 0;
  while (attempts < 3) {
    const inBatchDup = seenCache.some(
      (q) =>
        levenshtein(q.title, question.title) > 0.85 ||
        levenshtein(q.description, question.description) > 0.85
    );
    const dbDup = await isDuplicate(question);

    if (!inBatchDup && !dbDup) {
      // Patch sampleInput/Output if missing
      if ((!question.sampleInput || !question.sampleOutput) && question.testCases?.length) {
        const vis = question.testCases.find((t) => t.visible) || question.testCases[0];
        question.sampleInput = vis?.input || "1";
        question.sampleOutput = vis?.output || "1";
      }
      return question;
    }

    attempts++;
    console.warn(`⚠️ Duplicate detected, regenerating attempt ${attempts}`);
    const regenPrompt =
      basePrompt +
      `\nAvoid repeating:\n- ${question.title}\n- ${question.description}`;
    let aiResponse = await callAI(model, regenPrompt);
    const [regenQ] = extractJsonArray(aiResponse);
    question = regenQ || question;
  }
  return question;
}

/** ---------- Generate Questions ---------- */
router.post("/generate-questions", async (req, res) => {
  const {
    jobDescription,
    seniorityLevels,
    experienceRange,
    numQuestions,
    totalTime,
    model,
    languages,
  } = req.body;

  try {
    let easy = Math.floor(numQuestions * 0.3);
    let medium = Math.floor(numQuestions * 0.5);
    let hard = numQuestions - (easy + medium);
    if (easy + medium + hard !== numQuestions) {
      hard = numQuestions - (easy + medium);
    }
    const distribution = { Easy: easy, Medium: medium, Hard: hard };

    const prompt = buildPrompt({
      jobDescription,
      seniorityLevels,
      experienceRange,
      numQuestions,
      distribution,
      languages,
    });

    let aiResponse = await callAI(model, prompt);
    let questions = extractJsonArray(aiResponse);

    // Dedup + scaffold filter
    const uniqueQuestions = [];
    for (const q of questions) {
      let uq = await ensureUnique(q, model, prompt, uniqueQuestions);
      uq.scaffolds = (uq.scaffolds || []).filter((s) =>
        (languages || []).some((l) => (l.languageName || l) === s.languageName)
      );
      uq.timeAllowed = Math.floor(totalTime / numQuestions) || 15;
      uniqueQuestions.push(uq);
    }

    res.json({ questions: uniqueQuestions, distribution });
  } catch (err) {
    console.error("AI generation error:", err.response?.data || err.message);
    res.status(500).json({ error: "Failed to generate questions" });
  }
});

/** ---------- Regenerate Question ---------- */
router.post("/regenerate-question", async (req, res) => {
  const { jobDescription, seniorityLevels, experienceRange, difficulty, model, languages } =
    req.body;

  try {
    const langs = languages.map((l) => l.languageName || l).join(", ");
    const prompt = `
Generate 1 **new unique** ${difficulty} coding question:

Job Description: ${jobDescription}
Seniority Levels: ${Array.isArray(seniorityLevels) ? seniorityLevels.join(", ") : seniorityLevels}
Experience Range: ${experienceRange?.min ?? 0}–${experienceRange?.max ?? ""} years
Languages: ${langs}

Rules:
- Must strictly follow schema.
- ≥ 5 test cases, with ≥ 2 visible.
- sampleInput/sampleOutput must equal the first visible test case.
- Scaffold must exist for each of: ${langs} (and no others).
- Include Judge0 wrappers (Java Main, Python solve(), C++ main()).
- Must have a unique title/description.
- Uniqueness token: ${Date.now()}.

Return [question].
`;

    let aiResponse = await callAI(model, prompt);
    let [question] = extractJsonArray(aiResponse);
    question = await ensureUnique(question, model, prompt);
    question.scaffolds = (question.scaffolds || []).filter((s) =>
      (languages || []).some((l) => (l.languageName || l) === s.languageName)
    );

    res.json({ question });
  } catch (err) {
    console.error("Regenerate error:", err.response?.data || err.message);
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

      if (scaffolds?.length) {
        const scaffoldDocs = scaffolds.map((s) => ({ ...s, questionId: question._id }));
        await Scaffold.insertMany(scaffoldDocs);
      }
      savedQuestions.push(question);
    }
    res.json(savedQuestions);
  } catch (err) {
    console.error("DB save error:", err);
    res.status(500).json({ error: "Failed to save questions with scaffolds" });
  }
});

module.exports = router;