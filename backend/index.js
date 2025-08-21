const express = require("express");
const mongoose = require("mongoose");
const cors = require("cors");
const axios = require("axios");
require("dotenv").config();

const Question = require("./models/Question"); // new dynamic schema
const Scaffold = require("./models/Scaffold"); // languageId + languageName

const app = express();
app.use(cors({
  origin: "https://friendly-youtiao-9b4c9c.netlify.app"
}));
app.use(express.json());

// ---- MongoDB Connection ----
mongoose
  .connect(process.env.MONGO_URI, { useNewUrlParser: true, useUnifiedTopology: true })
  .then(() => console.log("MongoDB connected"))
  .catch((err) => console.error("MongoDB connection error:", err));

/**
 * Utility: shape list item for /api/questions
 * We don't send test cases to the client in list view.
 */
const mapQuestionListItem = (q, languages = []) => ({
  _id: q._id,
  title: q.title,
  difficulty: q.difficulty,
  tags: q.tags || [],
  // total score is sum of test case scores (computed server-side)
  totalScore: Array.isArray(q.testCases) ? q.testCases.reduce((s, t) => s + (t.score || 0), 0) : 0,
  languages, // [{languageId, languageName}]
});

/**
 * Utility: Judge0 headers (RapidAPI)
 * If you're using self-hosted Judge0, adjust base URL & headers accordingly.
 */
const judge0 = axios.create({
  baseURL: "https://judge0-ce.p.rapidapi.com",
  headers: {
    "Content-Type": "application/json",
    "X-RapidAPI-Key": process.env.JUDGE0_API_KEY,
    "X-RapidAPI-Host": "judge0-ce.p.rapidapi.com",
  },
});

/**
 * GET /api/questions
 * Returns a list of questions with aggregate info + allowed languages per question.
 * (No test case content is exposed here.)
 */
app.get("/api/questions", async (req, res) => {
  try {
    // Fetch questions
    const questions = await Question.find({}).sort({ createdAt: -1 }).lean();

    // Fetch languages (scaffolds) grouped by questionId
    const scaffolds = await Scaffold.aggregate([
      { $group: {
          _id: "$questionId",
          languages: { $addToSet: { languageId: "$languageId", languageName: "$languageName" } },
        }
      }
    ]);

    const langsByQ = new Map(scaffolds.map(s => [String(s._id), s.languages]));

    const payload = questions.map((q) =>
      mapQuestionListItem(q, langsByQ.get(String(q._id)) || [])
    );

    res.json(payload);
  } catch (err) {
    console.error("GET /api/questions error:", err);
    res.status(500).json({ error: "Server error" });
  }
});

/**
 * GET /api/questions/:id
 * Returns full problem statement for candidate:
 * - title, description, difficulty, tags
 * - sampleInput, sampleOutput
 * - execution settings (timeLimit, memoryLimit, maxCodeSize)
 * - languages available (from scaffolds)
 * No hidden test cases are exposed.
 */
app.get("/api/questions/:id", async (req, res) => {
  try {
    const { id } = req.params;
    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({ error: "Invalid question ID format" });
    }

    const [question, languages] = await Promise.all([
      Question.findById(id).lean(),
      Scaffold.find({ questionId: id }).select("languageId languageName").lean(),
    ]);

    if (!question) return res.status(404).json({ error: "Question not found" });

    const totalScore = Array.isArray(question.testCases)
      ? question.testCases.reduce((s, t) => s + (t.score || 0), 0)
      : 0;

    res.json({
      _id: question._id,
      title: question.title,
      description: question.description,
      difficulty: question.difficulty,
      tags: question.tags || [],
      sampleInput: question.sampleInput || "",
      sampleOutput: question.sampleOutput || "",
      timeLimit: question.timeLimit,
      memoryLimit: question.memoryLimit,
      maxCodeSize: question.maxCodeSize,
      maxAttempts: question.maxAttempts,
      totalScore,
      languages: (languages || []).map((l) => ({
        languageId: l.languageId,
        languageName: l.languageName,
      })),
    });
  } catch (err) {
    console.error("GET /api/questions/:id error:", err);
    res.status(500).json({ error: "Server error" });
  }
});

