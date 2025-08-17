const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const axios = require('axios');
require('dotenv').config();

const app = express();
app.use(cors({
  origin: "https://friendly-youtiao-9b4c9c.netlify.app"
}));
app.use(express.json());

// MongoDB Connection
mongoose.connect(process.env.MONGO_URI, {
  useNewUrlParser: true,
  useUnifiedTopology: true,
})
  .then(() => console.log('MongoDB connected'))
  .catch(err => console.error('MongoDB connection error:', err));

// Question Schema
const questionSchema = new mongoose.Schema({
  title: String,
  description: String,
  difficulty: String,
  language: String,
  timeLimit: Number,   // in minutes to solve the problem
  maxAttempts: Number,
  input1: String,
  output1: String,
  input2: String,
  output2: String,
  input3: String,
  output3: String,
  input4: String,
  output4: String,
  input5: String,
  output5: String,
  constraints: String,
});
const Question = mongoose.model('Question', questionSchema);

// Get all questions
app.get('/api/questions', async (req, res) => {
  try {
    const questions = await Question.find();
    res.json(questions);
  } catch (err) {
    console.error('GET /api/questions error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

// Get single question by ID
app.get('/api/questions/:id', async (req, res) => {
  try {
    const { id } = req.params;
    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({ error: 'Invalid question ID format' });
    }
    const question = await Question.findById(id);
    if (!question) return res.status(404).json({ error: 'Question not found' });
    res.json(question);
  } catch (err) {
    console.error('GET /api/questions/:id error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

// Run user code against predefined test cases
app.post('/api/run/:id', async (req, res) => {
  const { id } = req.params;
  const { finalCode, language_id } = req.body;  // ✅ frontend must send full code

  if (!finalCode || !language_id) {
    return res.status(400).json({ error: 'finalCode and language_id are required' });
  }

  try {
    const question = await Question.findById(id);
    if (!question) return res.status(404).json({ error: 'Question not found' });

    // Collect available test cases from DB
    const testCases = [
      { input: question.input1, expected: question.output1 },
      { input: question.input2, expected: question.output2 },
      { input: question.input3, expected: question.output3 },
      { input: question.input4, expected: question.output4 },
      { input: question.input5, expected: question.output5 },
    ].filter(tc => tc.input && tc.expected);

    const results = [];
    for (const tc of testCases) {
      console.log('Sending submission for input:', tc.input);

      const response = await axios.post(
        'https://judge0-ce.p.rapidapi.com/submissions?base64_encoded=false&wait=true',
        {
          source_code: finalCode,   // ✅ use code from frontend directly
          language_id,
          stdin: tc.input || "",    // ✅ feed actual test case input
        },
        {
          headers: {
            'Content-Type': 'application/json',
            'X-RapidAPI-Key': process.env.JUDGE0_API_KEY,
            'X-RapidAPI-Host': 'judge0-ce.p.rapidapi.com',
          },
        }
      );

      const submission = response.data;
      console.log('Submission result:', JSON.stringify(submission, null, 2));

      let actual = '';
      let errorType = '';

      if (submission.status.id !== 3) {
        if (submission.status.id === 6) {
          errorType = 'Compilation Error';
          actual = submission.compile_output || '';
        } else if ([7, 8, 9, 10, 11, 12, 14].includes(submission.status.id)) {
          errorType = 'Runtime Error';
          actual = submission.stderr || submission.message || '';
        } else {
          errorType = submission.status.description;
          actual = submission.stderr || submission.message || '';
        }
        actual = `${errorType}: ${actual.trim()}`;
      } else {
        actual = (submission.stdout || '').trim();
        if (actual === '' && submission.stderr) {
          actual = `Stderr: ${submission.stderr.trim()}`;
        }
      }

      const expected = (tc.expected || '').trim();
      results.push({
        input: tc.input,
        expected,
        actual,
        status: actual === expected ? 'Passed' : 'Failed',
      });
    }

    const passed = results.filter(r => r.status === 'Passed').length;
    res.json({
      results,
      summary: `${passed}/${results.length} Test Cases Passed`,
    });

  } catch (err) {
    console.error('POST /api/run/:id error:', err.response?.data || err.message);
    res.status(500).json({ error: 'Execution failed' });
  }
});

// Start server
const PORT = process.env.PORT || 5050; // use 5050 on macOS to avoid AirPlay conflict
app.listen(PORT, () => console.log(`Server running on port ${PORT}`));
