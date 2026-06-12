export default async function handler(req, res) {
    const targetUrl = req.query.url;

    if (!targetUrl) {
        return res.status(400).json({ error: "Te rog introdu un URL valid." });
    }

    try {
        const chain = [];
        let currentUrl = targetUrl;
        let maxRedirects = 10; // Prevenim buclele infinite

        while (maxRedirects > 0) {
            // Facem cererea de pe server, oprind redirectul automat
            const response = await fetch(currentUrl, { redirect: 'manual' });
            const status = response.status;
            
            // Dacă primim cod de redirect (301, 302, 307, 308)
            if (status >= 300 && status < 400 && response.headers.has('location')) {
                chain.push({ url: currentUrl, status: status });
                
                let location = response.headers.get('location');
                // Gestionăm redirecturile relative (ex: /pagina-noua)
                if (!location.startsWith('http')) {
                    location = new URL(location, currentUrl).href;
                }
                currentUrl = location;
                maxRedirects--;
            } else {
                // Am ajuns la destinația finală (200 OK, 404, etc.)
                chain.push({ url: currentUrl, status: status });
                break;
            }
        }
        
        // Returnăm lanțul de redirecturi către frontend-ul nostru
        return res.status(200).json({ chain });

    } catch (error) {
        return res.status(500).json({ error: "Eroare la procesarea URL-ului: " + error.message });
    }
}
