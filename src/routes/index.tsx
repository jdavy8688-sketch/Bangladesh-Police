import { useEffect, useState, type ComponentType } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { getAppConfig } from "@/config/app-config";

export const Route = createFileRoute("/")({ component: Home });

function Home() {
  const [Workbench, setWorkbench] = useState<ComponentType | null>(null);

  useEffect(() => {
    let alive = true;
    import("@/components/layout/workbench").then((mod) => {
      if (alive) setWorkbench(() => mod.Workbench);
    });
    return () => {
      alive = false;
    };
  }, []);

  if (!Workbench) {
    return (
      <main className="splash">
        <span className="brand-mark" style={{ margin: "0 auto" }}>
          <svg width="22" height="22" viewBox="0 0 32 32" aria-hidden="true">
            <path
              d="M16 4.5 25 8.2v6.3c0 6.1-3.9 10.4-9 12-5.1-1.6-9-5.9-9-12V8.2L16 4.5z"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.8"
            />
          </svg>
        </span>
        <h1>{getAppConfig().title}</h1>
        <p>Loading workbench…</p>
      </main>
    );
  }

  return <Workbench />;
}
