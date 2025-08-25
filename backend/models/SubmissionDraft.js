// models/SubmissionDraft.js
const mongoose = require("mongoose");

const submissionDraftSchema = new mongoose.Schema(
  {
    candidate_id: { type: String, required: true },
    screening_test_id: { type: String, required: true },
    questionId: { type: mongoose.Schema.Types.ObjectId, ref: "Question", required: true },
    languageId: { type: Number, required: true },
    code: { type: String, default: "" },
  },
  { timestamps: true }
);

// One draft per candidate+test+question+language
submissionDraftSchema.index(
  { candidate_id: 1, screening_test_id: 1, questionId: 1, languageId: 1 },
  { unique: true }
);

module.exports = mongoose.model("SubmissionDraft", submissionDraftSchema);