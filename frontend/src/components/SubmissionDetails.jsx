import React, { useState, useEffect } from 'react';
import axios from 'axios';
import CodeAnalysis from './CodeAnalysis';
import SessionReplayPlayer from './SessionReplayPlayer';

function SubmissionDetails({ submissionId, apiBaseUrl }) {
  const [submission, setSubmission] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [activeTab, setActiveTab] = useState('overview');

  useEffect(() => {
    const fetchSubmission = async () => {
      try {
        setLoading(true);
        const response = await axios.get(`${apiBaseUrl}/submissions/${submissionId}`);
        setSubmission(response.data);
      } catch (err) {
        setError(err.response?.data?.error || 'Failed to fetch submission details');
      } finally {
        setLoading(false);
      }
    };

    if (submissionId) {
      fetchSubmission();
    }
  }, [submissionId, apiBaseUrl]);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
        <span className="ml-2">Loading submission details...</span>
      </div>
    );
  }

  if (error) {
    return (
      <div className="bg-red-50 border border-red-200 rounded-lg p-4">
        <div className="text-red-800 font-medium">Error</div>
        <div className="text-red-600">{error}</div>
      </div>
    );
  }

  if (!submission) {
    return (
      <div className="text-gray-500 text-center py-8">
        No submission data available
      </div>
    );
  }

  const { question, results, summary, codeAnalysis, code, languageName, createdAt } = submission;

  const getStatusColor = (status) => {
    switch (status) {
      case 'Passed': return 'text-green-700 bg-green-100';
      case 'Failed': return 'text-red-700 bg-red-100';
      case 'Compilation Error': return 'text-orange-700 bg-orange-100';
      case 'Runtime Error': return 'text-purple-700 bg-purple-100';
      default: return 'text-gray-700 bg-gray-100';
    }
  };

  const getScoreColor = (score, maxScore) => {
    const percentage = (score / maxScore) * 100;
    if (percentage >= 80) return 'text-green-600';
    if (percentage >= 60) return 'text-yellow-600';
    return 'text-red-600';
  };

  return (
    <div className="max-w-7xl mx-auto p-6">
      {/* Header */}
      <div className="bg-white rounded-lg shadow-sm border p-6 mb-6">
        <div className="flex items-center justify-between mb-4">
          <h1 className="text-2xl font-bold text-gray-900">Submission Details</h1>
          <div className="text-sm text-gray-500">
            Submitted: {new Date(createdAt).toLocaleString()}
          </div>
        </div>
        
        {question && (
          <div className="mb-4">
            <h2 className="text-xl font-semibold text-gray-800 mb-2">{question.title}</h2>
            <p className="text-gray-600">{question.description}</p>
            <div className="flex items-center gap-4 mt-2 text-sm text-gray-500">
              <span>Language: {languageName}</span>
              <span>Difficulty: {question.difficulty}</span>
              {question.timeAllowed && <span>Time Limit: {question.timeAllowed} min</span>}
            </div>
          </div>
        )}

        {/* Summary Stats */}
        {summary && (
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
            <div className="bg-blue-50 rounded-lg p-4 text-center">
              <div className="text-2xl font-bold text-blue-600">{summary.passed}</div>
              <div className="text-sm text-blue-800">Test Cases Passed</div>
            </div>
            <div className="bg-gray-50 rounded-lg p-4 text-center">
              <div className="text-2xl font-bold text-gray-600">{summary.total}</div>
              <div className="text-sm text-gray-800">Total Test Cases</div>
            </div>
            <div className="bg-green-50 rounded-lg p-4 text-center">
              <div className={`text-2xl font-bold ${getScoreColor(summary.earnedScore, summary.maxScore)}`}>
                {summary.earnedScore}
              </div>
              <div className="text-sm text-green-800">Score Earned</div>
            </div>
            <div className="bg-purple-50 rounded-lg p-4 text-center">
              <div className="text-2xl font-bold text-purple-600">{summary.maxScore}</div>
              <div className="text-sm text-purple-800">Max Score</div>
            </div>
          </div>
        )}
      </div>

      {/* Tabs */}
      <div className="bg-white rounded-lg shadow-sm border mb-6">
        <div className="border-b">
          <nav className="flex space-x-8 px-6">
            {[
              { key: 'overview', label: 'Overview' },
              { key: 'code', label: 'Code' },
              { key: 'testcases', label: 'Test Cases' },
              { key: 'analysis', label: 'Code Analysis' },
              { key: 'replay', label: 'Session Replay' }
            ].map((tab) => (
              <button
                key={tab.key}
                onClick={() => setActiveTab(tab.key)}
                className={`py-4 px-1 border-b-2 font-medium text-sm ${
                  activeTab === tab.key
                    ? 'border-blue-500 text-blue-600'
                    : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
                }`}
              >
                {tab.label}
              </button>
            ))}
          </nav>
        </div>

        <div className="p-6">
          {/* Overview Tab */}
          {activeTab === 'overview' && (
            <div className="space-y-6">
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                {/* Test Results Summary */}
                <div className="bg-gray-50 rounded-lg p-4">
                  <h3 className="font-semibold text-gray-900 mb-3">Test Results</h3>
                  {results && results.length > 0 ? (
                    <div className="space-y-2">
                      {results.map((result, index) => (
                        <div key={index} className="flex items-center justify-between p-2 bg-white rounded border">
                          <span className="text-sm">Test Case {index + 1}</span>
                          <div className="flex items-center gap-2">
                            <span className={`px-2 py-1 rounded text-xs font-medium ${getStatusColor(result.status)}`}>
                              {result.status}
                            </span>
                            <span className="text-sm text-gray-600">
                              {result.score}/{result.maxScore}
                            </span>
                          </div>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <p className="text-gray-500">No test results available</p>
                  )}
                </div>

                {/* Code Analysis Summary */}
                <div className="bg-gray-50 rounded-lg p-4">
                  <h3 className="font-semibold text-gray-900 mb-3">Code Analysis</h3>
                  {codeAnalysis ? (
                    <div className="space-y-3">
                      <div className="flex justify-between items-center">
                        <span className="text-sm text-gray-600">Logical Correctness</span>
                        <span className="font-medium">
                          {codeAnalysis.logicalCorrectness?.score || 0}/{codeAnalysis.logicalCorrectness?.maxScore || 100}
                        </span>
                      </div>
                      <div className="flex justify-between items-center">
                        <span className="text-sm text-gray-600">Code Quality</span>
                        <span className="font-medium">
                          {codeAnalysis.codeQuality?.score || 0}/{codeAnalysis.codeQuality?.maxScore || 100}
                        </span>
                      </div>
                      <div className="flex justify-between items-center">
                        <span className="text-sm text-gray-600">Overall Grade</span>
                        <span className="font-medium text-lg">
                          {codeAnalysis.overallAssessment?.grade || 'N/A'}
                        </span>
                      </div>
                    </div>
                  ) : (
                    <p className="text-gray-500">No code analysis available</p>
                  )}
                </div>
              </div>
            </div>
          )}

          {/* Code Tab */}
          {activeTab === 'code' && (
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <h3 className="text-lg font-semibold">Submitted Code</h3>
                <div className="text-sm text-gray-500">
                  Language: {languageName}
                </div>
              </div>
              <div className="bg-gray-900 rounded-lg p-4 overflow-x-auto">
                <pre className="text-green-400 text-sm font-mono whitespace-pre-wrap">
                  {code}
                </pre>
              </div>
            </div>
          )}

          {/* Test Cases Tab */}
          {activeTab === 'testcases' && (
            <div className="space-y-4">
              <h3 className="text-lg font-semibold">Test Case Results</h3>
              {results && results.length > 0 ? (
                <div className="space-y-4">
                  {results.map((result, index) => (
                    <div key={index} className="border rounded-lg p-4">
                      <div className="flex items-center justify-between mb-3">
                        <h4 className="font-medium">Test Case {index + 1}</h4>
                        <div className="flex items-center gap-2">
                          <span className={`px-2 py-1 rounded text-xs font-medium ${getStatusColor(result.status)}`}>
                            {result.status}
                          </span>
                          <span className="text-sm text-gray-600">
                            Score: {result.score}/{result.maxScore}
                          </span>
                        </div>
                      </div>
                      
                      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-sm">
                        <div>
                          <div className="font-medium text-gray-700 mb-1">Input</div>
                          <pre className="bg-gray-100 p-2 rounded text-xs whitespace-pre-wrap">
                            {result.input || 'N/A'}
                          </pre>
                        </div>
                        <div>
                          <div className="font-medium text-gray-700 mb-1">Expected Output</div>
                          <pre className="bg-gray-100 p-2 rounded text-xs whitespace-pre-wrap">
                            {result.expected || 'N/A'}
                          </pre>
                        </div>
                        <div>
                          <div className="font-medium text-gray-700 mb-1">Actual Output</div>
                          <pre className={`p-2 rounded text-xs whitespace-pre-wrap ${
                            result.status === 'Passed' ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800'
                          }`}>
                            {result.actual || 'N/A'}
                          </pre>
                        </div>
                      </div>
                      
                      {(result.time || result.memory) && (
                        <div className="mt-3 text-xs text-gray-500">
                          {result.time && <span>Time: {result.time}s </span>}
                          {result.memory && <span>Memory: {result.memory}KB</span>}
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-gray-500">No test case results available</p>
              )}
            </div>
          )}

          {/* Code Analysis Tab */}
          {activeTab === 'analysis' && (
            <div className="space-y-4">
              <h3 className="text-lg font-semibold">AI Code Analysis</h3>
              {codeAnalysis ? (
                <CodeAnalysis analysis={codeAnalysis} />
              ) : (
                <div className="text-center py-8 text-gray-500">
                  No code analysis available for this submission
                </div>
              )}
            </div>
          )}

          {/* Session Replay Tab */}
          {activeTab === 'replay' && (
            <div className="space-y-4" style={{ height: '700px' }}>
              <h3 className="text-lg font-semibold">Session Replay</h3>
              <div className="flex-1">
                <SessionReplayPlayer 
                  sessionId={submissionId} 
                  apiBaseUrl={apiBaseUrl}
                  submissionId={submissionId}
                />
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

export default SubmissionDetails;
