const isAuthenticated = (req, res, next) => {
    if (req.session.user) {
        return next();
    }
    res.redirect('/auth/login');
};

const isAdmin = (req, res, next) => {
    if (req.session.isAdmin) {
        return next();
    }
    res.status(403).render('error', { 
        title: '权限不足',
        message: '您没有管理员权限'
    });
};

const isNotAuthenticated = (req, res, next) => {
    if (!req.session.user) {
        return next();
    }
    res.redirect('/lobby');
};

module.exports = {
    isAuthenticated,
    isAdmin,
    isNotAuthenticated
};