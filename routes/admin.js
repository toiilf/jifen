const express = require('express');
const router = express.Router();
const bcrypt = require('bcryptjs');
const db = require('../db');
const { isAdmin } = require('../middleware/auth');

// 管理员登录页面
router.get('/login', (req, res) => {
    res.render('admin_login', {
        title: '管理员登录',
        error: null
    });
});

// 管理员登录处理
router.post('/login', async (req, res) => {
    const { username, password } = req.body;
    
    try {
        const [admins] = await db.query(
            'SELECT * FROM admins WHERE username = ?',
            [username]
        );
        
        if (admins.length === 0) {
            return res.render('admin_login', {
                title: '管理员登录',
                error: '用户名或密码错误'
            });
        }
        
        const admin = admins[0];
        const isMatch = await bcrypt.compare(password, admin.password);
        
        if (!isMatch) {
            return res.render('admin_login', {
                title: '管理员登录',
                error: '用户名或密码错误'
            });
        }
        
        req.session.isAdmin = true;
        req.session.adminUser = {
            id: admin.id,
            username: admin.username
        };
        
        res.redirect('/admin');
    } catch (error) {
        console.error('Admin login error:', error);
        res.render('admin_login', {
            title: '管理员登录',
            error: '登录失败，请稍后再试'
        });
    }
});

// 管理员后台主页
router.get('/', isAdmin, async (req, res) => {
    try {
        // 系统统计
        const [userStats] = await db.query('SELECT COUNT(*) as total_users FROM users');
        const [roomStats] = await db.query(`
            SELECT 
                COUNT(*) as total_rooms,
                SUM(CASE WHEN status = 'waiting' THEN 1 ELSE 0 END) as waiting_rooms,
                SUM(CASE WHEN status = 'playing' THEN 1 ELSE 0 END) as playing_rooms,
                SUM(CASE WHEN status = 'finished' THEN 1 ELSE 0 END) as finished_rooms
            FROM rooms
        `);
        const [gameStats] = await db.query('SELECT COUNT(*) as total_games FROM game_records');
        const [adminStats] = await db.query('SELECT COUNT(*) as admin_count FROM admins');
        
        // 所有用户
        const [users] = await db.query('SELECT * FROM users ORDER BY created_at DESC');
        
        // 所有房间
        const [rooms] = await db.query(`
            SELECT r.*, u.nickname as creator_name,
                   (SELECT COUNT(*) FROM room_players WHERE room_id = r.id) as player_count
            FROM rooms r
            JOIN users u ON r.creator_id = u.id
            ORDER BY r.created_at DESC
        `);
        
        // 所有管理员
        const [admins] = await db.query('SELECT id, username, created_at FROM admins ORDER BY created_at DESC');
        
        res.render('admin', {
            title: '管理员后台',
            stats: {
                total_users: userStats[0].total_users,
                total_rooms: roomStats[0].total_rooms,
                waiting_rooms: roomStats[0].waiting_rooms,
                playing_rooms: roomStats[0].playing_rooms,
                finished_rooms: roomStats[0].finished_rooms,
                total_games: gameStats[0].total_games,
                admin_count: adminStats[0].admin_count
            },
            users: users,
            rooms: rooms,
            admins: admins
        });
    } catch (error) {
        console.error('Admin error:', error);
        res.status(500).render('error', {
            title: '错误',
            message: '加载管理后台失败'
        });
    }
});

// ============ 数据加载 API ============

// 获取统计信息
router.get('/api/stats', isAdmin, async (req, res) => {
    try {
        const [userStats] = await db.query('SELECT COUNT(*) as total_users FROM users');
        const [roomStats] = await db.query(`
            SELECT 
                COUNT(*) as total_rooms,
                SUM(CASE WHEN status = 'waiting' THEN 1 ELSE 0 END) as waiting_rooms,
                SUM(CASE WHEN status = 'playing' THEN 1 ELSE 0 END) as playing_rooms
            FROM rooms
        `);
        const [gameStats] = await db.query('SELECT COUNT(*) as total_games FROM game_records');
        const [adminStats] = await db.query('SELECT COUNT(*) as admin_count FROM admins');
        
        res.json({
            success: true,
            stats: {
                total_users: userStats[0].total_users,
                total_rooms: roomStats[0].total_rooms,
                waiting_rooms: roomStats[0].waiting_rooms,
                playing_rooms: roomStats[0].playing_rooms,
                total_games: gameStats[0].total_games,
                admin_count: adminStats[0].admin_count
            }
        });
    } catch (error) {
        res.json({ success: false, message: error.message });
    }
});

// 获取用户列表
router.get('/api/users/list', isAdmin, async (req, res) => {
    try {
        const [users] = await db.query('SELECT * FROM users ORDER BY created_at DESC');
        res.json({ success: true, users });
    } catch (error) {
        res.json({ success: false, message: error.message });
    }
});

// 获取房间列表
router.get('/api/rooms/list', isAdmin, async (req, res) => {
    try {
        const [rooms] = await db.query(`
            SELECT r.*, u.nickname as creator_name,
                   (SELECT COUNT(*) FROM room_players WHERE room_id = r.id) as player_count
            FROM rooms r
            JOIN users u ON r.creator_id = u.id
            ORDER BY r.created_at DESC
        `);
        res.json({ success: true, rooms });
    } catch (error) {
        res.json({ success: false, message: error.message });
    }
});

// 获取管理员列表
router.get('/api/admins/list', isAdmin, async (req, res) => {
    try {
        const [admins] = await db.query('SELECT id, username, created_at FROM admins ORDER BY created_at DESC');
        res.json({ success: true, admins });
    } catch (error) {
        res.json({ success: false, message: error.message });
    }
});


