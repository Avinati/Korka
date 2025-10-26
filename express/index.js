const express = require('express');
const cors = require('cors');
const bcrypt = require('bcryptjs');
const { pool, checkConnection } = require('./bd.js');

const app = express();
const PORT = 3006;


app.use(cors());
app.use(express.json());


app.listen(PORT, async () => {
    console.log(`🚀 Сервер запущен на порту ${PORT}`);
    await checkConnection();
});


app.post('/reg', async (req, res) => {
    console.log('📨 Получен запрос на регистрацию:', req.body);
    
    const { 
        name, 
        surename, 
        nick, 
        email, 
        phone, 
        password, 
        personalData, 
        privacyPolicy, 
        notifications 
    } = req.body;

    
    if (!name || !surename || !nick || !email || !phone || !password) {
        return res.json({ 
            success: false, 
            message: 'Все поля обязательны для заполнения' 
        });
    }

   
    if (!personalData || !privacyPolicy) {
        return res.json({ 
            success: false, 
            message: 'Необходимо согласие на обработку персональных данных и политику конфиденциальности' 
        });
    }

    try {
        
        const [existingUsers] = await pool.execute(
            'SELECT user_id FROM users WHERE email = ? OR nick = ?',
            [email, nick]
        );

        if (existingUsers.length > 0) {
            return res.json({ 
                success: false, 
                message: 'Пользователь с таким email или никнеймом уже существует' 
            });
        }

       
        const hashedPassword = await bcrypt.hash(password, 10);

        
        const [result] = await pool.execute(
            `INSERT INTO users (name, surname, nick, email, phone, password, role) 
             VALUES (?, ?, ?, ?, ?, ?, 'user')`,
            [name, surename, nick, email, phone, hashedPassword]
        );

        console.log('✅ Пользователь создан с ID:', result.insertId);

       

        res.json({ 
            success: true, 
            message: 'Регистрация прошла успешно!',
            userId: result.insertId
        });

    } catch (error) {
        console.error('❌ Ошибка при регистрации:', error);
        
       
        let errorMessage = 'Ошибка сервера при регистрации';
        if (error.code === 'ER_DUP_ENTRY') {
            if (error.sqlMessage.includes('email')) {
                errorMessage = 'Пользователь с таким email уже существует';
            } else if (error.sqlMessage.includes('nick')) {
                errorMessage = 'Пользователь с таким никнеймом уже существует';
            } else if (error.sqlMessage.includes('phone')) {
                errorMessage = 'Пользователь с таким телефоном уже существует';
            }
        }
        
        res.json({ 
            success: false, 
            message: errorMessage 
        });
    }
});


app.get('/courses', async (req, res) => {
    try {
        const [courses] = await pool.execute(
            'SELECT course_id, name, price, description, duration_hours FROM courses WHERE is_active = TRUE'
        );
        res.json({ success: true, courses });
    } catch (error) {
        console.error('❌ Ошибка при получении курсов:', error);
        res.json({ success: false, message: 'Ошибка при получении списка курсов' });
    }
});


app.post('/applications', async (req, res) => {
    console.log('📨 Получен запрос на создание заявки:', req.body);
    
    const { userId, courseId, startDate, paymentMethod } = req.body;

   
    if (!userId || !courseId || !startDate || !paymentMethod) {
        return res.json({ 
            success: false, 
            message: 'Все поля обязательны для заполнения' 
        });
    }

    
    if (!['cash', 'phone_transfer'].includes(paymentMethod)) {
        return res.json({ 
            success: false, 
            message: 'Неверный способ оплаты' 
        });
    }

    try {
       
        const [users] = await pool.execute(
            'SELECT user_id FROM users WHERE user_id = ?',
            [userId]
        );

        if (users.length === 0) {
            return res.json({ 
                success: false, 
                message: 'Пользователь не найден' 
            });
        }

        
        const [courses] = await pool.execute(
            'SELECT course_id, name FROM courses WHERE course_id = ? AND is_active = TRUE',
            [courseId]
        );

        if (courses.length === 0) {
            return res.json({ 
                success: false, 
                message: 'Курс не найден или не активен' 
            });
        }

        
        const selectedDate = new Date(startDate);
        const currentDate = new Date();
        currentDate.setHours(0, 0, 0, 0);

        if (selectedDate < currentDate) {
            return res.json({ 
                success: false, 
                message: 'Нельзя выбрать прошедшую дату' 
            });
        }

       
        const [result] = await pool.execute(
            `INSERT INTO applications (user_id, course_id, desired_start_date, payment_method, status) 
             VALUES (?, ?, ?, ?, 'new')`,
            [userId, courseId, startDate, paymentMethod]
        );

        console.log('✅ Заявка создана с ID:', result.insertId);

        
        await pool.execute(
            `INSERT INTO application_status_history (application_id, old_status, new_status, changed_by, change_comment) 
             VALUES (?, NULL, 'new', ?, 'Заявка создана')`,
            [result.insertId, userId]
        );

        res.json({ 
            success: true, 
            message: 'Заявка успешно создана!',
            applicationId: result.insertId
        });

    } catch (error) {
        console.error('❌ Ошибка при создании заявки:', error);
        
        res.json({ 
            success: false, 
            message: 'Ошибка сервера при создании заявки' 
        });
    }
});

