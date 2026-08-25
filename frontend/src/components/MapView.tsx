import { useEffect, useRef } from "react";
import maplibregl from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";
import type { Feature, FeatureCollection } from "../types";

interface MapViewProps {
  zones: FeatureCollection | null;
  districts: FeatureCollection | null;
  roads: FeatureCollection | null;
  villages: FeatureCollection | null;
  infrastructure: FeatureCollection | null;
  incidents: FeatureCollection | null;
  reports: FeatureCollection | null;
  sos: FeatureCollection | null;
  selectedZoneId: number | null;
  selectedSosId: number | null;
  focusRequest: { id: number; nonce: number } | null;
  locating: boolean;
  draftLocation: { lat: number; lon: number } | null;
  onSelectZone: (id: number) => void;
  onSelectSos: (id: number) => void;
  onPickLocation: (lat: number, lon: number) => void;
}

const EMPTY: FeatureCollection = { type: "FeatureCollection", features: [] };

// Dark ops-style base. OSM raster is a nice-to-have; if the venue has no
// internet the background colour shows through and every vector layer below
// still renders — the demo never depends on external tiles.
const STYLE: maplibregl.StyleSpecification = {
  version: 8,
  glyphs: "https://demotiles.maplibre.org/font/{fontstack}/{range}.pbf",
  sources: {
    osm: {
      type: "raster",
      tiles: [
        "https://a.tile.openstreetmap.org/{z}/{x}/{y}.png",
        "https://b.tile.openstreetmap.org/{z}/{x}/{y}.png",
        "https://c.tile.openstreetmap.org/{z}/{x}/{y}.png",
      ],
      tileSize: 256,
      attribution: "© OpenStreetMap contributors",
    },
  },
  layers: [
    { id: "bg", type: "background", paint: { "background-color": "#0b1a2b" } },
    {
      id: "osm",
      type: "raster",
      source: "osm",
      paint: { "raster-opacity": 0.45, "raster-saturation": -0.3 },
    },
  ],
};

// Rough centroid of a (Multi)Polygon/Point feature for fly-to.
function featureCenter(feature: Feature): [number, number] | null {
  const geom = feature.geometry as {
    type: string;
    coordinates: unknown;
  } | null;
  if (!geom) return null;
  const coords: number[][] = [];
  const walk = (node: unknown) => {
    if (
      Array.isArray(node) &&
      typeof node[0] === "number" &&
      typeof node[1] === "number"
    ) {
      coords.push(node as number[]);
    } else if (Array.isArray(node)) {
      node.forEach(walk);
    }
  };
  walk(geom.coordinates);
  if (!coords.length) return null;
  const sum = coords.reduce(
    (acc, c) => [acc[0] + c[0], acc[1] + c[1]],
    [0, 0],
  );
  return [sum[0] / coords.length, sum[1] / coords.length];
}

