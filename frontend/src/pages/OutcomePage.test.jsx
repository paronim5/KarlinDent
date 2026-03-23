import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import React from "react";
import OutcomePage from "./OutcomePage.jsx";

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
    t: (key) => {
      const map = {
        "outcome.history_title": "Expense History",
        "outcome.table.category": "Category",
        "outcome.table.amount": "Amount",
        "outcome.table.date": "Date",
        "outcome.table.vendor": "Vendor/Description",
        "outcome.errors.load_reference": "Unable to load categories",
        "outcome.errors.load_data": "Unable to load outcomes",
        "common.retry": "Retry",
        "common.delete": "Delete",
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

const sampleCategories = [
  { id: 1, name: "Supplies" },
  { id: 2, name: "Rent" },
];

const sampleOutcomes = [
  {
    id: 1,
    type: "outcome",
    category_id: 1,
    category_name: "Supplies",
    amount: 300,
    date: "2025-03-10",
    description: "Gloves and masks",
  },
  {
    id: 2,
    type: "outcome",
    category_id: 2,
    category_name: "Rent",
    amount: 15000,
    date: "2025-03-01",
    description: "March rent",
  },
];

beforeEach(() => {
  getMock.mockReset();
  deleteMock.mockReset();
  // OutcomePage calls /outcome/categories and /outcome/records
  getMock.mockImplementation((url) => {
    if (url.includes("/outcome/categories") || url.includes("/categories")) {
      return Promise.resolve(sampleCategories);
    }
    return Promise.resolve(sampleOutcomes);
  });
  localStorage.clear();
});

afterEach(() => cleanup());

// ── Tests ─────────────────────────────────────────────────────────

describe("OutcomePage", () => {
  test("renders category names from records", async () => {
    render(<OutcomePage />);
    await waitFor(() => {
      expect(screen.getByText("Supplies")).toBeTruthy();
      expect(screen.getByText("Rent")).toBeTruthy();
    });
  });

  test("renders an empty table body when no records returned", async () => {
    getMock.mockImplementation((url) => {
      if (url.includes("categor")) return Promise.resolve(sampleCategories);
      return Promise.resolve([]);
    });
    render(<OutcomePage />);
    await waitFor(() => {
      const rows = document.querySelectorAll("tbody tr");
      expect(rows.length).toBe(0);
    });
  });

  test("shows system error when API fails", async () => {
    getMock.mockRejectedValue(new Error("server down"));
    render(<OutcomePage />);
    await waitFor(() => {
      const errorEl = document.querySelector(".form-error");
      expect(errorEl).toBeTruthy();
      expect(errorEl.textContent).toContain("server down");
    });
  });

  test("renders a delete (✕) button for each outcome record", async () => {
    render(<OutcomePage />);
    await waitFor(() => {
      // Each row has a ✕ button
      const deleteButtons = screen.getAllByText("✕");
      expect(deleteButtons.length).toBe(sampleOutcomes.length);
    });
  });

  test("clicking delete (✕) button calls delete API", async () => {
    deleteMock.mockResolvedValue({ status: "ok" });
    render(<OutcomePage />);
    await waitFor(() => screen.getAllByText("✕"));

    const deleteButtons = screen.getAllByText("✕");
    await userEvent.click(deleteButtons[0]);

    await waitFor(() => {
      expect(deleteMock).toHaveBeenCalled();
    });
  });

  test("registers a periodChanged listener on mount", async () => {
    // Verify the component makes API calls on mount, and listens to periodChanged
    const addEventSpy = vi.spyOn(window, "addEventListener");
    render(<OutcomePage />);
    await waitFor(() => {
      const calls = addEventSpy.mock.calls.map(([event]) => event);
      expect(calls).toContain("periodChanged");
    });
    addEventSpy.mockRestore();
  });
});
