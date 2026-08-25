import type { SosCollection, SosFeature, SosPriority } from "../types";
import { currentStatus } from "../sos/lifecycle";
import { useT } from "../i18n";
import type { TranslationKey } from "../i18n";

interface Props {
  sos: SosCollection | null;
  selectedSosId: number | null;
  onSelect: (id: number) => void;
}

const PRIORITY_COLOR: Record<SosPriority, string> = {
  P1: "#c62828",
  P2: "#ef6c00",
  P3: "#f9a825",
  P4: "#2e7d32",
};

const PRIORITY_RANK: Record<SosPriority, number> = { P1: 0, P2: 1, P3: 2, P4: 3 };

// Is the incident fully resolved (responder lifecycle reached RESOLVED)?
function isResolved(f: SosFeature): boolean {
  return f.properties.status === "assigned" && currentStatus(f.properties.assignment) === "RESOLVED";
}

// Operational sort: open incidents first, then by AI priority (P1→P4), then most
// recently reported first. Resolved incidents sink to the bottom.
function queueOrder(a: SosFeature, b: SosFeature): number {
  const ar = isResolved(a) ? 1 : 0;
  const br = isResolved(b) ? 1 : 0;
  if (ar !== br) return ar - br;
  const ap = PRIORITY_RANK[a.properties.priority] ?? 9;
  const bp = PRIORITY_RANK[b.properties.priority] ?? 9;
  if (ap !== bp) return ap - bp;
  // newest first (created_at is a server timestamp)
  return (Date.parse(b.properties.created_at) || 0) - (Date.parse(a.properties.created_at) || 0);
}

function timeLabel(iso: string): string {
  const d = new Date(iso);
  return Number.isNaN(d.getTime())
    ? "—"
    : d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}

// The status pill's translation key + CSS class: PENDING for unassigned,
// otherwise the responder lifecycle state (Assigned / Acknowledged / En route /
// On site / Resolved). The label itself is resolved through `t` in render.
function statusPill(f: SosFeature): { key: TranslationKey; cls: string } {
  if (f.properties.status === "pending") return { key: "status.pending", cls: "iq-st-pending" };
  const s = currentStatus(f.properties.assignment);
  return { key: `status.${s.toLowerCase()}` as TranslationKey, cls: `iq-st-${s.toLowerCase()}` };
}

// The SOS incident queue — the command center's operational worklist. Clicking a
// row selects the incident (same selection the map marker drives), so it feeds
// the detail panel on the right. Derived entirely from the live feed.
export default function IncidentQueue({ sos, selectedSosId, onSelect }: Props) {
  const { t } = useT();
  const features = [...(sos?.features ?? [])].sort(queueOrder);

  return (
    <div className="panel incident-queue">
      <div className="panel-title">
        {t("queue.title")}
        <span className="count-pill">{features.length}</span>
      </div>

      {features.length === 0 ? (
        <div className="empty">{t("queue.empty")}</div>
      ) : (
        <div className="iq-list">
          {features.map((f) => {
            const p = f.properties;
            const active = p.id === selectedSosId;
            const resolved = isResolved(f);
            const pill = statusPill(f);
            const place = p.risk?.zone_name ?? `${p.lat.toFixed(3)}, ${p.lon.toFixed(3)}`;
            return (
              <button
                key={p.id}
                type="button"
                className={`iq-row ${active ? "active" : ""} ${resolved ? "resolved" : ""}`}
                style={{ borderLeftColor: PRIORITY_COLOR[p.priority] ?? "#607d8b" }}
                onClick={() => onSelect(p.id)}
              >
                <div className="iq-top">
                  <span className="iq-id">#{p.id}</span>
                  <span
                    className="iq-pri"
                    style={{ background: PRIORITY_COLOR[p.priority] ?? "#607d8b" }}
                  >
                    {p.priority}
                  </span>
                  <span className={`iq-st ${pill.cls}`}>{t(pill.key)}</span>
                  {p.escalation && (
                    <span className="iq-esc" title={t("queue.escalated")}>
                      ⇧ ESC
                    </span>
                  )}
                  <span className="iq-time">{timeLabel(p.created_at)}</span>
                </div>
                <div className="iq-place">{place}</div>
                <div className="iq-flags">
                  <span>👥 {p.people_affected}</span>
                  {p.trapped && <span className="iq-flag-hot">⚠ {t("queue.trapped")}</span>}
                  {p.medical && <span className="iq-flag-hot">✚ {t("queue.medical")}</span>}
                </div>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
