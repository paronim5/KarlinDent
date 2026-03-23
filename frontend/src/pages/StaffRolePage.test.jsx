import { cleanup, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import React from "react";
import StaffRolePage from "./StaffRolePage.jsx";

// ── Chart.js mock ─────────────────────────────────────────────────

vi.mock("react-chartjs-2", () => ({
  Line: () => <div data-testid="line-chart" />,
  Bar: () => <div data-testid="bar-chart" />,
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
        "staff.title": "Staff Management",
        "staff.edit": "Edit",
        "staff.save": "Save",
        "staff.cancel": "Cancel",
        "staff_role.errors.load_timesheets": "Unable to load timesheets",
        "staff_role.errors.staff_not_found": "Staff not found",
        "staff_role.errors.invalid_staff": "Invalid staff",
        "staff_role.errors.timesheets_unavailable": "Timesheets unavailable",
        "staff_role.errors.load_documents": "Unable to load documents",
        "common.retry": "Retry",
      };
      return map[key] || key;
    },
  }),
}));

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
const postMock = vi.fn();
const putMock = vi.fn();
const deleteMock = vi.fn();

vi.mock("../api/client.js", () => ({
  useApi: () => ({ get: getMock, post: postMock, put: putMock, delete: deleteMock }),
}));

// ── Fixtures ──────────────────────────────────────────────────────

const sampleStaff = [
  { id: 1, first_name: "Jan", last_name: "Novak", role_id: 1, role: "doctor", role_name: "doctor", commission_rate: 0.25, base_salary: 50000, weekend_salary: 200 },
  { id: 2, first_name: "Anna", last_name: "Smith", role_id: 2, role: "nurse", role_name: "nurse", commission_rate: 0, base_salary: 35000, weekend_salary: 200 },
];

beforeEach(() => {
  getMock.mockReset();
  postMock.mockReset();
  putMock.mockReset();
  deleteMock.mockReset();

  // Return staff list for /staff, empty array for schedule/documents
  getMock.mockImplementation((url) => {
    if (url.startsWith("/staff") && !url.includes("documents")) {
      return Promise.resolve(sampleStaff);
    }
    return Promise.resolve([]);
  });

  localStorage.clear();
});

afterEach(() => cleanup());

// ── Tests ─────────────────────────────────────────────────────────

describe("StaffRolePage", () => {
  test("renders salary summary panel on mount", async () => {
    render(<StaffRolePage />);
    await waitFor(() => {
      // Page renders salary summary hardcoded text
      expect(screen.getByText(/Weekday Hours/i)).toBeTruthy();
    });
  });

  test("renders page without crashing when schedule is empty", async () => {
    render(<StaffRolePage />);
    await waitFor(() => {
      expect(document.body).toBeTruthy();
      // No unhandled crash — panel structure should exist
      const panels = document.querySelectorAll(".panel");
      expect(panels.length).toBeGreaterThan(0);
    });
  });

  test("shows error message when API fails", async () => {
    getMock.mockRejectedValue(new Error("Network error"));
    render(<StaffRolePage />);
    await waitFor(() => {
      // Error is rendered in a form-error div
      const errorEl = document.querySelector(".form-error");
      expect(errorEl).toBeTruthy();
    });
  });

  test("loads staff API on mount", async () => {
    render(<StaffRolePage />);
    await waitFor(() => {
      expect(getMock).toHaveBeenCalled();
      const urls = getMock.mock.calls.map((c) => c[0]);
      expect(urls.some((u) => u.startsWith("/staff"))).toBe(true);
    });
  });

  test("loads schedule for the given staff id", async () => {
    render(<StaffRolePage />);
    await waitFor(() => {
      const urls = getMock.mock.calls.map((c) => c[0]);
      expect(urls.some((u) => u.includes("staff_id=1") || u.includes("/schedule"))).toBe(true);
    });
  });
});
