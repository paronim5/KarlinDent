# Loading Test Data onto the AWS Server

This guide walks you through cloning the project on your AWS server and loading the showcase data.

---

## Prerequisites

- AWS EC2 instance running (Ubuntu 22.04 recommended)
- Docker and Docker Compose installed
- Git installed
- Port 80 (or your app port) open in the security group

---

## Step 1 — Clone the repository

```bash
git clone <your-repo-url> karlindent
cd karlindent
```

---

## Step 2 — Configure environment

Copy the example env file and fill in your values:

```bash
cp .env.example .env
nano .env
```

Set at minimum:
```
POSTGRES_USER=virex
POSTGRES_PASSWORD=yourpassword
POSTGRES_DB=karlindent
```

---

## Step 3 — Build and start the app

```bash
docker compose up -d --build
```

Wait for all containers to be healthy (usually 30–60 seconds):

```bash
docker compose ps
```

All services should show `Up` or `healthy`.

---

## Step 4 — Load the test data

Run the SQL file against the database container:

```bash
docker compose exec -T db psql -U virex -d karlindent < test_data.sql
```

You should see output like:
```
INSERT 0 4
INSERT 0 6
INSERT 0 5
...
COMMIT
```

If you see any errors, check that the database schema was already applied (migrations run automatically on startup).

---

## Step 5 — Set staff passwords

The test data does not include password hashes. You must set them manually.

### Generate a bcrypt hash

```bash
docker compose exec backend python3 -c \
  "import bcrypt; print(bcrypt.hashpw(b'Demo1234', bcrypt.gensalt(12)).decode())"
```

Copy the output hash (it starts with `$2b$12$...`).

### Apply the hash to all staff

```bash
docker compose exec db psql -U virex -d karlindent -c \
  "UPDATE staff SET password_hash = '\$2b\$12\$YOUR_HASH_HERE';"
```

> **Tip:** Set all accounts to the same demo password for a showcase — easy to remember and share with your friend.

### Staff accounts after loading

| Name           | Email                              | Role          |
|----------------|------------------------------------|---------------|
| Dr. James Porter   | james.porter@karlindent.cz     | Doctor        |
| Dr. Sarah Mitchell | sarah.mitchell@karlindent.cz   | Doctor        |
| Emily Carter       | emily.carter@karlindent.cz     | Assistant     |
| David Brown        | david.brown@karlindent.cz      | Assistant     |
| Laura Wilson       | laura.wilson@karlindent.cz     | Administrator |

---

## Step 6 — Open the app

Navigate to your server's IP or domain in a browser:

```
http://<your-server-ip>
```

Log in with any of the staff emails and the demo password you set.

---

## What the test data includes

| Section           | Detail                                         |
|-------------------|------------------------------------------------|
| Period            | October 2025 – March 2026 (6 months)           |
| Staff             | 5 members (2 doctors, 2 assistants, 1 admin)   |
| Patients          | 20 patients                                    |
| Income records    | ~130 treatment records                         |
| Outcome records   | 35 expense records (rent, utilities, materials) |
| Salary payments   | October 2025 – February 2026 (March pending)   |
| Timesheets        | Full Mon–Fri coverage for all 6 months         |
| Shifts / Schedule | Mar 17–28 (past accepted + upcoming pending)   |

---

## Resetting the data

To wipe everything and start fresh:

```bash
docker compose down -v
docker compose up -d --build
docker compose exec -T db psql -U virex -d karlindent < test_data.sql
```

The `-v` flag removes the database volume so you get a clean state.

---

## Troubleshooting

**Error: relation does not exist**
The schema has not been applied yet. Wait a few more seconds for the backend to run migrations, then retry the load command.

**Error: duplicate key value**
The data is already loaded. Either reset (see above) or skip — the `ON CONFLICT DO NOTHING` clauses mean partial reloads are safe.

**Password login fails**
Make sure you ran the `UPDATE staff SET password_hash = ...` step. Accounts with no hash cannot log in.
