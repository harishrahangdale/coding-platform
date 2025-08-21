// models/Question.js
const mongoose = require("mongoose");

const testCaseSchema = new mongoose.Schema(
  {
    input: { type: String, required: true },
    output: { type: String, required: true },
    score: { type: Number, default: 1 },
    explanation: { type: String, default: "" },
    visible: { type: Boolean, default: false },
  },
  { _id: false }
);

const questionSchema = new mongoose.Schema(
  {
    title: { type: String, required: true },
    description: { type: String, default: "" },
    difficulty: { type: String, enum: ["Easy", "Medium", "Hard"], required: true },
    tags: { type: [String], default: [] },

    // Display-only examples
    sampleInput: { type: String, default: "" },
    sampleOutput: { type: String, default: "" },

    // Hidden, scored test cases
    testCases: { type: [testCaseSchema], default: [] },

    // Execution settings (per run)
    timeLimit: { type: Number, default: 5 },     // seconds
    memoryLimit: { type: Number, default: 256 },  // MB
    maxCodeSize: { type: Number, default: 1024 }, // KB

    // Admin/candidate policy
    maxAttempts: { type: Number, default: 3 },
  },
  { timestamps: true }
);

module.exports = mongoose.model("Question", questionSchema);