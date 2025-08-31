const express = require("express");
const mongoose = require("mongoose");
const cors = require("cors");
const axios = require("axios");
require("dotenv").config();

const Question = require("./models/Question");
const Scaffold = require("./models/Scaffold");
const Submission = require("./models/Submission");
const SubmissionDraft = require("./models/SubmissionDraft");
const EditorSession = require("./models/EditorSession");

const app = express();
app.use(
  cors({
    origin: "https://friendly-youtiao-9b4c9c.netlify.app",
  })
);
app.use(express.json());

// ---- MongoDB ----
mongoose
  .connect(process.env.MONGO_URI, {
    useNewUrlParser: true,
    useUnifiedTopology: true,
  })
  .then(() => console.log("MongoDB connected"))
  .catch((err) => console.error("MongoDB connection error:", err));

// ---- Helpers ----
const mapQuestionListItem = (q, languages = []) => ({
  _id: q._id,
  title: q.title,
  difficulty: q.difficulty,
  tags: q.tags || [],
  totalScore: Array.isArray(q.testCases)
    ? q.testCases.reduce((s, t) => s + (t.score || 0), 0)
    : 0,
  languages,
});

const judge0 = axios.create({
  baseURL: "https://judge0-ce.p.rapidapi.com",
  headers: {
    "Content-Type": "application/json",
    "X-RapidAPI-Key": process.env.JUDGE0_API_KEY,
    "X-RapidAPI-Host": "judge0-ce.p.rapidapi.com",
  },
});

// ---- Questions list ----
app.get("/api/questions", async (req, res) => {
  try {
    const questions = await Question.find({}).sort({ createdAt: -1 }).lean();
    const scaffolds = await Scaffold.aggregate([
      {
        $group: {
          _id: "$questionId",
          languages: {
            $addToSet: {
              languageId: "$languageId",
              languageName: "$languageName",
            },
          },
        },
      },
    ]);
    const langsByQ = new Map(
      scaffolds.map((s) => [String(s._id), s.languages])
    );
    const payload = questions.map((q) =>
      mapQuestionListItem(q, langsByQ.get(String(q._id)) || [])
    );
    res.json(payload);
  } catch (err) {
    console.error("GET /api/questions error:", err);
    res.status(500).json({ error: "Server error" });
  }
});

