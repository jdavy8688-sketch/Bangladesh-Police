import type { DOMAttributes, HTMLAttributes } from "react";

type CalciteAttrs = HTMLAttributes<HTMLElement> &
  DOMAttributes<HTMLElement> & {
    class?: string;
    appearance?: string;
    kind?: string;
    scale?: string;
    slot?: string;
    icon?: string;
    iconStart?: string;
    iconEnd?: string;
    disabled?: boolean | "";
    checked?: boolean | "";
    selected?: boolean | "";
    open?: boolean | "";
    loading?: boolean | "";
    closable?: boolean | "";
    expanded?: boolean | "";
    compact?: boolean | "";
    label?: string;
    value?: string | number;
    layout?: string;
    alignment?: string;
    width?: string;
    heading?: string;
    description?: string;
    placeholder?: string;
    name?: string;
    status?: string;
    selectionMode?: string;
    overlayPositioning?: string;
    position?: string;
    closed?: boolean | "";
    iconFlipRtl?: string;
    textEnabled?: boolean | "";
    [key: string]: unknown;
  };

declare module "react" {
  namespace JSX {
    interface IntrinsicElements {
      "calcite-action": CalciteAttrs;
      "calcite-action-bar": CalciteAttrs;
      "calcite-alert": CalciteAttrs;
      "calcite-block": CalciteAttrs;
      "calcite-button": CalciteAttrs;
      "calcite-checkbox": CalciteAttrs;
      "calcite-chip": CalciteAttrs;
      "calcite-chip-group": CalciteAttrs;
      "calcite-icon": CalciteAttrs;
      "calcite-input": CalciteAttrs;
      "calcite-label": CalciteAttrs;
      "calcite-loader": CalciteAttrs;
      "calcite-notice": CalciteAttrs;
      "calcite-option": CalciteAttrs;
      "calcite-panel": CalciteAttrs;
      "calcite-radio-button": CalciteAttrs;
      "calcite-radio-button-group": CalciteAttrs;
      "calcite-select": CalciteAttrs;
      "calcite-switch": CalciteAttrs;
      "calcite-tab": CalciteAttrs;
      "calcite-tab-nav": CalciteAttrs;
      "calcite-tab-title": CalciteAttrs;
      "calcite-tabs": CalciteAttrs;
      "calcite-tooltip": CalciteAttrs;
    }
  }
}

export {};
