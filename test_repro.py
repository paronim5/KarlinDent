import os
import sys
from datetime import date, datetime, timedelta

# add backend to path
sys.path.append(os.path.abspath(os.path.join(os.path.dirname(__file__), "backend")))

from backend.app import create_app
from backend.db import get_connection

app = create_app()
with app.app_context():
    conn = get_connection()
    cur = conn.cursor()
    
    # 1. create non-doctor staff
    cur.execute("INSERT INTO staff (first_name, last_name, role_id, is_active, base_salary) VALUES ('Test', 'Assistant', 2, true, 200) RETURNING id")
    staff_id = cur.fetchone()[0]
    
    # 2. create shift
    now = datetime.now()
    cur.execute("""
        INSERT INTO shifts (staff_id, start_time, end_time, status) 
        VALUES (%s, %s, %s, 'accepted') RETURNING id
    """, (staff_id, now - timedelta(hours=5), now))
    shift_id = cur.fetchone()[0]
    
    conn.commit()
    
    # 3. call pay_salary
    with app.test_client() as client:
        payload = {
            "staff_id": staff_id,
            "payment_date": date.today().isoformat(),
            "from": (now - timedelta(days=1)).strftime("%Y-%m-%d"),
            "to": (now + timedelta(days=1)).strftime("%Y-%m-%d"),
            "signature": {
                "signer_name": "Test Assistant",
                "signature_data": "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAACklEQVR4nGMAAQAABQABDQottAAAAABJRU5ErkJggg==",
                "signed_at": date.today().isoformat()
            }
        }
        resp = client.post("/api/staff/salaries", json=payload)
        print("Response:", resp.status_code, resp.json)
        
    # 4. check outcome_records
    cur.execute("SELECT id, amount, description FROM outcome_records WHERE description LIKE %s", (f"%Salary payment for Test Assistant%",))
    outcomes = cur.fetchall()
    print("Outcome records:", outcomes)
    
    # 5. check salary_payments
    cur.execute("SELECT id, amount FROM salary_payments WHERE staff_id = %s", (staff_id,))
    salaries = cur.fetchall()
    print("Salary payments:", salaries)
    
    # Clean up
    conn.rollback()