// ---- Question detail ----
app.get("/api/questions/:id", async (req, res) => {
  try {
    const { id } = req.params;
    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({ error: "Invalid question ID format" });
    }
    const [question, languages] = await Promise.all([
      Question.findById(id).lean(),
      Scaffold.find({ questionId: id })
        .select("languageId languageName")
        .lean(),
    ]);
    if (!question) return res.status(404).json({ error: "Question not found" });

    const totalScore = (question.testCases || []).reduce(
      (s, t) => s + (t.score || 0),
      0
    );
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
      timeAllowed: question.timeAllowed,
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

// ---- Visible test cases ----
app.get("/api/questions/:id/visible-tests", async (req, res) => {
  try {
    const { id } = req.params;
    if (!mongoose.Types.ObjectId.isValid(id))
      return res.status(400).json({ error: "Invalid question ID format" });
    const q = await Question.findById(id).select("testCases").lean();
    if (!q) return res.status(404).json({ error: "Question not found" });

    const cases = (q.testCases || [])
      .map((t, i) => ({
        index: i + 1,
        input: String(t.input ?? ""),
        expected: String(t.output ?? ""),
        score: t.score || 0,
        visible: !!t.visible,
      }))
      .filter((t) => t.visible);

    res.json({ cases });
  } catch (err) {
    console.error("GET /api/questions/:id/visible-tests error:", err);
    res.status(500).json({ error: "Server error" });
  }
});

// ---- Scaffold fetch ----
app.get("/api/questions/:id/scaffold/:languageId", async (req, res) => {
  try {
    const { id, languageId } = req.params;
    if (!mongoose.Types.ObjectId.isValid(id))
      return res.status(400).json({ error: "Invalid question ID format" });

    const scaffold = await Scaffold.findOne({
      questionId: id,
      languageId: Number(languageId),
    }).lean();
    if (!scaffold)
      return res.status(404).json({ error: "No scaffold found for this language" });

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

// ======================================================
// AUTOSAVE DRAFTS
// ======================================================
app.post("/api/save-draft", async (req, res) => {
  try {
    const { candidate_id, screening_test_id, questionId, languageId, code } =
      req.body || {};
    if (!candidate_id || !screening_test_id || !questionId || !languageId) {
      return res.status(400).json({
        error:
          "candidate_id, screening_test_id, questionId, languageId are required",
      });
    }
    if (!mongoose.Types.ObjectId.isValid(questionId)) {
      return res.status(400).json({ error: "Invalid question ID format" });
    }

    const doc = await SubmissionDraft.findOneAndUpdate(
      { candidate_id, screening_test_id, questionId, languageId },
      { $set: { code: String(code || "") } },
      { new: true, upsert: true, setDefaultsOnInsert: true }
    );

    res.json({ ok: true, draftId: doc._id, updatedAt: doc.updatedAt });
  } catch (err) {
    console.error("POST /api/save-draft error:", err);
    res.status(500).json({ error: "Failed to save draft" });
  }
});

app.get("/api/draft", async (req, res) => {
  try {
    const { candidate_id, screening_test_id, questionId, languageId } =
      req.query || {};
    if (!candidate_id || !screening_test_id || !questionId || !languageId) {
      return res.status(400).json({
        error:
          "candidate_id, screening_test_id, questionId, languageId are required",
      });
    }
    if (!mongoose.Types.ObjectId.isValid(questionId)) {
      return res.status(400).json({ error: "Invalid question ID format" });
    }
    const doc = await SubmissionDraft.findOne({
      candidate_id,
      screening_test_id,
      questionId,
      languageId: Number(languageId),
    }).lean();
    res.json({
      draft: doc ? { code: doc.code, updatedAt: doc.updatedAt } : null,
    });
  } catch (err) {
    console.error("GET /api/draft error:", err);
    res.status(500).json({ error: "Failed to fetch draft" });
  }
});

// ======================================================
// RUN / CUSTOM RUN (with run_result events)
// ======================================================
const normalizeCaseResult = (submission, { stdin, expected, idx, score, visible }) => {
  const statusId = submission?.status?.id;
  const statusDesc = submission?.status?.description || "";

  let actual = "";
  let status = "Other";

  if (statusId === 3) {
    actual = (submission.stdout || "").trim();
    status = actual === expected ? "Passed" : "Failed";
  } else if (statusId === 6) {
    status = "Compilation Error";
    actual = (submission.compile_output || "").trim();
  } else if ([7, 8, 9, 10, 11, 12, 14, 15].includes(statusId)) {
    status = "Runtime Error";
    actual = (submission.stderr || submission.message || "").trim();
  } else {
    status = "Other";
    actual = (submission.stderr || submission.message || "").trim();
  }

  return {
    index: idx + 1,
    input: String(stdin ?? ""),
    expected,
    actual,
    status,
    judge0Status: statusDesc,
    time: submission?.time != null ? Number(submission.time) : null,
    memory: submission?.memory != null ? Number(submission.memory) : null,
    score: status === "Passed" ? score || 0 : 0,
    maxScore: score || 0,
    visible: !!visible,
  };
};

app.post("/api/run/:id", async (req, res) => {
  const { id } = req.params;
  const finalCode = req.body.finalCode || req.body.source_code;
  const languageId = Number(req.body.languageId ?? req.body.language_id);
  const candidate_id = req.body.candidate_id;
  const screening_test_id = req.body.screening_test_id;

  if (!finalCode || !languageId)
    return res.status(400).json({ error: "finalCode and languageId are required" });
  if (!mongoose.Types.ObjectId.isValid(id))
    return res.status(400).json({ error: "Invalid question ID format" });

  try {
    const question = await Question.findById(id).lean();
    if (!question) return res.status(404).json({ error: "Question not found" });

    const testCases = question.testCases || [];
    const results = [];
    let earnedScore = 0;
    const maxScore = testCases.reduce((s, t) => s + (t.score || 0), 0);

    for (const [idx, tc] of testCases.entries()) {
      const stdin = String(tc.input ?? "");
      const expected = String(tc.output ?? "").trim();
      const { data: submission } = await judge0.post(
        "/submissions?base64_encoded=false&wait=true",
        { source_code: finalCode, language_id: languageId, stdin }
      );
      const normalized = normalizeCaseResult(submission, {
        stdin,
        expected,
        idx,
        score: tc.score,
        visible: tc.visible,
      });
      if (normalized.status === "Passed") earnedScore += normalized.maxScore;
      results.push(normalized);
    }

    const summary = {
      passed: results.filter((r) => r.status === "Passed").length,
      total: results.length,
      earnedScore,
      maxScore,
      message: `${earnedScore}/${maxScore} points • ${results.filter(
        (r) => r.status === "Passed"
      ).length}/${results.length} test cases passed`,
    };

    let saved = null;
    if (candidate_id && screening_test_id) {
      saved = await Submission.create({
        candidate_id,
        screening_test_id,
        questionId: id,
        languageId,
        code: String(finalCode),
        results,
        summary,
        runType: "run",
        status: "in-progress",
      });

      // append run_result marker
      await EditorSession.updateOne(
        { candidate_id, screening_test_id, questionId: id },
        {
          $push: {
            events: {
              t: Date.now(),
              type: "run_result",
              status:
                earnedScore === maxScore
                  ? "passed"
                  : results.some((r) => r.status === "Compilation Error")
                  ? "compile_error"
                  : results.some((r) => r.status === "Runtime Error")
                  ? "runtime_error"
                  : "failed",
              message: summary.message,
            },
          },
        }
      );
    }

    res.json({
      publicResults: results.filter((r) => r.visible),
      results,
      summary,
      submissionId: saved?._id || null,
    });
  } catch (err) {
    console.error("POST /api/run/:id error:", err.message);
    res.status(500).json({ error: "Execution failed" });
  }
});

app.post("/api/run/:id/custom", async (req, res) => {
  const { id } = req.params;
  const finalCode = req.body.finalCode || req.body.source_code;
  const languageId = Number(req.body.languageId ?? req.body.language_id);
  const stdin = String(req.body.stdin ?? "");
  const candidate_id = req.body.candidate_id;
  const screening_test_id = req.body.screening_test_id;

  if (!finalCode || !languageId)
    return res.status(400).json({ error: "finalCode and languageId are required" });
  if (!mongoose.Types.ObjectId.isValid(id))
    return res.status(400).json({ error: "Invalid question ID format" });

  try {
    const { data: submission } = await judge0.post(
      "/submissions?base64_encoded=false&wait=true",
      { source_code: finalCode, language_id: languageId, stdin }
    );

    const statusId = submission?.status?.id;
    const statusDesc = submission?.status?.description || "";
    let status =
      statusId === 6
        ? "Compilation Error"
        : [7, 8, 9, 10, 11, 12, 14, 15].includes(statusId)
        ? "Runtime Error"
        : "Passed";

    const payload = {
      status: statusDesc || status,
      stdout: (submission.stdout || "").trim(),
      stderr: (submission.stderr || submission.message || "").trim(),
      time: submission?.time != null ? Number(submission.time) : null,
      memory: submission?.memory != null ? Number(submission.memory) : null,
    };

    if (candidate_id && screening_test_id) {
      await Submission.create({
        candidate_id,
        screening_test_id,
        questionId: id,
        languageId,
        code: String(finalCode),
        results: [
          {
            index: 1,
            input: stdin,
            expected: "",
            actual: payload.stdout,
            status,
            judge0Status: statusDesc,
            time: payload.time,
            memory: payload.memory,
            score: 0,
            maxScore: 0,
            visible: true,
          },
        ],
        summary: { passed: 0, total: 1, earnedScore: 0, maxScore: 0, message: "Custom run" },
        runType: "custom",
        status: "in-progress",
      });

      // append run_result marker
      await EditorSession.updateOne(
        { candidate_id, screening_test_id, questionId: id },
        {
          $push: {
            events: {
              t: Date.now(),
              type: "run_result",
              status:
                statusId === 6
                  ? "compile_error"
                  : [7, 8, 9, 10, 11, 12, 14, 15].includes(statusId)
                  ? "runtime_error"
                  : "passed",
              message: statusDesc,
            },
          },
        }
      );
    }

    res.json(payload);
  } catch (err) {
    console.error("POST /api/run/:id/custom error:", err.message);
    res.status(500).json({ error: "Custom execution failed" });
  }
});

// ======================================================
// SUBMISSIONS + EDITOR SESSIONS
// ======================================================
app.get("/api/submissions/:candidate_id/:screening_test_id", async (req, res) => {
  try {
    const { candidate_id, screening_test_id } = req.params;
    const docs = await Submission.find({ candidate_id, screening_test_id })
      .sort({ createdAt: -1 })
      .lean();
    res.json({ submissions: docs });
  } catch (err) {
    console.error("GET /api/submissions error:", err);
    res.status(500).json({ error: "Failed to fetch submissions" });
  }
});

// Capture editor events (append to session)
// Capture editor events (append to session + inject pause events)
app.post("/api/editor-events", async (req, res) => {
  try {
    const { sessionId, candidate_id, screening_test_id, questionId, languageId, events } = req.body || {};
    if (!sessionId || !questionId) {
      return res.status(400).json({ error: "sessionId & questionId required" });
    }

    // Fetch last event timestamp (if any)
    const existing = await EditorSession.findOne({ sessionId }).select("events.t").lean();
    let lastT = existing?.events?.length ? existing.events[existing.events.length - 1].t : null;

    const processed = [];
    if (Array.isArray(events)) {
      for (const e of events) {
        const t = Number(e.t);
        if (lastT != null && t - lastT >= 10_000) {
          processed.push({
            t,
            type: "pause",
            status: "pause",
            message: `Idle for ${(t - lastT) / 1000}s`,
          });
        }
        processed.push(e);
        lastT = t;
      }
    }

    await EditorSession.updateOne(
      { sessionId },
      {
        $setOnInsert: { candidate_id, screening_test_id, questionId, languageId },
        $push: { events: { $each: processed } },
      },
      { upsert: true }
    );

    res.json({ ok: true, appended: processed.length });
  } catch (e) {
    console.error("POST /api/editor-events", e);
    res.status(500).json({ error: "Failed to append events" });
  }
});

app.get("/api/editor-sessions/:sessionId", async (req, res) => {
  try {
    const doc = await EditorSession.findOne({ sessionId: req.params.sessionId }).lean();
    if (!doc) return res.status(404).json({ error: "Session not found" });
    res.json({ session: doc });
  } catch (e) {
    console.error("GET /api/editor-sessions/:sessionId", e);
    res.status(500).json({ error: "Failed to fetch session" });
  }
});

app.get("/api/editor-sessions", async (req, res) => {
  try {
    const { candidate_id, screening_test_id, questionId, limit = 20 } = req.query;
    const q = {};
    if (candidate_id) q.candidate_id = candidate_id;
    if (screening_test_id) q.screening_test_id = screening_test_id;
    if (questionId) q.questionId = questionId;
    const docs = await EditorSession.find(q)
      .sort({ createdAt: -1 })
      .limit(Number(limit))
      .lean();
    res.json({ sessions: docs });
  } catch (e) {
    console.error("GET /api/editor-sessions", e);
    res.status(500).json({ error: "Failed to list sessions" });
  }
});

// ---- Start ----
const PORT = process.env.PORT || 5050;
app.listen(PORT, () => console.log(`Server running on port ${PORT}`));