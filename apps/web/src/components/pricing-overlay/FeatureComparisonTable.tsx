import { CheckCircle, CloseCircle } from "@solar-icons/react";

import { cn } from "@/lib/utils";

import { FEATURE_COMPARISON } from "./pricing-data";

function CellValue({ value }: { value: boolean | string }) {
  if (typeof value === "string") {
    return <span className="text-sm font-medium text-foreground">{value}</span>;
  }
  return value ? (
    <CheckCircle size={16} weight="Bold" className="text-success" />
  ) : (
    <CloseCircle
      size={16}
      weight="Bold"
      className="text-neutral-300 dark:text-neutral-600"
    />
  );
}

export function FeatureComparisonTable() {
  return (
    <div className="overflow-x-auto rounded-lg border border-border">
      <table className="w-full text-left text-sm">
        <thead>
          <tr className="border-b border-border bg-muted/50">
            <th className="px-4 py-3 font-medium text-muted-foreground">
              Feature
            </th>
            <th className="px-4 py-3 text-center font-medium text-muted-foreground">
              Free
            </th>
            <th
              className={cn(
                "px-4 py-3 text-center font-medium",
                "text-pro-badge-bg",
              )}
            >
              Pro
            </th>
            <th
              className={cn(
                "px-4 py-3 text-center font-medium",
                "text-enterprise-badge-bg",
              )}
            >
              Enterprise
            </th>
          </tr>
        </thead>
        <tbody>
          {FEATURE_COMPARISON.map((row, i) => (
            <tr
              key={row.name}
              className={cn(
                "border-b border-border last:border-b-0",
                i % 2 === 0 ? "bg-transparent" : "bg-muted/25",
              )}
            >
              <td className="px-4 py-2.5 text-foreground">{row.name}</td>
              <td className="px-4 py-2.5 text-center">
                <span className="inline-flex justify-center">
                  <CellValue value={row.free} />
                </span>
              </td>
              <td className="px-4 py-2.5 text-center">
                <span className="inline-flex justify-center">
                  <CellValue value={row.pro} />
                </span>
              </td>
              <td className="px-4 py-2.5 text-center">
                <span className="inline-flex justify-center">
                  <CellValue value={row.enterprise} />
                </span>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
