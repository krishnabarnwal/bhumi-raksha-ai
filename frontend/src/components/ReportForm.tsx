import { useRef, useState } from "react";
import { api } from "../api";
import type { Feature, FieldReportCategory } from "../types";
import { useT } from "../i18n";
import type { TranslationKey } from "../i18n";

interface ReportFormProps {
  locating: boolean;
  draftLocation: { lat: number; lon: number } | null;
  onStartLocating: () => void;
  onCancelLocating: () => void;
  onSubmitted: (feature: Feature) => void;
  onError: (msg: string) => void;
}

// value → translation key (the enum value is what the API stores; the label is
// localised for display only).
const CATEGORIES: { value: FieldReportCategory; label: TranslationKey }[] = [
  { value: "slope_crack", label: "cat.slope_crack" },
  { value: "rockfall", label: "cat.rockfall" },
  { value: "water_seepage", label: "cat.water_seepage" },
  { value: "slope_movement", label: "cat.slope_movement" },
  { value: "road_blockage", label: "cat.road_blockage" },
  { value: "landslide", label: "cat.landslide" },
  { value: "other", label: "cat.other" },
];

const SEVERITIES: { value: string; label: TranslationKey }[] = [
  { value: "low", label: "sev.low" },
  { value: "medium", label: "sev.medium" },
  { value: "high", label: "sev.high" },
];

// Client-side pre-check mirrors the server allow-list (§14) for fast feedback;
// the backend re-validates type, size and magic bytes regardless.
const ALLOWED_TYPES = ["image/jpeg", "image/png", "image/webp"];
const MAX_BYTES = 8 * 1024 * 1024;

export default function ReportForm(props: ReportFormProps) {
  const { locating, draftLocation } = props;
  const { t } = useT();
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
      setMessage(
        t("report.submitted", { id: feature.id ?? "", photo: file ? t("report.withPhoto") : "" }),
      );
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
        {t("report.title")}
        <span className="hint">{t("report.hint")}</span>
      </div>

      <form className="report-form" onSubmit={submit}>
        <label className="field-label">{t("report.location")}</label>
        <div className="locate-row">
          <button
            type="button"
            className={`locate-btn ${locating ? "active" : ""}`}
            onClick={locating ? props.onCancelLocating : props.onStartLocating}
          >
            {locating
              ? t("report.clickMap")
              : draftLocation
                ? t("report.repick")
                : t("report.pickOnMap")}
          </button>
          {locating && (
            <button type="button" className="locate-cancel" onClick={props.onCancelLocating}>
              {t("report.cancel")}
            </button>
          )}
        </div>
        <div className="locate-coords">
          {draftLocation
            ? `${draftLocation.lat.toFixed(4)}, ${draftLocation.lon.toFixed(4)}`
            : t("report.noLocation")}
        </div>

        <label className="field-label" htmlFor="rf-category">{t("report.type")}</label>
        <select
          id="rf-category"
          className="field-input"
          value={category}
          onChange={(e) => setCategory(e.target.value as FieldReportCategory)}
        >
          {CATEGORIES.map((c) => (
            <option key={c.value} value={c.value}>{t(c.label)}</option>
          ))}
        </select>

        <label className="field-label" htmlFor="rf-severity">{t("report.severity")}</label>
        <select
          id="rf-severity"
          className="field-input"
          value={severity}
          onChange={(e) => setSeverity(e.target.value)}
        >
          {SEVERITIES.map((s) => (
            <option key={s.value} value={s.value}>{t(s.label)}</option>
          ))}
        </select>

        <label className="field-label" htmlFor="rf-desc">{t("report.description")}</label>
        <textarea
          id="rf-desc"
          className="field-input"
          rows={3}
          maxLength={2000}
          placeholder={t("report.descPlaceholder")}
          value={description}
          onChange={(e) => setDescription(e.target.value)}
        />

        <label className="field-label" htmlFor="rf-photo">{t("report.photo")}</label>
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
          {submitting ? t("report.submitting") : t("report.submit")}
        </button>
        {message && <div className="report-ok">✓ {message}</div>}
      </form>
    </div>
  );
}
