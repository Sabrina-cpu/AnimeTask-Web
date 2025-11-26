# main.py

import json
from datetime import datetime, timedelta
from typing import List, Optional
import os 

from fastapi import FastAPI, Form, HTTPException, Depends, status, Request, File, UploadFile, Header
from fastapi.security import OAuth2PasswordBearer
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from fastapi.templating import Jinja2Templates

from pydantic import BaseModel, EmailStr
from passlib.context import CryptContext
import httpx 
from jose import jwt, JWTError

# --- NUEVO: Importamos el traductor ---
from deep_translator import GoogleTranslator

# ------------------------------------------
# CONFIGURACIÓN
# ------------------------------------------

app = FastAPI()

app.mount("/static", StaticFiles(directory="static"), name="static")
templates = Jinja2Templates(directory="templates")

SECRET_KEY = "tu-clave-secreta-super-segura"
ALGORITHM = "HS256"
ACCESS_TOKEN_EXPIRE_MINUTES = 30

pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")
oauth2_scheme = OAuth2PasswordBearer(tokenUrl="login")

origins = ["*"] 

app.add_middleware(
    CORSMiddleware,
    allow_origins=origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

UPLOAD_DIR = "static/avatars"
os.makedirs(UPLOAD_DIR, exist_ok=True)

jikan_client = httpx.Client(base_url="https://api.jikan.moe/v4", timeout=10.0) # Aumentamos timeout por la traducción

# ------------------------------------------
# ESQUEMAS
# ------------------------------------------

class AnimeSearchResult(BaseModel):
    mal_id: int
    title: str
    synopsis: Optional[str] = None
    image_url: Optional[str] = None
    
class UserProfile(BaseModel):
    username: str 
    email: EmailStr
    avatar_url: str = "/static/images/default_avatar.png"

class PasswordUpdate(BaseModel):
    current_password: str
    new_password: str
    
class FavoriteToggle(BaseModel):
    mal_id: int 
    
# ------------------------------------------
# UTILS (Base de Datos, Validación y Traducción)
# ------------------------------------------

DB_FILE = "db.json"
DEFAULT_AVATAR = "/static/images/default_avatar.png"

# --- NUEVO: Función auxiliar para traducir ---
def traducir_texto(texto: str) -> str:
    """Traduce un texto de inglés a español usando Deep Translator."""
    if not texto:
        return "Sin descripción disponible."
    try:
        # Limitamos a 500 caracteres para que la búsqueda no sea muy lenta
        texto_a_traducir = texto[:500] 
        traducido = GoogleTranslator(source='auto', target='es').translate(texto_a_traducir)
        return traducido + "..." if len(texto) > 500 else traducido
    except Exception as e:
        print(f"Error traduciendo: {e}")
        return texto # Si falla, devolvemos el original en inglés

def load_db():
    try:
        with open(DB_FILE, "r") as f:
            return json.load(f)
    except (FileNotFoundError, json.JSONDecodeError):
        return {}

def save_db(data):
    with open(DB_FILE, "w") as f:
        json.dump(data, f, indent=4)

def is_strong_password(password: str) -> bool:
    return (
        len(password) >= 8 and
        any(c.islower() for c in password) and
        any(c.isupper() for c in password) and
        any(c.isdigit() for c in password)
    )

def verify_password(plain_password, hashed_password):
    return pwd_context.verify(plain_password, hashed_password)

# ------------------------------------------
# LÓGICA DE JWT
# ------------------------------------------

def create_access_token(data: dict, expires_delta: Optional[timedelta] = None):
    to_encode = data.copy()
    if expires_delta:
        expire = datetime.utcnow() + expires_delta
    else:
        expire = datetime.utcnow() + timedelta(minutes=ACCESS_TOKEN_EXPIRE_MINUTES)
    to_encode.update({"exp": expire})
    encoded_jwt = jwt.encode(to_encode, SECRET_KEY, algorithm=ALGORITHM)
    return encoded_jwt

def get_current_user(token: str = Depends(oauth2_scheme)) -> str:
    credentials_exception = HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail="No se pudieron validar las credenciales",
        headers={"WWW-Authenticate": "Bearer"},
    )
    try:
        payload = jwt.decode(token, SECRET_KEY, algorithms=[ALGORITHM])
        user_email: str = payload.get("sub")
        if user_email is None:
            raise credentials_exception
    except JWTError:
        raise credentials_exception
    
    users_db = load_db()
    if user_email not in users_db:
        raise credentials_exception
        
    return user_email

# Esta función permite que el usuario sea OPCIONAL (para búsqueda pública)
async def get_optional_user(authorization: Optional[str] = Header(None)) -> Optional[str]:
    if not authorization:
        return None 
    if authorization.startswith("Bearer "):
        token = authorization.split(" ")[1]
    else:
        return None 
    
    try:
        payload = jwt.decode(token, SECRET_KEY, algorithms=[ALGORITHM])
        user_email: str = payload.get("sub")
        users_db = load_db()
        if user_email is None or user_email not in users_db:
            return None 
        return user_email
    except JWTError:
        return None 

