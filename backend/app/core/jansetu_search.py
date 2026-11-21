"""Lexical and concept retrieval over the existing service catalogue."""
from difflib import SequenceMatcher
import re
import unicodedata

INTENTS = {"find", "documents", "eligibility", "apply", "deadline", "centres", "expiry", "consistency", "general", "features"}
CATEGORIES = {
    "Farmers": ("farmer", "farmers", "agriculture", "kisan", "krishi", "raita", "raithara", "kheti", "किसान", "खेती", "ರೈತ", "ರೈತರು", "ಕೃಷಿ"),
    "Students": ("student", "students", "scholarship", "scholarships", "vidyarthi vetana", "vidyarthivetana", "chatravriti", "छात्रवृत्ति", "छात्रवृत्तियाँ", "स्कॉलरशिप", "ವಿದ್ಯಾರ್ಥಿವೇತನ", "ಶಿಷ್ಯವೇತನ"),
    "Women Empowerment": ("women welfare", "women", "mahila", "महिला", "ಮಹಿಳೆ", "ಮಹಿಳೆಯರು"),
    "Pension": ("pension", "pensions", "old age", "पेंशन", "ವೃದ್ಧಾಪ್ಯ", "ಪಿಂಚಣಿ", "pinchani"),
    "Certificates": ("certificates", "certificate", "pramana patra", "प्रमाणपत्र", "ಪ್ರಮಾಣಪತ್ರ"),
}
EDUCATION_NEEDS = (
    "college", "college fees", "school fees", "tuition", "padhai", "padhai ke liye", "fees ke liye",
    "कॉलेज", "पढ़ाई", "फीस", "ಕಾಲೇಜು", "ಶುಲ್ಕ", "ಶಿಕ್ಷಣ", "ಶಿಕ್ಷಣಕ್ಕೆ", "college fee ge",
)
ALIASES = {
    "pm-kisan": ("pm kisan", "pm kishan", "pm kisaan", "kisan samman nidhi", "किसान सम्मान निधि", "पीएम किसान", "ಪಿಎಂ ಕಿಸಾನ್", "pi em kisan"),
    "income-certificate": ("income certificate", "incom sertifikat", "income cert", "aay praman patra", "aay pramanpatra", "aadaya pramana patra", "aadaya pramanapatra", "adaya pramana patra", "आय प्रमाण पत्र", "आय प्रमाणपत्र", "ಆದಾಯ ಪ್ರಮಾಣ ಪತ್ರ", "ಆದಾಯ ಪ್ರಮಾಣಪತ್ರ"),
    "caste-certificate": ("caste certificate", "jati praman patra", "jati pramana patra", "जाति प्रमाण पत्र", "जाति प्रमाणपत्र", "ಜಾತಿ ಪ್ರಮಾಣಪತ್ರ", "ಜಾತಿ ಪ್ರಮಾಣ ಪತ್ರ"),
    "caste-income-certificate": ("caste and income certificate", "caste income certificate", "ಜಾತಿ ಮತ್ತು ಆದಾಯ ಪ್ರಮಾಣ ಪತ್ರ"),
    "ssp-post-matric-scholarship": ("ssp", "ssp scholarship", "ssp ವಿದ್ಯಾರ್ಥಿವೇತನ", "एसएसपी", "ಎಸ್ ಎಸ್ ಪಿ"),
    "vidyasiri": ("vidyasiri", "vidya siri", "ವಿದ್ಯಾಸಿರಿ", "विद्यासिरी"),
    "gruha-lakshmi": ("gruha lakshmi", "griha lakshmi", "gruhalakshmi", "गृह लक्ष्मी", "ಗೃಹ ಲಕ್ಷ್ಮಿ", "ಗೃಹಲಕ್ಷ್ಮಿ"),
    "ration-card": ("ration card", "राशन कार्ड", "ಪಡಿತರ ಚೀಟಿ"),
    "driving-licence": ("driving license", "driving licence", "ड्राइविंग लाइसेंस", "ಚಾಲನಾ ಪರವಾನಗಿ"),
    "eshram": ("e shram", "eshram", "ई श्रम", "ಇ ಶ್ರಮ್"),
}
STATES = {
    "Karnataka": ("karnataka", "karnatak", "कर्नाटक", "ಕರ್ನಾಟಕ", "ಕರ್ನಾಟಕದಲ್ಲಿ", "ಕರ್ನಾಟಕದ"),
    "Maharashtra": ("maharashtra", "महाराष्ट्र", "ಮಹಾರಾಷ್ಟ್ರ"),
    "Tamil Nadu": ("tamil nadu", "तमिलनाडु", "ತಮಿಳುನಾಡು"),
    "Kerala": ("kerala", "केरल", "ಕೇರಳ"),
    "Telangana": ("telangana", "तेलंगाना", "ತೆಲಂಗಾಣ"),
    "Andhra Pradesh": ("andhra pradesh", "आंध्र प्रदेश", "ಆಂಧ್ರ ಪ್ರದೇಶ"),
    **{name: (name,) for name in (
        "Assam", "Bihar", "Delhi", "Goa", "Gujarat", "Haryana", "Himachal Pradesh", "Jharkhand",
        "Madhya Pradesh", "Odisha", "Punjab", "Rajasthan", "Uttar Pradesh", "Uttarakhand", "West Bengal",
    )},
}
KEYWORDS = {
    "consistency": ("match", "mismatch", "name conflict", "स्पेलिंग", "मेल खाते", "ಹೆಸರು ಹೊಂದ", "hesaru match"),
    "expiry": ("expires", "expiry", "expiring", "expire", "वैधता", "समाप्त", "ಅವಧಿ", "expire agutte"),
    "centres": ("centre", "center", "seva sindhu", "karnataka one", "grama one", "केंद्र", "केन्द्र", "ಕೇಂದ್ರ", "kendra"),
    "documents": ("documents", "document", "required papers", "missing", "kagaz", "dastavez", "दस्तावेज", "दस्तावेज़", "कागज़", "ದಾಖಲೆ", "ದಾಖಲೆಗಳು", "dakhale"),
    "eligibility": ("eligible", "eligibility", "qualify", "पात्र", "पात्रता", "ಅರ್ಹ", "ಅರ್ಹತೆ", "arhate", "patrata", "can i apply"),
    "deadline": ("deadline", "last date", "application date", "अंतिम तारीख", "ಕೊನೆಯ ದಿನಾಂಕ", "last dinanka"),
    "apply": ("apply", "application", "how to", "how do", "kaise", "banana", "आवेदन", "कैसे", "ಅರ್ಜಿ", "ಹೇಗೆ", "arji", "hege"),
    "features": ("seva path", "sevapath", "ocr", "wallet", "document consistency", "ದಾಖಲೆ ವಾಲೆಟ್", "वॉलेट"),
}
STOP = set("i am my how do to a an the is what which in of can for me does where tell find help get want need please "
           "mujhe mera ka ki ke hai kaise chahiye banana paisa milega nanage beku nanu ide hege arji "
           "मुझे कैसे चाहिए क्या है ನನಗೆ ಬೇಕು ಹೇಗೆ".split())


