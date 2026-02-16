const socket = io();

// Constants & DOM
const messagesContainer = document.getElementById('messages');
const chatForm = document.getElementById('chat-form');
const msgInput = document.getElementById('msg-input');
const userList = document.getElementById('user-list');
const dmList = document.getElementById('dm-list');
const currentUsernameDisplay = document.getElementById('current-username');
const currentRoomNameDisplay = document.getElementById('current-room-name');
const userCountDisplay = document.getElementById('user-count');
const mainRoomBtn = document.getElementById('main-room-btn');

// Admin Elements
const adminPanelBtn = document.getElementById('admin-panel-btn');
const adminModal = document.getElementById('admin-modal');
const closeAdminModal = document.getElementById('close-admin-modal');
const adminRoomList = document.getElementById('admin-room-list');
const adminUserList = document.getElementById('admin-user-list');
const createRoomForm = document.getElementById('create-room-form');

// Logout
const logoutBtn = document.getElementById('logout-btn');
const mobileLogoutBtn = document.getElementById('mobile-logout-btn');

// --- State ---
const userSession = JSON.parse(sessionStorage.getItem('chat_user'));
if (!userSession) window.location.href = 'index.html';

const { username, role, roomId } = userSession;
let activeView = { type: 'room', target: roomId }; // type: 'room' | 'dm', target: id | username
let chatHistory = {}; // { 'general': [...], 'user1': [...] }
let roomsMap = {};
let activeDMs = new Set(); // Set of usernames we have a chat with

// Initial Setup
currentUsernameDisplay.textContent = username;
if (role === 'admin') adminPanelBtn.classList.remove('hidden');

// Fetch Room Names for display
fetch('/api/rooms').then(res => res.json()).then(rooms => {
    rooms.forEach(r => roomsMap[r.id] = r.name);
    updateHeader();
});

// --- Core Socket Events ---

socket.emit('join', { username, role, room: roomId });

socket.on('message', (data) => {
    if (data.type === 'system-error') {
        alert(data.text);
        return;
    }

    // Determine where to store this message
    let chatKey;
    if (data.isPrivate) {
        // If I sent it, target is 'to'. If I received it, target is 'from'.
        chatKey = (data.from === username) ? data.to : data.from;
        activeDMs.add(chatKey);
        updateDMList();
    } else {
        chatKey = roomId; // For now we only support 1 room at a time per session
    }

    if (!chatHistory[chatKey]) chatHistory[chatKey] = [];
    chatHistory[chatKey].push(data);

    // Only render if it's the active view
    if (shouldRenderMessage(data)) {
        appendMessage(data);
        messagesContainer.scrollTop = messagesContainer.scrollHeight;
    } else {
        // Notification logic could go here
        updateSidebarNotifications(chatKey);
    }
});

socket.on('forceDisconnect', (reason) => {
    alert(reason);
    sessionStorage.removeItem('chat_user');
    window.location.href = 'index.html';
});

socket.on('roomUsers', ({ users }) => {
    renderUserList(users);
});

// --- UI Logic ---

function updateHeader() {
    if (activeView.type === 'room') {
        const name = roomsMap[activeView.target] || activeView.target;
        currentRoomNameDisplay.textContent = `# ${name}`;
        document.getElementById('mobile-room-name').textContent = `# ${name}`;
    } else {
        currentRoomNameDisplay.textContent = `@ ${activeView.target}`;
        document.getElementById('mobile-room-name').textContent = `@ ${activeView.target}`;
    }
}

function shouldRenderMessage(data) {
    if (activeView.type === 'room' && !data.isPrivate) return true;
    if (activeView.type === 'dm' && data.isPrivate) {
        return (data.from === activeView.target || data.to === activeView.target);
    }
    return false;
}

function renderChat() {
    messagesContainer.innerHTML = '';
    const key = activeView.target;
    const history = chatHistory[key] || [];
    history.forEach(appendMessage);
    messagesContainer.scrollTop = messagesContainer.scrollHeight;
    updateHeader();
    updateDMList(); // refresh active state

    // Clear notification badge for this chat
    const badge = document.querySelector(`[data-badge="${key}"]`);
    if (badge) badge.classList.add('hidden');
}

function updateSidebarNotifications(key) {
    // Basic notification badge logic
    const badge = document.querySelector(`[data-badge="${key}"]`);
    if (badge) badge.classList.remove('hidden');
}

// Switching View
mainRoomBtn.addEventListener('click', () => {
    activeView = { type: 'room', target: roomId };
    renderChat();
});

