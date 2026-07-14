const express = require('express');
const router = express.Router();
const bcrypt = require('bcryptjs');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { randomNickname } = require('./auth');

function isInstalled() {
    var lockFile = path.join(__dirname, '..', '.installed');
    return fs.existsSync(lockFile);
}

router.get('/', async (req, res) => {
    if (!isInstalled()) return res.redirect('/install');
    
    try {
        const db = require('../db');
        const [tables] = await db.query(
            "SELECT TABLE_NAME FROM information_schema.TABLES WHERE TABLE_SCHEMA = ? AND TABLE_NAME = 'users'",
            [process.env.DB_NAME]
        );
        if (tables.length === 0) return res.redirect('/install');
        if (req.session.user) return res.redirect('/lobby');
        res.redirect('/auth/login');
    } catch (error) {
        res.redirect('/install');
    }
});

// 通过分享链接加入房间
router.get('/join-room/:roomId', async (req, res) => {
    if (!isInstalled()) return res.redirect('/install');
    
    var roomId = req.params.roomId;
    
    // 已登录直接加入
    if (req.session.user) {
        var userId = req.session.user.id;
        
        try {
            var db = require('../db');
            var rooms = await db.query("SELECT * FROM rooms WHERE id = ? AND status != 'finished'", [roomId]);
            
            if (rooms[0].length === 0) {
                return res.render('error', { title: '错误', message: '房间不存在或已关闭' });
            }
            
            var room = rooms[0][0];
            var existingPlayer = await db.query('SELECT id FROM room_players WHERE room_id = ? AND user_id = ?', [roomId, userId]);
            if (existingPlayer[0].length > 0) {
                return res.redirect('/room/' + roomId);
            }
            
            var players = await db.query('SELECT COUNT(*) as count FROM room_players WHERE room_id = ?', [roomId]);
            if (players[0][0].count >= room.max_players) {
                return res.render('error', { title: '错误', message: '房间已满' });
            }
            
            var maxSeat = await db.query('SELECT COALESCE(MAX(seat_number), 0) + 1 as next_seat FROM room_players WHERE room_id = ?', [roomId]);
            await db.query('INSERT INTO room_players (room_id, user_id, seat_number) VALUES (?, ?, ?)', [roomId, userId, maxSeat[0][0].next_seat]);
            
            return res.redirect('/room/' + roomId);
        } catch (error) {
            return res.render('error', { title: '错误', message: '加入房间失败' });
        }
    }
    
    // 未登录，显示选择页面
    res.render('join-choice', {
        title: '加入房间',
        roomId: roomId
    });
});

// 快速进入后自动加入房间
router.get('/join-room/:roomId/quick', async (req, res) => {
    if (!isInstalled()) return res.redirect('/install');
    if (!req.session.user) return res.redirect('/join-room/' + req.params.roomId);
    
    var roomId = req.params.roomId;
    var userId = req.session.user.id;
    
    try {
        var db = require('../db');
        var rooms = await db.query("SELECT * FROM rooms WHERE id = ? AND status != 'finished'", [roomId]);
        
        if (rooms[0].length === 0) {
            return res.render('error', { title: '错误', message: '房间不存在或已关闭' });
        }
        
        var room = rooms[0][0];
        var existingPlayer = await db.query('SELECT id FROM room_players WHERE room_id = ? AND user_id = ?', [roomId, userId]);
        if (existingPlayer[0].length > 0) {
            return res.redirect('/room/' + roomId);
        }
        
        var players = await db.query('SELECT COUNT(*) as count FROM room_players WHERE room_id = ?', [roomId]);
        if (players[0][0].count >= room.max_players) {
            return res.render('error', { title: '错误', message: '房间已满' });
        }
        
        var maxSeat = await db.query('SELECT COALESCE(MAX(seat_number), 0) + 1 as next_seat FROM room_players WHERE room_id = ?', [roomId]);
        await db.query('INSERT INTO room_players (room_id, user_id, seat_number) VALUES (?, ?, ?)', [roomId, userId, maxSeat[0][0].next_seat]);
        
        req.session.showGuide = true;
        return res.redirect('/room/' + roomId);
    } catch (error) {
        return res.render('error', { title: '错误', message: '加入房间失败' });
    }
});

// 安装页面
router.get('/install', (req, res) => {
    if (isInstalled()) return res.redirect('/');
    
    var dbConfig = { db_host: 'localhost', db_port: '3306', db_user: 'root', db_password: '', db_name: 'card_game', admin_user: 'admin' };
    try {
        var envPath = path.join(__dirname, '..', '.env');
        if (fs.existsSync(envPath)) {
            var lines = fs.readFileSync(envPath, 'utf-8').split('\n');
            for (var i = 0; i < lines.length; i++) {
                var parts = lines[i].split('=');
                if (parts.length === 2) {
                    var k = parts[0].trim(), v = parts[1].trim();
                    if (k === 'DB_HOST') dbConfig.db_host = v;
                    if (k === 'DB_PORT') dbConfig.db_port = v;
                    if (k === 'DB_USER') dbConfig.db_user = v;
                    if (k === 'DB_NAME') dbConfig.db_name = v;
                }
            }
        }
    } catch (e) {}
    
    res.render('install', { title: '系统安装', error: req.query.error || null, success: null, ...dbConfig });
});

router.post('/install/test-connection', async (req, res) => {
    var { db_host, db_port, db_user, db_password, db_name } = req.body;
    try {
        var mysql = require('mysql2/promise');
        var connection = await mysql.createConnection({ host: db_host, port: parseInt(db_port) || 3306, user: db_user, password: db_password });
        var databases = await connection.query('SHOW DATABASES LIKE ?', [db_name]);
        var dbExists = databases[0].length > 0;
        await connection.end();
        res.json({ success: true, message: dbExists ? '连接成功！数据库已存在' : '连接成功！数据库将被创建' });
    } catch (error) {
        res.json({ success: false, message: '连接失败：' + error.message });
    }
});

