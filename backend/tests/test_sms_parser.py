import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "src"))

from sms_parser import clean, mask_account, parse_lines  # noqa: E402

# Exact LINE output Textract returned for the synthetic SMS on 17 Sept.
TEXTRACT_SAMPLE = [
    "VM-SMPLBK",
    "Text Message - Today 10:42 AM",
    "Rs.49,999.00 debited from",
    "A/c XX1234 on 17-09-26",
    "10:41:07 to VPA",
    "refund.help99@okaxis.",
    "UPI Ref No 426173859012.",
    "Not you? Call 1800-000-0000",
    "- Sample Bank (TEST SMS)",
    "Synthetic test image - not a real bank message",
]


def test_real_textract_sample():
    f = parse_lines(TEXTRACT_SAMPLE)
    assert f["amount"] == "49999.00"
    assert f["utr"] == "426173859012"
    assert f["txn_date"] == "2026-09-17"
    assert f["txn_time"] == "10:41:07"  # SMS body time, not the 10:42 header
    assert f["account_masked"] == "XX1234"
    assert f["payee_vpa"] == "refund.help99@okaxis"  # trailing OCR dot removed
    assert f["payee_phone"] is None  # 1800 helpline is not a mobile number
    assert f["bank"] == "Sample Bank"
    assert f["sender_id"] == "VM-SMPLBK"
    assert f["direction"] == "debit"
    assert f["missing"] == []


def test_inr_utr_and_month_name_date():
    f = parse_lines([
        "INR 5,000 debited from your HDFC Bank a/c **7788 on 03-Sep-2026",
        "UTR 312345678901 to 9876543210",
    ])
    assert f["amount"] == "5000.00"
    assert f["utr"] == "312345678901"
    assert f["txn_date"] == "2026-09-03"
    assert f["account_masked"] == "XX7788"
    assert f["payee_phone"] == "9876543210"
    assert f["bank"] == "HDFC Bank"


def test_full_account_number_is_masked():
    f = parse_lines(["Rs 250 sent from A/c 123456789012 Ref no 998877665544"])
    assert f["account_masked"] == "XX9012"
    assert "123456789012" not in str(f["account_masked"])


def test_email_is_not_a_upi_id():
    f = parse_lines(["Rs 100 debited, contact help@bank.co.in, UTR 111122223333"])
    assert f["payee_vpa"] is None


def test_missing_fields_are_reported():
    f = parse_lines(["Your account was debited"])
    assert f["amount"] is None
    assert set(f["missing"]) == {"amount", "utr", "txn_date"}


def test_garbage_input_never_raises():
    assert parse_lines([])["missing"] == ["amount", "utr", "txn_date"]
    assert parse_lines(["", "   ", "@@@", "99/99/99"])["txn_date"] is None


def test_helpers():
    assert clean(" refund@ybl. ") == "refund@ybl"
    assert mask_account("12") == "XX12"
