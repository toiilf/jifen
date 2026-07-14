const express = require('express');
const router = express.Router();
const db = require('../db');
const { isAuthenticated } = require('../middleware/auth');

// 获取房间数据
router.get('/room/:id', isAuthenticated, async (req, res) => {
    const roomId = req.params.id;
    
    try {
        const [rooms] = await db.query('SELECT * FROM rooms WHERE id = ?', [roomId]);
        
        if (rooms.length === 0) {
            return res.json({ success: false, message: '房间不存在' });
        }
        
        const room = rooms[0];
        
        const [players] = await db.query(
            `SELECT rp.*, u.username, u.nickname
             FROM room_players rp
             JOIN users u ON rp.user_id = u.id
             WHERE rp.room_id = ?
             ORDER BY rp.seat_number`,
            [roomId]
        );
        
        const [transfers] = await db.query(
            `SELECT st.*, 
                    fu.nickname as from_nickname,
                    tu.nickname as to_nickname
             FROM score_transfers st
             JOIN users fu ON st.from_user_id = fu.id
             JOIN users tu ON st.to_user_id = tu.id
             WHERE st.room_id = ?
             ORDER BY st.created_at DESC
             LIMIT 50`,
            [roomId]
        );
        
        res.json({
            success: true,
            room: room,
            players: players,
            transfers: transfers
        });
    } catch (error) {
        console.error('API room error:', error);
        res.json({ success: false, message: '获取房间数据失败' });
    }
});

// 积分转让（每次转让自动记录游戏历史）
router.post('/transfer', isAuthenticated, async (req, res) => {
    const { room_id, to_user_id, amount } = req.body;
    const fromUserId = req.session.user.id;
    
    // 不能转给自己
    if (fromUserId == to_user_id) {
        return res.json({ success: false, message: '不能给自己转让积分' });
    }
    
    if (!amount || amount <= 0) {
        return res.json({ success: false, message: '转让金额必须大于0' });
    }
    
    try {
        const [rooms] = await db.query(
            "SELECT * FROM rooms WHERE id = ? AND status != 'finished'",
            [room_id]
        );
        
        if (rooms.length === 0) {
            return res.json({ success: false, message: '房间不存在或已关闭' });
        }
        
        const [players] = await db.query(
            'SELECT * FROM room_players WHERE room_id = ? AND user_id IN (?, ?)',
            [room_id, fromUserId, to_user_id]
        );
        
        if (players.length !== 2) {
            return res.json({ success: false, message: '玩家不在同一房间' });
        }
        
        const connection = await db.getConnection();
        await connection.beginTransaction();
        
        try {
            // 更新房间内积分
            await connection.query(
                'UPDATE room_players SET current_score = current_score - ? WHERE room_id = ? AND user_id = ?',
                [amount, room_id, fromUserId]
            );
            
            await connection.query(
                'UPDATE room_players SET current_score = current_score + ? WHERE room_id = ? AND user_id = ?',
                [amount, room_id, to_user_id]
            );
            
            // 更新用户总积分
            await connection.query(
                'UPDATE users SET total_score = total_score - ? WHERE id = ?',
                [amount, fromUserId]
            );
            
            await connection.query(
                'UPDATE users SET total_score = total_score + ? WHERE id = ?',
                [amount, to_user_id]
            );
            
            // 记录转让
            await connection.query(
                'INSERT INTO score_transfers (room_id, from_user_id, to_user_id, amount, transfer_type) VALUES (?, ?, ?, ?, ?)',
                [room_id, fromUserId, to_user_id, amount, 'transfer']
            );
            
            // 自动生成游戏记录（每次转让都记录）
            // 检查今日是否已有该房间的游戏记录
            const today = new Date();
            today.setHours(0, 0, 0, 0);
            const tomorrow = new Date(today);
            tomorrow.setDate(tomorrow.getDate() + 1);
            
            const [existingRecord] = await connection.query(
                `SELECT id FROM game_records 
                 WHERE room_id = ? AND game_date >= ? AND game_date < ?`,
                [room_id, today, tomorrow]
            );
            
            if (existingRecord.length === 0) {
                // 获取当前积分最高者作为"胜者"
                const [topPlayer] = await connection.query(
                    `SELECT user_id, current_score FROM room_players 
                     WHERE room_id = ? 
                     ORDER BY current_score DESC LIMIT 1`,
                    [room_id]
                );
                
                // 计算总积分池
                const [totalScores] = await connection.query(
                    'SELECT SUM(current_score) as total_pot FROM room_players WHERE room_id = ?',
                    [room_id]
                );
                
                const winnerId = topPlayer[0].user_id;
                const totalPot = Math.abs(totalScores[0].total_pot) || amount;
                
                // 创建游戏记录
                await connection.query(
                    'INSERT INTO game_records (room_id, winner_id, total_pot) VALUES (?, ?, ?)',
                    [room_id, winnerId, totalPot]
                );
                
                // 更新所有玩家的游戏场次
                const [allPlayers] = await connection.query(
                    'SELECT user_id FROM room_players WHERE room_id = ?',
                    [room_id]
                );
                
                for (const player of allPlayers) {
                    await connection.query(
                        'UPDATE users SET total_games = total_games + 1 WHERE id = ?',
                        [player.user_id]
                    );
                }
                
                // 更新胜者胜场
                await connection.query(
                    'UPDATE users SET wins = wins + 1 WHERE id = ?',
                    [winnerId]
                );
            }
            
            await connection.commit();
            connection.release();
            
            res.json({ success: true, message: '积分转让成功' });
        } catch (error) {
            await connection.rollback();
            connection.release();
            throw error;
        }
    } catch (error) {
        console.error('Transfer error:', error);
        res.json({ success: false, message: '积分转让失败' });
    }
});

// 解散房间
router.post('/room/dismiss', isAuthenticated, async (req, res) => {
    const { room_id } = req.body;
    const userId = req.session.user.id;
    
    try {
        const [rooms] = await db.query(
            'SELECT * FROM rooms WHERE id = ? AND creator_id = ?',
            [room_id, userId]
        );
        
        if (rooms.length === 0) {
            return res.json({ success: false, message: '只有房主可以解散房间' });
        }
        
        await db.query("UPDATE rooms SET status = 'finished' WHERE id = ?", [room_id]);
        
        res.json({ success: true, message: '房间已解散' });
    } catch (error) {
        console.error('Dismiss room error:', error);
        res.json({ success: false, message: '操作失败' });
    }
});

module.exports = router;