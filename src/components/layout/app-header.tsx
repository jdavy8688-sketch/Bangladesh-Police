import { getAppConfig } from "@/config/app-config";
import { LocationFilters } from "@/components/filters/location-filters";
import { UserButton } from "@/lib/auth/gates";
import { authEnabled } from "@/lib/auth/client";
import { useUiStore } from "@/store/ui-store";

export function AppHeader() {
  const config = getAppConfig();
  const kicker = config.orgLabel?.trim();
  const setDataUpdateOpen = useUiStore((s) => s.setDataUpdateWindowOpen);

  return (
    <header className="app-header app-header-with-filters">
      <div className="brand">
        <img
          className="brand-logo"
          src="/favicon.svg"
          alt="Bangladesh Police"
          width={40}
          height={40}
        />
        <div className="brand-copy">
          {kicker ? <p className="brand-kicker">{kicker}</p> : null}
          <h1>{config.title}</h1>
          {config.subtitle ? <p className="brand-sub">{config.subtitle}</p> : null}
        </div>
      </div>
      <div className="header-right-cluster">
        <div className="header-filters-wrap">
          <LocationFilters variant="header" />
        </div>
        <div className="header-actions">
          <button
            type="button"
            className="header-menu-btn"
            title="Manage Data"
            aria-label="Manage Data"
            onClick={() => setDataUpdateOpen(true)}
          >
            <calcite-icon icon="table" scale="s" />
            <span>Manage Data</span>
          </button>
          {authEnabled ? (
            <div className="header-user">
              <UserButton />
            </div>
          ) : null}
        </div>
      </div>
    </header>
  );
}
