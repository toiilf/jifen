const express = require('express');
const router = express.Router();
const db = require('../db');
const { isAuthenticated } = require('../middleware/auth');

router.get('/', isAuthenticated, async (req, res) => {
    const userId = req.session.user.id;
    const page = parseInt(req.query.page) || 1;
    const limit = 20;
    
    try {
        // 获取所有参与过的房间（按最后转让时间排序）
        const [roomList] = await db.query(
            `SELECT 
                room_id,
                MAX(created_at) as last_time
             FROM score_transfers 
             WHERE from_user_id = ? OR to_user_id = ?
             GROUP BY room_id
             ORDER BY last_time DESC`,
            [userId, userId]
        );
        
        var totalRecords = roomList.length;
        var totalPages = Math.ceil(totalRecords / limit);
        var offset = (page - 1) * limit;
        var pageRooms = roomList.slice(offset, offset + limit);
        
        var totalWins = 0;
        var records = [];
        
        // 先计算总胜场
        for (var i = 0; i < roomList.length; i++) {
            const [myScore] = await db.query(
                `SELECT COALESCE(SUM(CASE WHEN to_user_id = ? THEN amount ELSE -amount END), 0) as net
                 FROM score_transfers WHERE room_id = ? AND (from_user_id = ? OR to_user_id = ?)`,
                [userId, roomList[i].room_id, userId, userId]
            );
            if ((myScore[0].net || 0) > 0) totalWins++;
        }
        
        // 获取当前页数据
        for (var j = 0; j < pageRooms.length; j++) {
            var roomId = pageRooms[j].room_id;
            
            // 获取房间所有玩家的净分数
            const [playerScores] = await db.query(
                `SELECT 
                    u.id as user_id,
                    u.nickname,
                    COALESCE(SUM(CASE WHEN st.to_user_id = u.id THEN st.amount ELSE -st.amount END), 0) as net_score
                 FROM score_transfers st
                 JOIN users u ON u.id = st.from_user_id OR u.id = st.to_user_id
                 WHERE st.room_id = ? AND (st.from_user_id = u.id OR st.to_user_id = u.id)
                 GROUP BY u.id, u.nickname
                 ORDER BY net_score DESC`,
                [roomId]
            );
            
            // 去重
            var seen = {};
            var uniqueScores = [];
            for (var s = 0; s < playerScores.length; s++) {
                if (!seen[playerScores[s].user_id]) {
                    seen[playerScores[s].user_id] = true;
                    uniqueScores.push(playerScores[s]);
                }
            }
            
            var winner = uniqueScores[0] || { nickname: '?', net_score: 0 };
            var myScore = 0;
            for (var p = 0; p < uniqueScores.length; p++) {
                if (uniqueScores[p].user_id === userId) {
                    myScore = uniqueScores[p].net_score;
                    break;
                }
            }
            
            // 获取房间名和人数
            var roomName = '房间' + roomId;
            var playerCount = uniqueScores.length;
            
            try {
                const [roomInfo] = await db.query(
                    'SELECT room_name FROM rooms WHERE id = ?',
                    [roomId]
                );
                if (roomInfo.length > 0) {
                    roomName = roomInfo[0].room_name;
                }
                
                const [countInfo] = await db.query(
                    'SELECT COUNT(*) as cnt FROM room_players WHERE room_id = ?',
                    [roomId]
                );
                if (countInfo.length > 0) {
                    playerCount = countInfo[0].cnt;
                }
            } catch (e) {
                // 忽略
            }
            
            records.push({
                room_name: roomName,
                player_count: playerCount,
                game_date: pageRooms[j].last_time,
                winnerName: winner.nickname,
                winnerScore: winner.net_score,
                myNetScore: myScore,
                isMeWinner: (winner.user_id === userId)
            });
        }
        
        res.render('history', {
            title: '历史记录',
            stats: {
                total_games: totalRecords,
                wins: totalWins
            },
            records: records,
            currentPage: page,
            totalPages: totalPages,
            totalRecords: totalRecords
        });
    } catch (error) {
        console.error('History error:', error);
        res.status(500).render('error', { 
            title: '错误', 
            message: '加载历史记录失败：' + error.message 
        });
    }
});

module.exports = router;