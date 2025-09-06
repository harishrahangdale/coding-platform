const express = require("express");
const mongoose = require("mongoose");
const cors = require("cors");
const axios = require("axios");
require("dotenv").config();

const Question = require("./models/Question");
const AIQuestions = require("./models/AIQuestions");
const Scaffold = require("./models/Scaffold");
const Submission = require("./models/Submission");
const SubmissionDraft = require("./models/SubmissionDraft");
const EditorSession = require("./models/EditorSession");

const app = express();
// CORS configuration based on environment
const allowedOrigins = process.env.NODE_ENV === 'production' 
  ? [process.env.FRONTEND_URL]
  : [
      process.env.DEV_FRONTEND_URL || "http://localhost:3000",
      process.env.DEV_FRONTEND_URL_ALT || "http://127.0.0.1:3000",
      process.env.FRONTEND_URL
    ].filter(Boolean);

app.use(cors({
  origin: allowedOrigins
}));
app.use(express.json());

// ---- MongoDB ----
mongoose
  .connect(process.env.MONGO_URI, { useNewUrlParser: true, useUnifiedTopology: true })
  .then(() => console.log("MongoDB connected"))
  .catch((err) => console.error("MongoDB connection error:", err));

// ---- Helpers ----
const mapQuestionListItem = (q, languages = []) => ({
  _id: q._id,
  title: q.title,
  difficulty: q.difficulty,
  tags: q.tags || [],
  totalScore: Array.isArray(q.testCases) ? q.testCases.reduce((s, t) => s + (t.score || 0), 0) : 0,
  languages,
});

const judge0 = axios.create({
  baseURL: process.env.JUDGE0_BASE_URL || "https://judge0-ce.p.rapidapi.com",
  headers: {
    "Content-Type": "application/json",
    "X-RapidAPI-Key": process.env.JUDGE0_API_KEY,
    "X-RapidAPI-Host": process.env.JUDGE0_HOST || "judge0-ce.p.rapidapi.com",
  },
});

