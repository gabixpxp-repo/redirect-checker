export default async function handler(req, res) {
    let targetUrl = req.query.url;

    if (!targetUrl) {
        return res.status(400).json({ error: "Te rog introdu un URL valid." });
    }

    // Adăugăm http:// automat dacă lipsește, exact ca să pornim de la baza rețelei
    if (!targetUrl.startsWith('http')) {
        targetUrl = 'http://' + targetUrl;
    }

    try {
        const chain = [];
        let currentUrl = targetUrl;
        let maxRedirects = 15;
        
        // Memoria pentru cookie-uri (esențială pentru a trece de pașii 2 și 3 la corporații)
        let cookies = []; 

        while (maxRedirects > 0) {
            const headers = {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
                'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8',
                'Accept-Language': 'ro-RO,ro;q=0.9,en-US;q=0.8,en;q=0.7',
                'Connection': 'keep-alive',
                'Upgrade-Insecure-Requests': '1'
            };

            // Trimitem cookie-urile primite la pasul anterior
            if (cookies.length > 0) {
                headers['Cookie'] = cookies.join('; ');
            }

            const response = await fetch(currentUrl, { 
                method: 'GET',
                headers: headers,
                redirect: 'manual' // Oprim redirectul automat pentru a-l înregistra noi în listă
            });

            const status = response.status;
            
            // Colectăm cookie-urile noi pentru pasul următor
            const setCookie = response.headers.get('set-cookie');
            if (setCookie) {
                const newCookies = setCookie.split(',').map(c => c.split(';')[0].trim());
                cookies = [...new Set([...cookies, ...newCookies])];
            }
            
            // PASUL A: Redirect HTTP Clasic (301, 302, 307, 308)
            if (status >= 300 && status < 400 && response.headers.has('location')) {
                chain.push({ url: currentUrl, status: status, type: 'server_redirect' });
                
                let location = response.headers.get('location');
                if (!location.startsWith('http')) {
                    location = new URL(location, currentUrl).href;
                }
                currentUrl = location;
                maxRedirects--;
            } 
            // PASUL B: Pagina s-a încărcat (200 OK), dar verificăm dacă are scripturi ascunse de redirect
            else if (status === 200) {
                const text = await response.text();
                
                // Căutăm Meta Refresh în HTML
                const metaMatch = text.match(/<meta[^>]*http-equiv=["']?refresh["']?[^>]*content=["']?[0-9]+;\s*url=["']?([^"'>]+)["']?[^>]*>/i);
                
                // Căutăm JavaScript Redirect în pagină
                const jsMatch = text.match(/(?:window\.)?location(?:\.href|\.replace)?\s*=\s*['"]([^'"]+)['"]/i);
                
                if (metaMatch && metaMatch[1]) {
                    chain.push({ url: currentUrl, status: 200, type: 'meta_refresh_redirect' });
                    let location = metaMatch[1].trim();
                    if (!location.startsWith('http')) {
                        location = new URL(location, currentUrl).href;
                    }
                    currentUrl = location;
                    maxRedirects--;
                } 
                else if (jsMatch && jsMatch[1]) {
                    chain.push({ url: currentUrl, status: 200, type: 'js_redirect' });
                    let location = jsMatch[1].trim();
                    if (!location.startsWith('http')) {
                        location = new URL(location, currentUrl).href;
                    }
                    currentUrl = location;
                    maxRedirects--;
                } 
                else {
                    // Nu mai există niciun redirect, am ajuns la destinația finală securizată
                    chain.push({ url: currentUrl, status: status, type: 'normal' });
                    break;
                }
            } 
            // PASUL C: Eroare directă din server (403, 404, etc.)
            else {
                chain.push({ url: currentUrl, status: status, type: 'error' });
                break;
            }
        }
        
        return res.status(200).json({ chain });

    } catch (error) {
        return res.status(500).json({ error: "Eroare la procesarea URL-ului: " + error.message });
    }
}
