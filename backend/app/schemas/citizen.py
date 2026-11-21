from datetime import date, datetime, timedelta, timezone
from typing import Annotated, Literal

from pydantic import BaseModel, Field, StringConstraints, model_validator

from .workspace import Input

Text = Annotated[str, StringConstraints(strip_whitespace=True, max_length=120)]
Short = Annotated[str, StringConstraints(strip_whitespace=True, max_length=60)]
Password = Annotated[str, StringConstraints(min_length=1, max_length=128)]
Slug = Annotated[str, StringConstraints(min_length=1, max_length=120, pattern=r"^[a-z0-9]+(-[a-z0-9]+)*$")]

class Register(Input):
    name: Annotated[str, StringConstraints(strip_whitespace=True, min_length=1, max_length=120)]
    email: Annotated[str, StringConstraints(strip_whitespace=True, min_length=3, max_length=254)]
    mobile: Annotated[str, StringConstraints(strip_whitespace=True, max_length=24)]
    password: Annotated[str, StringConstraints(min_length=8, max_length=128)]


class Login(Input):
    identifier: Annotated[str, StringConstraints(strip_whitespace=True, min_length=1, max_length=254)]
    password: Password
    remember: bool = False


class PasswordCheck(Input):
    password: Password


class WalletUnlock(Input):
    credential: Password


class PinChange(PasswordCheck):
    pin: Annotated[str, StringConstraints(pattern=r"^[0-9]{6}$")] | None = None


class PasswordChange(PasswordCheck):
    new_password: Annotated[str, StringConstraints(min_length=8, max_length=128)]


class Dependent(Input):
    label: Annotated[str, StringConstraints(strip_whitespace=True, min_length=1, max_length=60)]
    education: Short = ""
    consent: Literal[True]


def today_india() -> date:
    return datetime.now(timezone(timedelta(hours=5, minutes=30))).date()


class Profile(Input):
    title: Literal["", "Mr", "Mrs", "Ms", "Other"] = ""
    first_name: Short = ""
    middle_name: Short = ""
    surname: Short = ""
    date_of_birth: date | None = None
    gender: Short = ""
    parent_name: Text = ""
    guardian_name: Text = ""
    marital_status: Short = ""
    nationality: Short = ""
    taluk: Short = ""
    city: Short = ""
    pin_code: Annotated[str, StringConstraints(pattern=r"^(?:[1-9][0-9]{5})?$")] = ""
    area: Literal["", "Urban", "Rural"] = ""
    temporary_address: Annotated[str, StringConstraints(strip_whitespace=True, max_length=240)] = ""
    permanent_address: Annotated[str, StringConstraints(strip_whitespace=True, max_length=240)] = ""
    same_as_permanent: bool = False
    parent_occupation: Short = ""
    annual_household_income: int | None = Field(default=None, ge=0, le=1_000_000_000)
    employment: Literal["", "Student", "Farmer", "Employee", "Self-employed", "Unemployed", "Retired"] = ""
    disability: bool | None = None
    religion: Short = ""
    caste: Short = ""
    reservation_category: Short = ""
    sensitive_scheme: Literal["", "ssp-post-matric-scholarship", "vidyasiri"] = ""
    ration_status: Literal["", "BPL", "APL"] = ""
    state: Short = ""
    district: Short = ""
    age: int | None = Field(default=None, ge=0, le=125)
    occupation: Short = ""
    education: Short = ""
    income_range: Short = ""
    student: bool | None = None
    farmer: bool | None = None
    landholding: bool | None = None
    gruha_lakshmi_household_head: bool | None = None
    dependent: Dependent | None = None

    @model_validator(mode="after")
    def derive_profile_facts(self):
        if self.date_of_birth is not None:
            today = today_india()
            dob = self.date_of_birth
            age = today.year - dob.year - ((today.month, today.day) < (dob.month, dob.day))
            if not 0 <= age <= 125:
                raise ValueError("Enter a date of birth within the past 125 years.")
            self.age = age
        if self.same_as_permanent:
            self.temporary_address = ""
        if (self.caste or self.religion or self.reservation_category) and not self.sensitive_scheme:
            raise ValueError("Choose an applicable scholarship before saving optional community details.")
        if self.religion and self.sensitive_scheme != "ssp-post-matric-scholarship":
            raise ValueError("Religion is accepted only for relevant SSP minority awards.")
        return self


class ProfileUpdate(Profile):
    consent: Literal[True]
    email: Annotated[str, StringConstraints(strip_whitespace=True, max_length=254)] | None = None
    mobile: Annotated[str, StringConstraints(strip_whitespace=True, max_length=24)] | None = None
    password: Password | None = None


class CitizenSettings(Input):
    language: Literal["en", "hi"] | None = None
    notifications: bool = True
    expiry_alerts: bool = True


class AccountView(BaseModel):
    name: str
    email: str
    profile: Profile
    mobile: str
    has_photo: bool
    settings: CitizenSettings


class Application(Input):
    title: Annotated[str, StringConstraints(strip_whitespace=True, min_length=1, max_length=120)]
    reference: Text = ""
    submission_date: date | None = None
    status: Literal["Preparing", "Submitted", "In progress", "Approved", "Rejected", "Closed"] = "Preparing"
    next_step: Text = ""
    applicant_name: Text = ""
    applicant_contact: Text = ""
    updated_at: datetime | None = None
    tasks: list[bool] = Field(default_factory=lambda: [False, False, False], min_length=3, max_length=3)


class ReportedGrievance(Input):
    reference: Text = ""
    submission_date: date | None = None
    status: Literal["Draft", "Submitted", "In progress", "Resolved", "Escalated"] = "Draft"
    next_step: Text = ""


class Workspace(Input):
    version: int = Field(default=0, ge=0)
    saved: list[Slug] = Field(default_factory=list, max_length=100)
    saved_at: dict[Slug, datetime] = Field(default_factory=dict, max_length=100)
    recent: list[Slug] = Field(default_factory=list, max_length=10)
    reminders: list[Slug] = Field(default_factory=list, max_length=100)
    checklist: dict[Slug, Literal["ready", "missing", "unchecked"]] = Field(default_factory=dict, max_length=100)
    applications: dict[Slug, Application] = Field(default_factory=dict, max_length=100)
    grievances: dict[Slug, ReportedGrievance] = Field(default_factory=dict, max_length=100)


DocumentCategory = Literal[
    "Aadhaar Card", "Caste certificate", "Income certificate", "Combined Caste and Income Certificate",
    "Driving Licence", "PAN Card", "Voter ID", "Bank Passbook", "Ration card", "Class 10 Marksheet",
    "Class 12 Marksheet", "Degree / Diploma Certificate", "Birth Certificate", "Residence certificate",
    "Disability Certificate", "RTC / Pahani / Land Records", "FRUITS ID supporting documents",
    "Passport-size Photograph", "Other", "Education marksheet", "Farmer document", "Identity proof",
    "Address proof", "Land record", "Bank records", "Learner licence",
]


class FileUpload(Input):
    expires_on: date | None = None
    consent: Literal[True]
    name: Annotated[str, StringConstraints(strip_whitespace=True, min_length=1, max_length=140)]
    category: DocumentCategory
    mime: Literal["image/jpeg", "image/png", "application/pdf"]
    content: Annotated[str, StringConstraints(min_length=4, max_length=4 * 1024 * 1024)]
