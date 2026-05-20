const api = new API();
let currentUser = null;
let currentPage = 'feed';
let socket = null;
let currentChatRoomId = null;
let currentBlog = null;

function showToast(message, isError = false) {
    const toast = document.createElement('div');
    toast.className = 'toast';
    toast.style.backgroundColor = isError ? '#dc3545' : '#28a745';
    toast.textContent = message;
    document.body.appendChild(toast);
    setTimeout(() => toast.remove(), 3000);
}

function toggleTheme() {
    const body = document.body;
    const newTheme = body.classList.contains('dark-theme') ? 'light' : 'dark';
    body.classList.toggle('dark-theme');
    localStorage.setItem('theme', newTheme);
    if (currentUser) {
        api.updateTheme(newTheme).catch(console.error);
    }
}

function loadTheme() {
    const savedTheme = localStorage.getItem('theme');
    if (savedTheme === 'dark') {
        document.body.classList.add('dark-theme');
    }
}

function renderNavbar() {
    if (!currentUser) return '';
    return `
        <div class="navbar">
            <div class="nav-content">
                <div class="logo">ЛицейСоцСеть</div>
                <div class="nav-links">
                    <button onclick="renderPage('feed')">Лента</button>
                    <button onclick="renderPage('groups')">Группы</button>
                    <button onclick="renderPage('blogs')">📝 Блоги</button>
                    <button onclick="renderPage('chat')">💬 Чаты</button>
                    <button onclick="renderPage('search')">🔍 Поиск</button>
                    <button onclick="renderPage('profile')">${currentUser.avatar || '👤'} ${escapeHtml(currentUser.name)}</button>
                    <button class="theme-toggle" onclick="toggleTheme()">🌓 Тема</button>
                    <button onclick="logout()">Выйти</button>
                </div>
            </div>
        </div>
    `;
}

function escapeHtml(str) {
    if (!str) return '';
    return str.replace(/[&<>]/g, function(m) {
        if (m === '&') return '&amp;';
        if (m === '<') return '&lt;';
        if (m === '>') return '&gt;';
        return m;
    });
}

// ========== ЛЕНТА (FEED) ==========

async function getGroupsOptions() {
    try {
        const groups = await api.getGroups();
        return groups.map(g => `<option value="${g.id}">${escapeHtml(g.name)}</option>`).join('');
    } catch (error) {
        return '';
    }
}

async function renderCommentTree(comments, postId, level = 0) {
    let html = '';
    for (const comment of comments) {
        const isLiked = comment.user_liked === 1;
        html += `
            <div class="comment" style="margin-left: ${level * 20}px;">
                <div>
                    <strong>${escapeHtml(comment.user_name)}</strong>
                    <small style="color: #666;">${new Date(comment.created_at).toLocaleString()}</small>
                </div>
                <div>${escapeHtml(comment.text)}</div>
                <div class="comment-actions">
                    <button onclick="likeComment(${comment.id}, ${postId})">❤️ ${comment.likes_count || 0} ${isLiked ? '(✓)' : ''}</button>
                    <button onclick="showReplyForm(${comment.id})">💬 Ответить</button>
                    ${currentUser.id === comment.user_id || currentUser.role === 'admin' ? 
                        `<button class="danger" onclick="deleteComment(${comment.id}, ${postId})">🗑 Удалить</button>` : ''}
                </div>
                <div id="reply-form-${comment.id}" class="reply-form" style="display: none;">
                    <input type="text" id="reply-text-${comment.id}" placeholder="Написать ответ...">
                    <button onclick="submitReply(${comment.id}, ${postId})">Отправить</button>
                </div>
                <div id="replies-${comment.id}">
                    ${comment.replies ? await renderCommentTree(comment.replies, postId, level + 1) : ''}
                </div>
            </div>
        `;
    }
    return html;
}

async function loadComments(postId) {
    try {
        const comments = await api.getComments(postId);
        const commentsContainer = document.getElementById(`comments-container-${postId}`);
        if (commentsContainer) {
            if (comments.length === 0) {
                commentsContainer.innerHTML = '<p style="color: #666;">Нет комментариев. Будьте первым!</p>';
            } else {
                commentsContainer.innerHTML = await renderCommentTree(comments, postId);
            }
        }
    } catch (error) {
        console.error('Ошибка загрузки комментариев:', error);
    }
}

function showReplyForm(commentId) {
    const form = document.getElementById(`reply-form-${commentId}`);
    if (form) {
        form.style.display = form.style.display === 'none' ? 'block' : 'none';
    }
}

