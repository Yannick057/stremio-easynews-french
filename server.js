const { addonBuilder, serveHTTP } = require('stremio-addon-sdk');
const axios = require('axios');
const NodeCache = require('node-cache');
const fs = require('fs');
const path = require('path');

// Configuration par défaut (peut être overridée par l'URL)
let CONFIG = {
    username: process.env.EASYNEWS_USERNAME || '',
    password: process.env.EASYNEWS_PASSWORD || '',
    maxResults: 20,
    minQuality: '720p',
    cacheEnabled: true
};

const EASYNEWS_API_URL = 'https://members.easynews.com/2.0/search/solr-search';
const CACHE_TTL = 21600; // 6 heures

// Cache
const cache = new NodeCache({ stdTTL: CACHE_TTL });

// Fonction pour extraire la config de l'URL
function parseConfig(configString) {
    try {
        const decoded = Buffer.from(configString, 'base64').toString('utf-8');
        const config = JSON.parse(decoded);
        return {
            username: config.username || CONFIG.username,
            password: config.password || CONFIG.password,
            maxResults: config.maxResults || CONFIG.maxResults,
            minQuality: config.minQuality || CONFIG.minQuality,
            cacheEnabled: config.cacheEnabled !== false
        };
    } catch (e) {
        return CONFIG;
    }
}

// Manifest de base
function createManifest(config) {
    return {
        id: 'community.easynews.french',
        version: '1.0.0',
        name: 'Easynews French Content',
        description: `Contenus français exclusifs via Easynews | Max: ${config.maxResults} | Min: ${config.minQuality}`,
        catalogs: [],
        resources: ['stream'],
        types: ['movie', 'series'],
        idPrefixes: ['tt'],
        logo: 'https://i.imgur.com/YQkWVsE.png',
        background: 'https://i.imgur.com/7GqXYVP.jpg'
    };
}

// Fonction de tri par qualité
function getQualityScore(filename) {
    const fn = filename.toUpperCase();
    let score = 0;

    if (fn.includes('2160P') || fn.includes('4K') || fn.includes('UHD')) score += 1000;
    else if (fn.includes('1080P')) score += 500;
    else if (fn.includes('720P')) score += 250;
    else if (fn.includes('480P')) score += 100;

    if (fn.includes('HEVC') || fn.includes('H265') || fn.includes('X265')) score += 100;
    else if (fn.includes('AVC') || fn.includes('H264') || fn.includes('X264')) score += 50;

    if (fn.includes('BLURAY') || fn.includes('BLU-RAY')) score += 80;
    else if (fn.includes('REMUX')) score += 90;
    else if (fn.includes('WEB-DL') || fn.includes('WEBDL')) score += 70;
    else if (fn.includes('WEBRIP')) score += 60;
    else if (fn.includes('HDTV')) score += 40;

    if (fn.includes('ATMOS') || fn.includes('TRUEHD')) score += 30;
    else if (fn.includes('DTS')) score += 20;
    else if (fn.includes('AC3') || fn.includes('DD5.1')) score += 15;
    else if (fn.includes('AAC')) score += 10;

    const sizeMatch = fn.match(/(\d+(?:\.\d+)?)\s*(GB|GO)/);
    if (sizeMatch) {
        const size = parseFloat(sizeMatch[1]);
        score += Math.min(size * 2, 50);
    }

    return score;
}

// Détection qualité
function getQuality(filename) {
    const fn = filename.toUpperCase();
    if (fn.includes('2160P') || fn.includes('4K')) return '4k';
    if (fn.includes('1080P')) return '1080p';
    if (fn.includes('720P')) return '720p';
    if (fn.includes('480P')) return '480p';
    return 'unknown';
}

// Détection langue française
function isFrenchContent(filename) {
    const fn = filename.toUpperCase();
    const frenchKeywords = [
        'FRENCH', 'FR', 'VF', 'VFF', 'VFQ', 'TRUEFRENCH',
        'MULTI.FRENCH', 'MULTI.FR', 'MULTI', 'MULTi',
        'VOSTFR', 'SUBFRENCH'
    ];

    return frenchKeywords.some(keyword => fn.includes(keyword));
}

// Filtre par qualité minimale
function meetsMinQuality(filename, minQuality) {
    const quality = getQuality(filename);
    const qualityOrder = { 'unknown': 0, '480p': 1, '720p': 2, '1080p': 3, '4k': 4 };
    return qualityOrder[quality] >= qualityOrder[minQuality];
}

// Recherche Easynews
async function searchEasynews(query, type, season, episode, config) {
    try {
        let searchQuery = query.replace(/[^a-zA-Z0-9\s]/g, '');

        if (type === 'series' && season && episode) {
            searchQuery += ` S${String(season).padStart(2, '0')}E${String(episode).padStart(2, '0')}`;
        }

        const params = {
            gps: searchQuery,
            sbj: searchQuery,
            fty: 'VIDEO',
            fex: 'mkv,mp4,avi',
            s1: 'dsize',
            s1d: '-',
            s2: 'nrfile',
            s2d: '-',
            s3: 'dtime',
            s3d: '-',
            pby: 100,
            u: '1',
            st: 'adv',
            safeO: '0',
            gx: 1
        };

        const response = await axios.get(EASYNEWS_API_URL, {
            params,
            auth: {
                username: config.username,
                password: config.password
            },
            timeout: 15000
        });

        if (!response.data || !response.data.data) {
            return [];
        }

        let results = response.data.data.filter(item => {
            return item.filename && 
                   isFrenchContent(item.filename) &&
                   meetsMinQuality(item.filename, config.minQuality);
        });

        results.sort((a, b) => {
            return getQualityScore(b.filename) - getQualityScore(a.filename);
        });

        return results.slice(0, config.maxResults);

    } catch (error) {
        console.error('Erreur recherche Easynews:', error.message);
        return [];
    }
}