// Gemini API configuration for code analysis
const GEMINI_API_KEY = process.env.GEMINI_API_KEY || process.env.API_KEY;
const GEMINI_URL = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${GEMINI_API_KEY}`;

// Gemini API helper functions
function buildGeminiBody(textPrompt) {
  return { contents: [{ role: 'user', parts: [{ text: textPrompt }] }] };
}

async function callGeminiAPI(prompt) {
  if (!GEMINI_API_KEY) {
    throw new Error('GEMINI_API_KEY not set in environment variables');
  }
  
  const body = buildGeminiBody(prompt);
  const response = await axios.post(GEMINI_URL, body, {
    headers: { 'Content-Type': 'application/json' },
    timeout: 30000 // 30 second timeout
  });
  return response.data;
}

function extractGeminiResponse(data) {
  if (!data) return '';
  if (data.candidates && Array.isArray(data.candidates) && data.candidates.length) {
    const candidate = data.candidates[0];
    if (candidate.content && candidate.content.parts && candidate.content.parts.length) {
      return candidate.content.parts.map(part => part.text).join('\n');
    }
  }
  return '';
}

// ======================================================
// AI QUESTIONS MANAGEMENT
// ======================================================

// List AI questions
app.get("/api/ai-questions", async (req, res) => {
  try {
    const { page = 1, limit = 20, difficulty, search } = req.query;
    const skip = (parseInt(page) - 1) * parseInt(limit);
    
    // Build filter
    const filter = {};
    if (difficulty && difficulty !== 'All') {
      filter.difficulty = difficulty;
    }
    if (search) {
      filter.$or = [
        { title: { $regex: search, $options: 'i' } },
        { description: { $regex: search, $options: 'i' } },
        { tags: { $in: [new RegExp(search, 'i')] } }
      ];
    }

    const [questions, total] = await Promise.all([
      AIQuestions.find(filter)
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(parseInt(limit))
        .lean(),
      AIQuestions.countDocuments(filter)
    ]);

    const questionsWithScore = questions.map(q => ({
      ...q,
      totalScore: Array.isArray(q.testCases) ? q.testCases.reduce((s, t) => s + (t.score || 0), 0) : 0
    }));

    res.json({
      questions: questionsWithScore,
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
        total,
        pages: Math.ceil(total / parseInt(limit))
      }
    });
  } catch (err) {
    console.error("GET /api/ai-questions error:", err);
    res.status(500).json({ error: "Server error" });
  }
});

// Get single AI question details
app.get("/api/ai-questions/:id", async (req, res) => {
  try {
    const { id } = req.params;
    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({ error: "Invalid question ID format" });
    }
    
    const question = await AIQuestions.findById(id).lean();
    if (!question) return res.status(404).json({ error: "Question not found" });

    const totalScore = (question.testCases || []).reduce((s, t) => s + (t.score || 0), 0);
    res.json({
      ...question,
      totalScore
    });
  } catch (err) {
    console.error("GET /api/ai-questions/:id error:", err);
    res.status(500).json({ error: "Server error" });
  }
});

// Delete AI question
app.delete("/api/ai-questions/:id", async (req, res) => {
  try {
    const { id } = req.params;
    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({ error: "Invalid question ID format" });
    }

    const question = await AIQuestions.findByIdAndDelete(id);
    if (!question) return res.status(404).json({ error: "Question not found" });

    res.json({ message: "Question deleted successfully" });
  } catch (err) {
    console.error("DELETE /api/ai-questions/:id error:", err);
    res.status(500).json({ error: "Server error" });
  }
});

// Delete multiple AI questions
app.delete("/api/ai-questions", async (req, res) => {
  try {
    const { ids } = req.body;
    if (!Array.isArray(ids) || ids.length === 0) {
      return res.status(400).json({ error: "ids array is required" });
    }

    // Validate all IDs
    const validIds = ids.filter(id => mongoose.Types.ObjectId.isValid(id));
    if (validIds.length !== ids.length) {
      return res.status(400).json({ error: "Some IDs are invalid" });
    }

    const result = await AIQuestions.deleteMany({ _id: { $in: validIds } });
    res.json({ 
      message: `${result.deletedCount} questions deleted successfully`,
      deletedCount: result.deletedCount
    });
  } catch (err) {
    console.error("DELETE /api/ai-questions error:", err);
    res.status(500).json({ error: "Server error" });
  }
});

// ======================================================
// CODE ANALYSIS WITH GEMINI
// ======================================================

// Analyze code logical correctness
app.post("/api/analyze-code", async (req, res) => {
  try {
    const { code, questionTitle, questionDescription, language, testCases } = req.body;
    
    if (!code || !questionTitle || !questionDescription) {
      return res.status(400).json({ error: "code, questionTitle, and questionDescription are required" });
    }

    // Build the analysis prompt for Gemini
    const analysisPrompt = `You are an expert code reviewer. Analyze the following code for logical correctness and quality.

QUESTION: ${questionTitle}
DESCRIPTION: ${questionDescription}
PROGRAMMING LANGUAGE: ${language || 'Unknown'}

CODE TO ANALYZE:
\`\`\`${language || 'text'}
${code}
\`\`\`

TEST CASES (for context):
${testCases ? JSON.stringify(testCases, null, 2) : 'No test cases provided'}

Please provide a comprehensive analysis in the following JSON format:
{
  "logicalCorrectness": {
    "score": 85,
    "maxScore": 100,
    "reasoning": "The code demonstrates good understanding of the problem but has some logical issues...",
    "strengths": ["Good algorithm choice", "Proper variable naming"],
    "weaknesses": ["Missing edge case handling", "Inefficient nested loops"],
    "suggestions": ["Add null checks", "Consider using a more efficient data structure"]
  },
  "codeQuality": {
    "score": 78,
    "maxScore": 100,
    "reasoning": "Code is readable but could be improved...",
    "aspects": {
      "readability": "Good",
      "maintainability": "Fair", 
      "efficiency": "Poor",
      "bestPractices": "Good"
    }
  },
  "overallAssessment": {
    "grade": "B+",
    "summary": "Solid solution with room for improvement",
    "recommendations": ["Focus on edge cases", "Optimize time complexity"]
  }
}

Be thorough but concise. Focus on logical correctness, algorithm efficiency, and code quality.`;

    // Call Gemini API
    const geminiResponse = await callGeminiAPI(analysisPrompt);
    const analysisText = extractGeminiResponse(geminiResponse);
    
    if (!analysisText) {
      throw new Error('Failed to get analysis from Gemini API');
    }

    // Try to parse JSON response
    let analysis;
    try {
      // Extract JSON from the response (in case there's extra text)
      const jsonMatch = analysisText.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        analysis = JSON.parse(jsonMatch[0]);
      } else {
        throw new Error('No JSON found in response');
      }
    } catch (parseError) {
      // Fallback: create a basic analysis structure
      analysis = {
        logicalCorrectness: {
          score: 50,
          maxScore: 100,
          reasoning: "Unable to parse detailed analysis. Raw response: " + analysisText.substring(0, 200),
          strengths: [],
          weaknesses: ["Analysis parsing failed"],
          suggestions: ["Please review the code manually"]
        },
        codeQuality: {
          score: 50,
          maxScore: 100,
          reasoning: "Analysis parsing failed",
          aspects: {
            readability: "Unknown",
            maintainability: "Unknown",
            efficiency: "Unknown",
            bestPractices: "Unknown"
          }
        },
        overallAssessment: {
          grade: "C",
          summary: "Analysis parsing failed - manual review recommended",
          recommendations: ["Review code manually"]
        }
      };
    }

    res.json({
      success: true,
      analysis,
      rawResponse: analysisText,
      timestamp: new Date().toISOString()
    });

  } catch (error) {
    console.error("Code analysis error:", error);
    res.status(500).json({ 
      error: "Failed to analyze code", 
      details: error.message 
    });
  }
});

