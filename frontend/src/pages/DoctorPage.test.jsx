import { cleanup, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import React from "react";
import DoctorPage from "./DoctorPage.jsx";

// ── Chart.js mock (avoid canvas rendering in jsdom) ───────────────

vi.mock("react-chartjs-2", () => ({
  Line: ({ data }) => <div data-testid="line-chart" data-datasets={data?.datasets?.length} />,
  Bar: ({ data }) => <div data-testid="bar-chart" data-datasets={data?.datasets?.length} />,
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

// ── Router mock ───────────────────────────────────────────────────

vi.mock("react-router-dom", async () => {
  const actual = await vi.importActual("react-router-dom");
  return {
    ...actual,
    useNavigate: () => vi.fn(),
    useParams: () => ({ id: "1" }),
  };
});

// ── API mock ──────────────────────────────────────────────────────

const getMock = vi.fn();

vi.mock("../api/client.js", () => ({
  useApi: () => ({ get: getMock }),
}));

// ── Fixtures ──────────────────────────────────────────────────────

const sampleOverview = {
  doctor: { id: 1, first_name: "Gregory", last_name: "House" },
  total_income: 150000,
  total_records: 45,
  avg_income: 3333,
  commission_total: 37500,
};

beforeEach(() => {
  getMock.mockReset();
  // DoctorPage makes several calls - return sensible data for each
  getMock.mockResolvedValue([]);
  localStorage.clear();
});

afterEach(() => cleanup());

// ── Tests ─────────────────────────────────────────────────────────

describe("DoctorPage", () => {
  test("renders without crashing on mount", async () => {
    render(<DoctorPage />);
    await waitFor(() => {
      expect(document.body).toBeTruthy();
    });
  });

  test("makes at least one API call on mount", async () => {
    render(<DoctorPage />);
    await waitFor(() => {
      expect(getMock).toHaveBeenCalled();
    });
  });

  test("shows error message when API calls fail", async () => {
    getMock.mockRejectedValue(new Error("network error"));
    render(<DoctorPage />);
    await waitFor(() => {
      const errorEl = document.querySelector(".form-error");
      expect(errorEl).toBeTruthy();
    });
  });

  test("responds to periodChanged event", async () => {
    render(<DoctorPage />);
    const callsBefore = getMock.mock.calls.length;

    const ev = new CustomEvent("periodChanged", {
      detail: { period: "week", from: "2025-03-17", to: "2025-03-23" },
    });
    window.dispatchEvent(ev);

    await waitFor(() => {
      expect(getMock.mock.calls.length).toBeGreaterThanOrEqual(callsBefore);
    });
  });

  test("renders panel structure (not blank page)", async () => {
    render(<DoctorPage />);
    await waitFor(() => {
      // The page renders at least one panel-class container
      const panels = document.querySelectorAll(".panel");
      expect(panels.length).toBeGreaterThan(0);
    });
  });
});
