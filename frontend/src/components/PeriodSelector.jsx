
import React, { useMemo } from "react";
import { useTranslation } from "react-i18next";

export default function PeriodSelector({
  value,
  onChange,
  options = ["day", "week", "month", "year"],
  availableYears = [],
  selectedYear,
  onYearChange,
}) {
  const { t } = useTranslation();

  const labels = useMemo(() => ({
    year: t("income.period.year", "Year"),
    month: t("income.period.month", "Month"),
    week: t("income.period.week", "Week"),
    day: t("income.period.day", "Day")
  }), [t]);

  const shortLabels = {
    year: "YE",
    month: "MO",
    week: "WE",
    day: "DA"
  };

  return (
    <div className="period-selector" style={{ display: "flex", flexDirection: "column", gap: 6, alignItems: "flex-end" }}>
      <div className="date-strip">
        {options.map(p => (
          <button
            key={p}
            className={`date-chip ${value === p ? "active" : ""}`}
            aria-label={t("income.period_selector", "Time period selector")}
            title={labels[p]}
            onClick={() => onChange(p)}
          >
            {shortLabels[p]}
          </button>
        ))}
      </div>

      {value === "year" && availableYears.length > 1 && (
        <div className="date-strip date-strip--years">
          {availableYears.map(yr => (
            <button
              key={yr}
              className={`date-chip ${selectedYear === yr ? "active" : ""}`}
              onClick={() => onYearChange && onYearChange(yr)}
            >
              {yr}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
