const express = require('express');
const session = require('express-session');
const FileStore = require('session-file-store')(session);
const path = require('path');
const http = require('http');
const WebSocket = require('ws');
const dotenv = require('dotenv');
const moment = require('moment-timezone');

dotenv.config();

const app = express();
const server = http.createServer(app);
const wss = new WebSocket.Server({ server });

// 设置时区
moment.tz.setDefault(process.env.TIMEZONE || 'Asia/Shanghai');
process.env.TZ = process.env.TIMEZONE || 'Asia/Shanghai';

// 中间件
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname, 'public')));

// Session 配置
app.use(session({
    store: new FileStore({
        path: path.join(__dirname, 'sessions'),
        ttl: 86400
    }),
    secret: process.env.SESSION_SECRET || 'default_secret_key',
    resave: false,
    saveUninitialized: false,
    cookie: {
        maxAge: 24 * 60 * 60 * 1000,
        httpOnly: true
    }
}));

// 视图引擎
app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));

// 全局变量
app.use((req, res, next) => {
    res.locals.user = req.session.user || null;
    res.locals.isAdmin = req.session.isAdmin || false;
    res.locals.moment = moment;
    next();
});

// WebSocket 连接管理
const rooms = new Map(); // room_id -> Set of WebSocket connections

wss.on('connection', (ws, req) => {
    let currentRoom = null;
    let userId = null;

    ws.on('message', (message) => {
        try {
            const data = JSON.parse(message);
            
            if (data.type === 'join_room') {
                currentRoom = data.room_id;
                userId = data.user_id;
                
                if (!rooms.has(currentRoom)) {
                    rooms.set(currentRoom, new Set());
                }
                rooms.get(currentRoom).add(ws);
                
                // 广播用户加入
                broadcastToRoom(currentRoom, {
                    type: 'user_joined',
                    user_id: userId,
                    timestamp: new Date().toISOString()
                });
            }
            
            if (data.type === 'score_update') {
                broadcastToRoom(currentRoom, {
                    type: 'score_update',
                    data: data.data,
                    timestamp: new Date().toISOString()
                });
            }
            
            if (data.type === 'transfer_update') {
                broadcastToRoom(currentRoom, {
                    type: 'transfer_update',
                    data: data.data,
                    timestamp: new Date().toISOString()
                });
            }
        } catch (error) {
            console.error('WebSocket message error:', error);
        }
    });

    ws.on('close', () => {
        if (currentRoom && rooms.has(currentRoom)) {
            rooms.get(currentRoom).delete(ws);
            if (rooms.get(currentRoom).size === 0) {
                rooms.delete(currentRoom);
            }
            broadcastToRoom(currentRoom, {
                type: 'user_left',
                user_id: userId,
                timestamp: new Date().toISOString()
            });
        }
    });
});

function broadcastToRoom(roomId, data) {
    if (rooms.has(roomId)) {
        const message = JSON.stringify(data);
        rooms.get(roomId).forEach(client => {
            if (client.readyState === WebSocket.OPEN) {
                client.send(message);
            }
        });
    }
}


// 路由
const indexRoutes = require('./routes/index');
const authRoutes = require('./routes/auth');
const lobbyRoutes = require('./routes/lobby');
const roomRoutes = require('./routes/room');
const profileRoutes = require('./routes/profile');
const historyRoutes = require('./routes/history');
const adminRoutes = require('./routes/admin');
const apiRoutes = require('./routes/api');

app.use('/', indexRoutes);
app.use('/auth', authRoutes);
app.use('/lobby', lobbyRoutes);
app.use('/room', roomRoutes);
app.use('/profile', profileRoutes);
app.use('/history', historyRoutes);
app.use('/admin', adminRoutes);
app.use('/api', apiRoutes);

// 404 处理
app.use((req, res) => {
    res.status(404).render('404', { title: '页面未找到' });
});

// 错误处理
app.use((err, req, res, next) => {
    console.error(err.stack);
    res.status(500).render('error', { 
        title: '服务器错误',
        message: '服务器内部错误，请稍后再试'
    });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
    console.log(`服务器运行在端口 ${PORT}`);
    console.log(`WebSocket 服务器已启动`);
});
