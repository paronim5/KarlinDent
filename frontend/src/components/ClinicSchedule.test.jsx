
import React from "react";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import ClinicSchedule from "./ClinicSchedule";
import { useApi } from "../api/client";
import "@testing-library/jest-dom/vitest";

vi.mock("../api/client", () => ({
  useApi: vi.fn()
}));
vi.mock("react-i18next", () => ({
  useTranslation: () => ({
    t: (key, vars = {}) => {
      const dict = {
        "schedule.add_shift": "Add Shift",
        "schedule.modal.new_shift": "New Shift",
        "schedule.modal.schedule_staff": "SCHEDULE STAFF",
        "schedule.modal.note_placeholder": "Shift details...",
        "schedule.modal.save_shift": "Save Shift →",
        "schedule.today": "Today",
        "schedule.calendar": "Calendar",
        "schedule.section.doctors": "Doctors",
        "schedule.section.staff": "Staff",
        "schedule.available_doctors": "Available Doctors",
        "schedule.available_staff": "Available Staff",
        "schedule.all_scheduled": "Everyone is scheduled",
        "schedule.empty_doctors": "No doctors scheduled for this day",
        "schedule.empty_staff": "No staff scheduled for this day",
        "schedule.empty_hint": "Drag staff from sidebar or click + to add",
        "schedule.modal.edit_shift": "Edit Shift",
        "schedule.modal.update_details": "UPDATE DETAILS",
        "schedule.modal.staff_member": "Staff Member",
        "schedule.modal.start_time": "Start Time",
        "schedule.modal.end_time": "End Time",
        "schedule.modal.notes": "Notes",
        "schedule.modal.delete": "Delete",
        "schedule.modal.cancel": "Cancel",
        "schedule.errors.save_shift": `Failed to save shift: ${vars.message || ""}`,
        "schedule.errors.delete_shift": `Failed to delete shift: ${vars.message || ""}`,
        "schedule.errors.confirm_delete": "Are you sure you want to delete this shift?",
        "clinic.weekdays.mon": "Mo",
        "clinic.weekdays.tue": "Tu",
        "clinic.weekdays.wed": "We",
        "clinic.weekdays.thu": "Th",
        "clinic.weekdays.fri": "Fr",
        "clinic.weekdays.sat": "Sa",
        "clinic.weekdays.sun": "Su"
      };
      return dict[key] || vars.defaultValue || key;
    }
  })
}));

const mockStaff = [
  { id: 1, first_name: "Alex", last_name: "Ivanov", role: "doctor", is_active: true },
  { id: 2, first_name: "Jane", last_name: "Smith", role: "assistant", is_active: true }
];

const todayISO = new Date().toISOString().slice(0, 10);
const mockShifts = [
  {
    id: 1,
    staff_id: 1,
    start: `${todayISO}T08:00:00`,
    end: `${todayISO}T16:00:00`,
    note: "Day Shift",
    status: "pending"
  }
];

describe("ClinicSchedule", () => {
  const mockApi = {
    get: vi.fn(),
    post: vi.fn(),
    put: vi.fn(),
    delete: vi.fn()
  };

  beforeEach(() => {
    useApi.mockReturnValue(mockApi);
    mockApi.get.mockImplementation((path) => {
      if (path === "/staff") return Promise.resolve(mockStaff);
      if (path.startsWith("/schedule")) return Promise.resolve(mockShifts);
      return Promise.reject(new Error("Not found"));
    });
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  test("renders staff and shifts", async () => {
    render(<ClinicSchedule />);

    await waitFor(() => {
      expect(mockApi.get).toHaveBeenCalledWith("/staff");
    });

    // Shift note should be visible for doctor tab (default)
    await waitFor(() => {
      expect(screen.getByText("Day Shift")).toBeInTheDocument();
    });
  });

  test("opens modal on clicking Add Shift", async () => {
    render(<ClinicSchedule />);

    await waitFor(() => {
      expect(mockApi.get).toHaveBeenCalledWith("/staff");
    });

    // The header "Add Shift" button (btn-primary)
    const btn = screen.getAllByRole("button", { name: /Add Shift/i })[0];
    fireEvent.click(btn);

    await waitFor(() => {
      expect(screen.getAllByText("New Shift").length).toBeGreaterThan(0);
      expect(screen.getAllByText("SCHEDULE STAFF").length).toBeGreaterThan(0);
    });
  });

  test("submits new shift", async () => {
    mockApi.post.mockResolvedValue({ id: 2, status: "created" });

    render(<ClinicSchedule />);

    await waitFor(() => {
      expect(mockApi.get).toHaveBeenCalledWith("/staff");
    });

    fireEvent.click(screen.getAllByRole("button", { name: /Add Shift/i })[0]);

    await waitFor(() => {
      expect(screen.getAllByText("New Shift").length).toBeGreaterThan(0);
    });

    const noteInput = screen.getAllByPlaceholderText("Shift details...")[0];
    fireEvent.change(noteInput, { target: { value: "Night Shift" } });

    const saveBtn = screen.getAllByText("Save Shift →")[0];
    fireEvent.click(saveBtn);

    await waitFor(() => {
      expect(mockApi.post).toHaveBeenCalledWith("/schedule", expect.objectContaining({
        staff_id: 1,
        note: "Night Shift"
      }));
    });
  });

  test("shows doctor in schedule when they have a shift", async () => {
    render(<ClinicSchedule />);

    await waitFor(() => {
      expect(mockApi.get).toHaveBeenCalledWith("/staff");
    });

    // Alex Ivanov is a doctor with a shift - should be visible in the doctors tab
    await waitFor(() => {
      expect(screen.getAllByText("Alex Ivanov").length).toBeGreaterThan(0);
    });
  });
});
