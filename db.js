const mysql = require('mysql2/promise');
const dotenv = require('dotenv');

dotenv.config();

const poolConfig = {
    host: process.env.DB_HOST || 'localhost',
    port: parseInt(process.env.DB_PORT) || 3306,
    user: process.env.DB_USER || 'root',
    password: process.env.DB_PASSWORD || '',
    database: process.env.DB_NAME || 'card_game',
    waitForConnections: true,
    connectionLimit: 10,
    queueLimit: 0,
    charset: 'utf8mb4'
};

if (process.env.DB_SSL === 'true') {
    poolConfig.ssl = { rejectUnauthorized: false };
}

const pool = mysql.createPool(poolConfig);

pool.getConnection()
    .then(connection => {
        console.log('数据库连接成功');
        connection.release();
    })
    .catch(err => {
        console.error('数据库连接失败:', err.message);
    });

module.exports = pool;