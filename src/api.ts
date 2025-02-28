import express from "express";
import multer from "multer";
import * as csv from 'fast-csv';
import pool from "./db.ts";
import format from 'pg-format';
import * as dotenv from "dotenv";

dotenv.config();

const api = express();
const port = process.env.PORT || 3000;
const upload = multer({
  dest: 'upload/',
})

// Type for storing the report object
export type report = {
  employeeId?: number,
  payPeriod?: {
    startDate: string,
    endDate: string,
  },
  amountPaid?: string
};


api.listen(port, () => {
  console.log(`[server]: Server is running at http://localhost:${port}`);
});

// API endpoint for uploading CSV file and storing the information in the DB
api.post('/updatePayRoll', upload.single('file'), async (req, res) => {
  if (req.file) {
    const fileName = req.file.originalname.replace(/\.csv$/, "")
    // Query to check if the file with same name has been previously uploaded, if the query returned with empty rows then that means it hasn't
    const queryUploaded = await pool.query(`SELECT * FROM csvuploaded WHERE csv_name like lower('%${req.file.originalname.replace(/\.csv$/, "")}%')`)

    if (queryUploaded.rows.length > 0) {
      res.status(406);
      res.send({
        "error": "CSV already uploaded previously or no file given"
      })
    } else {
      // Query to insert csv file name into the csvuploaded table to be compared to
      await pool.query("INSERT INTO csvuploaded(csv_name) VALUES($1)", [fileName]);

      // Array to store all of the values in the csv file
      const data: Array<[string, number, number, string]> = [];
      csv.parseFile(req.file.path)
        .on('data', row => {
          row[0] = row[0].split("/").reverse().join("-"); // Turns the inserted date format dd/mm/yyyy to yyyy-mm-dd
          row[1] = parseFloat(row[1])
          row[2] = parseInt(row[2])
          data.push(row)
        })
        .on('end', () => {
          data.shift(); // Ignores the first value in array since its used to store the column names
          // Query to bulk insert the values into the timesheet table
          pool.query(format('INSERT INTO timesheet (date_logged, hours_worked, employee_id, job_group) VALUES %L', data), []);
        });
      res.status(200)
      res.send();
    }
  } else {
    res.status(400);
    res.send({
      "error": "File not given"
    })
  }
})


// Function to initially the report object with its employee id and its pay period
const initReport = (prevYear: number, prevMonth: number, prevDay: number, prevEmployee: number) => {
  const daysInMonth = [31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31] // Does not account for leap years for now
  let tempReport: report = {};

  tempReport = {
    employeeId: prevEmployee,
  }

  if (prevDay > 15) {
    tempReport["payPeriod"] = {
      startDate: `${prevYear}-${prevMonth + 1}-16`,
      endDate: `${prevYear}-${prevMonth + 1}-${daysInMonth[prevMonth]}`
    }
  } else {
    tempReport["payPeriod"] = {
      startDate: `${prevYear}-${prevMonth + 1}-01`,
      endDate: `${prevYear}-${prevMonth + 1}-15`
    }
  }

  return tempReport;
}


// Function that returls a boolean representing if the prev employee, year, month are same as the current and if both  days are less than or greater than 16
// If it returns false then we know that we are tracking a new person or different pay period so we can save the current report and create a new one
const samePersonDate = (prevYear: number, prevMonth: number, prevDay: number, prevEmployee: number, year: number, month: number, day: number, employee: number) => {
  return ((prevYear == year) && (prevMonth == month) && (prevEmployee == employee) && ((prevDay < 16) == (day < 16)))
}


// API endpoint for displaying the current payroll data in the specified format
api.get('/getPayRoll', async (req, res) => {
  const employeeReports = [];
  // Query to get all rows from timesheet table
  const payrollQuery = await pool.query("SELECT * FROM timesheet");

  // Make sure to return when tables are empty
  if (payrollQuery.rowCount == 0) {
    res.status(400);
    res.send({
      "error": "Timesheet is empty"
    })
  } else {
    // Sorts the rows by year, month then employee id
    const sortedPayroll = payrollQuery.rows.sort((a, b) => a.date_logged.getFullYear() - b.date_logged.getFullYear() || a.date_logged.getMonth() - b.date_logged.getMonth() || a.employee_id - b.employee_id);
    let prevYear = sortedPayroll[0].date_logged.getFullYear();
    let prevMonth = sortedPayroll[0].date_logged.getMonth();
    let prevDay = sortedPayroll[0].date_logged.getDate();
    let prevEmployee = sortedPayroll[0].employee_id;
    let tempReport = initReport(prevYear, prevMonth, prevDay, prevEmployee);
    let tempPaid = 0;

    // For each element in the sortedPayroll array we compare its date and employee id to the date and employee id of temp report
    // If there is a difference in year, month, (curDate < 16) then we know that the current element is either a different person or pay period
    // We then, append the tempPaid to the report object and then push that to the employeeReport array that is sent back
    // We then set the prev Date and employee id to the values of the element and reset tempPaid
    // If there is no difference then we just increment tempPaid by the hours worked*(20 || 30) depending on the job group
    for (let i = 0; i < sortedPayroll.length; i++) {
      const year = sortedPayroll[i].date_logged.getFullYear();
      const month = sortedPayroll[i].date_logged.getMonth();
      const day = sortedPayroll[i].date_logged.getDate();
      const employee = sortedPayroll[i].employee_id;

      if (!samePersonDate(prevYear, prevMonth, prevDay, prevEmployee, year, month, day, employee)) {
        tempReport["amountPaid"] = `$${tempPaid}.00`;
        employeeReports.push(tempReport);
        prevYear = year;
        prevMonth = month;
        prevDay = day;
        prevEmployee = employee;
        tempReport = initReport(prevYear, prevMonth, prevDay, prevEmployee);
        tempPaid = 0;
      }

      if (sortedPayroll[i].job_group == "A") {
        tempPaid += sortedPayroll[i].hours_worked * 20;
      } else {
        tempPaid += sortedPayroll[i].hours_worked * 30;
      }
    }

    // Append the final report that gets missed
    tempReport["amountPaid"] = `$${tempPaid}.00`;
    employeeReports.push(tempReport)
    res.send({
      payrollReport: {
        employeeReports: employeeReports
      }
    })
  }

})

