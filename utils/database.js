import mysql from 'mysql2/promise';
import pino from 'pino';

const logger = pino({ level: process.env.LOG_LEVEL || 'info' });

export class ChatDatabase {
    constructor() {
        this.pool = mysql.createPool({
            host: process.env.DB_HOST || 'mysql',
            user: process.env.DB_USER || 'root',
            password: process.env.DB_PASSWORD || 'secretpassword',
            database: process.env.DB_NAME || 'whatsapp_bot',
            waitForConnections: true,
            connectionLimit: 10,
            queueLimit: 0,
            ssl: false
        });
        this.init();
    }

    async init() {
        const maxRetries = 10;
        const retryDelay = 5000; // 5 segundos
        
        for (let i = 0; i < maxRetries; i++) {
            try {
                const connection = await this.pool.getConnection();
                logger.info('✅ Conexión a MySQL establecida');
                
                await connection.query(`SHOW TABLES LIKE 'chat_history'`);
                logger.info('✅ Tabla chat_history verificada');
                
                connection.release();
                return; // Salir si la conexión es exitosa
            } catch (err) {
                logger.warn({ 
                    attempt: i + 1, 
                    maxRetries, 
                    error: err.message 
                }, `⚠️ Intento ${i + 1}/${maxRetries} de conexión a BD falló`);
                
                if (i === maxRetries - 1) {
                    logger.error({ error: err }, '❌ Error inicializando BD después de todos los reintentos');
                    throw err;
                }
                
                // Esperar antes del siguiente intento
                logger.info(`⏳ Esperando ${retryDelay/1000}s antes del siguiente intento...`);
                await new Promise(resolve => setTimeout(resolve, retryDelay));
            }
        }
    }

    async testConnection() {
        try {
            const connection = await this.pool.getConnection();
            logger.info('🔌 Conexión a MySQL establecida');
            
            // Probar consulta simple
            const [result] = await connection.query('SELECT 1 as test');
            logger.info('✅ Consulta de prueba exitosa');
            
            connection.release();
            return true;
        } catch (err) {
            logger.error({
                error: err.message,
                code: err.code
            }, '❌ Error conectando a MySQL');
            throw err;
        }
    }

    async getHistory(phoneNumber, limit = 8) {
        try {
            logger.info({ phoneNumber, limit }, '📱 Obteniendo historial');
            const [rows] = await this.pool.query(
                'SELECT role, text FROM chat_history WHERE phone_number = ? ORDER BY timestamp DESC LIMIT ?',
                [phoneNumber, limit]
            );
            logger.info({ count: rows.length }, '📚 Mensajes recuperados');
            return rows.reverse();
        } catch (err) {
            logger.error({ error: err }, '❌ Error obteniendo historial');
            throw err;
        }
    }

    async addMessage(phoneNumber, role, text) {
        try {
            const query = 'INSERT INTO chat_history (phone_number, role, text) VALUES (?, ?, ?)';
            const values = [phoneNumber, role, text];
            
            logger.info({
                query,
                values
            }, '📝 Intentando insertar mensaje');
            
            const [result] = await this.pool.query(query, values);
            
            logger.info({
                insertId: result.insertId,
                affectedRows: result.affectedRows
            }, '✅ Mensaje insertado correctamente');
            
            return result;
        } catch (err) {
            logger.error({
                error: err.message,
                code: err.code,
                query: err.sql
            }, '❌ Error insertando mensaje');
            throw err;
        }
    }
    
    // ...resto de métodos existentes...
}