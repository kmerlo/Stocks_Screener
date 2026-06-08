#!/bin/bash
set -e
# Ensure we are in the correct branch
git checkout temp_branch_init || git checkout -b temp_branch_init
git add .
git commit -m "Initial commit: Stocks Screener project"
# Clean up main branch
git branch -D main || true
git branch -m main
# Create GitHub repo if it doesn't exist (gh repo create handles it)
# We use --source=. to use current dir as source
gh repo create Stocks_Screener --public --source=. --remote=origin --push || {
    # If it failed because it exists or other reason, try just pushing
    git remote add origin https://github.com/kmerlo/Stocks_Screener.git || true
    git push -u origin main
}
