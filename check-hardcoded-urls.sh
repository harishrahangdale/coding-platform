#!/bin/bash

# Script to check for problematic hardcoded URLs in the codebase
echo "🔍 Checking for problematic hardcoded URLs in the codebase..."

# Check for production URLs in source code (these should be in .env files only)
echo "Checking for production URLs in source code..."

# Check for https://coding-platform in source code (should only be in .env files)
if grep -r "https://coding-platform" --exclude-dir=node_modules --exclude-dir=.git --exclude="*.md" --exclude="*.env*" --exclude="*.example" --exclude="check-hardcoded-urls.sh" .; then
    echo "❌ Found production URLs in source code (should be in .env files only)"
else
    echo "✅ No production URLs found in source code"
fi

# Check for friendly-youtiao in source code (should only be in .env files)
if grep -r "friendly-youtiao" --exclude-dir=node_modules --exclude-dir=.git --exclude="*.md" --exclude="*.env*" --exclude="*.example" --exclude="check-hardcoded-urls.sh" .; then
    echo "❌ Found production URLs in source code (should be in .env files only)"
else
    echo "✅ No production URLs found in source code"
fi

# Check for hardcoded production URLs in backend CORS (should use env vars)
if grep -r "https://" backend/index.js | grep -v "process.env"; then
    echo "❌ Found hardcoded production URLs in backend CORS"
else
    echo "✅ Backend CORS uses environment variables"
fi

echo ""
echo "📝 Note: localhost URLs in fallback values are acceptable for development defaults"
echo "🎉 Hardcoded URL check complete!"
echo "All production URLs should be configured via environment variables."
