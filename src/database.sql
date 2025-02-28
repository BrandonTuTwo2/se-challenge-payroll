CREATE DATABASE payroll;

\c payroll

CREATE TABLE csvuploaded(
    csv_id SERIAL PRIMARY KEY,
    csv_name VARCHAR(255),
    uploaded_at timestamp NOT NULL DEFAULT NOW()
);

CREATE TABLE timesheet(
    entry_id SERIAL PRIMARY KEY,
    hours_worked REAL NOT NULL,
    employee_id INTEGER NOT NULL,
    job_group VARCHAR(255),
    date_logged DATE NOT NULL 
);