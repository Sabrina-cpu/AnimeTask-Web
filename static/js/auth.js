document.addEventListener('DOMContentLoaded', () => {
    const messageEl = document.getElementById('message');
    const tokenKey = 'access_token';

    // Función para mostrar mensajes de error/éxito
    function displayMessage(message, isError = true) {
        messageEl.textContent = message;
        messageEl.className = isError ? 'error-message' : 'success-message';
        setTimeout(() => messageEl.textContent = '', 5000); // Limpiar después de 5s
    }

    // ------------------------------------------
    // LÓGICA DE REGISTRO
    // ------------------------------------------
    const registerForm = document.getElementById('registerForm');
    if (registerForm) {
        registerForm.addEventListener('submit', async (e) => {
            e.preventDefault();
            const formData = new FormData(registerForm);

            try {
                const response = await fetch('/register', {
                    method: 'POST',
                    body: formData, // FastAPI/Form manejará FormData
                });

                const data = await response.json();

                if (response.ok) {
                    displayMessage(data.message + " Redirigiendo...", false);
                    setTimeout(() => {
                        window.location.href = '/login'; // Redirigir después del éxito
                    }, 2000);
                } else {
                    displayMessage(`Error de Registro: ${data.detail || data.message}`);
                }
            } catch (error) {
                console.error('Error de red:', error);
                displayMessage('Error de conexión con el servidor.');
            }
        });
    }

    // ------------------------------------------
    // LÓGICA DE LOGIN
    // ------------------------------------------
    const loginForm = document.getElementById('loginForm');
    if (loginForm) {
        loginForm.addEventListener('submit', async (e) => {
            e.preventDefault();
            const formData = new FormData(loginForm);

            try {
                const response = await fetch('/login', {
                    method: 'POST',
                    body: formData, // FastAPI/Form manejará FormData
                });

                const data = await response.json();

                if (response.ok) {
                    // 1. Guardar el token JWT en localStorage
                    localStorage.setItem(tokenKey, data.access_token);
                    displayMessage('Inicio de sesión exitoso. Redirigiendo...', false);
                    
                    // 2. Redirigir al dashboard
                    setTimeout(() => {
                        window.location.href = '/'; 
                    }, 1000);
                } else {
                    displayMessage(`Error de Acceso: ${data.detail || 'Credenciales inválidas.'}`);
                }
            } catch (error) {
                console.error('Error de red:', error);
                displayMessage('Error de conexión con el servidor.');
            }
        });
    }

    // Redirección de seguridad: Si hay token, no deberían estar en login/register
    if (localStorage.getItem(tokenKey) && (window.location.pathname === '/login' || window.location.pathname === '/register')) {
        // window.location.href = '/';
    }
});