async function submitReply(parentCommentId, postId) {
    const text = document.getElementById(`reply-text-${parentCommentId}`).value;
    if (!text.trim()) {
        showToast('Введите текст ответа', true);
        return;
    }
    try {
        await api.addComment(text, postId, parentCommentId);
        showToast('Ответ добавлен');
        renderPage('feed');
    } catch (error) {
        showToast(error.message, true);
    }
}

async function likeComment(commentId, postId) {
    try {
        await api.likeComment(commentId);
        renderPage('feed');
    } catch (error) {
        showToast(error.message, true);
    }
}

async function deleteComment(commentId, postId) {
    if (confirm('Удалить комментарий?')) {
        try {
            await api.deleteComment(commentId);
            showToast('Комментарий удалён');
            renderPage('feed');
        } catch (error) {
            showToast(error.message, true);
        }
    }
}

async function renderFeed() {
    try {
        const data = await api.getPosts();
        const posts = data.posts || [];
        
        let html = `
            <div class="container">
                <div class="card">
                    <h3>Создать публикацию</h3>
                    <form id="createPostForm">
                        <div class="form-group">
                            <label>Группа</label>
                            <select id="groupId" required>
                                ${await getGroupsOptions()}
                            </select>
                        </div>
                        <div class="form-group">
                            <label>Содержание</label>
                            <textarea id="content" rows="3" required></textarea>
                        </div>
                        <button type="submit">Опубликовать</button>
                    </form>
                </div>
                
                <h2>Лента новостей</h2>
                ${posts.length === 0 ? '<div class="card">Нет публикаций. Подпишитесь на группы!</div>' : ''}
        `;
        
        for (const post of posts) {
            html += `
                <div class="card" data-post-id="${post.id}">
                    <div style="display: flex; justify-content: space-between;">
                        <div>
                            <strong>${escapeHtml(post.author_name)}</strong> в <strong>${escapeHtml(post.group_name)}</strong>
                            <div style="font-size: 12px; color: #666;">${new Date(post.created_at).toLocaleString()}</div>
                        </div>
                        ${currentUser.role === 'admin' || currentUser.id === post.author_id ? 
                            `<button class="danger" onclick="deletePost(${post.id})">Удалить</button>` : ''}
                    </div>
                    <p style="margin: 15px 0;">${escapeHtml(post.content)}</p>
                    <div style="display: flex; gap: 15px; margin-bottom: 10px;">
                        <button onclick="likePost(${post.id})">❤️ ${post.likes}</button>
                        <button onclick="toggleComments(${post.id})">💬 Комментарии</button>
                    </div>
                    <div id="comments-${post.id}" style="display: none; margin-top: 15px;">
                        <div id="comments-container-${post.id}"></div>
                        <form onsubmit="event.preventDefault(); addComment(${post.id})" style="margin-top: 15px;">
                            <input type="text" id="comment-text-${post.id}" placeholder="Написать комментарий..." required>
                            <button type="submit">Отправить</button>
                        </form>
                    </div>
                </div>
            `;
        }
        
        html += `</div>`;
        document.getElementById('app').innerHTML = renderNavbar() + html;
        
        for (const post of posts) {
            await loadComments(post.id);
        }
        
        const form = document.getElementById('createPostForm');
        if (form) {
            form.onsubmit = async (e) => {
                e.preventDefault();
                const groupId = document.getElementById('groupId').value;
                const content = document.getElementById('content').value;
                
                try {
                    await api.createPost(content, groupId);
                    showToast('Пост опубликован!');
                    renderPage('feed');
                } catch (error) {
                    showToast(error.message, true);
                }
            };
        }
    } catch (error) {
        showToast(error.message, true);
        document.getElementById('app').innerHTML = renderNavbar() + '<div class="container"><div class="card">Ошибка загрузки ленты</div></div>';
    }
}

async function deletePost(id) {
    if (confirm('Удалить пост?')) {
        try {
            await api.deletePost(id);
            showToast('Пост удалён');
            renderPage('feed');
        } catch (error) {
            showToast(error.message, true);
        }
    }
}

async function likePost(id) {
    try {
        await api.likePost(id);
        renderPage('feed');
    } catch (error) {
        showToast(error.message, true);
    }
}

function toggleComments(postId) {
    const commentsDiv = document.getElementById(`comments-${postId}`);
    if (commentsDiv) {
        commentsDiv.style.display = commentsDiv.style.display === 'none' ? 'block' : 'none';
    }
}

async function addComment(postId) {
    const text = document.getElementById(`comment-text-${postId}`).value;
    if (!text.trim()) {
        showToast('Введите текст комментария', true);
        return;
    }
    try {
        await api.addComment(text, postId);
        showToast('Комментарий добавлен');
        renderPage('feed');
    } catch (error) {
        showToast(error.message, true);
    }
}