// ======================================================
// SUBMISSIONS MANAGEMENT
// ======================================================

// Get all submissions with pagination and filtering
app.get("/api/submissions", async (req, res) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 10;
    const search = req.query.search || '';
    const status = req.query.status;

    const query = {};
    
    // Add search functionality
    if (search) {
      query.$or = [
        { candidate_id: { $regex: search, $options: 'i' } },
        { sessionId: { $regex: search, $options: 'i' } }
      ];
    }

    // Add status filtering based on test results
    if (status && status !== 'all') {
      if (status === 'Passed') {
        query['summary.passed'] = { $gt: 0 };
      } else if (status === 'Failed') {
        query['summary.passed'] = 0;
      }
    }

    const submissions = await Submission.find(query)
      .populate('questionId', 'title description difficulty timeAllowed')
      .sort({ createdAt: -1 })
      .skip((page - 1) * limit)
      .limit(limit)
      .lean();

    const total = await Submission.countDocuments(query);
    const totalPages = Math.ceil(total / limit);

    res.json({
      submissions,
      totalPages,
      currentPage: page,
      total
    });
  } catch (error) {
    console.error("GET /api/submissions error:", error);
    res.status(500).json({ error: "Server error" });
  }
});

// Get submission markers for timeline
app.get("/api/submissions/markers", async (req, res) => {
  try {
    const { candidate_id, screening_test_id, questionId, sessionId } = req.query;
    
    const submissions = await Submission.find({
      candidate_id,
      screening_test_id,
      questionId,
      sessionId
    }).sort({ createdAt: 1 }).lean();

    const markers = submissions.map(sub => ({
      t: new Date(sub.createdAt).getTime() - new Date(submissions[0]?.createdAt || sub.createdAt).getTime(),
      kind: sub.summary?.passed > 0 ? 'pass' : 'fail',
      meta: {
        score: sub.summary?.earnedScore || 0,
        maxScore: sub.summary?.maxScore || 0,
        status: sub.status
      }
    }));

    res.json({ markers });
  } catch (error) {
    console.error("GET /api/submissions/markers error:", error);
    res.status(500).json({ error: "Server error" });
  }
});

// Get single submission details
app.get("/api/submissions/:id", async (req, res) => {
  try {
    const submission = await Submission.findById(req.params.id)
      .populate('questionId', 'title description difficulty timeAllowed testCases languages')
      .lean();

    if (!submission) {
      return res.status(404).json({ error: "Submission not found" });
    }

    res.json(submission);
  } catch (error) {
    console.error("GET /api/submissions/:id error:", error);
    res.status(500).json({ error: "Server error" });
  }
});

