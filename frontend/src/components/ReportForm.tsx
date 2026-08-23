import { useRef, useState } from "react";
import { api } from "../api";
import type { Feature, FieldReportCategory } from "../types";

interface ReportFormProps {
  locating: boolean;
  draftLocation: { lat: number; lon: number } | null;
  onStartLocating: () => void;
  onCancelLocating: () => void;
  onSubmitted: (feature: Feature) => void;
  onError: (msg: string) => void;
}

const CATEGORIES: { value: FieldReportCategory; label: string }[] = [
  { value: "slope_crack", label: "Slope crack" },
  { value: "rockfall", label: "Rockfall" },
  { value: "water_seepage", label: "Water seepage" },
  { value: "slope_movement", label: "Slope movement" },
  { value: "road_blockage", label: "Road blockage" },
  { value: "landslide", label: "Landslide" },
  { value: "other", label: "Other" },
];

const SEVERITIES = ["low", "medium", "high"];

// Client-side pre-check mirrors the server allow-list (§14) for fast feedback;
// the backend re-validates type, size and magic bytes regardless.
const ALLOWED_TYPES = ["image/jpeg", "image/png", "image/webp"];
const MAX_BYTES = 8 * 1024 * 1024;

export default function ReportForm(props: ReportFormProps) {
  const { locating, draftLocation } = props;
  const [category, setCategory] = useState<FieldReportCategory>("slope_crack");
  const [severity, setSeverity] = useState("medium");
  const [description, setDescription] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement | null>(null);

  function onFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    setMessage(null);
    const f = e.target.files?.[0] ?? null;
    if (f) {
      if (!ALLOWED_TYPES.includes(f.type)) {
        props.onError(`Unsupported image type "${f.type || "unknown"}". Use JPEG, PNG or WebP.`);
        e.target.value = "";
        setFile(null);
        return;
      }
      if (f.size > MAX_BYTES) {
        props.onError("Image too large (limit 8 MB).");
        e.target.value = "";
        setFile(null);
        return;
      }
    }
    setFile(f);
  }

  function reset() {
    setCategory("slope_crack");
    setSeverity("medium");
    setDescription("");
    setFile(null);
    if (fileRef.current) fileRef.current.value = "";
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!draftLocation || submitting) return;
    setSubmitting(true);
    setMessage(null);
    try {
      const feature = await api.createFieldReport({
        lat: draftLocation.lat,
        lon: draftLocation.lon,
        category,
        severity,
        description: description.trim() || undefined,
        reporter_type: "field_officer",
        client_uuid:
          typeof crypto !== "undefined" && "randomUUID" in crypto
            ? crypto.randomUUID()
            : undefined,
      });
      if (file) {
        await api.uploadMedia(Number(feature.id), file);
      }
      setMessage(`Report #${feature.id} submitted${file ? " with photo" : ""}.`);
      reset();
      props.onSubmitted(feature);
    } catch (err) {
      props.onError(err instanceof Error ? err.message : String(err));
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="panel">
      <div className="panel-title">
        Field Report
        <span className="hint">ground truth</span>
      </div>

      <form className="report-form" onSubmit={submit}>
        <label className="field-label">Location</label>
        <div className="locate-row">
          <button
            type="button"
            className={`locate-btn ${locating ? "active" : ""}`}
            onClick={locating ? props.onCancelLocating : props.onStartLocating}
          >
            {locating ? "Click the map…" : draftLocation ? "Re-pick on map" : "📍 Pick on map"}
          </button>
          {locating && (
            <button type="button" className="locate-cancel" onClick={props.onCancelLocating}>
              Cancel
            </button>
          )}
        </div>
        <div className="locate-coords">
          {draftLocation
            ? `${draftLocation.lat.toFixed(4)}, ${draftLocation.lon.toFixed(4)}`
            : "No location selected"}
        </div>

        <label className="field-label" htmlFor="rf-category">Type</label>
        <select
          id="rf-category"
          className="field-input"
          value={category}
          onChange={(e) => setCategory(e.target.value as FieldReportCategory)}
        >
          {CATEGORIES.map((c) => (
            <option key={c.value} value={c.value}>{c.label}</option>
          ))}
        </select>

        <label className="field-label" htmlFor="rf-severity">Severity</label>
        <select
          id="rf-severity"
          className="field-input"
          value={severity}
          onChange={(e) => setSeverity(e.target.value)}
        >
          {SEVERITIES.map((s) => (
            <option key={s} value={s}>{s[0].toUpperCase() + s.slice(1)}</option>
          ))}
        </select>

        <label className="field-label" htmlFor="rf-desc">Description</label>
        <textarea
          id="rf-desc"
          className="field-input"
          rows={3}
          maxLength={2000}
          placeholder="What did you observe on the ground?"
          value={description}
          onChange={(e) => setDescription(e.target.value)}
        />

        <label className="field-label" htmlFor="rf-photo">Photo (optional)</label>
        <input
          id="rf-photo"
          ref={fileRef}
          className="field-file"
          type="file"
          accept="image/jpeg,image/png,image/webp"
          onChange={onFileChange}
        />

        <button
          type="submit"
          className="report-submit"
          disabled={!draftLocation || submitting}
        >
          {submitting ? "Submitting…" : "Submit report"}
        </button>
        {message && <div className="report-ok">✓ {message}</div>}
      </form>
    </div>
  );
}
