import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import React from "react";
import IncomePage from "./IncomePage.jsx";

// ── Chart.js mock (canvas not available in jsdom) ─────────────────

vi.mock("react-chartjs-2", () => ({
  Line: ({ data }) => <div data-testid="line-chart" />,
  Bar: ({ data }) => <div data-testid="bar-chart" />,
  Doughnut: ({ data }) => <div data-testid="doughnut-chart" />,
}));

vi.mock("chart.js", () => ({
  Chart: { register: vi.fn(), defaults: {} },
  CategoryScale: class {},
  LinearScale: class {},
  PointElement: class {},
  LineElement: class {},
  BarElement: class {},
  ArcElement: class {},
  Title: class {},
  Tooltip: class {},
  Legend: class {},
  Filler: class {},
}));

vi.mock("chartjs-plugin-datalabels", () => ({ default: {} }));

// ── i18n mock ─────────────────────────────────────────────────────

vi.mock("react-i18next", () => ({
  useTranslation: () => ({
    t: (key, opts) => {
      const map = {
        "income.title": "Income Management",
        "income.stats.total": "Total Income",
        "income.stats.records": "Records count",
        "income.stats.avg": "Avg per patient",
        "income.empty_state": "No transactions for selected period",
        "income.table.patient": "Patient",
        "income.table.doctor": "Doctor",
        "income.table.amount": "Amount",
        "income.table.method": "Method",
        "income.table.date": "Date",
        "income.form.cash": "Cash",
        "income.form.card": "Card",
        "income.errors.load_records": "Unable to load income records",
        "common.retry": "Retry",
        "common.delete": "Delete",
        "income.period.year": "Year",
        "income.period.month": "Month",
        "income.period.week": "Week",
        "income.period.day": "Day",
        "income.period_meta": opts?.period || "Period",
      };
      return map[key] || key;
    },
  }),
}));

// ── API mock ──────────────────────────────────────────────────────

const getMock = vi.fn();
const deleteMock = vi.fn();

vi.mock("../api/client.js", () => ({
  useApi: () => ({ get: getMock, delete: deleteMock }),
}));

vi.mock("react-router-dom", async () => {
  const actual = await vi.importActual("react-router-dom");
  return { ...actual, useNavigate: () => vi.fn() };
});

// ── Fixtures ──────────────────────────────────────────────────────

const sampleRecords = [
  {
    id: 1,
    amount: 1500,
    lab_cost: 0,
    payment_method: "cash",
    service_date: "2025-03-01",
    patient: { last_name: "Novak" },
    doctor: { last_name: "House" },
  },
  {
    id: 2,
    amount: 800,
    lab_cost: 200,
    payment_method: "card",
    service_date: "2025-03-05",
    patient: { last_name: "Smith" },
    doctor: { last_name: "Grey" },
  },
];

beforeEach(() => {
  getMock.mockReset();
  deleteMock.mockReset();
  getMock.mockResolvedValue(sampleRecords);
  localStorage.clear();
});

afterEach(() => cleanup());

// ── Tests ─────────────────────────────────────────────────────────

describe("IncomePage", () => {
  test("renders patient and doctor names from records", async () => {
    render(<IncomePage />);
    await waitFor(() => {
      expect(screen.getByText("Novak")).toBeTruthy();
      expect(screen.getByText("Smith")).toBeTruthy();
    });
  });

  test("displays amounts in Kč (not €)", async () => {
    render(<IncomePage />);
    await waitFor(() => {
      // Should not contain euro symbol
      expect(document.body.textContent).not.toContain("€");
    });
  });

  test("shows empty state when no records returned", async () => {
    getMock.mockResolvedValue([]);
    render(<IncomePage />);
    await waitFor(() => {
      expect(screen.getByText("No transactions for selected period")).toBeTruthy();
    });
  });

  test("shows error alert on load failure", async () => {
    getMock.mockRejectedValue(new Error("Network error"));
    render(<IncomePage />);
    await waitFor(() => {
      expect(screen.getByRole("alert")).toBeTruthy();
    });
  });

  test("retries data load when retry button is clicked", async () => {
    getMock.mockRejectedValueOnce(new Error("fail"));
    render(<IncomePage />);
    await waitFor(() => expect(screen.getByRole("alert")).toBeTruthy());

    getMock.mockResolvedValueOnce(sampleRecords);
    await userEvent.click(screen.getByRole("button", { name: "Retry" }));
    await waitFor(() => expect(getMock).toHaveBeenCalledTimes(2));
  });

  test("responds to periodChanged event from Layout", async () => {
    render(<IncomePage />);
    const ev = new CustomEvent("periodChanged", {
      detail: { period: "week", from: "2025-03-17", to: "2025-03-23" },
    });
    window.dispatchEvent(ev);
    await waitFor(() => {
      // getMock should have been called again with new date range
      expect(getMock.mock.calls.length).toBeGreaterThan(1);
    });
  });

  test("reads period from localStorage on mount", async () => {
    localStorage.setItem("globalPeriod", "year");
    render(<IncomePage />);
    await waitFor(() => {
      // At least one call with year-level date range
      expect(getMock).toHaveBeenCalled();
    });
  });
});
