// models/Submission.js
const mongoose = require("mongoose");

// Per-test-case result (what the judge returned + our scoring)
const caseResultSchema = new mongoose.Schema(
  {
    index: Number,
    input: { type: String, default: "" },
    expected: { type: String, default: "" },
    actual: { type: String, default: "" },
    status: { type: String, enum: ["Passed", "Failed", "Compilation Error", "Runtime Error", "Other"], default: "Other" },
    judge0Status: { type: String, default: "" }, // e.g., "Accepted", "Runtime Error (SIGSEGV)"
    time: { type: Number, default: null },       // seconds (float)
    memory: { type: Number, default: null },     // KB
    score: { type: Number, default: 0 },
    maxScore: { type: Number, default: 0 },
    visible: { type: Boolean, default: false },
  },
  { _id: false }
);

const summarySchema = new mongoose.Schema(
  {
    passed: { type: Number, default: 0 },
    total: { type: Number, default: 0 },
    earnedScore: { type: Number, default: 0 },
    maxScore: { type: Number, default: 0 },
    message: { type: String, default: "" },
  },
  { _id: false }
);

const submissionSchema = new mongoose.Schema(
  {
    // External system identifiers (use String for flexibility: ObjectId/UUID/etc.)
    candidate_id: { type: String, required: true, index: true },
    screening_test_id: { type: String, required: true, index: true },

    // Problem & language info
    questionId: { type: mongoose.Schema.Types.ObjectId, ref: "Question", required: true, index: true },
    languageId: { type: Number, required: true },
    languageName: { type: String, default: "" }, // optional convenience

    // What the candidate actually wrote
    code: { type: String, required: true },

    // Judge results
    results: { type: [caseResultSchema], default: [] },
    summary: { type: summarySchema, default: () => ({}) },

    // Metadata
    runType: { type: String, enum: ["run", "custom", "submit"], default: "run" }, // can extend later
    status: { type: String, enum: ["in-progress", "completed"], default: "in-progress" },

    // Auditing (optional)
    userAgent: { type: String, default: "" },
    ipAddress: { type: String, default: "" },
    sessionId: { type: String, default: null, index: true },

    // Code analysis results from Gemini
    codeAnalysis: {
      logicalCorrectness: {
        score: { type: Number, default: 0 },
        maxScore: { type: Number, default: 100 },
        reasoning: { type: String, default: "" },
        strengths: { type: [String], default: [] },
        weaknesses: { type: [String], default: [] },
        suggestions: { type: [String], default: [] }
      },
      codeQuality: {
        score: { type: Number, default: 0 },
        maxScore: { type: Number, default: 100 },
        reasoning: { type: String, default: "" },
        aspects: {
          readability: { type: String, default: "Unknown" },
          maintainability: { type: String, default: "Unknown" },
          efficiency: { type: String, default: "Unknown" },
          bestPractices: { type: String, default: "Unknown" }
        }
      },
      overallAssessment: {
        grade: { type: String, default: "C" },
        summary: { type: String, default: "" },
        recommendations: { type: [String], default: [] }
      }
    },
    analysisTimestamp: { type: Date, default: null },
    
    // Session replay data
    sessionEvents: { type: [Object], default: [] }
  },
  { timestamps: true }
);

// Helpful compound indexes for reporting
submissionSchema.index({ candidate_id: 1, screening_test_id: 1, createdAt: -1 });
submissionSchema.index({ candidate_id: 1, screening_test_id: 1, questionId: 1, createdAt: -1 });

module.exports = mongoose.model("Submission", submissionSchema);