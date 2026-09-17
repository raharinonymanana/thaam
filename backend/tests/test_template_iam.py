"""Guards on the IAM the template grants.

Text-based on purpose: PyYAML is not a dependency of this repo and it cannot
load CloudFormation short tags (!Sub, !Ref) without a custom loader, so these
tests read template.yaml the way a reviewer does.
"""
import re
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "src"))

TEMPLATE = Path(__file__).resolve().parents[2] / "template.yaml"
TEXT = TEMPLATE.read_text(encoding="utf-8")
LINES = TEXT.splitlines()


def _indent(line: str) -> int:
    return len(line) - len(line.lstrip())


def _statement_at(index: int) -> str:
    """The IAM statement containing line `index`: from its '- Effect:' line to
    the next line at that indentation or shallower."""
    start = index
    while start > 0 and not LINES[start].lstrip().startswith("- Effect:"):
        start -= 1
    indent = _indent(LINES[start])
    end = index + 1
    while end < len(LINES):
        line = LINES[end]
        if line.strip() and _indent(line) <= indent:
            break
        end += 1
    return "\n".join(LINES[start:end])


def _statements_with(action: str) -> list[str]:
    return [_statement_at(i) for i, line in enumerate(LINES)
            if re.match(rf"\s*(- )?Action:\s*{re.escape(action)}\s*$", line)]


def test_both_email_senders_are_pinned_to_the_from_address():
    statements = _statements_with("ses:SendEmail")
    # ReminderFunction and FamilyFunction.
    assert len(statements) == 2
    for statement in statements:
        assert "identity/*" in statement
        assert "Condition:" in statement
        assert "StringEquals:" in statement
        assert re.search(r"ses:FromAddress:\s*!Ref SenderEmail", statement), statement


def test_no_identity_wildcard_without_a_from_address_condition():
    for i, line in enumerate(LINES):
        if "identity/" in line and "identity/*" in line:
            assert "ses:FromAddress" in _statement_at(i), line


def test_send_email_is_never_granted_on_a_bare_star():
    for statement in _statements_with("ses:SendEmail"):
        assert not re.search(r'Resource:\s*"\*"', statement), statement


def test_scheduler_and_passrole_stay_scoped():
    # Regression guard for the reminder system's least-privilege wiring.
    for statement in _statements_with("iam:PassRole"):
        assert "SchedulerInvokeRole" in statement
        assert re.search(r"iam:PassedToService:\s*scheduler\.amazonaws\.com", statement)
    assert "scheduler:CreateSchedule" in TEXT
    for i, line in enumerate(LINES):
        if "scheduler:CreateSchedule" in line or "scheduler:DeleteSchedule" in line:
            assert "schedule/${ReminderScheduleGroup}/*" in _statement_at(i), line