// Update submission with code analysis
app.post("/api/submissions/:id/analysis", async (req, res) => {
  try {
    const { analysis } = req.body;
    
    const submission = await Submission.findByIdAndUpdate(
      req.params.id,
      { 
        $set: { 
          codeAnalysis: analysis,
          analysisTimestamp: new Date()
        } 
      },
      { new: true }
    );

    if (!submission) {
      return res.status(404).json({ error: "Submission not found" });
    }

    res.json({ success: true, submission });
  } catch (error) {
    console.error("POST /api/submissions/:id/analysis error:", error);
    res.status(500).json({ error: "Server error" });
  }
});

// ======================================================
// EDITOR SESSIONS (for replay)
// ======================================================

// Save editor events
app.post("/api/editor-sessions", async (req, res) => {
  try {
    const { sessionId, candidate_id, screening_test_id, questionId, languageId, events } = req.body;
    
    if (!sessionId || !candidate_id || !screening_test_id || !questionId) {
      return res.status(400).json({ error: "sessionId, candidate_id, screening_test_id, and questionId are required" });
    }

    const session = await EditorSession.findOneAndUpdate(
      { sessionId },
      {
        sessionId,
        candidate_id,
        screening_test_id,
        questionId: new mongoose.Types.ObjectId(questionId),
        languageId,
        events: events || []
      },
      { upsert: true, new: true }
    );

    res.json({ success: true, session });
  } catch (error) {
    console.error("POST /api/editor-sessions error:", error);
    res.status(500).json({ error: "Server error" });
  }
});

// Get editor session for replay
app.get("/api/editor-sessions/:sessionId", async (req, res) => {
  try {
    const { sessionId } = req.params;
    
    // Find editor session with this sessionId
    const session = await EditorSession.findOne({ sessionId })
      .populate('questionId', 'title description difficulty timeAllowed languages')
      .lean();

    if (!session) {
      return res.status(404).json({ error: "Session not found" });
    }

    // Get language name from question languages
    const languageName = session.questionId?.languages?.find(lang => lang.languageId === session.languageId)?.languageName || `Language ${session.languageId}`;

    // Return session data in the format expected by SessionReplay
    const sessionData = {
      sessionId: session.sessionId,
      candidate_id: session.candidate_id,
      screening_test_id: session.screening_test_id,
      questionId: session.questionId,
      languageId: session.languageId,
      languageName: languageName,
      events: session.events || [],
      createdAt: session.createdAt,
      updatedAt: session.updatedAt
    };

    res.json({ session: sessionData });
  } catch (error) {
    console.error("GET /api/editor-sessions/:sessionId error:", error);
    res.status(500).json({ error: "Server error" });
  }
});

// ======================================================
// RUN-ONLY ENDPOINT (no submission creation)
// ======================================================

// Run code for instant feedback without creating submission
app.post("/api/run-only/:id", async (req, res) => {
  try {
    const { id } = req.params;
    const { finalCode, languageId, candidate_id, screening_test_id } = req.body;

    if (!finalCode || !languageId) {
      return res.status(400).json({ error: "finalCode and languageId are required" });
    }

    const question = await Question.findById(id).lean();
    if (!question) {
      return res.status(404).json({ error: "Question not found" });
    }

    // Get test cases
    const testCases = question.testCases || [];
    
    // If no test cases, create a simple one using sample input/output
    if (testCases.length === 0) {
      // Use sample input/output if available, otherwise create a basic test
      const sampleInput = question.sampleInput || "2 3";
      const sampleOutput = question.sampleOutput || "5";
      
      testCases.push({
        input: sampleInput,
        output: sampleOutput,
        score: 1,
        explanation: "Sample test case",
        visible: true
      });
    }

    // Use the same logic as the main run endpoint - process each test case individually
    const results = [];
    let earnedScore = 0;
    const maxScore = testCases.reduce((s, t) => s + (t.score || 0), 0);

    for (const [idx, tc] of testCases.entries()) {
      const stdin = String(tc.input ?? "");
      const expected = String(tc.output ?? "").trim();

      let submission;
      try {
        const response = await judge0.post(
          "/submissions?base64_encoded=false&wait=true",
          { source_code: finalCode, language_id: languageId, stdin }
        );
        submission = response.data;
      } catch (judge0Error) {
        if (judge0Error.response?.status === 429) {
          // Judge0 API quota exceeded
          submission = {
            status: { id: 429, description: "Too Many Requests" },
            stdout: "",
            stderr: "Judge0 API quota exceeded. Please try again later.",
            time: null,
            memory: null
          };
        } else {
          throw judge0Error;
        }
      }

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
      passed: results.filter(r => r.status === "Passed").length,
      total: results.length,
      earnedScore,
      maxScore,
      message: `${earnedScore}/${maxScore} points • ${results.filter(r => r.status === "Passed").length}/${results.length} test cases passed`,
    };

    // Only expose visible test cases to publicResults
    const publicResults = results.filter(r => r.visible);

    res.json({
      results,
      publicResults,
      summary
    });

  } catch (error) {
    console.error("Run-only error:", error);
    res.status(500).json({ 
      error: "Failed to run code", 
      details: error.message 
    });
  }
});

