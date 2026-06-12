export default async function handler(req, res) {
    const targetUrl = req.query.url;

    if (!targetUrl) {
        return res.status(400).json({ error: "Te rog introdu un URL valid." });
    }

    try {
        const chain = [];
        let currentUrl = targetUrl;
        let maxRedirects = 15; // Puțin mai mare pentru site-uri complexe

        while (maxRedirects > 0) {
            // Falsificăm un browser real pentru a trece de firewall-uri
            const headers = {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
                'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8',
                'Accept-Language': 'ro-RO,ro;q=0.9,en-US;q=0.8,en;q=0.7'
            };

            const response = await fetch(currentUrl, { 
                method: 'GET',
                headers: headers,
                redirect: 'manual' 
            });

            const status = response.status;
            
            // 1. Verificăm dacă e un redirect HTTP clasic (din server)
            if (status >= 300 && status < 400 && response.headers.has('location')) {
                chain.push({ url: currentUrl, status: status, type: 'Redirect Server' });
                
                let location = response.headers.get('location');
                if (!location.startsWith('http')) {
                    location = new URL(location, currentUrl).href;
                }
                currentUrl = location;
                maxRedirects--;
            } 
            // 2. Dacă pare că a ajuns la destinație (200 OK), verificăm codul paginii
            else if (status === 200) {
                const text = await response.text();
                // Expresie regulată pentru a găsi <meta http-equiv="refresh" content="0; url=...">
                const metaRefreshMatch = text.match(/<meta[^>]*http-equiv=["']?refresh["']?[^>]*content=["']?[0-9]+;\s*url=["']?([^"'>]+)["']?[^>]*>/i);
                
                if (metaRefreshMatch && metaRefreshMatch[1]) {
                    chain.push({ url: currentUrl, status: 200, type: 'Redirect HTML (Meta)' });
                    
                    let location = metaRefreshMatch[1].trim();
                    if (!location.startsWith('http')) {
                        location = new URL(location, currentUrl).href;
                    }
                    currentUrl = location;
                    maxRedirects--;
                } else {
                    // Dacă nu există redirect în HTML, ne oprim. Suntem la destinație.
                    chain.push({ url: currentUrl, status: status, type: 'Destinație Finală' });
                    break;
                }
            } 
            // 3. Orice altă eroare (403, 404, 500)
            else {
                chain.push({ url: currentUrl, status: status, type: 'Status Code / Eroare' });
                break;
            }
        }
        
        return res.status(200).json({ chain });

    } catch (error) {
        return res.status(500).json({ error: "Eroare la procesarea URL-ului: " + error.message });
    }
}
