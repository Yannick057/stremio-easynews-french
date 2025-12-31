const express = require('express');
const axios = require('axios');
const NodeCache = require('node-cache');
const fs = require('fs');
const path = require('path');

const app = express();

// Configuration
let CONFIG = {
    username: process.env.EASYNEWS_USERNAME || '',
    password: process.env.EASYNEWS_PASSWORD || '',
    maxResults: 20,
    minQuality: '720p',
    cacheEnabled: true
};

const EASYNEWS_API_URL = 'https://members.easynews.com/2.0/search/solr-search';
const CACHE_TTL = 21600;

const cache = new NodeCache({ stdTTL: CACHE_TTL });

// Fonction pour décoder la config
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

// Créer le manifest
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

// Scoring qualité
function getQualityScore(filename) {
    const fn = filename.toUpperCase();
    let score = 0;

    if (fn.includes('2160P') || fn.includes('4K')) score += 1000;
    else if (fn.includes('1080P')) score += 500;
    else if (fn.includes('720P')) score += 250;
    else if (fn.includes('480P')) score += 100;

    if (fn.includes('HEVC') || fn.includes('H265')) score += 100;
    else if (fn.includes('H264')) score += 50;

    if (fn.includes('REMUX')) score += 90;
    else if (fn.includes('BLURAY')) score += 80;
    else if (fn.includes('WEB-DL')) score += 70;
    else if (fn.includes('WEBRIP')) score += 60;
    else if (fn.includes('HDTV')) score += 40;

    if (fn.includes('ATMOS') || fn.includes('TRUEHD')) score += 30;
    else if (fn.includes('DTS')) score += 20;
    else if (fn.includes('AC3')) score += 15;

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

// Détection français
function isFrenchContent(filename) {
    const fn = filename.toUpperCase();
    const keywords = [
        'FRENCH', 'FR', 'VF', 'VFF', 'VFQ', 'TRUEFRENCH',
        'MULTI.FRENCH', 'MULTI.FR', 'MULTI', 'MULTi',
        'VOSTFR', 'SUBFRENCH'
    ];
    return keywords.some(kw => fn.includes(kw));
}

// Filtre qualité
function meetsMinQuality(filename, minQuality) {
    const quality = getQuality(filename);
    const order = { 'unknown': 0, '480p': 1, '720p': 2, '1080p': 3, '4k': 4 };
    return order[quality] >= order[minQuality];
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
            pby: 100,
            u: '1',
            st: 'adv',
            safeO: '0'
        };

        const response = await axios.get(EASYNEWS_API_URL, {
            params,
            auth: {
                username: config.username,
                password: config.password
            },
            timeout: 15000
        });

        if (!response.data || !response.data.data) return [];

        let results = response.data.data.filter(item => {
            return item.filename && 
                   isFrenchContent(item.filename) &&
                   meetsMinQuality(item.filename, config.minQuality);
        });

        results.sort((a, b) => 
            getQualityScore(b.filename) - getQualityScore(a.filename)
        );

        return results.slice(0, config.maxResults);

    } catch (error) {
        console.error('Erreur Easynews:', error.message);
        return [];
    }
}

// Extraction metadata
function extractMetadata(filename) {
    const fn = filename.toUpperCase();

    let quality = 'Unknown';
    if (fn.includes('2160P') || fn.includes('4K')) quality = '4K';
    else if (fn.includes('1080P')) quality = '1080p';
    else if (fn.includes('720P')) quality = '720p';

    let codec = '';
    if (fn.includes('HEVC') || fn.includes('H265')) codec = 'HEVC';
    else if (fn.includes('H264')) codec = 'H264';

    let audio = '';
    if (fn.includes('ATMOS')) audio = 'Atmos';
    else if (fn.includes('DTS')) audio = 'DTS';
    else if (fn.includes('AC3')) audio = 'AC3';

    let source = '';
    if (fn.includes('REMUX')) source = 'REMUX';
    else if (fn.includes('BLURAY')) source = 'BluRay';
    else if (fn.includes('WEB-DL')) source = 'WEB-DL';

    let lang = 'FRENCH';
    if (fn.includes('TRUEFRENCH')) lang = 'TRUEFRENCH';
    else if (fn.includes('MULTI')) lang = 'MULTI';

    return { quality, codec, audio, source, lang };
}

function formatSize(bytes) {
    const gb = bytes / (1024 * 1024 * 1024);
    return gb.toFixed(2) + ' GB';
}

// Route: Page d'accueil (interface web)
app.get('/', (req, res) => {
    const htmlPath = path.join(__dirname, 'index.html');
    if (fs.existsSync(htmlPath)) {
        res.sendFile(htmlPath);
    } else {
        res.send('<h1>Easynews French Addon</h1><p>Interface web indisponible</p>');
    }
});

// Route: Manifest
app.get('/:config/manifest.json', (req, res) => {
    const config = parseConfig(req.params.config);
    const manifest = createManifest(config);
    res.json(manifest);
});

// Route: Streams
app.get('/:config/stream/:type/:id.json', async (req, res) => {
    const config = parseConfig(req.params.config);

    try {
        const imdbId = req.params.id.split(':')[0];
        const season = req.params.id.split(':')[1];
        const episode = req.params.id.split(':')[2];

        const results = await searchEasynews(
            imdbId, 
            req.params.type, 
            season, 
            episode, 
            config
        );

        if (results.length === 0) {
            return res.json({ streams: [] });
        }

        const streams = results.map(item => {
            const meta = extractMetadata(item.filename);
            const size = formatSize(parseInt(item.rawSize) || 0);

            let title = `📺 Easynews\n`;
            title += `${meta.quality} ${meta.codec ? meta.codec : ''}\n`;
            title += `🎧 ${meta.audio || 'Unknown'} | 💾 ${size}\n`;
            title += `🇫🇷 ${meta.lang}`;

            const streamUrl = `https://${config.username}:${config.password}@members.easynews.com/dl/${item.hash}/${encodeURIComponent(item.filename)}/`;

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

        res.json({ streams });

    } catch (error) {
        console.error('Erreur:', error);
        res.json({ streams: [] });
    }
});

// Health check
app.get('/health', (req, res) => {
    res.json({ status: 'ok' });
});

const PORT = process.env.PORT || 7000;
app.listen(PORT, () => {
    console.log(`🚀 Addon Easynews French lancé sur port ${PORT}`);
    console.log(`📺 Interface web: http://127.0.0.1:${PORT}`);
});