// ======================================================
// REGULAR QUESTIONS
// ======================================================

// ---- Questions list ----
app.get("/api/questions", async (req, res) => {
  try {
    const questions = await Question.find({}).sort({ createdAt: -1 }).lean();
    const scaffolds = await Scaffold.aggregate([
      { $group: { _id: "$questionId", languages: { $addToSet: { languageId: "$languageId", languageName: "$languageName" } } } }
    ]);
    const langsByQ = new Map(scaffolds.map(s => [String(s._id), s.languages]));
    const payload = questions.map((q) => mapQuestionListItem(q, langsByQ.get(String(q._id)) || []));
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
      Scaffold.find({ questionId: id }).select("languageId languageName").lean(),
    ]);
    if (!question) return res.status(404).json({ error: "Question not found" });

    const totalScore = (question.testCases || []).reduce((s, t) => s + (t.score || 0), 0);
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
      languages: (languages || []).map((l) => ({ languageId: l.languageId, languageName: l.languageName })),
    });
  } catch (err) {
    console.error("GET /api/questions/:id error:", err);
    res.status(500).json({ error: "Server error" });
  }
});

// ---- Visible test cases (for UI 'visible' tab) ----
app.get("/api/questions/:id/visible-tests", async (req, res) => {
  try {
    const { id } = req.params;
    if (!mongoose.Types.ObjectId.isValid(id)) return res.status(400).json({ error: "Invalid question ID format" });
    const q = await Question.findById(id).select("testCases").lean();
    if (!q) return res.status(404).json({ error: "Question not found" });

    const cases = (q.testCases || [])
      .map((t, i) => ({ index: i + 1, input: String(t.input ?? ""), expected: String(t.output ?? ""), score: t.score || 0, visible: !!t.visible }))
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
    if (!mongoose.Types.ObjectId.isValid(id)) return res.status(400).json({ error: "Invalid question ID format" });

    const scaffold = await Scaffold.findOne({ questionId: id, languageId: Number(languageId) }).lean();
    if (!scaffold) return res.status(404).json({ error: "No scaffold found for this language" });

    res.json({ questionId: scaffold.questionId, languageId: scaffold.languageId, languageName: scaffold.languageName, body: scaffold.body || "" });
  } catch (err) {
    console.error("GET /api/questions/:id/scaffold/:languageId error:", err);
    res.status(500).json({ error: "Server error" });
  }
});

// ======================================================
// AUTOSAVE DRAFTS
// ======================================================

