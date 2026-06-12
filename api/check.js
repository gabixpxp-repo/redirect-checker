export default async function handler(req, res) {
    let targetUrl = req.query.url;

    if (!targetUrl) {
        return res.status(400).json({ error: "Te rog introdu un URL valid." });
    }

    // Auto-adaugă http:// dacă utilizatorul a uitat
    if (!targetUrl.startsWith('http')) {
        targetUrl = 'http://' + targetUrl;
    }

    try {
        const chain = [];
        let currentUrl = targetUrl;
        let maxRedirects = 15;
        
        // Păstrăm cookie-urile ca să ocolim firewall-urile (WAF) la pașii următori
        let cookies = []; 

        while (maxRedirects > 0) {
            const headers = {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
                'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8',
                'Accept-Language': 'ro-RO,ro;q=0.9,en-US;q=0.8,en;q=0.7',
                'Connection': 'keep-alive',
                'Upgrade-Insecure-Requests': '1'
            };

            // Injectăm cookie-urile acumulate anterior
            if (cookies.length > 0) {
                headers['Cookie'] = cookies.join('; ');
            }

            const response = await fetch(currentUrl, { 
                method: 'GET',
                headers: headers,
                redirect: 'manual' 
            });

            const status = response.status;
            
            // Salvăm cookie-urile noi setate de server pentru a dovedi că suntem un browser cuminte
            const setCookie = response.headers.get('set-cookie');
            if (setCookie) {
                // Fetch le concatenează, noi le spargem pentru a le stoca
                const newCookies = setCookie.split(',').map(c => c.split(';')[0].trim());
                cookies = [...new Set([...cookies, ...newCookies])];
            }
            
            // CAZUL 1: Redirect HTTP Standard (din server)
            if (status >= 300 && status < 400 && response.headers.has('location')) {
                chain.push({ url: currentUrl, status: status, type: 'Redirect HTTP Standard' });
                
                let location = response.headers.get('location');
                if (!location.startsWith('http')) {
                    location = new URL(location, currentUrl).href;
                }
                currentUrl = location;
                maxRedirects--;
            } 
            // CAZUL 2: WAF Bypass / JavaScript Redirect / Meta Refresh
            else if (status === 200) {
                const text = await response.text();
                
                // Căutăm Meta Refresh-uri HTML
                const metaMatch = text.match(/<meta[^>]*http-equiv=["']?refresh["']?[^>]*content=["']?[0-9]+;\s*url=["']?([^"'>]+)["']?[^>]*>/i);
                
                // Căutăm JavaScript Redirect (ex: window.location.href="https...")
                const jsMatch = text.match(/(?:window\.)?location(?:\.href|\.replace)?\s*=\s*['"]([^'"]+)['"]/i);
                
                if (metaMatch && metaMatch[1]) {
                    chain.push({ url: currentUrl, status: 200, type: 'Redirect HTML (Meta Refresh)' });
                    let location = metaMatch[1].trim();
                    if (!location.startsWith('http')) {
                        location = new URL(location, currentUrl).href;
                    }
                    currentUrl = location;
                    maxRedirects--;
                } 
                else if (jsMatch && jsMatch[1]) {
                    chain.push({ url: currentUrl, status: 200, type: 'Redirect JavaScript (Securitate)' });
                    let location = jsMatch[1].trim();
                    if (!location.startsWith('http')) {
                        location = new URL(location, currentUrl).href;
                    }
                    currentUrl = location;
                    maxRedirects--;
                } 
                else {
                    chain.push({ url: currentUrl, status: status, type: 'Destinație Finală' });
                    break;
                }
            } 
            // CAZUL 3: Block / Eroare
            else {
                chain.push({ url: currentUrl, status: status, type: 'Status Code: Eroare sau Firewall' });
                break;
            }
        }
        
        return res.status(200).json({ chain });

    } catch (error) {
        return res.status(500).json({ error: "Eroare internă de rețea sau SSL: " + error.message });
    }
}