app.post('/auth', async (req, res) => {
    console.log('📨 Получен запрос на авторизацию:', req.body);
    
    const { email, password } = req.body;

   
    if (!email || !password) {
        return res.json({ 
            success: false, 
            message: 'Email и пароль обязательны для заполнения' 
        });
    }

    try {
       
        const [users] = await pool.execute(
            'SELECT user_id, name, surname, nick, email, password, role FROM users WHERE email = ?',
            [email]
        );

        if (users.length === 0) {
            return res.json({ 
                success: false, 
                message: 'Пользователь с таким email не найден' 
            });
        }

        const user = users[0];

        
        const isPasswordValid = await bcrypt.compare(password, user.password);
        
        if (!isPasswordValid) {
            return res.json({ 
                success: false, 
                message: 'Неверный пароль' 
            });
        }

        console.log('✅ Успешная авторизация пользователя:', user.email);

      
        const { password: _, ...userWithoutPassword } = user;
        
        res.json({ 
            success: true, 
            message: 'Авторизация прошла успешно!',
            user: userWithoutPassword
        });

    } catch (error) {
        console.error('❌ Ошибка при авторизации:', error);
        
        res.json({ 
            success: false, 
            message: 'Ошибка сервера при авторизации' 
        });
    }
});


app.get('/test', (req, res) => {
    res.json({ message: 'Сервер работает!' });
});

// Получение заявок пользователя с отзывами
app.get('/user-applications', async (req, res) => {
    const { userId } = req.query;

    if (!userId) {
        return res.json({ 
            success: false, 
            message: 'ID пользователя обязателен' 
        });
    }

    try {
        const [applications] = await pool.execute(`
            SELECT 
                a.application_id,
                a.user_id,
                a.desired_start_date,
                a.payment_method,
                a.status,
                a.created_at,
                c.name as course_name,
                c.price,
                r.rating,
                r.review_id,
                CASE WHEN r.review_id IS NOT NULL THEN TRUE ELSE FALSE END as has_review
            FROM applications a
            JOIN courses c ON a.course_id = c.course_id
            LEFT JOIN reviews r ON a.application_id = r.application_id
            WHERE a.user_id = ?
            ORDER BY a.created_at DESC
        `, [userId]);

        res.json({ 
            success: true, 
            applications 
        });

    } catch (error) {
        console.error('❌ Ошибка при получении заявок:', error);
        res.json({ 
            success: false, 
            message: 'Ошибка при получении заявок' 
        });
    }
});

