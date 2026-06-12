import https from 'https';
import http from 'http';
import { URL } from 'url';

export default async function handler(req, res) {
    let targetUrl = req.query.url;

    if (!targetUrl) {
        return res.status(400).json({ error: "URL lipsă" });
    }

    // Preluăm exact comportamentul din exemplul tău: pornim mereu de la o bază clară
    if (!targetUrl.startsWith('http')) {
        targetUrl = 'http://' + targetUrl;
    }

    const chain = [];
    let currentUrl = targetUrl;
    let maxRedirects = 10;

    // Construim o cerere brută (raw request) la nivel de server
    const makeRawRequest = (urlStr) => {
        return new Promise((resolve, reject) => {
            const parsedUrl = new URL(urlStr);
            // Alegem protocolul corect pentru saltul curent
            const protocol = parsedUrl.protocol === 'https:' ? https : http;
            
            const options = {
                method: 'GET',
                // Evităm decodarea automată a serverului, vrem doar Headerele
                headers: {
                    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
                    'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
                    'Connection': 'close' 
                }
            };

            const request = protocol.request(options, (response) => {
                resolve({
                    status: response.statusCode,
                    location: response.headers['location']
                });
            });

            request.on('error', (err) => reject(err));
            
            // Setăm un timeout de 5 secunde pentru a nu bloca aplicația la site-uri picate
            request.setTimeout(5000, () => {
                request.destroy();
                resolve({ status: 'Timeout', location: null });
            });
            
            request.end();
        });
    };

    try {
        while (maxRedirects > 0) {
            const { status, location } = await makeRawRequest(currentUrl);

            // Verificăm dacă serverul returnează clar un cod de redirect (301, 302, 307, 308)
            if (typeof status === 'number' && status >= 300 && status < 400 && location) {
                // Exact ca structura Ayima: înregistrăm saltul de pe server
                chain.push({ url: currentUrl, status: status, type: 'server_redirect' });
                
                let nextUrl = location;
                // Corectăm redirecturile relative (ex: /contact)
                if (!nextUrl.startsWith('http')) {
                    nextUrl = new URL(nextUrl, currentUrl).href;
                }
                currentUrl = nextUrl;
                maxRedirects--;
            } else {
                // Am ajuns la destinația finală (ex: 200) sau o eroare (ex: 403, 404)
                let typeText = status === 200 ? 'normal' : 'error/blocked';
                chain.push({ url: currentUrl, status: status, type: typeText });
                break;
            }
        }
        
        return res.status(200).json({ chain });
        
    } catch (error) {
        // Dacă WAF-ul taie conexiunea brutal
        chain.push({ url: currentUrl, status: 'Network Error', type: 'WAF Blocked or DNS fail' });
        return res.status(200).json({ chain }); 
    }
}
