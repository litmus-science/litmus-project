from sqlalchemy import create_engine, inspect

from backend.models import _apply_compatibility_migrations


def test_compat_migration_adds_hypothesis_id_to_legacy_experiments_table() -> None:
    engine = create_engine("sqlite:///:memory:")

    with engine.begin() as conn:
        conn.exec_driver_sql(
            "CREATE TABLE experiments (id VARCHAR PRIMARY KEY, requester_id VARCHAR NOT NULL)"
        )
        _apply_compatibility_migrations(conn)

        columns = {column["name"] for column in inspect(conn).get_columns("experiments")}
        indexes = {index["name"] for index in inspect(conn).get_indexes("experiments")}

    assert "hypothesis_id" in columns
    assert "ix_experiments_hypothesis_id" in indexes


def test_compat_migration_is_idempotent() -> None:
    engine = create_engine("sqlite:///:memory:")

    with engine.begin() as conn:
        conn.exec_driver_sql(
            "CREATE TABLE experiments (id VARCHAR PRIMARY KEY, requester_id VARCHAR NOT NULL)"
        )
        _apply_compatibility_migrations(conn)
        _apply_compatibility_migrations(conn)
