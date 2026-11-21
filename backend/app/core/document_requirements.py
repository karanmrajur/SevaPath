DOCUMENT_MATCHES = {
    "Identity proof": ("Aadhaar Card", "Voter ID", "Driving Licence"),
    "Land record": ("RTC / Pahani / Land Records",),
    "Bank records": ("Bank Passbook",),
    "Education marksheet": ("Class 10 Marksheet", "Class 12 Marksheet"),
}


def accepted_document_categories(slug: str, category: str | None) -> tuple[str, ...]:
    if category is None:
        return ()
    if slug == "pm-kisan" and category == "Identity proof":
        return ("Aadhaar Card",)
    return (category, *DOCUMENT_MATCHES.get(category, ()))
