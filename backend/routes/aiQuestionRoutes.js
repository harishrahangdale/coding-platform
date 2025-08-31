// backend/routes/aiQuestionRoutes.js
const express = require("express");
const axios = require("axios");
const Question = require("../models/Question");
const Scaffold = require("../models/Scaffold");

const router = express.Router();

/**
 * Utility: Safe JSON extractor
 */
function extractJsonArray(text) {
  if (!text) return [];

  // Remove Markdown fences
  const cleaned = text.replace(/```json/gi, "").replace(/```/g, "").trim();

  try {
    const parsed = JSON.parse(cleaned);
    if (Array.isArray(parsed)) return parsed;
  } catch (e) {
    // continue below
  }

  // Fallback: substring from first [ to last ]
  const firstIdx = cleaned.indexOf("[");
  const lastIdx = cleaned.lastIndexOf("]");
  if (firstIdx !== -1 && lastIdx !== -1 && lastIdx > firstIdx) {
    const jsonSub = cleaned.slice(firstIdx, lastIdx + 1);
    try {
      const parsed = JSON.parse(jsonSub);
      if (Array.isArray(parsed)) return parsed;
    } catch (err) {
      console.error("⚠️ extractJsonArray fallback parse failed:", err.message);
    }
  }

  console.error("❌ extractJsonArray failed, raw snippet:", text.slice(0, 300));
  return [];
}

/**
 * Utility: Build AI prompt
 */
function buildPrompt({ jobDescription, seniorityLevel, experienceYears, numQuestions, distribution, languages }) {
  return `
You are an expert coding interview question generator. Based on the job description and requirements below, generate ${numQuestions} coding questions.

Job Description: ${jobDescription}
Seniority Level: ${seniorityLevel}
Experience: ${experienceYears} years

Difficulty Distribution:
- Easy: ${distribution.Easy}
- Medium: ${distribution.Medium}
- Hard: ${distribution.Hard}

Languages required: ${languages.map((l) => l.languageName || l).join(", ")}

Rules for each generated question:
- Must strictly follow this schema:
{
  "title": "string",
  "description": "string",
  "difficulty": "Easy | Medium | Hard",
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

Test Case Guidelines:
- Always provide at least 5 test cases (normal, edge, boundary cases).
- At least 2 test cases must be visible.
- Each test case must have an explanation.

Scaffold Guidelines:
- For each selected language (${languages.map((l) => l.languageName || l).join(", ")}), generate a scaffold.
- Scaffold must include:
  - A single public method (or function) named according to the problem context (not always "solve").
  - The method should only contain a TODO comment.
  - A main() / driver code block that handles stdin/stdout in the style of HackerRank/HackerEarth.
  - Driver should parse input and call the method, then print the result.

Return only a **valid JSON array** of questions, with no extra commentary.
`;
}

/**
 * Utility: Call AI (with fallback)
 */
