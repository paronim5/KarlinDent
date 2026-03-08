-- Insert additional staff roles if they don't exist
INSERT INTO staff_roles (name)
VALUES ('assistant'), ('janitor'), ('administrator')
ON CONFLICT (name) DO NOTHING;
