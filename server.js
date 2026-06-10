const express = require('express');
const cors = require('cors');
const path = require('path');
const axios = require('axios');
const cheerio = require('cheerio');
const { GoogleGenerativeAI } = require('@google/generative-ai');
const fs = require('fs');
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 3000;
const CACHE_FILE = 'cache.json';

app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname)));

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
const model = genAI.getGenerativeModel({ model: 'gemini-1.5-flash' });

let websiteContent = '';

const RSCE_URLS = [
  'https://www.rsce.es/',
  'https://www.rsce.es/quienes-somos/',
  'https://www.rsce.es/socios-abonados/',
  'https://www.rsce.es/eventos-rsce/',
  'https://www.rsce.es/razas-espanolas/',
  'https://www.rsce.es/tarifas/',
  'https://www.rsce.es/contacto-rsce/',
  'https://www.rsce.es/tramites-rsc/',
  'https://www.rsce.es/salud-y-bienestar-rsce/',
  'https://www.rsce.es/faq/',
  'https://www.rsce.es/servicios-rsce/',
  'https://www.rsce.es/criadores/',
];

async function scrapeWebsite() {
  console.log('Scraping RSCE...');
  let allContent = '';
  for (const url of RSCE_URLS) {
    try {
      const response = await axios.get(url, {
        timeout: 10000,
        headers: { 'User-Agent': 'Mozilla/5.0' }
      });
      const $ = cheerio.load(response.data);
      const title = $('title').text();
      const mainContent = $('main').text() || $('body').text();
      allContent += `\n\n--- ${title} (${url}) ---\n`;
      allContent += mainContent.substring(0, 1500);
    } catch (error) {
      console.error(`Error scraping ${url}:`, error.message);
    }
  }
  websiteContent = allContent;
  fs.writeFileSync(CACHE_FILE, JSON.stringify({ content: allContent, date: Date.now() }));
  console.log(`Scraping completo: ${websiteContent.length} caracteres`);
}

function loadCache() {
  try {
    if (fs.existsSync(CACHE_FILE)) {
      const cache = JSON.parse(fs.readFileSync(CACHE_FILE));
      const age = Date.now() - cache.date;
      if (age < 24 * 60 * 60 * 1000) {
        websiteContent = cache.content;
        console.log('Contenido cargado desde caché');
        return true;
      }
    }
  } catch (e) {}
  return false;
}

if (!loadCache()) {
  scrapeWebsite().catch(console.error);
}
setInterval(scrapeWebsite, 24 * 60 * 60 * 1000);

app.post('/api/chat', async (req, res) => {
  const userMessage = req.body.message;
  const chatHistory = req.body.history || [];

  if (!userMessage?.trim()) {
    return res.json({ reply: '¡Por favor escribe una pregunta!' });
  }

  if (!websiteContent) {
    return res.json({ reply: 'Estoy cargando la información de la web. Por favor espera un momento.' });
  }

  try {
    const history = chatHistory.map(m => ({
      role: m.role === 'assistant' ? 'model' : 'user',
      parts: [{ text: m.content }]
    }));

    const chat = model.startChat({
      history,
      systemInstruction: `Eres el asistente virtual de la RSCE (Real Sociedad Canina de España). Tu objetivo es ayudar a los usuarios a encontrar información y guiarles paso a paso en sus trámites.

REGLAS:
1. Responde SIEMPRE en español, de forma amable y conversacional.
2. Mantén el contexto — recuerda lo que el usuario ha preguntado antes.
3. SIEMPRE incluye el enlace directo cuando menciones una sección, usando el formato [texto](url).
4. Si el usuario pregunta por un trámite, explica los pasos y añade el link correspondiente.
5. Si no tienes la información, di: Para más información puedes [contactar con la RSCE](https://www.rsce.es/contacto-rsce/).
6. Nunca respondas en inglés.

ENLACES DISPONIBLES:
- Socios: https://www.rsce.es/socios-abonados/
- Trámites: https://www.rsce.es/tramites-rsc/
- Tarifas: https://www.rsce.es/tarifas/
- Eventos: https://www.rsce.es/eventos-rsce/
- Razas: https://www.rsce.es/razas-espanolas/
- Criadores: https://www.rsce.es/criadores/
- Pedigree: https://www.rsce.es/certificados-de-pedigree/
- Displasia: https://www.rsce.es/displasia/
- Afijos: https://www.rsce.es/afijos/
- Salud: https://www.rsce.es/salud-y-bienestar-rsce/
- Jueces: https://www.rsce.es/jueces-de-la-rsce/
- Reglamentos: https://www.rsce.es/reglamentos_rsce/
- Formaciones: https://www.rsce.es/area-de-formaciones/
- FAQ: https://www.rsce.es/faq/
- Contacto: https://www.rsce.es/contacto-rsce/

CONTENIDO DE LA WEB:
${websiteContent}`    });

    const result = await chat.sendMessage(userMessage);
    const reply = result.response.text();

    res.json({ reply, confidence: 'high' });
  } catch (error) {
    console.error('Error Gemini:', error);
    res.json({ reply: 'Lo siento, ha ocurrido un error. Por favor inténtalo de nuevo.' });
  }
});

app.get('/api/health', (req, res) => {
  res.json({ status: 'running', contentLoaded: websiteContent.length > 0 });
});

app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'index.html'));
});

app.listen(PORT, () => {
  console.log(`RSCE Chatbot corriendo en puerto ${PORT}`);
});