// Создание отзыва
app.post('/reviews', async (req, res) => {
    console.log('📨 Получен запрос на создание отзыва:', req.body);
    
    const { userId, applicationId, rating } = req.body;

    if (!userId || !applicationId || !rating) {
        return res.json({ 
            success: false, 
            message: 'Все поля обязательны для заполнения' 
        });
    }

    if (rating < 1 || rating > 5) {
        return res.json({ 
            success: false, 
            message: 'Рейтинг должен быть от 1 до 5' 
        });
    }

    try {
        // Проверяем существование заявки и ее статус
        const [applications] = await pool.execute(`
            SELECT a.application_id, a.status, a.user_id 
            FROM applications a 
            WHERE a.application_id = ? AND a.user_id = ?
        `, [applicationId, userId]);

        if (applications.length === 0) {
            return res.json({ 
                success: false, 
                message: 'Заявка не найдена' 
            });
        }

        const application = applications[0];

        if (application.status !== 'completed') {
            return res.json({ 
                success: false, 
                message: 'Отзыв можно оставить только для завершенных курсов' 
            });
        }

        // Проверяем, не оставлял ли пользователь уже отзыв
        const [existingReviews] = await pool.execute(
            'SELECT review_id FROM reviews WHERE application_id = ? AND user_id = ?',
            [applicationId, userId]
        );

        if (existingReviews.length > 0) {
            return res.json({ 
                success: false, 
                message: 'Вы уже оставляли отзыв для этой заявки' 
            });
        }

        // Создаем отзыв
        const [result] = await pool.execute(
            `INSERT INTO reviews (user_id, application_id, rating) 
             VALUES (?, ?, ?)`,
            [userId, applicationId, rating]
        );

        console.log('✅ Отзыв создан с ID:', result.insertId);

        res.json({ 
            success: true, 
            message: 'Отзыв успешно отправлен!',
            reviewId: result.insertId
        });

    } catch (error) {
        console.error('❌ Ошибка при создании отзыва:', error);
        
        res.json({ 
            success: false, 
            message: 'Ошибка сервера при создании отзыва' 
        });
    }
});

// Получение отзывов для курса (опционально)
app.get('/course-reviews', async (req, res) => {
    const { courseId } = req.query;

    try {
        const [reviews] = await pool.execute(`
            SELECT 
                r.rating,
                r.created_at,
                u.name,
                u.surname
            FROM reviews r
            JOIN applications a ON r.application_id = a.application_id
            JOIN users u ON r.user_id = u.user_id
            WHERE a.course_id = ? AND r.is_visible = TRUE
            ORDER BY r.created_at DESC
        `, [courseId]);

        res.json({ 
            success: true, 
            reviews 
        });

    } catch (error) {
        console.error('❌ Ошибка при получении отзывов:', error);
        res.json({ 
            success: false, 
            message: 'Ошибка при получении отзывов' 
        });
    }
});

// Эндпоинт для авторизации администратора с улучшенной обработкой ошибок
// Эндпоинт для авторизации администратора с улучшенной обработкой ошибок
app.post('/admin-auth', async (req, res) => {
    console.log('📨 Получен запрос на авторизацию администратора');
    
    try {
        // Проверяем Content-Type
        const contentType = req.headers['content-type'];
        if (!contentType || !contentType.includes('application/json')) {
            return res.status(400).json({ 
                success: false, 
                message: 'Неверный Content-Type. Ожидается application/json' 
            });
        }

        const { email, password } = req.body;

        console.log('📧 Логин:', email);
        console.log('🔑 Пароль получен:', password ? 'да' : 'нет');

        if (!email || !password) {
            return res.status(400).json({ 
                success: false, 
                message: 'Логин и пароль обязательны для заполнения' 
            });
        }

        // Проверяем специальные учетные данные администратора
        if (email === 'Admin' && password === 'KorokNET') {
            console.log('✅ Успешная авторизация администратора через специальные учетные данные');
            
            // Создаем временный объект администратора без записи в БД
            const adminUser = {
                user_id: 0, // Специальный ID для администратора
                name: 'Admin',
                surname: 'System',
                nick: 'admin',
                email: 'admin@system',
                role: 'admin'
            };
            
            res.json({ 
                success: true, 
                message: 'Авторизация прошла успешно!',
                user: adminUser
            });
        } else {
            // Стандартная проверка через базу данных для обычных пользователей
            const [users] = await pool.execute(
                'SELECT user_id, name, surname, nick, email, password, role FROM users WHERE email = ?',
                [email]
            );

            if (users.length === 0) {
                console.log('❌ Пользователь не найден:', email);
                return res.status(401).json({ 
                    success: false, 
                    message: 'Пользователь с таким логином не найден' 
                });
            }

            const user = users[0];
            console.log('👤 Найден пользователь:', user.email, 'Роль:', user.role);

            // Проверяем, является ли пользователь администратором
            if (user.role !== 'admin') {
                console.log('🚫 Доступ запрещен для роли:', user.role);
                return res.status(403).json({ 
                    success: false, 
                    message: 'Доступ запрещен. Недостаточно прав.' 
                });
            }

            // Проверяем пароль
            const isPasswordValid = await bcrypt.compare(password, user.password);
            console.log('🔐 Проверка пароля:', isPasswordValid ? 'успешно' : 'неверно');
            
            if (!isPasswordValid) {
                return res.status(401).json({ 
                    success: false, 
                    message: 'Неверный пароль' 
                });
            }

            console.log('✅ Успешная авторизация администратора:', user.email);

            const { password: _, ...userWithoutPassword } = user;
            
            res.json({ 
                success: true, 
                message: 'Авторизация прошла успешно!',
                user: userWithoutPassword
            });
        }

    } catch (error) {
        console.error('❌ Ошибка при авторизации администратора:', error);
        
        res.status(500).json({ 
            success: false, 
            message: 'Ошибка сервера при авторизации' 
        });
    }
});

