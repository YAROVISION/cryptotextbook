#!/usr/bin/env python3
import os
import sys
import json
import subprocess
import argparse
from pathlib import Path

# Paths
PROJECT_DIR = Path(__file__).resolve().parent.parent
WATCHLIST_FILE = PROJECT_DIR / ".agents" / "watchlist.json"
SKILL_SCRIPT = PROJECT_DIR / ".agents" / "skills" / "last30days" / "scripts" / "last30days.py"
BOOK_FILE = PROJECT_DIR / "book" / "Розділ 7. Щоденний огляд подій.md"
LOG_FILE = PROJECT_DIR / "book" / "log.md"

def load_watchlist():
    if not WATCHLIST_FILE.exists():
        print(f"Error: Watchlist file not found at {WATCHLIST_FILE}", file=sys.stderr)
        sys.exit(1)
    with open(WATCHLIST_FILE, "r", encoding="utf-8") as f:
        return json.load(f)

def run_research(topic, x_handle=None, github_user=None, subreddits=None, days=1, mock=False):
    cmd = [
        "python3.12",
        str(SKILL_SCRIPT),
        topic,
        "--days", str(days),
        "--emit", "compact"
    ]
    if x_handle:
        cmd.extend(["--x-handle", x_handle])
    if github_user:
        cmd.extend(["--github-user", github_user])
    if subreddits:
        cmd.extend(["--subreddits", ",".join(subreddits)])
    if mock:
        cmd.append("--mock")
        
    print(f"Running research for: {topic} (x: {x_handle}, gh: {github_user})...")
    
    # Run the command
    result = subprocess.run(cmd, capture_output=True, text=True, cwd=str(PROJECT_DIR))
    if result.returncode != 0:
        print(f"Warning: Research command failed for {topic} with exit code {result.returncode}", file=sys.stderr)
        print(result.stderr, file=sys.stderr)
        return None
    return result.stdout

def main():
    parser = argparse.ArgumentParser(description="Scan crypto watchlist and generate daily textbook updates.")
    parser.add_argument("--mock", action="store_true", help="Use mock fixtures for offline testing")
    args = parser.parse_args()

    watchlist = load_watchlist()
    days = watchlist.get("lookback_days", 1)
    
    reports = []
    
    # 1. Check specific accounts
    for account in watchlist.get("accounts", []):
        name = account.get("name")
        x_handle = account.get("x_handle")
        gh_user = account.get("github_user")
        
        # Topic is built to target the person's updates
        topic = f"{name} daily update"
        output = run_research(topic, x_handle=x_handle, github_user=gh_user, days=days, mock=args.mock)
        if output:
            reports.append((name, output))
            
    # 2. Check general subreddits
    subreddits = watchlist.get("subreddits", [])
    if subreddits:
        topic = "crypto community discussion"
        output = run_research(topic, subreddits=subreddits, days=days, mock=args.mock)
        if output:
            reports.append(("Reddit Communities", output))
            
    if not reports:
        print("No reports generated.", file=sys.stderr)
        sys.exit(1)
        
    print(f"\nSuccessfully gathered {len(reports)} reports.")
    
    # Save reports to a JSON file for analysis
    output_path = PROJECT_DIR / "tmp" / "watchlist_reports.json"
    output_path.parent.mkdir(parents=True, exist_ok=True)
    with open(output_path, "w", encoding="utf-8") as f:
        json.dump(reports, f, ensure_ascii=False, indent=2)
    print(f"Saved reports to {output_path}")

    # Also write a combined markdown file for easy viewing
    md_path = PROJECT_DIR / "tmp" / "watchlist_reports.md"
    with open(md_path, "w", encoding="utf-8") as f:
        f.write("# Watchlist Daily Reports\n\n")
        for name, report in reports:
            f.write(f"## {name}\n\n{report}\n\n---\n\n")
    print(f"Saved combined markdown to {md_path}")

if __name__ == "__main__":
    main()
