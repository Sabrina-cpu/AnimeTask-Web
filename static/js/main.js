// static/js/main.js

document.addEventListener('DOMContentLoaded', () => {
    const tokenKey = 'access_token';
    const token = localStorage.getItem(tokenKey); 
    const isDetailPage = window.location.pathname.includes('/detail');

    // ------------------------------------------
    // 1. VARIABLES DOM
    // ------------------------------------------
    
    // Layout Principal
    const resultsContainer = document.getElementById('resultsContainer');
    const searchForm = document.getElementById('searchForm');
    const apiMessageEl = document.getElementById('apiMessage');
    const mainTitle = document.querySelector('.content-container h1');
    const trendingSection = document.getElementById('trendingSection'); 
    
    // Buscador
    const searchInput = document.getElementById('searchInput');
    const suggestionsContainer = document.getElementById('suggestionsContainer'); 
    
    // Auth & Sidebar
    const loginLink = document.getElementById('loginLink');
    const authNav = document.getElementById('auth-nav');
    const userSidebar = document.getElementById('userSidebar');
    const menuToggleButton = document.getElementById('menuToggleButton');
    const profileUsernameEl = document.getElementById('profileUsername');
    const profileAvatarEl = document.getElementById('profileAvatar');

    // Vistas Dinámicas
    const editProfileLink = document.getElementById('editProfileLink');
    const changePasswordLink = document.getElementById('changePasswordLink');
    const favoritesLink = document.getElementById('favoritesLink');
    
    // Botones de Volver / Cancelar
    const backToSearchButtonEdit = document.getElementById('backToSearchButtonEdit');
    const backToSearchButtonPassword = document.getElementById('backToSearchButtonPassword');
    const cancelEditBtn = document.getElementById('cancelEditBtn');

    // ------------------------------------------
    // 2. UTILIDADES
    // ------------------------------------------

    function displayApiMessage(message, isError = true) {
        if (apiMessageEl) {
            apiMessageEl.textContent = message;
            apiMessageEl.className = isError ? 'error-message' : 'success-message';
            setTimeout(() => apiMessageEl.textContent = '', 5000);
        }
    }

    function debounce(func, delay) {
        let timeout;
        return function(...args) {
            clearTimeout(timeout);
            timeout = setTimeout(() => func.apply(this, args), delay);
        };
    }

    // ------------------------------------------
    // 3. NAVEGACIÓN Y VISTAS (SPA Logic)
    // ------------------------------------------

    function showView(viewId, title) {
        if (isDetailPage) return;

        if (searchForm) searchForm.style.display = 'none';
        if (resultsContainer) resultsContainer.style.display = 'none';
        if (trendingSection) trendingSection.style.display = 'none'; 
        
        document.querySelectorAll('.profile-view, .favorites-view').forEach(el => el.style.display = 'none');
        
        const target = document.getElementById(viewId);
        if (target) {
            target.style.display = 'block';
            target.classList.remove('hidden');
        }
        
        if (mainTitle) mainTitle.style.display = 'none'; 

        if (userSidebar) {
            userSidebar.classList.remove('is-open');
            document.body.classList.remove('sidebar-open');
        }
    }

    function resetToSearch() {
        if (isDetailPage) return;
        
        if (searchForm) searchForm.style.display = 'flex';
        if (resultsContainer) resultsContainer.style.display = 'grid';
        if (trendingSection) trendingSection.style.display = 'block'; 
        if (mainTitle) {
            mainTitle.style.display = 'block';
            mainTitle.textContent = 'Buscar Animes';
        }

        document.querySelectorAll('.profile-view, .favorites-view').forEach(el => el.style.display = 'none');
        if (apiMessageEl) apiMessageEl.textContent = '';
    }

    if (backToSearchButtonEdit) backToSearchButtonEdit.addEventListener('click', resetToSearch);
    if (backToSearchButtonPassword) backToSearchButtonPassword.addEventListener('click', resetToSearch);
    if (cancelEditBtn) cancelEditBtn.addEventListener('click', resetToSearch);

    if(editProfileLink) editProfileLink.addEventListener('click', () => showView('editProfileView', 'Editar Perfil'));
    if(changePasswordLink) changePasswordLink.addEventListener('click', () => showView('changePasswordView', 'Cambiar Contraseña'));
    if(favoritesLink) favoritesLink.addEventListener('click', () => {
        showView('favoritesView', 'Mis Favoritos');
        loadFavorites();
    });

    // ------------------------------------------
    // 4. AUTENTICACIÓN
    // ------------------------------------------

    function updateAuthButtons() {
        const logoutBtn = document.getElementById('logoutButton');
        
        if (isDetailPage) {
            if(authNav) {
                authNav.innerHTML = token ? 
                `<button id="logoutDetail" class="btn-logout">Cerrar Sesión</button>` : 
                `<a href="/login" class="btn-primary">Iniciar Sesión</a>`;
            }
            const logoutDetail = document.getElementById('logoutDetail');
            if(logoutDetail) logoutDetail.addEventListener('click', logout);
            return;
        }

        if (token) {
            if(loginLink) loginLink.style.display = 'none';
            if(logoutBtn) logoutBtn.style.display = 'none';
            if(userSidebar) userSidebar.classList.remove('hidden');
            if(menuToggleButton) menuToggleButton.classList.remove('hidden');
            loadProfileData();
        } else {
            if(loginLink) loginLink.style.display = 'block';
            if(logoutBtn) logoutBtn.style.display = 'none';
            if(userSidebar) userSidebar.classList.add('hidden');
            if(menuToggleButton) menuToggleButton.classList.add('hidden');
        }
    }

    function logout() {
        localStorage.removeItem(tokenKey);
        window.location.href = '/?logged_out=true';
    }

    document.querySelectorAll('.btn-logout').forEach(btn => btn.addEventListener('click', logout));
    const logoutSidebar = document.getElementById('logoutButtonSidebar');
    if(logoutSidebar) logoutSidebar.addEventListener('click', logout);


    // ------------------------------------------
    // 5. DATOS DE PERFIL
    // ------------------------------------------
    async function loadProfileData() {
        if (!token) return;
        try {
            const response = await fetch('/api/profile/me', {
                headers: { 'Authorization': `Bearer ${token}` }
            });
            if (response.ok) {
                const data = await response.json();
                if(profileUsernameEl) profileUsernameEl.textContent = data.username;
                if(profileAvatarEl) profileAvatarEl.src = data.avatar_url;
                
                const preview = document.getElementById('currentAvatarPreview');
                if(preview) preview.src = data.avatar_url;
                const inputUser = document.getElementById('editUsername');
                if(inputUser) inputUser.value = data.username;
            } else if (response.status === 401) {
                logout();
            }
        } catch (e) { console.error(e); }
    }

    // ------------------------------------------
    // 6. CARRUSEL DE TENDENCIAS
    // ------------------------------------------
    async function loadTrendingAnime() {
        const track = document.getElementById('trendingTrack');
        if (!track) return;

        try {
            const response = await fetch('/api/anime/trending');
            const animes = await response.json();

            track.innerHTML = ''; 

            if (animes.length === 0) {
                track.innerHTML = '<p style="text-align:center; width:100%;">No se pudieron cargar tendencias.</p>';
                return;
            }

            animes.forEach(anime => {
                const item = document.createElement('div');
                item.className = 'carousel-item';
                item.onclick = () => window.location.href = `/detail.html?mal_id=${anime.mal_id}`;
                
                item.innerHTML = `
                    <img src="${anime.image_url}" alt="${anime.title}" title="${anime.title}">
                    <p>${anime.title}</p>
                `;
                track.appendChild(item);
            });

        } catch (error) {
            console.error(error);
            track.innerHTML = '<p>Error de conexión.</p>';
        }
    }

    const prevBtn = document.getElementById('prevBtn');
    const nextBtn = document.getElementById('nextBtn');
    const track = document.getElementById('trendingTrack');

    if (prevBtn && nextBtn && track) {
        nextBtn.addEventListener('click', () => track.scrollBy({ left: 300, behavior: 'smooth' }));
        prevBtn.addEventListener('click', () => track.scrollBy({ left: -300, behavior: 'smooth' }));
    }

    // ------------------------------------------
    // 7. BÚSQUEDA
    // ------------------------------------------
    if (searchForm) {
        searchForm.addEventListener('submit', async (e) => {
            e.preventDefault();
            resetToSearch();

            const query = searchInput.value.trim();
            const genre = document.getElementById('genreFilter').value;
            const year = document.getElementById('yearFilter').value;
            
            if(!query && !genre && !year) {
                displayApiMessage("Ingresa un término, género o año.", true);
                return;
            }

            resultsContainer.innerHTML = '<div class="loading">Buscando y traduciendo animes...</div>';
            
            const params = new URLSearchParams();
            if(query) params.append('q', query);
            if(genre) params.append('genre', genre);
            if(year) params.append('year', year);

            try {
                const headers = token ? { 'Authorization': `Bearer ${token}` } : {};
                const res = await fetch(`/api/anime/search?${params}`, { headers });
                const data = await res.json();
                
                resultsContainer.innerHTML = '';
                if(data.length === 0) {
                    resultsContainer.innerHTML = '<p>No se encontraron resultados.</p>';
                    return;
                }

                data.forEach(anime => {
                    const card = document.createElement('div');
                    card.className = 'anime-card';
                    card.innerHTML = `
                        <img src="${anime.image_url || '/static/images/placeholder.jpg'}" alt="${anime.title}">
                        <h3>${anime.title}</h3>
                        <p>${anime.synopsis ? anime.synopsis.substring(0, 100) + '...' : 'Sin descripción.'}</p>
                        <a href="/detail.html?mal_id=${anime.mal_id}" class="btn-detail">Ver Detalles</a>
                    `;
                    resultsContainer.appendChild(card);
                });

            } catch (error) {
                console.error(error);
                resultsContainer.innerHTML = '<p>Error en la búsqueda.</p>';
            }
        });
    }

    // Autocomplete
    if (searchInput) {
        searchInput.addEventListener('input', debounce(async (e) => {
            const q = e.target.value.trim();
            if(q.length < 3) {
                if(suggestionsContainer) suggestionsContainer.style.display = 'none';
                return;
            }
            try {
                const res = await fetch(`/api/anime/suggest?q=${q}`);
                const titles = await res.json();
                
                if(suggestionsContainer) {
                    suggestionsContainer.innerHTML = '';
                    if(titles.length > 0) {
                        titles.slice(0,5).forEach(title => {
                            const div = document.createElement('div');
                            div.className = 'suggestion-item';
                            div.textContent = title;
                            div.onclick = () => {
                                searchInput.value = title;
                                suggestionsContainer.style.display = 'none';
                            };
                            suggestionsContainer.appendChild(div);
                        });
                        suggestionsContainer.style.display = 'block';
                    } else {
                        suggestionsContainer.style.display = 'none';
                    }
                }
            } catch(e){}
        }, 300));
        
        document.addEventListener('click', (e) => {
            if (suggestionsContainer && !e.target.closest('.input-group')) {
                suggestionsContainer.style.display = 'none';
            }
        });
    }

    // ------------------------------------------
    // 8. DETALLE DE ANIME + PERSONAJES + TRAILER
    // ------------------------------------------
    async function loadAnimeDetails() {
        const urlParams = new URLSearchParams(window.location.search);
        const malId = urlParams.get('mal_id');
        const container = document.getElementById('animeDetailContainer');

        if (!malId || !container) return;

        try {
            const response = await fetch(`/api/anime/${malId}`);
            if (!response.ok) throw new Error('Error al cargar');
            const anime = await response.json();

            let isFavorite = false;
            if (token) {
                const favRes = await fetch(`/api/favorites/status/${malId}`, {
                    headers: { 'Authorization': `Bearer ${token}` }
                });
                const favData = await favRes.json();
                isFavorite = favData.is_favorite;
            }

            // --- AQUÍ INSERTAMOS EL HTML DINÁMICO (Incluyendo Trailer si existe) ---
            container.innerHTML = `
                <div class="detail-header">
                    <img src="${anime.images.jpg.image_url}" alt="${anime.title}">
                    <div style="flex:1;">
                        <h1>${anime.title}</h1>
                        <p><strong>Tipo:</strong> ${anime.type} | <strong>Año:</strong> ${anime.year || '?'}</p>
                        <p><strong>Géneros:</strong> ${anime.genres ? anime.genres.map(g => g.name).join(', ') : 'N/A'}</p>
                        <p><strong>Status:</strong> ${anime.status}</p>
                        <div style="margin-top:20px;">
                            ${token ? 
                                `<button id="favBtn" class="btn-favorite ${isFavorite ? 'is-favorite' : ''}">
                                    ${isFavorite ? '💔 Quitar de Favoritos' : '❤️ Agregar a Favoritos'}
                                </button>` 
                                : '<p><a href="/login" style="color:#f72585; font-weight:bold;">Inicia sesión</a> para guardar en favoritos.</p>'}
                            <a href="/" class="btn-secondary" style="margin-left:10px; display:inline-block;">Volver al Inicio</a>
                        </div>
                    </div>
                </div>
                
                <div class="detail-synopsis">
                    <h3>Sinopsis</h3>
                    <p style="line-height:1.6;">${anime.synopsis || 'Sinopsis no disponible.'}</p>
                </div>

                ${anime.trailer && anime.trailer.embed_url ? `
                    <div class="trailer-section">
                        <h3>🎬 Tráiler Oficial</h3>
                        <div class="video-container">
                            <iframe width="100%" height="400" src="${anime.trailer.embed_url}" frameborder="0" allowfullscreen></iframe>
                        </div>
                    </div>
                ` : ''}

                <div class="characters-section">
                    <h3>Personajes Principales</h3>
                    <div id="charactersTrack" class="characters-grid">
                        <p class="loading">Cargando personajes...</p>
                    </div>
                </div>
            `;

            // Lógica Favoritos
            const favBtn = document.getElementById('favBtn');
            if(favBtn) {
                favBtn.addEventListener('click', async () => {
                    const res = await fetch('/api/favorites/toggle', {
                        method: 'POST',
                        headers: { 
                            'Authorization': `Bearer ${token}`,
                            'Content-Type': 'application/json'
                        },
                        body: JSON.stringify({ mal_id: parseInt(malId) })
                    });
                    const data = await res.json();
                    if(data.is_favorite) {
                        favBtn.textContent = '💔 Quitar de Favoritos';
                        favBtn.classList.add('is-favorite');
                    } else {
                        favBtn.textContent = '❤️ Agregar a Favoritos';
                        favBtn.classList.remove('is-favorite');
                    }
                });
            }

            // Cargar Personajes
            loadCharacters(malId);

        } catch (error) {
            console.error(error);
            container.innerHTML = '<p class="error-message">Error al cargar detalles del anime.</p>';
        }
    }

    // --- FUNCIÓN PARA CARGAR PERSONAJES ---
    async function loadCharacters(malId) {
        const track = document.getElementById('charactersTrack');
        if(!track) return;

        try {
            const res = await fetch(`/api/anime/${malId}/characters`);
            const characters = await res.json();

            track.innerHTML = ''; 

            if (characters.length === 0) {
                track.innerHTML = '<p>No hay información de personajes.</p>';
                return;
            }

            characters.forEach(char => {
                const div = document.createElement('div');
                div.className = 'character-card';
                div.innerHTML = `
                    <img src="${char.image_url}" alt="${char.name}">
                    <p>${char.name}</p>
                    <span>${char.role}</span>
                `;
                track.appendChild(div);
            });

        } catch (error) {
            console.error(error);
            track.innerHTML = '';
        }
    }

    // ------------------------------------------
    // 9. GESTIÓN DE FAVORITOS (Lista)
    // ------------------------------------------
    async function loadFavorites() {
        const container = document.getElementById('favoritesResultsContainer');
        if(!container) return;
        container.innerHTML = '<div class="loading">Cargando tus favoritos...</div>';

        try {
            const res = await fetch('/api/favorites', { headers: { 'Authorization': `Bearer ${token}` } });
            const ids = await res.json();

            if(ids.length === 0) {
                container.innerHTML = '<p>Aún no tienes favoritos guardados.</p>';
                return;
            }

            container.innerHTML = '';
            const promises = ids.map(id => fetch(`/api/anime/${id}`).then(r => r.json().catch(()=>null)));
            const animes = await Promise.all(promises);

            animes.forEach(anime => {
                if(!anime) return;
                const card = document.createElement('div');
                card.className = 'anime-card';
                card.innerHTML = `
                    <img src="${anime.images.jpg.image_url}" alt="${anime.title}">
                    <h3>${anime.title}</h3>
                    <a href="/detail.html?mal_id=${anime.mal_id}" class="btn-detail">Ver Detalles</a>
                `;
                container.appendChild(card);
            });

        } catch (error) {
            container.innerHTML = '<p>Error cargando favoritos.</p>';
        }
    }

    // ------------------------------------------
    // 10. FORMULARIOS DE PERFIL
    // ------------------------------------------
    const editProfileForm = document.getElementById('editProfileForm');
    if(editProfileForm) {
        editProfileForm.addEventListener('submit', async (e) => {
            e.preventDefault();
            const formData = new FormData(editProfileForm);
            try {
                const res = await fetch('/api/profile/update', {
                    method: 'PUT',
                    headers: { 'Authorization': `Bearer ${token}` },
                    body: formData
                });
                const data = await res.json();
                const msgEl = document.getElementById('profileMessage');
                if(res.ok) {
                    msgEl.textContent = 'Perfil actualizado correctamente.';
                    msgEl.className = 'success-message';
                    loadProfileData(); 
                    setTimeout(resetToSearch, 1500); 
                } else {
                    msgEl.textContent = data.detail || 'Error al actualizar';
                    msgEl.className = 'error-message';
                }
            } catch(e) { console.error(e); }
        });
    }

    const changePasswordForm = document.getElementById('changePasswordForm');
    if(changePasswordForm) {
        changePasswordForm.addEventListener('submit', async (e) => {
            e.preventDefault();
            const formData = new FormData(changePasswordForm);
            const jsonData = Object.fromEntries(formData.entries());
            
            if(jsonData.newPassword !== jsonData.confirmNewPassword) {
                document.getElementById('passwordMessage').textContent = "Las contraseñas no coinciden.";
                document.getElementById('passwordMessage').className = 'error-message';
                return;
            }

            try {
                const res = await fetch('/api/profile/password', {
                    method: 'PUT',
                    headers: { 
                        'Authorization': `Bearer ${token}`,
                        'Content-Type': 'application/json' 
                    },
                    body: JSON.stringify({
                        current_password: jsonData.currentPassword,
                        new_password: jsonData.newPassword
                    })
                });
                const data = await res.json();
                const msgEl = document.getElementById('passwordMessage');
                
                if(res.ok) {
                    msgEl.textContent = 'Contraseña cambiada.';
                    msgEl.className = 'success-message';
                    changePasswordForm.reset();
                    setTimeout(resetToSearch, 1500);
                } else {
                    msgEl.textContent = data.detail;
                    msgEl.className = 'error-message';
                }
            } catch(e) { console.error(e); }
        });
    }

    // Menú Hamburguesa
    if(menuToggleButton && userSidebar) {
        menuToggleButton.addEventListener('click', () => {
            userSidebar.classList.toggle('is-open');
            document.body.classList.toggle('sidebar-open');
        });
    }

    // ------------------------------------------
    // 11. INICIALIZACIÓN
    // ------------------------------------------
    updateAuthButtons();
    
    if(isDetailPage) {
        loadAnimeDetails();
    } else {
        loadTrendingAnime();
    }
});