window.switchChat = (targetUsername) => {
    activeView = { type: 'dm', target: targetUsername };
    if (!chatHistory[targetUsername]) chatHistory[targetUsername] = [];
    activeDMs.add(targetUsername);
    renderChat();
};

function updateDMList() {
    dmList.innerHTML = '';
    activeDMs.forEach(dmUser => {
        const isActive = activeView.type === 'dm' && activeView.target === dmUser;
        const li = document.createElement('li');
        li.className = `flex items-center justify-between p-2 rounded-lg cursor-pointer transition ${isActive ? 'bg-brand-100 text-brand-700 font-bold border border-brand-200 shadow-sm' : 'hover:bg-slate-50 text-slate-600'}`;
        li.onclick = () => switchChat(dmUser);

        li.innerHTML = `
            <div class="flex items-center gap-2">
                <div class="w-8 h-8 rounded-full bg-slate-200 flex items-center justify-center text-xs font-bold">${dmUser.charAt(0).toUpperCase()}</div>
                <span class="truncate max-w-[120px]">${dmUser}</span>
            </div>
            <span data-badge="${dmUser}" class="hidden w-2 h-2 bg-rose-500 rounded-full"></span>
        `;
        dmList.appendChild(li);
    });
}

function renderUserList(users) {
    userList.innerHTML = '';
    userCountDisplay.textContent = users.length;

    users.forEach(user => {
        const li = document.createElement('li');
        li.className = 'flex items-center justify-between p-2 hover:bg-slate-50 rounded-lg transition group relative';

        const isAdmin = user.role === 'admin';
        const isMe = user.username === username;
        const amIAdmin = role === 'admin';

        li.innerHTML = `
            <div class="flex items-center gap-3">
                <div class="w-2 h-2 rounded-full ${isAdmin ? 'bg-amber-500' : 'bg-green-500'}"></div>
                <span class="text-slate-600 font-medium">${user.username} ${isAdmin ? '<i class="fas fa-shield-alt text-amber-500 text-xs ml-1"></i>' : ''}</span>
            </div>
            ${!isMe ? `
                <button class="text-slate-400 hover:text-slate-600 focus:outline-none p-1" onclick="toggleContextMenu(event, '${user.username}')">
                    <i class="fas fa-ellipsis-v"></i>
                </button>
                <div id="ctx-menu-${user.username}" class="hidden absolute right-0 top-8 w-40 bg-white rounded-lg shadow-xl border border-slate-100 z-50 flex flex-col overflow-hidden">
                    <button onclick="switchChat('${user.username}')" class="text-left px-4 py-2 text-sm text-slate-700 hover:bg-slate-50 hover:text-brand-600">
                        <i class="fas fa-comments w-4"></i> Chat Privado
                    </button>
                    ${amIAdmin ? `
                        <button onclick="socketAction('mute', '${user.username}')" class="text-left px-4 py-2 text-sm text-slate-700 hover:bg-slate-50 hover:text-amber-600">
                            <i class="fas fa-volume-mute w-4"></i> Silenciar
                        </button>
                        <button onclick="socketAction('kick', '${user.username}')" class="text-left px-4 py-2 text-sm text-slate-700 hover:bg-slate-50 hover:text-orange-600">
                            <i class="fas fa-sign-out-alt w-4"></i> Expulsar
                        </button>
                        <button onclick="socketAction('ban', '${user.username}')" class="text-left px-4 py-2 text-sm text-red-600 hover:bg-red-50">
                            <i class="fas fa-ban w-4"></i> Banear
                        </button>
                    ` : ''}
                </div>
            ` : ''}
        `;
        userList.appendChild(li);
    });
}

// Send Message
chatForm.addEventListener('submit', (e) => {
    e.preventDefault();
    const msg = msgInput.value.trim();
    if (!msg) return;

    if (activeView.type === 'dm') {
        socket.emit('privateMessage', { targetUsername: activeView.target, text: msg });
    } else {
        socket.emit('chatMessage', msg);
    }

    msgInput.value = '';
    msgInput.focus();
});