// Save/Update draft
app.post("/api/save-draft", async (req, res) => {
  try {
    const { candidate_id, screening_test_id, questionId, languageId, code } = req.body || {};
    if (!candidate_id || !screening_test_id || !questionId || !languageId) {
      return res.status(400).json({ error: "candidate_id, screening_test_id, questionId, languageId are required" });
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

// Fetch draft (prefill editor if present)
app.get("/api/draft", async (req, res) => {
  try {
    const { candidate_id, screening_test_id, questionId, languageId } = req.query || {};
    if (!candidate_id || !screening_test_id || !questionId || !languageId) {
      return res.status(400).json({ error: "candidate_id, screening_test_id, questionId, languageId are required" });
    }
    if (!mongoose.Types.ObjectId.isValid(questionId)) {
      return res.status(400).json({ error: "Invalid question ID format" });
    }
    const doc = await SubmissionDraft.findOne({ candidate_id, screening_test_id, questionId, languageId: Number(languageId) }).lean();
    res.json({ draft: doc ? { code: doc.code, updatedAt: doc.updatedAt } : null });
  } catch (err) {
    console.error("GET /api/draft error:", err);
    res.status(500).json({ error: "Failed to fetch draft" });
  }
});

// ======================================================
// RUN / CUSTOM RUN (with submission logging)
// ======================================================

// Utility to normalize Judge0 submission into our per-case result
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
  } else if (statusId === 429) {
    status = "API Quota Exceeded";
    actual = (submission.stderr || "Judge0 API quota exceeded. Please try again later.").trim();
  } else if ([7, 8, 9, 10, 11, 12, 14, 15].includes(statusId)) {
    status = "Runtime Error";
    actual = (submission.stderr || submission.message || "").trim();
  } else {
    status = "Other";
    actual = (submission.stderr || submission.message || "").trim();
  }

  // Judge0 time/memory can be null; cast to Number if present
  const time = submission?.time != null ? Number(submission.time) : null;
  const memory = submission?.memory != null ? Number(submission.memory) : null;

  return {
    index: idx + 1,
    input: String(stdin ?? ""),
    expected,
    actual,
    status,
    judge0Status: statusDesc,
    time,
    memory,
    score: status === "Passed" ? (score || 0) : 0,
    maxScore: score || 0,
    visible: !!visible,
  };
};

// RUN all hidden test cases, log Submission if candidate/test provided
app.post("/api/run/:id", async (req, res) => {
  const { id } = req.params;
  const finalCode = req.body.finalCode || req.body.source_code;
  const languageId = Number(req.body.languageId ?? req.body.language_id);
  const candidate_id = req.body.candidate_id;
  const screening_test_id = req.body.screening_test_id;
  const userAgent = req.headers["user-agent"] || "";
  const ipAddress = req.headers["x-forwarded-for"] || req.socket?.remoteAddress || "";

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
    
    // If no test cases, create a simple one using sample input/output
    if (testCases.length === 0) {
      // Use sample input/output if available, otherwise create a basic test
      const sampleInput = question.sampleInput || "2 3";
      const sampleOutput = question.sampleOutput || "5";
      
      testCases.push({
        input: sampleInput,
        output: sampleOutput,
        score: 1,
        explanation: "Sample test case",
        visible: true
      });
    }

    const results = [];
    let earnedScore = 0;
    const maxScore = testCases.reduce((s, t) => s + (t.score || 0), 0);

    for (const [idx, tc] of testCases.entries()) {
      const stdin = String(tc.input ?? "");
      const expected = String(tc.output ?? "").trim();

      let submission;
      try {
        const response = await judge0.post(
          "/submissions?base64_encoded=false&wait=true",
          { source_code: finalCode, language_id: languageId, stdin }
        );
        submission = response.data;
      } catch (judge0Error) {
        if (judge0Error.response?.status === 429) {
          // Judge0 API quota exceeded
          submission = {
            status: { id: 429, description: "Too Many Requests" },
            stdout: "",
            stderr: "Judge0 API quota exceeded. Please try again later.",
            time: null,
            memory: null
          };
        } else {
          throw judge0Error;
        }
      }

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
      passed: results.filter(r => r.status === "Passed").length,
      total: results.length,
      earnedScore,
      maxScore,
      message: `${earnedScore}/${maxScore} points • ${results.filter(r => r.status === "Passed").length}/${results.length} test cases passed`,
    };

    // Perform code analysis with Gemini (async, don't block the response)
    let codeAnalysis = null;
    if (GEMINI_API_KEY) {
      // Run analysis in background
      setImmediate(async () => {
        try {
          const analysisResponse = await callGeminiAPI(`You are an expert code reviewer. Analyze the following code for logical correctness and quality.

QUESTION: ${question.title}
DESCRIPTION: ${question.description}
PROGRAMMING LANGUAGE: ${languageId}

CODE TO ANALYZE:
\`\`\`
${finalCode}
\`\`\`

TEST CASES (for context):
${JSON.stringify(testCases, null, 2)}

Please provide a comprehensive analysis in the following JSON format:
{
  "logicalCorrectness": {
    "score": 85,
    "maxScore": 100,
    "reasoning": "The code demonstrates good understanding of the problem but has some logical issues...",
    "strengths": ["Good algorithm choice", "Proper variable naming"],
    "weaknesses": ["Missing edge case handling", "Inefficient nested loops"],
    "suggestions": ["Add null checks", "Consider using a more efficient data structure"]
  },
  "codeQuality": {
    "score": 78,
    "maxScore": 100,
    "reasoning": "Code is readable but could be improved...",
    "aspects": {
      "readability": "Good",
      "maintainability": "Fair", 
      "efficiency": "Poor",
      "bestPractices": "Good"
    }
  },
  "overallAssessment": {
    "grade": "B+",
    "summary": "Solid solution with room for improvement",
    "recommendations": ["Focus on edge cases", "Optimize time complexity"]
  }
}

Be thorough but concise. Focus on logical correctness, algorithm efficiency, and code quality.`);

          const analysisText = extractGeminiResponse(analysisResponse);
          if (analysisText) {
            try {
              // First try to extract JSON from markdown code blocks
              let jsonStr = analysisText;
              if (analysisText.includes('```json')) {
                const jsonMatch = analysisText.match(/```json\s*([\s\S]*?)\s*```/);
                if (jsonMatch) {
                  jsonStr = jsonMatch[1].trim();
                }
              } else {
                const jsonMatch = analysisText.match(/\{[\s\S]*\}/);
                if (jsonMatch) {
                  jsonStr = jsonMatch[0];
                }
              }
              
              if (jsonStr) {
                // Clean the JSON string before parsing
                jsonStr = jsonStr
                  .replace(/,(\s*[}\]])/g, '$1') // Remove trailing commas
                  .replace(/([{,]\s*)(\w+):/g, '$1"$2":') // Quote unquoted keys
                  .replace(/:\s*([^",{\[\]\s][^",{\[\]}]*?)(\s*[,\}\]])/g, ': "$1"$2'); // Quote unquoted string values
                
                codeAnalysis = JSON.parse(jsonStr);
                
                // Update the submission with analysis results (if submission exists)
                if (saved?._id) {
                  await Submission.updateOne(
                    { _id: saved._id },
                    { 
                      $set: { 
                        codeAnalysis,
                        analysisTimestamp: new Date().toISOString()
                      } 
                    }
                  );
                }
              }
            } catch (parseError) {
              console.error("Failed to parse code analysis:", parseError);
              console.error("Raw analysis text:", analysisText);
              
              // Fallback: create a basic analysis object
              codeAnalysis = {
                error: "Failed to parse AI analysis",
                rawText: analysisText,
                timestamp: new Date().toISOString()
              };
            }
          }
        } catch (analysisError) {
          console.error("Code analysis failed:", analysisError);
        }
      });
    }

    // Save a Submission only if we have candidate + screening test
    let saved = null;
    if (candidate_id && screening_test_id) {
      const runType = req.body.isFinalSubmission ? "submit" : "run";
      const status = req.body.isFinalSubmission ? "completed" : "in-progress";
      
      saved = await Submission.create({
        candidate_id,
        screening_test_id,
        questionId: new mongoose.Types.ObjectId(id),
        languageId,
        code: String(finalCode),
        results,
        summary,
        runType,
        status,
        userAgent,
        ipAddress,
        sessionId: req.body.sessionId || null,
        sessionEvents: req.body.sessionEvents || [], // Store session replay data
      });
    }

    // Only expose visible test cases to publicResults
    const publicResults = results.filter(r => r.visible);

    res.json({
      publicResults,
      results, // keep for richer "Results" tab with time/memory (you can omit on prod if you prefer)
      summary,
      submissionId: saved?._id || null,
    });
  } catch (err) {
    console.error("POST /api/run/:id error:", err.response?.data || err.message);
    res.status(500).json({ error: "Execution failed" });
  }
});