// ========== ГРУППЫ ==========

async function renderGroups() {
    try {
        const groups = await api.getGroups();
        
        let html = `
            <div class="container">
                <div class="card">
                    <h3>Создать новую группу</h3>
                    <form id="createGroupForm">
                        <div class="form-group">
                            <label>Название группы</label>
                            <input type="text" id="groupName" required>
                        </div>
                        <div class="form-group">
                            <label>Описание</label>
                            <textarea id="groupDescription" rows="2" required></textarea>
                        </div>
                        <button type="submit">Создать группу</button>
                    </form>
                </div>
                
                <h2>Все группы</h2>
                <div class="groups-grid">
        `;
        
        for (const group of groups) {
            html += `
                <div class="group-card">
                    <h3>${escapeHtml(group.name)}</h3>
                    <p>${escapeHtml(group.description) || 'Нет описания'}</p>
                    ${!group.isMember ? 
                        `<button onclick="joinGroup(${group.id})">Вступить</button>` : 
                        '<span style="color: green;">✓ Вы участник</span>'}
                </div>
            `;
        }
        
        html += `</div></div>`;
        document.getElementById('app').innerHTML = renderNavbar() + html;
        
        const form = document.getElementById('createGroupForm');
        if (form) {
            form.onsubmit = async (e) => {
                e.preventDefault();
                const name = document.getElementById('groupName').value;
                const description = document.getElementById('groupDescription').value;
                
                try {
                    await api.createGroup(name, description);
                    showToast('Группа создана!');
                    renderPage('groups');
                } catch (error) {
                    showToast(error.message, true);
                }
            };
        }
    } catch (error) {
        showToast(error.message, true);
    }
}

async function joinGroup(id) {
    try {
        await api.joinGroup(id);
        showToast('Вы вступили в группу');
        renderPage('groups');
    } catch (error) {
        showToast(error.message, true);
    }
}

// ========== ПОИСК ==========

async function renderSearch() {
    let html = `
        <div class="container">
            <div class="card">
                <h3>Поиск</h3>
                <div class="form-group">
                    <label>Поиск пользователей</label>
                    <input type="text" id="searchUsers" placeholder="По имени или классу...">
                    <div id="usersResults"></div>
                </div>
                <div class="form-group">
                    <label>Поиск групп</label>
                    <input type="text" id="searchGroups" placeholder="По названию группы...">
                    <div id="groupsResults"></div>
                </div>
            </div>
        </div>
    `;
    
    document.getElementById('app').innerHTML = renderNavbar() + html;
    
    const searchUsersInput = document.getElementById('searchUsers');
    if (searchUsersInput) {
        searchUsersInput.oninput = async (e) => {
            const query = e.target.value;
            if (query.length > 0) {
                try {
                    const users = await api.searchUsers(query);
                    document.getElementById('usersResults').innerHTML = users.map(u => `
                        <div class="card" style="margin-top: 10px;">
                            ${u.avatar || '👤'} ${escapeHtml(u.name)} (${escapeHtml(u.class) || 'Класс не указан'})
                        </div>
                    `).join('');
                } catch (error) {
                    console.error(error);
                }
            } else {
                document.getElementById('usersResults').innerHTML = '';
            }
        };
    }
    
    const searchGroupsInput = document.getElementById('searchGroups');
    if (searchGroupsInput) {
        searchGroupsInput.oninput = async (e) => {
            const query = e.target.value;
            try {
                const groups = await api.getGroups(query);
                document.getElementById('groupsResults').innerHTML = groups.map(g => `
                    <div class="card" style="margin-top: 10px;">
                        <strong>${escapeHtml(g.name)}</strong><br>${escapeHtml(g.description) || ''}
                    </div>
                `).join('');
            } catch (error) {
                console.error(error);
            }
        };
    }
}

// ========== ПРОФИЛЬ ==========

