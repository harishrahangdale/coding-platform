import React from 'react';

function CodeAnalysis({ analysis, loading = false }) {
  if (loading) {
    return (
      <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
        <div className="flex items-center gap-2">
          <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-blue-600"></div>
          <span className="text-blue-700 font-medium">Analyzing code with AI...</span>
        </div>
      </div>
    );
  }

  if (!analysis) {
    return null;
  }

  const { logicalCorrectness, codeQuality, overallAssessment } = analysis;

  const getScoreColor = (score, maxScore) => {
    const percentage = (score / maxScore) * 100;
    if (percentage >= 80) return 'text-green-600 bg-green-100';
    if (percentage >= 60) return 'text-yellow-600 bg-yellow-100';
    return 'text-red-600 bg-red-100';
  };

  const getGradeColor = (grade) => {
    if (['A+', 'A', 'A-'].includes(grade)) return 'text-green-600 bg-green-100';
    if (['B+', 'B', 'B-'].includes(grade)) return 'text-yellow-600 bg-yellow-100';
    if (['C+', 'C', 'C-'].includes(grade)) return 'text-orange-600 bg-orange-100';
    return 'text-red-600 bg-red-100';
  };

  return (
    <div className="bg-white border rounded-lg p-6 space-y-6">
      <div className="flex items-center gap-2 mb-4">
        <div className="w-2 h-2 bg-blue-500 rounded-full"></div>
        <h3 className="text-lg font-semibold text-gray-900">AI Code Analysis</h3>
      </div>

      {/* Overall Assessment */}
      <div className="bg-gray-50 rounded-lg p-4">
        <div className="flex items-center justify-between mb-3">
          <h4 className="font-semibold text-gray-900">Overall Assessment</h4>
          <span className={`px-3 py-1 rounded-full text-sm font-medium ${getGradeColor(overallAssessment.grade)}`}>
            {overallAssessment.grade}
          </span>
        </div>
        <p className="text-gray-700 mb-3">{overallAssessment.summary}</p>
        {overallAssessment.recommendations && overallAssessment.recommendations.length > 0 && (
          <div>
            <h5 className="font-medium text-gray-900 mb-2">Recommendations:</h5>
            <ul className="list-disc list-inside space-y-1">
              {overallAssessment.recommendations.map((rec, index) => (
                <li key={index} className="text-sm text-gray-600">{rec}</li>
              ))}
            </ul>
          </div>
        )}
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* Logical Correctness */}
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <h4 className="font-semibold text-gray-900">Logical Correctness</h4>
            <span className={`px-2 py-1 rounded text-sm font-medium ${getScoreColor(logicalCorrectness.score, logicalCorrectness.maxScore)}`}>
              {logicalCorrectness.score}/{logicalCorrectness.maxScore}
            </span>
          </div>
          
          <p className="text-sm text-gray-700">{logicalCorrectness.reasoning}</p>

          {logicalCorrectness.strengths && logicalCorrectness.strengths.length > 0 && (
            <div>
              <h5 className="font-medium text-green-700 mb-2">Strengths:</h5>
              <ul className="list-disc list-inside space-y-1">
                {logicalCorrectness.strengths.map((strength, index) => (
                  <li key={index} className="text-sm text-green-600">{strength}</li>
                ))}
              </ul>
            </div>
          )}

          {logicalCorrectness.weaknesses && logicalCorrectness.weaknesses.length > 0 && (
            <div>
              <h5 className="font-medium text-red-700 mb-2">Areas for Improvement:</h5>
              <ul className="list-disc list-inside space-y-1">
                {logicalCorrectness.weaknesses.map((weakness, index) => (
                  <li key={index} className="text-sm text-red-600">{weakness}</li>
                ))}
              </ul>
            </div>
          )}

          {logicalCorrectness.suggestions && logicalCorrectness.suggestions.length > 0 && (
            <div>
              <h5 className="font-medium text-blue-700 mb-2">Suggestions:</h5>
              <ul className="list-disc list-inside space-y-1">
                {logicalCorrectness.suggestions.map((suggestion, index) => (
                  <li key={index} className="text-sm text-blue-600">{suggestion}</li>
                ))}
              </ul>
            </div>
          )}
        </div>

        {/* Code Quality */}
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <h4 className="font-semibold text-gray-900">Code Quality</h4>
            <span className={`px-2 py-1 rounded text-sm font-medium ${getScoreColor(codeQuality.score, codeQuality.maxScore)}`}>
              {codeQuality.score}/{codeQuality.maxScore}
            </span>
          </div>
          
          <p className="text-sm text-gray-700">{codeQuality.reasoning}</p>

          <div className="space-y-2">
            <h5 className="font-medium text-gray-900">Quality Aspects:</h5>
            <div className="grid grid-cols-2 gap-2 text-sm">
              <div className="flex justify-between">
                <span className="text-gray-600">Readability:</span>
                <span className={`px-2 py-1 rounded text-xs ${getScoreColor(
                  codeQuality.aspects.readability === 'Good' ? 80 : 
                  codeQuality.aspects.readability === 'Fair' ? 60 : 40, 100
                )}`}>
                  {codeQuality.aspects.readability}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-600">Maintainability:</span>
                <span className={`px-2 py-1 rounded text-xs ${getScoreColor(
                  codeQuality.aspects.maintainability === 'Good' ? 80 : 
                  codeQuality.aspects.maintainability === 'Fair' ? 60 : 40, 100
                )}`}>
                  {codeQuality.aspects.maintainability}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-600">Efficiency:</span>
                <span className={`px-2 py-1 rounded text-xs ${getScoreColor(
                  codeQuality.aspects.efficiency === 'Good' ? 80 : 
                  codeQuality.aspects.efficiency === 'Fair' ? 60 : 40, 100
                )}`}>
                  {codeQuality.aspects.efficiency}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-600">Best Practices:</span>
                <span className={`px-2 py-1 rounded text-xs ${getScoreColor(
                  codeQuality.aspects.bestPractices === 'Good' ? 80 : 
                  codeQuality.aspects.bestPractices === 'Fair' ? 60 : 40, 100
                )}`}>
                  {codeQuality.aspects.bestPractices}
                </span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

export default CodeAnalysis;
