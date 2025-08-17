import React, { useState, useEffect } from 'react';
import axios from 'axios';
import './App.css';
import Judge0Editor from './components/Judge0Editor';

function App() {
  const [questions, setQuestions] = useState([]);
  const [selectedQuestion, setSelectedQuestion] = useState(null);

  // Base URL for backend API (deployed on Render)
  const API_BASE_URL = "https://coding-platform-teq9.onrender.com/api";

  useEffect(() => {
    axios.get(`${API_BASE_URL}/questions`)
      .then(res => setQuestions(res.data))
      .catch(err => console.error('Error fetching questions:', err));
  }, []);

  const handleQuestionSelect = (id) => {
    axios.get(`${API_BASE_URL}/questions/${id}`)
      .then(res => setSelectedQuestion(res.data))
      .catch(err => console.error('Error fetching question:', err));
  };

  return (
    <div className="flex h-screen">
      {/* Left Panel: Question List + Details */}
      <div className="w-1/2 p-4 overflow-y-auto bg-gray-100">
        <h1 className="text-2xl font-bold mb-4">Coding Platform</h1>
        <h2 className="text-xl font-semibold">Questions</h2>
        <ul className="mb-4">
          {questions.map(q => (
            <li
              key={q._id}
              className="cursor-pointer p-2 hover:bg-gray-200 rounded"
              onClick={() => handleQuestionSelect(q._id)}
            >
              {q.title}
            </li>
          ))}
        </ul>

        {selectedQuestion && (
          <div className="mt-4">
            <h3 className="text-lg font-semibold">{selectedQuestion.title}</h3>
            <p><strong>Description:</strong> {selectedQuestion.description}</p>
            <p><strong>Difficulty:</strong> {selectedQuestion.difficulty}</p>
            <p><strong>Input-1:</strong> {selectedQuestion.input1}</p>
            <p><strong>Output-1:</strong> {selectedQuestion.output1}</p>
            <p><strong>Input-2:</strong> {selectedQuestion.input2}</p>
            <p><strong>Output-2:</strong> {selectedQuestion.output2}</p>
            <p><strong>Input-3:</strong> {selectedQuestion.input3}</p>
            <p><strong>Output-3:</strong> {selectedQuestion.output3}</p>
            <p><strong>Input-4:</strong> {selectedQuestion.input4}</p>
            <p><strong>Output-4:</strong> {selectedQuestion.output4}</p>
            <p><strong>Input-5:</strong> {selectedQuestion.input5}</p>
            <p><strong>Output-5:</strong> {selectedQuestion.output5}</p>
            <p><strong>Constraints:</strong> {selectedQuestion.constraints}</p>
          </div>
        )}
      </div>

      {/* Right Panel: Judge0-powered Editor */}
      <div className="w-1/2 p-4 flex flex-col">
        <Judge0Editor selectedQuestion={selectedQuestion} />
      </div>
    </div>
  );
}

export default App;