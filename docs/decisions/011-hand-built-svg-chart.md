# 011. Hand-built SVG chart

Status: accepted, 2026-11-06. Decided by: the builder.

## Context

Trends needs one simple line of scores. The prototype used Chart.js. The bundle budget is 170 KB gzipped, the CSP is strict, and the chart must work with screen readers and in both themes.

## Decision

A small React component, [TrendChart.tsx](../../apps/web/src/ui/TrendChart.tsx), draws an SVG. It has `role="img"`, a title, a one-sentence description of what it shows, and a real table alternative. Band names are in text, and colours come from theme tokens.

## Alternatives

- **Chart.js.** A canvas, so it needs a separate accessibility layer, and it adds bundle weight for features not used.
- **Recharts or similar.** More weight and dependencies for one line.
- **Table only.** Accessible, but a shape over time is what the screen is for.

## Consequences

- No chart dependency to audit or update.
- It fits the CSP, and themes follow CSS variables.
- About 130 lines to own. New chart types would need more code or a rethink.
- No tooltips, zoom or per-point focus. The table and list cover the same data.
