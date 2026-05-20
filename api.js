const API_URL = 'http://localhost:3000/api';

class API {
    constructor() {
        this.token = localStorage.getItem('token');
    }

    setToken(token) {
        this.token = token;
        if (token) {
            localStorage.setItem('token', token);
        } else {
            localStorage.removeItem('token');
        }
    }

    async request(endpoint, method = 'GET', data = null) {
        const headers = {
            'Content-Type': 'application/json',
        };
        
        if (this.token) {
            headers['Authorization'] = `Bearer ${this.token}`;
        }
        
        const config = {
            method,
            headers,
        };
        
        if (data) {
            config.body = JSON.stringify(data);
        }
        
        const response = await fetch(`${API_URL}${endpoint}`, config);
        const result = await response.json();
        
        if (!response.ok) {
            throw new Error(result.error || 'Ошибка запроса');
        }
        
        return result;
    }

    // Auth
    register(userData) {
        return this.request('/auth/register', 'POST', userData);
    }
    
    login(credentials) {
        return this.request('/auth/login', 'POST', credentials);
    }
    
    // Posts (группы)
    getPosts(page = 1) {
        return this.request(`/posts?page=${page}`, 'GET');
    }
    
    createPost(content, groupId) {
        return this.request('/posts', 'POST', { content, groupId });
    }
    
    deletePost(id) {
        return this.request(`/posts/${id}`, 'DELETE');
    }
    
    likePost(id) {
        return this.request(`/posts/${id}/like`, 'POST');
    }
    
    // Groups (сообщества)
    getGroups(search = '') {
        return this.request(`/groups?search=${search}`, 'GET');
    }
    
    createGroup(name, description) {
        return this.request('/groups', 'POST', { name, description });
    }
    
    joinGroup(id) {
        return this.request(`/groups/${id}/join`, 'POST');
    }
    
    // Comments (для постов групп)
    addComment(text, postId, parentCommentId = null) {
        return this.request('/comments', 'POST', { text, postId, parentCommentId });
    }
    
    getComments(postId) {
        return this.request(`/comments/post/${postId}`, 'GET');
    }
    
    likeComment(commentId) {
        return this.request(`/comments/${commentId}/like`, 'POST');
    }
    
    deleteComment(id) {
        return this.request(`/comments/${id}`, 'DELETE');
    }
    
    // Users
    searchUsers(query) {
        return this.request(`/users/search?q=${query}`, 'GET');
    }
    
    getUser(id) {
        return this.request(`/users/${id}`, 'GET');
    }
    
    updateProfile(data) {
        return this.request('/users/profile', 'PUT', data);
    }
    
    updateTheme(theme) {
        return this.request('/users/theme', 'PUT', { theme });
    }
    
    // CHAT (только групповые)
    getChatRooms() {
        return this.request('/chat', 'GET');
    }
    
    getChatMessages(roomId) {
        return this.request(`/chat/${roomId}/messages`, 'GET');
    }
    
    createChatRoom(name, description, memberIds) {
        return this.request('/chat', 'POST', { name, description, memberIds });
    }
    
    getChatMembers(roomId) {
        return this.request(`/chat/${roomId}/members`, 'GET');
    }
    
    addChatMember(roomId, userId) {
        return this.request(`/chat/${roomId}/members`, 'POST', { userId });
    }
    
    getAllUsers() {
        return this.request('/chat/users/all', 'GET');
    }
    
    // BLOGS
    getBlogs() {
        return this.request('/blogs', 'GET');
    }
    
    getUserBlog(userId) {
        return this.request(`/blogs/user/${userId}`, 'GET');
    }
    
    createBlog(title, description) {
        return this.request('/blogs', 'POST', { title, description });
    }
    
    subscribeToBlog(blogId) {
        return this.request(`/blogs/${blogId}/subscribe`, 'POST');
    }
    
    unsubscribeFromBlog(blogId) {
        return this.request(`/blogs/${blogId}/subscribe`, 'DELETE');
    }
    
    getBlogPosts(blogId) {
        return this.request(`/blogs/${blogId}/posts`, 'GET');
    }
    
    createBlogPost(blogId, title, content) {
        return this.request(`/blogs/${blogId}/posts`, 'POST', { title, content });
    }
    
    likeBlogPost(postId) {
        return this.request(`/blogs/posts/${postId}/like`, 'POST');
    }
    
    getBlogPostComments(postId) {
        return this.request(`/blogs/posts/${postId}/comments`, 'GET');
    }
    
    addBlogComment(postId, text) {
        return this.request(`/blogs/posts/${postId}/comments`, 'POST', { text });
    }
    
    deleteBlogComment(commentId) {
        return this.request(`/blogs/comments/${commentId}`, 'DELETE');
    }
}