async function renderProfile() {
    const user = currentUser;
    let html = `
        <div class="container">
            <div class="card" style="max-width: 600px; margin: 0 auto;">
                <h2>Профиль пользователя</h2>
                <div style="text-align: center;">
                    <div style="font-size: 64px;">${user.avatar || '👨‍🎓'}</div>
                    <h3>${escapeHtml(user.name)}</h3>
                    <p>${escapeHtml(user.email)}</p>
                    <p>Класс: ${escapeHtml(user.class) || 'Не указан'}</p>
                    <p>Роль: ${user.role === 'admin' ? 'Администратор' : 'Ученик'}</p>
                </div>
                <hr style="margin: 20px 0;">
                <h3>Редактировать профиль</h3>
                <form id="editProfileForm">
                    <div class="form-group">
                        <label>Имя</label>
                        <input type="text" id="editName" value="${escapeHtml(user.name)}" required>
                    </div>
                    <div class="form-group">
                        <label>Класс</label>
                        <input type="text" id="editClass" value="${escapeHtml(user.class || '')}">
                    </div>
                    <button type="submit">Сохранить изменения</button>
                </form>
            </div>
        </div>
    `;
    
    document.getElementById('app').innerHTML = renderNavbar() + html;
    
    const form = document.getElementById('editProfileForm');
    if (form) {
        form.onsubmit = async (e) => {
            e.preventDefault();
            const name = document.getElementById('editName').value;
            const userClass = document.getElementById('editClass').value;
            
            try {
                await api.updateProfile({ name, class: userClass });
                currentUser.name = name;
                currentUser.class = userClass;
                showToast('Профиль обновлён!');
                renderPage('profile');
            } catch (error) {
                showToast(error.message, true);
            }
        };
    }
}

// ========== ЛОГИН / РЕГИСТРАЦИЯ ==========

function renderLogin() {
    const html = `
        <div class="container">
            <div class="card" style="max-width: 400px; margin: 50px auto;">
                <h2>Вход в систему</h2>
                <form id="loginForm">
                    <div class="form-group">
                        <label>Email</label>
                        <input type="email" id="email" required>
                    </div>
                    <div class="form-group">
                        <label>Пароль</label>
                        <input type="password" id="password" required>
                    </div>
                    <button type="submit">Войти</button>
                    <p style="margin-top: 10px;">Нет аккаунта? <a href="#" onclick="showRegister()">Зарегистрироваться</a></p>
                    <div id="errorMsg" class="error"></div>
                </form>
            </div>
        </div>
    `;
    
    document.getElementById('app').innerHTML = html;
    
    const form = document.getElementById('loginForm');
    if (form) {
        form.onsubmit = async (e) => {
            e.preventDefault();
            const email = document.getElementById('email').value;
            const password = document.getElementById('password').value;
            
            try {
                const data = await api.login({ email, password });
                api.setToken(data.token);
                currentUser = data.user;
                loadTheme();
                showToast(`Добро пожаловать, ${currentUser.name}!`);
                renderPage('feed');
            } catch (error) {
                document.getElementById('errorMsg').innerText = error.message;
            }
        };
    }
}

function renderRegister() {
    const html = `
        <div class="container">
            <div class="card" style="max-width: 400px; margin: 50px auto;">
                <h2>Регистрация</h2>
                <form id="registerForm">
                    <div class="form-group">
                        <label>Имя</label>
                        <input type="text" id="name" required>
                    </div>
                    <div class="form-group">
                        <label>Email</label>
                        <input type="email" id="email" required>
                    </div>
                    <div class="form-group">
                        <label>Класс</label>
                        <input type="text" id="class">
                    </div>
                    <div class="form-group">
                        <label>Пароль</label>
                        <input type="password" id="password" required>
                    </div>
                    <button type="submit">Зарегистрироваться</button>
                    <p style="margin-top: 10px;">Уже есть аккаунт? <a href="#" onclick="showLogin()">Войти</a></p>
                    <div id="errorMsg" class="error"></div>
                </form>
            </div>
        </div>
    `;
    
    document.getElementById('app').innerHTML = html;
    
    const form = document.getElementById('registerForm');
    if (form) {
        form.onsubmit = async (e) => {
            e.preventDefault();
            const name = document.getElementById('name').value;
            const email = document.getElementById('email').value;
            const password = document.getElementById('password').value;
            const userClass = document.getElementById('class').value;
            
            try {
                await api.register({ name, email, password, class: userClass });
                showToast('Регистрация успешна! Теперь войдите');
                showLogin();
            } catch (error) {
                document.getElementById('errorMsg').innerText = error.message;
            }
        };
    }
}

function showLogin() {
    renderLogin();
}

function showRegister() {
    renderRegister();
}

function logout() {
    api.setToken(null);
    currentUser = null;
    if (socket) {
        socket.disconnect();
        socket = null;
    }
    renderLogin();
}

// ========== ЧАТЫ ==========

function initSocket() {
    if (socket) return;
    socket = io('http://localhost:3000', {
        auth: { token: api.token }
    });
    
    socket.on('connect', () => {
        console.log('WebSocket подключен');
    });
    
    socket.on('chat_message', (message) => {
        if (currentChatRoomId === message.roomId) {
            addMessageToChat(message);
        }
    });
    
    socket.on('online_count', (count) => {
        const onlineSpan = document.getElementById('online-count');
        if (onlineSpan) onlineSpan.textContent = `${count} онлайн`;
    });
}