/**
 * GET /api/questions/:id/scaffold/:languageId
 * Returns the starter code body for the given (question, language).
 * Useful to prefill the editor for the candidate.
 */
app.get("/api/questions/:id/scaffold/:languageId", async (req, res) => {
  try {
    const { id, languageId } = req.params;
    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({ error: "Invalid question ID format" });
    }
    const scaffold = await Scaffold.findOne({
      questionId: id,
      languageId: Number(languageId),
    }).lean();

    if (!scaffold) {
      return res.status(404).json({ error: "No scaffold found for this language" });
    }

    res.json({
      questionId: scaffold.questionId,
      languageId: scaffold.languageId,
      languageName: scaffold.languageName,
      body: scaffold.body || "",
    });
  } catch (err) {
    console.error("GET /api/questions/:id/scaffold/:languageId error:", err);
    res.status(500).json({ error: "Server error" });
  }
});

/**
 * POST /api/run/:id
 * Run candidate code against all server-side test cases using Judge0.
 * Body: { finalCode: string, languageId: number }
 *
 * Returns per-test-case results + earned score.
 */
app.post("/api/run/:id", async (req, res) => {
  const { id } = req.params;
  const finalCode = req.body.finalCode || req.body.source_code;
  const languageId = Number(req.body.languageId ?? req.body.language_id);

  if (!finalCode || !languageId) {
    return res.status(400).json({ error: "finalCode and languageId are required" });
  }
  if (!mongoose.Types.ObjectId.isValid(id)) {
    return res.status(400).json({ error: "Invalid question ID format" });
  }

  try {
    const question = await Question.findById(id).lean();
    if (!question) return res.status(404).json({ error: "Question not found" });

    const testCases = Array.isArray(question.testCases) ? question.testCases : [];
    if (testCases.length === 0) {
      return res.status(400).json({ error: "No test cases configured for this question" });
    }

    const results = [];
    let earnedScore = 0;
    const maxScore = testCases.reduce((s, t) => s + (t.score || 0), 0);

    for (const [idx, tc] of testCases.entries()) {
      const stdin = String(tc.input ?? "");
      const expected = String(tc.output ?? "").trim();

      const { data: submission } = await judge0.post(
        "/submissions?base64_encoded=false&wait=true",
        {
          source_code: finalCode,
          language_id: languageId,
          stdin,
        }
      );

      let actual = "";
      let status = "Failed";
      let statusNote = submission?.status?.description || "";

      if (submission?.status?.id === 3) {
        actual = (submission.stdout || "").trim();
        status = actual === expected ? "Passed" : "Failed";
      } else {
        if (submission.status.id === 6) {
          actual = `Compilation Error: ${(submission.compile_output || "").trim()}`;
        } else if ([7, 8, 9, 10, 11, 12, 14].includes(submission.status.id)) {
          actual = `Runtime Error: ${(submission.stderr || submission.message || "").trim()}`;
        } else {
          actual = (submission.stderr || submission.message || "").trim();
        }
      }

      if (status === "Passed") earnedScore += (tc.score || 0);

      results.push({
        index: idx + 1,
        input: stdin,
        expected,
        actual,
        judge0Status: statusNote,
        status,
        score: status === "Passed" ? (tc.score || 0) : 0,
        maxScore: tc.score || 0,
        visible: !!tc.visible,
      });
    }

    // Only expose visible test cases to the UI
    const publicResults = results.filter(r => r.visible);

    res.json({
      publicResults, // <= UI should render from this
      summary: {
        passed: results.filter(r => r.status === "Passed").length,
        total: results.length,
        earnedScore,
        maxScore,
        message: `${earnedScore}/${maxScore} points • ${results.filter(r => r.status === "Passed").length}/${results.length} test cases passed`,
      },
    });
  } catch (err) {
    console.error("POST /api/run/:id error:", err.response?.data || err.message);
    res.status(500).json({ error: "Execution failed" });
  }
});

// ---- Start server ----
const PORT = process.env.PORT || 5050; // 5050 to avoid macOS AirPlay conflicts
app.listen(PORT, () => console.log(`Server running on port ${PORT}`));