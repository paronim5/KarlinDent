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
          "day": "Day"
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
          "found_basic": "Found: {{name}} – Total paid: €{{total}}",
          "found_with_last": "Found: {{name}} – Total paid: €{{total}}, Last treatment: {{doctor}}, {{date}}",
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
      "schedule": {
        "today": "Today",
        "add_shift": "+ Add Shift",
        "stats": {
          "shifts": "Shifts",
          "visible_staff": "Visible staff",
          "on_duty_now": "On duty now",
          "roles": "Roles"
        },
        "calendar": "Calendar",
        "on_duty_today": "On Duty Today",
        "no_on_duty_today": "No doctors on duty today",
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
          "day": "День"
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
          "found_basic": "Найден пациент: {{name}} — оплачено всего: €{{total}}",
          "found_with_last": "Найден пациент: {{name}} — оплачено всего: €{{total}}, последнее лечение: {{doctor}}, {{date}}",
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
      "schedule": {
        "today": "Сегодня",
        "add_shift": "+ Добавить смену",
        "stats": {
          "shifts": "Смены",
          "visible_staff": "Видимый персонал",
          "on_duty_now": "На смене сейчас",
          "roles": "Роли"
        },
        "calendar": "Календарь",
        "on_duty_today": "На смене сегодня",
        "no_on_duty_today": "Сегодня нет дежурных врачей",
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