// Helper: Append Message
function appendMessage(data) {
    const div = document.createElement('div');
    const isMe = data.username === username;
    const isSystem = data.type === 'system';
    const isPrivate = data.isPrivate;

    if (isSystem) {
        div.className = 'flex justify-center my-4';
        div.innerHTML = `<span class="px-4 py-1 rounded-full bg-slate-200 text-slate-600 text-xs font-medium shadow-sm">${data.text}</span>`;
    } else {
        div.className = `flex gap-4 message-enter ${isMe ? 'flex-row-reverse' : ''}`;
        const initial = data.username.charAt(0).toUpperCase();
        const isAdminMsg = data.role === 'admin';

        let avatarColor = isMe ? 'bg-brand-100 text-brand-600' : (isAdminMsg ? 'bg-amber-100 text-amber-600' : 'bg-indigo-100 text-indigo-600');
        let bubbleColor = isMe ? 'bg-brand-500 text-white' : (isAdminMsg ? 'bg-amber-50 border border-amber-200 text-amber-900' : 'bg-white text-slate-700 border border-slate-100');

        if (isPrivate) {
            avatarColor = 'bg-rose-100 text-rose-600';
            bubbleColor = isMe ? 'bg-rose-500 text-white shadow-md' : 'bg-rose-50 border border-rose-100 text-rose-900';
        }

        div.innerHTML = `
            <div class="w-8 h-8 rounded-full ${avatarColor} flex-shrink-0 flex items-center justify-center text-xs font-bold shadow-sm">
                ${initial}
            </div>
            <div class="flex flex-col gap-1 ${isMe ? 'items-end' : ''} max-w-[75%]">
                <div class="flex items-baseline gap-2 ${isMe ? 'flex-row-reverse' : ''}">
                    <span class="text-sm font-semibold ${isMe ? 'text-brand-900' : (isAdminMsg ? 'text-amber-700' : 'text-slate-900')}">
                        ${data.username}
                        ${isAdminMsg && !isMe ? '<i class="fas fa-shield-alt text-xs ml-1"></i>' : ''}
                    </span>
                    <span class="text-xs text-slate-400">${data.time || 'Ahora'}</span>
                </div>
                <div class="${bubbleColor} p-3 rounded-2xl ${isMe ? 'rounded-tr-none' : 'rounded-tl-none'} shadow-sm text-sm leading-relaxed">
                    <p>${isPrivate ? '<i class="fas fa-lock text-[10px] mr-1 opacity-40"></i>' : ''}${data.text}</p>
                </div>
            </div>
        `;
    }
    messagesContainer.appendChild(div);
}

// Global Helpers
window.toggleContextMenu = (e, targetUser) => {
    e.stopPropagation();
    document.querySelectorAll('[id^="ctx-menu-"]').forEach(el => el.classList.add('hidden'));
    const menu = document.getElementById(`ctx-menu-${targetUser}`);
    if (menu) menu.classList.toggle('hidden');
};

document.addEventListener('click', () => {
    document.querySelectorAll('[id^="ctx-menu-"]').forEach(el => el.classList.add('hidden'));
});

window.socketAction = (action, targetUser) => {
    if (!confirm(`¿Estás seguro de ${action} a ${targetUser}?`)) return;
    if (action === 'mute') socket.emit('admin:mute', targetUser);
    if (action === 'kick') socket.emit('admin:kick', targetUser);
    if (action === 'ban') socket.emit('admin:ban', targetUser);
};

function performLogout() {
    sessionStorage.removeItem('chat_user');
    window.location.href = 'index.html';
}
logoutBtn.addEventListener('click', performLogout);
if (mobileLogoutBtn) mobileLogoutBtn.addEventListener('click', performLogout);

// --- Admin Panel Logic (Modal) ---
if (role === 'admin') {
    adminPanelBtn.addEventListener('click', () => {
        adminModal.classList.remove('hidden');
        loadAdminRooms();
    });
    closeAdminModal.addEventListener('click', () => adminModal.classList.add('hidden'));

    async function loadAdminRooms() {
        const roomsRes = await fetch('/api/rooms');
        const rooms = await roomsRes.json();
        adminRoomList.innerHTML = rooms.map(r => `
            <li class="flex justify-between items-center p-2 bg-slate-50 rounded border border-slate-200">
                <span># ${r.name}</span>
                <button onclick="deleteRoom('${r.id}')" class="text-red-500 hover:text-red-700 text-sm"><i class="fas fa-trash"></i></button>
            </li>
        `).join('');
    }

    createRoomForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        const name = document.getElementById('new-room-name').value;
        if (!name) return;
        await fetch('/api/rooms', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ name, createdBy: username })
        });
        document.getElementById('new-room-name').value = '';
        loadAdminRooms();
    });

    window.deleteRoom = async (id) => {
        if (!confirm('¿Eliminar esta sala?')) return;
        await fetch(`/api/rooms/${id}`, { method: 'DELETE' });
        loadAdminRooms();
    };
}
