from datetime import datetime
import time

_ONES = [
    "", "One", "Two", "Three", "Four", "Five", "Six", "Seven", "Eight", "Nine",
    "Ten", "Eleven", "Twelve", "Thirteen", "Fourteen", "Fifteen", "Sixteen",
    "Seventeen", "Eighteen", "Nineteen",
]
_TENS = ["", "", "Twenty", "Thirty", "Forty", "Fifty", "Sixty", "Seventy", "Eighty", "Ninety"]


def _to_words(n: int) -> str:
    n = int(float(n) if n else 0)
    if n == 0:
        return "Zero"
    if n >= 10_000_000:
        return f"{_to_words(n // 10_000_000)} Crore {_to_words(n % 10_000_000)}".strip()
    if n >= 100_000:
        return f"{_to_words(n // 100_000)} Lakh {_to_words(n % 100_000)}".strip()
    if n >= 1_000:
        return f"{_to_words(n // 1_000)} Thousand {_to_words(n % 1_000)}".strip()
    if n >= 100:
        return f"{_to_words(n // 100)} Hundred {_to_words(n % 100)}".strip()
    if n >= 20:
        return f"{_TENS[n // 10]} {_ONES[n % 10]}".strip()
    return _ONES[n]


def _fmt(n) -> str:
    n = int(float(n or 0))
    s = str(n)
    if len(s) <= 3:
        return s
    last3 = s[-3:]
    rest = s[:-3]
    parts = []
    while len(rest) > 2:
        parts.append(rest[-2:])
        rest = rest[:-2]
    if rest:
        parts.append(rest)
    parts.reverse()
    return ",".join(parts) + "," + last3


def _unique_id() -> str:
    return str(int(time.time() * 1000))[-6:]


def _today() -> str:
    return datetime.now().strftime("%d/%m/%Y")


def generate_template(template_type: str, details: dict) -> dict:
    if template_type == "rent_receipt":
        return _rent_receipt(details)
    if template_type == "donation_receipt":
        return _donation_receipt(details)
    if template_type == "medical_insurance":
        return _medical_summary(details)
    raise ValueError(f"Unknown template type: {template_type}")


def _rent_receipt(d: dict) -> dict:
    amt = int(d.get("amount") or 0)
    return {
        "title": "Rent Receipt",
        "filename": f"Rent_Receipt_{(d.get('period') or 'Period').replace(' ', '_')}.txt",
        "content": (
            f"RENT RECEIPT\n"
            f"{'═' * 56}\n"
            f"Receipt No. : RR-{_unique_id()}\n"
            f"Date        : {d.get('date') or _today()}\n\n"
            f"Received with thanks from:\n"
            f"  Tenant Name : {d.get('tenant_name') or 'N/A'}\n\n"
            f"Sum of  : ₹{_fmt(amt)}  (Rupees {_to_words(amt)} Only)\n\n"
            f"Being rent for the period : {d.get('period') or 'N/A'}\n\n"
            f"Property Address:\n"
            f"  {d.get('property_address') or 'N/A'}\n\n"
            f"{'─' * 56}\n"
            f"Received by (Landlord):\n"
            f"  Name : {d.get('landlord_name') or 'N/A'}\n"
            f"  PAN  : {d.get('landlord_pan') or 'N/A'}\n\n"
            f"Signature: ____________________\n"
            f"({d.get('landlord_name') or 'Landlord'})\n\n"
            f"{'─' * 56}\n"
            f"Note: This receipt is issued for income tax purposes.\n"
            f"      HRA exemption claim u/s 10(13A) of the Income Tax Act, 1961.\n"
            f"      Landlord PAN mandatory when annual rent exceeds ₹1,00,000.\n"
            f"{'═' * 56}"
        ),
    }


