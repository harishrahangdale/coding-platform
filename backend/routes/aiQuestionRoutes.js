// backend/routes/aiQuestionRoutes.js
const express = require("express");
const axios = require("axios");
const Question = require("../models/Question");
const Scaffold = require("../models/Scaffold");

const router = express.Router();

/**
 * Extracts first valid JSON array from messy AI responses
 */
function extractJsonArray(text) {
  try {
    return JSON.parse(text);
  } catch {
    const match = text.match(/\[([\s\S]*?)\]/);
    if (match) {
      try {
        return JSON.parse(match[0]);
      } catch {
        return [];
      }
    }
    return [];
  }
}

/**
 * Build prompt with refined rules
 */
function buildPrompt({ jobDescription, seniorityLevel, experienceYears, numQuestions, distribution, languages }) {
  return `
You are an expert technical interviewer. Generate ${numQuestions} coding questions.

Job Description: ${jobDescription}
Seniority Level: ${seniorityLevel}
Experience: ${experienceYears} years

Difficulty distribution:
- Easy: ${distribution.Easy}
- Medium: ${distribution.Medium}
- Hard: ${distribution.Hard}

Languages required: ${languages.map(l => l.languageName).join(", ")}

Each question must strictly follow this JSON schema:
{
  "title": "string",
  "description": "string",
  "difficulty": "Easy | Medium | Hard",
  "tags": ["string"],
  "sampleInput": "string",
  "sampleOutput": "string",
  "testCases": [
    { "input": "string", "output": "string", "score": number, "explanation": "string", "visible": true|false }
  ],
  "scaffolds": [
    { "languageId": number, "languageName": "string", "body": "starter code" }
  ]
}

🔹 Test Case Rules:
- At least 5 test cases per question.
- Must cover normal, edge, and boundary conditions.
- At least 2 visible test cases.
- Inputs/outputs must exactly match the expected solve method logic.

🔹 Scaffold Rules:
- For each language: ${languages.map(l => l.languageName).join(", ")}.
- Must contain a single public method/function stub with a **meaningful name derived from the problem** (not just "solve").
- Input/output parsing must be handled in main (Java: main method, Python: if __name__ == "__main__").
- Main must read inputs, call the stub, and print result.
- Only starter code with TODO comments — no full solutions.

Return strictly a **valid JSON array** of ${numQuestions} objects only.
`;
}

/**
 * Call AI model with fallback (OpenAI <-> Gemini)
 */
async function callAI(model, prompt) {
  console.log("📡 callAI invoked:", {
    model,
    openaiKey: !!process.env.OPENAI_API_KEY,
    geminiKey: !!process.env.GEMINI_API_KEY,
  });

  // ---- Gemini ----
  if (model === "gemini") {
    try {
      console.log("⚡ Calling Gemini 2.0 Flash...");
      const res = await axios.post(
        "https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent",
        { contents: [{ parts: [{ text: prompt }] }] },
        { headers: { "Content-Type": "application/json", "x-goog-api-key": process.env.GEMINI_API_KEY } }
      );
      return res.data.candidates?.[0]?.content?.parts?.[0]?.text || "[]";
    } catch (err) {
      console.error("❌ gemini primary call failed:", err.response?.data || err.message);
      if (process.env.OPENAI_API_KEY) {
        console.log("🔄 Falling back to OpenAI...");
        return callAI("openai", prompt);
      }
      throw err;
    }
  }

  // ---- OpenAI ----
  if (model === "openai") {
    try {
      console.log("⚡ Calling OpenAI GPT...");
      const res = await axios.post(
        "https://api.openai.com/v1/chat/completions",
        {
          model: "gpt-4o-mini",
          messages: [{ role: "user", content: prompt }],
          temperature: 0.7,
        },
        { headers: { Authorization: `Bearer ${process.env.OPENAI_API_KEY}` } }
      );
      return res.data.choices[0].message.content;
    } catch (err) {
      console.error("❌ openai primary call failed:", err.response?.data || err.message);
      if (process.env.GEMINI_API_KEY) {
        console.log("🔄 Falling back to Gemini...");
        return callAI("gemini", prompt);
      }
      throw err;
    }
  }

  throw new Error("Invalid model");
}

// ---------- Generate Questions ----------
router.post("/generate-questions", async (req, res) => {
  const { jobDescription, seniorityLevel, experienceYears, numQuestions, totalTime, model, languages, distributionOverride } = req.body;

  console.log("📥 Incoming /generate-questions request:", {
    jobDescription: jobDescription?.slice(0, 100) + "...",
    seniorityLevel,
    experienceYears,
    numQuestions,
    totalTime,
    model,
    langs: languages.map(l => l.languageName),
  });

  try {
    // --- Difficulty Distribution ---
    let easy = distributionOverride?.Easy ?? Math.floor((numQuestions * 30) / 100);
    let medium = distributionOverride?.Medium ?? Math.floor((numQuestions * 50) / 100);
    let hard = distributionOverride?.Hard ?? Math.floor((numQuestions * 20) / 100);

    let allocated = easy + medium + hard;
    let remainder = numQuestions - allocated;

    // Distribute remainder across Medium > Easy > Hard
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
      Easy: buckets.find(b => b.key === "Easy").value,
      Medium: buckets.find(b => b.key === "Medium").value,
      Hard: buckets.find(b => b.key === "Hard").value,
    };

    // --- Build Prompt & Call AI ---
    const prompt = buildPrompt({ jobDescription, seniorityLevel, experienceYears, numQuestions, distribution, languages });
    console.log("📝 Prompt built, length:", prompt.length);

    let aiResponse = await callAI(model, prompt);
    let questions = extractJsonArray(aiResponse);

    if (!Array.isArray(questions) || questions.length === 0) {
      throw new Error("Invalid AI response (not JSON)");
    }

    const perQuestionTime = Math.floor(totalTime / numQuestions);
    questions = questions.map(q => ({ ...q, timeAllowed: perQuestionTime || 15 }));

    res.json({ questions, distribution });
  } catch (err) {
    console.error("AI generation error:", err.response?.data || err.message);
    res.status(500).json({ error: "Failed to generate questions" });
  }
});

// ---------- Regenerate Single Question ----------
router.post("/regenerate-question", async (req, res) => {
  const { jobDescription, seniorityLevel, experienceYears, difficulty, model, languages } = req.body;
  try {
    const prompt = `
You are an expert technical interviewer. Generate 1 unique ${difficulty} coding question.

Job Description: ${jobDescription}
Seniority Level: ${seniorityLevel}
Experience: ${experienceYears} years
Languages: ${languages.map(l => l.languageName).join(", ")}

Rules:
- At least 5 test cases (normal, edge, boundary), 2 visible.
- Schema same as before.
- Scaffold must have one public stub with a meaningful name.
- Main handles input/output like HackerRank.
- Starter code only.

Return strictly a JSON array with exactly 1 object.
`;

    let aiResponse = await callAI(model, prompt);
    let [question] = extractJsonArray(aiResponse);
    res.json({ question });
  } catch (err) {
    console.error("AI regenerate error:", err.response?.data || err.message);
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
        const scaffoldDocs = scaffolds.map(s => ({
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