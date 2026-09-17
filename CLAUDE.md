# CLAUDE.md — Thaam (थाम)

Context for Claude Code working in this repo. Built during the AWS × WeMakeDevs
**First Commit** hackathon (17–20 Sept 2026, Ship It track). **Deadline: Sun 20 Sept, 20:00 IST.**

## Roles
- **Hasina** (repo owner) makes every product and architecture decision. He is new to AWS,
  strong in security. He directs and reviews; Claude writes the code.
- A separate Claude (Cowork, the "mentor") designs each step and hands tasks to Claude Code
  with a prompt. Do exactly the task in the prompt. If something outside it looks necessary,
  **stop and say so** instead of doing it.

## What Thaam is
A companion for online-fraud victims in India: screenshot of a debit SMS/UPI payment →
Textract → editable fields → one triage question → 1930 call script (text + Polly audio) →
cybercrime.gov.in copy text + evidence pack + RBI bank letter → email reminders for 90 days.
It **never files complaints**, **never uses official/bank branding**, is **not legal advice**
and **not a scam detector**.

## Stack (decided — do not change without Hasina)
- AWS **SAM** (`template.yaml`), region **us-east-1**, stack `thaam`
- Lambda **Python 3.14** (`python3.14`), boto3 from the runtime (no need to vendor it)
- S3 (`EvidenceBucket`: `uploads/` 7-day and `packs/` 90-day lifecycle, HTTPS-only, private)
- DynamoDB (`CasesTable`, key `caseId`, TTL attribute `expiresAt`, no backups)
- Textract (`DetectDocumentText` only), Polly (Kajal, `hi-IN`/`en-IN`), EventBridge Scheduler, SES (sandbox)
- API Gateway **HTTP API**; frontend React + Vite on Amplify Hosting
- **No Bedrock / no LLM calls** — the account's inference quota is 0.

## Layout
- `template.yaml` — all infrastructure
- `backend/src/` — Lambda code (one CodeUri shared by all functions; handlers in modules)
- `backend/src/sms_parser.py` — pure parser, no AWS imports
- `backend/tests/` — pytest; AWS calls are mocked, tests never hit the network
- `frontend/` — (later) React app

## Rules
- **Least privilege:** each function gets only the policies it needs, scoped to our bucket/table ARNs.
- **Privacy:** never log screenshot contents, full account numbers or emails. Mask accounts as `XX` + last 4.
- Never commit secrets. The gitleaks pre-commit hook runs on every commit (`core.hooksPath .githooks`).
- Run tests with: `.venv\Scripts\python -m pytest backend/tests -v` (Windows, PowerShell).
- Validate infra with `sam validate --lint` before proposing a deploy.
- **Do not run `sam deploy`, `git commit` or `git push`** unless the handoff prompt explicitly says so —
  Hasina runs those himself.
- Commit messages end with: `Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>`
- Windows + PowerShell: pass JSON to the AWS CLI via `file://`, write files as UTF-8 without BOM.
- When done, report: files changed, commands run and their results, anything left open.
