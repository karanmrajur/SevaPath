from uuid import UUID

from fastapi import APIRouter, Response
from sqlalchemy import select, update
from sqlalchemy.exc import IntegrityError

from app.core.errors import ApiError
from app.core.sessions import Owner
from app.db.database import Db
from app.db.models import Grievance
from app.schemas.workspace import GrievanceCreate, GrievanceDraft, GrievanceUpdate

router = APIRouter(prefix="/grievances", tags=["grievances"])


def draft_text(record: Grievance) -> str:
    lines = [f"Subject: {record.title}"]
    if record.department:
        lines.append(f"Department: {record.department}")
    return "\n".join(lines) + f"\n\n{record.description}"


@router.get("", response_model=list[GrievanceDraft])
def list_grievances(owner: Owner, db: Db):
    return db.scalars(select(Grievance).where(Grievance.anonymous_session_id == owner)
        .order_by(Grievance.updated_at.desc(), Grievance.id)).all()


@router.post("", status_code=201, response_model=GrievanceDraft, responses={200: {"description": "Existing draft returned"}})
def create_grievance(data: GrievanceCreate, response: Response, owner: Owner, db: Db):
    request_id = str(data.request_id) if data.request_id else None
    existing_query = select(Grievance).where(
        Grievance.anonymous_session_id == owner, Grievance.request_id == request_id,
    )
    if request_id:
        existing = db.scalar(existing_query)
        if existing is not None:
            response.status_code = 200
            return existing

    record = Grievance(
        anonymous_session_id=owner, title=data.title, description=data.description,
        department=data.department or None, request_id=request_id,
    )
    record.draft_text = draft_text(record)
    try:
        db.add(record)
        db.flush()
        result = GrievanceDraft.model_validate(record)
        db.commit()
        return result
    except IntegrityError:
        db.rollback()
        existing = db.scalar(existing_query) if request_id else None
        if existing is None:
            raise
        response.status_code = 200
        return existing


@router.patch("/{grievance_id}", response_model=GrievanceDraft)
def update_grievance(grievance_id: UUID, data: GrievanceUpdate, owner: Owner, db: Db):
    scope = (Grievance.id == str(grievance_id), Grievance.anonymous_session_id == owner)
    # Serialize partial edits before regenerating the derived draft text.
    db.execute(update(Grievance).where(*scope).values(updated_at=Grievance.updated_at))
    record = db.scalar(select(Grievance).where(*scope))
    if record is None:
        raise ApiError(404, "grievance_not_found", "This grievance could not be found.")
    for field, value in data.model_dump(mode="json", exclude_unset=True).items():
        setattr(record, field, value if field != "department" else value or None)
    record.draft_text = draft_text(record)
    db.flush()
    result = GrievanceDraft.model_validate(record)
    db.commit()
    return result
