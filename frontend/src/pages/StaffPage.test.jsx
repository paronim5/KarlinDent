import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import React from "react";
import StaffPage from "./StaffPage.jsx";

// ── Mocks ─────────────────────────────────────────────────────────

vi.mock("react-i18next", () => ({
  useTranslation: () => ({
    t: (key) => {
      const map = {
        "staff.title": "Staff",
        "staff.actions.pay": "Pay",
        "staff.actions.view": "View",
        "staff.actions.edit": "Edit",
        "staff.actions.add": "Add",
        "staff.stats.total_unpaid": "Total Unpaid",
        "staff.errors.load_staff": "Failed to load staff",
        "staff.table_meta.name": "Name",
        "staff.table_meta.role": "Role",
        "staff.table_meta.actions": "Actions",
        "staff.table_meta.unpaid": "Unpaid",
      };
      return map[key] || key;
    },
  }),
}));

const navigateMock = vi.fn();

vi.mock("react-router-dom", async () => {
  const actual = await vi.importActual("react-router-dom");
  return {
    ...actual,
    useNavigate: () => navigateMock,
  };
});

const getMock = vi.fn();
const postMock = vi.fn();
const putMock = vi.fn();
const deleteMock = vi.fn();

vi.mock("../api/client.js", () => ({
  useApi: () => ({ get: getMock, post: postMock, put: putMock, delete: deleteMock }),
}));

// ── Fixtures ──────────────────────────────────────────────────────

const makeStaff = (overrides = {}) => ({
  id: 2,
  first_name: "Jana",
  last_name: "Novakova",
  role: "nurse",
  base_salary: 150,
  weekend_salary: 200,
  commission_rate: 0,
  last_paid_at: null,
  total_revenue: 0,
  commission_income: 0,
  unpaid_amount: 0,
  is_active: true,
  ...overrides,
});

const defaultGetImpl = (staff) => (url) => {
  if (url.startsWith("/staff/roles")) return Promise.resolve([{ id: 1, name: "nurse" }]);
  if (url.startsWith("/staff/stats")) return Promise.resolve({ total_unpaid_salary: 0, total_worked_hours: 0 });
  if (url.startsWith("/staff/medicines") || url.includes("/medicines")) return Promise.resolve([]);
  if (url.startsWith("/staff")) return Promise.resolve(staff);
  return Promise.resolve([]);
};

beforeEach(() => {
  navigateMock.mockReset();
  getMock.mockReset();
  postMock.mockReset();
  putMock.mockReset();
  deleteMock.mockReset();
  localStorage.clear();
});

afterEach(() => cleanup());

// ── openPayModal tests ────────────────────────────────────────────