// Custom run with stdin; optional logging if candidate/test provided
app.post("/api/run/:id/custom", async (req, res) => {
  const { id } = req.params;
  const finalCode = req.body.finalCode || req.body.source_code;
  const languageId = Number(req.body.languageId ?? req.body.language_id);
  const stdin = String(req.body.stdin ?? "");

  const candidate_id = req.body.candidate_id;
  const screening_test_id = req.body.screening_test_id;
  const userAgent = req.headers["user-agent"] || "";
  const ipAddress = req.headers["x-forwarded-for"] || req.socket?.remoteAddress || "";

  if (!finalCode || !languageId) {
    return res.status(400).json({ error: "finalCode and languageId are required" });
  }
  if (!mongoose.Types.ObjectId.isValid(id)) {
    return res.status(400).json({ error: "Invalid question ID format" });
  }

  try {
    let submission;
    try {
      const response = await judge0.post(
        "/submissions?base64_encoded=false&wait=true",
        { source_code: finalCode, language_id: languageId, stdin }
      );
      submission = response.data;
    } catch (judge0Error) {
      if (judge0Error.response?.status === 429) {
        // Judge0 API quota exceeded
        submission = {
          status: { id: 429, description: "Too Many Requests" },
          stdout: "",
          stderr: "Judge0 API quota exceeded. Please try again later.",
          time: null,
          memory: null
        };
      } else {
        throw judge0Error;
      }
    }

    const statusId = submission?.status?.id;
    const statusDesc = submission?.status?.description || "";

    let stdout = (submission.stdout || "").trim();
    let stderr = "";
    let status = "OK";

    if (statusId === 6) {
      status = "Compilation Error";
      stderr = (submission.compile_output || "").trim();
    } else if (statusId === 429) {
      status = "API Quota Exceeded";
      stderr = (submission.stderr || "Judge0 API quota exceeded. Please try again later.").trim();
    } else if ([7, 8, 9, 10, 11, 12, 14, 15].includes(statusId)) {
      status = "Runtime Error";
      stderr = (submission.stderr || submission.message || "").trim();
    }

    const payload = {
      status: statusDesc || status,
      stdout,
      stderr,
      time: submission?.time != null ? Number(submission.time) : null,
      memory: submission?.memory != null ? Number(submission.memory) : null,
    };

    // Optional: store a submission record for custom runs as well
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
            actual: stdout,
            status: statusId === 3 ? "Passed" : (status.includes("Error") ? status : "Other"),
            judge0Status: statusDesc,
            time: payload.time,
            memory: payload.memory,
            score: 0,
            maxScore: 0,
            visible: true,
          }
        ],
        summary: { passed: 0, total: 1, earnedScore: 0, maxScore: 0, message: "Custom run" },
        runType: "custom",
        status: "in-progress",
        userAgent,
        ipAddress,
      });
    }

    res.json(payload);
  } catch (err) {
    console.error("POST /api/run/:id/custom error:", err.response?.data || err.message);
    res.status(500).json({ error: "Custom execution failed" });
  }
});