# ------------------------------------------
# ENDPOINTS
# ------------------------------------------

@app.get("/")
def read_root(request: Request):
    return templates.TemplateResponse("index.html", {"request": request})

@app.get("/login")
def login_view(request: Request):
    return templates.TemplateResponse("login.html", {"request": request})

@app.get("/register")
def register_view(request: Request):
    return templates.TemplateResponse("register.html", {"request": request})

@app.get("/detail.html")
def detail_view(request: Request):
    return templates.TemplateResponse("detail.html", {"request": request})


@app.post("/register")
def register_user(
    email: EmailStr = Form(...), 
    password: str = Form(...),
    username: str = Form(...) 
):
    users_db = load_db()
    
    for user_data in users_db.values():
        if user_data.get('username') == username:
            raise HTTPException(status_code=400, detail="El nombre de usuario ya está en uso.")

    if email in users_db: 
        raise HTTPException(status_code=400, detail="El email ya está registrado.")
    
    if not is_strong_password(password): 
        raise HTTPException(
            status_code=400, 
            detail="La contraseña debe tener al menos 8 caracteres, incluyendo mayúsculas, minúsculas y números."
        )

    hashed_password = pwd_context.hash(password)
    users_db[email] = {
        "password": hashed_password, 
        "username": username,
        "avatar_url": DEFAULT_AVATAR, 
        "favorites": [] 
    }
    save_db(users_db)
    return {"message": "Registro exitoso."}


@app.post("/login")
def login_for_access_token(
    email: str = Form(...), 
    password: str = Form(...)
):
    users_db = load_db()
    user_data = users_db.get(email)

    if not user_data or not verify_password(password, user_data["password"]):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Credenciales inválidas",
            headers={"WWW-Authenticate": "Bearer"},
        )
    
    access_token = create_access_token(data={"sub": email})
    return {"access_token": access_token, "token_type": "bearer"}

@app.get("/api/profile/me", response_model=UserProfile)
def get_current_user_profile(current_user_email: str = Depends(get_current_user)):
    users_db = load_db()
    if current_user_email in users_db:
        user_data = users_db[current_user_email]
        return UserProfile(
            username=user_data.get("username", current_user_email.split('@')[0]),
            email=current_user_email,
            avatar_url=user_data.get("avatar_url", DEFAULT_AVATAR)
        )
    raise HTTPException(status_code=404, detail="Usuario no encontrado.")

@app.put("/api/profile/update")
async def update_user_profile(
    current_user_email: str = Depends(get_current_user),
    username: Optional[str] = Form(None), 
    avatar: Optional[UploadFile] = File(None) 
):
    users_db = load_db()
    if current_user_email not in users_db:
        raise HTTPException(status_code=404, detail="Usuario no encontrado.")

    user_data = users_db[current_user_email]
    
    if username and username != user_data.get("username"):
        for email, data in users_db.items():
            if email != current_user_email and data.get("username") == username:
                raise HTTPException(status_code=400, detail="El nombre de usuario ya está en uso.")
        user_data["username"] = username

    if avatar:
        if not avatar.content_type.startswith("image/"):
            raise HTTPException(status_code=400, detail="El archivo debe ser una imagen.")
        
        filename = f"{current_user_email.split('@')[0]}_{datetime.now().strftime('%Y%m%d%H%M%S')}_{avatar.filename}"
        filepath = os.path.join(UPLOAD_DIR, filename)
        
        try:
            with open(filepath, "wb") as f:
                f.write(await avatar.read())
        except Exception:
            raise HTTPException(status_code=500, detail="Error al guardar avatar.")
            
        user_data["avatar_url"] = f"/{UPLOAD_DIR}/{filename}".replace("\\", "/") 
        
    save_db(users_db)
    return {"message": "Perfil actualizado.", "username": user_data["username"], "avatar_url": user_data["avatar_url"]}

@app.put("/api/profile/password")
def update_user_password(
    password_data: PasswordUpdate, 
    current_user_email: str = Depends(get_current_user)
):
    users_db = load_db()
    if current_user_email not in users_db:
        raise HTTPException(status_code=404, detail="Usuario no encontrado.")

    user_data = users_db[current_user_email]
    
    if not verify_password(password_data.current_password, user_data["password"]):
        raise HTTPException(status_code=400, detail="Contraseña actual incorrecta.")

    if not is_strong_password(password_data.new_password): 
        raise HTTPException(status_code=400, detail="La nueva contraseña no es segura.")

    user_data["password"] = pwd_context.hash(password_data.new_password)
    save_db(users_db)
    return {"message": "Contraseña actualizada."}

@app.post("/api/favorites/toggle")
def toggle_favorite(favorite: FavoriteToggle, current_user_email: str = Depends(get_current_user)):
    users_db = load_db()
    if current_user_email not in users_db:
        raise HTTPException(status_code=404, detail="Usuario no encontrado.")
    user_data = users_db[current_user_email]
    
    if favorite.mal_id in user_data["favorites"]:
        user_data["favorites"].remove(favorite.mal_id)
        action = "eliminado"
    else:
        user_data["favorites"].append(favorite.mal_id)
        action = "agregado"
    save_db(users_db)
    return {"message": f"Anime {action}", "is_favorite": action == "agregado"}

