// models/Scaffold.js
const mongoose = require("mongoose");

const scaffoldSchema = new mongoose.Schema(
  {
    questionId: { type: mongoose.Schema.Types.ObjectId, ref: "Question", required: true },
    languageId: { type: Number, required: true },   // Judge0 language ID
    languageName: { type: String, required: true }, // "Java 17", "Python 3.8"
    body: { type: String, default: "" },            // editable starter code
  },
  { timestamps: true }
);

// Ensure uniqueness per (questionId, languageId)
scaffoldSchema.index({ questionId: 1, languageId: 1 }, { unique: true });

module.exports = mongoose.model("Scaffold", scaffoldSchema);