function addMessageToChat(message) {
    const chatMessages = document.getElementById('chat-messages');
    if (chatMessages) {
        chatMessages.innerHTML += `
            <div class="message ${message.userId === currentUser.id ? 'sent' : 'received'}">
                <strong>${escapeHtml(message.userName)}</strong><br>
                <div>${escapeHtml(message.text)}</div>
                <div class="message-time">${new Date(message.createdAt).toLocaleTimeString()}</div>
            </div>
        `;
        chatMessages.scrollTop = chatMessages.scrollHeight;
    }
}

async function loadChatRooms() {
    try {
        const rooms = await api.getChatRooms();
        const container = document.getElementById('chat-rooms-list');
        if (container) {
            container.innerHTML = rooms.map(room => `
                <div class="conversation-item ${currentChatRoomId === room.id ? 'active' : ''}" 
                     onclick="joinChatRoom(${room.id}, '${escapeHtml(room.name)}')">
                    <div class="conversation-name">👥 ${escapeHtml(room.name)}</div>
                    <div class="conversation-last-message">${room.member_count} участников</div>
                </div>
            `).join('');
        }
    } catch (error) {
        console.error('Ошибка загрузки чатов:', error);
    }
}

async function joinChatRoom(roomId, name) {
    if (currentChatRoomId) {
        socket.emit('leave_chat', currentChatRoomId);
    }
    
    currentChatRoomId = roomId;
    socket.emit('join_chat', roomId);
    
    try {
        const messages = await api.getChatMessages(roomId);
        const members = await api.getChatMembers(roomId);
        
        const chatMessages = document.getElementById('chat-messages');
        chatMessages.innerHTML = messages.map(msg => `
            <div class="message ${msg.user_id === currentUser.id ? 'sent' : 'received'}">
                <strong>${escapeHtml(msg.user_name)}</strong><br>
                <div>${escapeHtml(msg.text)}</div>
                <div class="message-time">${new Date(msg.created_at).toLocaleTimeString()}</div>
            </div>
        `).join('');
        chatMessages.scrollTop = chatMessages.scrollHeight;
        
        document.getElementById('chat-header').innerHTML = `
            💬 ${escapeHtml(name)} 
            <span id="online-count" style="font-size: 12px; color: #666;">0 онлайн</span>
            <button class="secondary" onclick="showAddMemberToChat(${roomId})" style="padding: 5px 10px;">➕ Добавить</button>
        `;
        
        document.getElementById('chat-area').style.display = 'flex';
        document.getElementById('new-chat-area').style.display = 'none';
        
        loadChatRooms();
    } catch (error) {
        showToast(error.message, true);
    }
}

async function showAddMemberToChat(roomId) {
    try {
        const users = await api.getAllUsers();
        const members = await api.getChatMembers(roomId);
        const memberIds = members.map(m => m.id);
        const availableUsers = users.filter(u => !memberIds.includes(u.id));
        
        const modal = document.createElement('div');
        modal.className = 'modal';
        modal.style.cssText = `
            position: fixed; top: 0; left: 0; right: 0; bottom: 0;
            background: rgba(0,0,0,0.5); display: flex; align-items: center;
            justify-content: center; z-index: 1000;
        `;
        modal.innerHTML = `
            <div class="card" style="max-width: 500px; width: 90%;">
                <h3>Добавить участника</h3>
                <div id="available-users">
                    ${availableUsers.map(u => `
                        <div class="user-item" onclick="addMemberToChat(${roomId}, ${u.id}, '${escapeHtml(u.name)}')">
                            ${u.avatar || '👤'} ${escapeHtml(u.name)} (${escapeHtml(u.class) || 'Без класса'})
                        </div>
                    `).join('')}
                    ${availableUsers.length === 0 ? '<p>Нет доступных пользователей</p>' : ''}
                </div>
                <div style="margin-top: 15px;">
                    <button class="secondary" onclick="this.closest('.modal').remove()">Закрыть</button>
                </div>
            </div>
        `;
        document.body.appendChild(modal);
    } catch (error) {
        showToast(error.message, true);
    }
}

async function addMemberToChat(roomId, userId, userName) {
    try {
        await api.addChatMember(roomId, userId);
        showToast(`${userName} добавлен в чат!`);
        document.querySelector('.modal')?.remove();
        joinChatRoom(roomId, document.getElementById('chat-header')?.innerText.split('💬')[1]?.split('<')[0]?.trim() || 'Чат');
    } catch (error) {
        showToast(error.message, true);
    }
}

