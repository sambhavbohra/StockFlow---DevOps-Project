from datetime import datetime
from typing import Annotated, Literal

from fastapi import APIRouter, Depends
from pydantic import BaseModel, ConfigDict, StringConstraints
from sqlalchemy.orm import Session

from .database import get_db
from .models import AppSettings

router = APIRouter(prefix="/api/settings", tags=["settings"])
Db = Annotated[Session, Depends(get_db)]


class SettingsIn(BaseModel):
    model_config = ConfigDict(extra="forbid")

    business_name: Annotated[str, StringConstraints(strip_whitespace=True, min_length=1, max_length=80)]


class SettingsOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    business_name: str
    currency: Literal["INR"] = "INR"  # fixed in version one (PRD F6)
    updated_at: datetime


def get_row(db: Session) -> AppSettings:
    # Migration 0001 inserts the single row; recreate it if someone deleted it by hand.
    row = db.get(AppSettings, 1)
    if row is None:
        row = AppSettings(id=1)
        db.add(row)
        db.commit()
        db.refresh(row)
    return row


@router.get("", response_model=SettingsOut)
def read_settings(db: Db):
    return get_row(db)


@router.put("", response_model=SettingsOut)
def update_settings(payload: SettingsIn, db: Db):
    row = get_row(db)
    row.business_name = payload.business_name
    db.commit()
    db.refresh(row)
    return row
