# 🎬 Stremio Easynews French Addon

Addon Stremio exclusif pour contenus français (Films & Séries) via Easynews.

## 🚀 Installation Rapide

### Sur PC/Mac

```bash
# 1. Installe les dépendances
npm install

# 2. Configure .env avec tes identifiants Easynews
# EASYNEWS_USERNAME=ton_username
# EASYNEWS_PASSWORD=ton_password

# 3. Lance le serveur
npm start

# 4. Ouvre ton navigateur
http://127.0.0.1:7000
```

### Sur Android (Termux)

```bash
# 1. Installe Termux depuis F-Droid
pkg update && pkg upgrade
pkg install nodejs git
termux-setup-storage

# 2. Clone le repo
git clone https://github.com/Yannick057/stremio-easynews-french.git
cd stremio-easynews-french

# 3. Installe et configure
npm install
nano .env  # Configure tes identifiants
npm start

# 4. Ouvre http://127.0.0.1:7000
```

## ✨ Fonctionnalités

✅ Interface web de configuration  
✅ Installation en 1 clic dans Stremio  
✅ Recherche exclusive contenu français (FRENCH, VF, MULTI, TRUEFRENCH, VOSTFR)  
✅ Tri intelligent par qualité (4K → 1080p → 720p → 480p)  
✅ Support Films & Séries  
✅ Cache 6h pour performances optimales  
✅ Options personnalisables (qualité min, max résultats)  

## 🎯 Utilisation

1. **Ouvre** http://127.0.0.1:7000
2. **Entre** tes identifiants Easynews
3. **Clique** "🚀 Installer dans Stremio"
4. **C'est tout !** Les streams français apparaîtront dans Stremio

## 📋 Configuration

### Via interface web (recommandé)
- Username/Password Easynews
- Nombre max de résultats (10-50)
- Qualité minimale (480p/720p/1080p/4K)
- Cache activé/désactivé

### Via fichier .env (manuel)
```env
EASYNEWS_USERNAME=ton_username
EASYNEWS_PASSWORD=ton_password
PORT=7000
```

## 🔧 Dépannage

**Aucun résultat ?**
- Vérifie tes identifiants Easynews
- Baisse la qualité minimale
- Teste avec "Intouchables" ou "Asterix"

**Interface inaccessible ?**
- Vérifie que le serveur tourne : `npm start`
- Ouvre http://127.0.0.1:7000 (pas localhost)

**Stremio ne s'ouvre pas automatiquement ?**
- Utilise "Copier le lien" et colle dans Stremio → Addons

## 📊 Langues détectées

- FRENCH / FR
- VF / VFF / VFQ
- TRUEFRENCH
- MULTI (inclus pour plus de résultats)
- VOSTFR
- SUBFRENCH

## ⚠️ Légal

Nécessite un abonnement Easynews valide. Respecte les lois de ton pays.

---

**Bon streaming ! 🍿**
