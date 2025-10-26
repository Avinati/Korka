const mysql = require('mysql2/promise');

const dbConfig = {
host:'151.241.228.247',
  user:'admin',
  password: 'root',
  database:'Korka',
  waitForConnections: true, 
  connectionLimit: 10
};

const pool = mysql.createPool(dbConfig);

const checkConnection = async () => {
    try {
        const connection = await pool.getConnection();
        const [rows] = await connection.execute('SELECT 1 AS result'); 
        connection.release(); 
        console.log('✅ База данных подключена успешно');
        return true;
    } catch (error) {
        console.log('❌ Ошибка подключения к базе данных:', error.message);
        return false;
    }
}


module.exports = {
    pool,
    checkConnection
};

