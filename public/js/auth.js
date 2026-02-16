// DOM Elements
const tabGuest = document.getElementById('tab-guest');
const tabLogin = document.getElementById('tab-login');
const tabRegister = document.getElementById('tab-register');

const formGuest = document.getElementById('guest-form');
const formLogin = document.getElementById('login-form');
const formRegister = document.getElementById('register-form');

const errorMsg = document.getElementById('error-msg');
const roomSelectContainer = document.getElementById('room-selector-container');
const roomSelect = document.getElementById('room-select');

// --- Load Rooms ---
async function loadRooms() {
    try {
        const res = await fetch('/api/rooms');
        const rooms = await res.json();

        roomSelect.innerHTML = rooms.map(room =>
            `<option value="${room.id}">${room.name}</option>`
        ).join('');
    } catch (err) {
        console.error('Error loading rooms:', err);
    }
}
loadRooms();

// Tab Switching Logic
function activateTab(activeTab, showForm) {
    [tabGuest, tabLogin, tabRegister].forEach(t => {
        t.classList.remove('text-brand-600', 'border-b-2', 'border-brand-500', 'font-semibold');
        t.classList.add('text-slate-500');
    });

    activeTab.classList.remove('text-slate-500');
    activeTab.classList.add('text-brand-600', 'border-b-2', 'border-brand-500', 'font-semibold');

    [formGuest, formLogin, formRegister].forEach(f => f.classList.add('hidden'));
    showForm.classList.remove('hidden');

    // Toggle Room Selector visibility
    if (activeTab === tabRegister) {
        roomSelectContainer.classList.add('hidden');
    } else {
        roomSelectContainer.classList.remove('hidden');
    }

    errorMsg.classList.add('hidden');
    errorMsg.textContent = '';
}

tabGuest.addEventListener('click', () => activateTab(tabGuest, formGuest));
tabLogin.addEventListener('click', () => activateTab(tabLogin, formLogin));
tabRegister.addEventListener('click', () => activateTab(tabRegister, formRegister));

// Form Handlers

// 1. Guest
formGuest.addEventListener('submit', (e) => {
    e.preventDefault();
    const username = document.getElementById('guest-username').value.trim();
    const roomId = roomSelect.value;

    if (username) {
        sessionStorage.setItem('chat_user', JSON.stringify({
            username: username,
            role: 'guest',
            roomId: roomId
        }));
        window.location.href = 'chat.html';
    }
});

// 2. Login
formLogin.addEventListener('submit', async (e) => {
    e.preventDefault();
    const username = document.getElementById('login-username').value.trim();
    const password = document.getElementById('login-password').value.trim();
    const roomId = roomSelect.value;

    try {
        const res = await fetch('/api/login', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ username, password })
        });
        const data = await res.json();

        if (data.success) {
            sessionStorage.setItem('chat_user', JSON.stringify({
                ...data, // includes username, role, etc.
                roomId: roomId
            }));
            window.location.href = 'chat.html';
        } else {
            showError(data.message || 'Error al iniciar sesión');
        }
    } catch (err) {
        showError('Error de conexión con el servidor');
    }
});

// 3. Register (Enhanced)
formRegister.addEventListener('submit', async (e) => {
    e.preventDefault();

    const username = document.getElementById('reg-username').value.trim();
    const password = document.getElementById('reg-password').value.trim();
    const confirmPassword = document.getElementById('reg-confirm-password').value.trim();
    const name = document.getElementById('reg-name').value.trim();
    const email = document.getElementById('reg-email').value.trim();
    const country = document.getElementById('reg-country').value.trim();

    if (password !== confirmPassword) {
        return showError('Las contraseñas no coinciden.');
    }

    try {
        const res = await fetch('/api/register', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ username, password, name, email, country })
        });
        const data = await res.json();

        if (data.success) {
            alert('Cuenta creada exitosamente. ¡Ahora inicia sesión!');
            activateTab(tabLogin, formLogin);
        } else {
            showError(data.message || 'Error al registrarse');
        }
    } catch (err) {
        showError('Error de conexión con el servidor');
    }
});

function showError(msg) {
    errorMsg.textContent = msg;
    errorMsg.classList.remove('hidden');
}
