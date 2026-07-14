const express = require('express');
const router = express.Router();
const bcrypt = require('bcryptjs');
const db = require('../db');
const { isNotAuthenticated } = require('../middleware/auth');

function randomNickname() {
    var twoCharNames = [
        '若溪', '雨桐', '一诺', '佳琪', '思雨', '梦瑶', '梓涵', '子轩', 
        '昊天', '浩然', '博文', '天宇', '晨阳', '晨曦', '云飞', '星辰',
        '明月', '清风', '流云', '飞雪', '傲霜', '寒梅', '翠竹', '幽兰',
        '知秋', '如烟', '如画', '如诗', '如意', '安然', '安静', '安好',
        '念慈', '婉清', '语嫣', '灵素', '芷若', '小昭', '无双', '莫愁',
        '秋水', '碧瑶', '雪琪', '紫萱', '长卿', '景天', '重楼', '飞蓬',
        '沐风', '凌云', '踏雪', '寻梅', '听雨', '观潮', '望月', '摘星',
        '逍遥', '无忌', '三丰', '翠山', '莲舟', '远桥', '岱岩', '松溪',
        '梨亭', '声谷', '青书', '九真', '不悔', '小芙', '千叶', '百川',
        '千寻', '白龙', '琥珀', '珊瑚', '琉璃', '翡翠', '珍珠', '玛瑙',
        '金鹏', '银狐', '铜雀', '铁鹰', '玉兔', '金龙', '彩凤', '麒麟',
        '长歌', '短笛', '横琴', '竖箫', '琵琶', '锦瑟', '箜篌', '编钟'
    ];
    
    var threeCharNames = [
        '何以琛', '赵默笙', '路漫漫', '林若溪', '苏浅语', '顾清歌', '叶知秋',
        '沈千寻', '洛星辰', '萧若风', '蓝忘机', '魏无羡', '花无缺', '小鱼儿',
        '李逍遥', '赵灵儿', '林月如', '张小凡', '碧瑶儿', '陆雪琪', '张小凡',
        '风清扬', '令狐冲', '任盈盈', '岳灵珊', '仪琳师', '田伯光', '东方白',
        '杨铁心', '包惜弱', '郭啸天', '李莫愁', '陆无双', '程英儿', '黄药师',
        '欧阳锋', '洪七公', '段智兴', '王重阳', '周伯通', '丘处机', '马道长',
        '孙悟空', '猪八戒', '沙悟净', '唐三藏', '白龙马', '观世音', '如来佛',
        '诸葛亮', '司马懿', '周公瑾', '曹孟德', '刘玄德', '关云长', '张翼德',
        '赵子龙', '马孟起', '黄汉升', '姜伯约', '魏文长', '庞士元', '徐元直',
        '花木兰', '穆桂英', '樊梨花', '梁红玉', '秦良玉', '佘太君', '杨排风',
        '白素贞', '小青儿', '许汉文', '法海师', '胡媚娘', '彩茵儿', '张玉堂',
        '宁采臣', '聂小倩', '燕赤霞', '树姥姥', '黑山老', '左千户', '知秋霜',
        '步惊云', '聂小风', '秦霜儿', '楚楚可', '剑晨光', '无名僧', '绝无神',
        '武无敌', '帝释天', '笑三笑', '大魔神', '独孤梦', '第二梦', '明月心',
        '百里屠', '风晴雪', '襄铃儿', '方兰生', '尹千觞', '欧阳少', '紫胤真'
    ];
    
    if (Math.random() < 0.5) {
        return twoCharNames[Math.floor(Math.random() * twoCharNames.length)];
    } else {
        return threeCharNames[Math.floor(Math.random() * threeCharNames.length)];
    }
}

// 登录页面
router.get('/login', isNotAuthenticated, (req, res) => {
    res.render('login', { 
        title: '登录', 
        error: null,
        redirect: req.query.redirect || ''
    });
});

