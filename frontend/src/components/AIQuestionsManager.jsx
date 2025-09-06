import React, { useState, useEffect } from 'react';
import axios from 'axios';

const API_BASE_URL = process.env.REACT_APP_API_BASE_URL || "http://localhost:5050/api";

function AIQuestionsManager() {
  const [questions, setQuestions] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [selectedQuestions, setSelectedQuestions] = useState(new Set());
  const [searchTerm, setSearchTerm] = useState('');
  const [difficultyFilter, setDifficultyFilter] = useState('All');
  const [currentPage, setCurrentPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [totalQuestions, setTotalQuestions] = useState(0);
  const [deleting, setDeleting] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [questionsToDelete, setQuestionsToDelete] = useState([]);

  const questionsPerPage = 20;

  // Load questions
  const loadQuestions = async (page = 1, search = '', difficulty = 'All') => {
    try {
      setLoading(true);
      setError(null);
      
      const params = new URLSearchParams({
        page: page.toString(),
        limit: questionsPerPage.toString(),
        ...(search && { search }),
        ...(difficulty !== 'All' && { difficulty })
      });

      const response = await axios.get(`${API_BASE_URL}/ai-questions?${params}`);
      setQuestions(response.data.questions);
      setTotalPages(response.data.pagination.pages);
      setTotalQuestions(response.data.pagination.total);
      setCurrentPage(page);
    } catch (err) {
      console.error('Error loading AI questions:', err);
      setError('Failed to load questions');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadQuestions(1, '', 'All');
  }, []);

  // Handle search
  const handleSearch = (e) => {
    e.preventDefault();
    setCurrentPage(1);
    loadQuestions(1, searchTerm, difficultyFilter);
  };

  // Handle difficulty filter change
  const handleDifficultyChange = (e) => {
    const newDifficulty = e.target.value;
    setDifficultyFilter(newDifficulty);
    setCurrentPage(1);
    loadQuestions(1, searchTerm, newDifficulty);
  };

  // Handle individual question selection
  const handleQuestionSelect = (questionId) => {
    const newSelected = new Set(selectedQuestions);
    if (newSelected.has(questionId)) {
      newSelected.delete(questionId);
    } else {
      newSelected.add(questionId);
    }
    setSelectedQuestions(newSelected);
  };

  // Handle select all
  const handleSelectAll = () => {
    if (selectedQuestions.size === questions.length) {
      setSelectedQuestions(new Set());
    } else {
      setSelectedQuestions(new Set(questions.map(q => q._id)));
    }
  };

  // Delete single question
  const handleDeleteSingle = async (questionId) => {
    if (!window.confirm('Are you sure you want to delete this question?')) return;
    
    try {
      setDeleting(true);
      await axios.delete(`${API_BASE_URL}/ai-questions/${questionId}`);
      setQuestions(questions.filter(q => q._id !== questionId));
      setSelectedQuestions(prev => {
        const newSet = new Set(prev);
        newSet.delete(questionId);
        return newSet;
      });
      setTotalQuestions(prev => prev - 1);
    } catch (err) {
      console.error('Error deleting question:', err);
      alert('Failed to delete question');
    } finally {
      setDeleting(false);
    }
  };

  // Delete multiple questions
  const handleDeleteMultiple = () => {
    if (selectedQuestions.size === 0) return;
    
    const questionsToDeleteList = questions.filter(q => selectedQuestions.has(q._id));
    setQuestionsToDelete(questionsToDeleteList);
    setShowDeleteConfirm(true);
  };

  const confirmDeleteMultiple = async () => {
    try {
      setDeleting(true);
      const ids = Array.from(selectedQuestions);
      await axios.delete(`${API_BASE_URL}/ai-questions`, { data: { ids } });
      
      setQuestions(questions.filter(q => !selectedQuestions.has(q._id)));
      setSelectedQuestions(new Set());
      setTotalQuestions(prev => prev - ids.length);
      setShowDeleteConfirm(false);
      setQuestionsToDelete([]);
    } catch (err) {
      console.error('Error deleting questions:', err);
      alert('Failed to delete questions');
    } finally {
      setDeleting(false);
    }
  };

  // Pagination
  const handlePageChange = (page) => {
    setCurrentPage(page);
    loadQuestions(page, searchTerm, difficultyFilter);
  };

  const getDifficultyColor = (difficulty) => {
    switch (difficulty) {
      case 'Easy': return 'bg-green-100 text-green-800 border-green-200';
      case 'Medium': return 'bg-yellow-100 text-yellow-800 border-yellow-200';
      case 'Hard': return 'bg-red-100 text-red-800 border-red-200';
      default: return 'bg-gray-100 text-gray-800 border-gray-200';
    }
  };

  const formatDate = (dateString) => {
    return new Date(dateString).toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
  };

  if (loading && questions.length === 0) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-lg text-gray-600">Loading AI questions...</div>
      </div>
    );
  }

  return (
    <div className="max-w-7xl mx-auto p-6">
      <div className="mb-6">
        <h1 className="text-3xl font-bold text-gray-900 mb-2">AI Questions Manager</h1>
        <p className="text-gray-600">
          Manage questions generated by the AI script. Total: {totalQuestions} questions
        </p>
      </div>

      {/* Filters and Search */}
      <div className="bg-white rounded-lg shadow-sm border p-6 mb-6">
        <form onSubmit={handleSearch} className="flex flex-col sm:flex-row gap-4">
          <div className="flex-1">
            <input
              type="text"
              placeholder="Search by title, description, or tags..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-indigo-500"
            />
          </div>
          <div>
            <select
              value={difficultyFilter}
              onChange={handleDifficultyChange}
              className="px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-indigo-500"
            >
              <option value="All">All Difficulties</option>
              <option value="Easy">Easy</option>
              <option value="Medium">Medium</option>
              <option value="Hard">Hard</option>
            </select>
          </div>
          <button
            type="submit"
            className="px-4 py-2 bg-indigo-600 text-white rounded-md hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-indigo-500"
          >
            Search
          </button>
        </form>
      </div>

      {/* Bulk Actions */}
      {questions.length > 0 && (
        <div className="bg-white rounded-lg shadow-sm border p-4 mb-6">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-4">
              <label className="flex items-center">
                <input
                  type="checkbox"
                  checked={selectedQuestions.size === questions.length && questions.length > 0}
                  onChange={handleSelectAll}
                  className="rounded border-gray-300 text-indigo-600 focus:ring-indigo-500"
                />
                <span className="ml-2 text-sm text-gray-700">
                  Select All ({selectedQuestions.size} selected)
                </span>
              </label>
            </div>
            {selectedQuestions.size > 0 && (
              <button
                onClick={handleDeleteMultiple}
                disabled={deleting}
                className="px-4 py-2 bg-red-600 text-white rounded-md hover:bg-red-700 focus:outline-none focus:ring-2 focus:ring-red-500 disabled:opacity-50"
              >
                {deleting ? 'Deleting...' : `Delete Selected (${selectedQuestions.size})`}
              </button>
            )}
          </div>
        </div>
      )}

      {/* Questions List */}
      <div className="bg-white rounded-lg shadow-sm border">
        {error && (
          <div className="p-4 text-red-600 bg-red-50 border-b">
            {error}
          </div>
        )}

        {questions.length === 0 ? (
          <div className="p-8 text-center text-gray-500">
            {loading ? 'Loading...' : 'No AI questions found'}
          </div>
        ) : (
          <div className="divide-y divide-gray-200">
            {questions.map((question) => (
              <div key={question._id} className="p-6 hover:bg-gray-50">
                <div className="flex items-start gap-4">
                  <input
                    type="checkbox"
                    checked={selectedQuestions.has(question._id)}
                    onChange={() => handleQuestionSelect(question._id)}
                    className="mt-1 rounded border-gray-300 text-indigo-600 focus:ring-indigo-500"
                  />
                  
                  <div className="flex-1 min-w-0">
                    <div className="flex items-start justify-between">
                      <div className="flex-1">
                        <h3 className="text-lg font-semibold text-gray-900 mb-2">
                          {question.title}
                        </h3>
                        
                        <p className="text-gray-600 mb-3 line-clamp-2">
                          {question.description}
                        </p>
                        
                        <div className="flex flex-wrap items-center gap-3 mb-3">
                          <span className={`px-2 py-1 text-xs font-medium rounded-full border ${getDifficultyColor(question.difficulty)}`}>
                            {question.difficulty}
                          </span>
                          
                          {question.totalScore > 0 && (
                            <span className="px-2 py-1 text-xs font-medium rounded-full border bg-blue-100 text-blue-800 border-blue-200">
                              {question.totalScore} pts
                            </span>
                          )}
                          
                          <span className="text-xs text-gray-500">
                            {question.testCases?.length || 0} test cases
                          </span>
                        </div>
                        
                        {question.tags && question.tags.length > 0 && (
                          <div className="flex flex-wrap gap-1 mb-3">
                            {question.tags.slice(0, 5).map((tag, index) => (
                              <span
                                key={index}
                                className="px-2 py-1 text-xs bg-gray-100 text-gray-700 rounded border"
                              >
                                {tag}
                              </span>
                            ))}
                            {question.tags.length > 5 && (
                              <span className="px-2 py-1 text-xs text-gray-500">
                                +{question.tags.length - 5} more
                              </span>
                            )}
                          </div>
                        )}
                        
                        <div className="text-xs text-gray-500 mb-3">
                          Created: {formatDate(question.createdAt)}
                        </div>
                        
                        {/* Sample Input/Output */}
                        {(question.sampleInput || question.sampleOutput) && (
                          <div className="grid grid-cols-1 md:grid-cols-2 gap-3 mb-3">
                            {question.sampleInput && (
                              <div className="bg-gray-50 border rounded p-3">
                                <div className="font-semibold mb-1 text-xs text-gray-700">Sample Input</div>
                                <pre className="text-xs text-gray-600 whitespace-pre-wrap break-words">
                                  {question.sampleInput}
                                </pre>
                              </div>
                            )}
                            {question.sampleOutput && (
                              <div className="bg-gray-50 border rounded p-3">
                                <div className="font-semibold mb-1 text-xs text-gray-700">Sample Output</div>
                                <pre className="text-xs text-gray-600 whitespace-pre-wrap break-words">
                                  {question.sampleOutput}
                                </pre>
                              </div>
                            )}
                          </div>
                        )}
                      </div>
                      
                      <button
                        onClick={() => handleDeleteSingle(question._id)}
                        disabled={deleting}
                        className="ml-4 px-3 py-1 text-sm text-red-600 hover:text-red-800 hover:bg-red-50 rounded border border-red-200 disabled:opacity-50"
                      >
                        Delete
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="mt-6 flex items-center justify-between">
          <div className="text-sm text-gray-700">
            Showing {((currentPage - 1) * questionsPerPage) + 1} to {Math.min(currentPage * questionsPerPage, totalQuestions)} of {totalQuestions} questions
          </div>
          
          <div className="flex items-center gap-2">
            <button
              onClick={() => handlePageChange(currentPage - 1)}
              disabled={currentPage === 1}
              className="px-3 py-1 text-sm border border-gray-300 rounded hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              Previous
            </button>
            
            {Array.from({ length: Math.min(5, totalPages) }, (_, i) => {
              const page = i + 1;
              return (
                <button
                  key={page}
                  onClick={() => handlePageChange(page)}
                  className={`px-3 py-1 text-sm border rounded ${
                    currentPage === page
                      ? 'bg-indigo-600 text-white border-indigo-600'
                      : 'border-gray-300 hover:bg-gray-50'
                  }`}
                >
                  {page}
                </button>
              );
            })}
            
            <button
              onClick={() => handlePageChange(currentPage + 1)}
              disabled={currentPage === totalPages}
              className="px-3 py-1 text-sm border border-gray-300 rounded hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              Next
            </button>
          </div>
        </div>
      )}

      {/* Delete Confirmation Modal */}
      {showDeleteConfirm && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg p-6 max-w-md w-full mx-4">
            <h3 className="text-lg font-semibold text-gray-900 mb-4">
              Confirm Deletion
            </h3>
            <p className="text-gray-600 mb-4">
              Are you sure you want to delete {questionsToDelete.length} question(s)? This action cannot be undone.
            </p>
            <div className="max-h-40 overflow-y-auto mb-4">
              {questionsToDelete.map((q) => (
                <div key={q._id} className="text-sm text-gray-700 py-1">
                  • {q.title}
                </div>
              ))}
            </div>
            <div className="flex gap-3 justify-end">
              <button
                onClick={() => setShowDeleteConfirm(false)}
                className="px-4 py-2 text-sm border border-gray-300 rounded hover:bg-gray-50"
              >
                Cancel
              </button>
              <button
                onClick={confirmDeleteMultiple}
                disabled={deleting}
                className="px-4 py-2 text-sm bg-red-600 text-white rounded hover:bg-red-700 disabled:opacity-50"
              >
                {deleting ? 'Deleting...' : 'Delete'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default AIQuestionsManager;
