let loading: Promise<void> | null = null;

export async function ensureCalcite(): Promise<void> {
  if (typeof window === "undefined") return;
  if (customElements.get("calcite-button")) return;
  if (loading) return loading;

  loading = (async () => {
    const [{ setAssetPath }, { defineCustomElements }] = await Promise.all([
      import("@esri/calcite-components"),
      import("@esri/calcite-components/loader"),
    ]);
    // Correct CDN path (no doubled /assets/assets)
    setAssetPath("https://cdn.jsdelivr.net/npm/@esri/calcite-components@3.3.3/dist/calcite/assets");
    defineCustomElements();
    // Keep light theme — do not force dark
    document.documentElement.classList.remove("calcite-mode-dark");
    document.documentElement.classList.add("calcite-mode-light");
  })();

  return loading;
}
