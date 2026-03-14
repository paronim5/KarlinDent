import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, expect, test, vi } from "vitest";
import React from "react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import StaffRolePage from "./StaffRolePage.jsx";

const getMock = vi.fn();

vi.mock("../api/client.js", () => ({
  useApi: () => ({
    get: getMock,
    post: vi.fn(),
    put: vi.fn(),
    delete: vi.fn()
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

beforeEach(() => {
  getMock.mockReset();
  navigateMock.mockReset();
  localStorage.setItem("auth_user", JSON.stringify({ id: 2, role: "assistant" }));
  getMock.mockImplementation((path) => {
    if (path === "/staff") {
      return Promise.resolve([
        { id: 2, first_name: "Viktoriia", last_name: "O", role: "assistant", base_salary: 250 }
      ]);
    }
    if (path.startsWith("/outcome/timesheets")) {
      return Promise.resolve([]);
    }
    if (path.startsWith("/staff/2/documents?")) {
      return Promise.resolve([
        {
          id: 9,
          period_from: "2026-02-28",
          period_to: "2026-03-13",
          signed_at: "2026-03-13T11:19:08Z",
          signer_name: "Viktoriia O",
          file_name: "Viktoriia O Salary Report 2026-03-13.pdf"
        }
      ]);
    }
    return Promise.resolve([]);
  });
  global.fetch = vi.fn(async () => ({
    ok: true,
    blob: async () => new Blob(["pdf"], { type: "application/pdf" })
  }));
  HTMLAnchorElement.prototype.click = vi.fn();
  window.open = vi.fn();
  window.URL.createObjectURL = vi.fn(() => "blob:test");
  window.URL.revokeObjectURL = vi.fn();
});

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

test("renders salary documents and supports view and download actions", async () => {
  render(
    <MemoryRouter initialEntries={["/staff/role/2"]}>
      <Routes>
        <Route path="/staff/role/:id" element={<StaffRolePage />} />
      </Routes>
    </MemoryRouter>
  );

  await waitFor(() => expect(screen.getByText("Viktoriia O Salary Report 2026-03-13.pdf")).toBeTruthy());

  await userEvent.click(screen.getByRole("button", { name: "View" }));
  await waitFor(() => expect(global.fetch).toHaveBeenCalledWith(
    "/api/staff/2/documents/9/view",
    expect.objectContaining({
      headers: expect.objectContaining({ "X-Staff-Id": "2", "X-Staff-Role": "assistant" })
    })
  ));

  await userEvent.click(screen.getByRole("button", { name: "Download" }));
  await waitFor(() => expect(global.fetch).toHaveBeenCalledWith(
    "/api/staff/2/documents/9/download",
    expect.objectContaining({
      headers: expect.objectContaining({ "X-Staff-Id": "2", "X-Staff-Role": "assistant" })
    })
  ));
});

test("uses responsive document filter and action classes", async () => {
  const { container } = render(
    <MemoryRouter initialEntries={["/staff/role/2"]}>
      <Routes>
        <Route path="/staff/role/:id" element={<StaffRolePage />} />
      </Routes>
    </MemoryRouter>
  );

  await waitFor(() => expect(screen.getByText("Salary Documents")).toBeTruthy());

  expect(container.querySelector(".doc-filter-controls")).toBeTruthy();
  expect(container.querySelector(".doc-filter-input")).toBeTruthy();
  expect(container.querySelector(".doc-actions")).toBeTruthy();
});

test("renders existing shift row without crashing page", async () => {
  getMock.mockImplementation((path) => {
    if (path === "/staff") {
      return Promise.resolve([
        { id: 2, first_name: "Viktoriia", last_name: "O", role: "assistant", base_salary: 250 }
      ]);
    }
    if (path.startsWith("/outcome/timesheets")) {
      return Promise.resolve([
        { id: 11, work_date: "2026-03-14", start_time: "09:00:00", end_time: "17:00:00", hours: 8 }
      ]);
    }
    if (path.startsWith("/staff/2/documents?")) {
      return Promise.resolve([]);
    }
    return Promise.resolve([]);
  });

  render(
    <MemoryRouter initialEntries={["/staff/role/2"]}>
      <Routes>
        <Route path="/staff/role/:id" element={<StaffRolePage />} />
      </Routes>
    </MemoryRouter>
  );

  await waitFor(() => expect(screen.getByText("2026-03-14")).toBeTruthy());
  expect(screen.getByRole("button", { name: "staff.actions.edit" })).toBeTruthy();
});
