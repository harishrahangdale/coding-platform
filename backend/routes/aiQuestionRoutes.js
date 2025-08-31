const express = require("express");
const axios = require("axios");
const Question = require("../models/Question");
const Scaffold = require("../models/Scaffold");

const router = express.Router();

/**
 * Utility: Generate AI prompt
 */
function buildPrompt({ jobDescription, seniorityLevel, experienceYears, numQuestions, distribution, languages }) {
  return `
You are an expert technical interviewer. Generate ${numQuestions} coding questions.

Job Description: ${jobDescription}
Seniority Level: ${seniorityLevel}
Experience: ${experienceYears} years

Distribution: Easy ${distribution.Easy}, Medium ${distribution.Medium}, Hard ${distribution.Hard}
Languages required: ${languages.map((l) => l.languageName).join(", ")}

Each question must strictly follow:
{
  "title": "string",
  "description": "string",
  "difficulty": "Easy | Medium | Hard",
  "tags": ["string"],
  "sampleInput": "string",
  "sampleOutput": "string",
  "testCases": [
    { "input": "string", "output": "string", "score": 1, "explanation": "string", "visible": false }
  ],
  "scaffolds": [
    { "languageId": number, "languageName": "string", "body": "starter code with TODOs" }
  ]
}

Scaffold Guidelines:
- Generate for each language: ${languages.map((l) => l.languageName).join(", ")}.
- Provide function signature and TODO comment.
- Do not include full solution.
Return valid JSON array only.
`;
}

/**
 * Sanitize AI responses (remove ```json fences + extract first valid JSON array)
 */
function sanitizeAIResponse(raw) {
  if (!raw) return raw;

  // Remove markdown fences
  let cleaned = raw.replace(/```json|```/g, "").trim();

  // Try extracting the first JSON array using regex
  const match = cleaned.match(/\[[\s\S]*\]/);
  if (match) {
    return match[0]; // first valid array
  }

  return cleaned;
}

/**
 * Low-level API calls
 */
async function callOpenAI(prompt) {
  console.log("⚡ Calling OpenAI...");
  const res = await axios.post(
    "https://api.openai.com/v1/chat/completions",
    {
      model: "gpt-4o-mini",
      messages: [{ role: "user", content: prompt }],
      temperature: 0.7,
    },
    {
      headers: { Authorization: `Bearer ${process.env.OPENAI_API_KEY}` },
    }
  );
  return res.data.choices[0].message.content;
}

async function callGemini(prompt) {
  console.log("⚡ Calling Gemini 2.0 Flash...");
  const res = await axios.post(
    `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${process.env.GEMINI_API_KEY}`,
    { contents: [{ parts: [{ text: prompt }] }] },
    { headers: { "Content-Type": "application/json" } }
  );
  return res.data.candidates[0].content.parts[0].text;
}

/**
 * Call AI with fallback logic
 */
async function callAI(model, prompt) {
  console.log("📡 callAI invoked:", {
    model,
    openaiKey: !!process.env.OPENAI_API_KEY,
    geminiKey: !!process.env.GEMINI_API_KEY,
  });

  try {
    if (model === "openai") {
      return await callOpenAI(prompt);
    } else if (model === "gemini") {
      return await callGemini(prompt);
    }
    throw new Error("Invalid model");
  } catch (err) {
    console.error(`❌ ${model} primary call failed:`, err.response?.data || err.message);

    // Automatic fallback logic
    if (model === "openai" && process.env.GEMINI_API_KEY) {
      console.log("🔄 Falling back to Gemini...");
      return await callGemini(prompt);
    } else if (model === "gemini" && process.env.OPENAI_API_KEY) {
      console.log("🔄 Falling back to OpenAI...");
      return await callOpenAI(prompt);
    }
    throw err; // No fallback available
  }
}

// ---------- Generate Questions ----------
router.post("/generate-questions", async (req, res) => {
  const {
    jobDescription,
    seniorityLevel,
    experienceYears,
    numQuestions,
    totalTime,
    model,
    languages,
    distributionOverride,
  } = req.body;

  console.log("📥 Incoming /generate-questions request:", {
    jobDescription: jobDescription?.slice(0, 60) + "...",
    seniorityLevel,
    experienceYears,
    numQuestions,
    totalTime,
    model,
    langs: Array.isArray(languages)
      ? languages.map((l) => l.languageName || l)
      : [],
  });

  try {
    // Difficulty distribution
    const easyCount =
      distributionOverride?.Easy ?? Math.max(1, Math.floor(numQuestions * 0.3));
    const mediumCount =
      distributionOverride?.Medium ?? Math.max(1, Math.floor(numQuestions * 0.5));
    let hardCount =
      distributionOverride?.Hard ?? numQuestions - (easyCount + mediumCount);
    if (hardCount < 0) hardCount = 0;

    const distribution = { Easy: easyCount, Medium: mediumCount, Hard: hardCount };

    const prompt = buildPrompt({
      jobDescription,
      seniorityLevel,
      experienceYears,
      numQuestions,
      distribution,
      languages,
    });

    console.log("📝 Prompt built, length:", prompt.length);

    let aiResponse = await callAI(model, prompt);

    // Sanitize Gemini/OpenAI fenced responses
    aiResponse = sanitizeAIResponse(aiResponse);

    let questions = [];
    try {
      questions = JSON.parse(aiResponse);
    } catch (parseErr) {
      console.error("⚠️ JSON parse failed, raw response:", aiResponse);
      throw new Error("Invalid AI response (not JSON)");
    }

    const perQuestionTime = Math.floor(totalTime / numQuestions);
    questions = questions.map((q) => ({
      ...q,
      timeAllowed: perQuestionTime || 15,
    }));

    res.json({ questions, distribution });
  } catch (err) {
    console.error("AI generation error:", err.response?.data || err.message);
    res.status(500).json({ error: "Failed to generate questions" });
  }
});

// ---------- Regenerate Single Question ----------
router.post("/regenerate-question", async (req, res) => {
  const {
    jobDescription,
    seniorityLevel,
    experienceYears,
    difficulty,
    model,
    languages,
  } = req.body;
  try {
    const prompt = `
Generate 1 unique ${difficulty} coding question for:
Job Description: ${jobDescription}
Seniority: ${seniorityLevel}
Experience: ${experienceYears} years
Languages: ${languages.map((l) => l.languageName).join(", ")}
Schema and scaffold rules same as before.
Return JSON array with 1 object only.
`;

    let aiResponse = await callAI(model, prompt);
    aiResponse = sanitizeAIResponse(aiResponse);

    let [question] = JSON.parse(aiResponse);
    res.json({ question });
  } catch (err) {
    console.error("Regenerate error:", err.response?.data || err.message);
    res.status(500).json({ error: "Failed to regenerate question" });
  }
});

// ---------- Save Questions + Scaffolds ----------
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