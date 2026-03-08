import psycopg2
import os
import sys

# Add the current directory to sys.path so we can import config
sys.path.append(os.path.dirname(os.path.abspath(__file__)))

from config import config

def wipe_data():
    print("Connecting to database...")
    try:
        conn = psycopg2.connect(dsn=config.database_dsn)
        cur = conn.cursor()
        
        print("Wiping data...")
        
        # Order matters due to foreign key constraints
        tables_to_truncate = [
            "income_records",
            "outcome_records",
            "salary_payments",
            "patients",
            "staff"
        ]
        
        for table in tables_to_truncate:
            print(f"Truncating {table}...")
            # CASCADE is needed if other tables reference these, but we are deleting them in order.
            # However, income_records references staff, salary_payments references staff.
            # So if we truncate staff, we need CASCADE.
            cur.execute(f"TRUNCATE TABLE {table} CASCADE;")
            
        conn.commit()
        print("Data wiped successfully.")
        
    except Exception as e:
        print(f"Error wiping data: {e}")
        if conn:
            conn.rollback()
    finally:
        if conn:
            conn.close()

if __name__ == "__main__":
    wipe_data()