// ============ 用户管理 API ============

// 创建用户
router.post('/api/users/create', isAdmin, async (req, res) => {
    const { username, nickname, password } = req.body;
    
    try {
        if (!password || password.length < 6) {
            return res.json({ success: false, message: '密码至少6个字符' });
        }
        
        const [existing] = await db.query('SELECT id FROM users WHERE username = ?', [username]);
        if (existing.length > 0) {
            return res.json({ success: false, message: '用户名已存在' });
        }
        
        const hashedPassword = await bcrypt.hash(password, 10);
        await db.query(
            'INSERT INTO users (username, password, nickname) VALUES (?, ?, ?)',
            [username, hashedPassword, nickname || username]
        );
        
        res.json({ success: true, message: '用户创建成功' });
    } catch (error) {
        console.error('Create user error:', error);
        res.json({ success: false, message: '创建失败' });
    }
});

// 更新用户
router.post('/api/users/update', isAdmin, async (req, res) => {
    const { id, username, nickname, password } = req.body;
    
    try {
        // 检查用户名是否重复
        const [existing] = await db.query(
            'SELECT id FROM users WHERE username = ? AND id != ?',
            [username, id]
        );
        if (existing.length > 0) {
            return res.json({ success: false, message: '用户名已存在' });
        }
        
        if (password) {
            const hashedPassword = await bcrypt.hash(password, 10);
            await db.query(
                'UPDATE users SET username = ?, nickname = ?, password = ? WHERE id = ?',
                [username, nickname || username, hashedPassword, id]
            );
        } else {
            await db.query(
                'UPDATE users SET username = ?, nickname = ? WHERE id = ?',
                [username, nickname || username, id]
            );
        }
        
        res.json({ success: true, message: '用户更新成功' });
    } catch (error) {
        console.error('Update user error:', error);
        res.json({ success: false, message: '更新失败' });
    }
});

// 删除用户
router.post('/api/users/delete', isAdmin, async (req, res) => {
    const { id } = req.body;
    
    try {
        await db.query('DELETE FROM users WHERE id = ?', [id]);
        res.json({ success: true, message: '用户已删除' });
    } catch (error) {
        console.error('Delete user error:', error);
        res.json({ success: false, message: '删除失败' });
    }
});

// ============ 房间管理 API ============

// 关闭房间
router.post('/api/rooms/close', isAdmin, async (req, res) => {
    const { id } = req.body;
    
    try {
        await db.query("UPDATE rooms SET status = 'finished' WHERE id = ?", [id]);
        res.json({ success: true, message: '房间已关闭' });
    } catch (error) {
        console.error('Close room error:', error);
        res.json({ success: false, message: '关闭失败' });
    }
});

// 删除房间
router.post('/api/rooms/delete', isAdmin, async (req, res) => {
    const { id } = req.body;
    
    try {
        await db.query('DELETE FROM rooms WHERE id = ?', [id]);
        res.json({ success: true, message: '房间已删除' });
    } catch (error) {
        console.error('Delete room error:', error);
        res.json({ success: false, message: '删除失败' });
    }
});

// ============ 管理员管理 API ============

// 创建管理员
router.post('/api/admins/create', isAdmin, async (req, res) => {
    const { username, password } = req.body;
    
    try {
        if (!password || password.length < 6) {
            return res.json({ success: false, message: '密码至少6个字符' });
        }
        
        const [existing] = await db.query('SELECT id FROM admins WHERE username = ?', [username]);
        if (existing.length > 0) {
            return res.json({ success: false, message: '管理员用户名已存在' });
        }
        
        const hashedPassword = await bcrypt.hash(password, 10);
        await db.query(
            'INSERT INTO admins (username, password) VALUES (?, ?)',
            [username, hashedPassword]
        );
        
        res.json({ success: true, message: '管理员创建成功' });
    } catch (error) {
        console.error('Create admin error:', error);
        res.json({ success: false, message: '创建失败' });
    }
});

// 更新管理员密码
router.post('/api/admins/update', isAdmin, async (req, res) => {
    const { id, password } = req.body;
    
    try {
        if (!password || password.length < 6) {
            return res.json({ success: false, message: '密码至少6个字符' });
        }
        
        const hashedPassword = await bcrypt.hash(password, 10);
        await db.query(
            'UPDATE admins SET password = ? WHERE id = ?',
            [hashedPassword, id]
        );
        
        res.json({ success: true, message: '管理员密码更新成功' });
    } catch (error) {
        console.error('Update admin error:', error);
        res.json({ success: false, message: '更新失败' });
    }
});

// 删除管理员
router.post('/api/admins/delete', isAdmin, async (req, res) => {
    const { id } = req.body;
    const currentAdminId = req.session.adminUser.id;
    
    try {
        // 不允许删除自己
        if (id == currentAdminId) {
            return res.json({ success: false, message: '不能删除自己' });
        }
        
        // 检查是否至少保留一个管理员
        const [count] = await db.query('SELECT COUNT(*) as count FROM admins');
        if (count[0].count <= 1) {
            return res.json({ success: false, message: '至少保留一个管理员' });
        }
        
        await db.query('DELETE FROM admins WHERE id = ?', [id]);
        res.json({ success: true, message: '管理员已删除' });
    } catch (error) {
        console.error('Delete admin error:', error);
        res.json({ success: false, message: '删除失败' });
    }
});

// 管理员退出
router.get('/logout', (req, res) => {
    req.session.isAdmin = false;
    req.session.adminUser = null;
    res.redirect('/admin/login');
});

module.exports = router;