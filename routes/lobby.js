const express = require('express');
const router = express.Router();
const db = require('../db');
const { isAuthenticated } = require('../middleware/auth');

router.get('/', isAuthenticated, async (req, res) => {
    var showGuide = req.session.showGuide || false;
    req.session.showGuide = false;
    
    res.render('lobby', {
        title: '积分系统',
        user: req.session.user,
        showGuide: showGuide
    });
});

router.get('/my-rooms', isAuthenticated, async (req, res) => {
    const userId = req.session.user.id;
    try {
        const [rooms] = await db.query(
            "SELECT r.*, u.nickname as creator_name, (SELECT COUNT(*) FROM room_players WHERE room_id = r.id) as player_count FROM rooms r JOIN users u ON r.creator_id = u.id WHERE r.creator_id = ? AND r.status != 'finished' ORDER BY r.created_at DESC",
            [userId]
        );
        res.json({ success: true, rooms: rooms });
    } catch (error) { res.json({ success: false, message: '获取失败' }); }
});

router.get('/joined-rooms', isAuthenticated, async (req, res) => {
    const userId = req.session.user.id;
    try {
        const [rooms] = await db.query(
            "SELECT r.id, r.room_name, r.password, r.max_players, r.status, u.nickname as creator_name, (SELECT COUNT(*) FROM room_players WHERE room_id = r.id) as player_count FROM rooms r JOIN users u ON r.creator_id = u.id WHERE r.id IN (SELECT room_id FROM room_players WHERE user_id = ?) AND r.creator_id != ? AND r.status != 'finished' ORDER BY r.updated_at DESC",
            [userId, userId]
        );
        res.json({ success: true, rooms: rooms });
    } catch (error) { res.json({ success: false, message: '获取失败' }); }
});

router.post('/create-room', isAuthenticated, async (req, res) => {
    const { room_name, password, max_players } = req.body;
    const userId = req.session.user.id;
    try {
        const [result] = await db.query('INSERT INTO rooms (room_name, creator_id, password, max_players) VALUES (?, ?, ?, ?)', [room_name, userId, password || null, max_players || 4]);
        await db.query('INSERT INTO room_players (room_id, user_id, seat_number) VALUES (?, ?, ?)', [result.insertId, userId, 1]);
        res.json({ success: true, room_id: result.insertId });
    } catch (error) { res.json({ success: false, message: '创建失败' }); }
});

router.post('/join-room', isAuthenticated, async (req, res) => {
    const { room_name, password } = req.body;
    const userId = req.session.user.id;
    if (!room_name || !room_name.trim()) return res.json({ success: false, message: '请输入房间名称' });
    try {
        const [rooms] = await db.query("SELECT * FROM rooms WHERE room_name = ? AND status != 'finished'", [room_name.trim()]);
        if (rooms.length === 0) return res.json({ success: false, message: '房间不存在或已关闭' });
        const room = rooms[0];
        if (room.password && room.password !== (password || '')) return res.json({ success: false, message: '房间密码错误' });
        const [existing] = await db.query('SELECT id FROM room_players WHERE room_id = ? AND user_id = ?', [room.id, userId]);
        if (existing.length > 0) return res.json({ success: true, room_id: room.id });
        const [players] = await db.query('SELECT COUNT(*) as count FROM room_players WHERE room_id = ?', [room.id]);
        if (players[0].count >= room.max_players) return res.json({ success: false, message: '房间已满' });
        const [maxSeat] = await db.query('SELECT COALESCE(MAX(seat_number), 0) + 1 as next_seat FROM room_players WHERE room_id = ?', [room.id]);
        await db.query('INSERT INTO room_players (room_id, user_id, seat_number) VALUES (?, ?, ?)', [room.id, userId, maxSeat[0].next_seat]);
        res.json({ success: true, room_id: room.id });
    } catch (error) { res.json({ success: false, message: '加入失败' }); }
});

router.post('/leave-room', isAuthenticated, async (req, res) => {
    const { room_id } = req.body;
    const userId = req.session.user.id;
    try {
        await db.query('DELETE FROM room_players WHERE room_id = ? AND user_id = ?', [room_id, userId]);
        res.json({ success: true, message: '已退出' });
    } catch (error) { res.json({ success: false, message: '退出失败' }); }
});

router.post('/dismiss-room', isAuthenticated, async (req, res) => {
    const { room_id } = req.body;
    const userId = req.session.user.id;
    try {
        const [rooms] = await db.query('SELECT * FROM rooms WHERE id = ? AND creator_id = ?', [room_id, userId]);
        if (rooms.length === 0) return res.json({ success: false, message: '只有房主可以解散' });
        await db.query("UPDATE rooms SET status = 'finished' WHERE id = ?", [room_id]);
        res.json({ success: true, message: '已解散' });
    } catch (error) { res.json({ success: false, message: '解散失败' }); }
});

module.exports = router;