// Extraction metadata
function extractMetadata(filename) {
    const fn = filename.toUpperCase();
    let quality = 'Unknown';
    let codec = '';
    let audio = '';
    let source = '';

    if (fn.includes('2160P') || fn.includes('4K')) quality = '4K';
    else if (fn.includes('1080P')) quality = '1080p';
    else if (fn.includes('720P')) quality = '720p';
    else if (fn.includes('480P')) quality = '480p';

    if (fn.includes('HEVC') || fn.includes('H265') || fn.includes('X265')) codec = 'HEVC';
    else if (fn.includes('H264') || fn.includes('X264')) codec = 'H264';

    if (fn.includes('ATMOS')) audio = 'Atmos';
    else if (fn.includes('TRUEHD')) audio = 'TrueHD';
    else if (fn.includes('DTS')) audio = 'DTS';
    else if (fn.includes('AC3')) audio = 'AC3';
    else if (fn.includes('AAC')) audio = 'AAC';

    if (fn.includes('REMUX')) source = 'REMUX';
    else if (fn.includes('BLURAY') || fn.includes('BLU-RAY')) source = 'BluRay';
    else if (fn.includes('WEB-DL') || fn.includes('WEBDL')) source = 'WEB-DL';
    else if (fn.includes('WEBRIP')) source = 'WEBRip';
    else if (fn.includes('HDTV')) source = 'HDTV';

    let lang = 'FRENCH';
    if (fn.includes('TRUEFRENCH')) lang = 'TRUEFRENCH';
    else if (fn.includes('MULTI')) lang = 'MULTI';
    else if (fn.includes('VOSTFR')) lang = 'VOSTFR';
    else if (fn.includes('VFF')) lang = 'VFF';
    else if (fn.includes('VFQ')) lang = 'VFQ';

    return { quality, codec, audio, source, lang };
}

function formatSize(bytes) {
    const gb = bytes / (1024 * 1024 * 1024);
    return gb.toFixed(2) + ' GB';
}

// Création du builder avec config
function createBuilder(config) {
    const builder = new addonBuilder(createManifest(config));

    builder.defineStreamHandler(async ({ type, id }) => {
        try {
            const cacheKey = `streams_${type}_${id}_${config.username}`;

            if (config.cacheEnabled) {
                const cached = cache.get(cacheKey);
                if (cached) {
                    console.log('Cache hit pour:', id);
                    return { streams: cached };
                }
            }

            const imdbId = id.split(':')[0];
            const season = id.split(':')[1];
            const episode = id.split(':')[2];

            const results = await searchEasynews(imdbId, type, season, episode, config);

            if (results.length === 0) {
                return { streams: [] };
            }

            const streams = results.map((item) => {
                const meta = extractMetadata(item.filename);
                const size = formatSize(parseInt(item.rawSize) || 0);

                let title = `📺 Easynews\n`;
                title += `${meta.quality} ${meta.codec ? meta.codec + ' ' : ''}`;
                title += `${meta.source ? '| ' + meta.source : ''}\n`;
                title += `🎧 ${meta.audio || 'Unknown'} | 💾 ${size}\n`;
                title += `🇫🇷 ${meta.lang}`;

                const streamUrl = `https://${config.username}:${config.password}@members.easynews.com/dl/${item.hash}/${encodeURIComponent(item.filename)}/[${item.filename}]`;

                return {
                    name: 'Easynews',
                    title: title,
                    url: streamUrl,
                    behaviorHints: {
                        bingeGroup: 'easynews-' + meta.quality,
                        notWebReady: false
                    }
                };
            });

            if (config.cacheEnabled) {
                cache.set(cacheKey, streams);
            }

            console.log(`Trouvé ${streams.length} streams pour ${id}`);
            return { streams };

        } catch (error) {
            console.error('Erreur handler:', error);
            return { streams: [] };
        }
    });

    return builder;
}

// Serveur HTTP personnalisé
const express = require('express');
const app = express();

// Servir la page de configuration
app.get('/', (req, res) => {
    const htmlPath = path.join(__dirname, 'index.html');
    if (fs.existsSync(htmlPath)) {
        res.sendFile(htmlPath);
    } else {
        res.send('<h1>Easynews French Addon</h1><p>Fichier index.html introuvable</p>');
    }
});

// Route pour manifest avec config encodée
app.get('/:config/manifest.json', (req, res) => {
    const config = parseConfig(req.params.config);
    const manifest = createManifest(config);
    res.json(manifest);
});

// Route pour streams avec config encodée
app.get('/:config/stream/:type/:id.json', async (req, res) => {
    const config = parseConfig(req.params.config);
    const builder = createBuilder(config);

    try {
        const result = await builder.getInterface().get('stream', req.params.type, req.params.id);
        res.json(result);
    } catch (error) {
        res.status(500).json({ streams: [] });
    }
});

// Fallback pour config par défaut (variables d'environnement)
const defaultBuilder = createBuilder(CONFIG);
app.use(defaultBuilder.getInterface().middleware);

const PORT = process.env.PORT || 7000;
app.listen(PORT, () => {
    console.log('🚀 Addon Easynews French démarré sur http://127.0.0.1:' + PORT);
    console.log('📺 Page de configuration: http://127.0.0.1:' + PORT);
    console.log('🔧 Configure tes identifiants sur la page web');
});
