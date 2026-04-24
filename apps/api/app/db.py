import os
from functools import lru_cache

from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine
from sqlalchemy.orm import DeclarativeBase


DEFAULT_DATABASE_URL = "sqlite+aiosqlite:///./topolog.db"


class Base(DeclarativeBase):
    pass


def get_database_url() -> str:
    return os.getenv("TOPOLOG_DATABASE_URL", DEFAULT_DATABASE_URL)


@lru_cache(maxsize=1)
def get_engine():
    url = get_database_url()
    connect_args = {}
    if "sqlite" in url:
        connect_args["timeout"] = 30
    return create_async_engine(url, echo=False, connect_args=connect_args)


@lru_cache(maxsize=1)
def get_session_factory():
    return async_sessionmaker(get_engine(), class_=AsyncSession, expire_on_commit=False)


def reset_engine():
    get_session_factory.cache_clear()
    get_engine.cache_clear()


async def init_db():
    """Initialize the database. In production, run Alembic migrations instead.

    This uses create_all for development convenience. Production deployments
    should use: cd apps/api && alembic upgrade head
    """
    if os.getenv("TOPOLOG_USE_ALEMBIC"):
        return
    async with get_engine().begin() as conn:
        await conn.run_sync(Base.metadata.create_all)


async def drop_db():
    async with get_engine().begin() as conn:
        await conn.run_sync(Base.metadata.drop_all)


async def get_session():
    async with get_session_factory()() as session:
        yield session