@app.get("/api/favorites", response_model=List[int])
def get_favorites_list(current_user_email: str = Depends(get_current_user)):
    users_db = load_db()
    if current_user_email not in users_db:
        raise HTTPException(status_code=404, detail="Usuario no encontrado.")
    return users_db[current_user_email].get("favorites", [])

@app.get("/api/favorites/status/{mal_id}")
def get_favorite_status(mal_id: int, current_user_email: str = Depends(get_current_user)):
    users_db = load_db()
    if current_user_email not in users_db: return {"is_favorite": False}
    is_favorite = mal_id in users_db[current_user_email].get("favorites", [])
    return {"is_favorite": is_favorite}

# --- MODIFICADO: Búsqueda con traducción y usuario opcional ---
@app.get("/api/anime/search", response_model=List[AnimeSearchResult])
def search_anime(
    q: Optional[str] = None, 
    genre: Optional[int] = None, 
    year: Optional[int] = None, 
    limit: Optional[int] = None, 
    current_user_email: Optional[str] = Depends(get_optional_user) # Esto permite búsqueda ANÓNIMA
):
    if not q and not genre and not year:
        raise HTTPException(status_code=400, detail="Faltan parámetros de búsqueda.")
    params = {}
    if q: params['q'] = q
    if genre: params['genres'] = genre
    if year: params['start_date_year'] = year
    if limit: params['limit'] = limit
    
    try:
        response = jikan_client.get("/anime", params=params)
        response.raise_for_status()
        data = response.json()
        results = []
        
        # Procesamos los resultados
        for anime in data.get('data', []):
            synopsis_raw = anime.get('synopsis')
            
            # TRADUCCIÓN (Esto puede hacer la búsqueda un poco más lenta)
            synopsis_es = traducir_texto(synopsis_raw)

            results.append(AnimeSearchResult(
                mal_id=anime.get('mal_id'),
                title=anime.get('title'), # Dejamos el título en inglés/japonés por precisión
                synopsis=synopsis_es,     # Sinopsis traducida
                image_url=anime.get('images', {}).get('jpg', {}).get('image_url')
            ))
        return results
    except Exception as e:
        print(f"Error en búsqueda: {e}")
        return []

@app.get("/api/anime/suggest", response_model=List[str])
def get_suggestions(q: str):
    if len(q) < 2: return []
    try:
        response = jikan_client.get("/anime", params={'q': q, 'limit': 5})
        data = response.json()
        return [anime['title'] for anime in data.get('data', [])]
    except Exception:
        return []


# --- NUEVO: Endpoint para Tendencias (Carousel) ---
@app.get("/api/anime/trending", response_model=List[AnimeSearchResult])
def get_trending_anime():
    try:
        # Pedimos los top 10 animes que están en emisión ahora mismo
        response = jikan_client.get("/top/anime", params={"filter": "airing", "limit": 10})
        response.raise_for_status()
        data = response.json().get('data', [])
        
        results = []
        for anime in data:
            # Nota: No traducimos aquí para que el carrousel cargue INSTANTÁNEO.
            # La traducción se hará si el usuario entra al detalle.
            results.append(AnimeSearchResult(
                mal_id=anime.get('mal_id'),
                title=anime.get('title'),
                image_url=anime.get('images', {}).get('jpg', {}).get('large_image_url') or anime.get('images', {}).get('jpg', {}).get('image_url')
            ))
        return results
    except Exception as e:
        print(f"Error fetching trending: {e}")
        return []

# --- MODIFICADO: Detalle con traducción ---
@app.get("/api/anime/{mal_id}")
def get_anime_details(mal_id: int):
    try:
        response = jikan_client.get(f"/anime/{mal_id}")
        response.raise_for_status()
        data = response.json().get('data', {})
        
        # Traducimos también la sinopsis del detalle
        if 'synopsis' in data:
            data['synopsis'] = traducir_texto(data['synopsis'])
            
        return data
    except Exception:
        raise HTTPException(status_code=404, detail="Anime no encontrado.")
    
    # main.py

class CharacterResult(BaseModel):
    name: str
    image_url: str
    role: str # "Main" o "Supporting"

@app.get("/api/anime/{mal_id}/characters", response_model=List[CharacterResult])
def get_anime_characters(mal_id: int):
    try:
        response = jikan_client.get(f"/anime/{mal_id}/characters")
        response.raise_for_status()
        data = response.json().get('data', [])
        
        characters = []
        # Tomamos solo los primeros 10 para no saturar
        for char in data[:10]: 
            characters.append(CharacterResult(
                name=char['character']['name'],
                image_url=char['character']['images']['jpg']['image_url'],
                role=char['role']
            ))
        return characters
    except Exception as e:
        print(f"Error fetching characters: {e}")

        return 


if __name__ == '__main__':
    # El host="0.0.0.0" es OBLIGATORIO para Render
    app.run(host="0.0.0.0", port=5000
