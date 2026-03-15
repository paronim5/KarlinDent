import { cleanup, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, expect, test, vi } from "vitest";
import React from "react";
import DoctorPage from "./DoctorPage.jsx";

const getMock = vi.fn();

vi.mock("../api/client.js", () => ({
  useApi: () => ({
    get: getMock
  })
}));

vi.mock("react-router-dom", async () => {
  const actual = await vi.importActual("react-router-dom");
  return {
    ...actual,
    useParams: () => ({ id: "9" })
  };
});

vi.mock("react-chartjs-2", () => ({
  Line: ({ data }) => <div data-testid="line-labels">{(data?.labels || []).join("|")}</div>
}));

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

const buildHourly = () =>
  Array.from({ length: 24 }, (_, hour) => ({
    hour,
    label: `${hour}:00`,
    total_income: hour === 10 ? 1200 : 0,
    total_commission: hour === 10 ? 360 : 0,
    patient_count: hour === 10 ? 2 : 0
  }));

const mockApi = async (path) => {
  if (path.includes("/income/doctor/9/overview")) {
    return { lifetime: { patient_count: 12, total_income: 10000, total_commission: 3000, avg_commission_per_patient: 250 } };
  }
  if (path.includes("/income/doctor/9/commissions?")) {
    return {
      patients: [
        {
          name: "Alice Blue",
          treatments: [
            { id: 1, service_date: "2026-03-01", service_time: "10:00", amount: 100, commission: 30, note: "" },
            { id: 3, service_date: "2026-03-14", service_time: "09:00", amount: 200, commission: 60, note: "" }
          ]
        },
        {
          name: "Bob Green",
          treatments: [
            { id: 2, service_date: "2026-03-12", service_time: "15:00", amount: 140, commission: 42, note: "" }
          ]
        }
      ],
      totals: { patient_count: 2, treatment_count: 3, total_commission: 132 }
    };
  }
  if (path.includes("/income/doctor/9/commission/stats?")) {
    return {
      doctor: { commission_rate: 0.3 },
      totals: { total_income: 3000, total_commission: 900, treatment_count: 5, patient_count: 3 },
      latest_payment: { payment_date: "2026-03-05", commission_rate: 0.3, total_commission: 500 },
      current_day: { date: "2026-03-14", total_income: 1200, total_commission: 360 },
      since_last_payment: { from_date: "2026-03-05", total_income: 2600, total_commission: 780, treatment_count: 4, patient_count: 3 }
    };
  }
  if (path.includes("/income/doctor/9/summary/hourly?")) {
    return { date: "2026-03-14", hours: buildHourly() };
  }
  if (path.includes("/income/doctor/9/summary/daily?")) {
    return [
      { day: "2026-03-10", total_income: 300, total_commission: 90 },
      { day: "2026-03-11", total_income: 200, total_commission: 60 },
      { day: "2026-03-12", total_income: 250, total_commission: 75 },
      { day: "2026-03-13", total_income: 280, total_commission: 84 },
      { day: "2026-03-14", total_income: 320, total_commission: 96 }
    ];
  }
  if (path.includes("/staff/9/documents?")) {
    return [];
  }
  throw new Error(`Unhandled path: ${path}`);
};

beforeEach(() => {
  ensureLocalStorage();
  localStorage.clear();
  localStorage.setItem("globalPeriod", "week");
  getMock.mockReset();
  getMock.mockImplementation(mockApi);
});

afterEach(() => {
  cleanup();
});

test("updates x-axis labels when switching week and day views", async () => {
  render(<DoctorPage />);
  await waitFor(() => expect(screen.getByTestId("line-labels").textContent).toContain("Monday|Tuesday|Wednesday|Thursday|Friday|Saturday|Sunday"));

  window.dispatchEvent(
    new CustomEvent("periodChanged", {
      detail: { period: "month", from: "2026-03-01", to: "2026-03-31" }
    })
  );

  await waitFor(() => expect(screen.getByTestId("line-labels").textContent).toContain("January|February|March|April"));

  window.dispatchEvent(
    new CustomEvent("periodChanged", {
      detail: { period: "day", from: "2026-03-14", to: "2026-03-14" }
    })
  );

  await waitFor(() => expect(screen.getByTestId("line-labels").textContent).toContain("0h|1h|2h|3h"));
});

test("renders dashboard-style graph shell with matching controls", async () => {
  render(<DoctorPage />);
  await waitFor(() => expect(screen.getByText("Daily Income vs Outcome")).toBeTruthy());
  expect(screen.getByText("INCOME")).toBeTruthy();
  expect(screen.getByText("OUTCOME")).toBeTruthy();
});

test("shows day earnings only in day view and since-last-payment totals", async () => {
  render(<DoctorPage />);

  await waitFor(() => expect(screen.getByText("Current day earnings: available in Day view")).toBeTruthy());
  expect(screen.getByText(/Total earnings since last salary payment/)).toBeTruthy();

  window.dispatchEvent(
    new CustomEvent("periodChanged", {
      detail: { period: "day", from: "2026-03-14", to: "2026-03-14" }
    })
  );

  await waitFor(() => expect(screen.getByText(/Current day earnings \(2026-03-14\):/)).toBeTruthy());
});

test("sorts patient commission rows by most recent date first", async () => {
  render(<DoctorPage />);
  await waitFor(() => expect(screen.getByText("Patient Commissions")).toBeTruthy());

  const panel = screen.getByText("Patient Commissions").closest(".panel");
  const dateCells = Array.from(panel.querySelectorAll("tbody tr td:nth-child(2)")).map((cell) => cell.textContent?.trim()).filter(Boolean);
  expect(dateCells[0]).toBe("2026-03-14");
  expect(dateCells[1]).toBe("2026-03-12");
  expect(dateCells[2]).toBe("2026-03-01");
});
