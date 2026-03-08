import { cleanup, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, expect, test, vi } from "vitest";
import React from "react";
import AddOutcomePage from "./AddOutcomePage.jsx";

vi.mock("react-i18next", () => ({
  useTranslation: () => ({
    t: (key) => key
  })
}));

const getMock = vi.fn();
const postMock = vi.fn();

vi.mock("../api/client.js", () => ({
  useApi: () => ({
    get: getMock,
    post: postMock
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

const staffItems = [
  { id: 5, first_name: "Pasha", last_name: "Kosov", role: "assistant", base_salary: 200 }
];

beforeEach(() => {
  getMock.mockReset();
  postMock.mockReset();
  window.history.pushState({}, "", "/outcome/add");
});

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

test("prefills salary amount from timesheet calculation for non-doctor", async () => {
  window.history.pushState(
    {},
    "",
    "/outcome/add?tab=salary&staff_id=5&amount=2200&from=2026-03-01&to=2026-03-08"
  );
  getMock.mockImplementation((path) => {
    if (path === "/outcome/categories") return Promise.resolve([]);
    if (path === "/staff") return Promise.resolve(staffItems);
    if (path.startsWith("/staff/5/salary-estimate")) {
      return Promise.resolve({ estimated_total: 200, base_salary: 200, commission_rate: 0, total_revenue: 0, commission_part: 0 });
    }
    if (path.startsWith("/outcome/timesheets")) {
      return Promise.resolve([{ hours: 3 }, { hours: 8 }]);
    }
    return Promise.resolve([]);
  });

  render(<AddOutcomePage />);

  await waitFor(() => expect(screen.getByDisplayValue("2200.00")).toBeTruthy());
  expect(screen.getByText("11.00")).toBeTruthy();
});

test("shows empty amount when no hours in range", async () => {
  window.history.pushState(
    {},
    "",
    "/outcome/add?tab=salary&staff_id=5&from=2026-03-01&to=2026-03-08"
  );
  getMock.mockImplementation((path) => {
    if (path === "/outcome/categories") return Promise.resolve([]);
    if (path === "/staff") return Promise.resolve(staffItems);
    if (path.startsWith("/outcome/timesheets")) {
      return Promise.resolve([]);
    }
    if (path.startsWith("/staff/5/salary-estimate")) {
      return Promise.resolve({ estimated_total: 200, base_salary: 200, commission_rate: 0, total_revenue: 0, commission_part: 0 });
    }
    return Promise.resolve([]);
  });

  render(<AddOutcomePage />);

  await waitFor(() => expect(screen.getByText("No hours recorded for selected period.")).toBeTruthy());
  expect(screen.queryByDisplayValue("0.00")).toBeNull();
});