function sendChatMessage() {
    const input = document.getElementById('chat-message-input');
    const text = input.value.trim();
    if (!text || !currentChatRoomId) return;
    
    socket.emit('chat_message', {
        roomId: currentChatRoomId,
        text: text
    });
    input.value = '';
}

async function createNewChat() {
    const name = prompt('Введите название чата:');
    if (!name) return;
    
    const description = prompt('Введите описание (необязательно):');
    
    const selectedUsers = [];
    const checkboxes = document.querySelectorAll('.user-select:checked');
    checkboxes.forEach(cb => selectedUsers.push(parseInt(cb.value)));
    
    try {
        await api.createChatRoom(name, description, selectedUsers);
        showToast('Чат создан!');
        renderPage('chat');
    } catch (error) {
        showToast(error.message, true);
    }
}

function showCreateChatForm() {
    api.getAllUsers().then(users => {
        const modal = document.createElement('div');
        modal.className = 'modal';
        modal.style.cssText = `
            position: fixed; top: 0; left: 0; right: 0; bottom: 0;
            background: rgba(0,0,0,0.5); display: flex; align-items: center;
            justify-content: center; z-index: 1000;
        `;
        modal.innerHTML = `
            <div class="card" style="max-width: 500px; width: 90%;">
                <h3>Создать чат</h3>
                <div class="form-group">
                    <label>Название чата</label>
                    <input type="text" id="new-chat-name" placeholder="Название...">
                </div>
                <div class="form-group">
                    <label>Описание</label>
                    <input type="text" id="new-chat-desc" placeholder="Описание...">
                </div>
                <div class="form-group">
                    <label>Выберите участников</label>
                    <div id="users-for-chat">
                        ${users.map(u => `
                            <div>
                                <input type="checkbox" class="user-select" value="${u.id}" id="user_${u.id}">
                                <label for="user_${u.id}">${u.avatar || '👤'} ${escapeHtml(u.name)} (${escapeHtml(u.class) || 'Без класса'})</label>
                            </div>
                        `).join('')}
                    </div>
                </div>
                <div style="display: flex; gap: 10px; justify-content: flex-end;">
                    <button class="secondary" onclick="this.closest('.modal').remove()">Отмена</button>
                    <button onclick="createNewChat(); this.closest('.modal').remove()">Создать</button>
                </div>
            </div>
        `;
        document.body.appendChild(modal);
    });
}

async function renderChat() {
    if (!socket) {
        initSocket();
    }
    
    const html = `
        <div class="container">
            <div style="margin-bottom: 20px;">
                <button onclick="showCreateChatForm()">➕ Создать чат</button>
            </div>
            <div class="chat-container">
                <div class="conversations-list">
                    <div style="padding: 15px; font-weight: bold; border-bottom: 1px solid #eee;">Мои чаты</div>
                    <div id="chat-rooms-list"></div>
                </div>
                <div class="chat-area" id="chat-area" style="display: none;">
                    <div class="chat-header" id="chat-header"></div>
                    <div class="chat-messages" id="chat-messages"></div>
                    <div class="chat-input-area">
                        <input type="text" id="chat-message-input" placeholder="Введите сообщение..." onkeypress="if(event.key==='Enter') sendChatMessage()">
                        <button onclick="sendChatMessage()">Отправить</button>
                    </div>
                </div>
                <div class="chat-area" id="new-chat-area" style="display: flex; align-items: center; justify-content: center;">
                    <div class="card" style="text-align: center;">
                        <p>Выберите чат из списка слева или создайте новый</p>
                    </div>
                </div>
            </div>
        </div>
    `;
    
    document.getElementById('app').innerHTML = renderNavbar() + html;
    loadChatRooms();
}

// ========== БЛОГИ ==========

async function renderBlogs() {
    try {
        const blogs = await api.getBlogs();
        
        let html = `
            <div class="container">
                <div class="card">
                    <h3>Мой блог</h3>
                    ${await renderMyBlogSection()}
                </div>
                <h2>Все блоги</h2>
                <div class="groups-grid">
        `;
        
        for (const blog of blogs) {
            html += `
                <div class="group-card" onclick="viewBlog(${blog.id})">
                    <h3>📝 ${escapeHtml(blog.title)}</h3>
                    <p>${escapeHtml(blog.description) || 'Нет описания'}</p>
                    <p><small>Автор: ${escapeHtml(blog.owner_name)} | Подписчиков: ${blog.subscribers_count}</small></p>
                    ${blog.is_subscribed ? 
                        '<span style="color: green;">✓ Вы подписаны</span>' : 
                        '<button onclick="event.stopPropagation(); subscribeToBlog(' + blog.id + ')">📌 Подписаться</button>'}
                </div>
            `;
        }
        
        html += `</div></div>`;
        document.getElementById('app').innerHTML = renderNavbar() + html;
    } catch (error) {
        showToast(error.message, true);
    }
}

