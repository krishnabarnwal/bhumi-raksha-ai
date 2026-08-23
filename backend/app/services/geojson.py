"""GeoJSON serialization helpers.

PostGIS does the geometry → GeoJSON conversion in-query via ``ST_AsGeoJSON`` so
we never need shapely on the Python side. Endpoints select
``func.ST_AsGeoJSON(Model.geom).label("geometry")`` alongside the property
columns, fetch ``.mappings()`` rows, and hand them here.
"""

from __future__ import annotations

import json
from collections.abc import Iterable, Mapping, Sequence
from typing import Any


def parse_geometry(geojson_str: str | None) -> dict | None:
    """Parse a PostGIS ``ST_AsGeoJSON`` string into a geometry dict (or None)."""

    if not geojson_str:
        return None
    return json.loads(geojson_str)


def make_feature(
    geometry: dict | None,
    properties: Mapping[str, Any],
    feature_id: Any = None,
) -> dict:
    """Build a single GeoJSON Feature (geometry may be null for un-located rows)."""

    feature: dict[str, Any] = {
        "type": "Feature",
        "geometry": geometry,
        "properties": dict(properties),
    }
    if feature_id is not None:
        feature["id"] = feature_id
    return feature


def make_feature_collection(features: Sequence[dict]) -> dict:
    """Wrap features in a GeoJSON FeatureCollection."""

    return {"type": "FeatureCollection", "features": list(features)}


def mappings_to_feature_collection(
    rows: Iterable[Mapping[str, Any]],
    *,
    geom_key: str = "geometry",
    id_key: str | None = "id",
    prop_keys: Sequence[str] | None = None,
) -> dict:
    """Turn ``.mappings()`` rows into a FeatureCollection.

    Each row must contain the ``ST_AsGeoJSON`` string under ``geom_key``. If
    ``prop_keys`` is given, only those columns become feature properties;
    otherwise every column except the geometry becomes a property. ``id_key``,
    when present in the row, is lifted to the Feature ``id``.
    """

    features: list[dict] = []
    for raw in rows:
        row = dict(raw)
        geometry = parse_geometry(row.get(geom_key))
        feature_id = row.get(id_key) if id_key else None
        if prop_keys is None:
            properties = {key: value for key, value in row.items() if key != geom_key}
        else:
            properties = {key: row.get(key) for key in prop_keys}
        features.append(make_feature(geometry, properties, feature_id))
    return make_feature_collection(features)
