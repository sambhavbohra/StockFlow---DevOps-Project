from logging.config import fileConfig

from alembic import context
from sqlalchemy import text

from app.database import engine
from app.models import Base

if context.config.config_file_name:
    fileConfig(context.config.config_file_name)

target_metadata = Base.metadata


def run_migrations_offline():
    context.configure(url=engine.url.render_as_string(hide_password=False), target_metadata=target_metadata, literal_binds=True)
    with context.begin_transaction():
        context.run_migrations()


def run_migrations_online():
    with engine.connect() as connection:
        context.configure(connection=connection, target_metadata=target_metadata)
        with context.begin_transaction():
            # Every backend container runs migrations at start-up. With 2+ replicas starting together,
            # this transaction-scoped lock makes them take turns; the later ones then find nothing to do.
            connection.execute(text("SELECT pg_advisory_xact_lock(727274)"))
            context.run_migrations()


if context.is_offline_mode():
    run_migrations_offline()
else:
    run_migrations_online()
