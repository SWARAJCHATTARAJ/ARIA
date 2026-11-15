import subprocess
import re
import sys

patterns = [
    (re.compile(r'gsk_[a-zA-Z0-9]{20,}'), 'Groq API Key'),
    (re.compile(r'sk-[a-zA-Z0-9]{20,}'), 'OpenAI API Key'),
    (re.compile(r'ghp_[a-zA-Z0-9]{20,}'), 'GitHub Personal Access Token'),
    (re.compile(r'-----BEGIN [A-Z ]*PRIVATE KEY'), 'Private Key'),
    (re.compile(r'eyJhbGciOi[a-zA-Z0-9_\-\.]{50,}'), 'JWT Token / Secret Key'),
    (re.compile(r'(?i)(api[_-]?key|secret|password)\s*[:=]\s*["\']([a-zA-Z0-9_\-\.]{20,})["\']'), 'Generic Secret'),
]

ignore_phrases = [
    'your_groq_api_key', 'your_supabase', 'example', 'placeholder', 'dummy', 'mock', 'none',
    '.env.example', 'gsk_your', 'eyjhbgcioi...example'
]

print("Starting Git history secret scan across all commits and branches...")
cmd = ['git', 'log', '-p', '--all']
proc = subprocess.Popen(cmd, stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True, errors='ignore')

findings = []
commit = "HEAD"

for line in proc.stdout:
    if line.startswith('commit '):
        commit = line.split()[1][:8]
        continue
    if line.startswith('+') and not line.startswith('+++'):
        line_clean = line[1:].strip()
        lower_line = line_clean.lower()
        if any(ig in lower_line for ig in ignore_phrases):
            continue
        for regex, desc in patterns:
            match = regex.search(line_clean)
            if match:
                # filter out test UUIDs or hashes or public test fixtures
                matched_str = match.group(0)
                if 'export_fixtures' in line_clean or 'test_token' in line_clean:
                    continue
                findings.append((commit, desc, matched_str[:25] + "..."))

proc.wait()

print("-" * 60)
if findings:
    print(f"FAILED: Found {len(findings)} potential secret(s) in git history:")
    for c, desc, snippet in findings:
        print(f" - Commit {c}: {desc} ({snippet})")
    sys.exit(1)
else:
    print("PASS: Zero secrets, API keys, or credentials found in git history.")
    print("-" * 60)