export default function MapView(props: MapViewProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<maplibregl.Map | null>(null);
  const readyRef = useRef(false);
  // Keep the latest click handler without re-binding the map listener.
  const onSelectRef = useRef(props.onSelectZone);
  onSelectRef.current = props.onSelectZone;
  const onSelectSosRef = useRef(props.onSelectSos);
  onSelectSosRef.current = props.onSelectSos;
  const onPickRef = useRef(props.onPickLocation);
  onPickRef.current = props.onPickLocation;
  // Whether the map is in "pick a report location" mode (read inside handlers).
  const locatingRef = useRef(props.locating);
  locatingRef.current = props.locating;

  // --- create the map once ------------------------------------------------
  useEffect(() => {
    if (mapRef.current || !containerRef.current) return;
    const map = new maplibregl.Map({
      container: containerRef.current,
      style: STYLE,
      center: [88.5, 27.55],
      zoom: 8.2,
      attributionControl: false,
    });
    mapRef.current = map;
    (window as unknown as { __map?: maplibregl.Map }).__map = map; // debug handle
    map.on("error", (e) => console.error("[maplibre error]", e && e.error));
    map.addControl(new maplibregl.NavigationControl({ showCompass: false }), "top-right");
    map.addControl(new maplibregl.AttributionControl({ compact: true }), "bottom-right");
    map.addControl(new maplibregl.ScaleControl({ unit: "metric" }), "bottom-left");

    map.on("load", () => {
      const src = (id: string) =>
        map.addSource(id, { type: "geojson", data: EMPTY });
      ["districts", "zones", "roads", "incidents", "infrastructure", "villages", "reports", "sos", "draft"].forEach(src);

      map.addLayer({
        id: "districts-outline",
        type: "line",
        source: "districts",
        paint: {
          "line-color": "#4a6b8a",
          "line-width": 1,
          "line-dasharray": [3, 2],
          "line-opacity": 0.7,
        },
      });
      map.addLayer({
        id: "zones-fill",
        type: "fill",
        source: "zones",
        paint: {
          "fill-color": ["get", "color"],
          "fill-opacity": 0.55,
        },
      });
      map.addLayer({
        id: "zones-outline",
        type: "line",
        source: "zones",
        paint: { "line-color": ["get", "color"], "line-width": 1.5 },
      });
      map.addLayer({
        id: "zones-selected",
        type: "line",
        source: "zones",
        filter: ["==", ["get", "id"], -1],
        paint: { "line-color": "#ffffff", "line-width": 3 },
      });
      map.addLayer({
        id: "roads-line",
        type: "line",
        source: "roads",
        paint: { "line-color": "#ffd54f", "line-width": 2.2, "line-opacity": 0.9 },
      });
      map.addLayer({
        id: "incidents-circle",
        type: "circle",
        source: "incidents",
        paint: {
          "circle-radius": 5,
          "circle-color": "#ff5252",
          "circle-stroke-color": "#7f0000",
          "circle-stroke-width": 1.5,
          "circle-opacity": 0.9,
        },
      });
      map.addLayer({
        id: "infra-circle",
        type: "circle",
        source: "infrastructure",
        paint: {
          "circle-radius": 5,
          "circle-color": "#26c6da",
          "circle-stroke-color": "#00363a",
          "circle-stroke-width": 1.5,
        },
      });
      map.addLayer({
        id: "villages-circle",
        type: "circle",
        source: "villages",
        paint: {
          "circle-radius": 4,
          "circle-color": "#ffffff",
          "circle-stroke-color": "#1b3a57",
          "circle-stroke-width": 1.5,
        },
      });
      map.addLayer({
        id: "villages-label",
        type: "symbol",
        source: "villages",
        layout: {
          "text-field": ["get", "name"],
          "text-size": 11,
          "text-offset": [0, 1.1],
          "text-anchor": "top",
        },
        paint: {
          "text-color": "#e8f0f8",
          "text-halo-color": "#0b1a2b",
          "text-halo-width": 1.4,
        },
      });

      // Citizen / field-officer reports — distinct magenta markers.
      map.addLayer({
        id: "reports-circle",
        type: "circle",
        source: "reports",
        paint: {
          "circle-radius": 6,
          "circle-color": "#e040fb",
          "circle-stroke-color": "#3b0a3f",
          "circle-stroke-width": 2,
          "circle-opacity": 0.95,
        },
      });
      // Draft pin while a new report's location is being picked.
      map.addLayer({
        id: "draft-halo",
        type: "circle",
        source: "draft",
        paint: {
          "circle-radius": 12,
          "circle-color": "#e040fb",
          "circle-opacity": 0.25,
        },
      });
      map.addLayer({
        id: "draft-pin",
        type: "circle",
        source: "draft",
        paint: {
          "circle-radius": 6,
          "circle-color": "#e040fb",
          "circle-stroke-color": "#ffffff",
          "circle-stroke-width": 2,
        },
      });

      // Emergency SOS incidents — the most prominent markers, coloured by AI
      // priority (P1 red → P4 green) and drawn on top of every other layer.
      map.addLayer({
        id: "sos-halo",
        type: "circle",
        source: "sos",
        paint: {
          "circle-radius": 17,
          "circle-color": [
            "match",
            ["get", "priority"],
            "P1", "#c62828",
            "P2", "#ef6c00",
            "P3", "#f9a825",
            "P4", "#2e7d32",
            "#607d8b",
          ],
          "circle-opacity": 0.22,
        },
      });
      map.addLayer({
        id: "sos-selected",
        type: "circle",
        source: "sos",
        filter: ["==", ["get", "id"], -1],
        paint: {
          "circle-radius": 13,
          "circle-color": "rgba(0,0,0,0)",
          "circle-stroke-color": "#ffffff",
          "circle-stroke-width": 3,
        },
      });
      map.addLayer({
        id: "sos-circle",
        type: "circle",
        source: "sos",
        paint: {
          "circle-radius": 9,
          "circle-color": [
            "match",
            ["get", "priority"],
            "P1", "#c62828",
            "P2", "#ef6c00",
            "P3", "#f9a825",
            "P4", "#2e7d32",
            "#607d8b",
          ],
          // Resolved incidents are dimmed and their ring greyed, so the Command
          // Center can tell closed incidents from active ones at a glance.
          "circle-stroke-color": [
            "match",
            ["get", "responder_status"],
            "RESOLVED", "#9e9e9e",
            "#ffffff",
          ],
          "circle-stroke-width": 2.5,
          "circle-opacity": [
            "match",
            ["get", "responder_status"],
            "RESOLVED", 0.45,
            1,
          ],
        },
      });
      map.addLayer({
        id: "sos-label",
        type: "symbol",
        source: "sos",
        layout: {
          "text-field": ["get", "priority"],
          "text-size": 11,
          "text-offset": [0, -1.5],
          "text-anchor": "bottom",
        },
        paint: {
          "text-color": "#ffffff",
          "text-halo-color": "#000000",
          "text-halo-width": 1.4,
        },
      });

      // Click / hover on zones (suppressed while picking a report location).
      map.on("click", "zones-fill", (e) => {
        if (locatingRef.current) return;
        const f = e.features?.[0];
        const id = f?.properties?.id;
        if (id != null) onSelectRef.current(Number(id));
      });
      // SOS markers take click priority over the zone fill beneath them.
      map.on("click", "sos-circle", (e) => {
        if (locatingRef.current) return;
        const id = e.features?.[0]?.properties?.id;
        if (id != null) onSelectSosRef.current(Number(id));
      });
      // Any click while in locating mode drops the report pin there.
      map.on("click", (e) => {
        if (!locatingRef.current) return;
        onPickRef.current(e.lngLat.lat, e.lngLat.lng);
      });
      const pointer = () => {
        if (!locatingRef.current) map.getCanvas().style.cursor = "pointer";
      };
      const clear = () => {
        if (!locatingRef.current) map.getCanvas().style.cursor = "";
      };
      map.on("mouseenter", "zones-fill", pointer);
      map.on("mouseleave", "zones-fill", clear);
      map.on("mouseenter", "sos-circle", pointer);
      map.on("mouseleave", "sos-circle", clear);

      readyRef.current = true;
      // Push any data that arrived before load.
      syncData();
    });

    return () => {
      map.remove();
      mapRef.current = null;
      readyRef.current = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // --- sync sources whenever data changes --------------------------------
  const dataRef = useRef(props);
  dataRef.current = props;
  function syncData() {
    const map = mapRef.current;
    if (!map || !readyRef.current) return;
    const p = dataRef.current;
    const set = (id: string, data: FeatureCollection | null) => {
      const source = map.getSource(id) as maplibregl.GeoJSONSource | undefined;
      if (source) source.setData((data ?? EMPTY) as never);
    };
    set("districts", p.districts);
    set("zones", p.zones);
    set("roads", p.roads);
    set("incidents", p.incidents);
    set("infrastructure", p.infrastructure);
    set("villages", p.villages);
    set("reports", p.reports);
    set("sos", p.sos);
  }

  useEffect(() => {
    syncData();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    props.zones,
    props.districts,
    props.roads,
    props.villages,
    props.infrastructure,
    props.incidents,
    props.reports,
    props.sos,
  ]);

  // --- selected highlight -------------------------------------------------
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !readyRef.current) return;
    if (map.getLayer("zones-selected")) {
      map.setFilter("zones-selected", [
        "==",
        ["get", "id"],
        props.selectedZoneId ?? -1,
      ]);
    }
  }, [props.selectedZoneId]);

  // --- selected SOS highlight ---------------------------------------------
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !readyRef.current) return;
    if (map.getLayer("sos-selected")) {
      map.setFilter("sos-selected", [
        "==",
        ["get", "id"],
        props.selectedSosId ?? -1,
      ]);
    }
  }, [props.selectedSosId]);

  // --- fly to a zone on request ------------------------------------------
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !props.focusRequest || !props.zones) return;
    const feature = props.zones.features.find(
      (f) => Number(f.properties?.id) === props.focusRequest!.id,
    );
    if (!feature) return;
    const center = featureCenter(feature);
    if (center) map.flyTo({ center, zoom: 10.5, speed: 0.8 });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [props.focusRequest?.nonce]);

  // --- draft report pin ---------------------------------------------------
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !readyRef.current) return;
    const source = map.getSource("draft") as maplibregl.GeoJSONSource | undefined;
    if (!source) return;
    const d = props.draftLocation;
    const data: FeatureCollection = d
      ? {
          type: "FeatureCollection",
          features: [
            {
              type: "Feature",
              geometry: { type: "Point", coordinates: [d.lon, d.lat] },
              properties: {},
            },
          ],
        }
      : EMPTY;
    source.setData(data as never);
  }, [props.draftLocation]);

  // --- crosshair cursor while picking a location --------------------------
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !readyRef.current) return;
    map.getCanvas().style.cursor = props.locating ? "crosshair" : "";
  }, [props.locating]);

  return <div ref={containerRef} className="map-canvas" />;
}