// 登录处理
router.post('/login', isNotAuthenticated, async (req, res) => {
    const { username, password, redirect } = req.body;
    
    try {
        const [users] = await db.query('SELECT * FROM users WHERE username = ?', [username.trim()]);
        
        if (users.length === 0) {
            return res.render('login', { title: '登录', error: '昵称或密码错误', redirect: redirect || '' });
        }
        
        const user = users[0];
        const isMatch = await bcrypt.compare(password, user.password);
        
        if (!isMatch) {
            return res.render('login', { title: '登录', error: '昵称或密码错误', redirect: redirect || '' });
        }
        
        req.session.user = {
            id: user.id,
            username: user.username,
            nickname: user.nickname || user.username
        };
        
        // 如果有 redirect 参数
        if (redirect) {
            return res.redirect(redirect);
        }
        
        // 如果有待加入的房间
        if (req.session.redirectRoom) {
            var roomId = req.session.redirectRoom;
            delete req.session.redirectRoom;
            return res.redirect('/join-room/' + roomId);
        }
        
        res.redirect('/lobby');
    } catch (error) {
        console.error('Login error:', error);
        res.render('login', { title: '登录', error: '登录失败', redirect: redirect || '' });
    }
});

// 注册页面
router.get('/register', isNotAuthenticated, (req, res) => {
    res.render('register', { title: '注册', error: null });
});

// 注册处理
router.post('/register', isNotAuthenticated, async (req, res) => {
    const { username, password, confirm_password } = req.body;
    
    try {
        const trimmedUsername = username.trim();
        
        if (trimmedUsername.length < 2) return res.render('register', { title: '注册', error: '昵称至少2个字符' });
        if (trimmedUsername.length > 20) return res.render('register', { title: '注册', error: '昵称最多20个字符' });
        if (password !== confirm_password) return res.render('register', { title: '注册', error: '两次密码不一致' });
        if (password.length < 6) return res.render('register', { title: '注册', error: '密码至少6个字符' });
        
        const [existing] = await db.query('SELECT id FROM users WHERE username = ?', [trimmedUsername]);
        if (existing.length > 0) return res.render('register', { title: '注册', error: '该昵称已被使用' });
        
        const hashedPassword = await bcrypt.hash(password, 10);
        const [result] = await db.query(
            'INSERT INTO users (username, password, nickname) VALUES (?, ?, ?)',
            [trimmedUsername, hashedPassword, trimmedUsername]
        );
        
        req.session.user = {
            id: result.insertId,
            username: trimmedUsername,
            nickname: trimmedUsername
        };
        
        if (req.session.redirectRoom) {
            var roomId = req.session.redirectRoom;
            delete req.session.redirectRoom;
            return res.redirect('/join-room/' + roomId);
        }
        
        res.redirect('/lobby');
    } catch (error) {
        console.error('Register error:', error);
        res.render('register', { title: '注册', error: '注册失败' });
    }
});

// 快速自动注册
router.post('/quick-register', async (req, res) => {
    try {
        var nickname = randomNickname();
        var defaultPassword = '123456';
        var hashedPassword = await bcrypt.hash(defaultPassword, 10);
        
        var existing = await db.query('SELECT id FROM users WHERE username = ?', [nickname]);
        var attempts = 0;
        while (existing[0].length > 0 && attempts < 20) {
            nickname = randomNickname();
            existing = await db.query('SELECT id FROM users WHERE username = ?', [nickname]);
            attempts++;
        }
        
        var result = await db.query(
            'INSERT INTO users (username, password, nickname) VALUES (?, ?, ?)',
            [nickname, hashedPassword, nickname]
        );
        
        req.session.user = {
            id: result[0].insertId,
            username: nickname,
            nickname: nickname
        };
        
        req.session.showGuide = true;
        
        res.json({ success: true, nickname: nickname, password: defaultPassword });
    } catch (error) {
        console.error('Quick register error:', error);
        res.json({ success: false, message: '注册失败' });
    }
});

// 退出
router.get('/logout', (req, res) => {
    req.session.destroy();
    res.redirect('/auth/login');
});

module.exports = router;
module.exports.randomNickname = randomNickname;