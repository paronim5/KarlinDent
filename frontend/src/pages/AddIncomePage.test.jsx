import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, expect, test, vi } from "vitest";
import React from "react";
import AddIncomePage from "./AddIncomePage.jsx";

const tMap = {
  "income.form.more_details": "More details",
  "income.form.add_record": "Add Income Record",
  "income.form.patient_compact_label": "Patient",
  "income.form.patient": "Patient",
  "income.form.doctor": "Doctor",
  "income.form.select_doctor_placeholder": "Select doctor...",
  "income.form.amount": "Amount",
  "income.form.payment_method": "Payment Method",
  "income.form.cash": "Cash",
  "income.form.card": "Card",
  "income.form.date": "Date",
  "income.form.note": "Note",
  "income.form.submit": "Record Transaction",
  "income.form.receipt_issued": "Receipt issued",
  "income.form.receipt_reason": "Receipt reason",
  "income.form.select_reason": "Select reason...",
  "income.form.receipt_note": "Receipt note",
  "income.form.receipt_medicine": "Medicine / recepts",
  "income.form.lab_required": "Extra lab work required",
  "income.form.lab_cost": "Lab Fee",
  "income.form.lab_note": "Lab Note",
  "income.validation.patient_invalid": "Enter LastName or LastName FirstName",
  "income.validation.doctor_required": "Select a doctor",
  "income.validation.amount_invalid": "Enter a positive amount",
  "income.validation.lab_cost_required": "Enter a lab fee",
  "income.validation.lab_note_required": "Enter a lab note",
  "income.validation.receipt_note_required": "Receipt note is required",
  "common.cancel": "Cancel",
  "common.loading": "Loading...",
  "income.toast.recorded": "Income recorded"
};

vi.mock("react-i18next", () => ({
  useTranslation: () => ({
    t: (key, options) => tMap[key] || options?.defaultValue || key
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

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

const setupApi = () => {
  getMock.mockImplementation((path) => {
    if (path.startsWith("/staff?role=doctor")) {
      return Promise.resolve([{ id: 1, last_name: "House" }]);
    }
    if (path === "/patients/receipt-reasons") {
      return Promise.resolve([{ id: "insurance", label: "Insurance" }]);
    }
    if (path === "/staff/medicines") {
      return Promise.resolve([{ id: 1, name: "Paracetamol" }]);
    }
    if (path.startsWith("/patients/search")) {
      return Promise.resolve([]);
    }
    return Promise.resolve([]);
  });
  postMock.mockResolvedValue({ id: 1 });
};

test("requires receipt note when receipt is issued", async () => {
  setupApi();
  render(<AddIncomePage />);

  const user = userEvent.setup();
  await screen.findByRole("option", { name: "House" });

  await user.type(screen.getByLabelText("Patient"), "Smith");
  await user.selectOptions(screen.getByRole("combobox"), "1");
  await user.type(screen.getByPlaceholderText("0.00"), "1200");

  await user.click(screen.getByRole("button", { name: /more details/i }));
  await user.click(screen.getByLabelText("Receipt issued"));

  expect(screen.getByText("Receipt note is required")).toBeTruthy();
  expect(postMock).not.toHaveBeenCalled();
});

test("submits lab and receipt details in payload", async () => {
  setupApi();
  render(<AddIncomePage />);

  const user = userEvent.setup();
  await screen.findByRole("option", { name: "House" });

  await user.type(screen.getByLabelText("Patient"), "Smith");
  await user.selectOptions(screen.getByRole("combobox"), "1");
  await user.type(screen.getByPlaceholderText("0.00"), "1500");

  await user.click(screen.getByLabelText("Extra lab work required"));
  await user.type(screen.getByLabelText("Lab Fee"), "250");
  await user.type(screen.getByLabelText("Lab Note"), "External lab");

  await user.click(screen.getByRole("button", { name: /more details/i }));
  await user.click(screen.getByLabelText("Receipt issued"));
  await user.type(screen.getByLabelText("Receipt note"), "Patient requested receipt");
  await user.type(screen.getByLabelText("Medicine / recepts"), "Paracetamol");

  await user.click(screen.getByRole("button", { name: /\+ Record Transaction/i }));

  await waitFor(() => {
    expect(postMock).toHaveBeenCalled();
  });

  const payload = postMock.mock.calls[0][1];
  expect(payload.lab_required).toBe(true);
  expect(payload.lab_cost).toBe(250);
  expect(payload.lab_note).toBe("External lab");
  expect(payload.receipt_issued).toBe(true);
  expect(payload.receipt_note).toBe("Patient requested receipt");
  expect(payload.receipt_medicine).toBe("Paracetamol");
});