async function renderMyBlogSection() {
    try {
        const myBlog = await api.getUserBlog(currentUser.id);
        if (myBlog) {
            currentBlog = myBlog;
            return `
                <div style="display: flex; justify-content: space-between; align-items: center;">
                    <div>
                        <strong>${escapeHtml(myBlog.title)}</strong><br>
                        <small>${escapeHtml(myBlog.description)}</small>
                    </div>
                    <button onclick="viewBlog(${myBlog.id})">📝 Управлять блогом</button>
                </div>
            `;
        } else {
            return `<button onclick="createBlog()">➕ Создать блог</button>`;
        }
    } catch (error) {
        return `<button onclick="createBlog()">➕ Создать блог</button>`;
    }
}

async function createBlog() {
    const title = prompt('Введите название блога:');
    if (!title) return;
    const description = prompt('Введите описание блога:');
    
    try {
        await api.createBlog(title, description);
        showToast('Блог создан!');
        renderPage('blogs');
    } catch (error) {
        showToast(error.message, true);
    }
}

async function viewBlog(blogId) {
    try {
        const blogs = await api.getBlogs();
        const blog = blogs.find(b => b.id === blogId);
        if (!blog) {
            showToast('Блог не найден', true);
            return;
        }
        
        const posts = await api.getBlogPosts(blogId);
        const isOwner = blog.owner_id === currentUser.id;
        
        let html = `
            <div class="container">
                <div class="card">
                    <div style="display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap; gap: 10px;">
                        <div>
                            <h2>📝 ${escapeHtml(blog.title)}</h2>
                            <p>${escapeHtml(blog.description) || ''}</p>
                            <p><small>Автор: ${escapeHtml(blog.owner_name)} | Подписчиков: ${blog.subscribers_count}</small></p>
                        </div>
                        <div>
                            <button onclick="renderPage('blogs')">← Назад</button>
                            ${!isOwner && !blog.is_subscribed ? 
                                `<button onclick="subscribeToBlog(${blog.id}); viewBlog(${blog.id})">📌 Подписаться</button>` : ''}
                        </div>
                    </div>
                </div>
                
                ${isOwner ? `
                    <div class="card">
                        <h3>Создать пост</h3>
                        <form id="createBlogPostForm">
                            <div class="form-group">
                                <label>Заголовок</label>
                                <input type="text" id="postTitle" required>
                            </div>
                            <div class="form-group">
                                <label>Содержание</label>
                                <textarea id="postContent" rows="5" required></textarea>
                            </div>
                            <button type="submit">Опубликовать</button>
                        </form>
                    </div>
                ` : ''}
                
                <h2>Посты блога</h2>
                ${posts.length === 0 ? '<div class="card">Нет постов</div>' : ''}
        `;
        
        for (const post of posts) {
            html += `
                <div class="card">
                    <div style="display: flex; justify-content: space-between; flex-wrap: wrap; gap: 10px;">
                        <h3>${escapeHtml(post.title)}</h3>
                        <small>${new Date(post.created_at).toLocaleString()}</small>
                    </div>
                    <p style="margin: 15px 0;">${escapeHtml(post.content)}</p>
                    <div style="display: flex; gap: 15px; margin-bottom: 10px;">
                        <button onclick="likeBlogPost(${post.id}, ${blog.id})">❤️ ${post.likes_count || 0}</button>
                        <button onclick="toggleBlogComments(${post.id})">💬 Комментарии</button>
                    </div>
                    <div id="blog-comments-${post.id}" style="display: none; margin-top: 15px;">
                        <div id="blog-comments-list-${post.id}"></div>
                        <form onsubmit="event.preventDefault(); addBlogComment(${post.id}, ${blog.id})" style="margin-top: 15px;">
                            <input type="text" id="blog-comment-text-${post.id}" placeholder="Написать комментарий..." required>
                            <button type="submit">Отправить</button>
                        </form>
                    </div>
                </div>
            `;
        }
        
        html += `</div>`;
        document.getElementById('app').innerHTML = renderNavbar() + html;
        
        for (const post of posts) {
            await loadBlogComments(post.id);
        }
        
        const form = document.getElementById('createBlogPostForm');
        if (form) {
            form.onsubmit = async (e) => {
                e.preventDefault();
                const title = document.getElementById('postTitle').value;
                const content = document.getElementById('postContent').value;
                
                try {
                    await api.createBlogPost(blogId, title, content);
                    showToast('Пост опубликован!');
                    viewBlog(blogId);
                } catch (error) {
                    showToast(error.message, true);
                }
            };
        }
    } catch (error) {
        showToast(error.message, true);
    }
}

