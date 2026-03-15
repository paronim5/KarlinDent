import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, expect, test, vi } from "vitest";
import React from "react";
import StaffPage from "./StaffPage.jsx";

vi.mock("react-i18next", () => ({
  useTranslation: () => ({
    t: (key) => key
  })
}));

const getMock = vi.fn();
const postMock = vi.fn();
const putMock = vi.fn();
const deleteMock = vi.fn();

vi.mock("../api/client.js", () => ({
  useApi: () => ({
    get: getMock,
    post: postMock,
    put: putMock,
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

const staffItems = [
  { id: 2, first_name: "Pasha", last_name: "Kosov", role: "assistant", base_salary: 200, commission_rate: 0, commission_income: 0 },
  { id: 1, first_name: "Test", last_name: "Doctor", role: "doctor", base_salary: 0, commission_rate: 0.3, commission_income: 1000 }
];

beforeEach(() => {
  getMock.mockReset();
  postMock.mockReset();
  putMock.mockReset();
  deleteMock.mockReset();
  navigateMock.mockReset();
  getMock.mockImplementation((path) => {
    if (path === "/staff/roles") return Promise.resolve([]);
    if (path.startsWith("/staff?")) return Promise.resolve(staffItems);
    if (path === "/staff/medicines") return Promise.resolve([]);
    return Promise.resolve([]);
  });
});

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

test("redirects non-doctor pay button to salary outcome form", async () => {
  render(<StaffPage />);

  const payButtons = await screen.findAllByRole("button", { name: "staff.actions.pay" });
  await userEvent.click(payButtons[0]);

  await waitFor(() =>
    expect(navigateMock).toHaveBeenCalledWith(expect.stringContaining("/outcome/add?tab=salary&staff_id=2"))
  );
});

test("navigates to staff member page when clicking on name", async () => {
  render(<StaffPage />);

  const assistantName = await screen.findByText("Pasha Kosov");
  await userEvent.click(assistantName);
  expect(navigateMock).toHaveBeenCalledWith("/staff/role/2");

  const doctorName = await screen.findByText("Test Doctor");
  await userEvent.click(doctorName);
  expect(navigateMock).toHaveBeenCalledWith("/staff/doctor/1");
});
