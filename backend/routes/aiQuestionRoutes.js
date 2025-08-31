const express = require("express");
const axios = require("axios");
const Question = require("../models/Question");
const Scaffold = require("../models/Scaffold");

const router = express.Router();

/**
 * Utility: Try to clean/repair nearly-JSON text
 */
function healJsonString(str) {
  return str
    .replace(/[\u0000-\u0019]+/g, " ")
    .replace(/,\s*([}\]])/g, "$1")
    .replace(/([^\\])\n/g, "$1\\n")
    .replace(/\\(?!["\\/bfnrtu])/g, "\\\\");
}

/**
 * Utility: Safe JSON extractor with healing
 */
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

/**
 * Utility: Build AI prompt
 */
function buildPrompt({ jobDescription, seniorityLevels, experienceRange, numQuestions, distribution, languages }) {
  return `
You are an expert coding interview question generator. Based on the job description and requirements below, generate ${numQuestions} coding questions.

Job Description: ${jobDescription}
Seniority Levels: ${Array.isArray(seniorityLevels) ? seniorityLevels.join(", ") : seniorityLevels}
Experience Range: ${experienceRange?.min ?? 0}–${experienceRange?.max ?? ""} years

Difficulty Distribution:
- Easy: ${distribution.Easy}
- Medium: ${distribution.Medium}
- Hard: ${distribution.Hard}

Languages required: ${(languages || []).map((l) => l.languageName || l).join(", ")}

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
- For each selected language (${(languages || []).map((l) => l.languageName || l).join(", ")}), generate a scaffold.
- Scaffold must include:
  - A single public method (or function) named according to the problem context (not always "solve").
  - The method should only contain a TODO comment.
  - A main()/driver block that handles stdin/stdout in the style of HackerRank/HackerEarth.
  - Driver must parse input and call the method, then print the result.
- Always include the proper imports/wrappers that Judge0 expects:
  - **Java**: Must be inside \`public class Main { ... }\`, with a static method for the solution.
  - **Python**: Define \`def solve(...):\` for the solution, then call it after parsing input.
  - **C++**: Use \`#include <bits/stdc++.h>\` and implement solution logic inside a separate function, with \`int main()\` parsing input and printing output.

Return only a **valid JSON array** of questions, with no extra commentary.
`;
}

/**
 * Utility: Call AI (with fallback OpenAI ↔ Gemini)
 */
async function callAI(primaryModel, prompt) {
  const openaiKey = process.env.OPENAI_API_KEY;
  const geminiKey = process.env.GEMINI_API_KEY;
  console.log("📡 callAI invoked:", { model: primaryModel, openaiKey: !!openaiKey, geminiKey: !!geminiKey });

  async function callOpenAI() {
    console.log("⚡ Calling OpenAI GPT...");
    const res = await axios.post(
      "https://api.openai.com/v1/chat/completions",
      { model: "gpt-4o-mini", messages: [{ role: "user", content: prompt }], temperature: 0.7 },
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

// ---------- Generate Questions ----------
router.post("/generate-questions", async (req, res) => {
  const { jobDescription, seniorityLevels, experienceRange, numQuestions, totalTime, model, languages } = req.body;

  try {
    let easy = Math.floor(numQuestions * 0.3);
    let medium = Math.floor(numQuestions * 0.5);
    let hard = numQuestions - (easy + medium);

    if (easy + medium + hard !== numQuestions) {
      hard = numQuestions - (easy + medium);
    }

    const distribution = { Easy: easy, Medium: medium, Hard: hard };
    console.log("📊 Final distribution:", distribution);

    const prompt = buildPrompt({ jobDescription, seniorityLevels, experienceRange, numQuestions, distribution, languages });
    console.log("📝 Prompt built, length:", prompt.length);

    let aiResponse = await callAI(model, prompt);
    const questions = extractJsonArray(aiResponse).map((q) => ({
      ...q,
      timeAllowed: Math.floor(totalTime / numQuestions) || 15,
    }));

    res.json({ questions, distribution });
  } catch (err) {
    console.error("AI generation error:", err.response?.data || err.message);
    res.status(500).json({ error: "Failed to generate questions" });
  }
});

// ---------- Regenerate Single Question ----------
router.post("/regenerate-question", async (req, res) => {
  const { jobDescription, seniorityLevels, experienceRange, difficulty, model, languages } = req.body;

  try {
    const prompt = `
Generate 1 unique ${difficulty} coding question for:

Job Description: ${jobDescription}
Seniority Levels: ${Array.isArray(seniorityLevels) ? seniorityLevels.join(", ") : seniorityLevels}
Experience Range: ${experienceRange?.min ?? 0}–${experienceRange?.max ?? ""} years
Languages: ${languages.map((l) => l.languageName || l).join(", ")}

Rules:
- Must strictly follow the same schema as before.
- Must include at least 5 test cases (normal, edge, boundary cases).
- At least 2 test cases must be visible.
- Scaffold must contain a driver + a single public method with TODO.
- Always include standard imports/wrappers:
  - Java: public class Main
  - Python: def solve()
  - C++: #include <bits/stdc++.h>, main()

Return a JSON array with exactly 1 question object, no extra commentary.
`;

    let aiResponse = await callAI(model, prompt);
    const [question] = extractJsonArray(aiResponse);
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