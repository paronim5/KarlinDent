import React from "react";
import ClinicSchedule from "../components/ClinicSchedule";

export default function SchedulePage() {
  return (
    <div style={{ height: "calc(100dvh - 70px)", width: "100%", overflow: "hidden", minWidth: 0, padding: 0 }}>
      <ClinicSchedule />
    </div>
  );
}
