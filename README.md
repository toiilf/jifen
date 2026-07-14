基于 Node.js 的多人实时计分系统，支持创建房间、加入房间、积分转让、历史记录等功能。

## ✨ 功能特点

- 🏠 创建房间 - 自定义房间名称、密码、人数上限
- 🔍 加入房间 - 通过房间名称加入或分享链接加入
- 💸 积分转让 - 点击玩家即可转让积分，实时更新
- 📊 历史记录 - 查看所有游戏的输赢记录
- 👤 个人中心 - 查看总场次、胜场统计
- 📤 邀请好友 - 复制链接或扫码加入房间
- ⚡ 快速进入 - 一键随机生成账号，无需注册
- 🔒 管理员后台 - 用户管理、房间管理、管理员管理
- 📱 移动端适配 - 完美支持手机端使用

## 🛠 技术栈

- Node.js + Express
- MySQL + mysql2
- EJS 模板引擎
- WebSocket (ws) 实时推送
- Session 认证

## 🚀 快速开始

### 环境要求
- Node.js 16.x 或以上
- MySQL 5.7 或以上

### 安装步骤

1. 克隆项目
```bash
git clone https://github.com/你的用户名/jifen.git
cd jifen
安装依赖

bash
npm install
配置数据库

bash
cp .env.example .env
# 编辑 .env 填写数据库信息
启动服务

bash
node server.js
访问安装向导

text
http://localhost:3000
宝塔面板部署
宝塔 → 网站 → Node项目 → 添加Node项目

项目目录选择项目路径

启动命令：node server.js

端口：3000

📁 目录结构
text
├── server.js          # 主入口
├── db.js              # 数据库连接
├── .env.example       # 环境配置模板
├── package.json
├── public/css/        # 样式文件
├── views/             # EJS 模板
├── routes/            # 路由文件
│   ├── index.js       # 首页/安装
│   ├── auth.js        # 认证
│   ├── lobby.js       # 大厅
│   ├── room.js        # 房间
│   ├── profile.js     # 个人中心
│   ├── history.js     # 历史记录
│   ├── admin.js       # 管理后台
│   └── api.js         # API
└── middleware/         # 中间件
    └── auth.js
📝 开源协议
MIT License
EOF
