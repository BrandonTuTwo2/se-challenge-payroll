import pg from 'pg'
import * as dotenv from "dotenv";

dotenv.config();
const { Pool } = pg


const pool = new Pool({
    user: process.env.POSTGRESQL_NAME, //remember to put in dotenv 
    password: process.env.POSTGRESQL_PASS, //remember to put in dotenv 
    host: "localhost",
    port: 5432,
    database: "payroll" //probably maybe should be in dotenv
});

export default pool;


