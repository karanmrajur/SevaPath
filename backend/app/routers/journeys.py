from uuid import UUID

from fastapi import APIRouter, Response
from sqlalchemy import select, update
from sqlalchemy.exc import IntegrityError

from app.core.errors import ApiError
from app.core.sessions import Owner
from app.db.database import Db
from app.db.models import CitizenJourney, JourneyTask, Service, now_utc
from app.schemas.workspace import Journey, JourneyCreate, Task, TaskUpdate

from .catalog import find_service

router = APIRouter(prefix="/journeys", tags=["journeys"])
TASK_TITLES = ("Find a service", "Review the service information", "Organise your records")


def journey_scope(owner: str, journey_id: UUID):
    return (CitizenJourney.id == str(journey_id), CitizenJourney.anonymous_session_id == owner)


def journey_tasks(db: Db, journey_id: str) -> list[JourneyTask]:
    return list(db.scalars(select(JourneyTask).where(JourneyTask.journey_id == journey_id).order_by(JourneyTask.sort_order)))


def journey_response(journey: CitizenJourney, slug: str, tasks: list[JourneyTask]) -> Journey:
    return Journey(
        id=journey.id, service_id=journey.service_id, service_slug=slug, status=journey.status,
        created_at=journey.created_at, updated_at=journey.updated_at, tasks=tasks,
    )


def owned_journey(db: Db, owner: str, journey_id: UUID) -> tuple[CitizenJourney, str]:
    row = db.execute(select(CitizenJourney, Service.slug).join(Service)
        .where(*journey_scope(owner, journey_id))).one_or_none()
    if row is None:
        raise ApiError(404, "journey_not_found", "This journey could not be found.")
    return row[0], row[1]


@router.get("", response_model=list[Journey])
def list_journeys(owner: Owner, db: Db):
    rows = db.execute(select(CitizenJourney, Service.slug).join(Service)
        .where(CitizenJourney.anonymous_session_id == owner)
        .order_by(CitizenJourney.updated_at.desc(), CitizenJourney.id)).all()
    tasks_by_journey: dict[str, list[JourneyTask]] = {journey.id: [] for journey, _ in rows}
    if rows:
        tasks = db.scalars(select(JourneyTask).where(JourneyTask.journey_id.in_(tasks_by_journey))
            .order_by(JourneyTask.sort_order))
        for task in tasks:
            tasks_by_journey[task.journey_id].append(task)
    return [journey_response(journey, slug, tasks_by_journey[journey.id]) for journey, slug in rows]


@router.post("", status_code=201, response_model=Journey, responses={200: {"description": "Existing journey resumed"}})
def create_journey(data: JourneyCreate, response: Response, owner: Owner, db: Db):
    service = find_service(db, data.service_slug)
    service_id = service.id
    existing_query = select(CitizenJourney).where(
        CitizenJourney.anonymous_session_id == owner, CitizenJourney.service_id == service_id,
    )
    existing = db.scalar(existing_query)
    if existing is not None:
        response.status_code = 200
        return journey_response(existing, data.service_slug, journey_tasks(db, existing.id))

    journey = CitizenJourney(anonymous_session_id=owner, service_id=service_id)
    try:
        db.add(journey)
        db.flush()
        tasks = [
            JourneyTask(
                journey_id=journey.id, title=title, sort_order=index,
                status="complete" if index == 1 else "pending",
                completed_at=now_utc() if index == 1 else None,
            )
            for index, title in enumerate(TASK_TITLES, start=1)
        ]
        db.add_all(tasks)
        db.flush()
        result = journey_response(journey, data.service_slug, tasks)
        db.commit()
        return result
    except IntegrityError:
        db.rollback()
        existing = db.scalar(existing_query)
        if existing is None:
            raise
        response.status_code = 200
        return journey_response(existing, data.service_slug, journey_tasks(db, existing.id))


@router.get("/{journey_id}", response_model=Journey)
def get_journey(journey_id: UUID, owner: Owner, db: Db):
    journey, slug = owned_journey(db, owner, journey_id)
    return journey_response(journey, slug, journey_tasks(db, journey.id))


@router.patch("/{journey_id}/tasks/{task_id}", response_model=Journey)
def update_task(journey_id: UUID, task_id: UUID, data: TaskUpdate, owner: Owner, db: Db):
    # Acquire the parent write lock before reading tasks so concurrent completions
    # cannot leave the journey status out of sync with its tasks.
    db.execute(update(CitizenJourney).where(*journey_scope(owner, journey_id))
        .values(updated_at=CitizenJourney.updated_at))
    journey, slug = owned_journey(db, owner, journey_id)
    tasks = journey_tasks(db, journey.id)
    task = next((item for item in tasks if item.id == str(task_id)), None)
    if task is None:
        raise ApiError(404, "task_not_found", "This task could not be found.")

    status = "complete" if data.completed else "pending"
    if task.status != status:
        task.status = status
        task.completed_at = now_utc() if data.completed else None
        journey.status = "complete" if all(item.status == "complete" for item in tasks) else "in_progress"
        journey.updated_at = now_utc()
    result = journey_response(journey, slug, tasks)
    db.commit()
    return result