async function loadBlogComments(postId) {
    try {
        const comments = await api.getBlogPostComments(postId);
        const container = document.getElementById(`blog-comments-list-${postId}`);
        if (container) {
            if (comments.length === 0) {
                container.innerHTML = '<p style="color: #666;">Нет комментариев</p>';
            } else {
                container.innerHTML = comments.map(c => `
                    <div class="comment">
                        <strong>${escapeHtml(c.user_name)}:</strong> ${escapeHtml(c.text)}
                        <small style="color: #666;">${new Date(c.created_at).toLocaleString()}</small>
                        ${currentUser.id === c.user_id || currentUser.role === 'admin' ? 
                            `<button class="danger" style="font-size: 10px; padding: 2px 5px; margin-left: 10px;" onclick="deleteBlogComment(${c.id}, ${postId})">Удалить</button>` : ''}
                    </div>
                `).join('');
            }
        }
    } catch (error) {
        console.error(error);
    }
}

async function subscribeToBlog(blogId) {
    try {
        await api.subscribeToBlog(blogId);
        showToast('Вы подписались на блог!');
        renderPage('blogs');
    } catch (error) {
        showToast(error.message, true);
    }
}

async function likeBlogPost(postId, blogId) {
    try {
        await api.likeBlogPost(postId);
        viewBlog(blogId);
    } catch (error) {
        showToast(error.message, true);
    }
}

async function addBlogComment(postId, blogId) {
    const text = document.getElementById(`blog-comment-text-${postId}`).value;
    if (!text.trim()) {
        showToast('Введите комментарий', true);
        return;
    }
    try {
        await api.addBlogComment(postId, text);
        showToast('Комментарий добавлен');
        viewBlog(blogId);
    } catch (error) {
        showToast(error.message, true);
    }
}

async function deleteBlogComment(commentId, postId) {
    if (confirm('Удалить комментарий?')) {
        try {
            await api.deleteBlogComment(commentId);
            showToast('Комментарий удалён');
            renderPage('blogs');
        } catch (error) {
            showToast(error.message, true);
        }
    }
}

function toggleBlogComments(postId) {
    const div = document.getElementById(`blog-comments-${postId}`);
    if (div) {
        div.style.display = div.style.display === 'none' ? 'block' : 'none';
    }
}

// ========== ОСНОВНАЯ ФУНКЦИЯ ==========

async function renderPage(page) {
    currentPage = page;
    if (!currentUser) {
        renderLogin();
        return;
    }
    
    switch(page) {
        case 'feed':
            await renderFeed();
            break;
        case 'groups':
            await renderGroups();
            break;
        case 'blogs':
            await renderBlogs();
            break;
        case 'chat':
            await renderChat();
            break;
        case 'search':
            await renderSearch();
            break;
        case 'profile':
            await renderProfile();
            break;
        default:
            await renderFeed();
    }
}

// ========== ЗАПУСК ==========

async function init() {
    loadTheme();
    if (api.token) {
        try {
            const response = await fetch('http://localhost:3000/api/users/profile', {
                headers: { 'Authorization': `Bearer ${api.token}` }
            });
            if (response.ok) {
                currentUser = await response.json();
                renderPage('feed');
            } else {
                api.setToken(null);
                renderLogin();
            }
        } catch (error) {
            api.setToken(null);
            renderLogin();
        }
    } else {
        renderLogin();
    }
}

// Глобальные функции для onclick
window.renderPage = renderPage;
window.toggleTheme = toggleTheme;
window.logout = logout;
window.createNewChat = createNewChat;
window.showCreateChatForm = showCreateChatForm;
window.joinChatRoom = joinChatRoom;
window.sendChatMessage = sendChatMessage;
window.showAddMemberToChat = showAddMemberToChat;
window.addMemberToChat = addMemberToChat;
window.createBlog = createBlog;
window.viewBlog = viewBlog;
window.subscribeToBlog = subscribeToBlog;
window.likeBlogPost = likeBlogPost;
window.addBlogComment = addBlogComment;
window.deleteBlogComment = deleteBlogComment;
window.toggleBlogComments = toggleBlogComments;
window.deletePost = deletePost;
window.likePost = likePost;
window.toggleComments = toggleComments;
window.addComment = addComment;
window.joinGroup = joinGroup;
window.showReplyForm = showReplyForm;
window.submitReply = submitReply;
window.likeComment = likeComment;
window.deleteComment = deleteComment;
window.showLogin = showLogin;
window.showRegister = showRegister;

init();