describe("StaffPage openPayModal", () => {
  test("navigates to /outcome/add with correct params for non-doctor with last_paid_at", async () => {
    const staff = [makeStaff({ unpaid_amount: 1250.50, last_paid_at: "2026-03-31" })];
    getMock.mockImplementation(defaultGetImpl(staff));

    render(<StaffPage />);
    await waitFor(() => expect(screen.getAllByText("Pay").length).toBeGreaterThan(0));

    await userEvent.click(screen.getAllByText("Pay")[0]);

    expect(navigateMock).toHaveBeenCalledOnce();
    const url = navigateMock.mock.calls[0][0];
    const params = new URLSearchParams(url.split("?")[1]);

    expect(params.get("tab")).toBe("salary");
    expect(params.get("staff_id")).toBe("2");
    expect(params.get("amount")).toBe("1250.50");
    // from should be day after 2026-03-31
    expect(params.get("from")).toBe("2026-04-01");
    // to should be today
    expect(params.get("to")).toBe(new Date().toISOString().slice(0, 10));
  });

  test("uses 2-year fallback when last_paid_at is null", async () => {
    const staff = [makeStaff({ unpaid_amount: 800, last_paid_at: null })];
    getMock.mockImplementation(defaultGetImpl(staff));

    render(<StaffPage />);
    await waitFor(() => expect(screen.getAllByText("Pay").length).toBeGreaterThan(0));

    await userEvent.click(screen.getAllByText("Pay")[0]);

    const url = navigateMock.mock.calls[0][0];
    const params = new URLSearchParams(url.split("?")[1]);

    const expectedYear = new Date().getFullYear() - 2;
    expect(params.get("from")).toMatch(new RegExp(`^${expectedYear}-`));
    expect(params.get("amount")).toBe("800.00");
  });

  test("does not include amount param when unpaid_amount is 0", async () => {
    const staff = [makeStaff({ unpaid_amount: 0 })];
    getMock.mockImplementation(defaultGetImpl(staff));

    render(<StaffPage />);
    await waitFor(() => expect(screen.getAllByText("Pay").length).toBeGreaterThan(0));

    await userEvent.click(screen.getAllByText("Pay")[0]);

    const url = navigateMock.mock.calls[0][0];
    const params = new URLSearchParams(url.split("?")[1]);
    expect(params.has("amount")).toBe(false);
  });

  test("from date is set to day after last_paid_at across month boundary (March → April)", async () => {
    const staff = [makeStaff({ unpaid_amount: 350, last_paid_at: "2026-03-31" })];
    getMock.mockImplementation(defaultGetImpl(staff));

    render(<StaffPage />);
    await waitFor(() => expect(screen.getAllByText("Pay").length).toBeGreaterThan(0));

    await userEvent.click(screen.getAllByText("Pay")[0]);

    const url = navigateMock.mock.calls[0][0];
    const params = new URLSearchParams(url.split("?")[1]);
    // The from date must be April 1, not still in March
    expect(params.get("from")).toBe("2026-04-01");
  });

  test("from date is set to day after last_paid_at across year boundary (Dec → Jan)", async () => {
    const staff = [makeStaff({ unpaid_amount: 600, last_paid_at: "2025-12-31" })];
    getMock.mockImplementation(defaultGetImpl(staff));

    render(<StaffPage />);
    await waitFor(() => expect(screen.getAllByText("Pay").length).toBeGreaterThan(0));

    await userEvent.click(screen.getAllByText("Pay")[0]);

    const url = navigateMock.mock.calls[0][0];
    const params = new URLSearchParams(url.split("?")[1]);
    expect(params.get("from")).toBe("2026-01-01");
  });

  test("doctor navigates without amount or date range", async () => {
    const staff = [makeStaff({ id: 1, role: "doctor", unpaid_amount: 5000, last_paid_at: "2026-03-15" })];
    getMock.mockImplementation(defaultGetImpl(staff));

    render(<StaffPage />);
    await waitFor(() => expect(screen.getAllByText("Pay").length).toBeGreaterThan(0));

    await userEvent.click(screen.getAllByText("Pay")[0]);

    const url = navigateMock.mock.calls[0][0];
    const params = new URLSearchParams(url.split("?")[1]);
    expect(params.get("tab")).toBe("salary");
    expect(params.get("staff_id")).toBe("1");
    expect(params.has("amount")).toBe(false);
    expect(params.has("from")).toBe(false);
    expect(params.has("to")).toBe(false);
  });

  test("from is capped at to when last_paid_at is today (same-day re-payment guard)", async () => {
    const today = new Date().toISOString().slice(0, 10);
    const staff = [makeStaff({ unpaid_amount: 300, last_paid_at: today })];
    getMock.mockImplementation(defaultGetImpl(staff));

    render(<StaffPage />);
    await waitFor(() => expect(screen.getAllByText("Pay").length).toBeGreaterThan(0));

    await userEvent.click(screen.getAllByText("Pay")[0]);

    const url = navigateMock.mock.calls[0][0];
    const params = new URLSearchParams(url.split("?")[1]);
    // from must not exceed to — otherwise the range is invalid and salary-estimate returns 400
    expect(params.get("from") <= params.get("to")).toBe(true);
    expect(params.get("from")).toBe(today);
    expect(params.get("to")).toBe(today);
  });

  test("does not call salary-estimate API for non-doctor", async () => {
    const staff = [makeStaff({ unpaid_amount: 400 })];
    getMock.mockImplementation(defaultGetImpl(staff));

    render(<StaffPage />);
    await waitFor(() => expect(screen.getAllByText("Pay").length).toBeGreaterThan(0));

    await userEvent.click(screen.getAllByText("Pay")[0]);

    const estimateCalls = getMock.mock.calls.filter((c) => c[0].includes("salary-estimate"));
    expect(estimateCalls.length).toBe(0);
  });
});