// Простой тестовый эндпоинт для проверки
app.get('/admin-test', (req, res) => {
    res.json({ 
        success: true, 
        message: 'Сервер админ-панели работает!',
        timestamp: new Date().toISOString()
    });
});

// Получение всех заявок для админ-панели
app.get('/admin-applications', async (req, res) => {
    try {
        const [applications] = await pool.execute(`
            SELECT 
                a.application_id,
                a.user_id,
                a.desired_start_date,
                a.payment_method,
                a.status,
                a.created_at,
                c.name as course_name,
                c.price,
                u.name as user_name,
                u.surname as user_surname,
                u.email as user_email
            FROM applications a
            JOIN courses c ON a.course_id = c.course_id
            JOIN users u ON a.user_id = u.user_id
            ORDER BY 
                CASE 
                    WHEN a.status = 'new' THEN 1
                    WHEN a.status = 'in_progress' THEN 2
                    WHEN a.status = 'completed' THEN 3
                    ELSE 4
                END,
                a.created_at DESC
        `);

        res.json({ 
            success: true, 
            applications 
        });

    } catch (error) {
        console.error('❌ Ошибка при получении заявок для админ-панели:', error);
        res.json({ 
            success: false, 
            message: 'Ошибка при получении заявок' 
        });
    }
});

// Обновление статуса заявки
app.put('/admin-applications/:id/status', async (req, res) => {
    const applicationId = req.params.id;
    const { newStatus, adminId } = req.body;

    if (!newStatus || !adminId) {
        return res.json({ 
            success: false, 
            message: 'Все поля обязательны для заполнения' 
        });
    }

    if (!['new', 'in_progress', 'completed'].includes(newStatus)) {
        return res.json({ 
            success: false, 
            message: 'Неверный статус' 
        });
    }

    try {
        // Получаем текущий статус заявки
        const [currentApps] = await pool.execute(
            'SELECT status FROM applications WHERE application_id = ?',
            [applicationId]
        );

        if (currentApps.length === 0) {
            return res.json({ 
                success: false, 
                message: 'Заявка не найдена' 
            });
        }

        const oldStatus = currentApps[0].status;

        // Обновляем статус заявки
        await pool.execute(
            'UPDATE applications SET status = ?, updated_at = CURRENT_TIMESTAMP WHERE application_id = ?',
            [newStatus, applicationId]
        );

        // Добавляем запись в историю статусов
        await pool.execute(
            `INSERT INTO application_status_history (application_id, old_status, new_status, changed_by, change_comment) 
             VALUES (?, ?, ?, ?, ?)`,
            [applicationId, oldStatus, newStatus, adminId, `Статус изменен администратором`]
        );

        console.log(`✅ Статус заявки ${applicationId} изменен с ${oldStatus} на ${newStatus}`);

        res.json({ 
            success: true, 
            message: 'Статус заявки успешно обновлен'
        });

    } catch (error) {
        console.error('❌ Ошибка при обновлении статуса заявки:', error);
        
        res.json({ 
            success: false, 
            message: 'Ошибка сервера при обновлении статуса' 
        });
    }
});

app.get('/check-db', async (req, res) => {
    const isConnected = await checkConnection();
    res.json({ databaseConnected: isConnected });
});


app.get('/users', async (req, res) => {
    try {
        const [users] = await pool.execute('SELECT user_id, name, surname, nick, email, phone, created_at FROM users');
        res.json({ success: true, users });
    } catch (error) {
        console.error('Ошибка при получении пользователей:', error);
        res.json({ success: false, message: 'Ошибка при получении пользователей' });
    }
});     