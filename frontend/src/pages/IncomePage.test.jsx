import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, expect, test, vi } from "vitest";
import React from "react";
import IncomePage from "./IncomePage.jsx";

const tMap = {
  "income.period.year": "Year",
  "income.period.month": "Month",
  "income.period.week": "Week",
  "income.period.day": "Day",
  "income.period_selector": "Time period selector",
  "income.period_meta": "Period",
  "common.retry": "Retry",
  "income.title": "Income Management",
  "income.stats.total": "Total Income",
  "income.stats.records": "Records count",
  "income.stats.avg": "Avg per patient",
  "income.empty_state": "No transactions for selected period",
  "income.table.patient": "Patient",
  "income.table.doctor": "Doctor",
  "income.table.amount": "Amount",
  "income.form.lab_cost": "Lab Cost",
  "income.table.method": "Method",
  "income.table.date": "Date",
  "common.delete": "Delete",
  "income.form.cash": "Cash",
  "income.form.card": "Card",
  "income.errors.load_records": "Unable to load income records"
};

vi.mock("react-i18next", () => ({
  useTranslation: () => ({
    t: (key, options) => {
      if (key === "income.period_meta") {
        return options?.period || "Period";
      }
      return tMap[key] || key;
    }
  })
}));

const getMock = vi.fn();
const deleteMock = vi.fn();

vi.mock("../api/client.js", () => ({
  useApi: () => ({
    get: getMock,
    delete: deleteMock
  })
}));

const navigateMock = vi.fn();
vi.mock("react-router-dom", async () => {
  const actual = await vi.importActual("react-router-dom");
  return {
    ...actual,
    useNavigate: () => navigateMock
  };
});

const sampleRecords = [
  {
    id: 1,
    amount: 100,
    lab_cost: 0,
    payment_method: "cash",
    service_date: "2025-01-01",
    patient: { last_name: "Smith" },
    doctor: { last_name: "House" }
  }
];

const ensureLocalStorage = () => {
  if (globalThis.localStorage) return;
  let store = {};
  globalThis.localStorage = {
    getItem: (key) => (key in store ? store[key] : null),
    setItem: (key, value) => {
      store[key] = String(value);
    },
    removeItem: (key) => {
      delete store[key];
    },
    clear: () => {
      store = {};
    }
  };
};

beforeEach(() => {
  ensureLocalStorage();
  getMock.mockReset();
  deleteMock.mockReset();
  getMock.mockResolvedValue(sampleRecords);
  localStorage.clear();
});

afterEach(() => {
  cleanup();
});

test("loads period from storage and updates meta", async () => {
  localStorage.setItem("globalPeriod", "year");
  render(<IncomePage />);
  expect(screen.getAllByText("Year").length).toBeGreaterThan(0);
});

test("updates period on global event", async () => {
  render(<IncomePage />);
  const ev = new CustomEvent("periodChanged", { detail: { period: "week", from: "2025-01-01", to: "2025-01-07" } });
  window.dispatchEvent(ev);
  await waitFor(() => expect(screen.getAllByText("Week").length).toBeGreaterThan(0));
});

test("shows error and retries data load", async () => {
  getMock.mockRejectedValueOnce(new Error("Network error"));
  render(<IncomePage />);

  await waitFor(() => expect(screen.getByRole("alert")).toBeTruthy());
  const retryButton = screen.getByRole("button", { name: "Retry" });

  getMock.mockResolvedValueOnce(sampleRecords);
  await userEvent.click(retryButton);
  await waitFor(() => expect(getMock).toHaveBeenCalledTimes(2));
});
