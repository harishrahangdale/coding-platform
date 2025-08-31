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
Languages required: ${languages.map(l => l.languageName).join(", ")}

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
- Generate for each language: ${languages.map(l => l.languageName).join(", ")}.
- Provide function signature and TODO comment.
- Do not include full solution.
Return valid JSON array only.
`;
}

/**
 * Call AI model
 */
async function callAI(model, prompt) {
  console.log("📡 callAI invoked:", { model, keyPresent: !!process.env.OPENAI_API_KEY });

  if (model === "openai") {
    try {
      const res = await axios.post(
        "https://api.openai.com/v1/chat/completions",
        {
          model: "gpt-4o-mini",
          messages: [{ role: "user", content: prompt }],
          temperature: 0.7,
        },
        {
          headers: {
            Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
          },
        }
      );
      console.log("✅ OpenAI response received");
      return res.data.choices[0].message.content;
    } catch (err) {
      console.error("❌ OpenAI API error:", err.response?.status, err.response?.data || err.message);
      throw err;
    }
  } else if (model === "gemini") {
    try {
      const res = await axios.post(
        "https://generativelanguage.googleapis.com/v1beta/models/gemini-pro:generateContent",
        { contents: [{ parts: [{ text: prompt }] }] },
        { headers: { Authorization: `Bearer ${process.env.GEMINI_API_KEY}` } }
      );
      console.log("✅ Gemini response received");
      return res.data.candidates[0].content.parts[0].text;
    } catch (err) {
      console.error("❌ Gemini API error:", err.response?.status, err.response?.data || err.message);
      throw err;
    }
  }
  throw new Error("Invalid model");
}

// ---------- Generate Questions ----------
router.post("/generate-questions", async (req, res) => {
  const { jobDescription, seniorityLevel, experienceYears, numQuestions, totalTime, model, languages, distributionOverride } = req.body;

  console.log("📥 Incoming /generate-questions request:", {
    jobDescription: jobDescription?.slice(0, 50) + "...",
    seniorityLevel,
    experienceYears,
    numQuestions,
    totalTime,
    model,
    languages: languages?.map(l => l.languageName),
    keyPresent: !!process.env.OPENAI_API_KEY,
    keyPrefix: process.env.OPENAI_API_KEY ? process.env.OPENAI_API_KEY.slice(0, 8) : null
  });

  try {
    // Difficulty distribution
    const easyCount = distributionOverride?.Easy ?? Math.max(1, Math.floor(numQuestions * 0.3));
    const mediumCount = distributionOverride?.Medium ?? Math.max(1, Math.floor(numQuestions * 0.5));
    let hardCount = distributionOverride?.Hard ?? (numQuestions - (easyCount + mediumCount));
    if (hardCount < 0) hardCount = 0;

    const distribution = { Easy: easyCount, Medium: mediumCount, Hard: hardCount };

    const prompt = buildPrompt({ jobDescription, seniorityLevel, experienceYears, numQuestions, distribution, languages });

    console.log("📝 Prompt built, length:", prompt.length);

    let aiResponse = await callAI(model, prompt);

    console.log("📦 Raw AI response (first 200 chars):", aiResponse.slice(0, 200));

    let questions = JSON.parse(aiResponse);

    const perQuestionTime = Math.floor(totalTime / numQuestions);
    questions = questions.map(q => ({
      ...q,
      timeAllowed: perQuestionTime || 15,
    }));

    console.log("✅ Parsed questions:", questions.length);

    res.json({ questions, distribution });
  } catch (err) {
    console.error("AI generation error:", err.response?.data || err.message);
    res.status(500).json({
      error: "Failed to generate questions",
      details: err.response?.data || err.message,
      keyPresent: !!process.env.OPENAI_API_KEY,
    });
  }
});

// ---------- Regenerate Single Question ----------
router.post("/regenerate-question", async (req, res) => {
  const { jobDescription, seniorityLevel, experienceYears, difficulty, model, languages } = req.body;
  console.log("♻️ Regenerate request:", { difficulty, seniorityLevel, experienceYears, model });

  try {
    const prompt = `
Generate 1 unique ${difficulty} coding question for:
Job Description: ${jobDescription}
Seniority: ${seniorityLevel}
Experience: ${experienceYears} years
Languages: ${languages.map(l => l.languageName).join(", ")}
Schema and scaffold rules same as before.
Return JSON array with 1 object only.
`;

    let aiResponse = await callAI(model, prompt);
    console.log("📦 Raw regenerate response (first 200 chars):", aiResponse.slice(0, 200));

    let [question] = JSON.parse(aiResponse);
    res.json({ question });
  } catch (err) {
    console.error("AI regenerate error:", err.response?.data || err.message);
    res.status(500).json({
      error: "Failed to regenerate question",
      details: err.response?.data || err.message,
    });
  }
});

// ---------- Save Questions + Scaffolds ----------
router.post("/save-questions", async (req, res) => {
  try {
    const { questions, draft } = req.body;
    console.log("💾 Saving questions:", questions?.length, "draft?", draft);

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

    console.log("✅ Saved questions:", savedQuestions.length);
    res.json(savedQuestions);
  } catch (err) {
    console.error("DB save error:", err);
    res.status(500).json({ error: "Failed to save questions with scaffolds" });
  }
});

module.exports = router;