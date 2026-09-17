# Thaam (थाम)

> **1930 saves your money in the first hour. Thaam holds your hand for the next 90 days.**

*Thaam* is Hindi for "hold on / take hold of" — as in *haath thaam lo*, "take my hand".

Thaam is a free companion for people in India who have just lost money to online
fraud. The victim uploads a screenshot of the debit SMS or UPI payment, and Thaam:

1. **Extracts** the details a complaint needs — amount, UTR, date/time, bank,
   the scammer's UPI ID or phone — into fields the victim can check and edit.
2. **Asks one question** — *did you share an OTP or approve the payment?* — and
   follows the right path for the answer.
3. **Prepares the call** to the **1930** cyber-fraud helpline: a script on screen
   and read aloud in Hindi or English.
4. **Packs the evidence** and copy-ready text for **cybercrime.gov.in**, plus a
   bank dispute letter for unauthorised transactions.
5. **Runs two clocks** — the golden hour, and the RBI deadlines that follow —
   with email reminders over 90 days, optionally copied to a trusted family member.

## What Thaam is not

- **Not a government service.** Not affiliated with I4C, NCRP, RBI or any bank.
- **Never files anything for you.** You call 1930 and file on cybercrime.gov.in yourself.
- **Not legal advice**, and not a scam detector.

## Status

🚧 Built during the AWS × WeMakeDevs **First Commit** hackathon (17–20 Sept 2026),
Ship It track. Day 1.

## Planned architecture

React + Vite on **AWS Amplify Hosting** → **Amazon API Gateway** → **AWS Lambda**
(Python 3.14) → **Amazon S3** · **Amazon DynamoDB** · **Amazon Textract** ·
**Amazon Polly** · **Amazon EventBridge Scheduler** · **Amazon SES**.
Infrastructure as code with **AWS SAM**.

## Privacy by design

- No login needed before help.
- Screenshots encrypted at rest and deleted automatically; case data expires after 90 days.
- Account numbers masked in anything shared.
- Least-privilege IAM for every function.
- Every commit is scanned for secrets by **gitleaks** (see `.githooks/`).

## Setup for contributors

```bash
git config core.hooksPath .githooks   # enable the gitleaks pre-commit hook
```

## AI tools used

Built with **Claude Code** (Anthropic) as mentor and coding agent. The author
made the product and architecture decisions.

## License

MIT — see [LICENSE](LICENSE).