def _donation_receipt(d: dict) -> dict:
    amt = int(d.get("amount") or 0)
    ref_line = f"Ref No.: {d['transaction_ref']}" if d.get("transaction_ref") else ""
    return {
        "title": "80G Donation Receipt",
        "filename": f"Donation_Receipt_{d.get('donor_pan') or 'Donor'}.txt",
        "content": (
            f"DONATION RECEIPT\n"
            f"(Eligible for deduction u/s 80G of Income Tax Act, 1961)\n"
            f"{'═' * 56}\n"
            f"Receipt No. : {d.get('receipt_no') or 'DON-' + _unique_id()}\n"
            f"Date        : {d.get('date') or _today()}\n\n"
            f"Received from (Donor):\n"
            f"  Name    : {d.get('donor_name') or 'N/A'}\n"
            f"  PAN     : {d.get('donor_pan') or 'N/A'}\n"
            f"  Address : {d.get('donor_address') or 'N/A'}\n\n"
            f"Amount : ₹{_fmt(amt)}  (Rupees {_to_words(amt)} Only)\n"
            f"Mode   : {d.get('payment_mode') or 'Online Transfer / UPI'}\n"
            f"{ref_line}\n\n"
            f"Donated to:\n"
            f"  Trust / NGO Name   : {d.get('trust_name') or 'N/A'}\n"
            f"  PAN of Trust       : {d.get('trust_pan') or 'N/A'}\n"
            f"  80G Reg. No.       : {d.get('registration_no') or 'N/A'}\n"
            f"  80G Valid Till     : {d.get('validity') or 'Active (verify on IT portal)'}\n"
            f"  Deduction Eligible : {d.get('eligibility') or '50% of donated amount (without qualifying limit)'}\n\n"
            f"{'─' * 56}\n"
            f"For {d.get('trust_name') or 'Trust / NGO'}\n\n"
            f"Authorized Signatory: ____________________\n\n"
            f"{'─' * 56}\n"
            f"Note: Verify 80G registration at incometax.gov.in before claiming deduction.\n"
            f"      Donations in cash above ₹2,000 are not eligible for deduction u/s 80G.\n"
            f"{'═' * 56}"
        ),
    }


def _medical_summary(d: dict) -> dict:
    self_premium = int(d.get("self_premium") or 0)
    parents_premium = int(d.get("parents_premium") or 0)
    total = self_premium + parents_premium
    self_senior = str(d.get("self_senior", "")).lower() == "true"
    parents_senior = str(d.get("parents_senior", "")).lower() == "true"
    self_cap = 50_000 if self_senior else 25_000
    par_cap = 50_000 if parents_senior else 25_000
    return {
        "title": "Health Insurance Premium Summary (80D)",
        "filename": f"Medical_Insurance_80D_{d.get('pan') or 'Summary'}.txt",
        "content": (
            f"HEALTH INSURANCE PREMIUM SUMMARY\n"
            f"For Income Tax Deduction u/s 80D — AY 2026-27\n"
            f"{'═' * 56}\n"
            f"Taxpayer : {d.get('taxpayer_name') or 'N/A'}\n"
            f"PAN      : {d.get('pan') or 'N/A'}\n"
            f"FY       : 2025-26  (AY 2026-27)\n\n"
            f"{'─' * 19} Self & Family Policy {'─' * 16}\n"
            f"  Insurer        : {d.get('self_insurer') or 'N/A'}\n"
            f"  Policy No.     : {d.get('self_policy_no') or 'N/A'}\n"
            f"  Insured Members: {d.get('self_members') or 'Self, Spouse, Children'}\n"
            f"  Premium Paid   : ₹{_fmt(self_premium)}\n"
            f"  Statutory Cap  : ₹{'50,000 (Senior Citizen)' if self_senior else '25,000'}\n\n"
            f"{'─' * 19} Parents Policy {'─' * 21}\n"
            f"  Insurer        : {d.get('parents_insurer') or 'N/A'}\n"
            f"  Policy No.     : {d.get('parents_policy_no') or 'N/A'}\n"
            f"  Parents Status : {'Senior Citizens (≥ 60 yrs)' if parents_senior else 'Below 60 years'}\n"
            f"  Premium Paid   : ₹{_fmt(parents_premium)}\n"
            f"  Statutory Cap  : ₹{'50,000' if parents_senior else '25,000'}\n\n"
            f"{'─' * 56}\n"
            f"Total Premium Paid     : ₹{_fmt(total)}\n"
            f"Maximum Eligible u/s 80D: ₹{_fmt(self_cap + par_cap)}\n\n"
            f"{'─' * 56}\n"
            f"Certified: The above premiums were paid during FY 2025-26 for\n"
            f"health insurance policies issued by IRDA-registered insurers.\n"
            f"Premium paid via non-cash mode (online / cheque) as required by law.\n"
            f"{'═' * 56}"
        ),
    }
