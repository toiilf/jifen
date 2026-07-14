const express = require('express');
const router = express.Router();
const db = require('../db');
const { isAuthenticated } = require('../middleware/auth');

router.get('/:id', isAuthenticated, async (req, res) => {
    const roomId = req.params.id;
    const userId = req.session.user.id;
    
    try {
        const [rooms] = await db.query(
            "SELECT r.*, u.nickname as creator_name FROM rooms r JOIN users u ON r.creator_id = u.id WHERE r.id = ?",
            [roomId]
        );
        
        if (rooms.length === 0) {
            return res.status(404).render('error', { title: '错误', message: '房间不存在' });
        }
        
        const room = rooms[0];
        
        const [playerCheck] = await db.query(
            'SELECT id FROM room_players WHERE room_id = ? AND user_id = ?',
            [roomId, userId]
        );
        
        if (playerCheck.length === 0) {
            return res.status(403).render('error', { title: '错误', message: '您不在该房间中' });
        }
        
        const [allPlayers] = await db.query(
            "SELECT rp.*, u.username, u.nickname, u.avatar FROM room_players rp JOIN users u ON rp.user_id = u.id WHERE rp.room_id = ? ORDER BY rp.seat_number",
            [roomId]
        );
        
        var myPlayer = null;
        var otherPlayers = [];
        for (var i = 0; i < allPlayers.length; i++) {
            if (allPlayers[i].user_id === userId) {
                myPlayer = allPlayers[i];
            } else {
                otherPlayers.push(allPlayers[i]);
            }
        }
        
        if (!myPlayer) {
            myPlayer = { current_score: 0, nickname: req.session.user.nickname };
        }
        
        const [transfers] = await db.query(
            "SELECT st.*, fu.nickname as from_nickname, tu.nickname as to_nickname FROM score_transfers st JOIN users fu ON st.from_user_id = fu.id JOIN users tu ON st.to_user_id = tu.id WHERE st.room_id = ? ORDER BY st.created_at DESC LIMIT 50",
            [roomId]
        );
        
        var showGuide = req.session.showGuide || false;
        req.session.showGuide = false;
        
        res.render('room', {
            title: room.room_name,
            room: room,
            myPlayer: myPlayer,
            otherPlayers: otherPlayers,
            transfers: transfers,
            userId: userId,
            user: req.session.user,
            showGuide: showGuide
        });
    } catch (error) {
        console.error('Room error:', error);
        res.status(500).render('error', { title: '错误', message: '加载房间失败' });
    }
});

router.post('/:id/leave', isAuthenticated, async (req, res) => {
    const roomId = req.params.id;
    const userId = req.session.user.id;
    
    try {
        await db.query('DELETE FROM room_players WHERE room_id = ? AND user_id = ?', [roomId, userId]);
        
        const [players] = await db.query('SELECT COUNT(*) as count FROM room_players WHERE room_id = ?', [roomId]);
        if (players[0].count === 0) {
            await db.query("UPDATE rooms SET status = 'finished' WHERE id = ?", [roomId]);
        }
        
        res.json({ success: true });
    } catch (error) {
        res.json({ success: false, message: '离开房间失败' });
    }
});

module.exports = router;