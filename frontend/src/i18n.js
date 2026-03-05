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
        "export": "Export",
        "add_income": "Add Income"
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
        "export_csv": "Export CSV",
        "export_pdf": "Export PDF"
      },
      "clinic": {
        "total_income": "Total Income",
        "payroll_due": "Payroll Due",
        "net_profit": "Net Profit",
        "active_staff": "Active Staff",
        "daily_pnl": "Daily P&L",
        "last_30_days": "Last 30 days",
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
        "date_range": {
          "from": "FROM",
          "to": "TO"
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
          "lab_cost": "Lab Cost",
          "lab_cost_note": "* Will be deducted from doctor's commission"
        },
        "table": {
          "date": "Date",
          "patient": "Patient",
          "doctor": "Doctor",
          "method": "Method",
          "amount": "Amount",
          "note": "Note"
        },
        "errors": {
          "load_records": "Unable to load income records"
        }
      },
      "outcome": {
        "title": "Expense Management",
        "expenses": "Expenses",
        "salaries": "Salaries",
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
        "table": {
          "name": "Name",
          "role": "Role",
          "email": "Email",
          "status": "Status"
        },
        "roles": {
          "doctor": "Doctor",
          "nurse": "Nurse",
          "admin": "Admin",
          "receptionist": "Receptionist"
        },
        "errors": {
          "load_staff": "Unable to load staff directory"
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
        "export": "Экспорт",
        "add_income": "Добавить доход"
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
        "export_csv": "Экспорт CSV",
        "export_pdf": "Экспорт PDF"
      },
      "clinic": {
        "total_income": "Общий доход",
        "payroll_due": "К выплате",
        "net_profit": "Чистая прибыль",
        "active_staff": "Активные сотрудники",
        "daily_pnl": "Дневной P&L",
        "last_30_days": "Последние 30 дней",
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
        "date_range": {
          "from": "С",
          "to": "ПО"
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
          "lab_cost": "Стоимость лаб.",
          "lab_cost_note": "* Будет вычтено из комиссии врача"
        },
        "table": {
          "date": "Дата",
          "patient": "Пациент",
          "doctor": "Врач",
          "method": "Метод",
          "amount": "Сумма",
          "note": "Прим."
        },
        "errors": {
          "load_records": "Не удалось загрузить записи о доходах"
        }
      },
      "outcome": {
        "title": "Управление расходами",
        "expenses": "Расходы",
        "salaries": "Зарплаты",
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
        "table": {
          "name": "Имя",
          "role": "Роль",
          "email": "Email",
          "status": "Статус"
        },
        "roles": {
          "doctor": "Врач",
          "nurse": "Медсестра",
          "admin": "Админ",
          "receptionist": "Регистратор"
        },
        "errors": {
          "load_staff": "Не удалось загрузить список сотрудников"
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
    fallbackLng: 'en',
    interpolation: {
      escapeValue: false
    }
  });

export default i18n;