// List submissions for a candidate in a screening test
app.get("/api/submissions/:candidate_id/:screening_test_id", async (req, res) => {
  try {
    const { candidate_id, screening_test_id } = req.params;
    const docs = await Submission.find({ candidate_id, screening_test_id })
      .sort({ createdAt: -1 })
      .select("-__v")
      .lean();
    res.json({ submissions: docs });
  } catch (err) {
    console.error("GET /api/submissions error:", err);
    res.status(500).json({ error: "Failed to fetch submissions" });
  }
});

// Capture editor events (append to session)
app.post("/api/editor-events", async (req, res) => {
  try {
    const { sessionId, candidate_id, screening_test_id, questionId, languageId, events } = req.body || {};
    if (!sessionId || !questionId) {
      return res.status(400).json({ error: "sessionId & questionId required" });
    }
    await EditorSession.updateOne(
      { sessionId },
      {
        $setOnInsert: { candidate_id, screening_test_id, questionId, languageId },
        $push: { events: { $each: events || [] } },
      },
      { upsert: true }
    );
    res.json({ ok: true, appended: (events || []).length });
  } catch (e) {
    console.error("POST /api/editor-events", e);
    res.status(500).json({ error: "Failed to append events" });
  }
});

// Get one session by id

// List recent sessions (filterable)
app.get("/api/editor-sessions", async (req, res) => {
  try {
    const { candidate_id, screening_test_id, questionId, limit = 20 } = req.query;
    const q = {};
    if (candidate_id) q.candidate_id = candidate_id;
    if (screening_test_id) q.screening_test_id = screening_test_id;
    if (questionId) q.questionId = questionId;
    const docs = await EditorSession.find(q).sort({ createdAt: -1 }).limit(Number(limit)).lean();
    res.json({ sessions: docs });
  } catch (e) {
    console.error("GET /api/editor-sessions", e);
    res.status(500).json({ error: "Failed to list sessions" });
  }
});

// ---- Start ----
const PORT = process.env.PORT || 5050;
app.listen(PORT, () => console.log(`Server running on port ${PORT}`));