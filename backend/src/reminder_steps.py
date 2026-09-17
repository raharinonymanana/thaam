"""Derive a case's reminder cadence from the RBI clocks the plan produced.

Pure Python, no AWS calls.

The step set is DERIVED FROM THE CLOCKS PRESENT, not a fixed list: an
unauthorised case has bank deadlines to chase, an authorised one does not.
Emitting a liability-cap reminder for an authorised transfer would be legally
wrong, so that step simply does not exist on that path. Raw day offsets are a
fallback only where no clock exists.

Why the lead times are not uniform - three kinds of anchor:

  CLIFF (bankReport, limitedLiability, shadowCredit): something is lost if the
    victim does not act BEFORE the date, so the reminder fires at 10:00 IST on
    the working day immediately before it. Not deadline-minus-24h: working days
    N and N-1 can be separated by a weekend, so -24h lands on a Sunday whenever
    the deadline falls early in the week, and an alert to call the bank that
    arrives when no bank is open is a wasted alert.

  GATE (ombudsman.eligibleFrom): a right OPENS on that date. Arriving early
    sends the victim to be turned away, so the reminder fires on the date
    itself, never before.

  END-OF-WINDOW (resolution.by): the window closes, so the reminder fires a few
    days before - and never later than the case's own TTL, see CLOSEOUT below.

goldenHour is never an anchor: it has almost always expired before anyone enrols.
"""
from __future__ import annotations

import json
from datetime import date, datetime, time, timedelta, timezone

from working_days import IST, previous_working_day

FIRE_HOUR = 10  # 10:00 Asia/Kolkata: within Indian bank and helpline hours.

# A step whose fire time is this close (or already past) is moved to
# now + URGENT_DELAY and marked urgent instead of being dropped.
MIN_LEAD = timedelta(minutes=15)
URGENT_DELAY = timedelta(minutes=15)

CLOSEOUT_LEAD = timedelta(days=5)
# The DynamoDB TTL deletes the case item around the end of the 90-day window.
# A reminder whose case has already been deleted is a bug, so the closeout fire
# time is clamped against the item's real expiresAt attribute - never a
# hardcoded day number, because enrolment and the transaction are different days.
TTL_SAFETY = timedelta(hours=48)

# Fallback offsets in calendar days, used only where no clock exists.
OFFSET_DAYS = {"bank_ack": 1, "portal_status": 3, "ombudsman": 30, "closeout": 85}


def _at_fire_hour(d: date) -> datetime:
    return datetime.combine(d, time(FIRE_HOUR, 0), tzinfo=IST)


def _cliff_fire(deadline: datetime) -> datetime:
    """10:00 IST on the last working day before the deadline's own day."""
    return _at_fire_hour(previous_working_day(deadline.date()))


def _gate_fire(opens: datetime) -> datetime:
    """10:00 IST on the day the right opens, but never before it opens."""
    return max(_at_fire_hour(opens.date()), opens)


def _clock(clocks: dict, name: str, key: str) -> datetime | None:
    value = (clocks or {}).get(name, {}).get(key)
    return datetime.fromisoformat(value).astimezone(IST) if value else None


def _specs(clocks: dict, now: datetime) -> list[tuple]:
    """(step, kind, fire anchor, deadline) for the steps this case gets."""
    bank_report = _clock(clocks, "bankReport", "deadline")
    ombudsman = _clock(clocks, "ombudsman", "eligibleFrom")
    resolution = _clock(clocks, "resolution", "by")

    if bank_report:  # unauthorised: real bank deadlines to chase
        specs = [
            ("bank_ack", "cliff", bank_report),
            ("liability_window", "cliff", _clock(clocks, "limitedLiability", "until")),
            ("shadow_credit", "cliff", _clock(clocks, "shadowCredit", "by")),
        ]
    else:  # authorised: no liability cap exists, so no step implies one
        specs = [
            ("bank_ack", "offset", None),
            ("portal_status", "offset", None),
        ]
    specs.append(("ombudsman", "gate", ombudsman))
    specs.append(("closeout", "window", resolution))

    out = []
    for step, kind, anchor in specs:
        if anchor is None:
            kind, anchor = "offset", _at_fire_hour(
                (now + timedelta(days=OFFSET_DAYS[step])).astimezone(IST).date())
        out.append((step, kind, anchor))
    return out


def build_steps(clocks: dict, now: datetime, expires_at: int | None = None,
                demo: bool = False, demo_step_seconds: int = 60) -> list[dict]:
    """The cadence for one case: scheduled and skipped steps, in order.

    now and every clock must be timezone-aware. expires_at is the case item's
    TTL attribute (epoch seconds), used to clamp the closeout step.
    """
    now = now.astimezone(IST)
    ttl_limit = (datetime.fromtimestamp(expires_at, IST) - TTL_SAFETY) if expires_at else None

    steps = []
    for step, kind, anchor in _specs(clocks, now):
        deadline = None if kind == "gate" else anchor
        if kind == "cliff":
            fire = _cliff_fire(anchor)
        elif kind == "gate":
            fire = _gate_fire(anchor)
        elif kind == "window":
            # 10:00 IST like the cliff and gate steps: resolution.by carries the
            # time of day the plan was built, which would fire at e.g. 02:10 IST.
            fire = _at_fire_hour((anchor - CLOSEOUT_LEAD).date())
            if ttl_limit:
                fire = min(fire, ttl_limit)
        else:
            fire = anchor

        entry = {"step": step, "realDueDate": anchor.date().isoformat(), "urgent": False}
        if deadline is not None and deadline <= now:
            # Emailing "report by <a past date> to keep zero liability" tells a
            # victim to do something impossible. The cadence degrades correctly
            # without it: if bankReport is gone, liability_window is still ahead
            # and still actionable.
            entry.update(status="skipped", reason="deadline_passed", fireAt=None)
        elif fire > now + MIN_LEAD:
            entry.update(status="scheduled", fireAt=fire.isoformat(timespec="seconds"))
        else:
            fire = now + URGENT_DELAY
            entry.update(status="scheduled", urgent=True,
                         fireAt=fire.isoformat(timespec="seconds"))
        if entry["status"] == "scheduled" and kind == "window" and ttl_limit and fire > ttl_limit:
            # Cannot fire before the case record is deleted.
            entry.update(status="skipped", reason="case_expiring", fireAt=None, urgent=False)
        steps.append(entry)

    if demo:
        # Demo mode compresses only the firing times; realDueDate stays real.
        for i, entry in enumerate(s for s in steps if s["status"] == "scheduled"):
            entry["fireAt"] = (now + timedelta(seconds=demo_step_seconds * (i + 1))
                               ).isoformat(timespec="seconds")
    return steps


def scheduled(steps: list[dict]) -> list[dict]:
    return [s for s in steps if s["status"] == "scheduled"]


def schedule_name(case_ref: str, step: str) -> str:
    """Scheduler name: the caseRef fingerprint, never the case ID itself."""
    return f"thaam-{case_ref}-{step}"


def at_expression(fire_at: str) -> str:
    """'at(YYYY-MM-DDTHH:MM:SS)' in UTC, the timezone the schedule declares."""
    moment = datetime.fromisoformat(fire_at).astimezone(timezone.utc)
    return f"at({moment.strftime('%Y-%m-%dT%H:%M:%S')})"


def schedule_input(case_id: str, step: str) -> str:
    return json.dumps({"caseId": case_id, "step": step})
