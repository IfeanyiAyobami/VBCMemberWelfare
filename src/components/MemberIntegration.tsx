"use client";
import { useEffect, useState } from "react";
import type { JourneySnapshot } from "@/lib/journey/model";
export default function MemberIntegration({ memberId }: { memberId: string }) {
  const [data, setData] = useState<JourneySnapshot | null>(null),
    [status, setStatus] = useState(
      "Loading ministry and Home Cell involvement…",
    );
  useEffect(() => {
    let active = true;
    void (async () => {
      try {
        const r = await fetch(
          "/api/journey?memberId=" + encodeURIComponent(memberId),
          { cache: "no-store", signal: AbortSignal.timeout(20000) },
        );
        const x = await r.json();
        if (active) {
          if (r.ok) setData(x);
          else
            setStatus(
              r.status === 403
                ? "Journey access is required to view integration details."
                : "Integration details are temporarily unavailable.",
            );
        }
      } catch {
        if (active)
          setStatus("Integration details are temporarily unavailable.");
      }
    })();
    return () => {
      active = false;
    };
  }, [memberId]);
  const info = data?.detail;
  return (
    <section className="card" style={{ marginTop: 20 }}>
      <div className="card-pad">
        <h2>Ministry & Home Cell involvement</h2>
        {info ? (
          <>
            <p>
              Ministry teams:{" "}
              {(info.ministry || [])
                .filter((x) => x.active)
                .map(
                  (x) =>
                    x.team_name +
                    (x.responsibility ? " · " + x.responsibility : ""),
                )
                .join("; ") || "Not recorded"}
            </p>
            <p>
              Home Cell:{" "}
              {(info.home_cells || [])
                .filter((x) => x.active)
                .map((x) => x.cell_name + " · " + x.area_name)
                .join("; ") || "Not recorded"}
            </p>
          </>
        ) : (
          <p>{status}</p>
        )}
        <a
          className="btn"
          href={"/followups?person=" + memberId + "&tab=integration"}
        >
          Open involvement and history →
        </a>
      </div>
    </section>
  );
}
