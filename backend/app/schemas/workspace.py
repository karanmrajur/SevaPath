from enum import Enum
from typing import Annotated, Literal
from uuid import UUID

from pydantic import BaseModel, ConfigDict, StrictBool, StringConstraints, model_validator

from .catalog import Record, Timestamp

Slug = Annotated[str, StringConstraints(min_length=1, max_length=120, pattern=r"^[a-z0-9]+(-[a-z0-9]+)*$")]
Title = Annotated[str, StringConstraints(strip_whitespace=True, min_length=1, max_length=120)]
Description = Annotated[str, StringConstraints(strip_whitespace=True, min_length=1, max_length=2000)]
Department = Annotated[str, StringConstraints(strip_whitespace=True, max_length=100)]


class Input(BaseModel):
    model_config = ConfigDict(extra="forbid")


class JourneyCreate(Input):
    service_slug: Slug


class TaskUpdate(Input):
    completed: StrictBool


class Task(Record):
    id: UUID
    title: str
    status: Literal["pending", "complete"]
    sort_order: int
    completed_at: Timestamp | None


class Journey(Record):
    id: UUID
    service_id: int
    service_slug: str
    status: Literal["in_progress", "complete"]
    created_at: Timestamp
    updated_at: Timestamp
    tasks: list[Task]


class GrievanceStatus(str, Enum):
    draft = "draft"
    ready = "ready"
    archived = "archived"


class GrievanceCreate(Input):
    title: Title
    description: Description
    department: Department | None = None
    request_id: UUID | None = None


class GrievanceUpdate(Input):
    title: Title | None = None
    description: Description | None = None
    department: Department | None = None
    local_status: GrievanceStatus | None = None

    @model_validator(mode="after")
    def validate_patch(self):
        if not self.model_fields_set:
            raise ValueError("Provide at least one field to update")
        for key in self.model_fields_set - {"department"}:
            if getattr(self, key) is None:
                raise ValueError(f"{key} cannot be null")
        return self


class GrievanceDraft(Record):
    id: UUID
    title: str
    department: str | None
    description: str
    draft_text: str
    local_status: GrievanceStatus
    official_reference_number: str | None
    created_at: Timestamp
    updated_at: Timestamp
