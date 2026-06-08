def calculate_26qb(data: dict) -> dict:
    value = float(data.get("property_value") or 0)
    seller_status = data.get("seller_status", "resident")

    if value <= 5_000_000:
        return {
            "tds_applicable": False,
            "property_value": value,
            "tds_rate": 0,
            "tds_amount": 0,
            "net_payable_to_seller": value,
            "form": "Not Required",
            "section": "194-IA",
            "notes": [
                "TDS u/s 194-IA is NOT applicable — property value does not exceed ₹50 Lakh.",
                "No Form 26QB needs to be filed for this transaction.",
            ],
        }

    cess_rate = 0.04
    notes = []

    if seller_status == "nri":
        tds_rate = 0.20
        surcharge_rate = 0.10 if value > 10_000_000 else (0.05 if value > 5_000_000 else 0.0)
        notes += [
            "TDS @ 20% u/s 195 for NRI seller (Long Term Capital Gain default rate).",
            "Applicable surcharge + 4% health & education cess applied above.",
            "NRI seller may apply for Lower TDS Certificate (Form 13) from Assessing Officer.",
            "Obtain PAN of NRI seller; if unavailable TDS deducted @ 20% or treaty rate, whichever is higher.",
        ]
    else:
        tds_rate = 0.01
        surcharge_rate = 0.0
        notes += [
            "TDS @ 1% u/s 194-IA — sale of immovable property exceeding ₹50 Lakh.",
            "TDS deducted on agreement value or stamp duty value, whichever is higher (as per circle rates).",
            "Seller PAN is mandatory; absence attracts TDS @ 20%.",
        ]

    base_tds = round(value * tds_rate)
    surcharge = round(base_tds * surcharge_rate)
    cess = round((base_tds + surcharge) * cess_rate)
    total_tds = base_tds + surcharge + cess

    notes += [
        "File Form 26QB online at TIN-NSDL portal (tin.tin.nsdl.com) within 30 days from end of month of payment/registration.",
        "Issue TDS certificate (Form 16B) to seller within 15 days of filing 26QB.",
        "Seller claims TDS credit in ITR via Form 26AS (Part A-1 or A-2).",
    ]

    return {
        "tds_applicable": True,
        "property_value": value,
        "tds_rate": tds_rate * 100,
        "surcharge_rate": surcharge_rate * 100,
        "cess_rate": cess_rate * 100,
        "base_tds": base_tds,
        "surcharge": surcharge,
        "cess": cess,
        "tds_amount": total_tds,
        "net_payable_to_seller": value - total_tds,
        "form": "26QB",
        "section": "195" if seller_status == "nri" else "194-IA",
        "notes": notes,
    }