def normalized(text: str) -> str:
    return " ".join("".join(
        char if unicodedata.category(char)[0] in "LMN" else " "
        for char in unicodedata.normalize("NFKC", text).casefold()
    ).split())


def has(text: str, term: str) -> bool:
    return " " + normalized(term) + " " in " " + text + " "


def parse(question: str):
    query = normalized(question)
    state = next((name for name, aliases in STATES.items() if any(has(query, alias) for alias in aliases)), None)
    academic_help = any(has(query, term) for term in (*CATEGORIES["Students"], *EDUCATION_NEEDS))
    category = "Students" if academic_help else next(
        (name for name, aliases in CATEGORIES.items() if any(has(query, alias) for alias in aliases)), None,
    )
    intent = next((intent for intent, aliases in KEYWORDS.items() if any(has(query, alias) for alias in aliases)), "find")
    if intent == "consistency" and not any(has(query, term) for term in
            ("name", "names", "aadhaar", "income certificate", "नाम", "आधार", "ಹೆಸರು", "hesaru")):
        intent = "find"
    return query, state, category, intent


def rank(services, query: str, category: str | None, state: str | None):
    words = [word for word in query.split() if word not in STOP and len(word) >= 3]
    scores = []
    for service in services:
        if state and service.state and service.state.casefold() != state.casefold():
            continue
        group = service.browse_category or service.category
        concept = category == group
        if category == "Students" and any(has(query, term) for term in (*CATEGORIES["Students"][2:], *EDUCATION_NEEDS)):
            concept = concept and service.slug != "yuva-nidhi"
        labels = [normalized(label) for label in (service.name, service.slug, *ALIASES.get(service.slug, ()))]
        direct = max((45 + len(label.split()) * 5 for label in labels if len(label) >= 3 and has(query, label)), default=0)
        heading = set(" ".join(labels).split())
        relevant = {token for token in heading if token not in STOP and len(token) >= 3}
        matches = sum(5 if word in relevant else 3 if len(word) >= 4 and any(
            len(label) >= 4 and SequenceMatcher(None, word, label, autojunk=False).ratio() >= 0.80
            for label in relevant) else 0 for word in words)
        if not direct and not concept and matches < (3 if len(words) == 1 and len(words[0]) >= 6 else 6):
            continue
        score = direct + min(matches, 23) + (24 if concept else 0)
        scores.append((score, direct, service))
    scores.sort(key=lambda row: (-row[0], 0 if row[2].verification_status == "verified" else 1,
                                  0 if state and row[2].state == state else 1, row[2].name))
    exact = [service for _, direct, service in scores if direct]
    if exact:
        best = scores[0][1]
        return [service for score, direct, service in scores if direct >= best][:4], True
    ranked = [service for _, _, service in scores]
    if state and category == "Farmers":
        local = [service for service in ranked if service.state == state][:2]
        central = [service for service in ranked if service.jurisdiction == "Central"][:2]
        ranked = list(dict.fromkeys([*local, *central, *ranked]))
    return ranked[:4], False


# A guard for prompts a citizen inadvertently pastes into the composer. Integrated profile,
# wallet and OCR data never enters this module in the first place.
SENSITIVE = re.compile(
    r"\b[\w.+-]+@[\w.-]+\.[A-Za-z]{2,}\b|(?<!\d)\d(?:[\s./-]*\d){6,}(?!\d)"
    r"|\b[A-Z]{5}\d{4}[A-Z]\b|\b[A-Z]{4}0[A-Z0-9]{6}\b"
    r"|(?:my name is|my address|house number|bank account|account number|ocr evidence|"
    r"मेरा नाम|मेरा पता|खाता नंबर|ನನ್ನ ಹೆಸರು|ನನ್ನ ವಿಳಾಸ|ಖಾತೆ ಸಂಖ್ಯೆ)",
    re.IGNORECASE,
)
INJECTION = re.compile(
    r"ignore (?:all |the )?(?:previous|prior|system)|system prompt|developer message|reveal (?:secrets|credentials)"
    r"|<\|(?:im_start|system)|jailbreak", re.IGNORECASE,
)


def can_send(question: str) -> bool:
    return not SENSITIVE.search(unicodedata.normalize("NFKC", question)) and not INJECTION.search(question)
