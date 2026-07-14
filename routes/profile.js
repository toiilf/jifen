const express = require('express');
const router = express.Router();
const bcrypt = require('bcryptjs');
const db = require('../db');
const { isAuthenticated } = require('../middleware/auth');

router.get('/', isAuthenticated, async (req, res) => {
    const userId = req.session.user.id;
    
    try {
        const [users] = await db.query('SELECT * FROM users WHERE id = ?', [userId]);
        if (users.length === 0) return res.status(404).render('error', { title: '错误', message: '用户不存在' });
        
        const user = users[0];
        
        const [myRooms] = await db.query(
            "SELECT DISTINCT room_id FROM score_transfers WHERE from_user_id = ? OR to_user_id = ?",
            [userId, userId]
        );
        
        var totalGames = myRooms.length;
        var wins = 0;
        var recentGames = [];
        
        for (var i = 0; i < myRooms.length; i++) {
            var roomId = myRooms[i].room_id;
            const [score] = await db.query(
                "SELECT COALESCE(SUM(CASE WHEN to_user_id = ? THEN amount ELSE -amount END), 0) as net FROM score_transfers WHERE room_id = ? AND (from_user_id = ? OR to_user_id = ?)",
                [userId, roomId, userId, userId]
            );
            var netScore = score[0].net || 0;
            if (netScore > 0) wins++;
            
            const [roomInfo] = await db.query(
                "SELECT gr.*, r.room_name, (SELECT COUNT(*) FROM room_players WHERE room_id = gr.room_id) as player_count FROM game_records gr JOIN rooms r ON gr.room_id = r.id WHERE gr.room_id = ? LIMIT 1",
                [roomId]
            );
            var info = roomInfo[0] || {};
            info.myNetScore = netScore;
            info.room_name = info.room_name || '房间' + roomId;
            info.player_count = info.player_count || 0;
            info.game_date = info.game_date || new Date();
            recentGames.push(info);
        }
        
        recentGames.sort(function(a, b) { return new Date(b.game_date) - new Date(a.game_date); });
        recentGames = recentGames.slice(0, 10);
        
        res.render('profile', {
            title: '个人中心',
            user: { id: user.id, username: user.username, nickname: user.nickname, total_games: totalGames, wins: wins },
            recentGames: recentGames
        });
    } catch (error) {
        console.error('Profile error:', error);
        res.status(500).render('error', { title: '错误', message: '加载个人中心失败' });
    }
});

router.post('/update', isAuthenticated, async (req, res) => {
    const userId = req.session.user.id;
    const { nickname } = req.body;
    try {
        if (!nickname || !nickname.trim()) return res.json({ success: false, message: '昵称不能为空' });
        await db.query('UPDATE users SET nickname = ? WHERE id = ?', [nickname.trim(), userId]);
        req.session.user.nickname = nickname.trim();
        res.json({ success: true });
    } catch (error) { res.json({ success: false, message: '更新失败' }); }
});

router.post('/change-password', isAuthenticated, async (req, res) => {
    const userId = req.session.user.id;
    const { old_password, new_password } = req.body;
    try {
        const [users] = await db.query('SELECT password FROM users WHERE id = ?', [userId]);
        if (users.length === 0) return res.json({ success: false, message: '用户不存在' });
        const isMatch = await bcrypt.compare(old_password, users[0].password);
        if (!isMatch) return res.json({ success: false, message: '当前密码错误' });
        const hashedPassword = await bcrypt.hash(new_password, 10);
        await db.query('UPDATE users SET password = ? WHERE id = ?', [hashedPassword, userId]);
        res.json({ success: true, message: '密码修改成功' });
    } catch (error) { res.json({ success: false, message: '修改失败' }); }
});

router.post('/update-all', isAuthenticated, async (req, res) => {
    const userId = req.session.user.id;
    const { nickname, password } = req.body;
    try {
        if (!nickname || !nickname.trim()) return res.json({ success: false, message: '昵称不能为空' });
        if (nickname.trim().length < 2) return res.json({ success: false, message: '昵称至少2个字符' });
        
        const [existing] = await db.query('SELECT id FROM users WHERE username = ? AND id != ?', [nickname.trim(), userId]);
        if (existing.length > 0) return res.json({ success: false, message: '该昵称已被使用' });
        
        if (password && password.length >= 6) {
            const hashedPassword = await bcrypt.hash(password, 10);
            await db.query('UPDATE users SET username = ?, nickname = ?, password = ? WHERE id = ?', [nickname.trim(), nickname.trim(), hashedPassword, userId]);
        } else {
            await db.query('UPDATE users SET username = ?, nickname = ? WHERE id = ?', [nickname.trim(), nickname.trim(), userId]);
        }
        
        req.session.user.nickname = nickname.trim();
        req.session.user.username = nickname.trim();
        res.json({ success: true, message: '修改成功' });
    } catch (error) {
        console.error('Update all error:', error);
        res.json({ success: false, message: '修改失败' });
    }
});

module.exports = router;