router.post('/install', async (req, res) => {
    if (isInstalled() && !req.body.force_install) return res.redirect('/');
    
    var { db_host, db_port, db_user, db_password, db_name, admin_user, admin_password, admin_password_confirm, force_install } = req.body;
    
    if (admin_password !== admin_password_confirm) return res.redirect('/install?error=' + encodeURIComponent('两次密码不一致'));
    if (admin_password.length < 6) return res.redirect('/install?error=' + encodeURIComponent('密码至少6个字符'));
    
    try {
        var mysql = require('mysql2/promise');
        var connection = await mysql.createConnection({ host: db_host, port: parseInt(db_port) || 3306, user: db_user, password: db_password, multipleStatements: true });
        
        if (force_install) await connection.query('DROP DATABASE IF EXISTS `' + db_name + '`');
        await connection.query('CREATE DATABASE IF NOT EXISTS `' + db_name + '` DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci');
        await connection.query('USE `' + db_name + '`');
        
        await connection.query("CREATE TABLE IF NOT EXISTS users (id INT AUTO_INCREMENT PRIMARY KEY, username VARCHAR(50) UNIQUE NOT NULL, password VARCHAR(255) NOT NULL, nickname VARCHAR(50), avatar VARCHAR(255) DEFAULT 'default.png', total_games INT DEFAULT 0, wins INT DEFAULT 0, total_score BIGINT DEFAULT 0, created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP, updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4");
        await connection.query("CREATE TABLE IF NOT EXISTS admins (id INT AUTO_INCREMENT PRIMARY KEY, username VARCHAR(50) UNIQUE NOT NULL, password VARCHAR(255) NOT NULL, created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4");
        await connection.query("CREATE TABLE IF NOT EXISTS rooms (id INT AUTO_INCREMENT PRIMARY KEY, room_name VARCHAR(100) NOT NULL, creator_id INT NOT NULL, password VARCHAR(255), max_players INT DEFAULT 4, status ENUM('waiting','playing','finished') DEFAULT 'waiting', created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP, updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP, FOREIGN KEY (creator_id) REFERENCES users(id) ON DELETE CASCADE) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4");
        await connection.query("CREATE TABLE IF NOT EXISTS room_players (id INT AUTO_INCREMENT PRIMARY KEY, room_id INT NOT NULL, user_id INT NOT NULL, seat_number INT NOT NULL, current_score BIGINT DEFAULT 0, join_time TIMESTAMP DEFAULT CURRENT_TIMESTAMP, FOREIGN KEY (room_id) REFERENCES rooms(id) ON DELETE CASCADE, FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE, UNIQUE KEY unique_room_user (room_id, user_id)) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4");
        await connection.query("CREATE TABLE IF NOT EXISTS score_transfers (id INT AUTO_INCREMENT PRIMARY KEY, room_id INT NOT NULL, from_user_id INT NOT NULL, to_user_id INT NOT NULL, amount BIGINT NOT NULL, transfer_type ENUM('win','lose','transfer') DEFAULT 'transfer', created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP, FOREIGN KEY (room_id) REFERENCES rooms(id) ON DELETE CASCADE, FOREIGN KEY (from_user_id) REFERENCES users(id) ON DELETE CASCADE, FOREIGN KEY (to_user_id) REFERENCES users(id) ON DELETE CASCADE) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4");
        await connection.query("CREATE TABLE IF NOT EXISTS game_records (id INT AUTO_INCREMENT PRIMARY KEY, room_id INT NOT NULL, winner_id INT NOT NULL, total_pot BIGINT DEFAULT 0, game_date TIMESTAMP DEFAULT CURRENT_TIMESTAMP, FOREIGN KEY (room_id) REFERENCES rooms(id) ON DELETE CASCADE, FOREIGN KEY (winner_id) REFERENCES users(id) ON DELETE CASCADE) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4");
        
        var hashedPassword = await bcrypt.hash(admin_password, 10);
        var existingAdmin = await connection.query('SELECT id FROM admins WHERE username = ?', [admin_user]);
        if (existingAdmin[0].length > 0) {
            await connection.query('UPDATE admins SET password = ? WHERE username = ?', [hashedPassword, admin_user]);
        } else {
            await connection.query('INSERT INTO admins (username, password) VALUES (?, ?)', [admin_user, hashedPassword]);
        }
        
        var sessionSecret = crypto.randomBytes(32).toString('hex');
        var envContent = 'DB_HOST=' + db_host + '\nDB_PORT=' + (db_port || 3306) + '\nDB_USER=' + db_user + '\nDB_PASSWORD=' + db_password + '\nDB_NAME=' + db_name + '\nSESSION_SECRET=' + sessionSecret + '\nPORT=3000\nTIMEZONE=Asia/Shanghai\n';
        fs.writeFileSync(path.join(__dirname, '..', '.env'), envContent);
        fs.writeFileSync(path.join(__dirname, '..', '.installed'), 'installed');
        
        await connection.end();
        
        return res.render('install', { title: '系统安装', error: null, success: '安装完成！', admin_user: admin_user, db_host: db_host, db_port: db_port, db_user: db_user, db_name: db_name });
    } catch (error) {
        console.error('Install error:', error);
        return res.redirect('/install?error=' + encodeURIComponent('安装失败：' + error.message));
    }
});

router.get('/reinstall', (req, res) => {
    var lockFile = path.join(__dirname, '..', '.installed');
    if (fs.existsSync(lockFile)) fs.unlinkSync(lockFile);
    res.redirect('/install');
});

module.exports = router;