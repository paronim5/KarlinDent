import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import LanguageDetector from 'i18next-browser-languagedetector';

const resources = {
  en: {
    translation: {
      "nav": {
        "overview": "Overview",
        "workforce": "Workforce",
        "payroll": "Payroll",
        "dashboard": "Dashboard",
        "income": "Income",
        "expenses": "Expenses",
        "staff": "Staff",
        "my_income": "My Income",
        "schedule": "Schedule",
        "patients": "Patients",
        "export": "Export",
        "add_income": "Add Income",
        "add_outcome": "Add Outcome"
      },
      "common": {
        "period_active": "PERIOD ACTIVE",
        "search": "Search...",
        "cancel": "Cancel",
        "save": "Save",
        "delete": "Delete",
        "edit": "Edit",
        "loading": "Loading...",
        "error": "An error occurred",
        "retry": "Retry",
        "export_csv": "Export CSV",
        "export_pdf": "Export PDF",
        "view": "View",
        "none": "None",
        "never": "Never"
      },
      "clinic": {
        "total_income": "Total Income",
        "total_outcome": "Total Outcome",
        "payroll_due": "Payroll Due",
        "net_profit": "Net Profit",
        "active_staff": "Active Staff",
        "unique_patients": "Unique Patients",
        "daily_pnl": "Daily P&L",
        "daily_income_outcome": "Daily Income vs Outcome",
        "last_30_days": "Last 30 days",
        "period_meta": "{{period}} statistics",
        "sections": {
          "financial": "Financial Overview",
          "patients": "Patient Insights",
          "doctors": "Doctor Performance",
          "expenses": "Expense Analysis",
          "operations": "Operational Health"
        },
        "financial": {
          "net_profit": "Net profit",
          "income_trend": "Revenue trend",
          "expense_trend": "Expense trend",
          "payment_ratio": "Cash vs card ratio",
          "lab_ratio": "Lab cost % of income"
        },
        "patients": {
          "unique": "Unique patients",
          "new": "New patients",
          "returning": "Returning patients",
          "avg_visit": "Avg revenue per visit",
          "top_spenders": "Top patients by spend",
          "patient": "Patient",
          "total_spend": "Total spend",
          "visits": "Visits"
        },
        "doctors": {
          "doctor": "Doctor",
          "revenue": "Revenue",
          "visits": "Visits",
          "avg_visit": "Avg visit value"
        },
        "expenses": {
          "salary_ratio": "Salary cost % of income",
          "by_category": "Expenses by category",
          "category": "Category",
          "total": "Total",
          "trend": "Month-over-month expenses",
          "month": "Month"
        },
        "operations": {
          "staff": "Staff",
          "days_since_salary": "Days since last salary",
          "busiest_days": "Busiest days",
          "day": "Day",
          "visits": "Visits",
          "outstanding_commission": "Outstanding doctor commissions",
          "amount": "Amount"
        },
        "weekdays": {
          "sun": "Sunday",
          "mon": "Monday",
          "tue": "Tuesday",
          "wed": "Wednesday",
          "thu": "Thursday",
          "fri": "Friday",
          "sat": "Saturday"
        },
        "chart": {
          "income": "INCOME",
          "outcome": "OUTCOME",
          "profit": "PROFIT"
        },
        "day_details": {
          "failed_load": "Failed to load day details",
          "back_to_dashboard": "Back to Dashboard",
          "day_overview": "Day Overview",
          "highest_earning_doctor": "Highest Earning Doctor",
          "revenue_breakdown": "Revenue Breakdown",
          "no_data": "No data available"
        },
        "errors": {
          "load_dashboard": "Unable to load dashboard"
        }
      },
      "income": {
        "title": "Income Management",
        "trend_title": "Income Trend",
        "date_range": {
          "from": "FROM",
          "to": "TO"
        },
        "period_selector": "Time period selector",
        "period_meta": "{{period}} statistics",
        "period": {
          "year": "Year",
          "month": "Month",
          "week": "Week",
          "day": "Day",
          "custom": "Custom"
        },
        "stats": {
          "total": "Total Income",
          "records": "Records count",
          "avg": "Avg per patient"
        },
        "form": {
          "add_record": "Add Income Record",
          "patient": "Patient",
          "doctor": "Doctor",
          "amount": "Amount",
          "payment_method": "Payment Method",
          "note": "Note",
          "cash": "Cash",
          "card": "Card",
          "new_patient": "New Patient Last Name",
          "submit": "Record Transaction",
          "lab_work": "Lab Work",
          "lab_required": "Extra lab work required",
          "lab_cost": "Lab Fee",
          "lab_note": "Lab Note",
          "lab_cost_note": "* Will be deducted from doctor's commission",
          "patient_compact_label": "Patient (Last Name First Name)",
          "more_details": "More details",
          "phone": "Phone number",
          "street": "Street address",
          "city": "City",
          "zip": "ZIP/Post code",
          "receipt_issued": "Receipt issued",
          "receipt_reason": "Receipt reason",
          "receipt_note": "Receipt note",
          "receipt_medicine": "Medicine / recepts",
          "select_reason": "Select reason...",
          "date": "Date",
          "select_doctor_placeholder": "Select doctor..."
        },
        "banner": {
          "found_basic": "Found: {{name}} – Total paid: {{total}} Kč",
          "found_with_last": "Found: {{name}} – Total paid: {{total}} Kč, Last treatment: {{doctor}}, {{date}}",
          "new_patient": "New patient will be created"
        },
        "validation": {
          "patient_invalid": "Enter LastName or LastName FirstName",
          "doctor_required": "Select a doctor",
          "amount_invalid": "Enter a positive amount",
          "lab_cost_required": "Enter a lab fee",
          "lab_note_required": "Enter a lab note",
          "receipt_note_required": "Receipt note is required"
        },
        "toast": {
          "recorded": "Income recorded"
        },
        "receipt_reason_insurance": "Insurance",
        "receipt_reason_warranty": "Warranty",
        "receipt_reason_customer_request": "Customer Request",
        "receipt_reason_accounting": "Accounting",
        "empty_state": "No transactions for selected period",
        "table": {
          "date": "Date",
          "patient": "Patient",
          "doctor": "Doctor",
          "method": "Method",
          "amount": "Amount",
          "note": "Note",
          "status": "Status",
          "paid": "Paid",
          "unpaid": "Unpaid"
        },
        "errors": {
          "load_records": "Unable to load income records",
          "invalid_patient": "Provide a valid patient name",
          "patient_not_found": "Selected patient not found",
          "invalid_doctor": "Select a valid doctor",
          "invalid_amount": "Amount must be greater than zero",
          "invalid_payment_method": "Select a payment method",
          "lab_cost_required": "Lab fee is required",
          "invalid_lab_cost": "Lab fee must be a positive number",
          "lab_note_required": "Lab note is required",
          "receipt_note_required": "Receipt note is required"
        }
      },
      "outcome": {
        "title": "Expense Management",
        "history_title": "Outcome History",
        "expenses": "Expenses",
        "salaries": "Salaries",
        "salary_panel": {
          "breakdown": "Salary Breakdown",
          "period": "Period",
          "total_hours": "Total Hours",
          "base_rate": "Base Rate",
          "calculated_salary": "Calculated Salary",
          "last_payment": "Last Payment",
          "never": "Never",
          "base_salary": "Base Salary",
          "commission": "Commission ({{rate}}% of {{income}})",
          "lab_fees_deduction": "Lab Fees Deduction",
          "adjustments": "Adjustments",
          "total_estimated": "Total Estimated",
          "unpaid_patients": "Unpaid Patients ({{count}})"
        },
        "salary_notes": {
          "title": "Salary Payment Notes",
          "total": "{{count}} total",
          "loading": "Loading notes...",
          "empty": "No salary notes for this staff member.",
          "prev": "Prev",
          "next": "Next"
        },
        "signature": {
          "title": "Salary Report Signature",
          "close": "Close",
          "signer_name": "Signer Name",
          "signer_placeholder": "Type full name",
          "digital_signature": "Digital Signature",
          "clear": "Clear",
          "record_and_sign": "Record Salary & Sign",
          "recording": "Recording..."
        },
        "hints": {
          "adjust_amount": "You can adjust this amount (floor/ceil) as needed."
        },
        "warnings": {
          "reset_counter": "Warning: Processing this payment will reset the staff member's revenue counter to zero."
        },
        "form": {
          "add_expense": "Add Expense",
          "add_salary": "Add Salary",
          "category": "Category",
          "amount": "Amount",
          "date": "Date",
          "vendor": "Vendor",
          "description": "Description",
          "staff": "Staff",
          "note": "Note",
          "submit_expense": "Record Expense",
          "submit_salary": "Record Salary"
        },
        "table": {
          "category": "Category",
          "vendor": "Vendor",
          "amount": "Amount",
          "date": "Date",
          "staff": "Staff"
        },
        "errors": {
          "load_data": "Unable to load outcome data",
          "load_reference": "Unable to load reference data"
        }
      },
      "staff": {
        "title": "Staff Directory",
        "add_staff": "Add Staff",
        "edit_staff": "Edit Staff",
        "active_members": "{{count}} active members",
        "items_count": "{{count}} items",
        "medicines_title": "Medicine / recepts",
        "medicines_add": "Add medicine",
        "medicines_placeholder": "Enter medicine name",
        "actions": {
          "pay": "Pay",
          "view": "View",
          "edit": "Edit"
        },
        "table_meta": {
          "base_commission": "Base/Commission",
        "total_earned": "Unpaid Salary",
        "actions": "Actions"
      },
        "pay_modal": {
          "title": "Pay Salary: {{name}}",
          "base_salary": "Base Salary",
          "commission": "Commission",
          "adjustments": "Adjustments",
          "total": "Total",
          "processing": "Processing...",
          "confirm": "Confirm Payment"
        },
        "form": {
          "first_name": "First Name",
          "last_name": "Last Name",
          "commission_rate": "Commission Rate (%)",
          "base_hourly_salary": "Base/Hourly Salary",
          "phone": "Phone",
          "email": "Email"
        },
        "table": {
          "name": "Name",
          "role": "Role",
          "email": "Email",
          "status": "Status"
        },
        "roles": {
          "doctor": "Doctor",
          "assistant": "Assistant",
          "administrator": "Administrator",
          "janitor": "Janitor",
          "nurse": "Nurse",
          "admin": "Admin",
          "receptionist": "Receptionist"
        },
        "errors": {
          "load_staff": "Unable to load staff directory",
          "load_medicines": "Unable to load medicines",
          "add_medicine": "Unable to add medicine",
          "remove_medicine": "Unable to remove medicine"
        }
      },
      "staff_role": {
        "title_fallback": "Staff member",
        "system_error": "SYSTEM ERROR: {{error}}",
        "timesheet_log": "Timesheet Log",
        "entries_count": "{{count}} entries",
        "headers": {
          "date": "Date",
          "start": "Start",
          "end": "End",
          "hours": "Hours",
          "actions": "Actions"
        },
        "salary_summary": "Salary Summary",
        "recording": "Recording...",
        "record_salary": "Record Salary",
        "salary_documents": "Salary Documents",
        "signed_reports": "Signed reports",
        "search": "Search",
        "headers_docs": {
          "period": "Period",
          "signed_at": "Signed At",
          "signer": "Signer",
          "file": "File",
          "action": "Action"
        },
        "no_documents": "No salary documents found",
        "file_default": "salary-report.pdf",
        "view": "View",
        "download": "Download",
        "edit_shift": "Edit Shift",
        "add_shift": "Add Shift",
        "shift_date": "Date",
        "shift_start": "Start Time",
        "shift_end": "End Time",
        "shift_note": "Note",
        "shift_placeholder": "Shift details...",
        "update_shift": "Update Shift",
        "saving": "Saving...",
        "confirm_delete_shift": "Are you sure you want to delete this shift?",
        "errors": {
          "staff_not_found": "Staff member not found.",
          "invalid_staff": "Select a valid staff member.",
          "timesheets_unavailable": "Timesheets are unavailable for this staff member.",
          "load_timesheets": "Unable to load timesheets",
          "load_documents": "Unable to load salary documents",
          "download_document": "Unable to download document",
          "preview_document": "Unable to open document preview",
          "invalid_range": "Select a valid date range.",
          "no_hours": "No hours recorded for selected period.",
          "required_shift_fields": "Please enter date, start time, and end time.",
          "invalid_time_range": "End time must be after start time.",
          "shift_not_found": "Shift not found.",
          "invalid_shift_data": "Enter valid shift details.",
          "save_shift": "Unable to save shift",
          "delete_shift": "Unable to delete shift"
        }
      },
      "auth": {
        "sign_in_title": "Sign in to your account",
        "username": "Username",
        "password": "Password",
        "sign_in": "Sign in",
        "signing_in": "Signing in…",
        "sign_out": "Sign out",
        "connection_error": "Connection error. Please try again."
      },
      "patients": {
        "title": "Patient Lookup",
        "subtitle": "Search by name or ID to view patient history",
        "search_label": "Patient",
        "search_placeholder": "Last name, first name or ID...",
        "no_results": "No patients found",
        "no_records": "No records for selected period",
        "filter": "Apply",
        "back": "Back to search",
        "records_title": "Income Records",
        "chart_label": "Spending",
        "trend_title": "Spending Trend",
        "stats": {
          "total_paid": "Total Paid",
          "visits": "Visits",
          "avg_visit": "Avg / Visit",
          "lab_cost": "Lab Costs",
          "last_visit": "Last Visit"
        },
        "table": {
          "date": "Date",
          "doctor": "Doctor",
          "amount": "Amount",
          "lab_cost": "Lab Cost",
          "payment": "Payment",
          "note": "Note"
        }
      },
      "schedule": {
        "today": "Today",
        "add_shift": "Add Shift",
        "stats": {
          "shifts": "Shifts",
          "visible_staff": "Visible staff",
          "on_duty_now": "On duty now",
          "roles": "Roles"
        },
        "section": {
          "doctors": "Doctors",
          "staff": "Staff"
        },
        "add_income": "Record income",
        "todays_team": "Today's Team",
        "available_doctors": "Available Doctors",
        "available_staff": "Available Staff",
        "all_scheduled": "Everyone is scheduled",
        "empty_doctors": "No doctors scheduled for this day",
        "empty_staff": "No staff scheduled for this day",
        "empty_hint": "Click the + button above to add someone",
        "status": {
          "pending": "PENDING"
        },
        "calendar": "Calendar",
        "on_duty_today": "On Duty Today",
        "no_on_duty_today": "No one on duty today",
        "duty_item": "Dr. {{lastName}} – {{role}} {{start}}-{{end}}",
        "filters": {
          "no_staff": "No staff matching filters"
        },
        "modal": {
          "edit_shift": "Edit Shift",
          "new_shift": "New Shift",
          "update_details": "UPDATE DETAILS",
          "schedule_staff": "SCHEDULE STAFF",
          "staff_member": "Staff Member",
          "start_time": "Start Time",
          "end_time": "End Time",
          "notes": "Notes",
          "note_placeholder": "Shift details...",
          "delete": "Delete",
          "cancel": "Cancel",
          "save_shift": "Save Shift →"
        },
        "errors": {
          "save_shift": "Failed to save shift: {{message}}",
          "delete_shift": "Failed to delete shift: {{message}}",
          "confirm_delete": "Are you sure you want to delete this shift?"
        }
      }
    }
  },
  ru: {
    translation: {
      "nav": {
        "overview": "Обзор",
        "workforce": "Персонал",
        "payroll": "Зарплата",
        "dashboard": "Дашборд",
        "income": "Доходы",
        "expenses": "Расходы",
        "staff": "Сотрудники",
        "my_income": "Мой доход",
        "schedule": "График",
        "patients": "Пациенты",
        "export": "Экспорт",
        "add_income": "Добавить доход",
        "add_outcome": "Добавить расход"
      },
      "common": {
        "period_active": "ПЕРИОД АКТИВЕН",
        "search": "Поиск...",
        "cancel": "Отмена",
        "save": "Сохранить",
        "delete": "Удалить",
        "edit": "Изменить",
        "loading": "Загрузка...",
        "error": "Произошла ошибка",
        "retry": "Повторить",
        "export_csv": "Экспорт в CSV",
        "export_pdf": "Экспорт в PDF",
        "view": "Просмотр",
        "none": "Нет",
        "never": "Никогда"
      },
      "clinic": {
        "total_income": "Общий доход",
        "total_outcome": "Общий расход",
        "payroll_due": "К выплате",
        "net_profit": "Чистая прибыль",
        "active_staff": "Активные сотрудники",
        "unique_patients": "Уникальные пациенты",
        "daily_pnl": "Дневная прибыль/убыток",
        "daily_income_outcome": "Доходы и расходы по дням",
        "last_30_days": "Последние 30 дней",
        "period_meta": "Статистика за период: {{period}}",
        "sections": {
          "financial": "Финансовый обзор",
          "patients": "Пациенты",
          "doctors": "Эффективность врачей",
          "expenses": "Анализ расходов",
          "operations": "Операционное здоровье"
        },
        "financial": {
          "net_profit": "Чистая прибыль",
          "income_trend": "Тренд доходов",
          "expense_trend": "Тренд расходов",
          "payment_ratio": "Соотношение наличных и карты",
          "lab_ratio": "Лаборатория % от дохода"
        },
        "patients": {
          "unique": "Уникальные пациенты",
          "new": "Новые пациенты",
          "returning": "Повторные пациенты",
          "avg_visit": "Средний доход за визит",
          "top_spenders": "Топ пациентов по оплатам",
          "patient": "Пациент",
          "total_spend": "Сумма",
          "visits": "Визиты"
        },
        "doctors": {
          "doctor": "Врач",
          "revenue": "Доход",
          "visits": "Визиты",
          "avg_visit": "Средний чек"
        },
        "expenses": {
          "salary_ratio": "Зарплаты % от дохода",
          "by_category": "Расходы по категориям",
          "category": "Категория",
          "total": "Сумма",
          "trend": "Динамика расходов по месяцам",
          "month": "Месяц"
        },
        "operations": {
          "staff": "Сотрудник",
          "days_since_salary": "Дней с последней зарплаты",
          "busiest_days": "Самые загруженные дни",
          "day": "День",
          "visits": "Визиты",
          "outstanding_commission": "Долги по комиссиям врачей",
          "amount": "Сумма"
        },
        "weekdays": {
          "sun": "Воскресенье",
          "mon": "Понедельник",
          "tue": "Вторник",
          "wed": "Среда",
          "thu": "Четверг",
          "fri": "Пятница",
          "sat": "Суббота"
        },
        "chart": {
          "income": "ДОХОД",
          "outcome": "РАСХОД",
          "profit": "ПРИБЫЛЬ"
        },
        "day_details": {
          "failed_load": "Не удалось загрузить сведения за день",
          "back_to_dashboard": "Назад к дашборду",
          "day_overview": "Обзор дня",
          "highest_earning_doctor": "Самый прибыльный врач",
          "revenue_breakdown": "Распределение доходов",
          "no_data": "Нет данных"
        },
        "errors": {
          "load_dashboard": "Не удалось загрузить дашборд"
        }
      },
      "income": {
        "title": "Управление доходами",
        "trend_title": "Динамика доходов",
        "date_range": {
          "from": "С",
          "to": "ПО"
        },
        "period_selector": "Выбор периода",
        "period_meta": "Статистика за период: {{period}}",
        "period": {
          "year": "Год",
          "month": "Месяц",
          "week": "Неделя",
          "day": "День",
          "custom": "Свой период"
        },
        "stats": {
          "total": "Общий доход",
          "records": "Кол-во записей",
          "avg": "Средний чек"
        },
        "form": {
          "add_record": "Добавить запись о доходе",
          "patient": "Пациент",
          "doctor": "Врач",
          "amount": "Сумма",
          "payment_method": "Способ оплаты",
          "note": "Примечание",
          "cash": "Наличные",
          "card": "Карта",
          "new_patient": "Фамилия нового пациента",
          "submit": "Записать транзакцию",
          "lab_work": "Лаборатория",
          "lab_required": "Требуется лаборатория",
          "lab_cost": "Стоимость лаб.",
          "lab_note": "Примечание лаборатории",
          "lab_cost_note": "* Будет вычтено из комиссии врача",
          "patient_compact_label": "Пациент (Фамилия Имя)",
          "more_details": "Дополнительные данные",
          "phone": "Телефон",
          "street": "Адрес",
          "city": "Город",
          "zip": "Индекс",
          "receipt_issued": "Квитанция выдана",
          "receipt_reason": "Причина квитанции",
          "receipt_note": "Примечание квитанции",
          "receipt_medicine": "Лекарства / рецепты",
          "select_reason": "Выберите причину...",
          "date": "Дата",
          "select_doctor_placeholder": "Выберите врача..."
        },
        "banner": {
          "found_basic": "Найден пациент: {{name}} — оплачено всего: {{total}} Kč",
          "found_with_last": "Найден пациент: {{name}} — оплачено всего: {{total}} Kč, последнее лечение: {{doctor}}, {{date}}",
          "new_patient": "Будет создан новый пациент"
        },
        "validation": {
          "patient_invalid": "Введите Фамилию или Фамилию Имя",
          "doctor_required": "Выберите врача",
          "amount_invalid": "Введите положительную сумму",
          "lab_cost_required": "Укажите стоимость лаборатории",
          "lab_note_required": "Укажите примечание лаборатории",
          "receipt_note_required": "Укажите примечание квитанции"
        },
        "toast": {
          "recorded": "Доход записан"
        },
        "receipt_reason_insurance": "Страховка",
        "receipt_reason_warranty": "Гарантия",
        "receipt_reason_customer_request": "По просьбе клиента",
        "receipt_reason_accounting": "Бухгалтерия",
        "empty_state": "Нет транзакций за выбранный период",
        "table": {
          "date": "Дата",
          "patient": "Пациент",
          "doctor": "Врач",
          "method": "Метод",
          "amount": "Сумма",
          "note": "Прим.",
          "status": "Статус",
          "paid": "Выплачено",
          "unpaid": "Не выплачено"
        },
        "errors": {
          "load_records": "Не удалось загрузить записи о доходах",
          "invalid_patient": "Укажите корректного пациента",
          "patient_not_found": "Пациент не найден",
          "invalid_doctor": "Выберите врача",
          "invalid_amount": "Сумма должна быть больше нуля",
          "invalid_payment_method": "Выберите способ оплаты",
          "lab_cost_required": "Укажите стоимость лаборатории",
          "invalid_lab_cost": "Стоимость лаборатории должна быть положительной",
          "lab_note_required": "Укажите примечание лаборатории",
          "receipt_note_required": "Укажите примечание квитанции"
        }
      },
      "outcome": {
        "title": "Управление расходами",
        "history_title": "История расходов",
        "expenses": "Расходы",
        "salaries": "Зарплаты",
        "salary_panel": {
          "breakdown": "Сводка по зарплате",
          "period": "Период",
          "total_hours": "Всего часов",
          "base_rate": "Базовая ставка",
          "calculated_salary": "Рассчитанная зарплата",
          "last_payment": "Последняя выплата",
          "never": "Никогда",
          "base_salary": "Базовый оклад",
          "commission": "Комиссия ({{rate}}% от {{income}})",
          "lab_fees_deduction": "Удержание за лабораторию",
          "adjustments": "Корректировки",
          "total_estimated": "Итого (оценка)",
          "unpaid_patients": "Неоплаченные пациенты ({{count}})"
        },
        "salary_notes": {
          "title": "Примечания по выплатам",
          "total": "{{count}} всего",
          "loading": "Загрузка примечаний...",
          "empty": "Для этого сотрудника нет примечаний по выплатам.",
          "prev": "Назад",
          "next": "Вперёд"
        },
        "signature": {
          "title": "Подпись зарплатного отчёта",
          "close": "Закрыть",
          "signer_name": "Имя подписанта",
          "signer_placeholder": "Введите полное имя",
          "digital_signature": "Цифровая подпись",
          "clear": "Очистить",
          "record_and_sign": "Провести выплату и подписать",
          "recording": "Сохранение..."
        },
        "hints": {
          "adjust_amount": "При необходимости скорректируйте сумму (округление вниз/вверх)."
        },
        "warnings": {
          "reset_counter": "Внимание: Выплата обнулит счётчик выручки сотрудника."
        },
        "form": {
          "add_expense": "Добавить расход",
          "add_salary": "Выплатить зарплату",
          "category": "Категория",
          "amount": "Сумма",
          "date": "Дата",
          "vendor": "Поставщик",
          "description": "Описание",
          "staff": "Сотрудник",
          "note": "Примечание",
          "submit_expense": "Записать расход",
          "submit_salary": "Выплатить зарплату"
        },
        "table": {
          "category": "Категория",
          "vendor": "Поставщик",
          "amount": "Сумма",
          "date": "Дата",
          "staff": "Сотрудник"
        },
        "errors": {
          "load_data": "Не удалось загрузить данные о расходах",
          "load_reference": "Не удалось загрузить справочные данные"
        }
      },
      "staff": {
        "title": "Список сотрудников",
        "add_staff": "Добавить сотрудника",
        "edit_staff": "Редактировать сотрудника",
        "active_members": "{{count}} активных сотрудников",
        "items_count": "{{count}} позиций",
        "medicines_title": "Лекарства / рецепты",
        "medicines_add": "Добавить лекарство",
        "medicines_placeholder": "Введите название лекарства",
        "actions": {
          "pay": "Выплатить",
          "view": "Открыть",
          "edit": "Изменить"
        },
        "table_meta": {
          "base_commission": "Оклад/комиссия",
        "total_earned": "К выплате (текущий)",
        "actions": "Действия"
      },
        "pay_modal": {
          "title": "Выплата зарплаты: {{name}}",
          "base_salary": "Базовый оклад",
          "commission": "Комиссия",
          "adjustments": "Корректировки",
          "total": "Итого",
          "processing": "Обработка...",
          "confirm": "Подтвердить выплату"
        },
        "form": {
          "first_name": "Имя",
          "last_name": "Фамилия",
          "commission_rate": "Ставка комиссии (%)",
          "base_hourly_salary": "Базовый/почасовой оклад",
          "phone": "Телефон",
          "email": "Эл. почта"
        },
        "table": {
          "name": "Имя",
          "role": "Роль",
          "email": "Эл. почта",
          "status": "Статус"
        },
        "roles": {
          "doctor": "Врач",
          "assistant": "Ассистент",
          "administrator": "Администратор",
          "janitor": "Уборщик",
          "nurse": "Медсестра",
          "admin": "Админ",
          "receptionist": "Регистратор"
        },
        "errors": {
          "load_staff": "Не удалось загрузить список сотрудников",
          "load_medicines": "Не удалось загрузить лекарства",
          "add_medicine": "Не удалось добавить лекарство",
          "remove_medicine": "Не удалось удалить лекарство"
        }
      },
      "staff_role": {
        "title_fallback": "Сотрудник",
        "system_error": "СИСТЕМНАЯ ОШИБКА: {{error}}",
        "timesheet_log": "Журнал смен",
        "entries_count": "{{count}} записей",
        "headers": {
          "date": "Дата",
          "start": "Начало",
          "end": "Конец",
          "hours": "Часы",
          "actions": "Действия"
        },
        "salary_summary": "Сводка по зарплате",
        "recording": "Сохранение...",
        "record_salary": "Провести выплату",
        "salary_documents": "Зарплатные документы",
        "signed_reports": "Подписанные отчёты",
        "search": "Поиск",
        "headers_docs": {
          "period": "Период",
          "signed_at": "Подписано",
          "signer": "Подписал",
          "file": "Файл",
          "action": "Действие"
        },
        "no_documents": "Зарплатные документы не найдены",
        "file_default": "salary-report.pdf",
        "view": "Просмотр",
        "download": "Скачать",
        "edit_shift": "Редактировать смену",
        "add_shift": "Добавить смену",
        "shift_date": "Дата",
        "shift_start": "Время начала",
        "shift_end": "Время окончания",
        "shift_note": "Примечание",
        "shift_placeholder": "Детали смены...",
        "update_shift": "Обновить смену",
        "saving": "Сохранение...",
        "confirm_delete_shift": "Вы уверены, что хотите удалить эту смену?",
        "errors": {
          "staff_not_found": "Сотрудник не найден.",
          "invalid_staff": "Выберите корректного сотрудника.",
          "timesheets_unavailable": "Табель недоступен для этого сотрудника.",
          "load_timesheets": "Не удалось загрузить табель",
          "load_documents": "Не удалось загрузить зарплатные документы",
          "download_document": "Не удалось скачать документ",
          "preview_document": "Не удалось открыть предпросмотр документа",
          "invalid_range": "Выберите корректный диапазон дат.",
          "no_hours": "За выбранный период часы не зафиксированы.",
          "required_shift_fields": "Укажите дату, время начала и окончания.",
          "invalid_time_range": "Время окончания должно быть позже времени начала.",
          "shift_not_found": "Смена не найдена.",
          "invalid_shift_data": "Введите корректные данные смены.",
          "save_shift": "Не удалось сохранить смену",
          "delete_shift": "Не удалось удалить смену"
        }
      },
      "auth": {
        "sign_in_title": "Войдите в свой аккаунт",
        "username": "Имя пользователя",
        "password": "Пароль",
        "sign_in": "Войти",
        "signing_in": "Вход…",
        "sign_out": "Выйти",
        "connection_error": "Ошибка соединения. Попробуйте ещё раз."
      },
      "patients": {
        "title": "Поиск пациента",
        "subtitle": "Поиск по имени или ID для просмотра истории",
        "search_label": "Пациент",
        "search_placeholder": "Фамилия, имя или ID...",
        "no_results": "Пациенты не найдены",
        "no_records": "Нет записей за выбранный период",
        "filter": "Применить",
        "back": "Назад к поиску",
        "records_title": "Записи о доходах",
        "chart_label": "Расходы",
        "trend_title": "Динамика расходов",
        "stats": {
          "total_paid": "Всего оплачено",
          "visits": "Визиты",
          "avg_visit": "Среднее / визит",
          "lab_cost": "Лаб. расходы",
          "last_visit": "Последний визит"
        },
        "table": {
          "date": "Дата",
          "doctor": "Врач",
          "amount": "Сумма",
          "lab_cost": "Лаб. расходы",
          "payment": "Оплата",
          "note": "Примечание"
        }
      },
      "schedule": {
        "today": "Сегодня",
        "add_shift": "Добавить смену",
        "stats": {
          "shifts": "Смены",
          "visible_staff": "Видимый персонал",
          "on_duty_now": "На смене сейчас",
          "roles": "Роли"
        },
        "section": {
          "doctors": "Врачи",
          "staff": "Персонал"
        },
        "add_income": "Записать доход",
        "todays_team": "Команда сегодня",
        "available_doctors": "Доступные врачи",
        "available_staff": "Доступный персонал",
        "all_scheduled": "Все запланированы",
        "empty_doctors": "На этот день нет запланированных врачей",
        "empty_staff": "На этот день нет запланированного персонала",
        "empty_hint": "Нажмите +, чтобы добавить кого-нибудь",
        "status": {
          "pending": "ОЖИДАЕТ"
        },
        "calendar": "Календарь",
        "on_duty_today": "На смене сегодня",
        "no_on_duty_today": "Сегодня никого на смене",
        "duty_item": "Д-р {{lastName}} — {{role}} {{start}}-{{end}}",
        "filters": {
          "no_staff": "Нет сотрудников по выбранным фильтрам"
        },
        "modal": {
          "edit_shift": "Редактировать смену",
          "new_shift": "Новая смена",
          "update_details": "ОБНОВЛЕНИЕ ДАННЫХ",
          "schedule_staff": "НАЗНАЧЕНИЕ СМЕНЫ",
          "staff_member": "Сотрудник",
          "start_time": "Время начала",
          "end_time": "Время окончания",
          "notes": "Примечания",
          "note_placeholder": "Детали смены...",
          "delete": "Удалить",
          "cancel": "Отмена",
          "save_shift": "Сохранить смену →"
        },
        "errors": {
          "save_shift": "Не удалось сохранить смену: {{message}}",
          "delete_shift": "Не удалось удалить смену: {{message}}",
          "confirm_delete": "Вы уверены, что хотите удалить эту смену?"
        }
      }
    }
  },
  cs: {
    translation: {
      "nav": {
        "overview": "Přehled",
        "workforce": "Zaměstnanci",
        "payroll": "Mzdy",
        "dashboard": "Nástěnka",
        "income": "Příjmy",
        "expenses": "Výdeje",
        "staff": "Personál",
        "my_income": "Můj příjem",
        "schedule": "Rozvrh",
        "patients": "Pacienti",
        "export": "Exportovat",
        "add_income": "Přidat příjem",
        "add_outcome": "Přidat výdej"
      },
      "common": {
        "period_active": "AKTIVNÍ OBDOBÍ",
        "search": "Hledat...",
        "cancel": "Zrušit",
        "save": "Uložit",
        "delete": "Smazat",
        "edit": "Upravit",
        "loading": "Načítání...",
        "error": "Došlo k chybě",
        "retry": "Zkusit znovu",
        "export_csv": "Exportovat CSV",
        "export_pdf": "Exportovat PDF",
        "view": "Zobrazit",
        "none": "Žádné",
        "never": "Nikdy"
      },
      "clinic": {
        "total_income": "Celkový příjem",
        "total_outcome": "Celkové výdeje",
        "payroll_due": "K výplatě",
        "net_profit": "Čistý zisk",
        "active_staff": "Aktivní personál",
        "unique_patients": "Unikátní pacienti",
        "daily_pnl": "Denní P&L",
        "daily_income_outcome": "Denní příjmy vs výdeje",
        "last_30_days": "Posledních 30 dní",
        "period_meta": "Statistiky za {{period}}",
        "sections": {
          "financial": "Finanční přehled",
          "patients": "Informace o pacientech",
          "doctors": "Výkon lékařů",
          "expenses": "Analýza výdejů",
          "operations": "Provozní zdraví"
        },
        "financial": {
          "net_profit": "Čistý zisk",
          "income_trend": "Trend příjmů",
          "expense_trend": "Trend výdejů",
          "payment_ratio": "Poměr hotovost vs karta",
          "lab_ratio": "Náklady na lab. % z příjmů"
        },
        "patients": {
          "unique": "Unikátní pacienti",
          "new": "Noví pacienti",
          "returning": "Vracející se pacienti",
          "avg_visit": "Průměrný příjem na návštěvu",
          "top_spenders": "Nejvíce platící pacienti",
          "patient": "Pacient",
          "total_spend": "Celkem zaplaceno",
          "visits": "Návštěvy"
        },
        "doctors": {
          "doctor": "Lékař",
          "revenue": "Tržby",
          "visits": "Návštěvy",
          "avg_visit": "Průměrná hodnota návštěvy"
        },
        "expenses": {
          "salary_ratio": "Mzdové náklady % z příjmů",
          "by_category": "Výdeje podle kategorií",
          "category": "Kategorie",
          "total": "Celkem",
          "trend": "Meziměsíční výdeje",
          "month": "Měsíc"
        },
        "operations": {
          "staff": "Personál",
          "days_since_salary": "Dní od poslední výplaty",
          "busiest_days": "Nejvytíženější dny",
          "day": "Den",
          "visits": "Návštěvy",
          "outstanding_commission": "Nevyplacené provize lékařů",
          "amount": "Částka"
        },
        "weekdays": {
          "sun": "Neděle",
          "mon": "Pondělí",
          "tue": "Úterý",
          "wed": "Středa",
          "thu": "Čtvrtek",
          "fri": "Pátek",
          "sat": "Sobota"
        },
        "chart": {
          "income": "PŘÍJEM",
          "outcome": "VÝDEJ",
          "profit": "ZISK"
        },
        "day_details": {
          "failed_load": "Nepodařilo se načíst podrobnosti o dni",
          "back_to_dashboard": "Zpět na nástěnku",
          "day_overview": "Přehled dne",
          "highest_earning_doctor": "Nejvýdělečnější lékař",
          "revenue_breakdown": "Rozpis tržeb",
          "no_data": "Nejsou k dispozici žádná data"
        },
        "errors": {
          "load_dashboard": "Nepodařilo se načíst nástěnku"
        }
      },
      "income": {
        "title": "Správa příjmů",
        "trend_title": "Trend příjmů",
        "date_range": {
          "from": "OD",
          "to": "DO"
        },
        "period_selector": "Výběr období",
        "period_meta": "Statistiky za {{period}}",
        "period": {
          "year": "Rok",
          "month": "Měsíc",
          "week": "Týden",
          "day": "Den",
          "custom": "Vlastní"
        },
        "stats": {
          "total": "Celkový příjem",
          "records": "Počet záznamů",
          "avg": "Průměr na pacienta"
        },
        "form": {
          "add_record": "Přidat záznam o příjmu",
          "patient": "Pacient",
          "doctor": "Lékař",
          "amount": "Částka",
          "payment_method": "Způsob platby",
          "note": "Poznámka",
          "cash": "Hotovost",
          "card": "Karta",
          "new_patient": "Příjmení nového pacienta",
          "submit": "Zaznamenat transakci",
          "lab_work": "Laboratorní práce",
          "lab_required": "Vyžadována extra laboratorní práce",
          "lab_cost": "Poplatek za lab.",
          "lab_note": "Poznámka k lab.",
          "lab_cost_note": "* Bude odečteno z provize lékaře",
          "patient_compact_label": "Pacient (Příjmení Jméno)",
          "more_details": "Více podrobností",
          "phone": "Telefonní číslo",
          "street": "Ulice",
          "city": "Město",
          "zip": "PSČ",
          "receipt_issued": "Účtenka vydána",
          "receipt_reason": "Důvod účtenky",
          "receipt_note": "Poznámka k účtence",
          "receipt_medicine": "Léky / recepty",
          "select_reason": "Vyberte důvod...",
          "date": "Datum",
          "select_doctor_placeholder": "Vyberte lékaře..."
        },
        "banner": {
          "found_basic": "Nalezeno: {{name}} – Celkem zaplaceno: {{total}} Kč",
          "found_with_last": "Nalezeno: {{name}} – Celkem zaplaceno: {{total}} Kč, Poslední ošetření: {{doctor}}, {{date}}",
          "new_patient": "Bude vytvořen nový pacient"
        },
        "validation": {
          "patient_invalid": "Zadejte Příjmení nebo Příjmení Jméno",
          "doctor_required": "Vyberte lékaře",
          "amount_invalid": "Zadejte kladnou částku",
          "lab_cost_required": "Zadejte poplatek za lab.",
          "lab_note_required": "Zadejte poznámku k lab.",
          "receipt_note_required": "Poznámka k účtence je povinná"
        },
        "toast": {
          "recorded": "Příjem zaznamenán"
        },
        "receipt_reason_insurance": "Pojištění",
        "receipt_reason_warranty": "Záruka",
        "receipt_reason_customer_request": "Žádost zákazníka",
        "receipt_reason_accounting": "Účetnictví",
        "empty_state": "Žádné transakce pro vybrané období",
        "table": {
          "date": "Datum",
          "patient": "Pacient",
          "doctor": "Lékař",
          "method": "Metoda",
          "amount": "Částka",
          "note": "Poznámka",
          "status": "Stav",
          "paid": "Zaplaceno",
          "unpaid": "Nezaplaceno"
        },
        "errors": {
          "load_records": "Nepodařilo se načíst záznamy o příjmech",
          "invalid_patient": "Zadejte platné jméno pacienta",
          "patient_not_found": "Vybraný pacient nebyl nalezen",
          "invalid_doctor": "Vyberte platného lékaře",
          "invalid_amount": "Částka musí být větší než nula",
          "invalid_payment_method": "Vyberte způsob platby",
          "lab_cost_required": "Poplatek za lab. je povinný",
          "invalid_lab_cost": "Poplatek za lab. musí být kladné číslo",
          "lab_note_required": "Poznámka k lab. je povinná",
          "receipt_note_required": "Poznámka k účtence je povinná"
        }
      },
      "outcome": {
        "title": "Správa výdejů",
        "history_title": "Historie výdejů",
        "expenses": "Výdeje",
        "salaries": "Mzdy",
        "salary_panel": {
          "breakdown": "Rozpis mzdy",
          "period": "Období",
          "total_hours": "Celkem hodin",
          "base_rate": "Základní sazba",
          "calculated_salary": "Vypočítaná mzda",
          "last_payment": "Poslední platba",
          "never": "Nikdy",
          "base_salary": "Základní plat",
          "commission": "Provize ({{rate}}% z {{income}})",
          "lab_fees_deduction": "Srážka za lab. poplatky",
          "adjustments": "Úpravy",
          "total_estimated": "Celkem odhad",
          "unpaid_patients": "Nezaplacení pacienti ({{count}})"
        },
        "salary_notes": {
          "title": "Poznámky k platbě mzdy",
          "total": "{{count}} celkem",
          "loading": "Načítání poznámek...",
          "empty": "Žádné poznámky k mzdě pro tohoto zaměstnance.",
          "prev": "Předchozí",
          "next": "Další"
        },
        "signature": {
          "title": "Podpis mzdového výkazu",
          "close": "Zavřít",
          "signer_name": "Jméno podepisujícího",
          "signer_placeholder": "Zadejte celé jméno",
          "digital_signature": "Digitální podpis",
          "clear": "Vymazat",
          "record_and_sign": "Zaznamenat mzdu a podepsat",
          "recording": "Zaznamenávání..."
        },
        "hints": {
          "adjust_amount": "Tuto částku můžete upravit (zaokrouhlit nahoru/dolů) podle potřeby."
        },
        "warnings": {
          "reset_counter": "Varování: Zpracování této platby vynuluje počítadlo tržeb zaměstnance."
        },
        "form": {
          "add_expense": "Přidat výdej",
          "add_salary": "Přidat mzdu",
          "category": "Kategorie",
          "amount": "Částka",
          "date": "Datum",
          "vendor": "Dodavatel",
          "description": "Popis",
          "staff": "Zaměstnanec",
          "note": "Poznámka",
          "submit_expense": "Zaznamenat výdej",
          "submit_salary": "Zaznamenat mzdu"
        },
        "table": {
          "category": "Kategorie",
          "vendor": "Dodavatel",
          "amount": "Částka",
          "date": "Datum",
          "staff": "Zaměstnanec"
        },
        "errors": {
          "load_data": "Nepodařilo se načíst údaje o výdejích",
          "load_reference": "Nepodařilo se načíst referenční údaje"
        }
      },
      "staff": {
        "title": "Adresář personálu",
        "add_staff": "Přidat personál",
        "edit_staff": "Upravit personál",
        "active_members": "{{count}} aktivních členů",
        "items_count": "{{count}} položek",
        "medicines_title": "Léky / recepty",
        "medicines_add": "Přidat lék",
        "medicines_placeholder": "Zadejte název léku",
        "actions": {
          "pay": "Zaplatit",
          "view": "Zobrazit",
          "edit": "Upravit"
        },
        "table_meta": {
          "base_commission": "Základ/Provize",
          "total_earned": "Nezaplacená mzda",
          "actions": "Akce"
        },
        "pay_modal": {
          "title": "Vyplatit mzdu: {{name}}",
          "base_salary": "Základní plat",
          "commission": "Provize",
          "adjustments": "Úpravy",
          "total": "Celkem",
          "processing": "Zpracování...",
          "confirm": "Potvrdit platbu"
        },
        "form": {
          "first_name": "Jméno",
          "last_name": "Příjmení",
          "commission_rate": "Sazba provize (%)",
          "base_hourly_salary": "Základní/Hodinová mzda",
          "phone": "Telefon",
          "email": "Email"
        },
        "table": {
          "name": "Jméno",
          "role": "Role",
          "email": "Email",
          "status": "Stav"
        },
        "roles": {
          "doctor": "Lékař",
          "assistant": "Asistent",
          "administrator": "Administrátor",
          "janitor": "Uklízeč",
          "nurse": "Sestra",
          "admin": "Admin",
          "receptionist": "Recepční"
        },
        "errors": {
          "load_staff": "Nepodařilo se načíst adresář personálu",
          "load_medicines": "Nepodařilo se načíst léky",
          "add_medicine": "Nepodařilo se přidat lék",
          "remove_medicine": "Nepodařilo se odebrat lék"
        }
      },
      "staff_role": {
        "title_fallback": "Člen personálu",
        "system_error": "SYSTÉMOVÁ CHYBA: {{error}}",
        "timesheet_log": "Protokol docházky",
        "entries_count": "{{count}} záznamů",
        "headers": {
          "date": "Datum",
          "start": "Začátek",
          "end": "Konec",
          "hours": "Hodiny",
          "actions": "Akce"
        },
        "salary_summary": "Shrnutí mzdy",
        "recording": "Zaznamenávání...",
        "record_salary": "Zaznamenat mzdu",
        "salary_documents": "Mzdové dokumenty",
        "signed_reports": "Podepsané výkazy",
        "search": "Hledat",
        "headers_docs": {
          "period": "Období",
          "signed_at": "Podepsáno v",
          "signer": "Podepsal",
          "file": "Soubor",
          "action": "Akce"
        },
        "no_documents": "Nebyly nalezeny žádné mzdové dokumenty",
        "file_default": "mzdovy-vykaz.pdf",
        "view": "Zobrazit",
        "download": "Stáhnout",
        "edit_shift": "Upravit směnu",
        "add_shift": "Přidat směnu",
        "shift_date": "Datum",
        "shift_start": "Čas začátku",
        "shift_end": "Čas konce",
        "shift_note": "Poznámka",
        "shift_placeholder": "Podrobnosti směny...",
        "update_shift": "Aktualizovat směnu",
        "saving": "Ukládání...",
        "confirm_delete_shift": "Opravdu chcete tuto směnu smazat?",
        "errors": {
          "staff_not_found": "Člen personálu nebyl nalezen.",
          "invalid_staff": "Vyberte platného člena personálu.",
          "timesheets_unavailable": "Docházkové listy pro tohoto člena nejsou k dispozici.",
          "load_timesheets": "Nepodařilo se načíst docházkové listy",
          "load_documents": "Nepodařilo se načíst mzdové dokumenty",
          "download_document": "Nepodařilo se stáhnout dokument",
          "preview_document": "Nepodařilo se otevřít náhled dokumentu",
          "invalid_range": "Vyberte platný rozsah dat.",
          "no_hours": "Pro vybrané období nebyly zaznamenány žádné hodiny.",
          "required_shift_fields": "Zadejte datum, čas začátku a čas konce.",
          "invalid_time_range": "Čas konce musí být po čase začátku.",
          "shift_not_found": "Směna nebyla nalezena.",
          "invalid_shift_data": "Zadejte platné údaje o směně.",
          "save_shift": "Nepodařilo se uložit směnu",
          "delete_shift": "Nepodařilo se smazat směnu"
        }
      },
      "auth": {
        "sign_in_title": "Přihlaste se ke svému účtu",
        "username": "Uživatelské jméno",
        "password": "Heslo",
        "sign_in": "Přihlásit se",
        "signing_in": "Přihlašování…",
        "sign_out": "Odhlásit se",
        "connection_error": "Chyba připojení. Zkuste to prosím znovu."
      },
      "patients": {
        "title": "Vyhledávání pacientů",
        "subtitle": "Vyhledejte podle jména nebo ID pro zobrazení historie",
        "search_label": "Pacient",
        "search_placeholder": "Příjmení, jméno nebo ID...",
        "no_results": "Žádní pacienti nenalezeni",
        "no_records": "Žádné záznamy pro vybrané období",
        "filter": "Použít",
        "back": "Zpět na vyhledávání",
        "records_title": "Záznamy příjmů",
        "chart_label": "Výdeje",
        "trend_title": "Trend výdejů",
        "stats": {
          "total_paid": "Celkem zaplaceno",
          "visits": "Návštěvy",
          "avg_visit": "Průměr / návštěva",
          "lab_cost": "Lab. náklady",
          "last_visit": "Poslední návštěva"
        },
        "table": {
          "date": "Datum",
          "doctor": "Lékař",
          "amount": "Částka",
          "lab_cost": "Lab. náklady",
          "payment": "Platba",
          "note": "Poznámka"
        }
      },
      "schedule": {
        "today": "Dnes",
        "add_shift": "Přidat směnu",
        "stats": {
          "shifts": "Směny",
          "visible_staff": "Viditelný personál",
          "on_duty_now": "Právě ve službě",
          "roles": "Role"
        },
        "section": {
          "doctors": "Lékaři",
          "staff": "Personál"
        },
        "add_income": "Zaznamenat příjem",
        "todays_team": "Dnešní tým",
        "available_doctors": "Dostupní lékaři",
        "available_staff": "Dostupný personál",
        "all_scheduled": "Všichni jsou naplánováni",
        "empty_doctors": "Na tento den nejsou naplánováni žádní lékaři",
        "empty_staff": "Na tento den není naplánován žádný personál",
        "empty_hint": "Klikněte na + pro přidání",
        "status": {
          "pending": "ČEKAJÍCÍ"
        },
        "calendar": "Kalendář",
        "on_duty_today": "Dnes ve službě",
        "no_on_duty_today": "Dnes nikdo ve službě",
        "duty_item": "Dr. {{lastName}} – {{role}} {{start}}-{{end}}",
        "filters": {
          "no_staff": "Žádný personál neodpovídá filtrům"
        },
        "modal": {
          "edit_shift": "Upravit směnu",
          "new_shift": "Nová směna",
          "update_details": "AKTUALIZOVAT PODROBNOSTI",
          "schedule_staff": "NAPLÁNOVAT PERSONÁL",
          "staff_member": "Člen personálu",
          "start_time": "Čas začátku",
          "end_time": "Čas konce",
          "notes": "Poznámky",
          "note_placeholder": "Podrobnosti směny...",
          "delete": "Smazat",
          "cancel": "Zrušit",
          "save_shift": "Uložit směnu →"
        },
        "errors": {
          "save_shift": "Nepodařilo se uložit směnu: {{message}}",
          "delete_shift": "Nepodařilo se smazat směnu: {{message}}",
          "confirm_delete": "Opravdu chcete tuto směnu smazat?"
        }
      }
    }
  }
};

i18n
  .use(LanguageDetector)
  .use(initReactI18next)
  .init({
    resources,
    fallbackLng: 'ru',
    interpolation: {
      escapeValue: false
    }
  });

export default i18n;
