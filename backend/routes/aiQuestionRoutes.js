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
  return `
You are an expert coding interview question generator. Based on the job description and requirements below, generate ${numQuestions} **unique** coding questions.

Job Description: ${jobDescription}
Seniority Levels: ${
    Array.isArray(seniorityLevels) ? seniorityLevels.join(", ") : seniorityLevels
  }
Experience Range: ${experienceRange?.min ?? 0}–${experienceRange?.max ?? ""} years

Difficulty Distribution:
- Easy: ${distribution.Easy}
- Medium: ${distribution.Medium}
- Hard: ${distribution.Hard}

Languages required (only these, nothing else): ${(languages || [])
    .map((l) => l.languageName || l)
    .join(", ")}

Rules for each generated question:
- Must strictly follow this schema:
{
  "title": "string (must be unique)",
  "description": "string (detailed problem statement)",
  "difficulty": "Easy | Medium | Hard",
  "tags": ["string"],
  "sampleInput": "string (must correspond to a test case)",
  "sampleOutput": "string (must correspond to a test case)",
  "testCases": [
    { "input": "string", "output": "string", "score": 1, "explanation": "string", "visible": true|false }
  ],
  "scaffolds": [
    { "languageId": number, "languageName": "string", "body": "starter code (non-empty)" }
  ]
}

Test Case Guidelines:
- Always provide at least 5 test cases (normal, edge, boundary cases).
- At least 2 test cases must be visible.
- Each test case must have an explanation.
- sampleInput/sampleOutput must never be empty or "N/A".

Scaffold Guidelines:
- Generate scaffolds ONLY for the selected languages above.
- Scaffold must include:
  - A single public method (or function) named according to the problem context.
  - The method should only contain a TODO comment.
  - A main()/driver block that handles stdin/stdout in HackerRank/HackerEarth style.
  - Driver must parse input and call the method, then print the result.
- Always include imports/wrappers Judge0 expects:
  - Java: public class Main { ... }
  - Python: def solve(...)
  - C++: #include <bits/stdc++.h>

Additional:
- Every generated question must be unique in title and description.
- Add randomness so repeated inputs don’t produce the same output.
- Append hidden uniqueness token: ${Date.now()}.

Return only a valid JSON array of questions, no commentary.
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
    console.log("⚡ Calling OpenAI GPT...");
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
    console.log("⚡ Calling Gemini 2.0 Flash...");
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
    console.error(
      `❌ ${primaryModel} primary call failed:`,
      err.response?.data || err.message
    );
    console.log("🔄 Falling back...");
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

    const scaffoldMissing =
      !question.scaffolds ||
      question.scaffolds.length === 0 ||
      question.scaffolds.some((s) => !s.body || s.body.trim() === "");

    const sampleInvalid =
      !question.sampleInput ||
      !question.sampleOutput ||
      question.sampleInput === "N/A" ||
      question.sampleOutput === "N/A";

    if (!inBatchDup && !dbDup && !scaffoldMissing && !sampleInvalid) {
      return question;
    }

    console.warn(
      `⚠️ Issue detected (dup=${inBatchDup || dbDup}, scaffoldMissing=${scaffoldMissing}, sampleInvalid=${sampleInvalid}), regenerating... attempt ${
        attempts + 1
      }`
    );
    attempts++;

    const regenPrompt =
      basePrompt +
      `\n\nImportant: Avoid these titles/descriptions:\n- ${question.title}\n- ${question.description}\nEnsure scaffolds and sample I/O are always non-empty.`;
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
    distributionOverride,
  } = req.body;

  try {
    let distribution = distributionOverride;
    if (!distributionOverride) {
      let easy = Math.floor(numQuestions * 0.3);
      let medium = Math.floor(numQuestions * 0.5);
      let hard = numQuestions - (easy + medium);
      if (easy + medium + hard !== numQuestions) {
        hard = numQuestions - (easy + medium);
      }
      distribution = { Easy: easy, Medium: medium, Hard: hard };
    }
    console.log("📊 Final distribution:", distribution);

    const prompt = buildPrompt({
      jobDescription,
      seniorityLevels,
      experienceRange,
      numQuestions,
      distribution,
      languages,
    });
    console.log("📝 Prompt built, length:", prompt.length);

    let aiResponse = await callAI(model, prompt);
    let questions = extractJsonArray(aiResponse);

    // Deduplicate + fix invalid scaffolds or sample I/O
    const uniqueQuestions = [];
    for (const q of questions) {
      const uq = await ensureUnique(q, model, prompt, uniqueQuestions);
      uniqueQuestions.push({
        ...uq,
        timeAllowed: Math.floor(totalTime / numQuestions) || 15,
      });
    }

    res.json({ questions: uniqueQuestions, distribution });
  } catch (err) {
    console.error("AI generation error:", err.response?.data || err.message);
    res.status(500).json({ error: "Failed to generate questions" });
  }
});

/** ---------- Regenerate Question ---------- */
router.post("/regenerate-question", async (req, res) => {
  const {
    jobDescription,
    seniorityLevels,
    experienceRange,
    difficulty,
    model,
    languages,
  } = req.body;

  try {
    const prompt = `
Generate 1 **new unique** ${difficulty} coding question:

Job Description: ${jobDescription}
Seniority Levels: ${
      Array.isArray(seniorityLevels)
        ? seniorityLevels.join(", ")
        : seniorityLevels
    }
Experience Range: ${experienceRange?.min ?? 0}–${experienceRange?.max ?? ""} years
Languages (only these): ${languages.map((l) => l.languageName || l).join(", ")}

Rules:
- Must strictly follow schema as before.
- Must include at least 5 test cases (normal, edge, boundary cases).
- At least 2 test cases must be visible.
- sampleInput/sampleOutput must map to a test case (never N/A).
- Scaffold must contain driver + single method with TODO.
- Include Judge0 imports/wrappers (Java Main, Python solve(), C++ main()).
- Must not repeat previous titles/descriptions.
- Append hidden uniqueness token: ${Date.now()}.

Return a JSON array with exactly 1 question object.
`;

    let aiResponse = await callAI(model, prompt);
    let [question] = extractJsonArray(aiResponse);

    question = await ensureUnique(question, model, prompt);

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

      if (scaffolds && scaffolds.length > 0) {
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