async function callAI(primaryModel, prompt) {
  const openaiKey = process.env.OPENAI_API_KEY;
  const geminiKey = process.env.GEMINI_API_KEY;
  console.log("📡 callAI invoked:", { model: primaryModel, openaiKey: !!openaiKey, geminiKey: !!geminiKey });

  async function callOpenAI() {
    console.log("⚡ Calling OpenAI GPT...");
    const res = await axios.post(
      "https://api.openai.com/v1/chat/completions",
      {
        model: "gpt-4o-mini",
        messages: [{ role: "user", content: prompt }],
        temperature: 0.7,
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
      { headers: { "Content-Type": "application/json", "X-goog-api-key": geminiKey } }
    );
    return res.data.candidates?.[0]?.content?.parts?.[0]?.text || "";
  }

  try {
    return primaryModel === "openai" ? await callOpenAI() : await callGemini();
  } catch (err) {
    console.error(`❌ ${primaryModel} primary call failed:`, err.response?.data || err.message);
    console.log("🔄 Falling back...");

    if (primaryModel === "openai" && geminiKey) return callGemini();
    if (primaryModel === "gemini" && openaiKey) return callOpenAI();
    throw err;
  }
}

/**
 * Generate Questions
 */
router.post("/generate-questions", async (req, res) => {
  const { jobDescription, seniorityLevel, experienceYears, numQuestions, totalTime, model, languages, distributionOverride } = req.body;

  try {
    console.log("📥 Incoming /generate-questions request:", {
      jobDescription: jobDescription?.slice(0, 200) + "...",
      seniorityLevel,
      experienceYears,
      numQuestions,
      totalTime,
      model,
      langs: languages?.map((l) => l.languageName || l),
    });

    // --- Distribution logic ---
    let easy = distributionOverride?.Easy ?? Math.floor(numQuestions * 0.3);
    let medium = distributionOverride?.Medium ?? Math.floor(numQuestions * 0.5);
    let hard = distributionOverride?.Hard ?? Math.floor(numQuestions * 0.2);
    let allocated = easy + medium + hard;
    let remainder = numQuestions - allocated;

    const buckets = [
      { key: "Medium", value: medium },
      { key: "Easy", value: easy },
      { key: "Hard", value: hard },
    ];
    let i = 0;
    while (remainder > 0) {
      buckets[i % buckets.length].value++;
      remainder--;
      i++;
    }
    const distribution = {
      Easy: buckets.find((b) => b.key === "Easy").value,
      Medium: buckets.find((b) => b.key === "Medium").value,
      Hard: buckets.find((b) => b.key === "Hard").value,
    };
    console.log("📊 Final distribution:", distribution);

    // --- Prompt ---
    const prompt = buildPrompt({ jobDescription, seniorityLevel, experienceYears, numQuestions, distribution, languages });
    console.log("📝 Prompt built, length:", prompt.length);

    // --- Call AI ---
    const aiResponse = await callAI(model, prompt);
    const questions = extractJsonArray(aiResponse);

    if (!Array.isArray(questions) || questions.length === 0) {
      throw new Error("Invalid AI response (not JSON)");
    }

    const perQuestionTime = Math.floor(totalTime / numQuestions);
    const normalized = questions.map((q) => ({
      ...q,
      timeAllowed: perQuestionTime || 15,
    }));

    res.json({ questions: normalized, distribution });
  } catch (err) {
    console.error("AI generation error:", err.response?.data || err.message || err);
    res.status(500).json({ error: "Failed to generate questions" });
  }
});

/**
 * Regenerate a single Question
 */
router.post("/regenerate-question", async (req, res) => {
  const { jobDescription, seniorityLevel, experienceYears, difficulty, model, languages } = req.body;
  try {
    const prompt = `
Generate 1 unique ${difficulty} coding question for:
Job Description: ${jobDescription}
Seniority: ${seniorityLevel}
Experience: ${experienceYears} years
Languages: ${languages.map((l) => l.languageName || l).join(", ")}

Rules:
- At least 5 test cases (normal, edge, boundary), 2 visible, all with explanations.
- Must follow the schema used before.
- Scaffold: must contain one public method/function named contextually, with TODO only, plus driver code to handle stdin/stdout like HackerRank/HackerEarth.

Return only a JSON array with 1 object.
`;

    console.log("♻️ Regenerate prompt length:", prompt.length);

    const aiResponse = await callAI(model, prompt);
    const arr = extractJsonArray(aiResponse);
    const [question] = arr;

    if (!question) throw new Error("Invalid AI response for regenerate");

    res.json({ question });
  } catch (err) {
    console.error("Regenerate error:", err.response?.data || err.message || err);
    res.status(500).json({ error: "Failed to regenerate question" });
  }
});

/**
 * Save Questions + Scaffolds
 */
router.post("/save-questions", async (req, res) => {
  try {
    const { questions, draft } = req.body;
    let savedQuestions = [];

    for (const q of questions) {
      const { scaffolds, ...questionData } = q;

      const question = new Question({ ...questionData, draft: !!draft });
      await question.save();

      if (scaffolds && scaffolds.length > 0) {
        const scaffoldDocs = scaffolds.map((s) => ({
          ...s,
          questionId: question._id,
        }));
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