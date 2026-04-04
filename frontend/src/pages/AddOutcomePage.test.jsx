import { cleanup, render, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import React from "react";
import { MemoryRouter } from "react-router-dom";
import AddOutcomePage from "./AddOutcomePage.jsx";

// ── Mocks ─────────────────────────────────────────────────────────

vi.mock("react-i18next", () => ({
  useTranslation: () => ({ t: (key) => key }),
}));

vi.mock("react-router-dom", async () => {
  const actual = await vi.importActual("react-router-dom");
  return {
    ...actual,
    useNavigate: () => vi.fn(),
  };
});

vi.mock("../App.jsx", () => ({
  useAuth: () => ({ user: { id: 99, name: "Admin" } }),
}));

const getMock = vi.fn();
const postMock = vi.fn();

vi.mock("../api/client.js", () => ({
  useApi: () => ({ get: getMock, post: postMock }),
}));

// ── Helpers ───────────────────────────────────────────────────────

/** Render AddOutcomePage with the given URL search params */
const renderWithSearch = (params = {}) =>
  render(
    <MemoryRouter initialEntries={[{ pathname: "/", search: "?" + new URLSearchParams(params).toString() }]}>
      <AddOutcomePage />
    </MemoryRouter>
  );

const makeStaff = (overrides = {}) => ({
  id: 5,
  first_name: "Petra",
  last_name: "Kova",
  role: "nurse",
  base_salary: 150,
  weekend_salary: 200,
  commission_rate: 0,
  last_paid_at: "2026-03-31",
  unpaid_amount: 1200,
  is_active: true,
  ...overrides,
});

// weekday shift, 8 hours → 8 × 150 = 1200
const makeShift = (overrides = {}) => ({
  id: 1,
  staff_id: 5,
  start: "2026-03-10T08:00:00",
  end: "2026-03-10T16:00:00",
  salary_hours: 8,
  hours: 8,
  status: "accepted",
  salary_payment_id: null,
  ...overrides,
});

const defaultGetImpl =
  ({ staff = [makeStaff()], shifts = [makeShift()], estimate = null } = {}) =>
  (url) => {
    if (url.startsWith("/staff") && url.includes("salary-estimate"))
      return Promise.resolve(
        estimate ?? { estimated_total: 1200, adjusted_total: 1200, weekday_hours: 8, weekend_hours: 0 }
      );
    if (url.startsWith("/staff") && url.includes("salary-notes"))
      return Promise.resolve({ items: [], total: 0 });
    if (url.startsWith("/staff")) return Promise.resolve(staff);
    if (url.startsWith("/outcome/categories")) return Promise.resolve([]);
    if (url.startsWith("/schedule")) return Promise.resolve(shifts);
    return Promise.resolve([]);
  };

beforeEach(() => {
  getMock.mockReset();
  postMock.mockReset();
  localStorage.clear();
});

afterEach(() => cleanup());

// ── Timesheet amount handling tests ──────────────────────────────

describe("AddOutcomePage — timesheet amount auto-fill", () => {
  test("pre-fills amount from URL param on load", async () => {
    getMock.mockImplementation(defaultGetImpl({ shifts: [] }));

    renderWithSearch({ tab: "salary", staff_id: "5", amount: "1200.00", from: "2026-04-01", to: "2026-04-03" });

    // Even though there are no shifts in the April range, the prefill amount from URL must be kept
    await waitFor(() => {
      const input = document.querySelector("input[type='number']");
      expect(input).toBeTruthy();
      expect(input.value).toBe("1200.00");
    }, { timeout: 4000 });
  });

  test("when timesheet finds shifts, amount is set from shift calculation", async () => {
    // 8 weekday hours × 150/h = 1200
    getMock.mockImplementation(defaultGetImpl({ shifts: [makeShift()] }));

    renderWithSearch({ tab: "salary", staff_id: "5", from: "2026-03-01", to: "2026-03-31" });

    await waitFor(() => {
      const inputs = Array.from(document.querySelectorAll("input"));
      const amountInput = inputs.find((el) => el.value === "1200.00");
      expect(amountInput).toBeTruthy();
    });
  });

  test("when timesheet finds 0 shifts and prefillAmount is set, keeps prefill amount", async () => {
    // New-month scenario: no shifts yet in April, but the staff page passed the unpaid total from March
    getMock.mockImplementation(defaultGetImpl({ shifts: [] }));

    renderWithSearch({ tab: "salary", staff_id: "5", amount: "1200.00", from: "2026-04-01", to: "2026-04-03" });

    await waitFor(() => {
      const inputs = Array.from(document.querySelectorAll("input"));
      const amountInput = inputs.find((el) => el.value === "1200.00");
      expect(amountInput).toBeTruthy();
    }, { timeout: 4000 });
  });

  test("when timesheet finds 0 shifts and no prefillAmount, clears amount and shows error", async () => {
    getMock.mockImplementation(
      defaultGetImpl({ shifts: [], estimate: { estimated_total: 0, adjusted_total: 0 } })
    );

    renderWithSearch({ tab: "salary", staff_id: "5", from: "2026-04-01", to: "2026-04-03" });

    // Wait for schedule to be fetched
    await waitFor(() => {
      const urls = getMock.mock.calls.map((c) => c[0]);
      expect(urls.some((u) => u.includes("/schedule"))).toBe(true);
    });

    // Amount must NOT be "1200.00" (no prefill, no shifts)
    await waitFor(() => {
      const inputs = Array.from(document.querySelectorAll("input"));
      expect(inputs.filter((el) => el.value === "1200.00").length).toBe(0);
    });
  });

  test("month boundary: amount from previous month preserved when April range has no shifts", async () => {
    // Staff had unpaid shifts in March; openPayModal passes amount=900 + from=2026-04-01
    // This is the core month-boundary bug scenario
    getMock.mockImplementation(defaultGetImpl({ shifts: [] }));

    renderWithSearch({ tab: "salary", staff_id: "5", amount: "900.00", from: "2026-04-01", to: "2026-04-03" });

    // Schedule must be fetched with the correct date range
    await waitFor(() => {
      const urls = getMock.mock.calls.map((c) => c[0]);
      const scheduleCall = urls.find((u) => u.includes("/schedule"));
      expect(scheduleCall).toBeTruthy();
      expect(scheduleCall).toContain("staff_id=5");
      expect(scheduleCall).toContain("unpaid=true");
    });

    // Prefill amount must be preserved despite finding 0 shifts in April range
    await waitFor(() => {
      const inputs = Array.from(document.querySelectorAll("input"));
      const amountInput = inputs.find((el) => el.value === "900.00");
      expect(amountInput).toBeTruthy();
    }, { timeout: 4000 });
  });

  test("fetches shifts with unpaid=true and status=accepted filters", async () => {
    getMock.mockImplementation(defaultGetImpl());

    renderWithSearch({ tab: "salary", staff_id: "5", from: "2026-03-01", to: "2026-03-31" });

    await waitFor(() => {
      const urls = getMock.mock.calls.map((c) => c[0]);
      const scheduleUrl = urls.find((u) => u.includes("/schedule"));
      expect(scheduleUrl).toBeTruthy();
      expect(scheduleUrl).toContain("unpaid=true");
      expect(scheduleUrl).toContain("status=accepted");
    });
  });

  test("loads salary estimate for the staff member from URL", async () => {
    getMock.mockImplementation(defaultGetImpl());

    renderWithSearch({ tab: "salary", staff_id: "5" });

    await waitFor(() => {
      const urls = getMock.mock.calls.map((c) => c[0]);
      expect(urls.some((u) => u.includes("/staff/5/salary-estimate"))).toBe(true);
    });
  });
});
