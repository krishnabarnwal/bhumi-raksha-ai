"""Domain services (risk engine, GeoJSON serialization, exposure, storage).

Phase 2 additive layer over the frozen Phase 1 foundation. These modules hold
business logic that the API routers call; none of them change the database
schema or the Alembic migration.
"""
