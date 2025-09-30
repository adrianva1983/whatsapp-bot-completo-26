CREATE DATABASE IF NOT EXISTS whatsapp_bot;
USE whatsapp_bot;

DROP TABLE IF EXISTS chat_history;
CREATE TABLE chat_history (
    id BIGINT AUTO_INCREMENT PRIMARY KEY,
    phone_number VARCHAR(50) NOT NULL,
    role VARCHAR(20) NOT NULL,
    text TEXT NOT NULL,
    timestamp TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    INDEX idx_phone_timestamp (phone_number, timestamp)
) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;